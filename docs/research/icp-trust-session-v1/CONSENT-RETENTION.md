# Consentimento, minimizacao e retencao

## Texto a ler antes da sessao

> A CONFENGE esta avaliando se a navegacao e a linguagem do site sao
> compreensiveis para profissionais de engenharia, pericias, avaliacao, SST e
> obras publicas. A participacao e voluntaria, dura aproximadamente 45 minutos
> e pode ser interrompida a qualquer momento. Avaliamos o site, nao voce. Nao
> havera gravacao de audio ou video. Notas de moderacao e prova de
> consentimento ficam em armazenamento privado e nao serao publicadas. O
> repositorio recebera somente contagens agregadas sem nome, empresa, contato,
> identificador, processo, empregado, documento, valor informado, endereco ou
> citacao individual. Este consentimento e para pesquisa e nao autoriza
> marketing. Voce pode pedir acesso, correcao ou exclusao dos seus dados. Voce
> concorda em participar nestas condicoes?

O operador registra privadamente versao do protocolo, resposta explicita,
timestamp, expiracao e um localizador interno que permita DSAR. Nao guardar o
texto do consentimento em issue, analytics, `_site` ou commit.

## Dados e destinos

| Dado | Local | Retencao maxima | Git/analytics |
|---|---|---:|---|
| contato e agenda | ops privado | 60 dias | proibido |
| triagem e consentimento | ops privado | 730 dias | proibido |
| notas pseudonimizadas do moderador | ops privado | 30 dias apos agregacao | proibido |
| audio, video e transcricao | nao coletar | zero | proibido |
| contagens por tarefa/dimensao | `runs/*/aggregate.json` | enquanto auditavel | permitido, agregado |
| interpretacao | `runs/*/interpretation.md` | enquanto auditavel | permitido, sem PII/citacao |

Os limites sao iguais ou mais restritivos que o default de 730 dias do
[`DSAR-RETENTION-RUNBOOK.md`](../../ops/DSAR-RETENTION-RUNBOOK.md).

## DSAR e retirada

1. Confirmar a solicitacao pelo canal privado usado no recrutamento.
2. Localizar agenda, triagem, consentimento e notas no store privado.
3. Exportar ou apagar conforme solicitado.
4. Se a retirada ocorrer antes da agregacao, excluir a conclusao da quota.
5. Se ocorrer depois, recomputar o agregado se a contribuicao ainda puder ser
   isolada.

Rollback de codigo nunca restaura dados apagados nem revoga retirada. Esta
pesquisa e a unica; nao abrir segunda amostra para substituir quem saiu alem
da quota de 20.
