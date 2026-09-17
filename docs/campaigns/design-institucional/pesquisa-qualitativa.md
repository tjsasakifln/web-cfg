# Roteiro qualitativo enxuto: antes × piloto (oito pessoas)

Estado: **NAO_MEDIDA**. Nenhum participante foi contatado nesta campanha (sem autorização e sem canal). Este roteiro reaproveita o pacote `docs/research/icp-trust-session-v1/` (consentimento, retenção, DSAR, recrutamento, teste de cinco segundos) e só define o que muda para a comparação antes × piloto. Agentes não substituem pessoas; nenhuma resposta é fabricada. A ausência de amostra não cria congelamento: a decisão visual do proprietário pode liberar a expansão com esta limitação explícita.

## Participantes

Oito pessoas, três contextos: privado (proprietário, síndico ou empresa com projeto/obra/reforma: 3), patrimônio e perícia (advogado, parte em disputa, inventário/partilha: 2), obras públicas (construtora contratada ou servidor de órgão: 3). Recrutamento, consentimento e retenção conforme `RECRUITMENT.md` e `CONSENT-RETENTION.md` do pacote. Sem gravação; notas pseudonimizadas; só contagens agregadas entram no repositório.

## Estímulos

- **Antes**: capturas de produção `47da03b64` (`evidence/producao-47da03b64/`), ou o site público se ainda estiver nessa versão.
- **Piloto**: worktree do ramo `campaign/salto-institucional-01-piloto` servida localmente (ou o preview autorizado), rotas `/`, `/servicos/#servico-avaliacao`, `/quantitativos-orcamento-obras/`, `/medicoes-glosas-obras-publicas/`, `/casos/demonstrativo-projeto-privado/`, `/triagem-tecnica/`.
- Ordem de exposição alternada por participante (ímpares: antes → piloto; pares: piloto → antes). Não explicar a proposta antes. Rótulos neutros ("versão 1", "versão 2").

## Tarefas e perguntas (20 a 30 minutos)

1. Cinco segundos na home (protocolo `PROTOCOL-FIVE-SECOND.md`): "O que esta empresa faz? Para quem?"
2. Situação concreta do contexto do participante (uma por contexto, sorteada):
   - privado: "Você recebeu duas propostas de reforma com quantidades diferentes. Onde começaria?"
   - patrimônio/perícia: "Precisa de um valor de imóvel para uma partilha. Onde começaria e o que receberia?"
   - obras públicas: "O boletim de medição voltou glosado. Onde começaria e o que receberia?"
   Registrar: percurso escolhido (cliques), se chegou à página certa sem ajuda, tempo até o primeiro contato possível.
3. "O que seria entregue no fim?" (nomear o documento com as próprias palavras).
4. "O que aqui sustenta a sua confiança? O que faltou?"
5. "Onde você começaria o contato? O que espera que aconteça depois de enviar?"
6. "Que frentes esta empresa atende: pública, privada, as duas?" e "Ela faz obra, projeto, perícia, software?" (confusões graves: empresa executora de obra, software/infoproduto, escritório só de arquitetura, empresa maior do que é).
7. Preferência declarada entre as duas versões, por último, com o motivo.

## Métricas e piso

- Identificação da atuação sem ajuda (tarefa 1 e 6): contagem por versão.
- Percurso correto sem ajuda (tarefa 2): contagem por versão e por contexto.
- Documento nomeado corretamente (tarefa 3).
- Confusões graves (tarefa 6): lista, por versão; **qualquer confusão grave recorrente é corrigida independentemente da contagem**.
- Piso do projeto: **6 de 8** identificando atuação e percurso sem ajuda no piloto. Critério qualitativo do projeto, não prova estatística de conversão nem padrão universal.

## Registro

`runs/<data>/aggregate.json` (contagens) e `interpretation.md` (sem PII, sem citação individual), no mesmo formato do pacote existente. Nada disso entra no HTML público.
