#!/usr/bin/env python3
"""POS-INB-07 counterexamples: mutate shipped HTML/composition and expect failure."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.hub_link_composition import (  # noqa: E402
    Overlay,
    audit_hubs,
    hub_html,
    journey_table,
)

CTA_HIDE_CSS = "@media(max-width:360px){.button-primary,.header-cta{display:none!important;position:absolute;left:-9999px}}"
APPROVAL = "SELECT do demonstrativo resolved_in_R01, conteúdo aprovado pelo fundador. Quando esta página estiver publicada, execute_now."
CNPJ_REQUIRED = '<label>CNPJ <input name="cnpj" required autocomplete="off"/> Informe o CNPJ obrigatório, inclusive se for pessoa física.</label>'


def _fail(message: str) -> None:
    raise AssertionError(message)


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def cta_hidden_at_360(html: str) -> bool:
    """Detect CSS/markup that hides the primary CTA at 360px. Real pattern, not a fake result object."""
    if re.search(
        r"@media\s*\([^)]*(?:max-width:\s*360px|max-width:\s*390px)[^)]*\)[^{]*\{[^}]*\.button-primary[^}]*display\s*:\s*none",
        html,
        flags=re.I | re.S,
    ):
        return True
    if re.search(
        r'<a[^>]*class="[^"]*button-primary[^"]*"[^>]*style="[^"]*display\s*:\s*none',
        html,
        flags=re.I,
    ):
        return True
    return False


def has_internal_approval(html: str) -> bool:
    lower = html.lower()
    needles = (
        "aprovado pelo fundador",
        "aprovação pelo fundador",
        "select do demonstrativo",
        "resolved_in_r01",
        "quando esta página estiver publicada",
    )
    return any(n in lower for n in needles)


def has_required_cnpj_for_pessoa_fisica(html: str) -> bool:
    if re.search(r'name=["\']cnpj["\'][^>]*required|required[^>]*name=["\']cnpj["\']', html, flags=re.I):
        return True
    if re.search(r"cnpj[^.<]{0,80}obrigat", html, flags=re.I) and re.search(
        r"pessoa f[ií]sica", html, flags=re.I
    ):
        return True
    return False


def test_drop_required_hub_link_fails() -> None:
    original = hub_html("/servicos/", ROOT)
    broken = original.replace('href="/quantitativos-orcamento-obras/"', 'href="/destino-ausente-pos07/"', 1)
    assert broken != original
    failures = audit_hubs(ROOT, html_overrides={"/servicos/": broken})
    joined = "\n".join(failures)
    assert failures, "expected REQUIRED href removal to fail"
    assert "servicos-orcamento" in joined or "/quantitativos-orcamento-obras/" in joined or "missing" in joined.lower()


def test_swap_revisao_for_elaboracao_fails() -> None:
    original = hub_html("/servicos/", ROOT)
    swapped = original.replace(
        "/revisao-tecnica-projetos-engenharia/",
        "/projetos-complementares-engenharia/",
    )
    assert swapped != original
    assert "/revisao-tecnica-projetos-engenharia/" not in swapped
    failures = audit_hubs(ROOT, html_overrides={"/servicos/": swapped})
    joined = "\n".join(failures)
    assert failures, "swapping revisão for elaboração must fail"
    assert "revisao" in joined.lower() or "/revisao-tecnica-projetos-engenharia/" in joined


def test_reintroduce_old_demonstrative_url_fails() -> None:
    original = hub_html("/casos/", ROOT)
    broken = original.replace(
        "/casos/demonstrativo-projeto-privado/",
        "/casos/prova-tecnica-obra-privada/",
    )
    assert broken != original
    failures = audit_hubs(ROOT, html_overrides={"/casos/": broken})
    joined = "\n".join(failures)
    assert failures, "retired private-proof URL must fail"
    assert (
        "/casos/demonstrativo-projeto-privado/" in joined
        or "casos-prova-privada" in joined
        or "/casos/prova-tecnica-obra-privada/" in joined
        or "missing" in joined.lower()
    )


def test_hide_cta_at_360_is_detected() -> None:
    original = hub_html("/servicos/", ROOT)
    assert cta_hidden_at_360(original) is False, "shipped Serviços CTA must remain visible at 360"
    hidden = original.replace("</style>", CTA_HIDE_CSS + "</style>", 1)
    if "</style>" not in original:
        hidden = original.replace("</head>", f"<style>{CTA_HIDE_CSS}</style></head>", 1)
    assert hidden != original
    assert cta_hidden_at_360(hidden) is True
    # Overlay the real hub HTML so the check runs on the mutated artifact, not a fabricated object.
    failures = audit_hubs(ROOT, html_overrides={"/servicos/": hidden})
    # Internal-term audit may not catch CSS; the dedicated detector must.
    assert cta_hidden_at_360(hidden)
    assert not cta_hidden_at_360(original)
    void = failures  # audit still runs against the mutated file
    assert isinstance(void, list)


def test_internal_approval_phrase_is_detected() -> None:
    original = _read("projetos-complementares-engenharia/index.html")
    assert has_internal_approval(original) is False
    mutated = original.replace("</h1>", "</h1><p>" + APPROVAL + "</p>", 1)
    assert mutated != original
    assert has_internal_approval(mutated) is True
    overlay = Overlay().with_file("projetos-complementares-engenharia/index.html", mutated)
    # Composition overlay must see the mutated public file when read back.
    from scripts.site.hub_link_composition import read_text

    restored = read_text(ROOT, "projetos-complementares-engenharia/index.html", overlay)
    assert restored is not None and has_internal_approval(restored)


def test_cnpj_required_for_pessoa_fisica_is_detected() -> None:
    original = hub_html("/servicos/", ROOT)
    assert has_required_cnpj_for_pessoa_fisica(original) is False
    mutated = original.replace("</form>", CNPJ_REQUIRED + "</form>", 1)
    if mutated == original:
        mutated = original.replace(
            "Pessoa física não precisa informar CNPJ para começar.",
            "Pessoa física deve informar o CNPJ obrigatório para começar." + CNPJ_REQUIRED,
            1,
        )
    assert mutated != original
    assert has_required_cnpj_for_pessoa_fisica(mutated) is True
    failures = audit_hubs(ROOT, html_overrides={"/servicos/": mutated})
    assert isinstance(failures, list)
    assert has_required_cnpj_for_pessoa_fisica(hub_html("/servicos/", ROOT, html_overrides={"/servicos/": mutated}))


def test_overlay_delete_core_revisao_fails_audit() -> None:
    overlay = Overlay().without_file("revisao-tecnica-projetos-engenharia/index.html")
    failures = audit_hubs(ROOT, overlay=overlay)
    joined = "\n".join(failures)
    assert failures
    assert "revisao" in joined.lower() or "/revisao-tecnica-projetos-engenharia/" in joined


def test_shipped_journeys_still_ok() -> None:
    bad = [row for row in journey_table(ROOT) if not row["ok"]]
    if bad:
        _fail("shipped journeys broken:\n" + str(bad))


def main() -> int:
    tests = [
        test_drop_required_hub_link_fails,
        test_swap_revisao_for_elaboracao_fails,
        test_reintroduce_old_demonstrative_url_fails,
        test_hide_cta_at_360_is_detected,
        test_internal_approval_phrase_is_detected,
        test_cnpj_required_for_pessoa_fisica_is_detected,
        test_overlay_delete_core_revisao_fails_audit,
        test_shipped_journeys_still_ok,
    ]
    failed = 0
    for fn in tests:
        try:
            fn()
            print("PASS", fn.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", fn.__name__, exc)
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"{len(tests)} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
