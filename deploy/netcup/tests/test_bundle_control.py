from __future__ import annotations

import hashlib
import os
import shlex
import subprocess

import pytest

from deploy.netcup import run_bundle_control as runner
from deploy.netcup.tests.test_release_control import SHA_A, SHA_B, LiveServer, make_incoming


def test_bundle_controller_is_bound_to_payload_and_checkout(tmp_path, monkeypatch):
    host = tmp_path / "host"
    files = make_incoming(tmp_path, host, SHA_A)
    directory = next(iter(files.values())).parent
    code, digest = runner.verified_controller(directory, SHA_A)
    assert code == runner.CONTROL.read_bytes()
    assert digest == hashlib.sha256(code).hexdigest()
    changed = tmp_path / "changed-controller.py"
    changed.write_bytes(code + b"\n")
    monkeypatch.setattr(runner, "CONTROL", changed)
    with pytest.raises(ValueError, match="differs from exact gated checkout"):
        runner.verified_controller(directory, SHA_A)
    monkeypatch.undo()
    bundle = directory / f"confenge-web-{SHA_A}.tar.gz"
    bundle.write_bytes(bundle.read_bytes() + b"x")
    with pytest.raises(Exception, match="checksum mismatch"):
        runner.verified_controller(directory, SHA_A)


@pytest.mark.parametrize("operation", ["stage", "verify", "promote", "rollback"])
def test_streamed_controller_checks_bytes_before_execution(operation):
    code = b"import os,sys; print(sys.argv[1:]); print(os.environ['CONFENGE_RELEASE_CONTROL_SHA256'])"
    digest = hashlib.sha256(code).hexdigest()
    command = runner.remote_command(operation, SHA_A, digest, expected_current=SHA_B)
    result = subprocess.run(shlex.split(command), input=code, capture_output=True)
    assert result.returncode == 0, result.stderr
    assert operation.encode() in result.stdout and digest.encode() in result.stdout
    if operation == "promote":
        assert b"--expected-current" in result.stdout and SHA_B.encode() in result.stdout
    drift = subprocess.run(shlex.split(command), input=code + b"x", capture_output=True)
    assert drift.returncode != 0
    assert b"controller transport digest mismatch" in drift.stderr
    assert drift.stdout == b""


def test_streamed_promote_requires_predecessor_and_upload_is_exact():
    with pytest.raises(ValueError, match="predecessor"):
        runner.remote_command("promote", SHA_A, "a" * 64)
    with pytest.raises(ValueError, match="upload"):
        runner.remote_command("stage", SHA_A, "a" * 64, "/tmp/untrusted")


def test_real_bundle_controller_stages_verifies_and_promotes_via_stream(tmp_path, monkeypatch):
    host = tmp_path / "host"
    monkeypatch.setenv("CONFENGE_RELEASE_TEST_MODE", "1")
    monkeypatch.setenv("CONFENGE_RELEASE_ROOT", str(host))
    monkeypatch.setenv("CONFENGE_ORIGIN_HOST", "confenge.com.br")
    files = make_incoming(tmp_path, host, SHA_A)
    code, digest = runner.verified_controller(next(iter(files.values())).parent, SHA_A)
    for operation in ("stage", "verify"):
        result = subprocess.run(shlex.split(runner.remote_command(operation, SHA_A, digest)),
                                input=code, capture_output=True)
        assert result.returncode == 0, result.stderr.decode()
    assert not (host / "current").exists()
    with LiveServer(host):
        command = shlex.split(runner.remote_command("promote", SHA_A, digest, expected_current="NONE"))
        command[2] = "CONFENGE_LOCAL_ORIGIN=" + os.environ["CONFENGE_LOCAL_ORIGIN"]
        result = subprocess.run(command, input=code, capture_output=True)
        assert result.returncode == 0, result.stderr.decode()
    assert (host / "current").resolve() == host / "releases" / SHA_A


def test_controller_checkout_rejects_staged_unstaged_and_untracked_changes(tmp_path, monkeypatch):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    target = tmp_path / "deploy/netcup/runner.py"
    target.parent.mkdir(parents=True)
    target.write_text("original\n")
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=tmp_path, text=True).strip()
    git("add", ".")
    git("-c", "user.name=Controlled test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture")
    sha = git("rev-parse", "HEAD")
    monkeypatch.setattr(runner, "ROOT", tmp_path)
    runner.validate_checkout(sha)
    target.write_text("modified\n")
    with pytest.raises(ValueError, match="not clean"):
        runner.validate_checkout(sha)
    git("add", ".")
    with pytest.raises(ValueError, match="not clean"):
        runner.validate_checkout(sha)
    target.write_text("original\n")
    git("add", ".")
    (target.parent / "shadow.py").write_text("untracked\n")
    with pytest.raises(ValueError, match="not clean"):
        runner.validate_checkout(sha)
