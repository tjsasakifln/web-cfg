import { SECOND_WAVE } from "./onda-2.mjs";

// Carteira inicial de 24 decisões técnicas. Todas as amostras são sintéticas.
const number = (key, label, example) => ({ key, label, example: String(example), kind: "number" });
const text = (key, label, example = "") => ({ key, label, example, kind: "text" });
const sheet = (example, label = "Cole os dados CSV com cabeçalho") => ({ key: "tabela", label, example, kind: "sheet" });

const FIRST_WAVE = [
  {
    id: "comparar-desoneracao", category: "Custos e orçamento",
    title: "Comparar custos desonerado e não desonerado",
    description: "Compare os custos com encargos informados por você, sem presumir o regime tributário aplicável.",
    fields: [number("materiais", "Materiais e demais custos (R$)", 70000), number("mao_obra", "Mão de obra base (R$)", 30000),
      number("encargos_a", "Encargos no cenário A (%)", 65), number("encargos_b", "Encargos no cenário B (%)", 110),
      number("bdi", "BDI usado na comparação (%)", 20)],
    caveat: "É uma comparação aritmética entre hipóteses informadas. Verifique legislação, competências, data-base e referências oficiais antes de definir o regime."
  },
  {
    id: "auditar-orcamento", category: "Custos e orçamento",
    title: "Auditar uma planilha orçamentária",
    description: "Confira quantidades, preços, totais declarados e códigos repetidos em CSV.",
    fields: [sheet("codigo;descricao;unidade;quantidade;preco_unitario;total\n01;Concreto;m3;10;500;5000\n02;Aço;kg;100;8;800")],
    caveat: "A auditoria verifica consistência aritmética e cadastral. Não substitui análise de composições, fontes ou projeto."
  },
  {
    id: "curva-abc", category: "Custos e orçamento",
    title: "Classificar serviços pela curva ABC",
    description: "Ordene os itens por valor e identifique a concentração de custos.",
    fields: [sheet("codigo;descricao;unidade;quantidade;preco_unitario;total\n01;Concreto;m3;10;500;5000\n02;Aço;kg;100;8;800\n03;Pintura;m2;100;12;1200")],
    caveat: "Classificação A até 80% acumulados, B até 95% e C acima. Os limites são parametrização analítica, não requisito normativo."
  },
  {
    id: "precificar-honorarios", category: "Custos e orçamento",
    title: "Precificar honorários de engenharia",
    description: "Forme preço a partir de custo, despesas, tributos e margem desejada.",
    fields: [number("horas", "Horas previstas", 40), number("custo_hora", "Custo por hora (R$)", 80),
      number("despesas", "Despesas adicionais (R$)", 400), number("tributos", "Tributos sobre faturamento (%)", 12),
      number("margem", "Margem de contribuição desejada (%)", 25)],
    caveat: "Tributos e margem devem ser estimados conforme o caso. O resultado não constitui tabela oficial de honorários."
  },
  {
    id: "comprar-ou-locar", category: "Custos e orçamento",
    title: "Comprar ou locar equipamento",
    description: "Compare o custo total das alternativas no período de uso.",
    fields: [number("compra", "Valor de aquisição (R$)", 40000), number("revenda", "Valor residual (R$)", 25000),
      number("manutencao", "Manutenção no período (R$)", 3000), number("horas", "Horas previstas", 500),
      number("locacao_hora", "Locação por hora (R$)", 45)],
    caveat: "Modelo simplificado, sem custo financeiro, tributos, mobilização ou indisponibilidade."
  },
  {
    id: "simular-contingencia", category: "Custos e orçamento",
    title: "Simular contingências da obra",
    description: "Calcule o resultado esperado após reserva de contingência e custo de atraso.",
    fields: [number("receita", "Receita contratada (R$)", 200000), number("custo_direto", "Custos diretos (R$)", 140000),
      number("custo_indireto", "Custos indiretos (R$)", 25000), number("contingencia", "Reserva sobre custos (%)", 5),
      number("dias_atraso", "Dias adicionais", 10), number("custo_dia", "Custo diário do atraso (R$)", 500)],
    caveat: "É uma simulação de cenários. Não presume direito contratual a recomposição ou pagamento."
  },
  {
    id: "comparar-cotacoes", category: "Custos e orçamento",
    title: "Equalizar cotações de fornecedores",
    description: "Compare propostas por item, quantidade e preço, sem tratar cotações incompletas como equivalentes.",
    fields: [sheet("fornecedor;item;quantidade;preco_unitario\nEmpresa A;Concreto;10;510\nEmpresa A;Aço;100;8\nEmpresa B;Concreto;10;490\nEmpresa B;Aço;100;9")],
    caveat: "Verifique frete, prazo, especificação, tributos, garantia e condições de pagamento antes de escolher."
  },
  {
    id: "produtividade-equipe", category: "Custos e orçamento",
    title: "Simular produtividade de equipe",
    description: "Estime custo de mão de obra por unidade executada e ritmo médio.",
    fields: [number("quantidade", "Quantidade executada", 120), number("trabalhadores", "Pessoas na equipe", 4),
      number("horas_dia", "Horas por dia", 8), number("dias", "Dias de produção", 5),
      number("custo_hora", "Custo completo por pessoa/hora (R$)", 35)],
    caveat: "Produtividade média observada ou prevista, sem incorporar perdas e condições de campo não informadas."
  },
  {
    id: "reajustar-contrato", category: "Contratos e caixa",
    title: "Calcular reajuste por índice",
    description: "Calcule a variação de parcela elegível usando índices e datas-base informados.",
    fields: [number("base", "Saldo ou parcela-base (R$)", 150000), number("indice_base", "Índice inicial", 1050),
      number("indice_atual", "Índice atual", 1120), number("elegivel", "Parcela elegível (%)", 100)],
    caveat: "A elegibilidade, a periodicidade, o índice e a data-base devem ser verificados no contrato e na legislação aplicável."
  },
  {
    id: "conferir-medicao", category: "Contratos e caixa",
    title: "Conferir boletim de medição",
    description: "Confira quantidades medidas no período e acumuladas contra o contratado.",
    fields: [sheet("codigo;descricao;quantidade_contratada;quantidade_anterior;quantidade_periodo;preco_unitario\n01;Concreto;100;25;15;500\n02;Aço;1000;200;150;8")],
    caveat: "Quantidades e preços são informados pelo usuário. Aceite, glosas e faturamento exigem conferência documental."
  },
  {
    id: "fluxo-caixa-obra", category: "Contratos e caixa",
    title: "Projetar caixa da obra",
    description: "Calcule saldos por competência e a menor posição de caixa do período.",
    fields: [number("saldo_inicial", "Caixa disponível no início (R$)", 20000),
      sheet("competencia;recebimentos;pagamentos;retencoes\n2026-12;30000;40000;2000\n2027-01;45000;50000;0\n2027-02;80000;35000;3000")],
    caveat: "As datas representam competências informadas, não datas de liquidação ou garantia de recebimento."
  },
  {
    id: "capital-de-giro", category: "Contratos e caixa",
    title: "Estimar capital de giro para atraso de pagamento",
    description: "Dimensione a reserva de caixa para um atraso hipotético em recebimento relevante.",
    fields: [number("recebivel", "Recebimento aguardado (R$)", 60000), number("despesas_mensais", "Desembolso mensal (R$)", 30000),
      number("dias_atraso", "Dias de atraso simulados", 45), number("caixa", "Caixa imediatamente disponível (R$)", 10000)],
    caveat: "Simulação linear com mês comercial de 30 dias, sem outros recebimentos, juros, renegociações ou sazonalidade."
  },
  {
    id: "comparar-edital", category: "Licitações e evidências",
    title: "Comparar duas versões de edital",
    description: "Veja trechos literalmente adicionados e removidos em arquivos de texto.",
    fields: [text("antes", "Versão anterior (texto)", "Item 1: apresentar CAT.\nItem 2: prazo de 30 dias."),
      text("depois", "Versão nova (texto)", "Item 1: apresentar CAT.\nItem 2: prazo de 45 dias.\nItem 3: visita técnica facultativa.")],
    caveat: "Comparação textual literal, sem interpretação jurídica. PDF digitalizado requer extração prévia conferida."
  },
  {
    id: "checar-habilitacao", category: "Licitações e evidências",
    title: "Conferir requisitos de habilitação",
    description: "Relacione exigência, documento existente, validade e situação informada.",
    fields: [sheet("requisito;documento;validade;situacao\nCAT compatível;CAT 123;2027-12-31;apresentado\nCertidão fiscal;;2026-11-10;pendente")],
    caveat: "Não verifica autenticidade nem suficiência jurídica ou técnica. Classificação baseada nos dados fornecidos."
  },
  {
    id: "prazos-documentais", category: "Licitações e evidências",
    title: "Organizar vencimentos documentais",
    description: "Separe documentos vencidos, próximos do vencimento e dentro da validade.",
    fields: [sheet("documento;validade;responsavel\nCertidão A;2026-12-01;Administrativo\nGarantia B;2027-02-01;Contratos"),
      number("antecedencia", "Antecedência de alerta (dias)", 30)],
    caveat: "Agenda local sem notificações automáticas ou confirmação de validade junto ao emissor."
  },
  {
    id: "exposicao-contratual", category: "Licitações e evidências",
    title: "Simular retenções e garantias contratuais",
    description: "Calcule valores individuais de retenção, garantia e multa hipotética.",
    fields: [number("contrato", "Valor-base do contrato (R$)", 300000),
      number("retencao", "Retenção (%)", 5), number("garantia", "Garantia (%)", 5),
      number("multa", "Multa hipotética (%)", 2)],
    caveat: "Valores são exposições independentes. Não somar como obrigação certa, nem presumir aplicação de penalidades."
  },
  {
    id: "linha-tempo-contratual", category: "Licitações e evidências",
    title: "Organizar eventos e evidências do contrato",
    description: "Ordene eventos por data e identifique os que não possuem evidência vinculada.",
    fields: [sheet("data;evento;evidencia;responsavel\n2026-10-05;Ordem de serviço;OS assinada;Fiscalização\n2026-11-02;Paralisação;;Contratada")],
    caveat: "A linha do tempo apenas organiza registros apresentados; não determina responsabilidades nem direitos."
  },
  {
    id: "diario-obra", category: "Campo e profissão",
    title: "Estruturar diário de obra",
    description: "Monte um registro diário com equipes, serviços, ocorrências e evidências.",
    fields: [text("data", "Data (AAAA-MM-DD)", "2026-11-21"), text("local", "Obra e frente", "Edificação / térreo"),
      text("equipe", "Equipe e equipamentos", "4 operários; betoneira"), text("atividades", "Serviços executados", "Concretagem da base"),
      text("condicoes", "Condições observadas", "Tempo seco"), text("ocorrencias", "Ocorrências e pendências", "Aguardando inspeção"),
      text("evidencias", "Identificadores de fotos ou documentos", "IMG_001, IMG_002")],
    caveat: "Rascunho documental local, sem assinatura, autenticação, geolocalização ou guarda de fotografias."
  },
  {
    id: "vistoria-pendencias", category: "Campo e profissão",
    title: "Consolidar pendências de vistoria",
    description: "Agrupe observações por prioridade, localização e registro de evidência.",
    fields: [sheet("ambiente;elemento;ocorrencia;prioridade;evidencia\nCobertura;Rufos;Falta vedação;alta;IMG_004\nSala 2;Pintura;Mancha;media;IMG_005")],
    caveat: "Registro de observações, sem atribuição automática de causa, risco estrutural ou responsabilidade."
  },
  {
    id: "acervo-cat-art", category: "Campo e profissão",
    title: "Organizar acervo CAT, ART e experiência",
    description: "Inventarie documentos e confira quais têm comprovação informada, sem alegar validação junto ao conselho.",
    fields: [sheet("tipo;numero;atividade;data;comprovacao\nCAT;CAT-123;Estrutura;2024-05-10;sim\nART;ART-456;PPCI;2025-08-13;sim\nEXPERIENCIA;CTPS-01;Fiscalização;2023-11-01;pendente")],
    caveat: "CAT recebe maior peso indicativo que ART neste inventário, mas a pontuação não é homologação, classificação oficial ou ranqueamento público."
  },
  {
    id: "briefing-projeto", category: "Campo e profissão",
    title: "Montar briefing de projeto",
    description: "Estruture a demanda e identifique informações necessárias antes da definição de escopo.",
    fields: [text("objetivo", "Necessidade do contratante", "Adequar instalações"), text("imovel", "Local e tipo de edificação", "Edificação existente"),
      text("documentos", "Arquivos e levantamentos disponíveis", "Planta arquitetônica"),
      text("entrega", "Entregáveis esperados", "Pranchas e memorial"), text("prazo", "Prazo desejado", "45 dias"),
      text("restricoes", "Condições e restrições", "Obra em funcionamento")],
    caveat: "Briefing preliminar, não constitui proposta aceita nem contratação."
  },
  {
    id: "escopo-tecnico", category: "Campo e profissão",
    title: "Estruturar escopo e critérios de aceite",
    description: "Separe entregas, exclusões, revisões e condições de aprovação antes de negociar.",
    fields: [text("objeto", "Objeto do serviço", "Projeto de hidrantes"), text("incluido", "Entregas incluídas", "Plantas e memorial preliminar"),
      text("excluido", "Serviços não incluídos", "Aprovação em órgão"), text("criterios", "Critérios de verificação e aceite", "Documentos legíveis e revisados"),
      text("revisoes", "Revisões previstas", "1 rodada de revisão")],
    caveat: "Minuta de escopo técnico. Não produz proposta comercial vinculante, assinatura ou aceite contratual."
  },
  {
    id: "mudanca-escopo", category: "Campo e profissão",
    title: "Estimar impacto de alteração de escopo",
    description: "Separe adicional de custo, preço proposto e prazo indicativo para revisão contratual.",
    fields: [number("preco_inicial", "Preço original do serviço (R$)", 10000), number("custo_extra", "Custo adicional estimado (R$)", 1500),
      number("margem", "Margem desejada sobre o preço adicional (%)", 25),
      number("dias", "Dias adicionais estimados", 10)],
    caveat: "Estimativa econômica para negociação, sem pressupor aceite, aditivo autorizado ou direito a prazo extra."
  },
  {
    id: "inspecao-sst", category: "Campo e profissão",
    title: "Conferir observações de segurança",
    description: "Organize perigos, controles, situações pendentes e responsáveis em uma frente de trabalho.",
    fields: [sheet("atividade;perigo;controle;situacao;responsavel;evidencia\nTrabalho em altura;Queda;Guarda-corpo;pendente;Encarregado;\nMovimentação;Impacto;Isolamento;atendido;Mestre;IMG_007")],
    caveat: "Registro de observações, não substitui PGR, inspeção formal ou avaliação do profissional competente."
  }
];

export const TOOLS = Object.freeze([...FIRST_WAVE, ...SECOND_WAVE]);

export function getTool(id) {
  return TOOLS.find(tool => tool.id === id) || null;
}
