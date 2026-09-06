# MV-04 — corporate shell, home e `/servicos/`

## Registro da execução

- `CONFENGE_MV_CAMPAIGN=04`
- `READY_FOR_INTEGRATION=BLOCKED:MV-09 deve ativar /servicos/ atomicamente e reconciliar inventários derivados/BOFU`
- decisão: `EXECUTE_NOW`
- frente executiva: `INBOUND ENGINE`
- alavancas: receita, conversão, confiança, distribuição e cliente
- tempo para evidência: primeira sessão de produção e janela inicial de 14 dias, com comparação por rota e origem
- repositório: `tjsasakifln/web-cfg`
- branch: `feat/mv-04-corporate-shell-value-proposition-20260905`
- `BASE_SHA=3552cf228424ebb8f34266f671fd80df43d0615c`
- `HEAD_SHA`: usar o SHA exibido pela PR; o valor não é autorreferenciado neste arquivo
- owners consultados: issues #577 e #582, ambas abertas em 2026-09-05
- donors consultados, sem cherry-pick: PRs #597 e #603, ambas abertas e atrás de `main` durante a auditoria

## Estado real encontrado

Na auditoria inicial de 2026-09-05, `https://confenge.com.br/api/build-info`
informava `89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`. Durante a
execução, `origin/main` avançou pelos merges das PRs #604 e #612; a branch foi
rebaseada no SHA mais recente e os conflitos de gate foram compostos. Na verificação final de
produção, `/api/build-info` respondia 404, `/triagem-tecnica/` respondia 200,
a home ainda usava título e H1 exclusivos de licitações/contratos públicos e
`/servicos/` ainda respondia 301 para `/servicos-obras-publicas/`.

O redirecionamento exato foi removido e `/servicos/` ganhou uma página corporativa candidata, com canonical próprio e `noindex,follow`. Ela não será indexável enquanto MV-09 não declarar a família no registro público e não executar os gates correspondentes. As URLs B2G foram preservadas.

O allowlist do artefato público também pertence à integração: o build producer
valida a home e o shell, mas ainda não copia `/servicos/` para `_site`. MV-09
deve incluir a rota e a remoção do redirect no mesmo merge publicável, conforme
o fragmento versionado, para não expor uma rota sem destino. A entrada exata
de `/servicos` no inventário orgânico também deve mudar de `keep_301` para
`MIGRATE`; nenhuma outra URL legada entra nessa decisão.

A home passa de 128 para 129 ações rastreáveis no contrato comercial. Ela
preserva, dentro da vertical B2G, o Dossiê de Medição, Glosa e Pagamento, o
demonstrativo de relatório e o diagnóstico de expansão; as novas ações
corporativas cobrem situações, triagem e sinais de confiança. O inventário
derivado fica fora do `WRITE_SET`; MV-09 deve regenerá-lo ao compor a campanha.

A substituição da home também torna classes antigas sem uso, acrescenta um
token de raio e altera o hash de `_redirects` protegido pelo snapshot BOFU.
Esses contratos pertencem a outros owners e foram preservados nesta producer;
os comandos e critérios de reconciliação estão no fragmento da MV-09.

A rota `/triagem-tecnica/` integrada pela PR #604 permanece com recebimento
externo fail-closed. Por isso esta campanha mantém o CTA corporativo no fallback
`/#triagem-tecnica`, onde o visitante inicia e-mail ou WhatsApp por ação própria;
não habilita submit, outbound nem SMTP. MV-09 pode migrar o CTA para a rota
dedicada quando Governance e Warmbly publicarem a autoridade final comum.

## Visitor job e hipótese

Visitor job: uma pessoa com uma decisão técnica a tomar deve reconhecer a própria situação sem conhecer o organograma da CONFENGE, entender que existe engenharia responsável e escolher um próximo passo seguro.

Hipótese de aquisição/conversão: substituir a abertura exclusivamente B2G por categoria, benefício e chooser por situação reduz saídas de tráfego frio multi-vertical sem diluir a autoridade em obras públicas. O CTA dominante leva primeiro à escolha da situação; a conversão termina em triagem iniciada pelo visitante. Inbound não dispara outbound ou SMTP.

North Star: oportunidades comerciais qualificadas, conectadas à origem, à situação e ao próximo passo — não cliques, mensagens ou número de páginas isoladamente.

## O que muda

- home com categoria corporativa, benefício concreto, um CTA dominante e cinco situações reconhecíveis;
- responsabilidade identificável por nome, formação publicada e CNPJ, sem mural de credenciais;
- prova PNCP retirada da primeira dobra e confinada à seção de obras públicas;
- B2G preservado como vertical explícita, com hub, rotas e atalhos próprios;
- cabeçalho e rodapé corporativos gravados nas fontes de home e `/servicos/`; no
  artefato público, o build promove navegação e CTA genérico corporativos nas
  rotas mutáveis e preserva CTAs comerciais versionados e as rotas congeladas;
- `/servicos/` deixa de redirecionar para B2G e passa a ser um chooser corporativo não indexável;
- contratos de marca e IA atualizados; 211 fontes HTML permanecem byte-stable,
  enquanto a canonicalização do build evita navegação antiga no artefato. A
  ativação do rodapé compartilhado nas demais fontes fica para a integração
  coordenada.

## Dados, autoridade e privacidade

- owner das afirmações corporativas neste repositório: contrato versionado `data/site/brand.json`;
- owner da IA: contrato versionado `data/site/public-ia-map.json`;
- identidade e proveniência externas continuam pertencendo a `extra-cli`; esta campanha não criou crawler, DataLake ou identidade paralela;
- ação comercial continua pertencendo a `warmbly`; a origem permanece `CONFENGE_WEB` no runtime existente;
- analytics reutiliza eventos agregados admitidos (`cta_click`, `email_click` e `whatsapp_click`) e não envia conteúdo digitado, e-mail, telefone ou mensagem;
- a triagem corporativa pede descrição inicial e avisa para não enviar documentos sensíveis no primeiro contato.

## Qualidade e rollback

Gates e resultados ficam na PR. A verificação de primeira dobra mede 390×844 e 1366×768, exige um único CTA primário visível, alvo mínimo de 44 px, contraste de pelo menos 4,5:1, ausência de overflow e presença das mensagens essenciais. A suíte limpa da producer sinaliza, de forma esperada, quatro contratos derivados fora de escopo: inventário de CTA, inventário orgânico da URL `/servicos`, baseline CSS e snapshot BOFU de `_redirects`.

Como prova de integração anterior ao rebase final, `npm test` passou
integralmente após reconciliar os contratos então presentes de forma
temporária. A rodada remota no SHA final confirmou adicionalmente CSP e
performance verdes e parou apenas nos inventários de CTA e da URL legada. As
edições temporárias fora do `WRITE_SET` foram restauradas antes do push.

Rollback: reverter o SHA da PR restaura home, contrato de shell e o redirecionamento exato anterior. Não há migração de dados, redirect em massa, merge ou deploy nesta campanha.

ADR afetada: `ADR-STRAT-002` ainda descreve a estratégia B2G exclusiva. Ela está fora do `WRITE_SET`; a divergência e a alteração sugerida estão no fragmento de integração para MV-09.

## Teste de 100 repetições

Cem demandas alimentam cinco situações estáveis e uma triagem comum, melhorando linguagem, roteamento e qualificação. Não exigem cem páginas artesanais, formulários incompatíveis ou filas paralelas. O B2G mantém sua árvore especializada quando a situação realmente pertence à vertical.
