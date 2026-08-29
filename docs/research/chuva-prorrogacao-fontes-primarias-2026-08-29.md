# Revalidação de fontes primárias — chuva e prazo de obra pública

- `accessed_at`: `2026-08-29`
- escopo: `/conteudos/chuva-prorrogacao-prazo-obra-publica/`
- pergunta: quando um evento pluviométrico/climático deixa de ser mero risco ordinário e passa a ter relevância técnica demonstrável para o prazo?
- método: conferência do texto consolidado da Lei 14.133/2021, de decisões e orientação oficiais do TCU e das páginas, dados e metodologia oficiais do INMET
- resultado: `PASS_WITH_LIMITS`
- limite: esta nota separa constatação meteorológica, efeito operacional e enquadramento contratual; não é parecer jurídico, não qualifica nenhum evento real e não promete prorrogação, indenização, deferimento ou ausência de sanção

## Resposta sustentada

Um evento deixa de ser tratável apenas como “choveu” quando há uma cadeia verificável e coerente no mesmo recorte de local, tempo e contrato:

1. **evento observado**: estação, código, intervalo de medição, unidade, variável e qualidade/completude do dado identificados;
2. **referência histórica oficial**: comparação declarada com a estação e o período de referência adequados, sem converter uma média climatológica em limiar jurídico;
3. **atividade afetada**: serviço, frente, janela planejada e restrição técnica que expliquem por que aquela chuva impediu ou reduziu a atividade;
4. **efeito no caminho crítico**: cronograma-base e atualização contemporânea mostram consumo de folga ou deslocamento de marco, em vez de presumir que toda paralisação local atrasou o término;
5. **registro contemporâneo**: diário, inspeções, fotos datadas, recursos mobilizados, orientações da fiscalização e dados oficiais convergem sobre ocorrência, duração e consequência;
6. **mitigação e resíduo**: ficam registrados proteção, drenagem, reprogramação ou frente alternativa avaliadas e os dias residuais efetivamente atribuíveis ao evento, ou `UNKNOWN` quando o nexo não pode ser isolado.

Essa cadeia é uma **síntese técnica inferida** das fontes abaixo, não um teste legal criado por uma única autoridade. Ela contém dois eixos que não podem ser confundidos:

- **anormalidade meteorológica** compara observação e referência histórica;
- **impacto operacional** liga o evento à atividade, à sequência do cronograma e ao efeito residual após mitigação.

Um desvio meteorológico não prova sozinho atraso. Inversamente, chuva não classificada como estatisticamente excepcional pode afetar uma atividade sensível, mas o tratamento contratual desse impacto depende do edital, do contrato, da matriz de riscos, das premissas de planejamento e da prova produzida. O Acórdão 3.077/2010-TCU-Plenário é particularmente útil para esse limite: no contrato específico examinado, o TCU distinguiu chuva extraordinária de chuva que efetivamente influía nos trabalhos porque a própria sistemática contratual alocava e remunerava os eventos de modo diferente.

## Três camadas que a página deve manter separadas

| Camada | O que pode ser afirmado | O que não decorre dela |
|---|---|---|
| Chuva ordinária | O evento está dentro da referência esperada ou do risco que os documentos contratuais trataram como previsível/alocado. Ainda pode exigir registro e mitigação operacional. | Não se conclui que qualquer improdutividade será aceita nem que todo impacto pertence ao contratado sem ler contrato e matriz. |
| Excepcionalidade estatística ou operacional | A observação diverge da referência por método declarado, ou frequência, distribuição horária, fase da obra, terreno e sensibilidade da atividade tornam o efeito fora da premissa usada no planejamento. | “Acima da média” não é sinônimo automático de evento excepcional, força maior ou direito. Não existe nas fontes examinadas um limiar universal em milímetros. |
| Impacto real no prazo | Há nexo entre o evento, a atividade planejada, a folga/caminho crítico, a mitigação tentada e a variação residual do marco contratual. | Quantidade de dias com precipitação, isoladamente, não equivale a dias de prorrogação. |

## Matriz reproduzível para qualificar o evento

| Campo | Registro mínimo reproduzível | Falha que exige `UNKNOWN` ou ressalva |
|---|---|---|
| Evento observado | fonte oficial; estação/código; município e posição; variável; unidade; início/fim do intervalo; resolução horária ou diária; dado bruto preservado | “Choveu muito”, print sem origem, notícia ou acumulado sem janela de medição |
| Referência histórica/oficial | estação ou critério técnico de representatividade; Normal 1991–2020 ou outra série oficial identificada; mês/decêndio/dia comparável; método de comparação; lacunas | misturar estação, período, resolução ou variável; tratar média como percentil/tempo de retorno |
| Atividade afetada | serviço e frente; local; janela planejada; condição técnica impeditiva; equipe/equipamento disponível; registro de início e retomada | atribuir a paralisação da obra inteira a uma chuva sem identificar o serviço sensível |
| Caminho crítico | versão e data do cronograma-base; atualização do evento; predecessoras/sucessoras; folga antes/depois; marco final afetado | apenas dias parados, sem mostrar sequência, folga ou deslocamento do marco |
| Registro contemporâneo | diário de obra/fiscalização; foto/inspeção datada; comunicação; condição do terreno; recursos; horário; convergência com dado oficial | narrativa reconstruída posteriormente sem rastreabilidade ou mera anotação “chuva” |
| Mitigação | proteção, bombeamento/drenagem, reprogramação, frente alternativa, reforço/recuperação; decisão, responsável e resultado | afirmar inevitabilidade sem registrar alternativas tecnicamente possíveis e tentadas |
| Dias efetivamente impactados | unidade contratual (dia útil ou corrido); fórmula declarada; intervalo de impedimento e retomada; exclusão de folga, sobreposição e causas concorrentes; resultado residual ou `UNKNOWN` | somar automaticamente cada dia com precipitação, duplicar chuva e tempo de secagem ou arredondar sem regra |

O limiar de **1 mm** usado pelo INMET serve à contagem climatológica de “dia com chuva” na publicação das Normais. Não é, por si, limiar de inviabilidade de serviço nem fórmula de prorrogação. Da mesma forma, o acumulado diário convencional corresponde, na metodologia 1991–2020, ao total medido às 12 UTC entre 12 UTC do dia anterior e 12 UTC do dia atual; ele pode ocultar a distribuição dentro do turno. Se a tese depender de intensidade ou horário, deve-se verificar se existe série oficial de resolução compatível para a estação e o intervalo reais.

## Matriz de evidência oficial

| Fonte oficial | Claims estritamente sustentados | Limitação obrigatória | `accessed_at` |
|---|---|---|---|
| [Lei 14.133/2021 — texto consolidado, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm) | Art. 22, §§ 1º–2º: a matriz deve alocar responsabilidades e prever mecanismos para evitar/mitigar o sinistro, refletidos no contrato. Art. 92, VII e IX: o contrato estabelece prazos das etapas e matriz de risco quando for o caso. Art. 103, §§ 4º–5º: a alocação deve ser observada nos pleitos e, atendidas as condições contratuais, os riscos assumidos não geram restabelecimento, ressalvadas as exceções legais. Art. 115, caput e § 5º: as partes executam as cláusulas pactuadas; havendo impedimento, ordem de paralisação ou suspensão, o cronograma é prorrogado pelo tempo correspondente e a circunstância é anotada. Art. 117, §§ 1º–2º: a fiscalização registra ocorrências e escala decisões. Art. 124, II, “d”, e art. 137, V: caso fortuito/força maior e fatos imprevisíveis ou de consequências incalculáveis exigem os pressupostos do dispositivo, respeito à repartição de risco e, para extinção, comprovação regular. | A lei não define “chuva excepcional”, estação representativa, milímetros impeditivos, método de comparação, caminho crítico ou fórmula de dias. O § 5º do art. 115 não diz que toda chuva é automaticamente um impedimento. Reequilíbrio, extensão de cronograma, vigência, indenização e extinção são decisões distintas. | `2026-08-29` |
| [TCU — Acórdão 639/2006-Plenário](https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/639/2006/Plen%C3%A1rio) | No caso de contratos da TBG/Petrobras em que condições climáticas ordinárias deveriam ter sido avaliadas e incluídas na proposta, o Tribunal distinguiu chuva normal de evento excepcional não previsto no planejamento, considerou insuficiente inferir excepcionalidade da simples ocorrência/paralisação e determinou critérios contratuais para indenização por eventos climáticos excepcionais. | Caso concreto anterior à Lei 14.133/2021, com cláusulas e modelo de remuneração próprios. Não cria teste universal, percentual, milímetro ou direito aplicável a qualquer obra. Diário de obra continua relevante para ocorrência/impacto, mas, naquele caso, não bastou para provar excepcionalidade. | `2026-08-29` |
| [TCU — Acórdão 3.077/2010-Plenário](https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/3077/2010/Plen%C3%A1rio) | No contrato específico examinado, o Tribunal distinguiu o modelo em que o preço já absorvia condições ordinárias daquele cuja sistemática ressarcia chuva que efetivamente influísse nos trabalhos. O voto registrou que volume isolado não explica todo impacto: frequência, fase da obra, tipo de terreno e intensidade horária podem alterar o efeito; a extensão de prazo também dependia da cláusula que exigia serviço paralisado no caminho crítico. | Caso Petrobras/Comperj, anterior à Lei 14.133/2021 e dependente de anexos contratuais próprios. Serve para impedir generalização, não para importar sua metodologia ou remuneração para outro contrato. | `2026-08-29` |
| [TCU — Licitações e Contratos, matriz de riscos](https://licitacoesecontratos.tcu.gov.br/4-5-5-matriz-de-riscos/) | A orientação oficial contemporânea sistematiza os arts. 22 e 103: risco, responsabilidade, tratamento, quantificação e efeito sobre pleitos devem ser lidos em conjunto com a matriz e o contrato. | Material orientativo, não substitui o texto legal, o contrato nem a decisão competente no caso concreto. Não contém critério pluviométrico. | `2026-08-29` |
| [INMET — Normais Climatológicas do Brasil 1991–2020](https://portal.inmet.gov.br/normais) e [metodologia oficial](https://portal.inmet.gov.br/uploads/normais/NORMAISCLIMATOLOGICAS.pdf) | O INMET disponibiliza referência 1991–2020 por estação e variáveis de precipitação, incluindo acumulados, dias acima de limiares e recortes mensais/decendiais. A publicação define normal como média de período longo e uniforme, informa regras de completude e explica que precipitação diária convencional é o acumulado entre 12 UTC de dias consecutivos. | Normal é referência climática, não laudo de nexo nem critério contratual. Média não equivale a percentil ou tempo de retorno. A edição usa estações convencionais, o número de estações varia por parâmetro, registra limitações de observação em 2020 e exige atenção a dados faltantes. | `2026-08-29` |
| [INMET — BDMEP, dados históricos](https://portal.inmet.gov.br/servicos/bdmep-dados-historicos) e [interface de consulta](https://bdmep.inmet.gov.br/) | O serviço oficial abriga dados meteorológicos históricos de estações da rede do INMET e permite selecionar tipo de estação, período, variável e local para obter dados em CSV. | A existência de uma estação ou série completa perto de uma obra não pode ser presumida. Disponibilidade, fundação/operação, lacunas, resolução, metadados e representatividade espacial precisam ser verificadas para cada consulta; esta pesquisa não solicitou série de um caso real. | `2026-08-29` |

## Regras editoriais factualmente seguras

1. Responder no início: **“Choveu” não prova nexo nem direito. A relevância técnica aparece quando observação oficial, referência adequada, atividade afetada, caminho crítico, registro contemporâneo e mitigação convergem; o efeito contratual depende da alocação de riscos e dos documentos do caso.**
2. Não chamar de “excepcional” apenas porque o acumulado ficou acima da média mensal. Declarar estação, variável, resolução, período, método e limitações; quando a análise estatística necessária não existir, usar `UNKNOWN`.
3. Não converter “dia com precipitação ≥ 1 mm” do INMET em “dia improdutivo” ou “dia devido”.
4. Não usar o Acórdão 639/2006 como regra universal: contrastá-lo com o Acórdão 3.077/2010 e explicar que a alocação contratual altera a análise.
5. Não somar chuva, saturação/secagem, paralisação e retomada como blocos independentes sem excluir sobreposição e causas concorrentes.
6. Separar a qualificação técnica do evento da instrução do pedido, da defesa contra notificação, da prova de culpa da Administração e da interpretação jurídica do dispositivo aplicável.
7. Encaminhar para revisão jurídica quando houver disputa de alocação de risco, enquadramento como força maior/caso fortuito, aplicação do art. 115, alteração de vigência, reequilíbrio, indenização, sanção, rescisão/extinção ou conflito entre contrato e matriz.

## Limitações desta revalidação

- Não foram fornecidos local da obra, estação, datas, cronograma, contrato, matriz de riscos, diário ou evento real; portanto nenhum número, percentil, série, dia impactado ou conclusão de excepcionalidade foi produzido.
- A distância até a estação mais próxima não basta para afirmar representatividade. Relevo, altitude, regime local, descontinuidade da série e resolução podem exigir justificativa meteorológica específica ou outra fonte oficial competente.
- Os precedentes do TCU examinados tratam de arranjos contratuais próprios e legislação anterior. Foram usados somente para mostrar por que chuva, excepcionalidade, atividade e regra contratual não podem ser colapsadas em uma única inferência.
- A disponibilidade contemporânea do portal/BDMEP foi confirmada, mas não a disponibilidade de uma série específica. Qualquer exemplo numérico futuro deve ser explicitamente sintético ou vir acompanhado do arquivo oficial, metadados, método, unidade, premissas e limitações do caso real.
