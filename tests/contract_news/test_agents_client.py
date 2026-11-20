"""Exercise the documented saved-agent/session/turn/item REST layouts."""

import copy
import io
import json
import stat
import sys
import tempfile
import types
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from scripts.contract_news.agent_profiles import AGENT_PROFILES
from scripts.contract_news.agents_client import AgentsClient, ENDPOINT, STAGES
from scripts.contract_news.core import NewsError


class Response:
    def __init__(self, value):
        self.raw = json.dumps(value).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, maximum):
        return self.raw[:maximum]


class FakeAPI:
    """Transport fake with the actual endpoint response shapes, not Responses."""
    def __init__(self):
        self.agents = {}
        self.calls = []
        self.sessions = {}
        self.output = {"supported": True, "issues": []}
        self.session_status = "idle"
        self.turn_status = "completed"
        self.wrong_output_turn = False
        self.lost_agent_create = False
        self.reject_agent_create = False
        self.lost_session_create = False
        self.tamper_session_model = False
        self.cancel_error = False
        self.clock = 0.0
        self.cancelled = []

    def send(self, request, timeout):
        method = request.get_method()
        path = request.full_url.removeprefix(ENDPOINT)
        body = json.loads(request.data) if request.data else None
        self.calls.append((method, path, body, timeout, dict(request.header_items())))
        if path.startswith("/agents?"):
            return Response({"object": "list", "data": list(self.agents.values()),
                             "has_more": False, "last_id": None})
        if path == "/agents" and method == "POST":
            if self.reject_agent_create:
                raise TimeoutError("credential-do-not-expose")
            identifier = "agent_" + str(len(self.agents) + 1)
            agent = copy.deepcopy(body)
            agent.update({"id": identifier, "object": "agent", "created_at": 10,
                          "updated_at": 10})
            # Documented GET responses may add nested defaults.
            agent["multi_agent"]["max_concurrent_subagents"] = None
            agent["reasoning"]["summary"] = None
            self.agents[identifier] = agent
            if self.lost_agent_create:
                self.lost_agent_create = False
                raise TimeoutError("credential-do-not-expose")
            return Response(agent)
        if path == "/agents/sessions" and method == "POST":
            identifier = "sess_" + str(len(self.sessions) + 1)
            session = {"id": identifier, "object": "agent.session",
                       "status": self.session_status, "required_actions": [],
                       "metadata": body["metadata"],
                       "agent": copy.deepcopy(self.agents[body["agent_id"]])}
            self.sessions[identifier] = session
            if self.tamper_session_model:
                session["agent"]["model"] = "unexpected-model"
            if self.lost_session_create:
                self.lost_session_create = False
                raise TimeoutError("credential-do-not-expose")
            return Response(session)
        if path.startswith("/agents/sessions?"):
            return Response({"object": "list", "data": list(self.sessions.values()),
                             "has_more": False, "last_id": None})
        if path.startswith("/agents/sessions/"):
            identifier = path.split("/")[3]
            if "/events" in path:
                self.cancelled.append(identifier)
                if self.cancel_error:
                    raise TimeoutError("credential-do-not-expose")
                return Response({})
            if "/turns?" in path:
                return Response({"object": "list", "has_more": False,
                                 "data": [{"id": "turn_1", "session_id": identifier,
                                           "object": "agent.session.turn", "subagent_id": None,
                                           "status": self.turn_status, "error": None}]})
            if "/items?" in path:
                return Response({"object": "list", "has_more": False, "data": [
                    {"id": "msg_1", "type": "message", "role": "assistant",
                     "phase": "commentary", "status": "completed", "turn_id": "turn_1",
                     "content": [{"type": "output_text", "text": "I am checking the source."}]},
                    {"id": "msg_2", "type": "message", "role": "assistant",
                     "phase": "final_answer", "status": "completed",
                     "turn_id": "wrong_turn" if self.wrong_output_turn else "turn_1",
                     "content": [{"type": "output_text", "text": json.dumps(self.output)}]},
                ]})
            return Response(self.sessions[identifier])
        if path.startswith("/agents/") and method == "GET":
            return Response(self.agents[path.split("/")[-1]])
        raise AssertionError((method, path))


class AgentsClientTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.api = FakeAPI()
        self.input_calls = []

        def make_input(stage, facts, draft):
            self.input_calls.append((stage, facts, draft))
            return {"facts": facts, "context": draft or {}, "sources": []}

        # Input assembly has separate editorial tests; this suite tests transport.
        self.module_patch = patch.dict(sys.modules, {
            "scripts.contract_news.editorial": types.SimpleNamespace(agent_input=make_input),
        })
        self.module_patch.start()
        self.addCleanup(self.module_patch.stop)
        self.network = patch("urllib.request.urlopen", side_effect=self.api.send)
        self.network.start()
        self.addCleanup(self.network.stop)

    def client(self, **kwargs):
        return AgentsClient("credential-do-not-expose", state_dir=self.path, **kwargs)

    def creates(self):
        return [row for row in self.api.calls if row[:2] == ("POST", "/agents")]

    def sessions(self):
        return [row for row in self.api.calls if row[:2] == ("POST", "/agents/sessions")]

    def test_four_saved_agents_read_back_then_sessions_use_ids_and_context(self):
        client = self.client()
        for stage in STAGES:
            self.assertEqual(client.call(stage, {"id": "fact"}, {"research": "prior"}), self.api.output)
        self.assertEqual(len(self.creates()), 4)
        self.assertEqual(set(client.agent_ids), set(STAGES))
        self.assertEqual(len(self.sessions()), 4)
        for stage, request in zip(STAGES, self.sessions()):
            body = request[2]
            self.assertEqual(body["agent_id"], client.agent_ids[stage])
            self.assertNotIn("agent", body)
            self.assertEqual(body["environment"], {"type": "none"})
            self.assertEqual(json.loads(body["input"])["context"], {"research": "prior"})
        for _, _, body, timeout, headers in self.creates():
            self.assertLessEqual(timeout, 45)
            self.assertEqual(headers["Openai-beta"], "agents=v1")
            self.assertEqual(body["tools"], [])
            self.assertFalse(body["multi_agent"]["enabled"])
            self.assertEqual(set(body["text"]["format"]), {"type", "schema"})
        first_session_index = next(i for i, row in enumerate(self.api.calls) if row[:2] == ("POST", "/agents/sessions"))
        readbacks = [row for row in self.api.calls[:first_session_index]
                     if row[0] == "GET" and row[1].startswith("/agents/agent_")]
        self.assertEqual(len(readbacks), 4)

    def test_new_client_reuses_registry_with_readbacks_and_private_metadata_only(self):
        first = self.client().provision()
        second = self.client().provision()
        self.assertEqual(first, second)
        self.assertEqual(len(self.creates()), 4)
        path = self.path / "agents-registry.json"
        raw = path.read_text()
        self.assertNotIn("credential-do-not-expose", raw)
        self.assertNotIn("instructions", raw)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_profile_revision_creates_new_version_without_updating_other_agents(self):
        original = self.client().provision()
        changed = copy.deepcopy(AGENT_PROFILES)
        changed["generate"]["instructions"] += "\nA verified editorial revision."
        with patch.dict(AGENT_PROFILES, changed, clear=True):
            revised = self.client().provision()
        self.assertEqual(len(self.creates()), 5)
        self.assertNotEqual(original["generate"], revised["generate"])
        for stage in ("research", "analyze", "review"):
            self.assertEqual(original[stage], revised[stage])
        self.assertFalse(any(method == "POST" and path.startswith("/agents/agent_")
                             for method, path, *_ in self.api.calls))

    def test_lost_create_response_recovers_the_saved_agent_without_duplicate(self):
        self.api.lost_agent_create = True
        identifiers = self.client().provision()
        self.assertEqual(len(self.creates()), 4)
        self.assertEqual(len(identifiers), 4)
        self.assertEqual(json.loads((self.path / "agents-registry.json").read_text())["pending"], {})

    def test_unconfirmed_creation_stays_pending_and_is_not_retried(self):
        self.api.reject_agent_create = True
        for _ in range(2):
            with self.assertRaisesRegex(NewsError, "^openai_agents_creation_unconfirmed$"):
                self.client().provision()
        self.assertEqual(len(self.creates()), 1)
        self.assertEqual(len(self.sessions()), 0)

    def test_idle_session_with_failed_turn_is_not_a_success(self):
        self.api.turn_status = "failed"
        with self.assertRaisesRegex(NewsError, "^openai_agents_turn_failed$"):
            self.client().call("review", {})
        self.assertFalse(any("/items?" in row[1] for row in self.api.calls))

    def test_final_answer_must_belong_to_the_completed_turn(self):
        self.api.wrong_output_turn = True
        with self.assertRaisesRegex(NewsError, "^openai_missing_structured_text$"):
            self.client().call("review", {})

    def test_output_must_be_json_object_not_an_array(self):
        self.api.output = ["not an editorial result"]
        with self.assertRaisesRegex(NewsError, "^openai_invalid_json$"):
            self.client().call("generate", {})

    def test_lost_session_creation_response_cancels_only_its_matching_session(self):
        self.api.lost_session_create = True
        with self.assertRaisesRegex(NewsError, "^openai_agents_timeout$"):
            self.client().call("generate", {})
        self.assertEqual(len(self.sessions()), 1)
        self.assertEqual(self.api.cancelled, ["sess_1"])

    def test_copied_session_configuration_is_checked_for_external_drift(self):
        self.api.tamper_session_model = True
        with self.assertRaisesRegex(NewsError, "^openai_agents_session_configuration_mismatch$"):
            self.client().call("generate", {})
        self.assertEqual(self.api.cancelled, ["sess_1"])

    def test_unconfirmed_cancellation_is_reported_without_raw_error_details(self):
        self.api.tamper_session_model = True
        self.api.cancel_error = True
        with self.assertRaisesRegex(NewsError, "^openai_agents_session_configuration_mismatch_cancel_unconfirmed$"):
            self.client().call("generate", {})

    def test_timeout_cancels_active_turn_inside_the_overall_time_budget(self):
        self.api.session_status = "in_progress"

        def sleep(seconds):
            self.api.clock += seconds

        with patch("time.monotonic", side_effect=lambda: self.api.clock), patch("time.sleep", side_effect=sleep):
            with self.assertRaisesRegex(NewsError, "^openai_agents_timeout$"):
                self.client(timeout=10).call("generate", {})
        self.assertEqual(self.api.cancelled, ["sess_1"])
        self.assertLessEqual(self.api.clock, 10)
        self.assertEqual(self.api.calls[-1][2], {"events": [{"type": "agent.session.input.cancel"}]})

    def test_http_error_bodies_and_credentials_are_not_exposed(self):
        self.network.stop()
        error = urllib.error.HTTPError(ENDPOINT, 401, "credential-do-not-expose", {},
                                       io.BytesIO(b"credential-do-not-expose"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(NewsError, "^openai_http_401$"):
                self.client().provision()

    def test_override_model_is_explicit_and_default_preserves_profiles(self):
        self.client().provision()
        self.assertEqual({call[2]["model"] for call in self.creates()}, {"gpt-6.2-astra", "gpt-6.2-sol"})
        self.client(model="configured-model").provision()
        self.assertEqual({call[2]["model"] for call in self.creates()[4:]}, {"configured-model"})


if __name__ == "__main__":
    unittest.main()
