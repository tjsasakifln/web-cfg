"""CONFENGE_COMPOUNDING_STANDARD/1.0 growth accounting.

Deterministic 28-day closed-cohort generator. Never auto-emits
SCALE_ALLOWED. UNKNOWN never becomes zero.
"""

from scripts.growth_accounting.classify import classify_state
from scripts.growth_accounting.constants import (
    COHORT_DAYS,
    SCHEMA,
    SCHEMA_VERSION,
    TIMEZONE,
)
from scripts.growth_accounting.errors import GrowthAccountingError
from scripts.growth_accounting.report import build_report, render_markdown
from scripts.growth_accounting.serialize import canonical_dumps, sha256_canonical
from scripts.growth_accounting.validate import validate_input, validate_report

__all__ = [
    "COHORT_DAYS",
    "GrowthAccountingError",
    "SCHEMA",
    "SCHEMA_VERSION",
    "TIMEZONE",
    "build_report",
    "canonical_dumps",
    "classify_state",
    "render_markdown",
    "sha256_canonical",
    "validate_input",
    "validate_report",
]
