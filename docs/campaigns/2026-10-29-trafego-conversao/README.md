# Tráfego qualificado e conversão da CONFENGE

Data: 29/10/2026. Decisão: EXECUTE_NOW. Frente: INBOUND ENGINE.
Alavancas: distribuição, receita, confiança e automação.
Arquitetura preservada: ADR-STRAT-002, ADR-STRAT-004 e RUNTIME-AUTHORITY.

## O problema e o comportamento entregue

As páginas de projetos descreviam o serviço com títulos abstratos, recebiam poucos links contextuais e encaminhavam o pedido por uma triagem genérica. A jornada `projetos` não era reconhecida pelo formulário compartilhado, que aceita `projeto`.

A home agora nomeia projetos e serviços de engenharia. Onze páginas técnicas apresentam o serviço e suas entregas na abertura. As treze páginas do gerador compartilham contato direto com contexto: projetos seguem a jornada correta; empresa e método mantêm a escolha genérica. O visitante chega ao formulário com uma ação a partir da abertura, ou inicia uma conversa específica no WhatsApp.

A origem inicial permanece preservada mesmo quando a pessoa passa de um artigo para um serviço antes de entrar em contato. Sem armazenamento de sessão, a navegação preserva o contexto na mesma janela pelo mecanismo de continuidade já existente, sem criar endereços parametrizados para os buscadores. Sem JavaScript, os canais diretos continuam disponíveis; o formulário não afirma registrar pedidos sem seu funcionamento normal.

## Evidência de procura

Fonte: Search Console da propriedade conectada `sc-domain:confenge.com.br`, consultada em 29/10/2026 pelo conector Windsor.ai. Período: 29/09 a 26/10/2026, 28 dias. Arquivo: [gsc-baseline.json](gsc-baseline.json).

- Propriedade: 88 cliques, 1.766 impressões, CTR de 4,98%, posição média 5,983.
- Home: 26 cliques.
- Aditivo em empreitada por preço global: 17 cliques.
- BDI diferenciado e mobilização/desmobilização: 8 cliques cada.
- Medições e glosas: 6 cliques em 236 impressões.
- SINAPI desonerado/não desonerado: 2 cliques em 280 impressões, CTR de 0,71%.

O detalhamento por consulta expôs somente 23 cliques. Consultas omitidas por privacidade impedem concluir que os demais cliques seriam de marca ou sem marca. Impressões por página e totais da propriedade têm agregações diferentes e não devem ser somados como se fossem equivalentes.

O volume ainda é pequeno. Os dados orientam prioridade; não demonstram aumento de tráfego ou conversão após esta alteração. Não foi obtida uma linha de base de pedidos comerciais, propostas ou receita nesta sessão.

## Intervenções e hipótese de ganho

| Intervenção | Trabalho do visitante | Hipótese verificável |
| --- | --- | --- |
| Home e aberturas mais concretas | Reconhecer serviço, entrega e próximo passo | Mais visitas pertinentes às páginas de serviço |
| Links da home, projetos, terceirização e três artigos | Chegar diretamente à disciplina necessária | Melhor descoberta de quatro serviços já existentes |
| Título de SINAPI alinhado à pergunta respondida | Escolher o resultado que responde qual referência usar | CTR da página melhora em faixas de posição comparáveis |
| Proposta direta e WhatsApp contextual | Pedir proposta sem repetir a necessidade | Mais contatos reais por visita de serviço |
| Jornada e primeira origem corretas | Manter assunto e origem até o pedido | Menos pedidos classificados como outra necessidade e atribuição íntegra |
| Hierarquia e alvos de toque no celular | Ler e acionar o contato em tela estreita | Contatos acessíveis sem corte horizontal |

A expansão usa páginas existentes. A revisão inicial encontrou 126 páginas indexáveis, todas presentes nos sitemaps, sem recurso interno ou fragmento ausente. Os quatro artigos B2G com mais procura já tinham encaminhamento comercial adequado; seus corpos foram preservados.

Projetos e serviços documentais permanecem disponíveis nacionalmente. A abertura explicita vistorias presenciais na Grande Florianópolis, em coerência com o JSON-LD da oferta de inspeção.

## Revisão adversarial

Revisores independentes encontraram e a implementação corrigiu:

1. Jornada plural rejeitada pelo formulário.
2. Nova passagem pelo serviço sobrescrevendo a primeira origem do artigo.
3. Páginas institucionais pré-selecionando projeto para outras necessidades.
4. Cobertura nacional de inspeção no JSON-LD incompatível com a atuação presencial.
5. Título e espaçamento excessivos reduzindo a visibilidade do contato no celular.
6. Novos links exigindo atualização explícita do inventário de ações e do hash do contrato consumidor.
7. Continuidade sem armazenamento preenchendo a jornada oculta, mas deixando o seletor visível vazio.
8. Endereços parametrizados de contato incompatíveis com o contrato de SEO, substituídos por destino canônico e atributos de contexto.
9. Caminhos gerais de estruturas e instalações retirados do conteúdo do hub ao priorizar disciplinas específicas. Ambos foram restituídos no conteúdo, preservando os atalhos novos, com regressão e navegação conferidas.

Os quatro destinos disciplinares já eram reconhecidos no navegador e no servidor. A verificação do classificador confirmou `content_to_service` nos artigos. Cliques no WhatsApp continuam sendo intenção de contato, sem recibo comercial fictício.

## Validação

A geração completa `npm run build:site` passou, junto dos controles de entrada, SEO, navegação, privacidade, jornada, formulário e persistência. Os 124 testes focados e 74 subtestes passaram. O resultado por verificação está em [validation.json](validation.json). Os testes de regressão usam o endereço efetivamente gerado e cobrem chegada desde artigo/Google, contexto do serviço e uso com armazenamento indisponível.

A conferência no navegador usa o artefato público gerado, sem submeter pedidos em produção. A versão estreita é examinada em iframes com larguras de 390 e 320 pixels; a barra de rolagem ocupa parte da área útil. Isso confere o comportamento responsivo real do navegador, sem afirmar teste em aparelho físico. Evidências visuais e resultado final são registrados nesta pasta.

Após o CI identificar a evidência anterior vinculada à antiga home e ao antigo script, as 25 rotas do censo foram recapturadas em 50 viewports de 1366×768 e 390×844. A medição usou o Cloud Browser via CUA, o mesmo algoritmo de leitura de caixas do medidor e as mesmas funções puras de veredito. A fonte veio de um checkout Git esparso e limpo no commit fda436f4, com identidade de cada página, H1 e dependências conferida antes e depois. O método consta em measurement_transport no arquivo de evidências. O gate original aprovou 1.942 de 1.942 verificações. Não se atribui compreensão humana a essa medição.

Ambiente local: Node 24.22.1; o CI do repositório usa Node 22. A execução local não substitui os controles do CI nem a aceitação do runtime publicado.

## Medição após publicação

Um experimento estrutural: distribuir a procura existente até o serviço específico e preservar seu contexto até o pedido recebido.

Comparar os 28 dias completos anteriores e posteriores à publicação; revisar novamente com 56 dias se os eventos continuarem escassos. Usar os relatórios já existentes, sem criar outro painel ou agendamento:

1. Search Console por página e separadamente por consulta: cliques, impressões, CTR e faixas de posição; separar marca quando os dados permitirem.
2. Eventos do site: artigo para serviço, visita de serviço, intenção de contato, início e envio de formulário.
3. Recibos reais: pedidos persistidos por origem e serviço, excluindo testes, duplicatas e sinais sintéticos.
4. Warmbly: oportunidade qualificada, proposta, contrato, faturamento e recebimento como estágios distintos.

Pedidos persistidos e oportunidades qualificadas têm precedência sobre contagem de cliques. O contato por WhatsApp só deve avançar no funil quando houver evidência do atendimento. A revisão conjunta de textos e jornada não permite atribuir causalmente cada resultado a uma mudança isolada.

## Publicação e reversão

A produção continua sendo `confenge.com.br`, no fluxo protegido GitHub/Netcup. Esta implementação é entregue em branch e pull request; não constitui confirmação de publicação.

A reversão é o revert do commit da alteração. Rotas, índices e acervo público são preservados. A eventual promoção segue a verificação e reversão já existentes no repositório, sem mudança de DNS ou infraestrutura.
