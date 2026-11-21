const areaNames = {
  acoustics: 'Acústica',
  additive: 'Manufatura aditiva',
  aerospace: 'Engenharia aeronáutica',
  agricultural: 'Engenharia agrícola e irrigação',
  architecture: 'Arquitetura',
  automotive: 'Engenharia automotiva e veículos elétricos',
  battery: 'Baterias e engenharia eletroquímica',
  biomechanical: 'Biomecânica',
  'building-performance': 'Desempenho energético de edificações',
  chemical: 'Engenharia química e de processos',
  'civil-site': 'Engenharia civil e implantação',
  coastal: 'Engenharia costeira e oceânica',
  construction: 'Construção e gestão de obras',
  controls: 'Comandos elétricos e automação',
  dam: 'Barragens e hidrelétricas',
  'data-center': 'Centros de dados e instalações críticas',
  drones: 'Sistemas autônomos e drones',
  'electrical-building': 'Instalações elétricas prediais',
  entertainment: 'Engenharia de palcos, atrações e estruturas suspensas',
  environmental: 'Engenharia ambiental',
  exhibit: 'Projeto de exposições e eventos',
  facade: 'Fachadas e envoltória de edificações',
  facilities: 'Operação e manutenção predial',
  'fire-safety': 'Segurança contra incêndio e proteção à vida',
  food: 'Processos de alimentos e bebidas',
  forensic: 'Perícia de engenharia',
  fusion: 'Física de plasmas e confinamento magnético',
  geology: 'Geologia e reservatórios de petróleo',
  geotechnical: 'Geotecnia',
  hospital: 'Engenharia clínica e hospitalar',
  hvac: 'Climatização e ventilação',
  hydrogen: 'Hidrogênio e combustíveis emergentes',
  hydrology: 'Recursos hídricos e hidrologia',
  industrial: 'Engenharia industrial',
  instrumentation: 'Instrumentação e controle',
  interior: 'Design de interiores e marcenaria',
  'lab-cleanroom': 'Laboratórios e salas limpas',
  landscape: 'Arquitetura paisagística',
  lighting: 'Projeto luminotécnico',
  manufacturing: 'Engenharia de manufatura e produção',
  materials: 'Ciência e engenharia de materiais',
  mechanical: 'Projeto mecânico',
  'medical-devices': 'Engenharia biomédica e dispositivos médicos',
  mining: 'Engenharia de minas',
  naval: 'Arquitetura naval e engenharia marítima',
  nuclear: 'Engenharia nuclear',
  'oil-gas': 'Produção e transporte de petróleo e gás',
  optics: 'Óptica e fotônica',
  packaging: 'Engenharia de embalagens',
  pcb: 'Eletrônica e placas de circuito impresso',
  pharma: 'Engenharia farmacêutica e bioprocessos',
  'piping-plant': 'Tubulações e plantas industriais',
  'plumbing-fire': 'Instalações hidrossanitárias e combate a incêndio',
  power: 'Sistemas elétricos de potência',
  'process-safety': 'Segurança de processos',
  protective: 'Segurança e projeto de estruturas resistentes a explosões',
  quality: 'Qualidade e metrologia',
  quantum: 'Engenharia quântica',
  rail: 'Engenharia ferroviária',
  refining: 'Engenharia de petróleo e refino',
  reliability: 'Engenharia de confiabilidade e segurança',
  renewables: 'Energias renováveis e armazenamento',
  rf: 'Radiofrequência, antenas e micro-ondas',
  robotics: 'Robótica e mecatrônica',
  semiconductor: 'Semicondutores e projeto de chips',
  space: 'Astronáutica e sistemas espaciais',
  structural: 'Engenharia estrutural',
  surveying: 'Topografia e geomática',
  systems: 'Engenharia de sistemas',
  telecom: 'Telecomunicações e redes de fibra óptica',
  tooling: 'Projeto de ferramentas, moldes e matrizes',
  transportation: 'Transportes e engenharia de tráfego',
  tunnel: 'Túneis e obras subterrâneas',
  'water-treatment': 'Tratamento de água e esgoto',
};
const apps = {
  cad: 'CONFENGE CAD 2D', bim: 'CONFENGE BIM', model: 'CONFENGE Modelagem',
  markup: 'CONFENGE Revisão', takeoff: 'CONFENGE Quantitativos', civil: 'CONFENGE Civil',
  detail: 'CONFENGE Detalhamento', part: 'CONFENGE Peças',
};
const panel = document.getElementById('pacotes');
const requested = new URLSearchParams(location.search).get('area');
if (panel) {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'button';
  open.textContent = 'Consultar materiais por área';
  panel.append(open);
  open.addEventListener('click', load);
  if (requested) load();

  async function load() {
    open.disabled = true;
    try {
      const response = await fetch('/assets/fields/index.json');
      if (!response.ok) throw new Error();
      const { packs } = await response.json();
      const rows = packs
        .filter(({ id }) => /^field\.[a-z0-9-]+$/.test(id) && Object.hasOwn(areaNames, id.slice(6)))
        .map(row => ({ ...row, label: areaNames[row.id.slice(6)] }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      const byId = new Map(rows.map(row => [row.id, row]));
      const label = add(panel, 'label', 'Área de engenharia');
      const select = add(label, 'select');
      select.append(new Option('Escolha uma área', ''));
      for (const row of rows) select.append(new Option(row.label, row.id));
      const card = add(panel, 'div');
      card.setAttribute('aria-live', 'polite');
      open.remove();
      select.addEventListener('change', () => {
        const url = new URL(location.href);
        if (select.value) url.searchParams.set('area', select.value);
        else url.searchParams.delete('area');
        url.hash = 'pacotes';
        history.replaceState(null, '', url);
        show();
      });
      if (byId.has(requested)) {
        select.value = requested;
        show();
      }

      function show() {
        card.replaceChildren();
        const row = byId.get(select.value);
        if (!row) return;
        const available = row.hosts.filter(key => Object.hasOwn(apps, key));
        add(card, 'h3', row.label);
        if (available.length) {
          add(card, 'p', 'Abra um aplicativo compatível para consultar os materiais da área.');
          const links = add(card, 'ul');
          for (const key of available) {
            const link = add(add(links, 'li'), 'a', apps[key]);
            link.href = '/cad/aplicativos/#' + key + 'craft';
          }
        } else {
          add(card, 'p', 'Consulte a ficha do fornecedor para ver onde o material pode ser usado.');
        }
        const source = add(add(card, 'p'), 'a', 'Consultar ficha original do fornecedor (em inglês)');
        source.href = '/assets/fields/' + row.id.slice(6) + '/pack.json';
        source.hreflang = 'en';
      }
    } catch {
      open.disabled = false;
      open.textContent = 'Tentar carregar os materiais novamente';
    }
  }
}
function add(parent, tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}
