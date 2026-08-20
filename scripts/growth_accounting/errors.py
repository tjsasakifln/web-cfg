"""Fail-closed errors. Never swallowed into a compounding claim."""

from __future__ import annotations


class GrowthAccountingError(ValueError):
    """Input or report failed a fail-closed gate."""

    def __init__(self, reason: str, message: str | None = None):
        self.reason = reason
        self.message = message or reason
        super().__init__(self.message)
