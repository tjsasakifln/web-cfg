"""Fail-closed ingest of the extra-cli confenge-dossier rendezvous.

Nothing is invented here. An absent, blocked or tampered rendezvous yields an
empty cohort with reason codes, never a rendered page.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

from scripts.market_panorama import (
    ACCEPTED_PAYLOAD_SCHEMAS,
    CATALOG_OFFICIAL_LIVE,
    DATA_READY,
    REASON_HANDOFF_BLOCKED,
    REASON_IDENTITY_LEAK,
    REASON_NO_HANDOFF,
    REASON_NOT_DATA_READY,
    REASON_NOT_OFFICIAL_LIVE,
    REASON_NOT_PUBLISHABLE,
    REASON_PAYLOAD_TOO_LARGE,
    REASON_PRODUCER_CLAIMS_INDEX,
    REASON_SCHEMA_UNKNOWN,
    REASON_SUMS_INVALID,
    RENDEZVOUS_CHANNEL,
    RENDEZVOUS_FAMILY,
    SOURCE_ABSENT,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
    SUMS_NAME,
)

# A payload that carries these keys with a real value has crossed the privacy
# boundary. The producer redacts them; the consumer refuses them anyway.
IDENTITY_KEYS = (
    "cnpj14",
    "cnpj_raiz",
    "razao_social",
    "nome_fantasia",
    "supplier_cnpj",
    "supplier_nome",
    "fornecedor_cnpj",
    "fornecedor_nome",
)
# Separators are optional and inconsistent in the wild, so the patterns are
# permissive; a false positive costs one refused pack, a false negative puts a
# third party's identity on a public page.
# A public panorama is a page of aggregates. Anything this size is a mistake or
# an attack, and it is read fully into memory by the digest check.
MAX_FILE_BYTES = 4 * 1024 * 1024

CNPJ_PATTERN = re.compile(r"\d{2}[.\s]?\d{3}[.\s]?\d{3}[\s]?[/.\s]?[\s]?\d{4}[-.\s]?\d{2}")
CPF_PATTERN = re.compile(r"\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b")
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
LONG_DIGIT_RUN = re.compile(r"\d{11,}")
# A company name is not a public-record fact about a market recorte. These are
# the legal-form markers that end one.
COMPANY_SUFFIX = re.compile(
    r"\b(ltda|s\.?/?a|eireli|epp|me|mei|sociedade\s+simples|empreendimentos)\b",
    re.IGNORECASE,
)
# CONFENGE is the publisher. Its own registered number appears in the organization
# schema of every page and is not a third-party identity leak.
PUBLISHER_CNPJ_DIGITS = "52407089000109"
PUBLISHER_EMAIL = "tiago.sasaki@confenge.com.br"
# CONFENGE's own contact number is in the WhatsApp CTA of every page.
PUBLISHER_PHONE_DIGITS = "5548988344559"
PUBLISHER_DIGIT_RUNS = (PUBLISHER_CNPJ_DIGITS, PUBLISHER_PHONE_DIGITS)
# Names of public bodies legitimately contain these; they are not companies.
PUBLIC_BODY_MARKERS = (
    "prefeitura",
    "municipio",
    "município",
    "secretaria",
    "estado",
    "departamento",
    "governo",
    "autarquia",
    "instituto",
    "fundacao",
    "fundação",
    "camara",
    "câmara",
    "tribunal",
    "universidade",
)


class ConsumeError(ValueError):
    """Raised only for a malformed local read, never for a blocked handoff."""


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def rendezvous_dir() -> Path:
    base = os.environ.get("CONFENGE_HANDOFF_DIR")
    root = Path(base) if base else Path.home() / ".local" / "share" / "confenge" / "handoffs"
    return root / RENDEZVOUS_FAMILY / RENDEZVOUS_CHANNEL


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def verify_sums(root: Path) -> list[str]:
    """Recompute every digest. A mismatch blocks the cohort."""
    sums = root / SUMS_NAME
    if not sums.exists():
        return [f"missing:{SUMS_NAME}"]
    listed: dict[str, str] = {}
    for line in sums.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, _, name = line.partition("  ")
        if not name:
            return ["malformed_sums_line"]
        listed[name] = digest
    present = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p.name != SUMS_NAME}
    errors: list[str] = []
    if set(listed) != present:
        errors.append(f"file_set_mismatch:{sorted(set(listed) ^ present)}")
    for name, digest in listed.items():
        path = root / name
        if not path.exists() or _sha256(path.read_bytes()) != digest:
            errors.append(f"digest:{name}")
    return errors


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def _scan_text(text: str, path: str, found: list[str]) -> None:
    for match in CNPJ_PATTERN.findall(text):
        digits = _digits(match)
        if digits == PUBLISHER_CNPJ_DIGITS or PUBLISHER_PHONE_DIGITS.startswith(digits[:13]):
            continue
        found.append(f"cnpj_in_text@{path}")
    for match in CPF_PATTERN.findall(text):
        # A CNPJ contains a CPF-shaped run; do not double-report the publisher's.
        if PUBLISHER_CNPJ_DIGITS.startswith(_digits(match)):
            continue
        found.append(f"cpf_in_text@{path}")
    for match in EMAIL_PATTERN.findall(text):
        if match.lower() == PUBLISHER_EMAIL:
            continue
        found.append(f"email_in_text@{path}")
    for match in LONG_DIGIT_RUN.findall(text):
        if any(own in match for own in PUBLISHER_DIGIT_RUNS):
            continue
        found.append(f"digit_run_in_text@{path}")
    if COMPANY_SUFFIX.search(text) and not any(m in text.lower() for m in PUBLIC_BODY_MARKERS):
        found.append(f"company_name_in_text@{path}")


def identity_leaks(payload: Any) -> list[str]:
    """Any real identity value in the public payload is a hard block.

    Scans values of every type, not only strings: an identity key holding a
    list or an int is still an identity.
    """
    found: list[str] = []

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                child = f"{path}.{key}"
                if key in IDENTITY_KEYS and value not in (None, "", [], {}, "UNKNOWN"):
                    found.append(child)
                walk(value, child)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")
        elif isinstance(node, str):
            _scan_text(node, path, found)
        elif isinstance(node, (int, float)) and not isinstance(node, bool):
            _scan_text(str(node), path, found)

    walk(payload, "$")
    return sorted(set(found))


def load_cohort(*, rendezvous: Path | None = None, fixture: Path | None = None) -> dict[str, Any]:
    """Return ``{records, source_kind, reason_codes, handoff}``.

    ``records`` is empty whenever the handoff is absent, blocked or fails a
    check. An empty cohort is a valid, honest outcome.
    """
    if fixture is not None:
        payload = json.loads(Path(fixture).read_text(encoding="utf-8"))
        return {
            "records": [payload],
            "source_kind": SOURCE_FIXTURE,
            "reason_codes": [],
            "handoff": {"decision": "FIXTURE"},
            "test_only": True,
        }

    root = rendezvous or rendezvous_dir()
    ready = root / "READY.json"
    blocked = root / "BLOCKED.json"

    if not root.exists() or (not ready.exists() and not blocked.exists()):
        return {
            "records": [],
            "source_kind": SOURCE_ABSENT,
            "reason_codes": [REASON_NO_HANDOFF],
            "handoff": {},
            "test_only": False,
        }
    if ready.exists() and blocked.exists():
        return _empty(root, [REASON_SUMS_INVALID, "ready_xor_blocked"])
    if blocked.exists():
        state = json.loads(blocked.read_text(encoding="utf-8"))
        return _empty(root, [REASON_HANDOFF_BLOCKED, *(state.get("reason_codes") or [])])

    oversized = [
        f"{p.relative_to(root).as_posix()}:{p.stat().st_size}"
        for p in root.rglob("*")
        if p.is_file() and p.stat().st_size > MAX_FILE_BYTES
    ]
    if oversized:
        return _empty(root, [REASON_PAYLOAD_TOO_LARGE, *oversized])

    sum_errors = verify_sums(root)
    if sum_errors:
        return _empty(root, [REASON_SUMS_INVALID, *sum_errors])

    payload = json.loads((root / "payload.json").read_text(encoding="utf-8"))
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(manifest, dict):
        return _empty(root, [REASON_SCHEMA_UNKNOWN, "payload_or_manifest_not_an_object"])

    reasons: list[str] = []
    if payload.get("schema") not in ACCEPTED_PAYLOAD_SCHEMAS:
        reasons.append(REASON_SCHEMA_UNKNOWN)
    if payload.get("catalog_mode") != CATALOG_OFFICIAL_LIVE:
        reasons.append(REASON_NOT_OFFICIAL_LIVE)
    if payload.get("data_state") != DATA_READY:
        reasons.append(REASON_NOT_DATA_READY)
    if payload.get("publication_readiness") != DATA_READY:
        reasons.append(REASON_NOT_PUBLISHABLE)
    if manifest.get("index_authorization") or manifest.get("publication_authorization"):
        # The producer must never grant INDEX. If it claims to, refuse the pack.
        reasons.append(REASON_PRODUCER_CLAIMS_INDEX)
    leaks = identity_leaks(payload)
    if leaks:
        reasons.append(REASON_IDENTITY_LEAK)
        reasons.extend(leaks[:5])

    if reasons:
        return _empty(root, reasons)

    return {
        "records": [payload],
        "source_kind": SOURCE_OFFICIAL_LIVE,
        "reason_codes": [],
        "handoff": {
            "decision": "READY",
            "producer_commit": manifest.get("producer_commit"),
            "content_hash": manifest.get("content_hash"),
            "dossier_id": manifest.get("dossier_id"),
        },
        "test_only": False,
    }


def _empty(root: Path, reasons: list[str]) -> dict[str, Any]:
    return {
        "records": [],
        "source_kind": SOURCE_ABSENT,
        "reason_codes": reasons,
        "handoff": {"root": str(root), "decision": "BLOCKED"},
        "test_only": False,
    }


def load_approvals(path: Path | None = None) -> dict[str, Any]:
    from scripts.market_panorama import APPROVALS_PATH

    target = path or (_root() / APPROVALS_PATH)
    if not target.exists():
        return {}
    data = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, dict)}
