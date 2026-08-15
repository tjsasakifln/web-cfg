"""Manual-first earned distribution. The system prepares; a human sends."""

from scripts.distribution.gates import evaluate_fit, evaluate_utility, interpret_non_response
from scripts.distribution.metrics import metrics_payload
from scripts.distribution.outcomes import observed_or_unknown
from scripts.distribution.prepare import format_prepare_report, prepare, prepare_asset
from scripts.distribution.registry import load_registry, validate_registry
from scripts.distribution.schema import (
    ALLOWED_OUTCOMES,
    ALLOWED_TARGET_CLASSES,
    REQUIRED_TARGET_FIELDS,
    SchemaError,
    validate_outcome,
    validate_target_row,
)

__all__ = [
    "ALLOWED_OUTCOMES",
    "ALLOWED_TARGET_CLASSES",
    "REQUIRED_TARGET_FIELDS",
    "SchemaError",
    "evaluate_fit",
    "evaluate_utility",
    "format_prepare_report",
    "interpret_non_response",
    "load_registry",
    "metrics_payload",
    "observed_or_unknown",
    "prepare",
    "prepare_asset",
    "validate_outcome",
    "validate_registry",
    "validate_target_row",
]
