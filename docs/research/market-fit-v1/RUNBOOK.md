# Runbook de execução do market fit

## 1. Congelar a matriz

1. Rodar os três comandos do README no SHA que será usado nas sessões.
2. Registrar privadamente o SHA do commit e a URL HTTPS do estímulo.
3. Calcular o SHA-256 de `market-fit-exposure-plan.v1.json` e copiá-lo para o
   agregado da pesquisa.
4. Não regenerar, trocar ou reordenar cartões depois da primeira sessão. Uma
   mudança exige nova versão do plano e reinício da amostra comparável.

## 2. Recrutar, consentir e associar slots

Aplicar `docs/research/icp-trust-session-v1/RECRUITMENT.md` e
`CONSENT-RETENTION.md`. Recrutar cinco conclusões para cada papel e pelo menos
14 pessoas com licitação ou contrato ativo nos últimos 12 meses.

A associação entre pessoa e `MF-P**` fica apenas no store privado. Não copiar
nome, empresa, contato, consentimento, citação ou nota bruta para o template,
issue, PR ou analytics.

## 3. Executar as fases 1 e 2

1. Reconstruir fatos recentes sem mostrar o catálogo e sem perguntar primeiro
   se a pessoa compraria.
2. Mostrar exatamente os 18 cartões de `display_order` do slot atribuído.
3. Classificar primeiro por situação ou tarefa sem preço.
4. Revelar depois saída, preço e SLA.
5. Guardar notas brutas privadamente; levar ao Git apenas contagens agregadas.

O agregado final reconcilia `screened >= eligible >= consented >= completed`,
as quatro quotas somam exatamente 20 conclusões e o hash do plano precisa ser o
SHA-256 real do arquivo congelado. Triggers, relevância e confusão são contados
por `CFG-D01` a `CFG-D54`; chaves livres e texto bruto fazem o gate falhar.

Se uma sessão for retirada ou inelegível, usar outro participante no mesmo slot
e papel. Não alterar o bloco de cartões.

## 4. Executar QCOs reais

Para cada oportunidade comercial qualificada, recomendar uma única entrega
principal e usar a versão explícita do preço. Warmbly registra ação, proposta,
decisão literal, prazo, entrega e outcome. Não registrar contato ou narrativa
individual no repositório.

O export agregado deve declarar `source: CONFENGE_WEB`, intervalo, SHA-256 e
contagens por entregável. `ACEITOU` não equivale a `paid`; proposta não equivale
a venda; ausência de outcome permanece `UNKNOWN`.

Cada entrega deve reconciliar QCO, recomendação, proposta, decisão, pagamento,
entrega e outcome. O agregado também registra propostas plausíveis no preço
exibido, desvio de horas, margem positiva e ocorrência de claim proibido. Uma
entrega concluída precisa terminar em outcome observado ou `UNKNOWN`, sem sobra.

## 5. Agregar e decidir

1. Copiar os três templates para uma pasta `runs/YYYY-MM-DD-NN/`.
2. Preencher primeiro `research-aggregate.json` e `qco-aggregate.json`.
3. Rodar `market_fit_evidence.mjs` apontando para os dois arquivos.
4. Preencher `product-decisions.json` com escores 0 a 5 e referências agregadas.
   O arquivo deve conter exatamente `CFG-D01` a `CFG-D54` e vincular os `run_id`
   dos dois agregados usados.
5. PROMOTE só pode aparecer quando o avaliador numérico confirmar todos os
   critérios e reconciliar cada número com pesquisa e Warmbly. ADJUST e HOLD
   mantêm o item no catálogo.
6. Registrar operador, segunda função revisora distinta e instante UTC nos três
   artefatos. Depois atualizar manualmente as issues filhas e
   #88, sem palavra-chave de fechamento automático.

Com menos de 20 entrevistas ou oito QCOs P0 com recomendação unitária, o estado
continua `AMOSTRA_INSUFICIENTE`. Nenhum gate converte zero ou ausência em
evidência.

## 6. Retenção e rollback

Aplicar a retenção do pacote compartilhado. Rollback de código não restaura
contato, consentimento ou nota apagada. Se o instrumento for invalidado,
preservar o agregado como execução inválida, criar nova versão e não misturar as
duas amostras.
