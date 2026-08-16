"""Shipped SmartLic → CONFENGE equity inventory (web-cfg#62)."""

from .inventory import (  # noqa: F401
    ACTIONS,
    FAIL_CLOSED_ACTIONS,
    INVENTORY_PATH,
    READY_REDIRECT_ACTIONS,
    inventory_sha256,
    load_inventory,
    ready_redirects,
    validate_inventory,
)
