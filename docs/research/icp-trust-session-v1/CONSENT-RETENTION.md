# Consentimento, minimização e retenção

## Texto a ler antes da sessão

> A CONFENGE está avaliando se a navegação e a linguagem do site são
> compreensíveis para profissionais de obras públicas. A participação é
> voluntária, dura aproximadamente 30 minutos e pode ser interrompida a qualquer
> momento. Avaliamos o site, não você. Não haverá gravação de áudio ou vídeo.
> Notas de moderação e prova de consentimento ficam em armazenamento privado e
> não serão publicadas. O repositório receberá somente contagens agregadas sem
> nome, empresa, contato, identificador ou citação individual. Este consentimento
> é para pesquisa e não autoriza marketing. Você pode pedir acesso, correção ou
> exclusão dos seus dados. Você concorda em participar nestas condições?

O operador registra privadamente versão do protocolo, resposta explícita,
timestamp, expiração e um localizador interno que permita DSAR. Não guardar o
texto do consentimento em issue, analytics, `_site` ou commit.

## Dados e destinos

| Dado | Local | Retenção máxima | Git/analytics |
|---|---|---:|---|
| contato e agenda | ops privado | 60 dias | proibido |
| triagem e consentimento | ops privado | 730 dias | proibido |
| notas pseudonimizadas do moderador | ops privado | 30 dias após agregação | proibido |
| áudio, vídeo e transcrição | não coletar | zero | proibido |
| contagens por tarefa/dimensão | `runs/*/aggregate.json` | enquanto auditável | permitido, agregado |
| interpretação | `runs/*/interpretation.md` | enquanto auditável | permitido, sem PII/citação |

Os limites são iguais ou mais restritivos que o default de 730 dias do
[`DSAR-RETENTION-RUNBOOK.md`](../../ops/DSAR-RETENTION-RUNBOOK.md). Ao atingir a
data de descarte, apagar do armazenamento privado e registrar apenas a execução
do descarte, sem restaurar o conteúdo apagado.

## DSAR e retirada

1. Confirmar a solicitação pelo canal privado usado no recrutamento.
2. Localizar agenda, triagem, consentimento e notas no store privado.
3. Exportar ou apagar conforme solicitado; sempre fazer dry-run quando o store
   suportar a CLI do runbook.
4. Se a retirada ocorrer antes da agregação, excluir a conclusão da quota.
5. Se ocorrer depois, recomputar o agregado se a contribuição ainda puder ser
   isolada; caso contrário, documentar privadamente a impossibilidade de
   reidentificação do agregado anônimo.

Rollback de código nunca restaura dados apagados nem revoga retirada.
