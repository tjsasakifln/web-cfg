# Aquisição por indicação — contrato de crescimento e medição

- **Decisão:** `EXECUTE_NOW`, mantendo compras e o programa fechados quando a configuração operacional estiver desabilitada.
- **Frente executiva:** aquisição e monetização das ferramentas.
- **Hipótese:** um caminho explícito para obter e compartilhar o link pessoal aumenta visitas atribuídas e primeiras exportações pagas sem recompensar clique, cadastro ou divulgação isolados.
- **Alavancas:** distribuição, receita, dados e automação.
- **Tempo para evidência:** instrumentação disponível no primeiro release; resultado econômico exige ao menos um ciclo completo entre visita, conta verificada, compra, primeira exportação paga e eventual estorno.
- **North Star deste ciclo:** recompensas ativas ligadas a primeiras exportações pagas, conciliadas com estornos e margem. Abertura do painel, compartilhamento e visita são etapas de diagnóstico, não sucesso econômico.

## Contrato implementado

O compartilhamento editorial comum continua sem atribuição pessoal. O programa aparece como ação distinta e só abre quando créditos e compras estão habilitados. Visitantes sem sessão recebem a autenticação normal; depois da autenticação e confirmação do e-mail, o foco vai ao painel do link pessoal. O painel informa recompensa, teto mensal, primeiro toque, autoindicação, contas preexistentes e reversão.

Os eventos do navegador usam somente enumerações e identificadores públicos de ferramenta:

| Evento | Propriedades permitidas | Interpretação |
|---|---|---|
| `tool_referral_visit` | `touch_outcome=accepted`, `storage_mode=persistent|memory` | primeiro toque válido aceito por 30 dias |
| `tool_referral_panel_view` | `tool_id`, `destination_kind=modela|catalog` | painel pessoal realmente renderizado |
| `tool_referral_action` | `tool_id`, `destination_kind`, `share_channel=copy|linkedin|whatsapp|native`, `action_outcome=success|failure|cancelled|blocked` | resultado local da ação; abrir uma rede não comprova publicação |

Código de indicação, URL pessoal, e-mail e UID não entram em analytics. O tracker existente continua responsável por consentimento. A operação mede concessões e reversões no ledger; cliques e compartilhamentos nunca geram saldo.

## Leitura temporal

`referralCohort` é uma coorte de **cadastros criados no intervalo**. Seus estados são um retrato na hora da consulta e podem amadurecer depois do fim da janela. `referralEvents` é uma contagem de **lançamentos ocorridos no intervalo** e pode incluir contas cadastradas antes dele. As duas séries não formam uma taxa entre si. Taxas de visita → painel → ação dependem de analytics consentido; conversão financeira depende da conciliação com pedidos, exportações, estornos e margem.

## Gates, repetição e reversão

O fluxo falha fechado quando o runtime ou as compras estão desabilitados e não abre um modal vazio. Cada nova indicação reutiliza o mesmo contrato transacional: uma repetição bem-sucedida acrescenta evidência agregada e um lançamento idempotente, sem trabalho manual por indicado. O teto mensal e a reversão preservam a exposição econômica.

Rollback: reverter os arquivos de interface e operação deste release remove a entrada e os novos agregados sem apagar conta, pedido, exportação ou ledger. O contrato de saldo e a decisão em `ADR-TOOLS-001` permanecem a autoridade. Esta mudança não ativa compras, não altera preços e não muda autorização de checkout.
