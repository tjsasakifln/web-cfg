#!/usr/bin/env python3
"""Run the approved producer and publisher without changing ingestion services."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import io
import json
import os
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"[0-9a-f]{64}")
MAX_BUNDLE = 16 * 1024 * 1024
MAX_FILES = 128
PYPDF_WHEEL = "scripts/public_exports/vendor/pypdf-6.21.4-py3-none-any.whl"
FACT_SCHEMA = "confenge.contract-news-facts/v1"
MAX_FACTS = 1024 * 1024
DEFAULT_STATE = Path("/var/lib/confenge-web/contract-news")


class RunError(ValueError):
    pass


def read_json(path: Path, limit: int = 1024 * 1024) -> dict:
    if not path.is_file() or path.is_symlink() or path.stat().st_size > limit:
        raise RunError("invalid_private_input")
    try:
        value = json.loads(path.read_bytes())
    except (ValueError, UnicodeError):
        raise RunError("invalid_private_json") from None
    if not isinstance(value, dict):
        raise RunError("invalid_private_json")
    return value


def approved_release(current: Path, sha: str) -> Path:
    if not SHA.fullmatch(sha) or not current.is_symlink():
        raise RunError("invalid_release_identity")
    release = current.resolve(strict=True)
    if release.name != sha or release.parent != current.parent / "releases":
        raise RunError("release_not_current")
    metadata = read_json(release / "metadata/release-manifest.json")
    if metadata.get("commit") != sha:
        raise RunError("release_manifest_mismatch")
    return release


def producer_revision(release: Path) -> str:
    config = read_json(release / "data/editorial/contract-news-source.json")
    sha = config.get("producer_commit", "")
    if (config.get("schema") != "confenge.contract-news-source/v1"
            or config.get("repository") != "tjsasakifln/extra-cli"
            or config.get("fact_contract") != "confenge.contract-news-facts/v1"
            or not isinstance(sha, str) or not SHA.fullmatch(sha)):
        raise RunError("invalid_producer_pin")
    return sha


def unpack_producer(bundle: Path, digest: str, expected_sha: str, destination: Path) -> Path:
    if (not DIGEST.fullmatch(digest) or not SHA.fullmatch(expected_sha)
            or not bundle.is_file() or bundle.is_symlink()
            or bundle.stat().st_size > MAX_BUNDLE):
        raise RunError("invalid_producer_bundle")
    raw = bundle.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise RunError("producer_bundle_digest_mismatch")
    if destination.is_symlink():
        raise RunError("unsafe_producer_directory")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination.chmod(0o700)
    stage = Path(tempfile.mkdtemp(prefix=".producer-", dir=destination))
    try:
        names: set[str] = set()
        hashes = {}
        total = 0
        wheel_count = 0
        # Read the exact bytes whose digest was checked above. Reopening the
        # uploaded path would allow a replacement between verification and use.
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
            for member in archive:
                name = member.name
                path = PurePosixPath(name)
                wheel = name == PYPDF_WHEEL
                allowed = name == "producer-manifest.json" or wheel or (
                    name.startswith("scripts/") and name.endswith(".py")
                    and re.fullmatch(r"[A-Za-z0-9_./-]+", name))
                total += member.size
                if (not allowed or not member.isfile() or path.is_absolute()
                        or any(part in {"", ".", ".."} for part in name.split("/"))
                        or name in names or len(names) >= MAX_FILES
                        or member.size < 0 or member.size > 2 * 1024 * 1024
                        or total > MAX_BUNDLE):
                    raise RunError("unsafe_producer_archive")
                names.add(name)
                source = archive.extractfile(member)
                if source is None:
                    raise RunError("invalid_producer_member")
                with source:
                    content = source.read(member.size + 1)
                if len(content) != member.size:
                    raise RunError("invalid_producer_member")
                if wheel:
                    wheel_count += 1
                    if wheel_count > 1 or not content.startswith(b"PK\x03\x04"):
                        raise RunError("unsafe_producer_wheel")
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                target.write_bytes(content)
                target.chmod(0o400)
                if name != "producer-manifest.json":
                    hashes[name] = hashlib.sha256(content).hexdigest()
        manifest = read_json(stage / "producer-manifest.json")
        if (manifest.get("schema") != "confenge.contract-news-producer/v1"
                or manifest.get("repository") != "tjsasakifln/extra-cli"
                or manifest.get("producer_commit") != expected_sha
                or manifest.get("fact_contract") != "confenge.contract-news-facts/v1"
                or manifest.get("files") != hashes
                or "scripts/public_exports/contract_news.py" not in hashes):
            raise RunError("producer_manifest_mismatch")
        # A new isolated directory per round also verifies all code bytes. Keep
        # it private and remove it after the subprocess instead of trusting a
        # mutable cache of executable files between rounds.
        return stage
    except Exception:
        shutil.rmtree(stage)
        raise


def runtime_settings(path: Path) -> dict[str, str]:
    """Parse only this feature's settings; never execute shell assignments."""
    keys = {"OPENAI_API_KEY", "CONFENGE_NEWS_MODEL", "CONFENGE_NEWS_NODE", "CONFENGE_NEWS_ENABLED"}
    result = {}
    if not path.is_file() or not os.access(path, os.R_OK):
        return result
    if path.stat().st_size > 256 * 1024:
        raise RunError("runtime_env_too_large")
    for line in path.read_text().splitlines():
        match = re.match(r"\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$", line)
        if not match or match[1] not in keys:
            continue
        try:
            value = shlex.split(match[2], comments=True, posix=True)
        except ValueError:
            raise RunError("invalid_news_runtime_setting") from None
        if len(value) > 1:
            raise RunError("invalid_news_runtime_setting")
        result[match[1]] = value[0] if value else ""
    return result


def key_from_file(path: Path | None) -> str:
    if path is None:
        return ""
    stat = path.lstat()
    if (not path.is_file() or path.is_symlink() or stat.st_mode & 0o077
            or stat.st_uid != os.getuid() or stat.st_size > 1024):
        raise RunError("unsafe_api_key_file")
    key = path.read_text().strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,400}", key):
        raise RunError("invalid_api_key_file")
    return key


def process_json(command: list[str], cwd: Path, env: dict, timeout: int) -> dict:
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, check=False)
    # Subprocess output is intentionally not relayed. In particular, an HTTP
    # library exception must not put Authorization or private facts in logs.
    # The publisher emits its JSON error on stderr. Only a failed worker with
    # no stdout may use that channel, and the same code filter applies below.
    output = result.stdout
    if result.returncode and not output:
        output = result.stderr
    try:
        value = json.loads(output)
    except (ValueError, UnicodeError):
        raise RunError("worker_invalid_response") from None
    if result.returncode or not isinstance(value, dict):
        code = value.get("code", value.get("reason", "worker_failed")) if isinstance(value, dict) else "worker_failed"
        if not isinstance(code, str) or not re.fullmatch(r"[a-z0-9_]{1,90}", code):
            code = "worker_failed"
        raise RunError(code)
    return value


def producer_summary(response: dict, facts_path: Path) -> dict:
    """Only bounded numeric totals and the source clock may leave private facts."""
    summary = {}
    if response.get("ok") is not True or response.get("schema") != FACT_SCHEMA:
        return summary
    requests = response.get("official_requests")
    verified = response.get("verified_records")
    excluded = response.get("excluded")
    if (type(requests) is int and 0 <= requests <= 20
            and type(verified) is int and 0 <= verified <= 20
            and isinstance(excluded, dict) and len(excluded) <= 20
            and all(type(value) is int and 0 <= value <= 20 for value in excluded.values())):
        excluded_count = sum(excluded.values())
        # Every attempted detail is either confirmed or excluded. Rechecks
        # absent from the persisted source make no HTTP request and count in
        # neither total. Invalid diagnostics never change publication gates.
        if verified + excluded_count == requests:
            summary.update(official_requests=requests, verified_records=verified, excluded_count=excluded_count)
    # v1 emits source_as_of in the facts header, not in its stdout summary.
    # Never copy response fields, reason strings or any record into job logs.
    try:
        facts = read_json(facts_path, MAX_FACTS)
    except (RunError, OSError):
        return summary
    source_clock = facts.get("source_as_of")
    if (facts.get("schema") != FACT_SCHEMA or facts.get("producer") != "extra-cli"
            or not isinstance(source_clock, str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)", source_clock)):
        return summary
    try:
        parsed = datetime.fromisoformat(source_clock)
        summary["source_as_of"] = parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError):
        pass
    return summary


def run(args: argparse.Namespace) -> dict:
    release = approved_release(args.current, args.expected_release)
    expected_producer = producer_revision(release)
    settings = runtime_settings(args.runtime_env)
    if args.enabled != "1" or settings.get("CONFENGE_NEWS_ENABLED") == "0":
        return {"status": "disabled", "published": 0, "calls": 0}
    if (args.state / "private/STOP").exists():
        return {"status": "disabled", "published": 0, "calls": 0}
    api_key = key_from_file(args.key_file) or settings.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RunError("missing_openai_api_key")
    args.state.mkdir(parents=True, exist_ok=True, mode=0o755)
    private, public = args.state / "private", args.state / "public"
    for path in (args.state, private, public):
        if path.is_symlink():
            raise RunError("unsafe_news_directory")
    # mkdir's mode is reduced by the caller's umask. Runtime needs to traverse
    # this public parent even when the SSH upload uses umask 077.
    args.state.chmod(0o755)
    private.mkdir(exist_ok=True, mode=0o700)
    private.chmod(0o700)
    public.mkdir(exist_ok=True, mode=0o755)
    public.chmod(0o755)
    try:
        lock_fd = os.open(private / ".orchestrator.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    except OSError:
        raise RunError("unsafe_news_lock") from None
    with os.fdopen(lock_fd, "a") as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid():
            raise RunError("unsafe_news_lock")
        os.fchmod(lock.fileno(), 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "locked", "published": 0, "calls": 0}
        producer = unpack_producer(args.bundle, args.bundle_sha256, expected_producer, private / "producer")
        try:
            env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                   "LANG": "C.UTF-8", "TZ": "America/Sao_Paulo", "PYTHONDONTWRITEBYTECODE": "1"}
            source = process_json([sys.executable, "-S", "-m", "scripts.contract_news", "source-state", "--state-dir", str(private)], release, env, 30)
            fd, name = tempfile.mkstemp(prefix=".published-ids-", dir=private)
            with os.fdopen(fd, "w") as handle:
                json.dump(source, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(name, private / "published-ids.json")
            exported = process_json([sys.executable, "-S", "-m", "scripts.public_exports.contract_news",
                                     "--radar-pointer", str(args.radar_pointer), "--published-ids", str(private / "published-ids.json"),
                                     "--output", str(private / "facts.json"), "--producer-commit", expected_producer], producer, env, 480)
            source_summary = producer_summary(exported, private / "facts.json")
            approved_release(args.current, args.expected_release)
            env.update(OPENAI_API_KEY=api_key, CONFENGE_NEWS_ENABLED="1",
                       CONFENGE_NEWS_RELEASE_LINK=str(args.current), CONFENGE_NEWS_RELEASE_SHA=args.expected_release)
            for key in ("CONFENGE_NEWS_MODEL", "CONFENGE_NEWS_NODE"):
                if settings.get(key):
                    env[key] = settings[key]
            result = process_json([sys.executable, "-S", "-m", "scripts.contract_news", "generate",
                                   "--input", str(private / "facts.json"), "--state-dir", str(private),
                                   "--output-dir", str(public)], release, env, 1200)
            if (public / "current.json").exists():
                checked = process_json([sys.executable, "-S", "-m", "scripts.contract_news", "check",
                                        "--input", str(public / "current.json")], release, env, 30)
                result["verified_articles"] = checked.get("articles")
            result["release"] = args.expected_release
            result["producer_commit"] = expected_producer
            result["producer_summary"] = source_summary
            return result
        finally:
            shutil.rmtree(producer)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-release", required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--bundle-sha256", required=True)
    parser.add_argument("--enabled", choices=("0", "1"), default="1")
    parser.add_argument("--key-file", type=Path)
    parser.add_argument("--current", type=Path, default=Path("/opt/confenge-web/current"))
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--runtime-env", type=Path, default=Path("/etc/confenge-web/runtime.env"))
    parser.add_argument("--radar-pointer", type=Path, default=Path("/var/lib/confenge-market-radar/current.json"))
    args = parser.parse_args()
    try:
        result = run(args)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (RunError, OSError, ValueError, tarfile.TarError, subprocess.TimeoutExpired) as exc:
        code = str(exc) if isinstance(exc, RunError) else "news_operation_failed"
        print(json.dumps({"status": "error", "code": code, "published_verified": False}))
        return 1
    finally:
        if args.key_file is not None:
            args.key_file.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
