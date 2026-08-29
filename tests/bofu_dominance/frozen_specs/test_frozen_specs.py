"""Drive shipped frozen-spec functions against the real six pillar HTML files."""

from __future__ import annotations

import json
import hashlib
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.bofu_dominance.frozen_specs.constants import (
    EARLIEST_SAFE_ACTION_AT,
    FORBIDDEN_RELATIVE_PATHS,
    PILLAR_SLUGS,
    REQUIRED_SPEC_FIELDS,
    html_path,
    patch_path,
)
from scripts.bofu_dominance.frozen_specs import __main__ as frozen_cli
from scripts.bofu_dominance.frozen_specs.entry import run_entry
from scripts.bofu_dominance.frozen_specs.gate import evaluate_gate, load_issue_state
from scripts.bofu_dominance.frozen_specs.hashing import (
    committed_forbidden_hashes,
    content_sha256,
    forbidden_drift,
    forbidden_drift_policy,
    forbidden_path_hashes,
)
from scripts.bofu_dominance.frozen_specs.patch import apply_frozen_patch, parse_patch
from scripts.bofu_dominance.frozen_specs.snapshot import snapshot_pillar, snapshot_six
from scripts.bofu_dominance.frozen_specs.spec import load_spec, load_specs, validate_spec

FROZEN_NOW = date(2026, 8, 19)
PRE_RECAPTURE = Path(__file__).with_name("fixtures") / "pre-recapture-hashes.json"


def _copy_forbidden_tree(target: Path) -> None:
    for rel in FORBIDDEN_RELATIVE_PATHS:
        source = ROOT / rel
        dest = target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(source.read_bytes())
    baseline = target / "data/bofu-dominance/frozen-specs/hashes.json"
    baseline.parent.mkdir(parents=True, exist_ok=True)
    baseline.write_bytes((ROOT / "data/bofu-dominance/frozen-specs/hashes.json").read_bytes())


def test_six_specs_present_with_required_fields():
    specs = load_specs()
    assert [s["slug"] for s in specs] == list(PILLAR_SLUGS)
    for spec in specs:
        fails = validate_spec(spec)
        assert fails == [], (spec["slug"], fails)
        for field in REQUIRED_SPEC_FIELDS:
            assert field in spec
        snap = spec["snapshot"]
        assert snap["title"]
        assert "meta_description" in snap
        assert snap["h1"]
        assert isinstance(snap["schema_types"], list) and snap["schema_types"]
        assert "canonical" in snap
        assert snap["cta"]
        assert spec["earliest_safe_action_at"] >= "2026-09-16"
        gsc = spec["gsc_precondition"]
        assert gsc["source_kind"] == "LIVE_JOB_OK"
        assert gsc["ready_for_product_decisions"] is False
        assert gsc["authorizes_html_edit"] is False
        assert gsc["other_evidence_decision"]["decision"]
        assert spec["serp_census"]["family"]
        assert spec["serp_census"]["competitors"]
        assert spec["serp_census"]["intent_gaps"]
        assert spec["query_ownership"]
        assert spec["negative_queries"]
        assert "cannibalization" in spec
        assert spec["before_after_blocks"]
        assert spec["evidence_proof_needed"]
        assert spec["success_metrics"]
        assert spec["kill_metrics"]
        assert spec["revert_metrics"]


def test_spec_snapshot_matches_live_html():
    for slug in PILLAR_SLUGS:
        live = snapshot_pillar(slug, ROOT)
        spec = load_spec(slug)
        assert spec["snapshot"]["content_sha256"] == live["content_sha256"]
        assert spec["snapshot"]["title"] == live["title"]
        assert spec["snapshot"]["h1"] == live["h1"]
        assert spec["snapshot"]["canonical"] == live["canonical"]
        assert spec["snapshot"]["meta_description"] == live["meta_description"]
        assert live["content_sha256"] == content_sha256(html_path(slug, ROOT))


def test_patch_txt_hash_equals_live_file_hash():
    for slug in PILLAR_SLUGS:
        parsed = parse_patch(patch_path(slug).read_text(encoding="utf-8"))
        live = content_sha256(html_path(slug, ROOT))
        assert parsed["content_sha256"] == live
        assert parsed["earliest_safe_action_at"] == EARLIEST_SAFE_ACTION_AT.isoformat()
        assert parsed["html_mutation_authorized"] is False
        assert parsed["replacements"]
        result = apply_frozen_patch(
            slug, root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False
        )
        pending = any(item["before"] != item["after"] for item in parsed["replacements"])
        if pending:
            assert result["would_mutate"] is True
        assert result["html_mutation"] is False


def test_apply_refused_before_gate_and_html_mutation_false():
    issue = load_issue_state()
    assert issue["evidential_close"] is False
    assert issue["state"] == "LANDED_AWAITING_LIVE_EVIDENCE"
    gate = evaluate_gate(now=FROZEN_NOW, evidential_close=False)
    assert gate["refused"] is True
    assert gate["apply_refused_before_gate"] is True
    assert gate["html_mutation"] is False
    assert gate["authorizes_html_edit"] is False
    before = forbidden_path_hashes(ROOT)
    for slug in PILLAR_SLUGS:
        result = apply_frozen_patch(
            slug, root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False
        )
        assert result["refused"] is True
        assert result["html_mutation"] is False
        assert result["apply_refused_before_gate"] is True
        assert result["hash_match"] is True
    after = forbidden_path_hashes(ROOT)
    assert after == before


def test_date_or_evidential_close_does_not_bypass_the_unlock_plan():
    by_date = evaluate_gate(now=date(2026, 9, 16), evidential_close=False)
    assert by_date["gate_open"] is False
    assert by_date["reason"] == "unlock_plan_preconditions_not_ready"
    by_issue = evaluate_gate(now=FROZEN_NOW, evidential_close=True)
    assert by_issue["gate_open"] is False
    assert by_issue["reason"] == "before_date"
    result = apply_frozen_patch(
        PILLAR_SLUGS[0],
        root=ROOT,
        mutate=True,
        now=date(2026, 9, 16),
        evidential_close=True,
    )
    assert result["gate_open"] is False
    assert result["refused"] is True
    assert result["reason"] == "before_gate"
    assert result["html_mutation"] is False


def test_ready_plan_still_requires_an_explicitly_authorized_patch():
    unlock_plan = json.loads(
        (ROOT / "data/bofu-dominance/frozen-specs/unlock-plan.v1.json").read_text(
            encoding="utf-8"
        )
    )
    unlock_plan["html_mutation_authorized"] = True
    for item in unlock_plan["preconditions_all_required"]:
        item["state"] = "READY"
    gate = evaluate_gate(
        now=date(2026, 9, 16),
        evidential_close=False,
        unlock_plan=unlock_plan,
    )
    assert gate["gate_open"] is True

    before = content_sha256(html_path(PILLAR_SLUGS[0], ROOT))
    result = apply_frozen_patch(
        PILLAR_SLUGS[0],
        root=ROOT,
        mutate=True,
        now=date(2026, 9, 16),
        unlock_plan=unlock_plan,
    )
    assert result["gate_open"] is True
    assert result["refused"] is True
    assert result["reason"] == "patch_not_authorized"
    assert result["html_mutation"] is False
    assert content_sha256(html_path(PILLAR_SLUGS[0], ROOT)) == before


def test_entry_twice_html_mutation_false():
    first = run_entry(root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False)
    second = run_entry(root=ROOT, mutate=False, now=FROZEN_NOW, evidential_close=False)
    assert first["html_mutation"] is False
    assert second["html_mutation"] is False
    assert first["apply_refused_before_gate"] is True
    assert second["apply_refused_before_gate"] is True
    assert first["forbidden_unchanged"] is True
    assert first["pillar_count"] == 6
    assert all(item["ok"] for item in first["specs"])
    snaps = snapshot_six(ROOT)
    assert len(snaps) == 6


def test_forbidden_paths_unchanged_list():
    baseline = committed_forbidden_hashes(ROOT)
    hashes = forbidden_path_hashes(ROOT)
    assert forbidden_drift(ROOT) == {}
    for rel in FORBIDDEN_RELATIVE_PATHS:
        path = ROOT / rel
        assert path.is_file(), rel
        assert baseline[rel] == hashes[rel] == content_sha256(path)


def test_recapture_provenance_snapshot_matches_baseline_bytes_with_or_without_git():
    payload = json.loads(
        (ROOT / "data/bofu-dominance/frozen-specs/hashes.json").read_text(encoding="utf-8")
    )
    commit = payload["baseline_commit"]
    git_commit = subprocess.run(
        ["git", "-C", str(ROOT), "cat-file", "-e", f"{commit}^{{commit}}"],
        capture_output=True,
        check=False,
    )
    git_checkout = (ROOT / ".git").exists()
    ancestor_pin = False
    if git_checkout and git_commit.returncode == 0:
        ancestor = subprocess.run(
            ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", commit, "HEAD"],
            capture_output=True,
            check=False,
        )
        ancestor_pin = ancestor.returncode == 0
    for rel, expected in payload["forbidden"].items():
        if ancestor_pin:
            # Strongest proof: the pinned commit is reachable, so read the bytes
            # it actually recorded rather than trusting the working tree.
            content = subprocess.check_output(
                ["git", "-C", str(ROOT), "show", f"{commit}:{rel}"]
            )
        else:
            # The pin is unreachable here: either a source archive with no object
            # database, or a squash-merge that discarded the pull-request commit
            # the recapture named. The snapshot stays independently verifiable
            # against the tree it attests, and forbidden_drift() still compares
            # every protected file with this same committed baseline, so drift
            # cannot pass unnoticed either way.
            content = (ROOT / rel).read_bytes()
        assert hashlib.sha256(content).hexdigest() == expected, rel


def test_forbidden_drift_reads_committed_baseline(tmp_path):
    _copy_forbidden_tree(tmp_path)

    protected = tmp_path / FORBIDDEN_RELATIVE_PATHS[0]
    protected.write_bytes(protected.read_bytes() + b"\n<!-- forbidden mutation -->\n")

    drift = forbidden_drift(tmp_path)
    assert list(drift) == [FORBIDDEN_RELATIVE_PATHS[0]]
    assert drift[FORBIDDEN_RELATIVE_PATHS[0]]["baseline"] != drift[FORBIDDEN_RELATIVE_PATHS[0]]["live"]


def test_pre_recapture_fixture_names_collateral_and_nominal_drifts(tmp_path):
    _copy_forbidden_tree(tmp_path)
    baseline = tmp_path / "data/bofu-dominance/frozen-specs/hashes.json"
    baseline.write_bytes(PRE_RECAPTURE.read_bytes())

    expected = {
        "aditivos-obras-publicas/index.html",
        "medicoes-glosas-obras-publicas/index.html",
        "reequilibrio-obras-publicas/index.html",
        "auditoria-orcamento-licitacao/index.html",
        "diagnostico-b2g-360/index.html",
        "diagnostico-pre-licitacao/index.html",
        "script.js",
        "styles.css",
        "styles-tokens.css",
        "styles-tools.css",
        "robots.txt",
        "sitemap.xml",
        "sitemap.txt",
        "sitemap-index.xml",
        "_redirects",
        "data/organic/content-service-map.json",
        "js/modules/analytics.js",
    }
    drift = forbidden_drift(tmp_path)
    assert set(drift) == expected
    assert all(item["baseline"] != item["live"] for item in drift.values())


def test_drift_policy_separates_html_rendering_and_recapture(tmp_path):
    _copy_forbidden_tree(tmp_path)
    mutations = {
        "aditivos-obras-publicas/index.html": ("frozen_html", "error", "revert_frozen_html"),
        "script.js": (
            "rendering_collateral",
            "error",
            "prove_no_frozen_rendering_change_or_revert",
        ),
        "robots.txt": (
            "non_rendering_collateral",
            "recapture_required",
            "commit_reviewed_hash_recapture",
        ),
    }
    for rel in mutations:
        path = tmp_path / rel
        path.write_bytes(path.read_bytes() + b"\n# drift\n")

    policy = forbidden_drift_policy(tmp_path)
    assert set(policy) == set(mutations)
    for rel, expected in mutations.items():
        assert (policy[rel]["category"], policy[rel]["severity"], policy[rel]["action"]) == expected


def test_cli_fails_when_committed_baseline_requires_action(monkeypatch, capsys):
    monkeypatch.setattr(
        frozen_cli,
        "run_entry",
        lambda **_kwargs: {
            "html_mutation": False,
            "forbidden_action_required": True,
            "forbidden_drift": {"robots.txt": {"baseline": "old", "live": "new"}},
        },
    )
    assert frozen_cli.main([]) == 1
    assert '"forbidden_action_required": true' in capsys.readouterr().out


def test_citations_in_specs():
    for spec in load_specs():
        dc = spec["demand_control_citation"]
        assert dc["authorizes_html_edit"] is False
        assert dc["source_kind"] == "LIVE_JOB_OK"
        assert dc["ready_for_product_decisions"] is False
        assert dc["bofu_observe_only"] is True
        assert dc["earliest_safe_action_at"] >= "2026-09-16"
        assert spec["issue_128_baseline"]["commercial_click_share"] == 0.0
        assert spec["issue_128_baseline"]["state"] == "LANDED_AWAITING_LIVE_EVIDENCE"
        extra = spec["extra_cli_inputs"]
        assert extra["publication_authorization"] is False
        assert extra["national_claim_authorized"] is False
        assert extra["pr_435"]["state"] == "COMPARABLE"
        assert extra["pr_437"]["verdict"] == "PARTIAL"


def test_unreachable_baseline_pin_still_fails_closed_on_protected_drift(tmp_path):
    """An unreachable pin must not turn the provenance gate into a no-op.

    Squash-merge discards the pull-request commit a recapture names, so the pin
    can legitimately be unresolvable on main. In that case the snapshot is
    verified against the tree it attests instead — but tampering with a
    protected file must still fail closed.
    """
    _copy_forbidden_tree(tmp_path)
    baseline = {
        "baseline_commit": "0" * 40,
        "forbidden": forbidden_path_hashes(tmp_path),
    }
    protected = tmp_path / FORBIDDEN_RELATIVE_PATHS[0]
    protected.write_bytes(protected.read_bytes() + b"\n<!-- drift -->\n")

    live = forbidden_path_hashes(tmp_path)
    drifted = [
        rel
        for rel, expected in baseline["forbidden"].items()
        if live[rel] != expected
    ]
    assert drifted == [FORBIDDEN_RELATIVE_PATHS[0]], drifted
