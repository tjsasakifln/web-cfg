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
CutoverError = _NAMESPACE["CutoverError"]
CUTOVER_TTL = _NAMESPACE["CUTOVER_TTL"]


def _record(rid: str, rtype: str, name: str, content: str) -> dict:
    return {"id": rid, "type": rtype, "name": name, "content": content, "ttl": 1, "proxied": False}


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
        _record("sendmx", "MX", "send.confenge.com.br", "feedback-smtp.sa-east-1.amazonses.com"),
        _record("sendspf", "TXT", "send.confenge.com.br", '"v=spf1 include:amazonses.com ~all"'),
    ]


def test_plan_moves_only_the_two_public_web_names():
    plan = build_plan(live_zone(), "netcup")
    touched = {row["name"] for row in [*plan["delete"], *plan["create"]]}
    assert touched == {"confenge.com.br", "www.confenge.com.br"}


def test_apex_mail_survives_the_cutover():
    plan = build_plan(live_zone(), "netcup")
    touched_ids = {row.get("id") for row in plan["delete"]}
    for mail_id in ("mx1", "mx2", "spf", "dmarc", "dkim-a", "sendmx", "sendspf"):
        assert mail_id not in touched_ids, f"{mail_id} must never be rewritten by a web cutover"
    touched_types = {row["type"] for row in [*plan["delete"], *plan["create"]]}
    assert touched_types <= {"A", "AAAA", "CNAME"}


def test_sibling_services_on_the_same_host_are_untouched():
    plan = build_plan(live_zone(), "netcup")
    touched_ids = {row.get("id") for row in plan["delete"]}
    for service in ("api", "ops", "authops"):
        assert service not in touched_ids


def test_plan_points_the_public_surface_at_the_netcup_origin():
    plan = build_plan(live_zone(), "netcup")
    creates = {(row["name"], row["type"], row["content"]) for row in plan["create"]}
    assert ("confenge.com.br", "A", "159.195.18.88") in creates
    assert ("www.confenge.com.br", "CNAME", "confenge.com.br") in creates
    assert len(plan["delete"]) == 3, "both Netlify apex records and the www CNAME are replaced"


def test_rollback_is_declared_with_the_pre_change_records():
    plan = build_plan(live_zone(), "netcup")
    restore = {(row["type"], row["content"]) for row in plan["rollback"]["restore"]}
    assert ("A", "75.2.60.5") in restore
    assert ("A", "99.83.231.61") in restore
    assert ("CNAME", "confenge.netlify.app") in restore
    assert "--to netlify" in plan["rollback"]["command"]


def test_rolling_back_restores_netlify_exactly():
    after_cutover = [
        _record("new-apex", "A", "confenge.com.br", "159.195.18.88"),
        _record("new-www", "CNAME", "www.confenge.com.br", "confenge.com.br"),
        *[r for r in live_zone() if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    plan = build_plan(after_cutover, "netlify")
    creates = {(row["name"], row["type"], row["content"]) for row in plan["create"]}
    assert ("confenge.com.br", "A", "75.2.60.5") in creates
    assert ("confenge.com.br", "A", "99.83.231.61") in creates
    assert ("www.confenge.com.br", "CNAME", "confenge.netlify.app") in creates


def test_replanning_an_already_cut_zone_is_a_no_op():
    already = [
        _record("new-apex", "A", "confenge.com.br", "159.195.18.88"),
        _record("new-www", "CNAME", "www.confenge.com.br", "confenge.com.br"),
        *[r for r in live_zone() if r["id"] not in {"apex-a1", "apex-a2", "www"}],
    ]
    plan = build_plan(already, "netcup")
    assert plan["delete"] == []
    assert plan["create"] == []


def test_a_target_outside_the_public_surface_is_refused():
    namespace_targets = _NAMESPACE["TARGETS"]
    namespace_targets["rogue"] = {
        "confenge.com.br": [{"type": "A", "content": "203.0.113.1"}],
        "www.confenge.com.br": [{"type": "CNAME", "content": "confenge.com.br"}],
        "api.confenge.com.br": [{"type": "A", "content": "203.0.113.1"}],
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
