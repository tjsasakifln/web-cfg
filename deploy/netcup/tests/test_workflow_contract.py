from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "netcup-release.yml"
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
README = ROOT / "deploy" / "netcup" / "README.md"
NGINX = ROOT / "deploy" / "netcup" / "nginx" / "confenge-web-origin.conf"
NGINX_HTTP = ROOT / "deploy" / "netcup" / "nginx" / "confenge-web-http.conf"
SCHEDULE = ROOT / "deploy" / "netcup" / "schedules" / "schedule-contract.json"


def test_release_reuses_site_ci_and_never_rebuilds() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "uses: ./.github/workflows/site-ci.yml" in text
    assert "export_public_artifact: true" in text
    site_ci = SITE_CI.read_text(encoding="utf-8")
    assert "name: site-ci-public-${{ github.sha }}" in site_ci
    assert "include-hidden-files: true" in site_ci
    assert "npm run build:site" not in text
    assert "Download the exact public artifact exported by site-ci" in text
    assert '--sha "$RELEASE_SHA"' in text
    assert '"$(git rev-parse HEAD)" != "$RELEASE_SHA"' in text
    assert "git diff --quiet" in text and "git diff --cached --quiet" in text


def test_release_is_manual_main_only_and_serialized() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    on_block = text.split("permissions:", 1)[0]
    assert "workflow_dispatch:" in on_block
    assert not re.search(r"(?m)^  push:", on_block)
    assert '"refs/heads/main"' in text
    assert "group: netcup-release-${{ github.repository }}" in text
    assert "cancel-in-progress: false" in text
    assert "environment: netcup-production" in text
    assert "CONFENGE_NETCUP_CUTOVER_APPROVED" in text
    assert "package_only" in text and "stage_verify" in text and "promote" in text


def test_ssh_is_fail_closed_and_known_hosts_is_pinned() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    for name in (
        "NETCUP_DEPLOY_HOST",
        "NETCUP_DEPLOY_USER",
        "NETCUP_SSH_PRIVATE_KEY",
        "NETCUP_SSH_KNOWN_HOSTS",
    ):
        assert f"secrets.{name}" in text
    assert "StrictHostKeyChecking=yes" in text
    assert "StrictHostKeyChecking=no" not in text
    assert "ssh-keygen -F" in text
    assert (
        "/opt/confenge-web/incoming/.upload-$RELEASE_SHA-$CI_RUN_ID-$CI_RUN_ATTEMPT"
        in text
    )
    assert "CI_RUN_ATTEMPT: ${{ github.run_attempt }}" in text
    assert "NETCUP_RELEASE_BLOCKED" in text


def test_artifact_is_checksummed_attested_and_actions_are_pinned() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "sha256sum --check" in text
    assert "actions/attest@" in text
    assert "attestations: write" in text and "id-token: write" in text
    assert "artifact-metadata: write" in text
    assert "retention-days: 30" in text
    pin = re.compile(r"^[0-9a-f]{40}$")
    for action, version in re.findall(r"uses:\s*([^@\s]+)@([^\s#]+)", text):
        if action.startswith("./"):
            continue
        assert pin.fullmatch(version), f"un-pinned action: {action}@{version}"


def test_stage_is_not_promotion_and_public_traffic_is_untouched() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    stage_block = text.split("  stage:", 1)[1].split("  promote:", 1)[0]
    assert "stage-release" in stage_block and "verify-release" in stage_block
    assert "promote-release" not in stage_block
    assert "DNS" not in text.upper()
    assert "netlify.toml" not in text


def test_nginx_contract_is_loopback_only_and_consumes_only_generated_behavior() -> None:
    text = NGINX.read_text(encoding="utf-8")
    http = NGINX_HTTP.read_text(encoding="utf-8")
    assert "listen 127.0.0.1:8088" in text
    assert "server_name confenge.com.br" in text
    for generated in (
        "headers.generated.conf",
        "runtime-upstream.generated.conf",
        "redirects.generated.conf",
        "runtime-locations.generated.conf",
        "locations.generated.conf",
    ):
        assert generated in text + http
    assert "proxy_pass" not in text + http
    assert "_headers" not in text + http and "_redirects" not in text + http


def test_scheduler_is_disabled_and_double_run_gate_is_explicit() -> None:
    text = SCHEDULE.read_text(encoding="utf-8")
    assert '"default_state": "DISABLED"' in text
    assert "schedule-cutover.json" in text
    assert "confenge.schedule-cutover/v1" in text
    assert "netlify_search_observation_disabled=true" in text
    assert '"legacy_active_at_packaging": true' in text
    assert '"netcup_enabled": false' in text
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert "systemctl enable" not in workflow
    assert "CUTOVER_SCHEDULES_AUTHORIZED" not in workflow


def test_runbook_contains_secret_commands_and_operational_evidence() -> None:
    text = README.read_text(encoding="utf-8")
    for name in (
        "NETCUP_DEPLOY_HOST",
        "NETCUP_DEPLOY_USER",
        "NETCUP_SSH_PRIVATE_KEY",
        "NETCUP_SSH_KNOWN_HOSTS",
    ):
        assert f"gh secret set {name}" in text
    for command in (
        "stage-release <FULL_SHA>",
        "verify-release <FULL_SHA>",
        "promote-release <FULL_SHA>",
        "rollback <FULL_SHA>",
        "prune-releases --keep 5",
    ):
        assert command in text
    assert "PROD_TRAFFIC_UNCHANGED" in text
