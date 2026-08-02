# INITIAL-VISUAL-AUDIT

**Base SHA:** ff7ba69be9d79348b7d6461d4f0ba6bde942562f  
**Date:** 2026-08-01  
**Branch:** feat/confenge-premium-design-remediation

## Diagnosis

The prior campaign fixed B2G positioning but left a generic consultancy template:

| Metric (home) | Before |
| --- | --- |
| problem-card | 3 equal |
| operates-card | 4 equal + icons |
| offer-card | 4 near-equal (featured flag weak) |
| journey-step | 8 boxes |
| metric-card | 8 equal |
| home-cluster-card | 6 |
| section-heading (eyebrow+H2+side p) | 7 |
| Uniform `.section{padding:112px 0}` | yes |
| Light green / green borders | overused |
| Internal language | Arquitetura de ofertas, Sem cases fabricados, owners, red team, post-mortem, invalid jobTitle |

## Perceptual issues

- Monotone section rhythm
- Cards as default structure
- SaaS-like hero panel
- Weak hierarchy (Diretoria not dominant enough)
- Low materiality of engineering method
- Low exclusivity / high “AI landing page” risk

## Semantic defects

- `jobTitle`: “Engenheiro Civil e Diretoria B2G fracionada”
- Offer pages shallow (~105 lines), near-identical three-list layout

## Baseline screenshots

Captured under `screenshots/` where browser available; see VISUAL-REGRESSION.md.
