from __future__ import annotations

import json
import os
import re
import subprocess
import textwrap
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
    assert "group: netcup-release-${{ github.repository }}\n" in text
    assert "&& 'automatic' || 'manual'" not in text
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
    assert "--operation stage" in stage_block and "--operation verify" in stage_block
    assert "--operation promote" not in stage_block
    assert "run_bundle_control.py" in stage_block
    promote = text.split("  promote:", 1)[1]
    assert "--operation promote" in promote
    assert '--expected-current "$EXPECTED_CURRENT"' in promote
    assert "needs.stage.outputs.expected_current" in promote
    assert "name: netcup-release-${{ github.sha }}" in promote
    assert "/opt/confenge-web/bin/stage-release" not in text
    assert "/opt/confenge-web/bin/promote-release" not in text
    assert "DNS" not in text.upper()
    assert "netlify.toml" not in text


def test_post_promote_reconciles_all_served_html_and_restores_a_failed_release() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    post = text.split("  promote:", 1)[1]
    for required in (
        # Promotion depends on the pre-promotion barrier as well as on staging.
        # Five releases were promoted before they were verified and every one of
        # them was rolled back; `qualify` is what makes the candidate prove
        # itself while it is still a candidate.
        "needs: [stage, qualify]", "environment: netcup-production",
        "name: site-ci-public-${{ github.sha }}", "name: netcup-release-${{ github.sha }}",
        "--operation inventory", "public_server_acceptance.py", "--server-inventory",
        "--site _site", '--expected-sha "$RELEASE_SHA"',
        "runtime_lighthouse_acceptance.mjs", "if-no-files-found: error",
        "steps.atomic_promote.outcome == 'success'", "steps.atomic_promote.outcome == 'failure'",
        '--operation rollback --rollback-target "$PREVIOUS_SHA"',
        "another release is current; refusing to replace it",
        "build/reports/served-public-acceptance/",
    ):
        assert required in post, f"post-promote proof missing {required}"
    assert "continue-on-error" not in post
    assert "python3 -m pytest scripts/site/test_public_server_acceptance.py -q" in SITE_CI.read_text(encoding="utf-8")
    promote_at = post.index("      - name: Atomic promote and live identity confirmation")
    for prerequisite in (
        "actions/checkout@", "actions/setup-node@", "npm ci --ignore-scripts",
        "Require pinned SSH inputs", "Download the same attested controller bundle",
        "Download the same gated public artifact", "Setup Chrome for public runtime verification",
        # The barrier itself, and the evidence it consumes, must be in place
        # before `current` can change.
        "Download this candidate's qualification",
        "release_qualification.mjs --require",
        "Refuse to promote a candidate that is not qualified",
    ):
        assert 0 <= post.index(prerequisite) < promote_at, f"must prepare {prerequisite} before promotion"


def test_recovery_distinguishes_a_material_failure_from_an_accessory_one() -> None:
    """An accepted, healthy release must not be withdrawn by a bookkeeping error.

    Two steps run after acceptance has fully passed: naming the terminal state
    and uploading the evidence. Under a job-wide ``failure()`` alone, either one
    failing — an artifact-service error, throttling, a same-name conflict on a
    re-run — withdrew a release that had just been proven healthy, and repeated
    that on every attempt. Recovery therefore also requires a MATERIAL failure,
    while staying fail-closed: every material step must have SUCCEEDED for
    recovery to be skipped.
    """
    text = WORKFLOW.read_text(encoding="utf-8")
    post = text.split("  promote:", 1)[1]
    restore = post.index("Restore the predecessor after material public acceptance failure")
    condition = post[restore : restore + 1800]
    assert "failure()" in condition, "the broad failure predicate is preserved, not replaced"
    for material in (
        "steps.atomic_promote.outcome != 'success'",
        "steps.served_coverage.outcome != 'success'",
        "steps.runtime_acceptance.outcome != 'success'",
        "steps.accepted_matches_main.outcome != 'success'",
    ):
        assert material in condition, f"recovery must consider {material}"
    # The step it depends on must actually carry that id.
    assert "id: accepted_matches_main" in post

    # A promotion interrupted after the swap never reaches failure().
    assert "Restore the predecessor after a cancelled or timed-out promotion" in post
    assert "cancelled() && steps.atomic_promote.outcome == 'success'" in post
    assert post.count("another release is current; refusing to replace it") == 2, (
        "every recovery path must refuse to replace a newer release"
    )

    # Missing mandatory evidence is diagnosed, not silently uploaded away.
    assert "NETCUP_EVIDENCE_MISSING" in post
    assert "NETCUP_EVIDENCE_INCOMPLETE" in post
    for required in (
        "build/reports/server-inventory-$RELEASE_SHA.json",
        "build/reports/runtime-public-acceptance-$RELEASE_SHA.json",
        "docs/lighthouse-runs/summary-$RELEASE_SHA.json",
    ):
        assert required in post, f"evidence presence must be asserted for {required}"


def test_promotion_requires_a_qualification_bound_to_this_exact_candidate() -> None:
    """A candidate reaches the visitors only with matching, passing evidence.

    The refusal path itself is proved behaviourally in
    scripts/site/test_release_qualification.mjs, including the exit code; what
    is asserted here is that the workflow actually consults it, before the
    promotion and with the identity of this run.
    """
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "  qualify:" in text, "the pre-promotion qualification job must exist"
    qualify = text.split("  qualify:", 1)[1].split("  promote:", 1)[0]
    # The barrier qualifies the exact artifact the release will serve.
    assert "name: site-ci-public-${{ github.sha }}" in qualify
    assert "release_qualification.mjs --emit" in qualify
    assert "--run-id=\"$GITHUB_RUN_ID\"" in qualify
    assert "--run-attempt=\"$GITHUB_RUN_ATTEMPT\"" in qualify
    assert "if-no-files-found: error" in qualify
    # An older committed summary must not be able to fill the gap left by a run
    # that died before writing its own.
    assert "rm -f docs/lighthouse-runs/summary.json" in qualify
    # It must never change production.
    assert "--operation promote" not in qualify
    assert "--operation rollback" not in qualify

    post = text.split("  promote:", 1)[1]
    require_at = post.index("release_qualification.mjs --require")
    promote_at = post.index("      - name: Atomic promote and live identity confirmation")
    assert require_at < promote_at, "the barrier must be consulted before the promotion"
    # `run_attempt` is deliberately NOT bound on the require side: binding it
    # would make "Re-run failed jobs" impossible after a transient SSH or API
    # failure, because the successful qualify job does not re-run while the
    # attempt counter advances. run_id already gives freshness within one run.
    for bound in ('--sha="$RELEASE_SHA"', '--run-id="$GITHUB_RUN_ID"', '--bundle-digest="$bundle_digest"'):
        assert bound in post, f"the barrier must bind {bound}"
    require_block = post[post.index("release_qualification.mjs --require"):][:400]
    assert "--run-attempt" not in require_block, (
        "binding run_attempt removes the re-run recovery path"
    )
    assert post.index("Store mandatory post-promote evidence") < post.index("Restore the predecessor")
    # An unsuccessful idempotent retry must not undo an already-active release.
    # A new promotion with an interrupted SSH response can need compensation;
    # the host expected-current guard still refuses a different active release.
    assert "steps.atomic_promote.outcome == 'failure' && needs.stage.outputs.expected_current != github.sha" in post
    assert "steps.served_coverage.outcome == 'failure'" not in post
    assert 'PREVIOUS_SHA: ${{ needs.stage.outputs.recovery_target }}' in post
    assert '--rollback-target "$PREVIOUS_SHA" --expected-current "$RELEASE_SHA"' in post



def _folded_if_after(text: str, anchor: str) -> str:
    """Return the ``if:`` expression of the step introduced by ``anchor``.

    The condition is a folded block scalar (``>-``) spanning several lines.
    Reading it with PyYAML would add an undeclared dependency to the gate job,
    so it is joined here the way YAML folds it: continuation lines are the ones
    indented deeper than the ``if:`` key, joined with single spaces.
    """
    lines = text[text.index(anchor):].splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith("if:"):
            continue
        inline = stripped[3:].strip()
        if inline and inline not in (">-", ">", "|-", "|"):
            return inline
        key_indent = len(line) - len(line.lstrip())
        folded = []
        for continuation in lines[index + 1:]:
            if not continuation.strip():
                break
            if len(continuation) - len(continuation.lstrip()) <= key_indent:
                break
            folded.append(continuation.strip())
        return " ".join(folded)
    raise AssertionError(f"no if: condition follows {anchor!r}")

def test_compensation_condition_preserves_a_failed_idempotent_retry() -> None:
    """Evaluate the recovery predicate itself, across the states that matter.

    Recovery must fire on every material failure after a swap, and must NOT fire
    because a step that runs after acceptance — naming the terminal state, or
    uploading the evidence — failed for reasons that say nothing about the
    release. It stays fail-closed: a material step that is anything other than
    ``success`` still restores the predecessor.
    """
    condition = _folded_if_after(
        WORKFLOW.read_text(encoding="utf-8"),
        "- name: Restore the predecessor after material public acceptance failure",
    )

    def evaluate(failed, promote_outcome, already_current, coverage, acceptance, matches_main):
        expression = condition.replace("failure()", repr(failed))
        expression = expression.replace("steps.atomic_promote.outcome", repr(promote_outcome))
        expression = expression.replace("steps.served_coverage.outcome", repr(coverage))
        expression = expression.replace("steps.runtime_acceptance.outcome", repr(acceptance))
        expression = expression.replace("steps.accepted_matches_main.outcome", repr(matches_main))
        expression = expression.replace(
            "needs.stage.outputs.expected_current", repr("b" if already_current else "a")
        )
        expression = expression.replace("github.sha", repr("b"))
        expression = expression.replace("&&", " and ").replace("||", " or ")
        return eval(expression, {"__builtins__": {}}, {})  # noqa: S307 - fixed workflow text

    ok = ("success", "success", "success")
    for failed, outcome, already_current, material, expected, why in (
        (True, "failure", True, ok, False, "API/local validation failure, no swap"),
        (True, "failure", False, ok, True, "a new swap may precede a lost SSH reply"),
        (True, "success", True, ("failure", "success", "success"), True, "served HTML diverged"),
        (True, "success", False, ("success", "failure", "success"), True, "public acceptance failed"),
        (True, "success", False, ("success", "success", "failure"), True, "main advanced under us"),
        (True, "success", False, ("success", "skipped", "success"), True, "a material step did not run"),
        (True, "skipped", False, ok, False, "promotion never ran"),
        (False, "success", False, ok, False, "nothing failed"),
        # The defect this predicate exists to prevent: acceptance fully passed
        # and a later bookkeeping step failed. The release stays.
        (True, "success", False, ok, False, "an accessory failure must not withdraw an accepted release"),
    ):
        assert evaluate(failed, outcome, already_current, *material) is expected, why


def test_promotion_rechecks_main_after_the_remote_swap_and_public_acceptance(tmp_path) -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    atomic = workflow.split('- name: Atomic promote and live identity confirmation', 1)[1].split('\n      - name:', 1)[0]
    command = textwrap.dedent(atomic.split('run: |\n', 1)[1])
    assert command.index('promoted_main_sha=') > command.index('--operation promote')
    assert '"$promoted_main_sha" != "$RELEASE_SHA"' in command
    accepted = workflow.split('- name: Confirm accepted release still matches main', 1)[1].split('\n      - name:', 1)[0]
    assert '"$accepted_main_sha" != "$RELEASE_SHA"' in accepted
    assert 'if:' not in accepted and 'continue-on-error:' not in accepted
    assert workflow.index('Verify the served runtime family') < workflow.index('Confirm accepted release still matches main') < workflow.index('Store mandatory post-promote evidence')
    prelude = r'''
gh() {
  if [ -e "$TEST_API_CALLED" ]; then printf '%s\n' "$TEST_MAIN_AFTER";
  else touch "$TEST_API_CALLED"; printf '%s\n' "$TEST_MAIN_BEFORE"; fi
}
python3() { touch "$TEST_PROMOTED"; }
ssh() { :; }
'''
    candidate = 'a' * 40
    newer = 'b' * 40
    for index, (before, after, expected_success, expected_swap) in enumerate((
        (candidate, candidate, True, True),
        (newer, newer, False, False),
        (candidate, newer, False, True),
    )):
        marker = tmp_path / f'promoted-{index}'
        env = {**os.environ, 'RELEASE_SHA': candidate, 'EXPECTED_CURRENT': 'c' * 40,
               'GITHUB_REPOSITORY': 'fixture/example', 'RUNNER_TEMP': str(tmp_path),
               'NETCUP_DEPLOY_PORT': '22', 'NETCUP_DEPLOY_USER': 'fixture', 'NETCUP_DEPLOY_HOST': 'example.invalid',
               'TEST_API_CALLED': str(tmp_path / f'api-{index}'), 'TEST_PROMOTED': str(marker),
               'TEST_MAIN_BEFORE': before, 'TEST_MAIN_AFTER': after}
        result = subprocess.run(['bash', '-c', prelude + command], env=env, capture_output=True, text=True)
        assert (result.returncode == 0) == expected_success, result.stderr
        assert marker.exists() == expected_swap
    final_command = textwrap.dedent(accepted.split('run: |\n', 1)[1])
    for sha, success in ((candidate, True), (newer, False)):
        result = subprocess.run(['bash', '-c', 'gh() { printf "%s\\n" "$TEST_MAIN_AFTER"; }\n' + final_command], env={**os.environ, 'RELEASE_SHA': candidate, 'GITHUB_REPOSITORY': 'fixture/example', 'TEST_MAIN_AFTER': sha}, capture_output=True, text=True)
        assert (result.returncode == 0) == success, result.stderr


def test_recovery_target_uses_the_real_predecessor_on_idempotent_retry(tmp_path) -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    start = workflow.index('          recovery_target="$expected_current"')
    end = workflow.index('          upload=', start)
    actual_script = workflow[start:end]
    old, candidate = "a" * 40, "b" * 40
    cases = (
        (old, f"releases/{candidate}", old, True),
        (candidate, f"releases/{old}", old, True),
        (candidate, f"releases/{candidate}", None, False),
        (candidate, "unsafe/path", None, False),
    )
    for index, (current, rollback, expected, passes) in enumerate(cases):
        output = tmp_path / f"case-{index}.txt"
        script = 'set -euo pipefail\nssh_options=()\ntarget=controlled-fixture\nssh() { printf "%s\\n" "$TEST_ROLLBACK_LINK"; }\n' + actual_script
        result = subprocess.run(["bash", "-c", script], capture_output=True, text=True, env={
            **os.environ, "expected_current": current, "RELEASE_SHA": candidate,
            "TEST_ROLLBACK_LINK": rollback, "GITHUB_OUTPUT": str(output),
        })
        assert (result.returncode == 0) is passes, result.stderr
        if passes:
            assert output.read_text().strip() == f"recovery_target={expected}"
        else:
            assert not output.exists()


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
    assert "ReadWritePaths=/opt/confenge-web/locks /opt/confenge-web/shared /var/lib/confenge-web" in service
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
