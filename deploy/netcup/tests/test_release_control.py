from __future__ import annotations

import functools
import http.server
import json
import os
import shutil
import subprocess
import tarfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Self

import pytest

from deploy.netcup.lib import release_control as control
from deploy.netcup.lib import schedule_gate as schedule
from deploy.netcup.lib.runtime_launcher import runtime_environment
from deploy.netcup.package_release import (
    build_release,
    sha256_file,
    write_deterministic_tar,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
SHA_A = "a" * 40
SHA_B = "b" * 40
SHA_C = "c" * 40


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


@pytest.fixture
def host(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "host"
    monkeypatch.setenv("CONFENGE_RELEASE_TEST_MODE", "1")
    monkeypatch.setenv("CONFENGE_RELEASE_ROOT", str(root))
    monkeypatch.setenv("CONFENGE_ORIGIN_HOST", "confenge.com.br")
    return root


def make_site(tmp_path: Path, sha: str) -> Path:
    site = tmp_path / f"site-{sha[0]}"
    well_known = site / ".well-known"
    well_known.mkdir(parents=True)
    artifact_hash = sha256_file(Path(__file__))
    manifest_hash = sha256_file(REPO_ROOT / "deploy" / "netcup" / "package_release.py")
    (site / "index.html").write_text(
        "<!doctype html><html lang='pt-BR'><body>CONFENGE</body></html>\n",
        encoding="utf-8",
    )
    identity = {
        "schema_version": "1.2.0",
        "commit": sha,
        "build_time": "2026-08-26T12:00:00Z",
        "artifact_hash": artifact_hash,
        "manifest_hash": manifest_hash,
    }
    build_manifest = {
        "schema_version": "1.0.0",
        "commit": sha,
        "artifact_hash": artifact_hash,
        "manifest_hash": manifest_hash,
    }
    pseo = {"schema_version": "1.0.0", "web_cfg_sha": sha}
    release_result = {
        "commit": sha,
        "web_cfg_sha": sha,
        "artifact_hash": artifact_hash,
        "manifest_hash": manifest_hash,
        "status": "BUILT",
    }
    for name, payload in (
        ("build-info.json", identity),
        ("build-manifest.json", build_manifest),
        ("pseo-build.json", pseo),
        ("release-result.json", release_result),
    ):
        (well_known / name).write_text(
            json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8"
        )
    return site


def make_host_contract(tmp_path: Path) -> Path:
    output = tmp_path / "host-contract"
    subprocess.run(
        [
            "node",
            "scripts/migration/netcup/render.mjs",
            "--root",
            str(REPO_ROOT),
            "--output",
            str(output),
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return output


def make_incoming(tmp_path: Path, host: Path, sha: str) -> dict[str, Path]:
    site = make_site(tmp_path, sha)
    output = tmp_path / f"package-{sha[0]}"
    result = build_release(
        repo_root=REPO_ROOT,
        site=site,
        host_contract=make_host_contract(tmp_path),
        output_dir=output,
        sha=sha,
        node_version="v22.19.0",
        python_version="3.12.10",
        ci_run_id="1234",
        ci_run_url="https://github.com/tjsasakifln/web-cfg/actions/runs/1234",
        source_date_epoch=1787756400,
    )
    incoming = host / "incoming" / sha
    incoming.mkdir(parents=True)
    for path in result.values():
        shutil.copy2(path, incoming / path.name)
    return {key: incoming / path.name for key, path in result.items()}


class LiveServer:
    def __init__(self, root: Path):
        handler = functools.partial(
            QuietHandler, directory=str(root / "current" / "_site")
        )
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> Self:
        self.thread.start()
        os.environ["CONFENGE_LOCAL_ORIGIN"] = (
            f"http://127.0.0.1:{self.server.server_port}"
        )
        return self

    def __exit__(self, *_args: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        os.environ.pop("CONFENGE_LOCAL_ORIGIN", None)


def test_stage_valid_and_verify(host: Path, tmp_path: Path) -> None:
    make_incoming(tmp_path, host, SHA_A)
    manifest = control.stage_release(SHA_A)
    assert manifest["commit"] == SHA_A
    verified = control.verify_release(SHA_A)
    assert verified["artifact"]["sha256"] == manifest["artifact"]["sha256"]
    assert not os.path.lexists(host / "current")


def test_pre_privacy_retention_release_remains_a_valid_rollback_target(
    host: Path, tmp_path: Path
) -> None:
    legacy_tmp = tmp_path / "legacy"
    legacy_tmp.mkdir()
    incoming = make_incoming(legacy_tmp, host, SHA_A)
    payload = legacy_tmp / "payload"
    payload.mkdir()
    with tarfile.open(incoming["artifact"], "r:gz") as archive:
        archive.extractall(payload, filter="data")
    source_path = payload / "metadata" / "release-source.json"
    source = json.loads(source_path.read_text(encoding="utf-8"))
    source.pop("capabilities", None)
    source["package_layout"] = [
        item
        for item in source["package_layout"]
        if item not in ("scripts/storage/lib.cjs", "scripts/storage/retention.mjs")
    ]
    source_path.write_text(json.dumps(source, sort_keys=True) + "\n", encoding="utf-8")
    feature_files = (
        "nginx/confenge-web-logrotate",
        "scripts/storage/lib.cjs",
        "scripts/storage/retention.mjs",
        "schedules/confenge-web-retention.service",
        "schedules/confenge-web-retention.timer",
        "schedules/confenge-web-retention-alert@.service",
    )
    for relative in feature_files:
        target = payload / relative
        if target.exists():
            target.unlink()
    actual = control._actual_release_files(payload)
    lines = [
        f"{control.sha256_file(path)}  {relative}"
        for relative, path in sorted(actual.items())
        if relative != "metadata/files.sha256"
    ]
    (payload / "metadata" / "files.sha256").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )
    write_deterministic_tar(payload, incoming["artifact"], 1787756400)
    manifest = json.loads(incoming["manifest"].read_text(encoding="utf-8"))
    manifest.pop("capabilities", None)
    manifest["artifact"].pop("files_manifest_sha256", None)
    manifest["artifact"]["sha256"] = sha256_file(incoming["artifact"])
    manifest["artifact"]["size_bytes"] = incoming["artifact"].stat().st_size
    incoming["manifest"].write_text(
        json.dumps(manifest, sort_keys=True) + "\n", encoding="utf-8"
    )
    incoming["checksum"].write_text(
        f"{manifest['artifact']['sha256']}  {incoming['artifact'].name}\n",
        encoding="utf-8",
    )
    control.stage_release(SHA_A)
    new_tmp = tmp_path / "new"
    new_tmp.mkdir()
    make_incoming(new_tmp, host, SHA_B)
    control.stage_release(SHA_B)
    control.atomic_release_link(host, "current", SHA_B)
    with LiveServer(host):
        rolled_back = control.rollback_release(SHA_A)
    assert rolled_back["commit"] == SHA_A
    assert control.read_release_link(host, "current") == SHA_A


def test_capability_bearing_release_cannot_be_relabelled_as_legacy(
    host: Path, tmp_path: Path
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    manifest_path = host / "releases" / SHA_A / "metadata" / "release-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.pop("capabilities")
    manifest["artifact"].pop("files_manifest_sha256")
    manifest_path.write_text(json.dumps(manifest, sort_keys=True) + "\n", encoding="utf-8")
    with pytest.raises(control.ReleaseError, match="manifest/source capabilities diverge"):
        control.verify_release_envelope_and_tree(host, SHA_A)


def test_runtime_identity_is_derived_from_the_current_immutable_release(
    host: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    control.atomic_release_link(host, "current", SHA_A)
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("RUNTIME_PORT", "18100")
    monkeypatch.setenv("CONFENGE_STORAGE_BACKEND", "filesystem")
    monkeypatch.setenv("CONFENGE_STORAGE_DIR", "/var/lib/confenge-web")
    release, env = runtime_environment(host)
    manifest = json.loads(
        (release / "metadata" / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert env["RUNTIME_RELEASE_SHA"] == SHA_A
    assert env["RUNTIME_PORT"] == "18100"
    assert env["RUNTIME_PUBLIC_ARTIFACT_HASH"] == manifest["public_artifact"]["artifact_hash"]
    assert env["RUNTIME_RELEASE_BUNDLE_HASH"] == manifest["artifact"]["sha256"]


def test_schedule_gate_refuses_double_execution_until_legacy_disablement_is_bound(
    host: Path, tmp_path: Path
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    control.atomic_release_link(host, "current", SHA_A)
    with pytest.raises(control.ReleaseError, match="gate is absent"):
        schedule.validate_gate(host, "search-observation-tick")
    gate_path = host / "shared" / "schedule-cutover.json"
    gate = {
        "schema": "confenge.schedule-cutover/v1",
        "authorized_release_sha": SHA_A,
        "legacy_executor": {
            "netlify_search_observation_disabled": False,
            "disabled_at": "2026-08-26T12:00:00Z",
            "evidence": "netlify-config-evidence",
        },
        "jobs": {"search-observation-tick": True},
    }
    gate_path.write_text(json.dumps(gate) + "\n", encoding="utf-8")
    gate_path.chmod(0o640)
    with pytest.raises(control.ReleaseError, match="disablement is not proven"):
        schedule.validate_gate(host, "search-observation-tick")
    gate["legacy_executor"]["netlify_search_observation_disabled"] = True
    gate_path.write_text(json.dumps(gate) + "\n", encoding="utf-8")
    assert schedule.validate_gate(host, "search-observation-tick")["authorized_release_sha"] == SHA_A


def test_retention_gate_and_runner_are_sha_bound_without_a_legacy_executor(
    host: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    control.atomic_release_link(host, "current", SHA_A)
    gate_path = host / "shared" / "schedule-cutover.json"
    gate = {
        "schema": "confenge.schedule-cutover/v1",
        "authorized_release_sha": SHA_A,
        "jobs": {"storage-retention": True},
    }
    gate_path.write_text(json.dumps(gate) + "\n", encoding="utf-8")
    gate_path.chmod(0o640)
    assert schedule.validate_gate(host, "storage-retention")["authorized_release_sha"] == SHA_A
    monkeypatch.setattr(schedule, "expected_gate_gid", lambda: os.getgid() + 1)
    with pytest.raises(control.ReleaseError, match="confenge-web group-owned"):
        schedule.validate_gate(host, "storage-retention")
    monkeypatch.setattr(schedule, "expected_gate_gid", os.getgid)

    observed: dict[str, object] = {}

    def fake_run(command, **kwargs):
        observed.update({"command": command, **kwargs})
        return subprocess.CompletedProcess(command, 2)

    monkeypatch.setattr(schedule.subprocess, "run", fake_run)
    release = host / "releases" / SHA_A
    _, gate_descriptor = schedule.open_validated_gate(host, "storage-retention")
    lock_descriptor = schedule.acquire_job_lock(host, "storage-retention")
    try:
        with control.deploy_lock(host) as deploy_descriptor:
            assert schedule.run_retention(
                host,
                release,
                {"CONFENGE_STORAGE_DIR": "/var/lib/confenge-web"},
                gate_descriptor,
                lock_descriptor,
                deploy_descriptor,
            ) == 2
    finally:
        os.close(gate_descriptor)
        os.close(lock_descriptor)
    assert observed["command"] == [
        "node",
        str(release / "scripts" / "storage" / "retention.mjs"),
        "--store",
        "/var/lib/confenge-web",
        "--apply",
        "--authority-fd",
        str(gate_descriptor),
        "--lock-fd",
        str(lock_descriptor),
        "--deploy-lock-fd",
        str(deploy_descriptor),
        "--release-root",
        str(host),
        "--release-sha",
        SHA_A,
    ]
    assert observed["cwd"] == release
    assert observed["check"] is False
    assert observed["pass_fds"] == (gate_descriptor, lock_descriptor, deploy_descriptor)
    assert "CONFENGE_RETENTION_APPLY_AUTHORITY" not in observed["env"]
    with pytest.raises(control.ReleaseError, match="path must match"):
        schedule.run_retention(
            host,
            release,
            {"CONFENGE_STORAGE_DIR": "/tmp/not-authoritative"},
            gate_descriptor,
            lock_descriptor,
            deploy_descriptor,
        )

    gate["authorized_release_sha"] = SHA_B
    gate_path.write_text(json.dumps(gate) + "\n", encoding="utf-8")
    with pytest.raises(control.ReleaseError, match="authorization is not proven"):
        schedule.validate_gate(host, "storage-retention")
    gate_path.chmod(0o644)
    with pytest.raises(control.ReleaseError, match="permissions must be 0640"):
        schedule.validate_gate(host, "storage-retention")
    gate_path.unlink()
    target = host / "gate-target.json"
    target.write_text(json.dumps(gate) + "\n", encoding="utf-8")
    target.chmod(0o640)
    gate_path.symlink_to(target)
    with pytest.raises(control.ReleaseError, match="gate is absent"):
        schedule.validate_gate(host, "storage-retention")


def test_schedule_runner_refuses_release_flip_after_gate_validation(
    host: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    called = False

    monkeypatch.setattr(
        schedule,
        "open_validated_gate",
        lambda _root, _job: ({"authorized_release_sha": SHA_A}, os.open("/dev/null", os.O_RDONLY)),
    )
    monkeypatch.setattr(
        schedule,
        "runtime_environment",
        lambda _root: (
            host / "releases" / SHA_B,
            {"CONFENGE_STORAGE_DIR": "/var/lib/confenge-web"},
        ),
    )

    def fake_run_retention(*_args: object) -> int:
        nonlocal called
        called = True
        return 0

    monkeypatch.setattr(schedule, "run_retention", fake_run_retention)

    assert schedule.main(["storage-retention"]) == 78
    assert called is False


def test_schedule_gate_rejects_non_object_json(host: Path) -> None:
    shared = host / "shared"
    shared.mkdir(parents=True)
    gate_path = shared / "schedule-cutover.json"
    gate_path.write_text("[]\n", encoding="utf-8")
    gate_path.chmod(0o640)

    with pytest.raises(control.ReleaseError, match="gate is invalid"):
        schedule.validate_gate(host, "storage-retention")


def test_retention_lock_is_exclusive_and_non_blocking(host: Path) -> None:
    (host / "shared").mkdir(parents=True)
    first = schedule.acquire_job_lock(host, "storage-retention")
    try:
        with pytest.raises(control.ReleaseError, match="lock is already held"):
            schedule.acquire_job_lock(host, "storage-retention")
    finally:
        os.close(first)
    second = schedule.acquire_job_lock(host, "storage-retention")
    os.close(second)


def test_short_sha_is_rejected(host: Path) -> None:
    with pytest.raises(control.ReleaseError, match="exactly 40"):
        control.stage_release("abc123")


def test_checksum_invalid_is_rejected(host: Path, tmp_path: Path) -> None:
    incoming = make_incoming(tmp_path, host, SHA_A)
    with incoming["artifact"].open("ab") as handle:
        handle.write(b"corruption")
    with pytest.raises(control.ReleaseError, match="checksum mismatch"):
        control.stage_release(SHA_A)
    assert not (host / "releases" / SHA_A).exists()


def test_sha_mismatch_is_rejected(host: Path, tmp_path: Path) -> None:
    incoming = make_incoming(tmp_path, host, SHA_A)
    manifest = json.loads(incoming["manifest"].read_text(encoding="utf-8"))
    manifest["commit"] = SHA_B
    incoming["manifest"].write_text(json.dumps(manifest) + "\n", encoding="utf-8")
    with pytest.raises(control.ReleaseError, match="repo/SHA mismatch"):
        control.stage_release(SHA_A)


def test_promote_is_atomic_and_live_identity_matches(
    host: Path, tmp_path: Path
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    with LiveServer(host):
        control.promote_release(SHA_A)
        assert (host / "current").is_symlink()
        assert control.read_release_link(host, "current") == SHA_A
        with urllib.request.urlopen(
            os.environ["CONFENGE_LOCAL_ORIGIN"] + "/.well-known/build-info.json"
        ) as response:
            assert json.load(response)["commit"] == SHA_A


def test_concurrent_promote_is_refused_by_host_lock(host: Path) -> None:
    control.ensure_layout(host)
    with (
        control.deploy_lock(host),
        pytest.raises(control.ReleaseError, match="deploy lock busy"),
    ):
        control.promote_release(SHA_A)


def test_rollback_and_previous_release_preserved(host: Path, tmp_path: Path) -> None:
    make_incoming(tmp_path, host, SHA_A)
    make_incoming(tmp_path, host, SHA_B)
    control.stage_release(SHA_A)
    control.stage_release(SHA_B)
    with LiveServer(host):
        control.promote_release(SHA_A)
        control.promote_release(SHA_B)
        assert (host / "releases" / SHA_A).is_dir()
        assert control.read_release_link(host, "rollback") == SHA_A
        control.rollback_release(SHA_A)
        assert control.read_release_link(host, "current") == SHA_A
        assert control.read_release_link(host, "rollback") == SHA_B


def test_promote_rollback_and_idempotent_switch_always_reload_nginx(
    host: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    make_incoming(tmp_path, host, SHA_B)
    control.stage_release(SHA_A)
    control.stage_release(SHA_B)
    reloads = {"n": 0}

    def reload_nginx() -> None:
        reloads["n"] += 1

    monkeypatch.setattr(control, "nginx_reload", reload_nginx)
    with LiveServer(host):
        control.promote_release(SHA_A)
        control.promote_release(SHA_B)
        control.rollback_release(SHA_A)
        control.promote_release(SHA_A)
    assert reloads["n"] == 4


def test_rollback_to_missing_sha_fails(host: Path) -> None:
    with pytest.raises(control.ReleaseError, match="does not exist"):
        control.rollback_release(SHA_C)


def test_prune_preserves_current_rollback_and_n_previous(
    host: Path, tmp_path: Path
) -> None:
    shas = [f"{value:040x}" for value in range(1, 7)]
    for index, sha in enumerate(shas):
        make_incoming(tmp_path / str(index), host, sha)
        control.stage_release(sha)
        os.utime(host / "releases" / sha, ns=(index + 1, index + 1))
    with LiveServer(host):
        control.promote_release(shas[0])
        control.promote_release(shas[1])
    removed = control.prune_releases(keep=1)
    assert shas[1] not in removed
    assert shas[0] not in removed
    assert shas[-1] not in removed
    assert (host / "releases" / shas[1]).is_dir()
    assert (host / "releases" / shas[0]).is_dir()
    assert len(removed) == 3


def test_symlink_escape_is_rejected(host: Path, tmp_path: Path) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    (host / "outside").mkdir()
    (host / "current").symlink_to(host / "outside")
    with pytest.raises(control.ReleaseError, match="escapes"):
        control.promote_release(SHA_A)
    assert (host / "current").resolve() == (host / "outside").resolve()


def test_interrupted_stage_is_cleaned_and_retried(host: Path, tmp_path: Path) -> None:
    make_incoming(tmp_path, host, SHA_A)
    interrupted = host / "releases" / f".stage-{SHA_A}-interrupted"
    interrupted.mkdir(parents=True)
    (interrupted / "partial").write_text("partial", encoding="utf-8")
    control.stage_release(SHA_A)
    assert not interrupted.exists()
    assert (host / "releases" / SHA_A).is_dir()


def test_run_scoped_upload_is_atomically_adopted(host: Path, tmp_path: Path) -> None:
    make_incoming(tmp_path, host, SHA_A)
    fixed = host / "incoming" / SHA_A
    upload = host / "incoming" / f".upload-{SHA_A}-1234-1"
    fixed.rename(upload)
    control.stage_release(SHA_A, upload)
    assert fixed.is_dir()
    assert not upload.exists()
    assert (host / "releases" / SHA_A).is_dir()


def test_preexisting_divergent_release_is_rejected(host: Path, tmp_path: Path) -> None:
    make_incoming(tmp_path, host, SHA_A)
    control.stage_release(SHA_A)
    (host / "releases" / SHA_A / "_site" / "index.html").write_text(
        "divergent", encoding="utf-8"
    )
    with pytest.raises(control.ReleaseError, match="checksum mismatch"):
        control.stage_release(SHA_A)


def test_failed_post_swap_check_restores_previous(
    host: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    make_incoming(tmp_path, host, SHA_B)
    control.stage_release(SHA_A)
    control.stage_release(SHA_B)
    with LiveServer(host):
        control.promote_release(SHA_A)
        monkeypatch.setenv("CONFENGE_TEST_LIVE_FAIL_SHA", SHA_B)
        with pytest.raises(control.ReleaseError, match="previous release restored"):
            control.promote_release(SHA_B)
        assert control.read_release_link(host, "current") == SHA_A
        control.smoke_live(SHA_A)


def test_failed_evidence_write_after_swap_restores_previous(
    host: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_incoming(tmp_path, host, SHA_A)
    make_incoming(tmp_path, host, SHA_B)
    control.stage_release(SHA_A)
    control.stage_release(SHA_B)
    with LiveServer(host):
        control.promote_release(SHA_A)
        original_append = control.append_evidence

        def fail_promoted(root: Path, event: str, sha: str, **details: object) -> None:
            if event == "PROMOTED" and sha == SHA_B:
                raise OSError("test-injected evidence write failure")
            original_append(root, event, sha, **details)

        monkeypatch.setattr(control, "append_evidence", fail_promoted)
        with pytest.raises(control.ReleaseError, match="previous release restored"):
            control.promote_release(SHA_B)
        assert control.read_release_link(host, "current") == SHA_A
        control.smoke_live(SHA_A)


def test_same_inputs_produce_identical_tarball(tmp_path: Path) -> None:
    site = make_site(tmp_path, SHA_A)
    kwargs = {
        "repo_root": REPO_ROOT,
        "site": site,
        "host_contract": make_host_contract(tmp_path),
        "sha": SHA_A,
        "node_version": "v22.19.0",
        "python_version": "3.12.10",
        "ci_run_id": "1234",
        "ci_run_url": "https://github.com/tjsasakifln/web-cfg/actions/runs/1234",
        "source_date_epoch": 1787756400,
    }
    first = build_release(output_dir=tmp_path / "first", **kwargs)
    second = build_release(output_dir=tmp_path / "second", **kwargs)
    assert first["artifact"].read_bytes() == second["artifact"].read_bytes()
    assert sha256_file(first["artifact"]) == sha256_file(second["artifact"])
    with tarfile.open(first["artifact"], "r:gz") as archive:
        names = archive.getnames()
    assert not any("__pycache__" in name or name.endswith(".pyc") for name in names)
    assert all(not name.startswith((".git", "node_modules")) for name in names)
    for required in (
        "_site/index.html",
        "runtime/server.mjs",
        "runtime/contract.json",
        "netlify/functions/lead.cjs",
        "data/revops/closed-loop-funnel.v1.json",
        "data/nurture/tracks.json",
        "data/site/editorial-policy.json",
        "data/bofu-dominance/core/gsc-live-overlay.v1.json",
        "data/offers/flags.json",
        "data/offers/catalog.snapshot.json",
        "data/offers/provider-mapping.json",
        "nginx/generated/headers.generated.conf",
        "nginx/generated/redirects.generated.conf",
        "nginx/generated/runtime-upstream.generated.conf",
        "nginx/generated/runtime-locations.generated.conf",
        "nginx/generated/locations.generated.conf",
        "ops/bin/stage-release",
        "ops/bin/verify-release",
        "ops/bin/promote-release",
        "ops/bin/rollback",
        "scripts/storage/lib.cjs",
        "scripts/storage/retention.mjs",
        "schedules/confenge-web-retention.service",
        "schedules/confenge-web-retention.timer",
        "schedules/confenge-web-retention-alert@.service",
        "schedules/confenge-web-schedule@.service",
        "schedules/confenge-web-search-observation.timer",
        "schedules/schedule-contract.json",
        "nginx/confenge-web-http.conf",
        "nginx/confenge-web-origin.conf",
        "nginx/confenge-web-public.conf",
        "nginx/confenge-web-logrotate",
    ):
        assert required in names


# systemd returns from `restart` as soon as it has spawned a Type=simple unit, so
# the runtime has not bound its socket yet. Asserting identity immediately made
# every promote a race: the first connection was refused, the switch was declared
# failed, and the automatic rollback then failed the same way against the same
# not-yet-listening process. Observed in production:
#   PROMOTED_FAILED_AFTER_SWAP  ... Connection refused
#   AUTO_ROLLBACK_FAILED
# while the runtime logged runtime_listening 300ms later and served 200s.

def test_runtime_readiness_waits_through_connection_refused(monkeypatch):
    attempts = {"n": 0}

    def flaky(url, host_header=None):
        attempts["n"] += 1
        if attempts["n"] < 3:
            err = control.ReleaseError(f"smoke request failed for {url}: refused")
            raise err from ConnectionRefusedError(111, "Connection refused")
        return {"release_sha": "abc"}

    monkeypatch.setattr(control, "_http_get_json", flaky)
    monkeypatch.setattr(control, "RUNTIME_READY_POLL_SECONDS", 0)
    identity = control._await_runtime_identity("127.0.0.1", 18100, timeout=5)
    assert identity == {"release_sha": "abc"}
    assert attempts["n"] == 3


def test_runtime_readiness_gives_up_at_the_deadline(monkeypatch):
    def always_refused(url, host_header=None):
        raise control.ReleaseError("smoke request failed") from ConnectionRefusedError(111, "refused")

    monkeypatch.setattr(control, "_http_get_json", always_refused)
    monkeypatch.setattr(control, "RUNTIME_READY_POLL_SECONDS", 0)
    with pytest.raises(control.ReleaseError, match="did not become reachable"):
        control._await_runtime_identity("127.0.0.1", 18100, timeout=0.01)


def test_an_http_error_is_never_masked_by_waiting(monkeypatch):
    """HTTPError is a URLError subclass, but it is an answered request."""
    calls = {"n": 0}

    def bad_status(url, host_header=None):
        calls["n"] += 1
        error = urllib.error.HTTPError(url, 503, "unavailable", {}, None)
        raise control.ReleaseError("smoke request failed: HTTP 503") from error

    monkeypatch.setattr(control, "_http_get_json", bad_status)
    monkeypatch.setattr(control, "RUNTIME_READY_POLL_SECONDS", 0)
    with pytest.raises(control.ReleaseError, match="HTTP 503"):
        control._await_runtime_identity("127.0.0.1", 18100, timeout=5)
    assert calls["n"] == 1, "an answered non-200 response must not be retried"


@pytest.mark.parametrize(
    ("message", "cause"),
    [
        ("smoke returned invalid JSON", json.JSONDecodeError("invalid", "{", 1)),
        ("smoke returned non-object JSON", None),
    ],
)
def test_an_invalid_runtime_body_is_never_masked_by_waiting(
    monkeypatch, message, cause
):
    calls = {"n": 0}

    def invalid_body(url, host_header=None):
        calls["n"] += 1
        error = control.ReleaseError(message)
        if cause is None:
            raise error
        raise error from cause

    monkeypatch.setattr(control, "_http_get_json", invalid_body)
    monkeypatch.setattr(control, "RUNTIME_READY_POLL_SECONDS", 0)
    with pytest.raises(control.ReleaseError, match=message):
        control._await_runtime_identity("127.0.0.1", 18100, timeout=5)
    assert calls["n"] == 1, "an answered invalid body must not be retried"


def test_a_wrong_runtime_identity_is_never_masked_by_waiting(monkeypatch):
    calls = {"n": 0}

    def wrong_identity(url, host_header=None):
        calls["n"] += 1
        return {
            "release_sha": "wrong",
            "public_artifact_hash": "public",
            "release_bundle_hash": "bundle",
            "host_architecture_version": "architecture",
            "storage_backend": "filesystem",
        }

    manifest = {
        "commit": "expected",
        "host_contract": {
            "runtime_upstream": {"host": "127.0.0.1", "port": 18100}
        },
        "public_artifact": {"artifact_hash": "public"},
        "artifact": {"sha256": "bundle"},
        "contract_versions": {"host_architecture": "architecture"},
    }
    monkeypatch.delenv("CONFENGE_RELEASE_TEST_MODE", raising=False)
    monkeypatch.setattr(control, "_http_get_json", wrong_identity)
    monkeypatch.setattr(control, "RUNTIME_READY_POLL_SECONDS", 0)
    with pytest.raises(control.ReleaseError, match="runtime identity mismatch"):
        control.smoke_runtime(manifest)
    assert calls["n"] == 1, "a reachable runtime with wrong identity must fail once"
