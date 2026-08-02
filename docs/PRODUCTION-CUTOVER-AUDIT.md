# Production cutover audit

## Initial state

- HEAD: `06edd555fab77c96e8e69d624ec58f9f785cbda0`
- Public marker SHA: `06edd555fab77c96e8e69d624ec58f9f785cbda0` (parity already true at session start)
- Home H1: present
- Seven narrative blocks: present
- Four macrofases: present
- Retired strings: absent
- Defects: `/servicos` bad fragment; axe moderate region; lighthouse not_run; pSEO `BLOCKED_SNAPSHOT_PROVENANCE`; CSS dead legacy

## Changes shipped this cutover

1. Copy / CTA / em-dash closure + gates
2. Offer identity CTAs
3. CSS dead-rule removal (~24.2% bytes; safe dead set)
4. WhatsApp float inside `<aside class="contact-float">` landmark
5. Legacy URL disposition + redirect integrity
6. pSEO snapshot regenerated from extra-cli `main` (`704975a7`)
7. Production-cutover test, Lighthouse runner, CI workflow

## CSS

- Before: 72878 bytes
- After: 55216 bytes
- Reduction: 24.2%
- JS unchanged target: 28188 bytes

## pSEO

- Prior source_commit: `6fc5adcf` on deleted feature branch (not on main; commit missing on GitHub)
- Regenerated from extra-cli main `704975a7` with live datalake
- New dataset_hash: `4b5350997a6adfd7…`
- Scope change: national candidate inventory replaced by main durable export (SC-scale open set); all pages remain reject/noindex; publish_count=0; next_wave_gate stays false

## Verification commands

```bash
npm run build:site
npm run test:copy && npm run test:brand && npm run test:design
npm run audit:axe
npm run test:lighthouse
npm run test:production-cutover
npm run pseo:verify:release
```
