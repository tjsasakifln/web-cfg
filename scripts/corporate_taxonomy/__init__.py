"""Canonical corporate taxonomy contract for CONFENGE.

Nucleus content lives in versioned JSON. This package only validates.
"""

from scripts.corporate_taxonomy.validate import (
    TaxonomyError,
    load_committed_taxonomy,
    seal_taxonomy,
    validate_taxonomy,
)

__all__ = [
    "TaxonomyError",
    "load_committed_taxonomy",
    "seal_taxonomy",
    "validate_taxonomy",
]
