#!/usr/bin/env bash
# approve_wave1_tiago.sh — HUMAN ONLY
# Created by automated Wave 1 audit. Existence of this script is NOT approval.
# Do NOT run as CI, agent, or proxy for Tiago Sasaki.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "============================================================"
echo "Este script deve ser executado pessoalmente por Tiago Sasaki"
echo "após leitura do FINAL-HUMAN-REVIEW-PACKET.md."
echo "============================================================"
echo ""

# Refuse dirty tree on audited material files
MATERIAL_PATHS=(
  data/editorial/pages
  data/editorial/SOURCE-MANIFEST.json
  data/editorial/sources
  data/editorial/EDITORIAL-REGISTRY.json
  scripts/editorial
  lei-14133-obras
  guias-contratos-obras
  jurisprudencia-contratos-obras
  sitemap-editorial.xml
  sitemap-jurisprudencia.xml
)

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not a git repository" >&2
  exit 1
fi

dirty="$(git status --porcelain -- "${MATERIAL_PATHS[@]}" || true)"
if [[ -n "${dirty}" ]]; then
  echo "ERROR: uncommitted changes in audited material paths. Commit or stash first." >&2
  echo "${dirty}" >&2
  exit 1
fi

REVIEWER="Tiago Sasaki"
APPROVED=()

approve_one() {
  local page_id="$1"
  local notes="$2"
  local sources="$3"
  echo "---- Approving: ${page_id} ----"
  python3 scripts/editorial/approve_cli.py \
    --page-id "${page_id}" \
    --reviewer "${REVIEWER}" \
    --notes "${notes}" \
    --sources "${sources}" \
    --indexable
  APPROVED+=("${page_id}")
  echo "OK ${page_id}"
}

approve_one "lei-art124-alteracao-obra" "Art.124 I/II conferidos no Planalto; sem vínculo societário no II; arts.125-126-132 e 136 III OK; CTAs e ressalvas OK." "lei-14133-art124,lei-14133-art125,lei-14133-art126-132,lei-14133-art136,lei-14133-planalto,agu-alteracoes-contratuais-2024,lei-14133-art135"
approve_one "lei-limite-25-50" "Art.125 25% e 50% só reforma edifício/equipamento; base valor inicial atualizado; art.126 não transfigura." "lei-14133-art125,lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024"
approve_one "lei-item-novo-desconto" "Art.127 relação proposta/orçamento-base; desconto da proposta não automático; limites art.125 no aditamento." "lei-14133-art126-132,lei-14133-art124,lei-14133-planalto,agu-alteracoes-contratuais-2024,sinapi-caixa,lei-14133-art125"
approve_one "lei-reequilibrio-reajuste" "Art.135 só serviços contínuos mão de obra; reajuste art.6 LVIII; arts.130-131 e 136 I; sem repactuação genérica de obra." "lei-14133-art130-131,lei-14133-art135,lei-14133-art136,lei-14133-art6-definicoes,lei-14133-art92,lei-14133-art134,lei-14133-planalto"
approve_one "lei-atraso-administracao" "Art.115 §1 Planalto: posse chefe Executivo/novo titular (não posse provisória); prova e nexo; sem reequilíbrio automático." "lei-14133-art115,lei-14133-planalto,lei-14133-art130-131,lei-14133-art124"
approve_one "lei-parcela-incontroversa" "Art.143 parcela incontroversa no prazo; art.141 ordem cronológica; individualização de valores na medição." "lei-14133-art141-143,lei-14133-planalto"
approve_one "lei-servico-sem-aditivo" "Art.132 formalização do aditivo; art.124 justificativas; art.125 obrigação de aceitar nos limites; risco de execução informal." "lei-14133-art124,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024,lei-14133-art125"
approve_one "guia-checklist-aditivo" "Checklist docs arts.124-125; sem promessa de deferimento; CTAs com origem e documentos a enviar." "lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024"
approve_one "guia-docs-reequilibrio" "Dossiê arts.130-131; repactuação 135 distinta; nexo e matriz; sem promessa de êxito do pedido." "lei-14133-art130-131,lei-14133-art135,lei-14133-art136,lei-14133-planalto"
approve_one "guia-glosa" "Contestação glosa + art.143 parcela incontroversa; prova e critério de medição; sem garantia de anulação da glosa." "lei-14133-art141-143,lei-14133-planalto"
approve_one "guia-notificacao-atraso" "Roteiro resposta notificação; art.115 §1 texto Planalto corrigido; arts.155-156 contexto sanção sem promessa de afastamento." "lei-14133-art115,lei-14133-planalto"

echo ""
echo "============================================================"
echo "Páginas aprovadas e marcadas INDEXABLE:"
for p in "${APPROVED[@]}"; do
  echo "  - ${p}"
done
echo "Total: ${#APPROVED[@]}"
echo "Próximo: npm run editorial:build && npm run editorial:test"
echo "Confirme jur-sumula-260-art permanece REJECTED e fora dos sitemaps."
echo "============================================================"
