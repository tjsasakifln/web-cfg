"""A presentation recapture must retain the checkpoint whose hashes it replaces."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "recapture_chain_history", ROOT / "docs/campaigns/design-institucional/expansao/tools/recapture_chain.py"
)
CHAIN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHAIN)


def test_previous_checkpoint_and_older_history_survive_hash_replacement():
    older = {"baseline_commit": "a" * 40, "pillars": {"one": "1" * 64}}
    previous = {"baseline_commit": "b" * 40, "previous_baseline_commit": "a" * 40,
                "recaptured_at": "2026-10-03T20:23:36Z", "recapture_reason": "reviewed presentation",
                "pillars": {"one": "2" * 64}, "forbidden": {"one/index.html": "2" * 64},
                "html_mutation": True, "recapture_history": [older]}
    current = {**previous, "pillars": {"one": "3" * 64}, "forbidden": {"one/index.html": "3" * 64}}
    result = CHAIN.frozen_recapture_provenance(previous, current, "c" * 40, "legibility only", "2026-10-04T04:00:00Z")
    assert result["recapture_history"] == [older, {key: value for key, value in previous.items() if key != "recapture_history"}]
    assert result["previous_baseline_commit"] == "b" * 40
    assert result["pillars"] == current["pillars"]
    assert result["baseline_commit"] == "c" * 40
    result["recapture_history"][1]["pillars"]["one"] = "changed"
    assert previous["pillars"]["one"] == "2" * 64


def test_history_does_not_duplicate_an_already_retained_checkpoint():
    checkpoint = {"baseline_commit": "b" * 40, "pillars": {"one": "2" * 64}}
    previous = {**checkpoint, "recapture_history": [checkpoint]}
    result = CHAIN.frozen_recapture_provenance(previous, {"pillars": {"one": "3" * 64}}, "c" * 40, "reviewed", "2026-10-04T04:00:00Z")
    assert result["recapture_history"] == [checkpoint]


def test_changed_binding_preserves_its_immediate_digest_and_updates_provenance(monkeypatch):
    monkeypatch.setattr(CHAIN, "now", lambda: "2026-10-04T04:00:00Z")
    for key in ("expected_sha256", "sha256", "after_sha256"):
        binding = {key: "b" * 64, key + "_previous": "a" * 64,
                   key + "_recaptured_at": "2026-10-03", key + "_recapture_reason": "earlier campaign"}
        checkpoint = dict(binding)
        assert CHAIN.recapture_binding(binding, key, "c" * 64, "legibility only")
        assert binding[key + "_previous"] == "b" * 64
        assert binding[key + "_recaptured_at"] == "2026-10-04T04:00:00Z"
        assert binding[key + "_recapture_reason"] == "legibility only"
        assert binding[key + "_recapture_history"] == [checkpoint]
        unchanged = dict(binding)
        assert not CHAIN.recapture_binding(binding, key, "c" * 64, "another reason")
        assert binding == unchanged
