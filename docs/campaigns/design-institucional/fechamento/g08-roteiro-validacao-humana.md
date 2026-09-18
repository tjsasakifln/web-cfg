# G08 — Validação humana: roteiro curto (três tarefas)

Estado: **VALIDACAO_HUMANA_PENDENTE**. Nenhum participante foi contatado nesta campanha (sem autorização e sem canal); agentes não substituem pessoas e nenhuma resposta foi fabricada. Leitor de tela real e Safari/iPhone físico não estavam disponíveis: tudo o que foi verificado é emulação/automação (Chrome headless, viewports 320/360/390/1440, axe) e está rotulado assim na matriz.

Este roteiro reduz `docs/campaigns/design-institucional/pesquisa-qualitativa.md` (oito pessoas, três contextos, pacote `docs/research/icp-trust-session-v1/` para consentimento, retenção e recrutamento) a três tarefas de 10–15 minutos sobre a produção atual. Não explicar o site antes; observar e anotar sem gravar; só contagens agregadas entram no repositório (`runs/<data>/aggregate.json`, `interpretation.md`, sem PII).

## Tarefas

1. **O que a empresa faz e entrega.** Cinco segundos na home (390×844 ou desktop). "O que esta empresa faz? Para quem? O que você receberia no fim?" Registrar: atuação identificada sem ajuda; documento nomeado com as próprias palavras; confusões graves (empresa executora de obra, software, só arquitetura, só obra pública).
2. **Encontrar a solução para uma necessidade.** Uma situação por contexto, sorteada: privado ("duas propostas de reforma com quantidades diferentes"), patrimônio/perícia ("valor de imóvel para partilha"), obra pública ("boletim de medição glosado"). Registrar: percurso (cliques), se chegou à página certa sem ajuda, tempo até o primeiro controle de contato real, onde travou.
3. **Iniciar contato.** "Onde você começaria o contato? O que espera que aconteça depois de enviar?" Sem enviar. Registrar: canal escolhido, campos que a pessoa esperava preencher, o que achou que aconteceria.

## Critério de execução

Mínimo de três participantes (um por contexto) já autorizados e disponíveis. Piso qualitativo: 2 de 3 identificam a atuação e chegam ao contato sem ajuda; qualquer confusão grave recorrente é corrigida independentemente da contagem. Amostra pequena é diagnóstico, não prova de conversão. A campanha não espera tráfego nem participantes indefinidamente: esta pendência fica registrada com dono (Engº Tiago Sasaki) e não é chamada de gap resolvido.

## Compatibilidade real (fora do emulado)

Safari/iPhone físico: abrir `/`, `/servicos/`, `/quantitativos-orcamento-obras/`, `/triagem-tecnica/` e o formulário de `/medicoes-glosas-obras-publicas/`; conferir menu, details, foco visível, zoom 200% e envio de um contato de teste próprio. Leitor de tela (VoiceOver/NVDA): skip-link, cabeçalhos, rótulos dos campos, mensagens de erro e sucesso do formulário. Registrar resultado por item na matriz.
