"""Saved Agents API profiles and bounded, independently verified editorial turns.

Uses only the documented agents=v1 REST contract. The private registry contains
identifiers and configuration digests, never API keys, inputs or model output.
"""

from __future__ import annotations

import copy
import fcntl
import hashlib
import json
import os
import re
import socket
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from .core import NewsError, json_bytes

DEFAULT_MODEL = None  # Each saved editorial profile selects its own model.
ENDPOINT = "https://api.openai.com/v1"
STAGES = ("research", "analyze", "generate", "review")
REGISTRY_SCHEMA = "confenge.contract-news-agents/v1"
MAX_BYTES = 1024 * 1024
MAX_PAGES = 10
MAX_SESSION_SECONDS = 120
MAX_REQUEST_SECONDS = 45
POLL_SECONDS = 2
CANCEL_SECONDS = 5
RESOURCE_ID = re.compile(r"[A-Za-z0-9_-]{1,150}\Z")
DIGEST = re.compile(r"[a-f0-9]{64}\Z")


class _HTTPFailure(NewsError):
    def __init__(self, status: int):
        self.status = status
        super().__init__(f"openai_http_{status}")


def _identifier(value) -> str:
    if not isinstance(value, str) or not RESOURCE_ID.fullmatch(value):
        raise NewsError("openai_agents_invalid_identifier")
    return value


def _contains(actual, expected) -> bool:
    """API responses include defaults; every explicitly requested field must match."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            key in actual and _contains(actual[key], value) for key, value in expected.items()
        )
    return actual == expected


class AgentsClient:
    def __init__(self, api_key: str, model: str | None = DEFAULT_MODEL,
                 timeout: int = MAX_SESSION_SECONDS, state_dir: Path | None = None):
        if not isinstance(api_key, str) or not api_key.strip():
            raise NewsError("missing_openai_api_key")
        if model is not None and (not isinstance(model, str) or not model
                                  or len(model) > 100 or any(c.isspace() for c in model)):
            raise NewsError("invalid_model")
        if type(timeout) is not int or not 1 <= timeout <= MAX_SESSION_SECONDS:
            raise NewsError("invalid_operational_limit")
        if state_dir is None:
            raise NewsError("openai_agents_private_state_required")
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self.state_dir = Path(state_dir)
        self.agent_ids: dict[str, str] = {}
        self._configs = {}
        self._registry_path = self.state_dir / "agents-registry.json"

    def _request(self, method: str, path: str, body: dict | None = None,
                 *, deadline: float) -> dict:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise NewsError("openai_agents_timeout")
        raw_body = json_bytes(body) if body is not None else None
        if raw_body is not None and len(raw_body) > MAX_BYTES:
            raise NewsError("openai_agents_request_too_large")
        request = urllib.request.Request(ENDPOINT + path, data=raw_body, method=method,
                                         headers={
            "Authorization": "Bearer " + self._api_key,
            "Content-Type": "application/json",
            "OpenAI-Beta": "agents=v1",
            "User-Agent": "CONFENGE-ContractNews/2.0",
        })
        try:
            with urllib.request.urlopen(request, timeout=min(
                    MAX_REQUEST_SECONDS, self.timeout, remaining)) as response:
                raw = response.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as exc:
            # Never read or expose the provider's error body or a request repr.
            raise _HTTPFailure(exc.code) from None
        except (TimeoutError, socket.timeout):
            raise NewsError("openai_agents_timeout") from None
        except (urllib.error.URLError, OSError):
            raise NewsError("openai_transport_error") from None
        if time.monotonic() > deadline:
            raise NewsError("openai_agents_timeout")
        if len(raw) > MAX_BYTES:
            raise NewsError("openai_response_too_large")
        if not raw:  # The documented session event endpoint has an empty response.
            return {}
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise NewsError("openai_invalid_json") from None
        if not isinstance(result, dict):
            raise NewsError("openai_invalid_json")
        return result

    def _save_registry(self, registry: dict) -> None:
        raw = json_bytes(registry)
        if len(raw) > MAX_BYTES:
            raise NewsError("openai_agents_registry_too_large")
        fd, name = tempfile.mkstemp(prefix=".agents-registry-", dir=self.state_dir)
        temporary = Path(name)
        try:
            with os.fdopen(fd, "wb") as handle:
                os.fchmod(handle.fileno(), 0o600)
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._registry_path)
            directory = os.open(self.state_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            temporary.unlink(missing_ok=True)

    def _load_registry(self) -> dict:
        if self._registry_path.is_symlink():
            raise NewsError("openai_agents_invalid_registry")
        if not self._registry_path.exists():
            return {"schema": REGISTRY_SCHEMA, "agents": {}, "pending": {}}
        try:
            with self._registry_path.open("rb") as handle:
                raw = handle.read(MAX_BYTES + 1)
            registry = json.loads(raw)
            if (len(raw) > MAX_BYTES or not isinstance(registry, dict)
                    or set(registry) != {"schema", "agents", "pending"}
                    or registry["schema"] != REGISTRY_SCHEMA
                    or not isinstance(registry["agents"], dict)
                    or not isinstance(registry["pending"], dict)):
                raise ValueError
            for digest, row in registry["agents"].items():
                if (not DIGEST.fullmatch(digest) or not isinstance(row, dict)
                        or row.get("stage") not in STAGES):
                    raise ValueError
                _identifier(row.get("id"))
            if any(not DIGEST.fullmatch(key) or value not in STAGES
                   for key, value in registry["pending"].items()):
                raise ValueError
            return registry
        except (ValueError, TypeError, UnicodeDecodeError):
            raise NewsError("openai_agents_invalid_registry") from None

    def _configuration(self, stage: str) -> tuple[str, dict]:
        from .agent_profiles import AGENT_PROFILES

        config = copy.deepcopy(AGENT_PROFILES[stage])
        if self.model is not None:
            config["model"] = self.model
        # Unlike Responses, Agents JSONSchema accepts only type and schema.
        output = config.get("text", {}).get("format", {})
        output.pop("name", None)
        output.pop("strict", None)
        if (config.get("tools") != []
                or config.get("multi_agent", {}).get("enabled") is not False
                or output.get("type") != "json_schema"
                or not isinstance(output.get("schema"), dict)
                or not isinstance(config.get("name"), str)
                or not isinstance(config.get("instructions"), str)):
            raise NewsError("openai_agents_invalid_profile")
        metadata = config.setdefault("metadata", {})
        metadata.update({"contract_news_owner": "web-cfg", "contract_news_stage": stage})
        metadata.pop("config_sha256", None)
        digest = hashlib.sha256(json_bytes(config)).hexdigest()
        metadata["config_sha256"] = digest
        return digest, config

    def _catalog(self, *, deadline: float, sessions: bool = False, request_id: str | None = None) -> list[dict]:
        path = "/agents/sessions" if sessions else "/agents"
        rows, after, seen = [], None, set()
        for _ in range(MAX_PAGES):
            query = {"limit": 100, "order": "desc"}
            if after:
                query["after"] = after
            page = self._request("GET", path + "?" + urllib.parse.urlencode(query), deadline=deadline)
            if not isinstance(page.get("data"), list) or type(page.get("has_more")) is not bool:
                raise NewsError("openai_agents_invalid_list")
            if any(not isinstance(row, dict) for row in page["data"]):
                raise NewsError("openai_agents_invalid_list")
            rows.extend(page["data"])
            if request_id and any(isinstance(row.get("metadata"), dict)
                                  and row["metadata"].get("news_request") == request_id for row in rows):
                return rows
            if not page["has_more"]:
                return rows
            after = _identifier(page.get("last_id"))
            if after in seen or not page["data"]:
                raise NewsError("openai_agents_invalid_pagination")
            seen.add(after)
        # Do not create a duplicate when discovery could not cover the project.
        raise NewsError("openai_agents_discovery_limit")

    def _matches(self, record: dict, config: dict) -> bool:
        return record.get("object") == "agent" and _contains(record, config)

    def _readback(self, identifier: str, config: dict, *, deadline: float) -> dict:
        record = self._request("GET", "/agents/" + _identifier(identifier), deadline=deadline)
        if record.get("id") != identifier or not self._matches(record, config):
            raise NewsError("openai_agents_configuration_mismatch")
        return record

    def provision(self) -> dict[str, str]:
        """Read back all four saved agents before permitting the first paid turn."""
        if self.agent_ids:
            return dict(self.agent_ids)
        deadline = time.monotonic() + MAX_SESSION_SECONDS
        try:
            self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            lock_path = self.state_dir / "agents-registry.lock"
            if lock_path.is_symlink():
                raise NewsError("openai_agents_invalid_registry")
            with lock_path.open("a+b") as lock:
                os.fchmod(lock.fileno(), 0o600)
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise NewsError("openai_agents_registry_busy") from None
                registry = self._load_registry()
                catalog = None
                verified = {}
                for stage in STAGES:
                    digest, config = self._configuration(stage)
                    self._configs[stage] = config
                    saved = registry["agents"].get(digest)
                    record = None
                    if saved:
                        try:
                            record = self._readback(saved["id"], config, deadline=deadline)
                        except _HTTPFailure as exc:
                            if exc.status != 404:
                                raise
                        except NewsError as exc:
                            if str(exc) != "openai_agents_configuration_mismatch":
                                raise
                    if record is None:
                        if catalog is None:
                            catalog = self._catalog(deadline=deadline)
                        candidate = next((row for row in catalog if self._matches(row, config)), None)
                        if candidate is not None:
                            record = self._readback(_identifier(candidate.get("id")), config, deadline=deadline)
                        else:
                            if digest in registry["pending"]:
                                raise NewsError("openai_agents_creation_unconfirmed")
                            # Persist intent before POST. A crash/lost response is
                            # recovered by metadata discovery, never a blind retry.
                            registry["pending"][digest] = stage
                            self._save_registry(registry)
                            try:
                                created = self._request("POST", "/agents", config, deadline=deadline)
                                identifier = _identifier(created.get("id"))
                            except NewsError as exc:
                                if isinstance(exc, _HTTPFailure) and exc.status in {400, 401, 403, 404, 422, 429}:
                                    registry["pending"].pop(digest, None)
                                    self._save_registry(registry)
                                    raise
                                catalog = self._catalog(deadline=deadline)
                                recovered = next((row for row in catalog if self._matches(row, config)), None)
                                if recovered is None:
                                    raise NewsError("openai_agents_creation_unconfirmed") from None
                                identifier = _identifier(recovered.get("id"))
                            registry["agents"][digest] = {
                                "id": identifier, "stage": stage,
                                "name": config["name"], "model": config["model"],
                            }
                            registry["pending"].pop(digest, None)
                            self._save_registry(registry)
                            record = self._readback(identifier, config, deadline=deadline)
                            catalog.append(record)
                    registry["agents"][digest] = {
                        "id": _identifier(record.get("id")), "stage": stage,
                        "name": config["name"], "model": config["model"],
                    }
                    registry["pending"].pop(digest, None)
                    self._save_registry(registry)
                    verified[stage] = record["id"]
                self.agent_ids = verified
        except OSError:
            raise NewsError("openai_agents_private_state_error") from None
        return dict(self.agent_ids)

    def _cancel(self, identifier: str, *, deadline: float) -> bool:
        try:
            self._request("POST", "/agents/sessions/" + _identifier(identifier) + "/events",
                          {"events": [{"type": "agent.session.input.cancel"}]}, deadline=deadline)
            return True
        except NewsError:
            return False

    def _output(self, session_id: str, turn_id: str, *, deadline: float) -> dict:
        page = self._request("GET", f"/agents/sessions/{session_id}/items?order=asc&limit=100", deadline=deadline)
        if not isinstance(page.get("data"), list) or page.get("has_more") is not False:
            raise NewsError("openai_agents_incomplete_items")
        messages = [item for item in page["data"] if isinstance(item, dict)
                    and item.get("type") == "message" and item.get("role") == "assistant"
                    and item.get("phase") == "final_answer" and item.get("turn_id") == turn_id]
        if len(messages) != 1 or messages[0].get("status") != "completed":
            raise NewsError("openai_missing_structured_text")
        content = messages[0].get("content")
        if (not isinstance(content, list) or not content
                or any(not isinstance(part, dict) or part.get("type") != "output_text"
                       or not isinstance(part.get("text"), str) for part in content)):
            raise NewsError("openai_missing_structured_text")
        try:
            value = json.loads("".join(part["text"] for part in content))
        except (ValueError, TypeError):
            raise NewsError("openai_invalid_json") from None
        if not isinstance(value, dict):
            raise NewsError("openai_invalid_json")
        return value

    def call(self, stage: str, facts: dict, draft: dict | None = None) -> dict:
        if stage not in STAGES:
            raise NewsError("invalid_api_stage")
        from .editorial import agent_input

        body = agent_input(stage, facts, draft)
        if not isinstance(body, dict):
            raise NewsError("openai_agents_invalid_input")
        self.provision()
        deadline = time.monotonic() + self.timeout
        # Reserve a small part of the same overall budget to stop unfinished work.
        work_deadline = deadline - min(CANCEL_SECONDS, self.timeout / 4)
        session_id = None
        terminal = False
        request_id = uuid.uuid4().hex
        try:
            session = self._request("POST", "/agents/sessions", {
                "agent_id": self.agent_ids[stage],
                "environment": {"type": "none"},
                "input": json.dumps(body, ensure_ascii=False, allow_nan=False),
                "metadata": {"application": "confenge-contract-news", "stage": stage,
                             "news_request": request_id},
                "stream": False,
            }, deadline=work_deadline)
            session_id = _identifier(session.get("id"))
            while True:
                if time.monotonic() >= work_deadline:
                    raise NewsError("openai_agents_timeout")
                if session.get("id") != session_id or session.get("object") != "agent.session":
                    raise NewsError("openai_agents_invalid_session")
                # Saved configurations can be edited outside this process after
                # provisioning. The copied session settings must still agree.
                expected = {key: value for key, value in self._configs[stage].items()
                            if key != "metadata"}
                if not _contains(session.get("agent"), expected):
                    raise NewsError("openai_agents_session_configuration_mismatch")
                state = session.get("status")
                if state == "failed":
                    terminal = True
                    raise NewsError("openai_agents_session_failed")
                if state == "requires_action" or session.get("required_actions"):
                    raise NewsError("openai_agents_unexpected_action")
                if state not in {"idle", "in_progress"}:
                    raise NewsError("openai_agents_invalid_session")
                if state == "idle":
                    turns = self._request("GET", f"/agents/sessions/{session_id}/turns?order=desc&limit=1",
                                          deadline=work_deadline)
                    if (not isinstance(turns.get("data"), list)
                            or turns.get("has_more") is not False or len(turns["data"]) > 1):
                        raise NewsError("openai_agents_invalid_turns")
                    if turns["data"]:
                        turn = turns["data"][0]
                        if (not isinstance(turn, dict) or turn.get("session_id") != session_id
                                or turn.get("subagent_id") is not None):
                            raise NewsError("openai_agents_invalid_turns")
                        turn_state = turn.get("status")
                        if turn_state in {"failed", "cancelled"}:
                            terminal = True
                            raise NewsError("openai_agents_turn_" + turn_state)
                        if turn_state == "completed":
                            terminal = True
                            return self._output(session_id, _identifier(turn.get("id")), deadline=work_deadline)
                        if turn_state not in {"queued", "in_progress", "waiting"}:
                            raise NewsError("openai_agents_invalid_turns")
                time.sleep(min(POLL_SECONDS, max(0, work_deadline - time.monotonic())))
                session = self._request("GET", "/agents/sessions/" + session_id, deadline=work_deadline)
        except NewsError as error:
            if session_id is None:
                # Creation can succeed before the response is lost. Find only
                # this request, never cancel an unrelated session or retry POST.
                try:
                    sessions = self._catalog(deadline=deadline, sessions=True, request_id=request_id)
                    found = next((row for row in sessions
                                  if isinstance(row.get("metadata"), dict)
                                  and row["metadata"].get("news_request") == request_id), None)
                    if found:
                        session_id = _identifier(found.get("id"))
                except NewsError:
                    pass
            if session_id is not None and not terminal:
                if not self._cancel(session_id, deadline=deadline):
                    raise NewsError(str(error) + "_cancel_unconfirmed") from None
            raise
