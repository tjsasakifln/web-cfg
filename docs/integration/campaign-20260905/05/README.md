# MV-05 — engenharia privada de alta intenção

`CONFENGE_MV_CAMPAIGN=05`
`READY_FOR_INTEGRATION=YES`

Este pacote entrega candidatos isolados. Ele **não publica**, não altera o checkout público, não cria rota no root, não muda registry, navegação, sitemap, formulário ou runtime. A promoção pertence à MV-09 e continua condicionada aos gates descritos abaixo.

## Estado observado

- Repositório: `tjsasakifln/web-cfg`; remoto: `origin`.
- Branch: `feat/mv-05-private-engineering-revenue-pages-20260905`.
- `BASE_SHA`: `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb` (`origin/main` em 05-09-2026).
- Produção observada em 05-09-2026: `confenge.com.br`, Cloudflare diante de `confenge-nginx-node/v2`, release `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`; `node scripts/site/runtime_authority.mjs --live` retornou `ok: true`.
- Issues de origem: [#602](https://github.com/tjsasakifln/web-cfg/issues/602) aberta, P1/VALIDATE; [#583](https://github.com/tjsasakifln/web-cfg/issues/583) aberta, modelagem EXECUTE_NOW e escala VALIDATE.
- Dependências lidas, não copiadas: PRs #590 (taxonomia), #594 (catálogo), #597 (shell de núcleos) e #604 (prontidão, confiança e triagem). Durante a execução, #604 foi integrado em `origin/main` como `470a5ffafeaf45a59649109742ce5885f9789328`; `site-ci`, pSEO e release estavam em execução e a produção ainda servia o SHA anterior. #590, #594 e #597 permaneciam abertas.

## Decisão da campanha

**P1 / VALIDATE.** Frente: receita e conversão inbound. Tempo para evidência: 30 dias após liberação controlada de cada rota, medindo oportunidade comercial qualificada ou desqualificação explícita — nunca pageview, clique ou volume de páginas. Alavancas: receita, confiança, distribuição e dados de intenção.

Arquitetura mínima: um hub e três páginas por decisão do comprador.

| Candidato | Trabalho do visitante | Hipótese | Próxima ação pública |
| --- | --- | --- | --- |
| `/engenharia-projetos-obras/` | Escolher o recorte técnico adequado para projeto, custo ou edificação existente. | Uma escolha por momento reduz pedidos genéricos e encaminha cada demanda ao artefato certo. | **Enquadrar uma demanda de projeto ou obra** |
| `/compatibilizacao-revisao-projetos/` | Encontrar interferências, premissas e responsáveis antes da obra. | Artefatos concretos distinguem coordenação/revisão de “terceirização de projetos”. | **Solicitar escopo para compatibilização** |
| `/quantitativos-orcamento-obras/` | Produzir ou revisar uma base de quantidades e custos antes de contratar ou investir. | Memória, premissas e lacunas tornam a decisão comparável e qualificam melhor o pedido. | **Enquadrar quantitativos ou orçamento** |
| `/inspecao-documentacao-edificacoes/` | Registrar condição, pendências e documentação de uma edificação para decidir recebimento, intervenção ou regularização. | Separar inspeção, documentação e campo evita a promessa genérica de “laudo completo”. | **Solicitar análise de inspeção ou documentação** |

Não há página por persona. Escritórios, plataformas, construtoras e incorporadoras aparecem como contextos dentro do mesmo trabalho; condomínio e reforma são casos de uso da rota de inspeção/documentação. Loteamentos e infraestrutura permanecem `DEFER`.

## Ordem de promoção recomendada

1. **Quantitativos e orçamento**, depois de confirmar por escrito unidade, documentos mínimos, memória, regra de ART e responsável pelo delivery. É o melhor primeiro teste porque pode começar documentalmente e a prova pública atual inclui orçamentação com referências oficiais.
2. **Hub**, no mesmo release da primeira money page, sem links mortos para candidatos ainda retidos.
3. **Compatibilização/revisão**, somente após evidência operacional do fluxo aceito — formatos, disciplinas, nível de informação, issue register e responsabilidade de resolução.
4. **Inspeção/documentação**, somente após confirmar território/capacidade de campo, tipo de documento, atribuição e formalidades profissionais. A análise documental remota não autoriza vistoria nacional.

MV-09 deve copiar apenas as rotas aprovadas. Um candidato não promovido permanece fora do sitemap, navegação e family registry; não recebe redirect genérico.

## Autoridade, prova e limites

- CONFENGE e `confenge.com.br` continuam como única marca e superfície pública.
- `extra-cli` continua dono de fatos, identidade e proveniência; estas páginas não criam fonte de dados ou identidade.
- Warmbly continua dono da ação comercial; a captura normalizada usa `source=CONFENGE_WEB` e não autoriza outbound/SMTP.
- Prova pública utilizável: Tiago Sasaki declara formação em Engenharia Civil pela EESC-USP, experiência na iniciativa privada/Administração Pública e atuação publicada em orçamentação, fiscalização e gestão contratual. Isso não prova capacidade ilimitada em BIM, inspeção, patologias, disciplinas complementares ou loteamentos.
- Exemplos visuais dos candidatos são rotulados como **EXEMPLO SINTÉTICO**. Não representam cliente, obra executada, prazo, preço ou resultado.
- Preço não é publicado. A proposta varia por recorte, documentação, disciplinas, formato, ciclos de revisão, necessidade de campo, local, ensaios e responsabilidade técnica aplicável.

## Gate de promoção

Cada rota só pode ficar indexável quando, no mesmo SHA de integração:

1. pertencer a família route-exact declarada no `public-family-registry`;
2. renderizar captura persistida no `<main>`; o link de prévia para `/triagem-tecnica/` não satisfaz sozinho `capture_form`;
3. emitir somente campos fechados e PII-free em analytics, mantendo PII dentro do transporte de lead;
4. receber protocolo apenas após persistência confirmada e retry idempotente;
5. passar gates de copy, acessibilidade, canonical, schema, privacidade, sitemap, família pública e `npm run inbound:gates`;
6. ter oferta, responsável de delivery, escopo, regra de campo, ART/NF e capacidade aprovados pela autoridade comercial/profissional vigente;
7. manter a página fora de produção se qualquer contrato externo estiver divergente ou indisponível.

## Conteúdo do pacote

- [`research-intents.md`](research-intents.md): SERPs, linguagem, fontes, arquitetura e matriz de canibalização.
- [`public-candidates/`](public-candidates/): quatro candidatos responsivos e assets locais.
- [`public-strings.md`](public-strings.md): inventário de copy pública por função.
- [`promotion/`](promotion/): fragmentos de family registry, sitemap, navegação, captura e promoção.
- [`screenshots/`](screenshots/): evidência visual em 390×844 e 1366×768.
- [`validation.md`](validation.md): comandos, resultados e limites da validação.

## 100 repetições, analytics e rollback

Cem pedidos devem melhorar uma taxonomia finita de três decisões e revelar documentos/escopos recorrentes; não criar cem páginas, ofertas ou fluxos manuais. Eventos públicos permitidos: visualização do candidato, ativação da ação, início/envio/sucesso da captura e protocolo opaco, sempre com IDs fechados. Texto livre, nome, e-mail, telefone, endereço, planta, orçamento, cliente e documento não entram em analytics.

Rollback: retirar do sitemap/nav/registry e do artefato apenas a rota exata, preservando protocolos já aceitos pelo owner comercial. Nunca redirecionar páginas privadas retiradas para a home sem decisão URL-específica. ADR-STRAT-002 e RUNTIME-AUTHORITY não mudam.
