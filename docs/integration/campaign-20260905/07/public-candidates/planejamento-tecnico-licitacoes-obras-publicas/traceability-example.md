# Exemplo sintético de rastreabilidade entre as peças

O encadeamento abaixo demonstra o método sem usar documento real ou sigiloso. O exemplo é propositalmente abstrato e não constitui solução, orçamento, parecer ou responsabilidade técnica para uma obra existente.

| ID | Registro sintético | Alimenta | Verificação |
| --- | --- | --- | --- |
| NEC-01 | “A edificação pública apresenta ambientes sem condição de uso” | ETP-01 | necessidade descrita sem antecipar solução |
| ALT-01 | “comparar reparo localizado, reforma por etapas e intervenção integral” | ETP-01 | alternativas usam os mesmos critérios declarados |
| DEC-01 | “alternativa selecionada pelo ente, com motivação a registrar” | OBJ-01 | decisão e aprovação permanecem com o ente |
| OBJ-01 | “escopo técnico delimitado da intervenção escolhida” | PB-01, ESP-01 | objeto não é mais amplo que a necessidade e a decisão |
| PB-01 | “soluções e disciplinas do projeto básico” | QTD-01, ORC-01, CRO-01 | cada item orçado aponta para projeto/especificação |
| ESP-01 | “requisitos de desempenho, material e execução” | QTD-01, MED-01 | critério de medição reproduz requisito verificável |
| QTD-01 | “quantitativos com origem e memória” | ORC-01, CRO-01 | unidade, fórmula e versão identificadas |
| ORC-01 | “custos, BDI, encargos, data-base e fontes” | ETP-01, CRO-01 | todo preço tem fonte/premissa; lacuna fica marcada |
| CRO-01 | “sequência, duração, desembolso e dependências” | MED-01, RSK-01 | prazo fecha com quantitativos e marcos |
| MED-01 | “critérios técnicos de medição e recebimento” | instrumento da contratação | quem mede não é confundido com quem recebe ou decide |
| RSK-01 | “risco, causa, consequência, owner proposto e tratamento” | matriz contratual, quando aplicável | alocação final é decisão do ente |

## Regras de consistência

1. Toda decisão aponta para o responsável e para a versão da evidência usada.
2. Todo quantitativo aponta para um projeto, levantamento ou premissa identificada.
3. Todo item de orçamento aponta para quantitativo, composição/fonte, data-base e regra de BDI/encargos.
4. Todo marco de cronograma aponta para entregas mensuráveis e dependências.
5. Todo critério de medição aponta para o objeto e para evidência verificável.
6. Todo risco distingue identificação técnica, proposta de tratamento e decisão de alocação.
7. Mudança em uma peça dispara revisão das dependências; nunca se sobrescreve a trilha anterior.
