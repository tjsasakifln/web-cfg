"""WEB-032 Search Ads canary — prepare-only sensor package.

Live verbs: score, package, preflight, dry-run.
There is no mutate, spend, authorize, or Ads API client.
"""

from scripts.paid_search.dry_run import dry_run
from scripts.paid_search.family import score_family, select_family
from scripts.paid_search.kill import evaluate_kill_conditions
from scripts.paid_search.package import build_package, validate_package
from scripts.paid_search.preflight import preflight

__all__ = [
    "build_package",
    "dry_run",
    "evaluate_kill_conditions",
    "preflight",
    "score_family",
    "select_family",
    "validate_package",
]
