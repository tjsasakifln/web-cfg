# Unit economics por entrega v1

Este contrato operacionaliza a política de preço da #341 sem declarar observação que ainda não ocorreu. O estado continua `NOT_STARTED`; preços publicados não mudam.

## Autoridade e privacidade

- custos reais, taxas por senioridade e eventos por entrega pertencem ao store financeiro privado;
- decisão comercial e outcome observado pertencem ao Warmbly;
- o site emite origem normalizada `CONFENGE_WEB` e não recebe PII neste ledger;
- este repositório guarda somente schema, templates, validador e agregados não identificáveis;
- o artefato não é uma página pública e não cria crawler, DataLake ou identidade paralela.

O evento liga uma entrega canônica a versões explícitas de escopo, preço e termos. Horas por atividade precisam reconciliar com horas por senioridade. O cálculo deriva custo direto, margem de contribuição e dias até caixa. Urgência só passa com os três controles da política; diferença entre preço exibido e aceito exige uma única alternativa predefinida e versionada.

## Uso

Valide o template versionado:

```sh
node scripts/commercial/unit_economics.mjs
```

Valide uma exportação temporária do store privado:

```sh
node scripts/commercial/unit_economics.mjs --event /caminho/seguro/evento.json
```

Não faça commit da exportação real. Depois da validação, o sistema financeiro pode guardar apenas o hash do evento no agregado. O gate permite promoção com três entregas observadas em margem direta de pelo menos 55%, ou com decisão explícita do fundador sobre preço ou escopo. O resultado nunca promove automaticamente uma oferta.

## Evidência e repetição

As conversas e propostas reais seguem o protocolo da #336. Este contrato cobre a reconciliação econômica posterior à entrega. Cem repetições melhoram o sistema porque acumulam distribuição de esforço, custo, margem, retrabalho, prazo de caixa e reutilização por escopo versionado; não criam cem planilhas desconectadas.

Rollback: remover os artefatos desta versão e o bloco `unit_economics_implementation` da política restaura o estado anterior sem alterar preços, rotas ou contratos públicos.
