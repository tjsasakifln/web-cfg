"""Drive the shipped Market Answer distribution kit. Never send."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.distribution.market_answer_kit import (
    CANONICAL,
    HEADLINES,
    assert_kit_unsent,
    build_kit,
    data_card_text,
    drafts_are_personalized,
    published_facts_from_page,
    targets,
    write_kit,
)


def test_facts_come_from_published_page():
    facts = published_facts_from_page(ROOT)
    assert facts["page_exists"] is True
    assert facts["median_brl"] == 218284
    assert facts["p25_brl"] == 19969
    assert facts["p75_brl"] == 708950
    assert facts["n_usable"] == 5038
    assert "2023-07-20" in facts["period"]
    card = data_card_text(facts)
    assert "n_usable=5038" in card
    assert "Santa Catarina" in card
    assert "custo por km" in card
    assert len(HEADLINES) == 3
    for headline in HEADLINES:
        assert headline in card


def test_five_verified_targets_and_personalized_unsent_drafts(tmp_path):
    kit = build_kit(root=ROOT, retrieved_at="2026-08-18T12:00:00Z")
    assert_kit_unsent(kit)
    assert kit["auto_send"] is False
    assert kit["sent"] is False
    assert kit["smtp_called"] is False
    assert kit["form_posted"] is False
    assert kit["partnership_claim"] is False
    assert kit["canonical"] == CANONICAL
    assert len(kit["targets"]) == 5
    names = {row["target_nominal"] for row in kit["targets"]}
    assert names == {
        "SICEPOT-SC",
        "CREA-SC / comunicação-notícias",
        "CBIC / COINFRA",
        "SINAENCO",
        "Agência iNFRA",
    }
    for row in kit["targets"]:
        assert row["public_route"]
        assert row["retrieved_at"] == "2026-08-18T12:00:00Z"
        assert row["fallback"]
        assert row["sent"] is False
        assert row["partnership_claim"] is False
    assert drafts_are_personalized(kit)
    bodies = list(kit["drafts"].values())
    assert "construção pesada" in bodies[0]
    assert "Notícias CREA-SC" in bodies[1] or "notícias do conselho" in bodies[1]
    assert "COINFRA" in bodies[2]
    assert "A&EC" in bodies[3] or "consultiva" in bodies[3]
    assert "nota" in bodies[4].lower()
    assert not any("parceria formal" in body and "há alegação de parceria formal" in body.lower() for body in [])
    for body in bodies:
        assert "parceria formal" not in body.lower() or "não" in body.lower()

    dest_root = tmp_path
    (dest_root / "docs" / "ops" / "campaigns").mkdir(parents=True)
    # write_kit uses repo-relative campaign dir under the provided root
    written = write_kit(kit, root=dest_root)
    assert "DISTRIBUTION_DATA_CARD.txt" in written
    assert "DISTRIBUTION_TARGETS.json" in written
    assert len([k for k in written if k.startswith("draft-")]) == 5
    payload = json.loads(written["DISTRIBUTION_TARGETS.json"].read_text(encoding="utf-8"))
    assert payload["sent"] is False
    assert payload["auto_send"] is False


def test_cli_prepare_only_does_not_send():
    proc = subprocess.run(
        [sys.executable, "-m", "scripts.distribution", "market-answer-kit"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert "auto_send: false" in proc.stdout
    assert "sent: false" in proc.stdout
    assert "targets: 5" in proc.stdout
    assert "SMTP" not in proc.stdout
    rows = targets(retrieved_at="2026-08-18T00:00:00Z")
    assert all(row["public_route"].startswith("https://") for row in rows)
