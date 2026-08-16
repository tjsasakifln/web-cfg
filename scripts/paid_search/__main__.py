"""CLI: python3 -m scripts.paid_search [score|package|preflight|dry-run]

No mutate, authorize, spend, or Ads API verb exists.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.paid_search.dry_run import dry_run
from scripts.paid_search.family import select_family
from scripts.paid_search.package import build_package, validate_package
from scripts.paid_search.preflight import preflight

DEFAULT_PACKAGE = ROOT / "data" / "paid_search" / "canary.v1.json"
DEFAULT_SCORE = ROOT / "data" / "paid_search" / "family-score.v1.json"


def _dump(doc: Any) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _write(path: Path, doc: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump(doc), encoding="utf-8")


def _load_package(path: Path | None) -> dict[str, Any]:
    target = path or DEFAULT_PACKAGE
    if target.is_file():
        return json.loads(target.read_text(encoding="utf-8"))
    selection = select_family(ROOT)
    return build_package(selection)


def cmd_score(args: argparse.Namespace) -> int:
    selection = select_family(Path(args.root) if args.root else ROOT)
    out = Path(args.out) if args.out else DEFAULT_SCORE
    _write(out, selection)
    print(
        _dump(
            {
                "ok": selection.get("decision") == "SELECTED",
                "decision": selection.get("decision"),
                "family": (selection.get("family") or {}).get("id"),
                "out": str(out),
                "demand_engine": (selection.get("demand_engine") or {}).get("status"),
                "primary_metric": selection.get("primary_metric"),
            }
        ),
        end="",
    )
    return 0 if selection.get("decision") == "SELECTED" else 2


def cmd_package(args: argparse.Namespace) -> int:
    selection = select_family(Path(args.root) if args.root else ROOT)
    package = build_package(selection)
    out = Path(args.out) if args.out else DEFAULT_PACKAGE
    _write(out, package)
    print(
        _dump(
            {
                "ok": package.get("decision") == "SELECTED",
                "decision": package.get("decision"),
                "family": (package.get("family") or {}).get("id"),
                "out": str(out),
                "executable": False,
                "campaign_created": False,
            }
        ),
        end="",
    )
    return 0 if package.get("decision") == "SELECTED" else 2


def cmd_preflight(args: argparse.Namespace) -> int:
    package = _load_package(Path(args.package) if args.package else None)
    if args.variant:
        package = _apply_forbidden_variant(package, args.variant)
    result = preflight(package)
    if args.out:
        _write(Path(args.out), result)
    print(_dump(result), end="")
    return 0 if result.get("ok") else 2


def cmd_dry_run(args: argparse.Namespace) -> int:
    package = _load_package(Path(args.package) if args.package else None)
    if args.variant:
        package = _apply_forbidden_variant(package, args.variant)
    result = dry_run(package)
    if args.out:
        _write(Path(args.out), result)
    print(_dump(result), end="")
    return 0 if result.get("ok") else 2


def cmd_validate(args: argparse.Namespace) -> int:
    package = _load_package(Path(args.package) if args.package else None)
    result = validate_package(package)
    print(_dump(result), end="")
    return 0 if result.get("ok") else 2


def _apply_forbidden_variant(package: dict[str, Any], variant: str) -> dict[str, Any]:
    clone = json.loads(json.dumps(package))
    if variant == "broad":
        terms = clone.setdefault("terms", {})
        terms.setdefault("exact", []).append(
            {"text": "obra pública", "match_type": "BROAD"}
        )
    elif variant == "pmax":
        clone["channel"] = "PERFORMANCE_MAX"
    elif variant == "retargeting":
        clone["audiences"] = ["RETARGETING"]
    elif variant == "pii":
        final = clone.setdefault("attribution", {}).setdefault("final_url", {})
        params = dict(final.get("params") or {})
        params["email"] = "diretor@construtora.com.br"
        params["cnpj"] = "52407089000109"
        final["params"] = params
        base = final.get("base") or "https://confenge.com.br/"
        final["url"] = base + "?email=diretor@construtora.com.br&cnpj=52407089000109"
    else:
        raise SystemExit(f"unknown variant: {variant}")
    return clone


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="WEB-032 Search Ads canary — preflight and dry-run only"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("score", help="Score families from GSC / optional WEB-016")
    s.add_argument("--root", default=None)
    s.add_argument("--out", default=None)
    s.set_defaults(func=cmd_score)

    p = sub.add_parser("package", help="Build the versioned canary package")
    p.add_argument("--root", default=None)
    p.add_argument("--out", default=None)
    p.set_defaults(func=cmd_package)

    f = sub.add_parser("preflight", help="Fail-closed go-live gate (never mutates)")
    f.add_argument("--package", default=None)
    f.add_argument("--out", default=None)
    f.add_argument("--variant", choices=("broad", "pmax", "retargeting", "pii"))
    f.set_defaults(func=cmd_preflight)

    d = sub.add_parser("dry-run", help="Simulate without spend or Ads mutate")
    d.add_argument("--package", default=None)
    d.add_argument("--out", default=None)
    d.add_argument("--variant", choices=("broad", "pmax", "retargeting", "pii"))
    d.set_defaults(func=cmd_dry_run)

    v = sub.add_parser("validate", help="Validate package schema and evidence")
    v.add_argument("--package", default=None)
    v.set_defaults(func=cmd_validate)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
