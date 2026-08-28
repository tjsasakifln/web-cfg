#!/usr/bin/env python3
"""Honest document-intake copy (option B): the site does not receive files.

Source of truth for the visitor CTA and the dishonest phrases it replaces.
Used by rewrite (mutable HTML/data) and by the honesty gate.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]

HONEST_CTA = "Solicitar canal seguro para envio"
CHANNEL_SLA = "canal escolhido posteriormente"
SECURE_CHANNEL_INTENT = "secure_channel_request"
WA_REQUEST = (
    "Olá, Tiago. Quero solicitar um canal seguro para envio. "
    "O site não recebe arquivo; o canal é escolhido posteriormente."
)

# Longest first so nested labels do not leave leftovers.
CTA_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("Enviar documentos para análise inicial", HONEST_CTA),
    ("Enviar documentos para análise no WhatsApp", f"{HONEST_CTA} no WhatsApp"),
    ("Enviar documentos agora pelo WhatsApp", HONEST_CTA),
    ("Enviar documentos para análise", HONEST_CTA),
    ("Enviar edital para triagem no WhatsApp", f"{HONEST_CTA} no WhatsApp"),
    ("Enviar o edital agora pelo WhatsApp", HONEST_CTA),
    ("Enviar edital para triagem", HONEST_CTA),
    ("Enviar edital e planilha", HONEST_CTA),
)

BODY_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (
        "quero enviar os documentos para análise",
        "quero solicitar um canal seguro para envio",
    ),
    (
        "quero enviar documentos para análise",
        "quero solicitar um canal seguro para envio",
    ),
    (
        "quero enviar para triagem da Operação de Proposta para Licitação Crítica",
        "quero solicitar um canal seguro para envio",
    ),
    ("quero enviar para triagem", "quero solicitar um canal seguro para envio"),
    (
        "posso encaminhar documentos com o protocolo",
        "quero solicitar um canal seguro para envio. Protocolo: (cole aqui)",
    ),
    ("posso encaminhar documentos", "quero solicitar um canal seguro para envio"),
    (
        "posso enviar o PDF ou link",
        "quero solicitar um canal seguro para envio",
    ),
    (
        "Posso enviar edital e planilha",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem",
    ),
    (
        "Posso enviar: contrato, planilha, medições e notificações relevantes.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar contrato, planilha e histórico de aditivos.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar planilha, proposta, composições e o pedido de aditivo.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar cronograma, diário de obra e notificações.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar os documentos da checklist.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar medições, critérios e notificações.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar contrato, planilha, índices e documentos de custo.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar OS, diário, fotos e planilha.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Posso enviar: contrato, planilha, ordens de serviço, projetos e histórico de aditivos.",
        "Quero solicitar um canal seguro para envio. Não anexe arquivo nesta mensagem.",
    ),
    (
        "Envie o edital, a planilha, a notificação ou a medição. Retorno com enquadramento técnico e próximos passos.",
        "Solicite um canal seguro para envio. O site não recebe arquivo; o canal é escolhido posteriormente.",
    ),
    (
        "Envie o edital, a planilha ou a notificação. Retornamos com enquadramento técnico e próximos passos, sem cadastro em lista.",
        "Solicite um canal seguro para envio. O site não recebe arquivo; o canal é escolhido posteriormente.",
    ),
    (
        "Envie o edital, a planilha ou a notificação. Retornamos com enquadramento técnico e próximos passos.",
        "Solicite um canal seguro para envio. O site não recebe arquivo; o canal é escolhido posteriormente.",
    ),
    (
        "Enviar documentos para análise começa por este formulário. Descreva a situação e deixe um canal de retorno. Se houver documentos sensíveis, combinamos o envio seguro depois do primeiro contato.",
        "Solicitar canal seguro para envio começa por este formulário. O site não recebe arquivo. Descreva a situação e deixe um canal de retorno; o canal de envio é escolhido posteriormente.",
    ),
    (
        "anexe editais e planilhas apenas após combinarmos WhatsApp ou e-mail com o protocolo",
        "o canal de envio de documentos é escolhido posteriormente; não anexe arquivo nesta mensagem",
    ),
    (
        "Após o protocolo, a orientação é combinar canal seguro (preferencialmente WhatsApp operacional ou e-mail com destinatário confirmado) para anexos.",
        "Após o protocolo, o canal de envio é escolhido posteriormente (WhatsApp operacional ou e-mail com destinatário confirmado). O site não recebe arquivo.",
    ),
    (
        "envie o PDF/link do edital apenas pelo WhatsApp ou e-mail com o protocolo na mensagem, não pelo formulário público",
        "o canal de envio é escolhido posteriormente; não anexe arquivo no formulário, no WhatsApp automático nem neste e-mail",
    ),
)

# Visible visitor claims that the site receives a file. Used by the honesty gate.
DISHONEST_VISIBLE = (
    "Enviar documentos para análise",
    "Enviar documentos para análise inicial",
    "Enviar edital para triagem",
    "Enviar documentos agora pelo WhatsApp",
    "Enviar o edital agora pelo WhatsApp",
    "Enviar edital e planilha",
    "Enviar documentos para análise no WhatsApp",
    "Enviar edital para triagem no WhatsApp",
    "Envie o edital, a planilha",
    "quero enviar documentos para análise",
    "quero enviar para triagem",
    "posso encaminhar documentos",
    "Posso enviar edital e planilha",
    "anexe editais, medições ou planilhas",
)

FROZEN_RELATIVE_PATHS = {
    "aditivos-obras-publicas/index.html",
    "medicoes-glosas-obras-publicas/index.html",
    "reequilibrio-obras-publicas/index.html",
    "auditoria-orcamento-licitacao/index.html",
    "diagnostico-b2g-360/index.html",
    "diagnostico-pre-licitacao/index.html",
    "script.js",
}

# Hash- or approval-bound visitor HTML that still names a file send.
# Rewriting would break issue #389 sibling SHAs or HUMAN_APPROVED material_hash.
# The honesty gate allows the lie only on these exact paths.
HASH_BOUND_LIE_PATHS = {
    "conteudos/glosa-de-medicao-obra-publica/index.html",
    "conteudos/medicao-de-obra-publica-rejeitada/index.html",
    "conteudos/fiscal-nao-assina-medicao-obra-publica/index.html",
    "guias-contratos-obras/checklist-pedido-aditivo/index.html",
    "guias-contratos-obras/contestar-glosa-medicao/index.html",
    "guias-contratos-obras/documentos-pedido-reequilibrio/index.html",
    "guias-contratos-obras/responder-notificacao-atraso/index.html",
    "jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/index.html",
    "lei-14133-obras/atraso-imputavel-administracao/index.html",
    "lei-14133-obras/limite-25-50-aditivo-obra/index.html",
    "lei-14133-obras/parcela-incontroversa-medicao-pagamento/index.html",
    "lei-14133-obras/preco-item-novo-desconto-proposta/index.html",
    "lei-14133-obras/reequilibrio-reajuste-repactuacao/index.html",
    "lei-14133-obras/servico-executado-sem-termo-aditivo/index.html",
}

SKIP_PARTS = {
    "docs",
    "scripts",
    "tests",
    "node_modules",
    "_site",
    ".git",
    ".worktrees",
    ".claude",
    ".github",
    "seo",
    "netlify",
    "ops",
}

FILE_INPUT_RE = re.compile(r"""type\s*=\s*['"]file['"]""", re.I)
WA_HREF_RE = re.compile(
    r"""(https://wa\.me/\d+\?text=)([^"'>\s]+)""",
    re.I,
)
MAILTO_BODY_RE = re.compile(
    r"""(mailto:[^"'>\s]*?[?&]body=)([^"'>\s]+)""",
    re.I,
)

REQUIRED_HONEST_SURFACES = (
    "index.html",
    "bid-room-licitacoes-obras/index.html",
    "defesa-margem-contratos-publicos/index.html",
    "obrigado-contrato.html",
    "obrigado-edital.html",
)


def is_frozen(rel: str) -> bool:
    normalized = rel.replace("\\", "/")
    return normalized in FROZEN_RELATIVE_PATHS or normalized in HASH_BOUND_LIE_PATHS


def rewrite_copy(text: str) -> str:
    out = text
    for old, new in CTA_REPLACEMENTS:
        out = out.replace(old, new)
    for old, new in BODY_REPLACEMENTS:
        out = out.replace(old, new)
        out = out.replace(old.lower(), new.lower() if old[0].islower() else new)
    return out


def _rewrite_query_component(encoded: str) -> str:
    try:
        decoded = encoded.replace("+", " ")
        from urllib.parse import unquote

        decoded = unquote(decoded)
    except Exception:
        return encoded
    rewritten = rewrite_copy(decoded)
    if rewritten == decoded:
        return encoded
    return quote(rewritten, safe="")


def rewrite_html(html: str) -> str:
    out = rewrite_copy(html)

    def wa_sub(match: re.Match[str]) -> str:
        return match.group(1) + _rewrite_query_component(match.group(2))

    out = WA_HREF_RE.sub(wa_sub, out)
    out = MAILTO_BODY_RE.sub(wa_sub, out)
    return out


def dishonest_hits(text: str) -> list[str]:
    hits = []
    for phrase in DISHONEST_VISIBLE:
        if phrase in text:
            hits.append(phrase)
    return hits


def visitor_html_files(root: Path | None = None) -> list[Path]:
    base = root or ROOT
    files: list[Path] = []
    for path in base.rglob("*.html"):
        rel_parts = path.relative_to(base).parts
        if any(part in SKIP_PARTS for part in rel_parts):
            continue
        files.append(path)
    return sorted(files)


def rewrite_json_obj(value):
    if isinstance(value, str):
        return rewrite_copy(value)
    if isinstance(value, list):
        return [rewrite_json_obj(item) for item in value]
    if isinstance(value, dict):
        return {key: rewrite_json_obj(item) for key, item in value.items()}
    return value


def rewrite_json_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    data = json.loads(original)
    updated = rewrite_json_obj(data)
    new = json.dumps(updated, ensure_ascii=False, indent=2) + "\n"
    if new == original:
        return False
    path.write_text(new, encoding="utf-8")
    return True


def apply_rewrites(root: Path | None = None) -> dict[str, int]:
    base = root or ROOT
    stats = {"html": 0, "json": 0, "skipped_frozen": 0}
    for path in visitor_html_files(base):
        rel = str(path.relative_to(base)).replace("\\", "/")
        if is_frozen(rel):
            stats["skipped_frozen"] += 1
            continue
        original = path.read_text(encoding="utf-8")
        updated = rewrite_html(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            stats["html"] += 1
    json_targets = [
        base / "data/site/brand.json",
        base / "data/site/whatsapp-messages.json",
        base / "data/organic/bofu-intent-matrix.json",
        base / "data/editorial/EDITORIAL-REGISTRY.json",
        base / "docs/editorial/EDITORIAL-REGISTRY.json",
    ]
    json_targets.extend(sorted((base / "data/editorial/pages").glob("*.json")))
    for path in json_targets:
        if path.is_file() and rewrite_json_file(path):
            stats["json"] += 1
    return stats


def capture_forms_with_file_input(html: str) -> bool:
    if not FILE_INPUT_RE.search(html):
        return False
    # Fail if any capture form (lead / contact) includes a file control.
    for form in re.finditer(r"<form\b[^>]*>.*?</form>", html, flags=re.I | re.S):
        chunk = form.group(0)
        if FILE_INPUT_RE.search(chunk) and re.search(
            r"diagnostico-b2g|diagnostico-confenge|data-capture-form|functions/lead",
            chunk,
            re.I,
        ):
            return True
    return bool(FILE_INPUT_RE.search(html))


if __name__ == "__main__":
    print(json.dumps(apply_rewrites(), ensure_ascii=False, indent=2))
