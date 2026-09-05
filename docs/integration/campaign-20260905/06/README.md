# MV-06 — candidatos de perícias, avaliações e SST

```text
CONFENGE_MV_CAMPAIGN=06
READY_FOR_INTEGRATION=YES
PUBLICATION_AUTHORITY=MV-09_ONLY
BASE_SHA=470a5ffafeaf45a59649109742ce5885f9789328
```

## Resultado

Foram preparados três candidatos comerciais `noindex`, sem alteração de home, navegação, formulário, registro de famílias, sitemap, CSS global ou rota pública:

1. `/pericias-assistencia-tecnica/` — assistência da parte separada de perito nomeado pelo juízo, com respostas por fase do caso;
2. `/avaliacoes-imoveis/` — finalidade, data de referência, imóvel, documentação, vistoria, método/norma e tipo de documento antes de qualquer conclusão;
3. `/seguranca-trabalho/` — enquadramento que separa PGR, LTCAT, ergonomia, NR-15/NR-16, eSocial e dependências multidisciplinares.

Subintenções permanecem em seções e âncoras. A amostra de SERP não justificou criar páginas por documento, comprador ou cidade. Cem repetições devem alimentar três taxonomias de enquadramento e motivos de aceite/recusa, não cem páginas artesanais.

## Hipótese comercial e visitor jobs

| Família | Situação reconhecida | Próximo estado útil | Hipótese de aquisição/conversão |
| --- | --- | --- | --- |
| Perícias | há prazo, diligência, laudo ou dúvida técnica antes do litígio | papel, conflito, documento e escopo enquadrados | busca/indicação de alta intenção converte melhor quando o visitante entende a diferença entre assistente e perito do juízo e vê o artefato que receberá |
| Avaliações | uma decisão patrimonial precisa de conclusão técnica sobre imóvel | finalidade, data, destinatário, campo e documento enquadrados | remover promessa de “número rápido” e explicar o uso do documento deve qualificar demanda e reduzir objeção de aceitação universal |
| SST | a empresa pede um documento, mas o problema real e as disciplinas ainda estão misturados | estabelecimento, risco, base existente, campo e especialistas enquadrados | desfazer equivalências PGR/LTCAT/eSocial e mostrar limites clínicos aumenta confiança e evita proposta inviável |

North Star: oportunidade comercial qualificada conectável a proposta e receita. O contato, a página ou o clique isolado não contam como sucesso.

## Autoridades e contratos

- Superfície pública: `web-cfg` / `confenge.com.br`, conforme ADR-STRAT-002.
- Marca: somente CONFENGE; nenhuma referência ou handoff SmartLic.
- Taxonomia de núcleos: IDs consumidos do candidato arquitetural do PR #590; MV-09 deve usar a versão efetivamente integrada, sem duplicar a taxonomia.
- Oferta e limites: #583. IDs de oferta permanecem `null` até o owner canônico defini-los.
- Prova profissional: `data/site/credential-registry.json` integrado em #604, #581/#243 e eventual complemento da MV-02. Claims `WITHHELD` ficam ausentes.
- Conflitos: #585. Autos, partes, processos e corpus substantivo só após triagem em canal protegido.
- Captura: MV-03 deve fornecer o formulário multi-vertical; fonte normalizada `CONFENGE_WEB`.
- Ação comercial posterior: Warmbly. Esta campanha não cria CRM, fila, cadência, dispatch ou autorização de outbound.
- Dados/fatos: não há dataset nem aquisição externa nesta entrega. As referências oficiais sustentam explicações gerais; não existe contrato SELECT-only novo com `extra-cli`.

## Analytics proposto

Eventos do contrato integrado: `service_page_view`, `cta_click`, `whatsapp_click`, `email_click`, `lead_form_start`, `lead_form_submit` e `lead_persisted`. Dimensões permitidas: `route_family`, `nucleus_id`, `cta_id`, `cta_position`, `channel` e `landing_page`. Nome, contato, CNPJ, número do processo, partes, documentos e dados de trabalhadores não entram em eventos.

Os links diretos servem somente à avaliação desta prévia. A ação terminal declarada para publicação é `capture_form`: antes de indexar, MV-09 deve integrar a captura protegida da MV-03, manter `source=CONFENGE_WEB`, consentimento e recibo, e provar o aceite pelo contrato externo. Inbound não autoriza outbound; `auto_send=false`.

## Gates e estado de publicação

Os três HTMLs permanecem com `noindex,nofollow` e sem canonical. MV-09 só remove esse bloqueio no mesmo commit que:

- promove os arquivos para as três rotas exatas;
- consome os IDs/limites de oferta de #583;
- projeta prova verificável da MV-02, especialmente título/atribuição para SST;
- integra formulário, consentimento, recibo e atribuição da MV-03;
- aplica a política de conflitos generalizada de #585;
- registra as famílias públicas;
- adiciona canonical/sitemap e executa gates de copy, verdade, acessibilidade, conversão, analytics e inbound.

Não há preço. Nenhuma exceção de dívida comercial é solicitada.

## Evidências deste producer

- [Pesquisa real e fontes oficiais](research.md)
- [Matriz de prova e fronteiras](proof-boundary-matrix.md)
- [Manifesto legível por máquina](candidate-manifest.v1.json)
- [Fragmentos para MV-09](fragments/README.md)
- [Estado real e validação](validation.md)
- Screenshots desktop, mobile, prova e contato em `evidence/screenshots/`
- Testes autocontidos em `tests/campaigns/mv-06/`

## Rollback

Antes da publicação, excluir o pacote candidato não altera a produção. Depois da integração, retirar ou reverter cada rota por URL exata e restaurar o SHA anterior; não redirecionar em massa. Leads já aceitos continuam no owner comercial e não são apagados pelo rollback da página.

ADR afetado: ADR-STRAT-002 (somente consumo da superfície canônica; nenhuma mudança arquitetural nesta branch). Decisão: `EXECUTE_NOW`; estado de entrega: candidatos `noindex`, com publicação reservada à MV-09.
