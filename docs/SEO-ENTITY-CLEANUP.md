# SEO entity cleanup

## Problem

Search representations still mixed legacy CONFENGE services (avaliações imobiliárias, AVCB/CLCB, generic IA) with current Diretoria B2G positioning.

## Disposition policy

| Code | Meaning |
|------|---------|
| 301 | Semantic substitute exists |
| 410 | Service ended; no B2G equivalent (never soft-404 to home) |
| 200 | Keep / update on-brand |
| 404 | Unknown without relevant history |

## Critical fixes

- `/servicos` → `/#como-atuamos` (real fragment; was `/#atuacao`)
- Abandoned product paths remain 410: `/vision`, `/nexgen`, `/avcbclcb`, plus `/avcb`, `/clcb`, `/avaliacoes*`, `/ia`, `/automacao`, …
- Soft-404 to B2G home **not** used for AVCB / imobiliário / IA genérica

## Inventory

See `docs/legacy-url-map-complete.csv` (complete disposition table).

## Entity surfaces checked

- Organization / Person / Service / WebSite / WebPage JSON-LD on home and offers
- Contact: tiago.sasaki@confenge.com.br, +55 48 98834-4559, CNPJ 52.407.089/0001-09
- No “CONFENGE Avaliações e Projetos” on current commercial HTML

## Search Console actions (manual)

1. Temporarily remove / request outdated legacy URLs that return 410 after deploy.
2. Request reindex of home, four offers, especialista, privacidade.
3. Monitor `site:confenge.com.br` for residual imobiliário/AVCB/IA snippets.

## Sitemap

`build:site` regenerates sitemaps from current registry; 410 paths are not linked internally and are not in sitemap.
