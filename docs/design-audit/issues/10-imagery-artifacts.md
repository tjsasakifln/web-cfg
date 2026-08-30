Parent: #493

## Decision state

**P2 / VALIDATE_ASSET_SYSTEM** · Front: INBOUND COMPOUNDING / trust · Time to evidence: small licensed/provenance registry + 3 canary assets · Leverage: trust, distribution e data.

**Visitor job:** ver o assunto técnico, a evidência e a origem do visual, não uma imagem que apenas ocupa espaço.  
**Hypothesis:** fotografia documental e artefatos CONFENGE com provenance tornam a marca memorável e defensável.  
**100 repetitions:** registry/license/purpose pipeline melhora o sistema; procurar 100 stocks ou gerar 100 ilustrações cria risco e trabalho.

## Problem

O site é majoritariamente UI-only. Entregas, ferramenta e inteligência usam praticamente apenas logos; money pages usam capas textuais/gradients; home possui retrato real e blocos de prova, mas pouca imagem documental. Não existe contract versionado de purpose, provenance, freshness, license, crop, alt e rollback para fotografia, documento, mapa, tabela, gráfico ou diagrama.

## Contemporary evidence

- Source `origin/main@b4cafc4…`; nove rotas live/screenshots em `7500d7b…`; o delta #483 não altera arquivos visuais públicos.
- Screenshots live: corpus de 18 capturas em `/tmp/confenge-design-audit-20260830/`; retrato/trust `849b47…`/`4c4c83…`, home `46970e…`/`01b712…`, money `ca9ab1…`/`17a7c0…`.
- Image counts incluem 2 logos na maioria; home 3 imagens, trust 3 com retrato real.
- Selectors/assets: `.article-cover`, `.authority-photo`, `.profile-mark`, `/assets/clusters/*.jpg`, report/demo assets.
- Tell: generic cover, UI-only composition, abstract technical potential.
- Keep: real portrait, honest synthetic examples, public source blocks; no corporate stock currently.

## Desired perception

Documental, factual e brasileira: obra, contrato, medição, planilha, cronograma, mapa, relatório e fonte pública escolhidos/editados com intenção.

## Design hypothesis

Um artifact/imagery registry com classes `photograph`, `document excerpt`, `map`, `table/chart`, `diagram`, `CONFENGE artifact`, cada uma com purpose, owner, source/provenance, date/freshness, license, privacy/redaction, alt/`alt=""`, crop e allowed placements.

## Constraints

No stock cliché/AI filler; LGPD/confidentiality; source/license; public facts from extra-cli; no fake client document; asset performance/CWV; alt semantics; synthetic label; responsive crop; correction/revocation/rollback.

## Scope

- audit current informative/decorative assets and rights;
- design registry/schema and 3 canary assets: commercial artifact, editorial figure, public-data visual;
- define photography commissioning/licensing brief if real photography is needed;
- rules for crop, caption, annotation, redaction, source/freshness/license/alt;
- integration remains within canary issues; this issue creates system/assets, not sitewide placement.

## Out of scope

Stock workers/tablet/handshake/helmet/skyline; unlicensed scrape; generative filler; fictional dashboard/report/client; decorative CAD; photo shoot procurement without owner/budget; sitewide rollout.

## Acceptance

- [ ] every current/new asset is informative or decorative with explicit purpose;
- [ ] informative asset has source/provenance, date/freshness when applicable, license, owner and alt/caption;
- [ ] decorative asset has justification and `alt=""`;
- [ ] confidential/client material is permissioned/redacted or rejected; synthetic remains labelled;
- [ ] three canary assets answer named questions and survive counterfactual;
- [ ] no asset exists only to fill hero/card whitespace;
- [ ] responsive crops preserve subject/context and do not overlay unreadable text;
- [ ] dimensions/formats/cache/license registry and performance budget pass;
- [ ] correction/revocation removes visible, schema, cache and references where applicable;
- [ ] review answers eight human-crafted questions.

## Before / After evidence

Contact sheet/placement at 390×844, 768×1024, 1024×768 and 1440×1000; asset manifest with hash, source, license, purpose, alt/caption, crop and page SHA.

## Responsive

Art-directed crop per breakpoint only when registered; no text rasterization; figure/table alternative usable in mobile.

## Accessibility

Correct alt/empty alt, caption/source association, contrast for annotation, no information only in image/color; reduced data fallback when material.

## Performance

AVIF/WebP/raster/vector choice, explicit dimensions, lazy/fetchpriority by placement, cache and payload budget; no LCP/CLS regression.

## Analytics and data contracts

No image-derived PII in analytics. Public facts/provenance owner remains extra-cli; asset engagement event only if decision-relevant and allowlisted.

## Rollback

Registry-driven remove/revert restores typography/layout fallback; revoke asset by exact hash/placement without breaking page.

## Dependencies

`depends_on: #494; coordinates_with: #497, #499, #500, #501`  
`unblocks: #504 and domain-derived visual identity`

## Perceptual leverage

`HIGH`

## Effort

`M`

## Human-crafted review

1. Específica? 2. Layout works without card? 3. Visual communicates? 4. Type/figure relation clear? 5. Rhythm? 6. CONFENGE without logo? 7. Generic AI visual? 8. Prompt result?

Não atribuir julgamento a pessoa sem pesquisa real.

## PR evidence and ADR

Visitor job, acquisition/trust hypothesis, asset/data owner/license, gates, analytics, rollback e ADR-STRAT-002; update ADR before any boundary-crossing source/runtime.
