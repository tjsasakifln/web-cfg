# ADR-STRAT-003 — Panorama de mercado como família pública derivada do dossiê

- **Status:** Accepted
- **Date:** 2026-08-22
- **Decision owner:** CONFENGE
- **Relates to:** `ADR-STRAT-002` (superfície pública canônica), `RUNTIME-AUTHORITY.md`
- **Producer contract:** `docs/contracts/public-read-confenge-dossier-v1.md`

## Context

O `extra-cli` acumulou um DataLake de contratação pública que hoje alimenta
apenas prospecção. A oferta paga `CFG-DIAG-EXP-v1` (Diagnóstico B2G de
Expansão) promete mapa de compradores, concorrentes, painel de preços,
contratos a vencer e editais triados, e era produzida à mão.

Com o motor de dossiê (`extra-cli/scripts/dossier/`), o mesmo material passa a
existir como artefato versionado de grão **empresa** (`cnpj14`). Cada dossiê
produz duas coisas: a entrega paga, que identifica o cliente, e uma projeção
desidentificada, que descreve o mercado e não identifica ninguém.

Publicar a projeção transforma cada diagnóstico produzido em ativo público de
aquisição, sem custo editorial adicional e sem expor a empresa analisada.

## Decision

Criar a família pública `/panorama-mercado-obras-publicas/`, consumidora
fail-closed de `public-read-confenge-dossier/1.0`.

1. **O sujeito da página é o recorte de mercado, nunca a empresa.** A página
   nomeia órgãos públicos, que são registro público, e não nomeia a contratada
   nem os concorrentes. Um payload que carregue chave de identidade com valor
   real, ou qualquer CNPJ que não seja o da própria CONFENGE, é recusado
   inteiro.
2. **O produtor nunca concede INDEX.** Um manifesto que afirme
   `index_authorization` é recusado como malformado. `DATA_READY` autoriza no
   máximo um rascunho `noindex`.
3. **INDEX é decisão deste repositório, por página, vinculada ao hash do
   payload.** A aprovação vive em `data/editorial/market-panorama/approvals.json`
   e expira sozinha quando fatos novos mudam o hash.
4. **Ausência de observação não vira ausência de fato.** `UNKNOWN` não é zero,
   e as limitações declaradas pelo produtor são reproduzidas na página.
5. **Onde a categoria não é comparável, nenhuma posição é declarada.** A escada
   de categorias do DataLake é grosseira: manutenção viária e material de
   limpeza caem no mesmo balde. Quando a mediana da empresa fica mais de 10x
   fora da faixa interquartil do painel, a página diz que não há posição
   percentílica, em vez de publicar uma que seria verdadeira e inútil.

## Boundary check contra o ADR-STRAT-002

| Fronteira | Como esta família a respeita |
| --- | --- |
| `confenge.com.br` é a única superfície pública | a família nasce dentro deste repositório e deste domínio |
| `extra-cli` é dono dos fatos | consumo `SELECT`-only via rendezvous versionado; nenhum crawler, nenhum DataLake paralelo, nenhum segundo modelo de identidade |
| `warmbly` é dono da ação comercial | a página emite `CONFENGE_WEB` pelo caminho de captura já existente; nada aqui dispara envio |
| expansão programática exige utilidade e gates | uma página por dossiê realmente produzido, com proveniência, frescor, gate editorial e `noindex` por padrão; contagem de páginas não é métrica |

## Consequences

- Cada diagnóstico vendido gera, sem trabalho adicional, um ativo público de
  aquisição. O motor de conteúdo passa a ser o motor de entrega.
- A família só cresce quando há cliente ou prospecto real diagnosticado. Ela
  não pode ser inflada: sem dossiê `official_live` não há página.
- O gate de INDEX cria uma fila de revisão humana. Isso é deliberado; o custo
  de publicar uma leitura errada sobre contratação pública é maior do que o
  custo de revisar.
- Se o `extra-cli` mudar a semântica de um campo dentro de `1.0`, esta família
  passa a renderizar um fato com significado diferente sem perceber. Mitigação:
  o contrato é `additive_nullable_within_v1` e mudança de significado exige
  versão nova nos dois lados.
