# Message architecture, CONFENGE-VALUE-COMMUNICATION-2040-01

## Nuclear thesis

A CONFENGE atua como **diretoria B2G fracionada** para construtoras e empresas de engenharia. Integra inteligência de mercado, decisão de participação, preparação de proposta, proteção de margem e gestão de riscos contratuais. A tecnologia reduz trabalho mecânico; a responsabilidade pela recomendação permanece humana.

## Tagline

Decisão técnica. Contrato rentável. Margem protegida.

## Source of truth

- `data/site/brand.json`, positioning, hero, offers, FAQ, CTAs, navigation, forbidden phrases
- `data/site/proof.json`, claims gate (only `VERIFIED` + `public_allowed`)
- `data/site/cases.json`, cases (only `APPROVED` + client authorized)
- `data/site/message-experiments.json`, sequential experiment registry
- `scripts/site/brand.py`, loaders and validators
- `scripts/pseo/html_shell.py`, header/footer/org JSON-LD from brand

## Offer architecture

| ID | Label | URL |
| --- | --- | --- |
| diagnostico-b2g-360 | Entrada | `/diagnostico-b2g-360/` |
| diretoria-b2g | Operação principal | `/diretoria-b2g/` |
| bid-room | Oportunidade crítica | `/bid-room-licitacoes-obras/` |
| contract-defense | Contrato crítico | `/defesa-margem-contratos-publicos/` |

## Home order

1. Hero  
2. Economic problem (3 ways to lose money)  
3. What CONFENGE operates  
4. Offers  
5. 8-moment journey  
6. Differentiation (platform vs CONFENGE)  
7. Authority  
8. Measurable proof (no fabricated cases)  
9. Content & intelligence  
10. ICP + contraindications  
11. FAQ  
12. Final CTA  
13. Form (stage + urgency)

## Technology framing

Never productize `extra-cli`. Public language: sistema proprietário de inteligência e evidência / memória operacional / monitoramento estruturado / infraestrutura de dados.
