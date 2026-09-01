from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from scripts.demand_radar import __main__ as cli


SEALED_SHA = "81c600b7c26dcc606d3a03e648ecd9820d9c1c37"
CURRENT_MAIN_SHA = "f" * 40


def args_for(command: str, ledger: Path, *, origin_main: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(command=command, ledger=ledger, origin_main=origin_main)


def test_check_uses_the_full_sha_sealed_in_the_ledger_not_current_main(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ledger = tmp_path / "ledger.json"
    ledger.write_text(json.dumps({"origin_main": SEALED_SHA}), encoding="utf-8")
    monkeypatch.setattr(cli, "_origin_main", lambda: CURRENT_MAIN_SHA)

    assert cli._resolved_origin_main(args_for("check", ledger)) == SEALED_SHA


def test_build_uses_contemporary_origin_main(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "_origin_main", lambda: CURRENT_MAIN_SHA)

    assert cli._resolved_origin_main(args_for("build", tmp_path / "missing.json")) == CURRENT_MAIN_SHA


def test_explicit_origin_main_overrides_sealed_ledger(tmp_path: Path) -> None:
    ledger = tmp_path / "ledger.json"
    ledger.write_text(json.dumps({"origin_main": SEALED_SHA}), encoding="utf-8")

    assert cli._resolved_origin_main(
        args_for("check", ledger, origin_main=CURRENT_MAIN_SHA)
    ) == CURRENT_MAIN_SHA


def test_explicit_empty_origin_main_fails_closed(tmp_path: Path) -> None:
    ledger = tmp_path / "ledger.json"
    ledger.write_text(json.dumps({"origin_main": SEALED_SHA}), encoding="utf-8")

    with pytest.raises(ValueError, match="origin_main_full_sha_required:--origin-main"):
        cli._resolved_origin_main(args_for("check", ledger, origin_main=""))


@pytest.mark.parametrize("origin_main", ["81c600b", "g" * 40, None])
def test_check_rejects_missing_or_abbreviated_sealed_sha(tmp_path: Path, origin_main: str | None) -> None:
    ledger = tmp_path / "ledger.json"
    ledger.write_text(json.dumps({"origin_main": origin_main}), encoding="utf-8")

    with pytest.raises(ValueError, match="origin_main_full_sha_required"):
        cli._resolved_origin_main(args_for("check", ledger))
