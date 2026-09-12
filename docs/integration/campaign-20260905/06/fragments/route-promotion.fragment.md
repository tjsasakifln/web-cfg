# Fragmento — promoção das rotas pela MV-09

## Mapa de arquivos

| Candidato | Target público |
| --- | --- |
| `public-candidates/pericias-assistencia-tecnica/index.html` | `pericias-assistencia-tecnica/index.html` |
| `public-candidates/avaliacoes-imoveis/index.html` | `avaliacoes-imoveis/index.html` |
| `public-candidates/seguranca-trabalho/index.html` | `seguranca-trabalho/index.html` |
| `public-candidates/candidate.css` | não copiar como novo CSS global; portar os componentes para o sistema integrado da MV-09 ou provar um asset versionado sem duplicação |

## Transformações necessárias

- trocar o shell mínimo pelo header/footer canônico já integrado, sem recriar nav nesta campanha;
- resolver CSS, ícones e assets sob o build público;
- inserir formulário compartilhado da MV-03 dentro de `<main>` mantendo WhatsApp como alternativa;
- ligar `route_family`, `nucleus_id`, offer ID canônico, landing e next-action ao contrato de captura;
- projetar credenciais verificadas conforme `authority-proof.fragment.md`;
- usar a política de conflitos generalizada de #585 e bloquear corpus substantivo na primeira etapa;
- adicionar Organization/Person/Service/WebPage/Breadcrumb schema com paridade visível e sem claim não provado;
- inserir self canonical exato e retirar `noindex,nofollow` somente no commit de promoção aprovado;
- aplicar os três objetos de `public-family-registry.fragment.json`;
- adicionar cada URL ao sitemap somente após a rota correspondente passar todos os gates;
- não criar páginas por cidade, documento, função, norma ou estágio do caso.

## Gates mínimos por rota

1. `python scripts/site/test_public_plain_language.py`
2. `npm run test:copy`
3. `npm run test:html-integrity`
4. `npm run test:analytics`
5. `npm run test:form-funnel`
6. `npm run test:inbound-handoff`
7. `npm run inbound:gates`
8. `npm run build:site`
9. auditoria de acessibilidade e viewport móvel/desktop
10. verificação de links oficiais, canonical, sitemap e rota 200 no artefato

## Regra de promoção e rollback

As rotas podem ser promovidas separadamente. Uma rota que não tenha oferta, prova, conflito e captura resolvidos continua candidata `noindex`; isso não bloqueia outra rota pronta. Rollback é por URL e SHA, sem redirecionamento para a home e sem apagar recebimentos já aceitos pelo owner comercial.
