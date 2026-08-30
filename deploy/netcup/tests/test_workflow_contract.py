from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "netcup-release.yml"
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
PSEO = ROOT / ".github" / "workflows" / "pseo.yml"
README = ROOT / "deploy" / "netcup" / "README.md"
NGINX = ROOT / "deploy" / "netcup" / "nginx" / "confenge-web-origin.conf"
NGINX_HTTP = ROOT / "deploy" / "netcup" / "nginx" / "confenge-web-http.conf"
NGINX_PUBLIC = ROOT / "deploy" / "netcup" / "nginx" / "confenge-web-public.conf"
SCHEDULE = ROOT / "deploy" / "netcup" / "schedules" / "schedule-contract.json"
RETENTION_SERVICE = ROOT / "deploy" / "netcup" / "schedules" / "confenge-web-retention.service"
RETENTION_TIMER = ROOT / "deploy" / "netcup" / "schedules" / "confenge-web-retention.timer"
RETENTION_ALERT = ROOT / "deploy" / "netcup" / "schedules" / "confenge-web-retention-alert@.service"
LOGROTATE = ROOT / "deploy" / "netcup" / "nginx" / "confenge-web-logrotate"


def test_release_reuses_site_ci_and_never_rebuilds() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "uses: ./.github/workflows/site-ci.yml" in text
    assert "uses: ./.github/workflows/pseo.yml" in text
    assert "needs: [gates, pseo_gates]" in text
    pseo = PSEO.read_text(encoding="utf-8")
    assert "workflow_call:" in pseo.split("jobs:", 1)[0]
    assert "export_public_artifact: true" in text
    site_ci = SITE_CI.read_text(encoding="utf-8")
    assert "name: site-ci-public-${{ github.sha }}" in site_ci
    assert "include-hidden-files: true" in site_ci
    assert "npm run build:site" not in text
    assert "Download the exact public artifact exported by site-ci" in text
    assert '--sha "$RELEASE_SHA"' in text
    assert '"$(git rev-parse HEAD)" != "$RELEASE_SHA"' in text
    assert "git diff --quiet" in text and "git diff --cached --quiet" in text


def test_release_tracks_main_automatically_and_manual_dispatch_is_sha_pinned() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    on_block = text.split("permissions:", 1)[0]
    assert re.search(r"(?m)^  push:\n    branches:\n      - main$", on_block)
    assert "workflow_dispatch:" in on_block
    assert "expected_sha:" in on_block
    assert "required: true" in on_block
    assert '"refs/heads/main"' in text
    assert '"$EXPECTED_SHA" != "$RELEASE_SHA"' in text
    assert "github.event_name == 'push'" in text
    assert "github.event_name == 'push' && 'automatic' || 'manual'" in text
    assert "cancel-in-progress: false" in text
    assert "environment: netcup-production" in text
    assert "CONFENGE_NETCUP_CUTOVER_APPROVED" in text
    assert "package_only" in text and "stage_verify" in text and "promote" in text
    assert 'gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main"' in text
    assert '"$current_main_sha" != "$RELEASE_SHA"' in text


def test_ssh_is_fail_closed_and_known_hosts_is_pinned() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    for name in (
        "NETCUP_DEPLOY_HOST",
        "NETCUP_DEPLOY_USER",
        "NETCUP_SSH_PRIVATE_KEY",
        "NETCUP_SSH_KNOWN_HOSTS",
    ):
        assert f"secrets.{name}" in text
    assert "vars.NETCUP_DEPLOY_PORT" in text
    assert 'known_host="[$NETCUP_DEPLOY_HOST]:$NETCUP_DEPLOY_PORT"' in text
    assert '-p "$NETCUP_DEPLOY_PORT"' in text
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


def test_public_redirects_preserve_the_full_hsts_contract() -> None:
    text = NGINX_PUBLIC.read_text(encoding="utf-8")
    hsts = 'Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always'
    assert text.count(hsts) == 2
    assert 'Strict-Transport-Security "max-age=31536000" always' not in text


def test_nginx_access_logs_are_finite_aggregate_classes_without_raw_identifiers() -> None:
    http = NGINX_HTTP.read_text(encoding="utf-8")
    public = NGINX_PUBLIC.read_text(encoding="utf-8")
    origin = NGINX.read_text(encoding="utf-8")
    log_format = http.split("log_format confenge_minimized", 1)[1].split(";", 1)[0]
    variables = set(re.findall(r"\$[a-zA-Z0-9_]+", log_format))
    for forbidden in (
        "$remote_addr",
        "$remote_user",
        "$http_user_agent",
        "$http_referer",
        "$http_cookie",
        "$http_x_forwarded_for",
        "$request",
        "$request_uri",
        "$args",
        "$uri",
        "$host",
        "$request_id",
    ):
        assert forbidden not in variables
    for aggregate in (
        "$confenge_route_class",
        "$confenge_method_class",
        "$confenge_status_class",
        "$confenge_content_class",
        "$request_time",
        "$upstream_response_time",
    ):
        assert aggregate in log_format
    assert public.count("server {") == public.count("access_log /var/log/nginx/confenge-web-access.log confenge_minimized")
    assert origin.count("server {") == origin.count("access_log /var/log/nginx/confenge-web-origin-access.log confenge_minimized")
    assert public.count("error_log /dev/null crit;") == public.count("server {")
    assert origin.count("error_log /dev/null crit;") == origin.count("server {")


def test_nginx_minimized_logs_have_bounded_retention_and_private_permissions() -> None:
    text = LOGROTATE.read_text(encoding="utf-8")
    runbook = README.read_text(encoding="utf-8")
    assert "/var/log/nginx/confenge-web-access.log" in text
    assert "/var/log/nginx/confenge-web-origin-access.log" in text
    for directive in (
        "daily",
        "rotate 14",
        "maxage 14",
        "compress",
        "create 0640 root adm",
        "su root adm",
        "kill -USR1",
    ):
        assert directive in text
    assert "chown root:adm /var/log/nginx/confenge-web-access.log" in runbook
    assert "chmod 0640 /var/log/nginx/confenge-web-access.log" in runbook


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


def test_storage_retention_is_a_single_gated_serialized_systemd_job() -> None:
    contract = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    retention = next(job for job in contract["jobs"] if job["id"] == "storage-retention")
    assert contract["default_state"] == "DISABLED"
    assert retention == {
        "id": "storage-retention",
        "owner": "runtime/storage Netcup",
        "decision_state": "EXECUTE_NOW",
        "leverage": "automation, trust",
        "command": "/opt/confenge-web/bin/run-schedule storage-retention",
        "dry_run_command": "node /opt/confenge-web/current/scripts/storage/retention.mjs --store /var/lib/confenge-web",
        "service": "confenge-web-retention.service",
        "timer": "confenge-web-retention.timer",
        "cadence": "daily at 03:20 America/Sao_Paulo",
        "jitter_seconds": 2700,
        "persistent": True,
        "lock": "/opt/confenge-web/shared/storage-retention.lock (exclusive, non-blocking)",
        "observability": "aggregate JSON on stdout; failures mark the unit failed and emit user.alert via confenge-web-retention-alert@.service",
        "legacy_scheduler": "none",
        "legacy_active_at_packaging": False,
        "activation_gate_required": True,
        "netcup_enabled": False,
    }
    service = RETENTION_SERVICE.read_text(encoding="utf-8")
    timer = RETENTION_TIMER.read_text(encoding="utf-8")
    alert = RETENTION_ALERT.read_text(encoding="utf-8")
    assert "ConditionPathExists=/opt/confenge-web/shared/schedule-cutover.json" in service
    assert "ExecStart=/opt/confenge-web/bin/run-schedule storage-retention" in service
    assert "OnFailure=confenge-web-retention-alert@%n.service" in service
    assert "User=confenge-deploy" in service and "Group=confenge-web" in service
    assert "UMask=0027" in service
    assert "ReadWritePaths=/opt/confenge-web/shared /var/lib/confenge-web" in service
    assert "OnCalendar=*-*-* 03:20:00 America/Sao_Paulo" in timer
    assert "RandomizedDelaySec=2700" in timer
    assert "FixedRandomDelay=true" in timer
    assert "Persistent=true" in timer
    assert "WantedBy=timers.target" in timer
    assert "user.alert" in alert and "retention_schedule_failed" in alert
    generic_service = (ROOT / "deploy" / "netcup" / "schedules" / "confenge-web-schedule@.service").read_text(encoding="utf-8")
    assert "User=confenge-deploy" in generic_service and "Group=confenge-web" in generic_service


def test_runbook_contains_secret_commands_and_operational_evidence() -> None:
    text = README.read_text(encoding="utf-8")
    for name in (
        "NETCUP_DEPLOY_HOST",
        "NETCUP_DEPLOY_USER",
        "NETCUP_SSH_PRIVATE_KEY",
        "NETCUP_SSH_KNOWN_HOSTS",
    ):
        assert f"gh secret set {name}" in text
    assert "gh variable set NETCUP_DEPLOY_PORT" in text
    assert "Every successful push to `main`" in text
    assert "groupadd --system confenge-web" in text
    assert "--gid confenge-web" in text
    assert "-g confenge-deploy" not in text
    for command in (
        "stage-release <FULL_SHA>",
        "verify-release <FULL_SHA>",
        "promote-release <FULL_SHA>",
        "rollback <FULL_SHA>",
        "prune-releases --keep 5",
    ):
        assert command in text
    assert "PRODUCTION_PUBLIC_RUNTIME" in text
    assert "PROD_TRAFFIC_UNCHANGED" not in text
    assert "NETCUP_NGINX_NODE_V2" in text
    assert "docs/architecture/RUNTIME-AUTHORITY.md" in text
    assert "docs/ops/ROLLBACK.md" in text
