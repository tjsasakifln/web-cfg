"""Fail-closed validator for the issue #297 human-research protocol."""

from .validate import ValidationError, validate_package

__all__ = ["ValidationError", "validate_package"]
