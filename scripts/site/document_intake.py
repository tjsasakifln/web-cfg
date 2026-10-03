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

# Founder decision 2026-10-03: request a proposal through existing channels.
# A text-only lead form must not claim upload, while e-mail/WhatsApp can carry
# non-confidential technical references. Confidential material uses a reserved channel.
HONEST_CTA = "Solicitar proposta"
CHANNEL_SLA = "envio reservado"
SECURE_CHANNEL_INTENT = "secure_channel_request"  # retained transport value
WA_REQUEST = "Olá, CONFENGE. Quero conversar sobre um projeto ou serviço de engenharia e solicitar uma proposta."

CTA_REPLACEMENTS = (
    ("Solicitar canal seguro para a análise", HONEST_CTA),
    ("Solicitar canal seguro para a prova", HONEST_CTA),
    ("Solicitar canal seguro para a resposta", HONEST_CTA),
    ("Solicitar canal seguro para o dossiê", HONEST_CTA),
    ("Solicitar canal seguro pelo WhatsApp", "Conversar pelo WhatsApp"),
    ("Solicitar canal seguro por e-mail", "Solicitar proposta por e-mail"),
    ("solicitar o canal seguro nesta página", "solicitar proposta nesta página"),
    ("Solicitar canal seguro para envio de documentos", HONEST_CTA),
    ("Solicitar canal seguro para envio", HONEST_CTA),
    ("Solicitar canal seguro", HONEST_CTA),
)
BODY_REPLACEMENTS = (
    ("após o primeiro contato, combinamos um canal seguro para o envio", "compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp; para material confidencial, combinamos o envio reservado"),
    ("Não anexei documentos nesta mensagem; após o primeiro contato, a CONFENGE abre um canal seguro para o envio da documentação.", "Para material confidencial, combinamos o envio reservado."),
    ("Não anexarei documentos nesta mensagem; após o primeiro contato, a CONFENGE abre um canal seguro para o envio da documentação.", "Compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp; para material confidencial, combinamos o envio reservado."),
    ("Olá, Tiago.", "Olá, CONFENGE."),
    ("Olá Tiago", "Olá, CONFENGE"),
    ("documentos só depois, pelo canal seguro combinado", "referências não sigilosas podem ser compartilhadas por e-mail ou WhatsApp; material confidencial segue em envio reservado"),
    ("primeiro contato é em texto, sem anexo", "primeiro contato acolhe o contexto e as referências não sigilosas disponíveis"),
    ("Se documentos forem necessários, solicite um canal seguro; após o primeiro contato a CONFENGE abre um canal seguro para o envio.", "Compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp; para material confidencial, combinamos o envio reservado."),
    ("Se documentos forem necessários, após o primeiro contato a CONFENGE abre um canal seguro para o envio.", "Compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp; para material confidencial, combinamos o envio reservado."),
    ("Após o primeiro contato, a CONFENGE abre um canal seguro para o envio da documentação.", "Compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp; para material confidencial, combinamos o envio reservado."),
    ("quero solicitar um canal seguro para envio de documentos", "quero solicitar uma proposta"),
    ("Quero solicitar um canal seguro para envio de documentos", "Quero solicitar uma proposta"),
    ("quero solicitar um canal seguro para envio", "quero solicitar uma proposta"),
    ("Quero solicitar um canal seguro para envio", "Quero solicitar uma proposta"),
    ("Não anexe arquivo nesta mensagem", "Para material confidencial, combinamos o envio reservado"),
    ("não anexe arquivo nesta mensagem", "para material confidencial, combinamos o envio reservado"),
    ("o canal de envio é escolhido posteriormente; não anexe arquivo no formulário, no WhatsApp automático nem neste e-mail", "compartilhe referências técnicas não sigilosas por e-mail ou WhatsApp; para material confidencial, combinamos o envio reservado"),
)

# Detect only claims of a capability the lead form does not provide. Channel
# invitations to share a public edital or a non-confidential plan are truthful.
DISHONEST_VISIBLE = (
    "Anexe os arquivos neste formulário",
    "O formulário recebe plantas",
    "O formulário recebe arquivos",
    "Upload de documentos concluído",
)

HISTORICAL_FROZEN_RELATIVE_PATHS = {
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
HISTORICAL_HASH_BOUND_LIE_PATHS = {
    "conteudos/glosa-de-medicao-obra-publica/index.html",
    "conteudos/medicao-de-obra-publica-rejeitada/index.html",
    "conteudos/fiscal-nao-assina-medicao-obra-publica/index.html",
    "guias-contratos-obras/checklist-pedido-aditivo/index.html",
    "guias-contratos-obras/contestar-glosa-medicao/index.html",
    "guias-contratos-obras/documentos-pedido-reequilibrio/index.html",
    "guias-contratos-obras/responder-notificacao-atraso/index.html",
    "jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/index.html",
    "lei-14133-obras/limite-25-50-aditivo-obra/index.html",
    "lei-14133-obras/parcela-incontroversa-medicao-pagamento/index.html",
    "lei-14133-obras/preco-item-novo-desconto-proposta/index.html",
    "lei-14133-obras/reequilibrio-reajuste-repactuacao/index.html",
    "lei-14133-obras/servico-executado-sem-termo-aditivo/index.html",
}

# Former commercial freezes are superseded for the scoped CTA correction.
FROZEN_RELATIVE_PATHS = set()
HASH_BOUND_LIE_PATHS = set()

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
    r"""(mailto:[^"'>\s]*?(?:[?&]|&amp;)body=)([^"'>\s]+)""",
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


# A capitalised replacement starts a new sentence. When the phrase it replaces
# sat mid-sentence ("...em cada serviço Posso enviar edital e planilha"), the
# previous sentence must be closed first, or the prefill reads as a run-on
# ("...em cada serviço Quero solicitar um canal seguro..."; CONTEXTO-CAPTURA-08).
SENTENCE_GLUE_RE = re.compile(
    r"([0-9A-Za-z\u00c0-\u00ff])(\s+)(Quero solicitar um canal seguro para envio)"
)


def _close_previous_sentence(text: str) -> str:
    return SENTENCE_GLUE_RE.sub(r"\1.\2\3", text)


def rewrite_copy(text: str) -> str:
    out = text
    for old, new in CTA_REPLACEMENTS:
        out = out.replace(old, new)
    for old, new in BODY_REPLACEMENTS:
        out = out.replace(old, new)
        out = out.replace(old.lower(), new.lower() if old[0].islower() else new)
    return _close_previous_sentence(out)


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
