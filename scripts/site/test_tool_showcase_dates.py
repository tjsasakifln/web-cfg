"""A tool's own revision date must survive rendering and artifact verification."""
from __future__ import annotations

import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from scripts.site.hub_link_composition import href_to_relpath
from scripts.site.render_tool_showcase import HOST, HUB, ROOT, load_registry, rendered_pages
from scripts.site.verify_tool_showcase import Markup, verify


def test_cad_revision_does_not_redate_other_tool_pages():
    pages = rendered_pages(ROOT)
    for route, expected in (("/cad/", "2026-11-11"), ("/bim/", "2026-11-09")):
        html = pages[ROOT / route.lstrip("/") / "index.html"]
        assert len(Markup(html).match("meta", property="og:updated_time", content=expected)) == 1
        assert set(re.findall(r'"dateModified"\s*:\s*"([^"]+)"', html)) == {expected}
    # Rebuilding the catalogue must preserve every already reviewed page.
    assert all(path.read_text(encoding="utf-8") == html for path, html in pages.items())


@pytest.fixture
def catalogue_artifact(tmp_path: Path) -> Path:
    data = load_registry(ROOT)
    hrefs = {HUB}
    for entry in data["entries"]:
        hrefs.add(entry["href"])
        hrefs.update(href for _, href in entry.get("links", []))
    files = {href_to_relpath(href) for href in hrefs}
    files.update(("sitemap.xml", "assets/tool-showcase/showcase.mjs", "assets/js/tool-referral.mjs"))
    keys = ["catalogo", *(entry["id"] for entry in data["entries"] if "page" in entry)]
    files.update(f"assets/tool-showcase/{key}.jpg" for key in keys)
    for relative in files:
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    # Establish a valid artifact before introducing one specific mismatch.
    verify(tmp_path)
    return tmp_path


@pytest.mark.parametrize("route", ["/cad/", "/bim/"])
@pytest.mark.parametrize("surface", ["sitemap", "meta", "schema"])
def test_artifact_rejects_mismatched_revision_dates(catalogue_artifact: Path, route: str, surface: str):
    artifact = catalogue_artifact
    wrong_date = "2000-01-01"
    if surface == "sitemap":
        path = artifact / "sitemap.xml"
        tree = ET.parse(path)
        for node in tree.findall("{*}url"):
            if node.findtext("{*}loc") == HOST + route:
                node.find("{*}lastmod").text = wrong_date
                break
        else:
            raise AssertionError(f"Missing test route: {route}")
        tree.write(path, encoding="utf-8", xml_declaration=True)
    else:
        path = artifact / href_to_relpath(route)
        html = path.read_text(encoding="utf-8")
        pattern = (r'(<meta property="og:updated_time" content=")[^"]+("/>)'
                   if surface == "meta" else r'("dateModified"\s*:\s*")[^"]+(")')
        html, changed = re.subn(pattern, lambda match: match[1] + wrong_date + match[2], html)
        assert changed > 0
        path.write_text(html, encoding="utf-8")
    with pytest.raises(AssertionError, match=re.escape(route)):
        verify(artifact)
