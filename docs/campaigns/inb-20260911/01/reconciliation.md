# Reconciliação compra → rota (INB-01)

Fonte canônica no release: `data/bofu-dominance/core/purchase-route-map.v1.json`. Esta nota é recibo, não catálogo de produção.

Inventário em 2026-09-11 sobre `origin/main` `8f508544835490ec635d02517bce0207c6f8e426`. Ausência na home não foi usada como prova de ausência de rota.

| Compra | Job | Consulta-semente (hipótese) | Família | Oferta | URL atual | Alias pedido | Apoio | Prova | Contato | Dono | Decisão | Tipo | Contexto |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Quantitativos e orçamento | Levantar quantidades ou orçar obra pública ou privada | quantitativos orçamento obras (GSC 1/0/1,00) | orcar_planejar_decidir | quantity_takeoff_budgeting | /quantitativos-orcamento-obras/ | — | /servicos/#servico-projeto | método e limites na landing | #triagem-quantitativos | INB-03 | KEEP | serviço | mixed |
| Compatibilização | Resolver interferências entre disciplinas | compatibilização de projetos (SERP 11/09: clash/interfaces) | projetar_revisar_compatibilizar | bim_coordination_clash_register | /servicos/#servico-projeto | /compatibilizacao-projetos-engenharia/ | /entregas/ | diferenciar de revisão e elaboração | /triagem-tecnica/#projetos | INB-04 | CREATE | serviço | mixed |
| Revisão técnica | Revisar critérios de um projeto já elaborado | revisão técnica de projetos | projetar_revisar_compatibilizar | complementary_engineering_project_review | /servicos/#servico-projeto | /revisao-tecnica-projetos-engenharia/ | /entregas/ | relatório de pontos localizados | /triagem-tecnica/#projetos | INB-05 | CREATE | serviço | mixed |
| Projetos complementares | Elaborar disciplina complementar | projetos complementares de engenharia | projetar_revisar_compatibilizar | complementary_engineering_project_review | /servicos/#servico-projeto | /projetos-complementares-engenharia/ | /entregas/ | sem autoria arquitetônica | /triagem-tecnica/#projetos | INB-12 | CREATE | serviço | mixed |
| Demonstrativo INB-06 | Ver método, números hipotéticos | exemplo de entrega | projetar_revisar_compatibilizar | — | /casos/ | filho de /casos/ (slug do produtor 06) | demonstrativos existentes | rótulo demonstrativo | service_transition /casos/ | INB-06 | CREATE | prova | mixed |
| Auditoria de orçamento do edital | Auditar planilha e BDI públicos | sinapi desonerado (GSC 17/1/6,71) | orcar_planejar_decidir | budget_audit_feasibility | /auditoria-orcamento-licitacao/ | — | artigos SINAPI | pilar B2G | formulário da landing | INB-01 | KEEP | serviço | public |
| SINAPI informacional | Qual tabela usar | sinapi desonerado ou não desonerado | orcar_planejar_decidir | — | /conteudos/sinapi-desonerado-nao-desonerado/ | — | sinapi-ou-sicro, produtividade-sinapi | permanece informacional | /auditoria-orcamento-licitacao/ | INB-01 | KEEP | conteúdo de decisão | public |
| Hub serviços | Reconhecer a situação | serviços de engenharia | outra_demanda_tecnica | — | /servicos/ | — | /entregas/ | âncoras preservadas | /triagem-tecnica/ | INB-09 | KEEP | hub | mixed |

Pilares B2G protegidos permanecem KEEP. Famílias ainda no hub (`inspecionar_diagnosticar`, `receber_entregar_reformar`, `documentar_as_built_regularizar`, `avaliar_imovel`, `produzir_prova_tecnica`, `organizar_sst`, `assistencia_trabalhista_sst`, `planejar_contratacao_publica`) estão ENRICH no destino existente, sem slug novo.

Amostra GSC 02–08/09/2026 (export 11/09): 176 impressões / 6 cliques da propriedade. Não é diagnóstico causal. Zero impressões não impede rota nova com qualidade.
