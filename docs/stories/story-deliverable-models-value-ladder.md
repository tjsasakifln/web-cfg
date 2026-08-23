# Story: Modelos públicos dos demais entregáveis do Diagnóstico B2G de Expansão

## Status

Ready for Review

## Executor Assignment

executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: ["test:design", "test:copy", "test:ui", "visual-review"]

## Story

**As a** direção de construtora que ainda não contratou a CONFENGE,
**I want** consultar no navegador, sem cadastro, um modelo anonimizado de cada entregável do
Diagnóstico B2G de Expansão,
**so that** eu perceba a profundidade de cada peça e possa contratar a unidade que resolve o meu
problema agora, com fricção mínima de primeira contratação.

## Autoridade comercial

O fundador aprovou explicitamente, em 23 de agosto de 2026, a escada de valor abaixo. A âncora é o
modelo já publicado de R$ 599; nenhum entregável avulso é precificado igual ou abaixo dela.

| Entregável | Rota | Preço autorizado |
| --- | --- | --- |
| Base quantitativa canônica | `/casos/modelo-base-quantitativa-canonica/` | R$ 690 |
| Apresentação executiva de resultados | `/casos/modelo-apresentacao-executiva-resultados/` | R$ 890 |
| Mapa de compradores públicos | `/casos/modelo-mapa-compradores-publicos/` | R$ 1.200 |
| Contratos vincendos e recontratação | `/casos/modelo-contratos-vincendos-relicitacao/` | R$ 1.450 |
| Mapeamento de concorrentes | `/casos/modelo-mapeamento-concorrentes-publicos/` | R$ 1.900 |
| Painel de preços de obras públicas | `/casos/modelo-painel-precos-obras-publicas/` | R$ 2.400 |
| Relatório executivo consolidado | `/casos/modelo-relatorio-executivo-consolidado/` | R$ 3.750 |

Soma avulsa R$ 12.280. O pacote completo permanece o `Diagnóstico B2G de Expansão`
(`CFG-DIAG-EXP-v1`) por R$ 8.000, pagamento único, já publicado em
`/diagnostico-b2g-expansao/`.

Crédito aprovado: o valor pago em uma unidade avulsa é abatido do Diagnóstico B2G de Expansão se
ele for contratado em até 60 dias. O crédito não é cumulativo com outros créditos.

Nenhuma unidade avulsa é SKU de catálogo. Todas são handraise por WhatsApp, sem checkout, com
escopo e prazo definidos por uma pessoa antes de qualquer cobrança.

## Acceptance Criteria

1. Cada entregável tem uma página pública em `/casos/<slug>/`, HTML estático, integralmente legível
   sem cadastro, formulário, modal, PDF ou download.
2. Cada página usa apenas a base sintética compartilhada e declara de forma visível que empresa,
   órgãos, concorrentes, números e decisões são demonstrativos. Nenhum dado capaz de identificar o
   cliente real aparece no HTML, nos metadados ou no JSON-LD.
3. Os números reconciliam entre as sete páginas: a mesma base sintética de 118 contratos,
   R$ 132,40 mi, 54 órgãos, 76 concorrentes e 88 eventos de compra-mãe.
4. A narrativa aumenta a percepção de valor ao longo da leitura, na ordem do modelo de referência.
5. O preço da unidade e o CTA aparecem no primeiro viewport, retornam após a principal prova de
   valor e no encerramento, sem bloquear a consulta.
6. Todos os CTAs comerciais abrem `https://wa.me/5548988344559` com mensagem pré-preenchida
   específica do entregável e do preço; não ativam checkout nem alteram flags financeiros.
7. Cada página tem canonical próprio, `index,follow`, Open Graph e JSON-LD `WebPage` + `Report` +
   `BreadcrumbList`, consta nos sitemaps e é alcançável a partir de `/entregas/` e `/casos/`.
8. Analytics usam apenas eventos e atributos sem PII, com `source=CONFENGE_WEB`, `asset_id` próprio
   e posições de CTA distinguíveis.
9. Testes automatizados cobrem conteúdo, anonimização, preço/CTA, indexabilidade, sitemap e
   reconciliação numérica entre páginas.
10. Após CI verde e merge em `main`, o deploy responde HTTP 200 em cada URL canônica.

## Market-Capture Gate

- Decision state: `EXECUTE_NOW`
- Executive fronts: Revenue Now + Inbound Core
- Time to evidence: imediatamente após deploy, por `asset_view` e clique no WhatsApp por entregável
- Leverage: revenue, distribution, trust
- Repetition test: cada entregável já produzido no Diagnóstico vira ativo público permanente de
  aquisição; a repetição melhora o sistema porque cria degraus de entrada em vez de mais páginas.

## Riscos aceitos

- A escada avulsa soma mais que o pacote. Isso é deliberado: o pacote precisa continuar sendo a
  melhor compra.
- O crédito de 60 dias é um compromisso comercial novo, aprovado pelo fundador nesta story.
