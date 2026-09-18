#!/usr/bin/env bash
# Sonda sintética autorizada (SYNTHETIC_MUTATING_AUTHORIZED), executada NO HOST de produção
# com as credenciais do runtime (EnvironmentFile do serviço), sem copiá-las nem imprimi-las.
# Uso (da estação): bash docs/campaigns/design-institucional/expansao/tools/probe_on_host.sh <expected_sha> <out.json> <contexts.json>
# contexts.json: lista de objetos {label, origem, asset_id, cta_id, route_family, jornada, estagio, landing_page}
set -euo pipefail
EXPECTED_SHA="$1"; OUT="$2"; CONTEXTS="$3"
HOST=ec-prod
scp -q scripts/site/synthetic_lead_probe.mjs "$HOST":/tmp/confenge-probe.mjs
scp -q "$CONTEXTS" "$HOST":/tmp/confenge-probe-contexts.json
ssh "$HOST" 'bash -s' "$EXPECTED_SHA" <<'REMOTE' > "$OUT.raw"
set -euo pipefail
EXPECTED_SHA="$1"
set -a; . /etc/confenge-web/runtime.env; set +a
export EXPECTED_SHA
python3 - <<'PY' > /tmp/confenge-probe-plan.sh
import json
for c in json.load(open('/tmp/confenge-probe-contexts.json')):
    env=' '.join(f"PROBE_{k.upper()}='{v}'" for k,v in c.items() if k!='label' and v)
    print(f"echo '### {c['label']}'; {env} node /tmp/confenge-probe.mjs https://confenge.com.br || true")
PY
bash /tmp/confenge-probe-plan.sh
rm -f /tmp/confenge-probe.mjs /tmp/confenge-probe-contexts.json /tmp/confenge-probe-plan.sh
REMOTE
python3 - "$OUT" <<'PY'
import json,sys
raw=open(sys.argv[1]+'.raw').read().split('\n'); out=[]; label=None
for line in raw:
    if line.startswith('### '): label=line[4:]; continue
    if line.startswith('{'):
        try: d=json.loads(line)
        except Exception: continue
        d['label']=label; out.append(d)
json.dump({"note":"sonda sintetica autorizada, executada no host de producao com credenciais do runtime (nao copiadas); saida agregada, sem PII","results":out},open(sys.argv[1],'w'),ensure_ascii=False,indent=1)
import os; os.remove(sys.argv[1]+'.raw')
for d in out: print(d['label'], d.get('state'), 'ok' if d.get('ok') else 'FAIL', [k for k,v in (d.get('checks') or {}).items() if not v])
PY
