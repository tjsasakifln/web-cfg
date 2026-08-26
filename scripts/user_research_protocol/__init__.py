"""Fail-closed validator for the active #183/#184 human-research protocols."""

from .validate import ValidationError, validate_package

__all__ = ["ValidationError", "validate_package"]
