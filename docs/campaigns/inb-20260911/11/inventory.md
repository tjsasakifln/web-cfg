# INB-11 — inventário curto (antes de implementar)

Data: 2026-09-11. Base: `origin/main` `8f508544835490ec635d02517bce0207c6f8e426`.

## Preservado

- Destinos de compra já públicos: `/quantitativos-orcamento-obras/`, `/servicos/#servico-projeto`, `/casos/modelo-base-quantitativa-canonica/`, `/entregas/`, `/triagem-tecnica/`.
- Allowlist e sanitização de atribuição em `netlify/functions/lib/lead-core.cjs` (`pickAttribution`, `ATTR_ALLOWLIST`).
- Evento `cta_click` no dicionário, camada engagement, não lead.
- OS de distribuição de imprensa (`scripts/distribution/`, `data/distribution/radar-outreach-kit.json`): prepare-only, `auto_send: false`. Não importar a lista de contatos nem disparar.
- Contato funcional existente (WhatsApp, e-mail, telefone, triagem).

## Lacuna real

- Não havia rota, família nem HTML de encaminhamento por escritório de arquitetura ou empresa de projeto.
- Destinos de entrega não tinham copiar/compartilhar o link da entrega com fallback sem JavaScript.
- Não havia conjuntos de referência reutilizando o piloto por URL/ID.
- Não havia rascunhos internos de abordagem nem plano humano de diretório, com envio proibido.

## Diferença observável desta missão

- Página `/parcerias-engenharia/` explica como encaminhar orçamento, revisão, compatibilização ou disciplina complementar sem transferir o cliente.
- Três kits apontam ao destino específico, a uma amostra existente (ou omitem amostra se INB-12 não estiver no tree) e à informação para conversar.
- Copiar/compartilhar o link da entrega, com URL canônico visível sem JS; parâmetros externos só na allowlist; recusa de PII e de destino fora de confenge.com.br.
- Rascunhos e plano de diretório ficam em `docs/campaigns/inb-20260911/11/`, fora do artefato público. Nenhum contato é disparado.

## Decisão de rota

`/parcerias-engenharia/` nasce porque a compra é distinta (encaminhar um recorte mantendo o cliente) e não havia equivalente. Não copia o conteúdo comercial de INB-12. Indexação pedida: pública; 16 aplica família, sitemap e allowlist do artefato.
