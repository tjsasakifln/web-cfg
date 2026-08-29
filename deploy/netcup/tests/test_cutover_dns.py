"""The DNS cutover is the one globally visible, non-transactional step.

These tests pin what it may and may not write. The zone that carries the public
web records also carries the company's mail: MX, SPF and three DKIM CNAMEs. A
cutover that rewrites one of those is worse than one that never happens.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_loader(
    "cutover_dns",
    loader=None,
)
_MODULE_PATH = Path(__file__).resolve().parents[1] / "bin" / "cutover-dns"
_NAMESPACE: dict = {"__name__": "cutover_dns", "__file__": str(_MODULE_PATH)}
exec(compile(_MODULE_PATH.read_text(encoding="utf-8"), str(_MODULE_PATH), "exec"), _NAMESPACE)  # noqa: S102

build_plan = _NAMESPACE["build_plan"]
apply_plan = _NAMESPACE["apply_plan"]
verify = _NAMESPACE["verify"]
protected_snapshot = _NAMESPACE["_protected_snapshot"]
CutoverError = _NAMESPACE["CutoverError"]
CUTOVER_TTL = _NAMESPACE["CUTOVER_TTL"]
PROXIED_TTL = _NAMESPACE["PROXIED_TTL"]


def _record(
    rid: str,
    rtype: str,
    name: str,
    content: str,
    *,
    ttl: int = CUTOVER_TTL,
    proxied: bool = False,
) -> dict:
    return {
        "id": rid,
        "type": rtype,
        "name": name,
        "content": content,
        "ttl": ttl,
        "proxied": proxied,
    }


def live_zone() -> list[dict]:
    """The real zone shape at the time of the cutover, mail included."""
    return [
        _record("apex-a1", "A", "confenge.com.br", "75.2.60.5"),
        _record("apex-a2", "A", "confenge.com.br", "99.83.231.61"),
        _record("www", "CNAME", "www.confenge.com.br", "confenge.netlify.app"),
        _record("api", "A", "api.confenge.com.br", "159.195.18.88"),
        _record("ops", "A", "ops.confenge.com.br", "159.195.18.88"),
        _record("authops", "A", "auth.ops.confenge.com.br", "159.195.18.88"),
        _record("mx1", "MX", "confenge.com.br", "mx1.hostinger.com"),
        _record("mx2", "MX", "confenge.com.br", "mx2.hostinger.com"),
        _record("spf", "TXT", "confenge.com.br", '"v=spf1 include:_spf.mail.hostinger.com ~all"'),
        _record("dmarc", "TXT", "_dmarc.confenge.com.br", '"v=DMARC1; p=none"'),
        _record("dkim-a", "CNAME", "hostingermail-a._domainkey.confenge.com.br", "hostingermail-a.dkim.mail.hostinger.com"),
        _record("dkim-b", "CNAME", "hostingermail-b._domainkey.confenge.com.br", "hostingermail-b.dkim.mail.hostinger.com"),
        _record("dkim-c", "CNAME", "hostingermail-c._domainkey.confenge.com.br", "hostingermail-c.dkim.mail.hostinger.com"),
        _record("sendmx", "MX", "send.confenge.com.br", "feedback-smtp.sa-east-1.amazonses.com"),
        _record("sendspf", "TXT", "send.confenge.com.br", '"v=spf1 include:amazonses.com ~all"'),
    ]


def _written(plan) -> list[dict]:
    """Every record the plan will write: created outright or replaced in place."""
    return [*plan["create"], *(plan.get("update") or [])]


def test_plan_moves_only_the_two_public_web_names():
    plan = build_plan(live_zone(), "netcup")
    touched = {row["name"] for row in [*plan["delete"], *_written(plan)]}
    assert touched == {"confenge.com.br", "www.confenge.com.br"}


def test_apex_mail_survives_the_cutover():
    plan = build_plan(live_zone(), "netcup")
    touched_ids = {row.get("id") for row in plan["delete"]}
    for mail_id in (
        "mx1", "mx2", "spf", "dmarc", "dkim-a", "dkim-b", "dkim-c",
        "sendmx", "sendspf",
    ):
        assert mail_id not in touched_ids, f"{mail_id} must never be rewritten by a web cutover"
    touched_types = {row["type"] for row in [*plan["delete"], *_written(plan)]}
    assert touched_types <= {"A", "AAAA", "CNAME"}


def test_sibling_services_on_the_same_host_are_untouched():
    plan = build_plan(live_zone(), "netcup")
    touched_ids = {row.get("id") for row in plan["delete"]}
    for service in ("api", "ops", "authops"):
        assert service not in touched_ids


def test_plan_points_the_public_surface_at_the_netcup_origin():
    plan = build_plan(live_zone(), "netcup")
    written = {(row["name"], row["type"], row["content"]) for row in _written(plan)}
    assert ("confenge.com.br", "A", "159.195.18.88") in written
    assert ("www.confenge.com.br", "CNAME", "confenge.com.br") in written
    assert plan["proxied"] is True
    assert plan["ttl"] == PROXIED_TTL
    assert all(row["proxied"] is True for row in _written(plan))
    assert all(row["ttl"] == PROXIED_TTL for row in _written(plan))
    # The www CNAME is replaced in place, so only the two apex records are deleted.
    assert len(plan["delete"]) == 2


def test_rollback_is_declared_with_the_pre_change_records():
    plan = build_plan(live_zone(), "netcup")
    restore = {(row["type"], row["content"]) for row in plan["rollback"]["restore"]}
    assert ("A", "75.2.60.5") in restore
    assert ("A", "99.83.231.61") in restore
    assert ("CNAME", "confenge.netlify.app") in restore
    assert "--to netlify" in plan["rollback"]["command"]


def test_rolling_back_restores_netlify_exactly():
    after_cutover = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        _record(
            "new-www",
            "CNAME",
            "www.confenge.com.br",
            "confenge.com.br",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        *[r for r in live_zone() if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    plan = build_plan(after_cutover, "netlify")
    written = {(row["name"], row["type"], row["content"]) for row in _written(plan)}
    assert ("confenge.com.br", "A", "75.2.60.5") in written
    assert ("confenge.com.br", "A", "99.83.231.61") in written
    assert ("www.confenge.com.br", "CNAME", "confenge.netlify.app") in written
    assert plan["proxied"] is False
    assert plan["ttl"] == CUTOVER_TTL
    assert all(row["proxied"] is False for row in _written(plan))
    assert all(row["ttl"] == CUTOVER_TTL for row in _written(plan))


def test_replanning_an_already_cut_zone_is_a_no_op():
    already = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        _record(
            "new-www",
            "CNAME",
            "www.confenge.com.br",
            "confenge.com.br",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        *[r for r in live_zone() if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    plan = build_plan(already, "netcup")
    assert plan["delete"] == []
    assert plan["create"] == []
    assert (plan.get("update") or []) == []


def test_replanning_dns_only_netcup_records_updates_edge_state_in_place():
    dns_only = [
        _record("new-apex", "A", "confenge.com.br", "159.195.18.88"),
        _record("new-www", "CNAME", "www.confenge.com.br", "confenge.com.br"),
        *[r for r in live_zone() if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    plan = build_plan(dns_only, "netcup")
    assert plan["create"] == []
    assert plan["delete"] == []
    assert {row["id"] for row in plan["update"]} == {"new-apex", "new-www"}
    assert all(row["proxied"] is True for row in plan["update"])
    assert all(row["ttl"] == PROXIED_TTL for row in plan["update"])


def test_replanning_proxied_netcup_records_with_explicit_ttl_repairs_ttl_in_place():
    wrong_ttl = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=CUTOVER_TTL,
            proxied=True,
        ),
        _record(
            "new-www",
            "CNAME",
            "www.confenge.com.br",
            "confenge.com.br",
            ttl=CUTOVER_TTL,
            proxied=True,
        ),
        *[r for r in live_zone() if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    plan = build_plan(wrong_ttl, "netcup")
    assert plan["create"] == []
    assert plan["delete"] == []
    assert {row["id"] for row in plan["update"]} == {"new-apex", "new-www"}
    assert all(row["ttl"] == PROXIED_TTL for row in plan["update"])


def test_a_target_outside_the_public_surface_is_refused():
    namespace_targets = _NAMESPACE["TARGETS"]
    namespace_targets["rogue"] = {
        "confenge.com.br": [
            {
                "type": "A",
                "content": "203.0.113.1",
                "ttl": CUTOVER_TTL,
                "proxied": False,
            }
        ],
        "www.confenge.com.br": [
            {
                "type": "CNAME",
                "content": "confenge.com.br",
                "ttl": CUTOVER_TTL,
                "proxied": False,
            }
        ],
        "api.confenge.com.br": [
            {
                "type": "A",
                "content": "203.0.113.1",
                "ttl": CUTOVER_TTL,
                "proxied": False,
            }
        ],
    }
    try:
        with pytest.raises(CutoverError, match="not the public web surface"):
            build_plan(live_zone(), "rogue")
    finally:
        namespace_targets.pop("rogue", None)


def test_an_unknown_destination_is_refused():
    with pytest.raises(CutoverError, match="unknown destination"):
        build_plan(live_zone(), "somewhere-else")


def test_cutover_ttl_bounds_the_rollback():
    assert CUTOVER_TTL == 300, "an explicit low TTL bounds how long a rollback takes to propagate"
    assert PROXIED_TTL == 1, "Cloudflare-proxied records must use automatic TTL"


# Cloudflare refuses a second CNAME on a name that already holds one (81053).
# Create-then-delete therefore cannot replace the www CNAME: the create fails,
# the plan aborts having already rewritten the apex, and the zone is left split
# between two hosts. Observed live during the cutover.

def test_replacing_a_cname_is_an_in_place_update_not_a_second_create():
    plan = build_plan(live_zone(), "netcup")
    updates = plan.get("update") or []
    assert len(updates) == 1, f"expected one in-place replacement, got {updates}"
    assert updates[0]["name"] == "www.confenge.com.br"
    assert updates[0]["type"] == "CNAME"
    assert updates[0]["content"] == "confenge.com.br"
    assert updates[0]["id"] == "www", "the existing record is replaced, not duplicated"
    assert all(row["name"] != "www.confenge.com.br" for row in plan["create"])
    assert all(row["name"] != "www.confenge.com.br" for row in plan["delete"])


def test_apply_replaces_the_singleton_cname_with_put_before_apex_changes(monkeypatch):
    calls = []

    def fake_call(token, method, path, payload=None):
        calls.append((method, path, payload))
        if method in {"PUT", "POST"}:
            result = {"id": path.rsplit("/", 1)[-1], **payload}
            return {"success": True, "result": result}
        return {"success": True, "result": {}}

    monkeypatch.setitem(_NAMESPACE, "_call", fake_call)
    applied = apply_plan("sanitized-token", "zone", build_plan(live_zone(), "netcup"))
    assert [method for method, _, _ in calls] == ["PUT", "POST", "DELETE", "DELETE"]
    assert calls[0][1].endswith("/dns_records/www")
    assert calls[0][2]["name"] == "www.confenge.com.br"
    assert calls[0][2]["content"] == "confenge.com.br"
    assert calls[0][2]["proxied"] is True
    assert calls[0][2]["ttl"] == PROXIED_TTL
    assert calls[1][2]["proxied"] is True
    assert calls[1][2]["ttl"] == PROXIED_TTL
    assert all(
        payload is None or payload["name"] in {"confenge.com.br", "www.confenge.com.br"}
        for _, _, payload in calls
    )
    assert len(applied["updated"]) == 1


def test_apex_a_records_still_use_create_before_delete():
    plan = build_plan(live_zone(), "netcup")
    created_apex = [r for r in plan["create"] if r["name"] == "confenge.com.br"]
    deleted_apex = [r for r in plan["delete"] if r["name"] == "confenge.com.br"]
    assert len(created_apex) == 1, "a name that holds only A records may be added to first"
    assert len(deleted_apex) == 2
    assert all(row["type"] == "A" for row in created_apex + deleted_apex)


def test_a_half_applied_zone_converges_on_replan():
    """The live failure left the apex with three A records and the old www CNAME.
    Re-planning from that state must finish the job, not compound it."""
    half = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        *live_zone(),
    ]
    plan = build_plan(half, "netcup")
    assert plan["create"] == [], "the apex target already exists"
    assert len(plan["update"]) == 1 and plan["update"][0]["type"] == "CNAME"
    assert sorted(r["content"] for r in plan["delete"]) == ["75.2.60.5", "99.83.231.61"]


@pytest.mark.parametrize(
    ("ttl", "proxied"),
    [
        pytest.param(CUTOVER_TTL, True, id="explicit-ttl-instead-of-auto"),
        pytest.param(PROXIED_TTL, False, id="dns-only-instead-of-proxied"),
    ],
)
def test_verification_rejects_netcup_edge_policy_drift(monkeypatch, ttl, proxied):
    current = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=ttl,
            proxied=proxied,
        ),
        _record(
            "new-www",
            "CNAME",
            "www.confenge.com.br",
            "confenge.com.br",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
    ]
    monkeypatch.setitem(_NAMESPACE, "records", lambda token, zone: current)
    result = verify("sanitized-token", "zone", "netcup")
    assert result["ok"] is False
    assert any(problem.startswith("confenge.com.br:") for problem in result["problems"])


def test_post_apply_verification_requires_the_exact_protected_snapshot(monkeypatch):
    before = live_zone()
    after = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        _record(
            "www",
            "CNAME",
            "www.confenge.com.br",
            "confenge.com.br",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        *[r for r in before if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    monkeypatch.setitem(_NAMESPACE, "records", lambda token, zone: after)
    result = verify("sanitized-token", "zone", "netcup", protected_snapshot(before))
    assert result["ok"] is True
    assert result["protected_unchanged"] is True


def test_post_apply_verification_fails_if_mail_or_a_sibling_changes(monkeypatch):
    before = live_zone()
    after = [
        _record(
            "new-apex",
            "A",
            "confenge.com.br",
            "159.195.18.88",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        _record(
            "www",
            "CNAME",
            "www.confenge.com.br",
            "confenge.com.br",
            ttl=PROXIED_TTL,
            proxied=True,
        ),
        *[
            r for r in before
            if r["id"] not in {
                "apex-a1", "apex-a2", "www", "mx1", "dkim-b", "sendspf", "api"
            }
        ],
    ]
    monkeypatch.setitem(_NAMESPACE, "records", lambda token, zone: after)
    result = verify("sanitized-token", "zone", "netcup", protected_snapshot(before))
    assert result["ok"] is False
    assert result["protected_unchanged"] is False
    assert "protected DNS changed" in result["problems"][0]
