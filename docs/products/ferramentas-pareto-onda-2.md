# CONFENGE | Segunda onda de ferramentas: mais 24 análises de valor recorrente

**Decisão comercial:** EXECUTE_NOW para MVP funcional; VALIDATE para demanda, margens e monetização. **Data:** 2026-11-21.  
**Relação:** PR #865 é a base funcional; esta PR empilha **24 ferramentas adicionais** sobre as primeiras 24, chegando a **48** no mesmo ambiente `/ferramentas/analises-de-obra/`.  
**Hipótese:** o segundo conjunto amplia as situações atendidas com maior frequência de retorno; 80/20 é hipótese, **não** participação observada em vendas.

## Seleção do segundo conjunto (24 das 122 ideias)

| Frente | Novos trabalhos resolvidos | Causa provável de uso recorrente |
|---|---|---|
| Compras e margem (8) | Diferenças entre duas revisões de orçamento; previsto versus realizado; conciliação de pedidos e notas; impacto de desvios de preços unitários; comparação logística de fornecimento; condições de lote mínimo; reposição de materiais; simulação de descontos em propostas | Novas cotações, entregas, decisões de preço, reorçamentos |
| Condomínios e imóveis (8) | Agenda de manutenção; fundo de reserva; acompanhamento de garantias; medições seriadas de fissuras; mapa de manifestações patológicas; reforma por área; comparação de propostas; conferência de recebimento | Manutenção, reforma, assembleias, inspeções e garantias |
| Segurança e qualidade (5) | Matriz preliminar de riscos por atividade; controle documental de EPI; agenda de treinamentos; checklist para permissão de trabalho; ações corretivas | Inspeções periódicas, equipes, prazos e evidências |
| Projetos e entregas (3) | Controle de revisões de pranchas; quadro de aceite de entregáveis; capacidade de equipe técnica | Entregas, revisões, carga de trabalho e aprovações |

### Implementação

1. `onda-2.mjs` declara as 24 situações e exemplos sintéticos. `onda-2-motor.mjs` executa os cálculos e verificações, sem requisições externas ou transmissão de conteúdo.
2. `catalogo.mjs` e `motor.mjs` combinam os 24 motores existentes com os novos 24, **sem substituir nem reescrever os anteriores**.
3. A interface existente continua usando identidade visual CONFENGE, importação CSV via Papa Parse 5.5.3 MIT, rascunho JSON local e exportação de resultados TXT pela carteira única habilitada por servidor. A marca e aviso da biblioteca MIT permanecem preservados na PR de base.
4. A rota permanece `noindex,follow` e sem páginas programáticas novas. A indexação só pode mudar com evidência de utilidade específica, governança comercial, fontes e checks de SEO.
5. Novos testes de unidade cobrem os 24 cenários, cálculos, datas, duplicidades, recusa de entrada impraticável, controles de segurança, limites normativos e distinção entre aceite, faturamento e recebimento. O workflow específico verifica as duas ondas.

### Delimitações profissionais e jurídicas

São operações sobre **entradas do usuário**. Não substituem projeto, vistoria técnica, laudo, aprovação de órgão, confirmação de validade de certidão, entrega comprovada ou verificação de pagamentos. A matriz de riscos usa uma escala demonstrativa de 1 a 5 e não constitui PGR nem permissão de trabalho. A leitura de abertura de fissuras registra variação de milímetros, sem inferir sua causa ou segurança estrutural. Datas de treinamentos e garantias não são extraídas automaticamente das normas ou do contrato. A comparação de orçamentos, notas e propostas não valida sua equivalência jurídica ou técnica.

### Autorização e retorno econômico

- Não cria preço, SKU, assinatura, CRM, API de cobrança ou login paralelo.
- O resultado é exibido sem pagamento, e a emissão de TXT depende do fluxo existente de créditos, sem copiar documentos de entrada para o backend.
- Uma exportação paga não é automaticamente receita líquida, contrato ou prova de aceitação do resultado; a conciliação financeira continua externa à aplicação.
- A decisão de aprofundar uma ferramenta depende de **receitas recebidas, margem, custo por emissão, recorrência, solicitações qualificadas e conversões em serviços**, comparadas entre categorias. Com a arquitetura agregada atual, a atribuição de receitas por ferramenta individual ainda demanda uma evolução de eventos e ledger, a ser tratada sem transmitir dados pessoais.

### Revisão de entrega e publicação

- O primeiro lote permanece independente na PR #865. Esta PR deve ser revisada como diferença exclusivamente da segunda onda.
- **Não efetuar merge diretamente em main enquanto a PR #865 não passar seus gates.** Depois de integrar a base, comparar novamente com `main`, resolver conflitos com as PRs #859 e #860 se houver e exigir novo CI.
- `site-ci`, `pSEO quality gates`, CodeQL, controle de licenças e testes de navegação são bloqueantes. Não transformar alertas em avisos só para publicar.
- O deploy à Netcup será consequência do merge com gates aprovados; confirmar o SHA promovido, a rota pública e o funcionamento com arquivos de exemplo antes de registrar produção.
- Reversão por revert da segunda PR preserva o primeiro lote, o catálogo institucional e o saldo da carteira.
