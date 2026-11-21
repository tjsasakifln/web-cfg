export const scenarios = {
  simple: ['Prazo e custo de quatro atividades', 'Veja quais atividades determinam o prazo da obra. Altere a data, as durações e os custos para comparar cenários.'],
  crew: ['Cronograma com equipe compartilhada', 'Compare o prazo com e sem um limite de equipe e acompanhe o custo acumulado.'],
  water: ['Perda de carga em tubulação', 'Altere a vazão ou o diâmetro e veja o efeito na velocidade e na perda de carga entre o reservatório e o ponto de consumo.'],
  power: ['Carga e proteção em uma rede de duas barras', 'Confira as tensões nas barras, a corrente de curto-circuito e o intervalo entre atuações dos relés.'],
  starter: ['Circuito de partida e parada com lâmpada', 'Confira as ligações e veja a lista de fios e materiais.'],
  faulty: ['Circuito com ligação faltante', 'Veja como as verificações apontam um terminal sem conexão.'],
  planar2: ['Braço articulado de dois elos', 'Compare a posição da extremidade, os ângulos das juntas e os torques de sustentação.'],
  fourbar: ['Mecanismo de quatro barras', 'Acompanhe o movimento e identifique posições em que o mecanismo pode travar.'],
  slidercrank: ['Mecanismo de biela e manivela', 'Acompanhe o deslocamento do cursor durante uma volta da manivela.'],
  scara: ['Braço robótico SCARA', 'Veja a posição final do braço para os valores de junta do exemplo.'],
  mm1: ['Tempo de espera com um atendente', 'Compare a espera e a ocupação do atendente conforme o ritmo de chegada e o tempo de atendimento.'],
  line: ['Fluxo com entrada, percurso e saída', 'Compare a espera e a ocupação em cada etapa do processo.'],
  pump: ['Verificação de um conjunto de bombeamento', 'Veja quais requisitos têm testes registrados e quais precisam de atenção.'],
  plant: ['Árvore de falhas e reparos', 'Identifique quais falhas isoladas interrompem o sistema e consulte a disponibilidade calculada.'],
  life: ['Vida útil e análise de modos de falha', 'Compare os modos de falha por prioridade e consulte o ajuste da curva de vida útil.'],
  codecs: ['Leitura de mensagens Modbus e MQTT', 'Veja como o exemplo interpreta mensagens e compara leituras com valores de referência.'],
  rc: ['Filtro RC em frequência', 'Compare ganho e fase da saída do filtro ao variar a frequência.'],
  step: ['Resposta de um circuito RC ao degrau', 'Acompanhe a tensão no circuito ao longo do tempo após uma mudança na entrada.'],
  led: ['Placa de circuito com LED', 'Confira a lista de componentes e as verificações geométricas da placa de exemplo.'],
  faults: ['Placa com conexões inválidas', 'Veja como a verificação sinaliza uma conexão incompatível com o componente.'],
  cool: ['Resfriamento de um corpo', 'Acompanhe a temperatura do corpo ao longo do tempo até se aproximar da temperatura ambiente.'],
  divider: ['Divisor de tensão', 'Compare as tensões nos nós do circuito resistivo.'],
  ton: ['Temporizador de 100 ms', 'Acompanhe o tempo acumulado e veja em qual ciclo a saída é ativada.'],
  bound: ['Liberação de itens em grupos de três', 'Veja quando o controle libera os itens acumulados na fila.'],
  counter: ['Contador com lâmpada', 'Acompanhe a contagem e o estado da saída a cada ciclo.'],
};

const activities = ['Escavação', 'Fundações', 'Instalações', 'Laje'];
export const guidedFields = {
  water: [
    { path: 'fluid.nodes.0.head', label: 'Carga hidráulica no reservatório (m)', min: 0 },
    { path: 'fluid.nodes.1.demand', label: 'Vazão de consumo (L/s)', positive: true, scale: 1000 },
    { path: 'fluid.links.0.L', label: 'Comprimento do tubo (m)', positive: true },
    { path: 'fluid.links.0.D', label: 'Diâmetro interno (mm)', positive: true, scale: 1000 },
    { path: 'fluid.links.0.C', label: 'Coeficiente de Hazen–Williams (C)', positive: true },
  ],
  simple: [
    { path: 'start', label: 'Data de início', type: 'date' },
    ...activities.flatMap((name, i) => [
      { path: 'tasks.' + i + '.dur', label: name + ' — duração (dias úteis)', positive: true, integer: true },
      { path: 'tasks.' + i + '.cost', label: name + ' — custo (R$)', min: 0 },
    ]),
  ],
  mm1: [
    { path: 'model.nodes.0.arrival.exp', label: 'Intervalo médio entre chegadas (min)', positive: true },
    { path: 'model.nodes.1.service.exp', label: 'Tempo médio de atendimento (min)', positive: true },
  ],
};

export function localizedExample(id, text) {
  if (id !== 'simple') return text;
  const model = JSON.parse(text);
  model.tasks.forEach((task, i) => { task.name = activities[i]; });
  return JSON.stringify(model, null, 2);
}

export function atPath(model, path) {
  const keys = path.split('.');
  const key = keys.pop();
  return [keys.reduce((owner, name) => owner?.[name], model), key];
}

// A custom model only gets guided fields if the example's topology and fixed
// assumptions still match. Older saved models remain available in the editor.
export function guidedModel(text, original, fields) {
  if (!fields) return null;
  try {
    const model = JSON.parse(text);
    const comparable = JSON.parse(text);
    const baseline = JSON.parse(original);
    for (const { path, type } of fields) {
      const [owner, key] = atPath(comparable, path);
      const [source] = atPath(baseline, path);
      if (typeof owner?.[key] !== (type === 'date' ? 'string' : 'number')) return null;
      owner[key] = source[key];
    }
    return JSON.stringify(comparable) === JSON.stringify(baseline) ? model : null;
  } catch {
    return null;
  }
}

export const ptNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 12, useGrouping: false });

export function resultHighlights(id, tables) {
  if (id === 'water') {
    const pipe = tables.find(table => table.title === 'Links')?.rows[0];
    const point = tables.find(table => table.title === 'Nodes (head, m)')?.rows.find(row => row[0] === 'J');
    if (pipe && point) return [
      ['Perda de carga no tubo', pipe[2], 'm'],
      ['Velocidade da água', pipe[3], 'm/s'],
      ['Pressão disponível no ponto de consumo', point[2], 'mca'],
    ];
  }
  if (id === 'simple') {
    const tasks = tables.find(table => table.title.startsWith('Critical path'))?.rows;
    if (tasks?.length) {
      const days = Math.max(...tasks.map(row => Number(row[4])));
      return [['Prazo estimado', days, 'dias úteis']];
    }
  }
  if (id === 'mm1') {
    const rows = tables[0]?.rows;
    const occupancy = rows?.find(row => row[0] === 'desk: utilisation');
    const desk = tables[1]?.rows.find(row => row[0] === 'desk');
    if (occupancy && desk) return [
      ['Ocupação média do atendente', Number(occupancy[1]) * 100, '%'],
      ['Espera média na primeira simulação', desk[4], 'min'],
    ];
  }
  return [];
}

const labels = {
  'Nets': 'Redes de conexão', 'Net': 'Rede', 'Name': 'Nome', 'Wire no.': 'Número do fio', 'Pins': 'Pinos',
  'Wire numbers': 'Numeração dos fios', 'Wire': 'Fio', 'From': 'Origem', 'To': 'Destino', 'Number': 'Número',
  'Cross-references': 'Referências cruzadas', 'Device': 'Dispositivo', 'Coil at': 'Bobina em', 'Contacts': 'Contatos',
  'Bill of materials': 'Lista de materiais', 'Part': 'Peça', 'Maker': 'Fabricante', 'Qty': 'Quantidade', 'Tags': 'Identificadores',
  'Nodes (head, m)': 'Nós da rede hidráulica', 'Node': 'Nó', 'Head': 'Carga hidráulica (m)', 'Pressure head': 'Carga de pressão (mca)', 'Demand': 'Vazão de consumo (m³/s)',
  'Links': 'Trechos da tubulação', 'Link': 'Trecho', 'Flow (m³/s)': 'Vazão (m³/s)', 'Loss (m)': 'Perda de carga (m)', 'Velocity (m/s)': 'Velocidade (m/s)', 'Status': 'Situação',
  'Buses (per unit)': 'Barras (por unidade)', 'Bus': 'Barra', 'Angle (°)': 'Ângulo (°)', 'Branches': 'Ramos', 'Branch': 'Ramo',
  'P from': 'P na origem', 'Q from': 'Q na origem', 'Loading (MVA)': 'Carregamento (MVA)', 'Loss (pu)': 'Perdas (pu)',
  'Fault currents': 'Correntes de curto-circuito', 'Type': 'Tipo', 'Peak ip (A)': 'Pico ip (A)',
  'Relay grading': 'Coordenação de relés', 'Current (A)': 'Corrente (A)', 'Downstream (s)': 'Jusante (s)', 'Upstream (s)': 'Montante (s)', 'Margin (s)': 'Intervalo (s)',
  'Jacobian (rows vx vy vz wx wy wz)': 'Jacobiana (linhas vx vy vz wx wy wz)', 'Holding torque against gravity at rest': 'Torque estático de sustentação',
  'Joint': 'Junta', 'Torque': 'Torque', 'Value': 'Valor', 'IK result': 'Resultado da cinemática inversa', 'Reached': 'Alcançado', 'Iterations': 'Iterações', 'Position error': 'Erro de posição',
  'Four-bar (Grashof)': 'Quatro barras (Grashof)', 'Shortest': 'Menor elo', 'Longest': 'Maior elo', 'Class': 'Classe',
  'Mobility': 'Mobilidade', 'Unknowns': 'Incógnitas', 'Rank': 'Posto', 'Degrees of freedom': 'Graus de liberdade', 'Gruebler count': 'Contagem de Grübler',
  'Sweep of the first driver': 'Variação do primeiro acionamento', 'Driver': 'Acionamento', 'Singularity (0 = locked)': 'Singularidade (0 = travado)',
  'coupler midpoint x': 'x do centro do elo acoplador', 'coupler midpoint y': 'y do centro do elo acoplador',
  'coupler tip x': 'x da ponta do elo acoplador', 'coupler tip y': 'y da ponta do elo acoplador', 'slider x': 'x do cursor', 'slider y': 'y do cursor',
  'Measure': 'Indicador', 'Mean': 'Média', 'Low': 'Limite inferior', 'High': 'Limite superior', 'Std dev': 'Desvio padrão',
  'First run, node by node': 'Primeira simulação por etapa', 'Utilisation': 'Ocupação', 'Throughput': 'Vazão de saída', 'Mean wait': 'Espera média',
  'Critical path (working days from the start)': 'Caminho crítico (dias úteis desde o início)', 'Task': 'Atividade', 'Days': 'Dias',
  'Start': 'Início', 'Finish': 'Fim', 'Total float': 'Folga total', 'Free float': 'Folga livre', 'Critical': 'Crítica', 'Starts on': 'Data de início', 'Finishes on': 'Data de fim',
  'Levelled to the resource limits': 'Cronograma com limite de equipe', 'Cost curve (cumulative, by working day)': 'Curva de custos acumulados por dia útil',
  'Day': 'Dia', 'Cost that day': 'Custo no dia', 'Cumulative': 'Acumulado', 'Schedule risk (finish, working days)': 'Risco de prazo (dias úteis)',
  'Runs': 'Simulações', 'Criticality index': 'Índice de criticidade', 'Critical in': 'Crítica em',
  'Verification matrix': 'Matriz de verificação', 'Requirement': 'Requisito', 'Title': 'Título', 'Elements': 'Elementos', 'Tests': 'Testes', 'State': 'Estado',
  'With children': 'Com subitens', 'Coverage': 'Cobertura', 'Count': 'Quantidade', 'Item': 'Item', 'Kind': 'Tipo', 'Distance': 'Distância',
  'Fault tree': 'Árvore de falhas', 'Minimal cut sets': 'Conjuntos de corte mínimos', 'Cut set': 'Conjunto de corte', 'Probability': 'Probabilidade',
  'Importance': 'Importância', 'Event': 'Evento', 'Reliability block diagram': 'Diagrama de blocos de confiabilidade',
  'Long-run state probabilities': 'Probabilidades dos estados no longo prazo', 'Availability': 'Disponibilidade',
  'FMEA ranked by RPN': 'FMEA por número de prioridade de risco', 'Id': 'Identificador', 'Mode': 'Modo de falha', 'Cumulative share': 'Participação acumulada',
  'Weibull fit (maximum likelihood)': 'Ajuste de Weibull por máxima verossimilhança', 'Risk file': 'Registro de riscos', 'Hazard': 'Perigo', 'Harm': 'Dano',
  'Initial': 'Inicial', 'Residual': 'Residual', 'Controls': 'Controles', 'Residual risk counts': 'Contagem de riscos residuais', 'Level': 'Nível', 'Hazards': 'Perigos',
  'Modbus TCP (read only)': 'Modbus TCP (somente leitura)', 'MQTT 3.1.1 (subscribe only)': 'MQTT 3.1.1 (somente assinatura)',
  'MQTT packets received': 'Pacotes MQTT recebidos', 'Topic': 'Tópico', 'Payload': 'Conteúdo', 'Matches filter': 'Corresponde ao filtro',
  'Label': 'Rótulo', 'Unit': 'Unidade', 'Quality': 'Qualidade', 'Markers for drawings and 3D': 'Marcadores para desenhos e modelos 3D',
  'Target': 'Alvo', 'Text': 'Texto', 'Level 0..1': 'Nível de 0 a 1', 'Plant against model': 'Leituras da instalação e do modelo',
  'Plant': 'Instalação', 'Model': 'Modelo', 'Deviation': 'Desvio', 'AC response (magnitude, phase °)': 'Resposta em frequência (magnitude, fase em graus)',
  'in mag': 'Magnitude da entrada', 'in deg': 'Fase da entrada (°)', 'out mag': 'Magnitude da saída', 'out deg': 'Fase da saída (°)',
  'Operating point': 'Ponto de operação', 'Transient': 'Resposta transitória', 'Board': 'Placa', 'Parts': 'Componentes', 'Footprint': 'Encapsulamento',
  'Rotation': 'Rotação', 'Side': 'Lado', 'Design rule check': 'Verificação de regras de projeto', 'Rule': 'Regra', 'Findings': 'Ocorrências',
  'Output files': 'Arquivos gerados pelo motor', 'File': 'Arquivo', 'IPC-2581 content': 'Conteúdo IPC-2581', 'Over time': 'Evolução no tempo',
  'Variables after each scan': 'Variáveis após cada ciclo', 'Scan': 'Ciclo', 'Detail': 'Detalhe', 'Sensors and commands each scan': 'Sensores e comandos a cada ciclo',
};

export function resultLabel(value, title = '') {
  if (title === 'FMEA ranked by RPN' && value === 'Rank') return 'Posição';
  return (Object.hasOwn(labels, value) ? labels[value] : undefined)
    ?? value.replace(/^Pose of /, 'Posição e orientação de ')
      .replace(/^Inverse kinematics to /, 'Cinemática inversa até ')
      .replace(/^(\d+) replications, mean and 95 % interval$/, '$1 simulações: média e intervalo de 95%')
      .replace(/^Earned value on day /, 'Valor agregado no dia ')
      .replace(/^Impact of /, 'Impacto de ')
      .replace(/^State probabilities at /, 'Probabilidades dos estados em ')
      .replace(/^Model after (\d+) scans$/, 'Modelo após $1 ciclos');
}
