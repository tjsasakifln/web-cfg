"""Market-panorama family: fail-closed consumer of extra-cli `public-read-confenge-dossier/1.0`.

extra-cli owns the facts. This family renders the de-identified projection as a
public market panorama and owns only the editorial decision, never the data.

The producer never grants INDEX. `publication_readiness=DATA_READY` is
necessary and not sufficient: an INDEX decision needs an individual approval
here, bound to the payload content hash.
"""

from __future__ import annotations

PAYLOAD_SCHEMA = "public-read-confenge-dossier/1.0"
HANDOFF_SCHEMA = "authority-handoff-confenge-dossier/1.0"
ACCEPTED_PAYLOAD_SCHEMAS = (PAYLOAD_SCHEMA,)

FAMILY_SLUG = "panorama-mercado-obras-publicas"
FAMILY_PATH = f"/{FAMILY_SLUG}/"
ROUTE_FAMILY = "panorama-mercado"
ASSET_FAMILY = "panorama-mercado-obras-publicas"
FAMILY_LABEL_PT = "Panorama de mercado"

RENDEZVOUS_FAMILY = "confenge-dossier"
RENDEZVOUS_CHANNEL = "official-live-01"
SUMS_NAME = "SHA256SUMS.txt"

STATE_INDEX = "PUBLISHABLE_INDEX"
STATE_NOINDEX = "PUBLISHABLE_NOINDEX"
STATE_BLOCKED = "BLOCKED"

DATA_READY = "DATA_READY"
DATA_HOLD = "DATA_HOLD"
DATA_REJECT = "DATA_REJECT"

CATALOG_FIXTURE = "fixture"
CATALOG_OFFICIAL_LIVE = "official_live"

SOURCE_OFFICIAL_LIVE = "official_live"
SOURCE_FIXTURE = "test_only_fixture"
SOURCE_ABSENT = "absent"

APPROVALS_PATH = "data/editorial/market-panorama/approvals.json"

DISCLAIMER_PT = (
    "Panorama editorial construído a partir de dados públicos de contratação. "
    "Não identifica empresa contratada, não implica relação comercial da CONFENGE "
    "com qualquer parte e não afirma direito, desequilíbrio ou valor devido."
)

REASON_NO_HANDOFF = "no_official_handoff"
REASON_HANDOFF_BLOCKED = "handoff_blocked"
REASON_SUMS_INVALID = "sha256sums_invalid"
REASON_SCHEMA_UNKNOWN = "payload_schema_not_accepted"
REASON_NOT_OFFICIAL_LIVE = "payload_not_official_live"
REASON_NOT_DATA_READY = "payload_not_data_ready"
REASON_NOT_PUBLISHABLE = "payload_not_publication_ready"
REASON_IDENTITY_LEAK = "payload_carries_identity"
REASON_PAYLOAD_TOO_LARGE = "payload_too_large"
REASON_NO_APPROVAL = "no_individual_index_approval"
REASON_APPROVAL_HASH_DRIFT = "approval_hash_drift"
REASON_PRODUCER_CLAIMS_INDEX = "producer_claimed_index_authorization"
