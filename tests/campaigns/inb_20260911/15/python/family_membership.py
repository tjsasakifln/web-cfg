#!/usr/bin/env python3
"""Drive shipped inbound_gates family matching. Not a reimplementation."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import argparse


def _root_from_env_or_tree(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "scripts" / "site" / "inbound_gates.py").exists():
            return parent
    raise SystemExit("candidate root not found")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    root = _root_from_env_or_tree(args.root)
    sys.path.insert(0, str(root))

    from scripts.site.inbound_gates import (  # noqa: E402
        _bofu_service_routes,
        _match_family,
        is_indexable_html,
        is_noindex,
        load_family_registry,
    )
    from scripts.site.public_copy_scope import visitor_facing_html_files  # noqa: E402

    payload = json.loads(sys.stdin.read() or "{}")
    routes = payload.get("routes") or []
    registry = load_family_registry(root)
    families = registry.get("families") or []
    service_routes = _bofu_service_routes(root)

    def html_for_route(route: str) -> tuple[Path | None, str | None]:
        rel = "index.html" if route == "/" else route.strip("/") + "/index.html"
        path = root / rel
        if not path.is_file():
            return path, None
        return path, path.read_text(encoding="utf-8", errors="replace")

    matches = []
    for route in routes:
        path, html = html_for_route(route)
        family = _match_family(route, families, service_routes)
        matches.append(
            {
                "route": route,
                "file": None if path is None else str(path.relative_to(root)),
                "exists": html is not None,
                "family_id": None if family is None else family.get("id"),
                "terminal_action": None if family is None else family.get("terminal_action"),
                "profile": None if family is None else family.get("profile"),
                "indexable": None if html is None else is_indexable_html(html),
                "noindex": None if html is None else is_noindex(html),
            }
        )

    undeclared = []
    for page in visitor_facing_html_files(root):
        html = page.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            continue
        rel = page.relative_to(root)
        route = "/" if rel.as_posix() == "index.html" else "/" + rel.as_posix().removesuffix("index.html")
        family = _match_family(route, families, service_routes)
        if family is None:
            undeclared.append({"route": route, "file": rel.as_posix()})

    json.dump(
        {
            "ok": True,
            "registry_schema": registry.get("schema_version"),
            "fail_closed": registry.get("fail_closed"),
            "matches": matches,
            "undeclared_indexable": undeclared,
            "service_route_count": len(service_routes),
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
