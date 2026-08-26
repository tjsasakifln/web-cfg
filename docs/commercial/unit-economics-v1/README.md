# Unit economics por entrega v1

Este contrato operacionaliza a política de preço da #341 sem declarar observação que ainda não ocorreu. O estado continua `NOT_STARTED`; preços publicados não mudam.

## Autoridade e privacidade

- custos reais, taxas por senioridade e eventos por entrega pertencem ao store financeiro privado;
- proposta, aceite e outcome observado pertencem ao Warmbly;
- aprovação, exceção e decisão humana pertencem a Governance/Control Center;
- o site emite origem normalizada `CONFENGE_WEB` e não recebe PII neste ledger;
- este repositório guarda somente schema, templates, validador e agregados não identificáveis;
- o artefato não é uma página pública e não cria crawler, DataLake ou identidade paralela.

O evento liga uma entrega canônica a versões explícitas de escopo, preço e termos. A versão de escopo precisa ser a do registro do entregável, a de preço precisa ser a da política e a de termos precisa ser a autoridade fixada em `data/offers/governance-authority-pin.json`. Campos desconhecidos e PII em chaves ou valores reprovam o evento. Horas estimadas e reais por atividade precisam reconciliar com as horas por senioridade; retrabalho precisa reconciliar com o bloco de qualidade. O cálculo deriva custo direto, margem de contribuição e dias até caixa. Urgência só passa com os três controles da política; diferença entre preço exibido e aceito exige uma única alternativa definida antes do aceite, versionada e com preço explícito.

## Uso

Valide o template versionado:

```sh
node scripts/commercial/unit_economics.mjs
```

Valide uma exportação temporária do store privado:

```sh
node scripts/commercial/unit_economics.mjs --event /caminho/seguro/evento.json
```

Não faça commit da exportação real. Cada evento carrega um SHA-256 canônico do registro privado; qualquer mudança posterior no conteúdo reprova. O agregado guarda somente esses hashes e precisa reconciliar exatamente com eventos válidos, únicos, do mesmo entregável, versão de escopo, preço, termos e nível de preço.

O gate permite promoção por evidência somente com três entregas distintas, pagas, com QA aprovado, outcome observado e margem direta de pelo menos 55%. Evento inválido, repetido ou de escopo incompatível não entra na contagem. A alternativa é uma decisão explícita e versionada de Governance/Control Center, vinculada ao entregável e às mesmas autoridades de versão, com ação e justificativa. O `web-cfg` valida o binding e a ausência de PII; não armazena aprovação nem executa a mudança comercial. `eligible` é resultado de decisão, nunca mutação automática da oferta.

## Evidência e repetição

As conversas e propostas reais seguem o protocolo da #336. Este contrato cobre a reconciliação econômica posterior à entrega. Cem repetições melhoram o sistema porque acumulam distribuição de esforço, custo, margem, retrabalho, prazo de caixa e reutilização por escopo versionado; não criam cem planilhas desconectadas.

Rollback: remover os artefatos desta versão e o bloco `unit_economics_implementation` da política restaura o estado anterior sem alterar preços, rotas ou contratos públicos.
