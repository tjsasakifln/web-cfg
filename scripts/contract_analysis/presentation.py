"""Project authorized institutional chrome over the immutable factual snapshot."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AMENDMENT = ROOT / 'data/commercial/contract-analysis-presentation-amendment.v1.json'


def project_approved_snapshot(snapshot: str) -> str:
    amendment = json.loads(AMENDMENT.read_text(encoding='utf-8'))
    normalized = snapshot.replace('\r\n', '\n')
    digest = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    if digest != amendment['snapshot_sha256']:
        raise ValueError('institutional_projection_snapshot_mismatch')
    if not (ROOT / amendment['authorization']).is_file():
        raise ValueError('institutional_projection_authorization_missing')
    before = amendment['prefill_before']
    if normalized.count(before) != amendment['prefill_occurrences']:
        raise ValueError('institutional_projection_prefill_scope_mismatch')
    from scripts.site.shell_nav import load_brand, sync_text
    projected = sync_text(normalized, load_brand(), amendment['route'])
    return projected.replace(before, amendment['prefill_after'])
