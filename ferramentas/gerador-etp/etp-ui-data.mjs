// Conteúdo da entrevista: os 13 incisos do art. 18 na ordem do modelo, os grupos que explicam essa ordem e um
// exemplo demonstrativo por item. Os exemplos aparecem só como placeholder e nunca entram nas respostas.
export const GROUPS = {
  I: 'Diagnóstico da necessidade',
  V: 'Alternativas e valor',
  VII: 'Solução e conclusão',
};

export const SECTIONS = [
  ['I', 'Necessidade da contratação', true, 'Que problema precisa ser resolvido? Informe a situação atual, quem é afetado, o interesse público e a evidência disponível.'],
  ['II', 'Plano de Contratações Anual', false, 'O órgão elaborou PCA? Se sim, indique o exercício e a referência do objeto. Se não foi previsto ou não houve plano, explique a situação.'],
  ['III', 'Requisitos da contratação', false, 'O que a solução precisa atender e por quê? Informe qualidade, desempenho, prazo, restrições e critérios de sustentabilidade pertinentes.'],
  ['IV', 'Estimativa das quantidades', true, 'Indique itens, quantidades, unidades e período de referência. Use a memória e uma fonte para que a equipe consiga refazer a estimativa.'],
  ['V', 'Levantamento de mercado', false, 'Quais alternativas foram pesquisadas? Compare atendimento, custo e risco, explique a preferência e identifique as fontes.'],
  ['VI', 'Estimativa do valor da contratação', true, 'Informe o total estimado, os preços unitários referenciais, a data da referência, a origem dos valores e a memória de cálculo.'],
  ['VII', 'Solução como um todo', false, 'Descreva o que compõe a solução escolhida. Se pertinente, inclua implantação, operação, manutenção e assistência técnica.'],
  ['VIII', 'Parcelamento ou não da contratação', true, 'Justifique contratar junto ou em lotes, considerando competição, viabilidade, escala, dependências e custos de coordenação.'],
  ['XI', 'Contratações correlatas ou interdependentes', false, 'Indique contratações com objeto semelhante e, separadamente, as que são necessárias para esta solução funcionar. Explique os vínculos.'],
  ['X', 'Providências prévias da Administração', false, 'Que medidas precisam ocorrer antes da celebração? Inclua instalações, licenças, acessos ou capacitação de gestão e fiscalização se forem necessárias.'],
  ['XII', 'Impactos ambientais e mitigação', false, 'Que impactos são esperados? Identifique medidas de mitigação, consumo de recursos, descarte, reciclagem ou logística reversa quando cabível.'],
  ['IX', 'Resultados pretendidos', false, 'Que benefício se espera e como poderá ser medido? Informe economia, eficiência ou uso dos recursos, de preferência com uma referência inicial e uma meta.'],
  ['XIII', 'Posicionamento conclusivo', true, 'A contratação é adequada, inadequada ou viável com condicionantes? Registre a posição da equipe e as evidências que sustentam a conclusão.'],
];

const byType = (bens, servicos, obras, tic) => ({ bens, servicos, obras, tic });
export const EXAMPLES = {
  I: byType(
    'Ex.: Os notebooks das 12 escolas têm mais de oito anos e 30% estão fora de uso, o que suspende as aulas de informática de 2.400 alunos (inventário de março).',
    'Ex.: A limpeza das cinco unidades de saúde é feita por servidores remanejados do atendimento; o relatório da coordenação registra 40 horas semanais desviadas.',
    'Ex.: A cobertura da escola tem infiltrações em seis salas, interditadas por laudo da Defesa Civil de maio; 180 alunos estão em turnos reduzidos.',
    'Ex.: O sistema de protocolo está sem suporte do fabricante e fica indisponível em média três dias por mês, segundo os chamados registrados.'),
  II: 'Ex.: A contratação consta do PCA de 2027, item 14 (equipamentos de informática).',
  III: byType(
    'Ex.: Garantia mínima de 36 meses no local, entrega em até 45 dias e selo de eficiência energética.',
    'Ex.: Equipe disponível de segunda a sábado, produtos com registro na Anvisa e reposição de faltas em até duas horas.',
    'Ex.: Telhas termoacústicas, execução nas férias escolares e projeto aprovado pelo setor de engenharia.',
    'Ex.: Acesso pelo navegador, integração com o diretório de usuários, cópia de segurança diária e exportação dos dados em formato aberto.'),
  IV: byType(
    'Ex.: 120 notebooks: 10 por escola × 12 escolas, conforme o inventário de março.',
    'Ex.: Cinco postos de limpeza de 44 horas semanais, um por unidade de saúde, por 12 meses.',
    'Ex.: 1.250 m² de cobertura, medidos no levantamento de abril.',
    'Ex.: 300 licenças de usuário: 280 servidores ativos e 20 de reserva para 12 meses.'),
  V: 'Ex.: Comparamos compra, locação e recuperação dos equipamentos atuais. A compra teve o menor custo em quatro anos e o menor risco de descontinuidade.',
  VI: byType(
    'Ex.: Valor total estimado: R$ 540.000,00, com base em três contratações similares e duas cotações (referência de outubro de 2026).',
    'Ex.: Valor total estimado: R$ 410.000,00 para 12 meses, com base em contratações similares e na convenção coletiva vigente.',
    'Ex.: Valor total estimado: R$ 287.500,00, com base no SINAPI de setembro de 2026 para o município, com BDI de 24%.',
    'Ex.: Valor total estimado: R$ 180.000,00 para 12 meses, com base em três contratações de outros órgãos e duas propostas.'),
  VII: 'Ex.: Aquisição com entrega, instalação, configuração inicial e garantia no local por 36 meses.',
  VIII: 'Ex.: Lote único: entrega, instalação e garantia dependem do mesmo fornecedor, e a divisão elevaria o custo de coordenação.',
  XI: 'Ex.: Depende da contratação dos pontos de rede em andamento (processo 22/2026).',
  X: 'Ex.: Adequar a rede elétrica das salas e capacitar dois servidores para a fiscalização do contrato.',
  XII: 'Ex.: Exigir eficiência energética e logística reversa dos equipamentos substituídos.',
  IX: 'Ex.: Reduzir de 30% para zero os equipamentos fora de uso até o fim do semestre letivo.',
  XIII: 'Ex.: A contratação é adequada à necessidade, desde que a adequação elétrica seja concluída antes da entrega.',
};
export const OMISSION_EXAMPLE = 'Ex.: Explique por que o item não se aplica a este caso, com o fato que sustenta a conclusão.';

export const example = (id, objectType) => {
  const value = EXAMPLES[id];
  return typeof value === 'string' ? value : value?.[objectType] ?? value?.bens ?? '';
};
