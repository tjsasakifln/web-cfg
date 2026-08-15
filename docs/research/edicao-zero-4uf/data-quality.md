# Data quality (revisão adversarial)

Lentes obrigatórias: duplicidade, consórcios, aditivos, zeros/nulos, aliases,
coverage gaps, outliers, viés temporal.

### duplicidade — flagged

A fatia de agência MRS-PREFEITURA MUNICIPAL DE CAXIAS DO SUL conta 49 contratos no mesmo dia 2026-07-03, dos quais 36 são o mesmo objeto de manutenção predial sob demanda e 13 são rotulados como reajuste. O export público não separa ATA, ordem de serviço e reajuste. Contar 49 como 49 obras distintas inflaria volume.

### consorcios — flagged

Texto de objeto menciona consórcio em 1 ocorrência(s) dos top_objects publicados. Não há flag estruturado de consórcio no snapshot. Participação de consórcio não é quantificável.

### aditivos — flagged

top_objects dos 4 mercados têm 0 menção(ões) a aditivo e 3 a registro de preços. A fatia Caxias tem 13 contratos rotulados Reajuste. Sem campo estruturado de termo aditivo, esses instrumentos não entram como métrica de aditivo.

### zeros_nulos — flagged

A query pública declara valor_gt_0. Células de preço excluem nulo, zero e valor < 5000 BRL. Compradores suprimidos publicam total_value=0 nos mercados ['pavimentacao-infraestrutura-viaria-sc', 'pavimentacao-infraestrutura-viaria-pi', 'edificacoes-publicas-mg', 'edificacoes-publicas-rs']. Esse zero é política de privacidade, não valor econômico.

### aliases — flagged

Nomes de órgão variam no próprio recorte (ao menos 4 grafias nos exemplos públicos: MRS-PREFEITURA, PREFEITURA MUNICIPAL, Unidade Única, PM VENANACIO AIRES). buyer_count usa o identificador do exportador; aliases cadastrais podem fragmentar ou colapsar órgãos.

### coverage_gaps — flagged

Snapshot publicado: 4 mercados, UFs ['MG', 'PI', 'RS', 'SC'], 233 aec_confirmed, 11931 contratos carregados. Radar de oportunidades inclui UFs ['PR', 'RS', 'SC'] (PR não é mercado publicado). Inventário-candidato no mesmo dataset_hash reporta national_records_available=4479442 e aec_confirmed_contracts=54055, mas permanece PENDING / QUALITY_ELIGIBLE e não alimenta findings.

### outliers — flagged

Células de preço declaram outlier_count=0, mas o máximo chega a várias vezes a mediana (pavimentação PI e SC, edificações MG). Sem regra de outlier no export, o máximo é um contrato integral heterogêneo, não um erro estatístico removido.

### vies_temporal — flagged

Três mercados publicados cabem em janelas de semanas de 2026. A agência/concorrência de Caxias é um único dia (2026-07-03). Edificações RS é o único com 2025+2026 e ainda assim com n anual baixo. O recorte reflete ingestão recente, não um ano-calendário comparável.

