# Playwright probe — deploy preview PR #55

**Base:** https://deploy-preview-55--confenge.netlify.app  
**Runs:** 2 (consistent PASS)  
**Summary:** `summary.json`

## Surfaces

| Surface | Path | Assertions |
|---------|------|------------|
| Home | `/` | HTTP 200, logo, H1, primary CTA, form, nav |
| Hub | `/conteudos/` | single H1, 20 stage items, no empty dead-end |
| Tools | `/ferramentas/` | H1, tool links |
| Checklist | `/ferramentas/checklist-reequilibrio/` | HTTP 200, primary CTAs |
| SEO shell | `/` | canonical, robots meta |

## Fix validated in probe loop

`styles-tools.css` was 404 (not in public artifact allowlist). Fixed in commit `fix(tools): ship styles-tools.css…` — dual-run green after deploy.

## Form

Multistep form present (`data-form-multistep`), fields nome/email/telefone/estagio, submit control (soft fill only; no lead submit in probe).
