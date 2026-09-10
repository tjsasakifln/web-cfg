#!/usr/bin/env python3
"""Contraprovas das regras efetivas do robots.txt (RFC 9309).

O contrato de bytes prova que a borda nao adulterou o arquivo. Estes testes
provam a outra metade: que o arquivo continua exprimindo a politica vigente.
As duas coisas reprovam por motivos diferentes e nenhuma substitui a outra.

O corpo usado aqui e o CORPO REAL de producao -- o bloco gerenciado que o
Cloudflare antepoe seguido do nosso arquivo -- e nao uma fixture conveniente.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.robots_policy import (  # noqa: E402
    derive_expected_effective,
    evaluate_probes,
    indexable_prefixes_from_headers,
    is_allowed,
    parse_robots,
    policy_regression,
    withdrawn_prefixes_from_redirects,
)

# Parcela REAL que o Cloudflare "Managed robots.txt" antepoe, capturada em
# confenge.com.br e guardada em testdata (1836 bytes, ja com o separador).
# Nao e uma reproducao abreviada: e o prefixo servido, com os nove rastreadores
# de IA que a politica aprovada nomeia. Atencao a caixa dos marcadores:
# "content" minusculo na abertura e "Content" maiusculo no fechamento.
MANAGED_PREFIX = (Path(__file__).resolve().parent / "testdata" / "robots-managed-prefix.txt").read_bytes()

# A origem vem do PACOTE, para que a fixture acompanhe o que e publicado em vez
# de congelar uma copia que envelhece em silencio.
# Sem pacote construido o teste e PULADO, nunca substituido: um corpo escrito a
# mao que passa por producao transforma lacuna de cobertura em falsa seguranca.
# Com ROBOTS_PACKAGE_REQUIRED=1 (o gate npm e o CI pos-build) a ausencia do
# pacote REPROVA em vez de pular: um modulo inteiro pulado sai verde do pytest.
_PACKAGE_ROBOTS = ROOT / "_site" / "robots.txt"
_HAS_PACKAGE = _PACKAGE_ROBOTS.is_file()
_PACKAGE_REQUIRED = os.environ.get("ROBOTS_PACKAGE_REQUIRED") == "1"
if _PACKAGE_REQUIRED and not _HAS_PACKAGE:
    raise RuntimeError("ROBOTS_PACKAGE_REQUIRED=1 mas _site/robots.txt nao existe: rode npm run build:site")
needs_package = pytest.mark.skipif(not _HAS_PACKAGE, reason="pacote nao construido: rode npm run build:site")

ORIGIN = _PACKAGE_ROBOTS.read_bytes().decode("utf-8") if _HAS_PACKAGE else ""
SERVED = MANAGED_PREFIX.decode("utf-8") + ORIGIN


# --------------------------------------------------------------------------
# Regras efetivas por agente e por caminho no corpo COMPOSTO
# --------------------------------------------------------------------------

@needs_package
def test_managed_allow_does_not_override_our_disallow_paths():
    """Quatro grupos "User-agent: *" combinam; vence o casamento mais longo.

    Este e o ponto que a aritmetica de bytes do incidente nao respondia: o bloco
    gerenciado traz "Allow: /", e era preciso provar que ele nao apaga as nossas
    restricoes ao ser combinado com o nosso grupo (RFC 9309 2.2.1 e 2.2.2).
    """
    parsed = parse_robots(SERVED)
    for path in ("/ops/", "/intranet", "/.netlify/", "/ops/qualquer.txt"):
        allowed, rule = is_allowed(parsed, "Googlebot", path)
        assert not allowed, f"{path} deveria continuar bloqueado, venceu {rule}"
    for path in ("/", "/servicos/", "/entregas/"):
        allowed, _ = is_allowed(parsed, "Googlebot", path)
        assert allowed, f"{path} e rota comercial e deveria ser rastreavel"


@needs_package
@pytest.mark.parametrize("agent", ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "Amazonbot"])
def test_managed_per_agent_block_survives_composition(agent):
    """O grupo especifico do agente PRECEDE o grupo "*" e bloqueia tudo.

    Se esta asserçao cair, desligar o Managed robots.txt deixou de negar
    treinamento de IA sem que ninguem tenha decidido isso.
    """
    parsed = parse_robots(SERVED)
    for path in ("/", "/servicos/", "/entregas/"):
        allowed, rule = is_allowed(parsed, agent, path)
        assert not allowed, f"{agent} deveria estar bloqueado em {path}, venceu {rule}"


@needs_package
def test_content_signal_is_preserved_as_policy_even_though_it_is_not_standardized():
    """Content-Signal nao controla allow/disallow, mas exprime politica vigente."""
    parsed = parse_robots(SERVED)
    assert parsed.group_policy["*"]["content-signal"] == [
        "search=yes,ai-train=no,use=reference"
    ]
    assert parsed.policy["sitemap"] == ["https://confenge.com.br/sitemap-index.xml"]


def test_equal_length_allow_beats_disallow_and_longer_disallow_still_wins():
    """RFC 9309 2.2.2: empate resolve pela regra menos restritiva."""
    body = "User-agent: *\nDisallow: /fam/\nAllow: /fam/\nDisallow: /fam/interna/\n"
    parsed = parse_robots(body)
    assert is_allowed(parsed, "Googlebot", "/fam/")[0] is True
    assert is_allowed(parsed, "Googlebot", "/fam/publica/")[0] is True
    assert is_allowed(parsed, "Googlebot", "/fam/interna/")[0] is False


def test_wildcard_and_end_anchor_are_honoured():
    parsed = parse_robots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /a/*/b\n")
    assert is_allowed(parsed, "Googlebot", "/manual.pdf")[0] is False
    assert is_allowed(parsed, "Googlebot", "/manual.pdf?x=1")[0] is True
    assert is_allowed(parsed, "Googlebot", "/a/qualquer/b")[0] is False


def test_empty_disallow_does_not_restrict_and_rules_outside_a_group_are_ignored():
    assert is_allowed(parse_robots("User-agent: *\nDisallow:\n"), "Googlebot", "/x")[0] is True
    # Regra antes de qualquer User-agent nao pertence a grupo nenhum.
    assert is_allowed(parse_robots("Disallow: /\nUser-agent: *\nAllow: /\n"), "G", "/")[0] is True


# --------------------------------------------------------------------------
# Perda de restricao vigente: a contraprova que faltava
# --------------------------------------------------------------------------

PROBES = [
    {"agent": agent, "path": path}
    for agent in ("Googlebot", "GPTBot", "AgenteDesconhecido")
    for path in ("/", "/servicos/", "/ops/", "/intranet", "/piloto/", "/fam/")
]


@needs_package
def test_dropping_a_live_disallow_fails_closed():
    """Bytes intactos, politica perdida. E exatamente o buraco que o gate de
    bytes nao ve: nada foi adulterado no caminho, a restricao apenas sumiu da
    origem."""
    candidate = SERVED.replace("Disallow: /ops/\n", "")
    report = policy_regression(served=SERVED, candidate=candidate, probes=PROBES)
    assert report["ok"] is False
    lost = {(r["agent"], r["path"]) for r in report["lost_restrictions"]}
    assert ("Googlebot", "/ops/") in lost


@needs_package
def test_dropping_a_restriction_is_authorized_only_when_the_url_was_withdrawn_with_410():
    """Sobre uma URL retirada com 410, um Disallow seria MAIS FRACO: impediria o
    rastreador de ver o 410 e de remover a URL do indice."""
    served = SERVED.replace("Disallow: /ops/", "Disallow: /ops/\nDisallow: /piloto/")
    candidate = SERVED
    redirects = "/piloto  /404.html  410\n/piloto/*  /404.html  410\n"

    blind = policy_regression(served=served, candidate=candidate, probes=PROBES + [{"agent": "Googlebot", "path": "/piloto/"}])
    assert blind["ok"] is False

    withdrawn = policy_regression(
        served=served, candidate=candidate, probes=PROBES + [{"agent": "Googlebot", "path": "/piloto/"}],
        withdrawn_prefixes=withdrawn_prefixes_from_redirects(redirects),
    )
    assert withdrawn["ok"] is True
    assert {r["because"] for r in withdrawn["authorized_relaxations"]} == {"withdrawn_410"}


@needs_package
def test_a_new_allow_is_authorized_only_when_the_package_publishes_index_follow():
    """Um Allow novo so e autorizado quando a decisao de indexar esta escrita no
    pacote. Enquanto o X-Robots-Tag disser noindex, o Allow e relaxamento."""
    candidate = SERVED.replace("Disallow: /ops/", "Disallow: /ops/\nAllow: /ops/painel/")
    probes = PROBES + [{"agent": "Googlebot", "path": "/ops/painel/"}]

    noindex = "/ops/painel/*\n  X-Robots-Tag: noindex, nofollow\n"
    report = policy_regression(
        served=SERVED, candidate=candidate, probes=probes,
        indexable_prefixes=indexable_prefixes_from_headers(noindex),
    )
    assert report["ok"] is False, "noindex no pacote nao autoriza abrir o rastreio"

    published = "/ops/painel/*\n  X-Robots-Tag: index, follow\n"
    report = policy_regression(
        served=SERVED, candidate=candidate, probes=probes,
        indexable_prefixes=indexable_prefixes_from_headers(published),
    )
    assert report["ok"] is True
    assert {r["because"] for r in report["authorized_relaxations"]} == {"published_index_follow"}


@needs_package
def test_losing_a_non_standard_policy_directive_fails_closed():
    """Content-Signal e Sitemap nao sao descartaveis so porque nao controlam
    Allow/Disallow: exprimem politica vigente."""
    for dropped in ("Content-Signal: search=yes,ai-train=no,use=reference\n",
                    "Sitemap: https://confenge.com.br/sitemap-index.xml\n"):
        report = policy_regression(
            served=SERVED, candidate=SERVED.replace(dropped, ""), probes=PROBES,
        )
        assert report["ok"] is False
        assert report["dropped_policy_directives"]


@needs_package
def test_turning_off_managed_composition_is_detected_as_granting_ai_training():
    """Contraprova da decisao de MANTER a composicao gerenciada.

    Se alguem desligar o Managed robots.txt na zona e servir so a nossa origem,
    o resultado nao e "limpeza": e conceder rastreio a GPTBot, ClaudeBot, CCBot,
    Google-Extended e Amazonbot, e perder o Content-Signal ai-train=no.
    """
    report = policy_regression(served=SERVED, candidate=ORIGIN, probes=PROBES)
    assert report["ok"] is False
    granted = {r["agent"] for r in report["lost_restrictions"]}
    assert {"GPTBot"} <= granted
    assert any(d["directive"] == "content-signal" for d in report["dropped_policy_directives"])


@needs_package
def test_an_unchanged_candidate_passes():
    """O caminho bem-sucedido inteiro tambem e exercitado, nao so as falhas."""
    report = policy_regression(served=SERVED, candidate=SERVED, probes=PROBES)
    assert report["ok"] is True
    assert report["lost_restrictions"] == []
    assert report["authorized_relaxations"] == []


@needs_package
def test_evaluate_probes_reports_the_winning_rule_for_every_probe():
    rows = evaluate_probes(SERVED, PROBES)
    assert len(rows) == len(PROBES)
    assert all(row["rule"] for row in rows)


# --------------------------------------------------------------------------
# A linha de base nao pode ser copia da resposta que se quer validar
# --------------------------------------------------------------------------

def test_the_baseline_is_derived_from_declared_policy_not_from_the_candidate_body():
    """Se a expectativa vier do corpo, o gate vira tautologia.

    As 234 linhas aprovadas tem de cair das DECLARACOES de politica do proprio
    arquivo -- rastreadores de IA negados em todo caminho, superficies privadas
    negadas a qualquer agente, o restante rastreavel -- sem nunca ler o
    robots.txt do pacote. Assim um defeito no pacote produz divergencia real em
    vez de uma linha de base que concorda com o defeito.
    """
    baseline = json.loads(
        (ROOT / "data" / "organic" / "robots-policy-baseline.v1.json").read_text(encoding="utf-8")
    )
    stored = {(r["agent"], r["path"]): r["allowed"] for r in baseline["expected_effective"]}
    derived = {(r["agent"], r["path"]): r["allowed"] for r in derive_expected_effective(baseline)}
    assert len(stored) == len(baseline["expected_effective"]) == 234
    assert derived == stored, {k: (stored[k], derived[k]) for k in stored if stored[k] != derived[k]}


def test_the_derivation_would_reject_a_baseline_row_that_contradicts_the_policy():
    """Contraprova: uma linha que so existe porque o corpo disse reprova."""
    baseline = {
        "ai_crawlers_denied_everywhere": ["GPTBot"],
        "private_surfaces_denied_to_every_agent": ["/ops/"],
        "expected_effective": [
            {"agent": "GPTBot", "path": "/", "allowed": True},
            {"agent": "Googlebot", "path": "/ops/", "allowed": True},
            {"agent": "Googlebot", "path": "/servicos/", "allowed": True},
        ],
    }
    derived = {(r["agent"], r["path"]): r["allowed"] for r in derive_expected_effective(baseline)}
    assert derived[("GPTBot", "/")] is False
    assert derived[("Googlebot", "/ops/")] is False
    assert derived[("Googlebot", "/servicos/")] is True


# --------------------------------------------------------------------------
# Contraprova: a forma percent-encoded nao escapa da restricao
# --------------------------------------------------------------------------

@needs_package
@pytest.mark.parametrize("path", ["/%6Fps/", "/%6fps/", "/%6Fps/README-data.txt", "/intr%61net"])
def test_percent_encoded_private_paths_stay_blocked(path):
    """"/%6Fps/" e "/ops/". Sem normalizar, um rastreador que pedisse a forma
    codificada passaria por cima do Disallow -- e o gate de bytes nunca veria,
    porque o arquivo estaria intacto (RFC 3986 6.2.2.2)."""
    parsed = parse_robots(SERVED)
    allowed, rule = is_allowed(parsed, "Googlebot", path)
    assert not allowed, f"{path} deveria continuar bloqueado, venceu {rule}"


@needs_package
def test_normalization_does_not_invent_matches():
    """So o conjunto unreserved e decodificado.

    "%2A" nao pode virar o curinga "*", senao normalizar criaria casamento onde
    nao havia -- o defeito oposto, e pior.
    """
    parsed = parse_robots(SERVED)
    assert is_allowed(parsed, "Googlebot", "/%2Aops/")[0] is True
    assert is_allowed(parsed, "Googlebot", "/servi%63os/")[0] is True
    # E a regra tambem e normalizada, nao so o caminho.
    encoded_rule = parse_robots("User-agent: *\nAllow: /\nDisallow: /%6Fps/\n")
    assert is_allowed(encoded_rule, "Googlebot", "/ops/")[0] is False


# --------------------------------------------------------------------------
# Regressoes do motor e das fontes de autorizacao (revisao adversarial do #650)
# --------------------------------------------------------------------------

def test_dollar_is_an_anchor_only_at_the_end_of_the_rule():
    """RFC 9309 2.2.3: "$" fecha a regra; no meio dela e literal."""
    parsed = parse_robots("User-agent: *\nDisallow: /a$b\nDisallow: /fim$\n")
    assert is_allowed(parsed, "Googlebot", "/a$b")[0] is False
    assert is_allowed(parsed, "Googlebot", "/a$bc")[0] is False
    assert is_allowed(parsed, "Googlebot", "/fim")[0] is False
    assert is_allowed(parsed, "Googlebot", "/fim/")[0] is True


def test_specificity_uses_the_normalized_rule_length():
    """"/%6Fps/" e "/ops/" sao a mesma regra de cinco octetos: empatam, e o
    empate favorece o Allow. Antes, a grafia percent-encoded vencia por ter
    mais caracteres, reprovando um caminho que a politica libera."""
    encoded = parse_robots("User-agent: *\nAllow: /ops/\nDisallow: /%6Fps/\n")
    literal = parse_robots("User-agent: *\nAllow: /ops/\nDisallow: /ops/\n")
    assert is_allowed(encoded, "Googlebot", "/ops/x") == is_allowed(literal, "Googlebot", "/ops/x")
    assert is_allowed(encoded, "Googlebot", "/ops/x")[0] is True


def test_adjacent_header_stanzas_do_not_inherit_the_previous_path():
    """Sem linha em branco entre estrofes, "/a/*" (noindex) nao pode herdar o
    "index, follow" de "/b/*"."""
    text = "/a/*\n  X-Robots-Tag: noindex, nofollow\n/b/*\n  X-Robots-Tag: index, follow\n"
    assert indexable_prefixes_from_headers(text) == ["/b/"]
    grouped = "/a/*\n/b/*\n  X-Robots-Tag: index, follow\n"
    assert indexable_prefixes_from_headers(grouped) == ["/a/", "/b/"]


def test_exact_410_source_does_not_authorize_losing_a_sibling_restriction():
    """"/ia  /404.html  410" retira /ia e /ia/, nunca /iainterna/."""
    entries = withdrawn_prefixes_from_redirects("/ia  /404.html  410\n/piloto/*  /404.html  410\n")
    assert entries == ["/ia", "/piloto/*"]
    served = "User-agent: *\nDisallow: /iainterna/\nDisallow: /ia\nDisallow: /piloto/\n"
    candidate = "User-agent: *\n"
    probes = [
        {"agent": "Googlebot", "path": "/ia"},
        {"agent": "Googlebot", "path": "/ia/"},
        {"agent": "Googlebot", "path": "/iainterna/"},
        {"agent": "Googlebot", "path": "/piloto/x"},
    ]
    report = policy_regression(served=served, candidate=candidate, probes=probes, withdrawn_prefixes=entries)
    assert report["ok"] is False
    assert [r["path"] for r in report["lost_restrictions"]] == ["/iainterna/"]
    assert {r["path"] for r in report["authorized_relaxations"]} == {"/ia", "/ia/", "/piloto/x"}
