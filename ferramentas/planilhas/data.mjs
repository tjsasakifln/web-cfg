/* Biblioteca de modelos analíticos CONFENGE. Coeficientes normativos são entradas explícitas. */
const catalog = [];
const define = (slug, area, title, summary, fields, steps, driver, method, limits, reference = '') => {
  const f = fields.split(';').map(row => {
    const [key,label,unit,initial,min,max] = row.split('|');
    return {key,label,unit,initial:Number(initial),min:Number(min),max:Number(max)};
  });
  const s = steps.split(';').map(row => {
    const [key,label,unit,expr] = row.split('|');
    return {key,label,unit,expr};
  });
  catalog.push(Object.freeze({slug,area,title,summary,fields:f,steps:s,driver,
    method,limits,reference:reference || 'Modelo de engenharia baseado em relações físicas e algébricas conhecidas. Sem verificação normativa automática.',
    keyResult:s[s.length-1].key}));
};
define('viga-bi-apoiada','Estruturas','Viga biapoiada com carga distribuída',
'Momento, cortante, flecha elástica e comparação com limite definido pelo calculista.',
'q|Carga linear|kN/m|12|0|10000;L|Vão livre|m|6|0.1|150;E|Módulo de elasticidade|GPa|30|1|400;I|Inércia bruta|cm⁴|45000|1|100000000;rel|Divisor de flecha adotado|L/n|250|50|3000',
'M|Momento máximo|kN·m|q*L^2/8;V|Cortante no apoio|kN|q*L/2;delta|Flecha teórica|mm|5*q*(L*1000)^4/(384*(E*1000)*(I*10000));lim|Limite informado|mm|L*1000/rel;uso|Relação flecha / limite|vezes|delta/lim',
'L','Equações elásticas de Euler-Bernoulli para viga prismática simplesmente apoiada. Inércia e rigidez informadas pelo usuário.','Não inclui fissuração, fluência, instabilidade, combinações de ações ou esforços adicionais.','ABNT NBR 6118; ABNT NBR 6120:2019');
define('viga-carga-pontual','Estruturas','Viga biapoiada com carga concentrada',
'Reações, momento sob a carga e deslocamento no ponto de aplicação.',
'P|Carga concentrada|kN|45|0|100000;L|Vão|m|7|0.1|150;a|Distância ao apoio A|m|2.5|0.01|100;E|Módulo de elasticidade|GPa|30|1|400;I|Inércia|cm⁴|70000|1|100000000',
'b|Distância ao apoio B|m|L-a;Ra|Reação A|kN|P*b/L;Rb|Reação B|kN|P*a/L;M|Momento sob a carga|kN·m|P*a*b/L;delta|Flecha sob a carga|mm|(P*1000)*(a*1000)^2*(b*1000)^2/(3*(E*1000)*(I*10000)*(L*1000))',
'P','Modelo linear elástico, carregamento pontual localizado e apoios simples.','Exige 0 < a < L; não calcula o deslocamento máximo fora do ponto de carga.','ABNT NBR 6120:2019');
define('secao-retangular','Estruturas','Propriedades geométricas de seção retangular',
'Área, momentos de inércia, módulo resistente e raio de giração.',
'b|Largura|cm|25|0.01|10000;h|Altura|cm|50|0.01|10000',
'A|Área|cm²|b*h;Ix|Momento de inércia x|cm⁴|b*h^3/12;Iy|Momento de inércia y|cm⁴|h*b^3/12;Wx|Módulo resistente x|cm³|b*h^2/6;rx|Raio de giração x|cm|SQRT(Ix/A)',
'h','Cálculo geométrico exato para retângulo homogêneo sem vazios.','Não representa fissuras, armaduras, plastificação ou propriedades efetivas.','ABNT NBR 6118; ABNT NBR 8800:2024');
define('secao-t','Estruturas','Centroide e inércia de seção T',
'Decomposição em mesa e alma, centro de gravidade e teorema dos eixos paralelos.',
'bf|Largura da mesa|cm|80|0.1|1000;tf|Espessura da mesa|cm|12|0.1|1000;bw|Largura da alma|cm|20|0.1|1000;hw|Altura da alma abaixo da mesa|cm|48|0.1|1000',
'Af|Área da mesa|cm²|bf*tf;Aw|Área da alma|cm²|bw*hw;A|Área total|cm²|Af+Aw;ybar|Centroide a partir da base|cm|(Aw*hw/2+Af*(hw+tf/2))/A;I|Inércia em relação ao centroide|cm⁴|bw*hw^3/12+Aw*(ybar-hw/2)^2+bf*tf^3/12+Af*(hw+tf/2-ybar)^2;W|Módulo resistente inferior|cm³|I/ybar',
'hw','Geometria sem sobreposição entre mesa e alma, ambas homogêneas.','Não determina a largura colaborante de mesas de concreto nem a resistência de cálculo.','ABNT NBR 6118; ABNT NBR 8800:2024');
define('laje-faixa','Estruturas','Faixa de laje simplesmente apoiada',
'Esforços por faixa, reação por apoio e estimativa de flecha elástica.',
'q|Carga superficial|kN/m²|6|0|10000;L|Vão|m|4.2|0.1|50;faixa|Largura da faixa|m|1|0.1|100;h|Espessura da laje|cm|14|1|200;E|Módulo de elasticidade|GPa|28|1|400',
'w|Carga linear na faixa|kN/m|q*faixa;M|Momento da faixa|kN·m|w*L^2/8;I|Inércia bruta da faixa|cm⁴|(faixa*100)*h^3/12;delta|Flecha bruta|mm|5*w*(L*1000)^4/(384*(E*1000)*(I*10000))',
'L','Faixa unitária com flexão unidirecional e modelo não fissurado.','A distribuição bidirecional e os efeitos diferidos não estão contemplados.','ABNT NBR 6118; ABNT NBR 6120:2019');
define('sapata-pressao','Fundações','Tensões de contato em sapata retangular',
'Tensões nos cantos a partir de força normal e momentos sobre eixos ortogonais.',
'N|Força normal|kN|850|1|10000000;B|Largura da sapata|m|2.5|0.1|100;L|Comprimento|m|3|0.1|100;Mx|Momento em torno de x|kN·m|45|0|10000000;My|Momento em torno de y|kN·m|65|0|10000000;qa|Pressão admissível adotada|kPa|250|1|100000',
'q0|Pressão média|kPa|N/(B*L);ex|Excentricidade x|m|My/N;ey|Excentricidade y|m|Mx/N;qmax|Pressão máxima linear|kPa|q0+6*Mx/(B*L^2)+6*My/(L*B^2);qmin|Pressão mínima linear|kPa|q0-6*Mx/(B*L^2)-6*My/(L*B^2);uso|Relação qmax / qa|vezes|qmax/qa',
'N','Distribuição linear de tensões em base rígida com contato integral.','Se qmin for negativa, há perda de contato e o modelo linear integral não é válido. Não substitui laudo de solo.','ABNT NBR 6122:2022');
define('muro-empuxo-ativo','Fundações','Empuxo ativo de terra pelo modelo Rankine',
'Coeficiente ativo, empuxo triangular, parcela de sobrecarga e posição resultante.',
'phi|Atrito interno do solo|graus|30|1|55;gamma|Peso específico do solo|kN/m³|18|1|40;H|Altura contida|m|4|0.1|40;q|Sobrecarga uniforme|kPa|10|0|10000',
'Ka|Coeficiente ativo|adim.|TAN((45-phi/2)*PI()/180)^2;Psolo|Empuxo do solo|kN/m|0.5*Ka*gamma*H^2;Pq|Empuxo da sobrecarga|kN/m|Ka*q*H;Ptotal|Empuxo resultante|kN/m|Psolo+Pq;z|Altura da resultante sobre a base|m|(Psolo*H/3+Pq*H/2)/Ptotal',
'H','Rankine, superfície horizontal e solo não coesivo drenado.','O cálculo não considera pressão hidrostática do lençol freático, ações sísmicas, interação solo-paramento, geometrias complexas, estabilidade global nem dimensionamento estrutural do muro.','ABNT NBR 6122:2022');
define('aco-armaduras','Estruturas','Quantitativo de barras de armadura',
'Peso teórico por metro, comprimento total e massa com perdas.',
'd|Diâmetro nominal|mm|12.5|3|60;n|Quantidade de barras|un.|120|1|100000;L|Comprimento por barra|m|5.8|0.01|100;rho|Massa específica do aço|kg/m³|7850|5000|10000;perdas|Perdas estimadas|%|4|0|100',
'ml|Massa linear|kg/m|PI()*(d/1000)^2*rho/4;Lt|Comprimento total|m|n*L;M|Massa teórica|kg|ml*Lt;Mcomp|Massa com perdas|kg|M*(1+perdas/100)',
'n','Conversão geométrica de volume e densidade do aço.','Não substitui detalhamento, tabela de corte, dobramento nem critério de ancoragem.','ABNT NBR 7480:2024');
define('concreto-volume','Estruturas','Volume e consumo de concreto',
'Volume geométrico, consumo com perdas e estimativa de número de viagens.',
'L|Comprimento|m|12|0.01|1000;B|Largura|m|0.4|0.01|1000;H|Altura|m|0.7|0.01|1000;n|Quantidade de peças|un.|16|1|100000;perdas|Perdas de execução|%|3|0|100;cam|Capacidade do caminhão|m³|8|0.5|100',
'V|Volume geométrico|m³|L*B*H*n;Vpedido|Volume com perdas|m³|V*(1+perdas/100);viagens|Viagens estimadas|un.|CEILING(Vpedido/cam,1)',
'L','Volumes prismáticos e reserva operacional definida pelo usuário.','Confirmar geometria real, sobreposições, vazios, quantitativo contratado e acesso à obra.','ABNT NBR 14931:2004');
define('pilar-tensao-media','Estruturas','Tensão média em pilar comprimido',
'Área de seção, tensão média nominal e relação com tensão de referência informada.',
'N|Esforço normal|kN|650|0|10000000;b|Lado b|cm|25|0.1|300;h|Lado h|cm|40|0.1|300;ref|Tensão de referência|MPa|12|0.01|1000',
'A|Área bruta|mm²|b*h*100;sig|Tensão média|MPa|N*1000/A;uso|Relação com referência|vezes|sig/ref',
'N','Verificação de tensão média simples, sem interação com flexão.','Não avalia esbeltez, efeitos de segunda ordem, resistências de cálculo ou estabilidade.','ABNT NBR 6118');
define('pressao-hidrostatica','Hidrossanitário','Pressão hidrostática e coluna de água',
'Conversão entre desnível e pressão hidrostática absoluta do trecho.',
'h|Desnível geométrico|m|18|0|10000;rho|Massa específica do fluido|kg/m³|998|100|2000;g|Aceleração da gravidade|m/s²|9.81|5|20',
'p|Pressão hidrostática|kPa|rho*g*h/1000;bar|Pressão equivalente|bar|p/100;mc|Altura equivalente a água de 1000 kg/m³|m|p*1000/(1000*g)',
'h','Equilíbrio hidrostático em fluido de densidade uniforme.','Não inclui perda de carga, pressões dinâmicas ou golpes de aríete.','ABNT NBR 5626:2020');
define('velocidade-tubulacao','Hidrossanitário','Velocidade média em tubulação circular',
'Área hidráulica e velocidade a partir da vazão e do diâmetro interno.',
'Q|Vazão|L/s|8|0|100000;D|Diâmetro interno|mm|75|1|2000',
'A|Área da seção plena|m²|PI()*(D/1000)^2/4;Qm|Vazão SI|m³/s|Q/1000;v|Velocidade média|m/s|Qm/A',
'Q','Continuidade para escoamento pleno de seção circular.','Verificar regime, rugosidade, pressões e limites do sistema conforme aplicação.','ABNT NBR 5626:2020');
define('perda-hazen-williams','Hidrossanitário','Perda de carga por Hazen-Williams',
'Perda de carga distribuída, perda por metro e velocidade estimada.',
'Q|Vazão|L/s|5|0.001|100000;L|Comprimento|m|120|0.1|100000;D|Diâmetro interno|mm|100|1|2000;C|Coeficiente Hazen-Williams|adim.|130|10|200',
'qm|Vazão SI|m³/s|Q/1000;dm|Diâmetro SI|m|D/1000;v|Velocidade média|m/s|qm/(PI()*dm^2/4);hf|Perda de carga|m|10.67*L*qm^1.852/(C^1.852*dm^4.87);J|Perda unitária|m/m|hf/L',
'L','Expressão empírica de Hazen-Williams para água, com C declarado pelo usuário.','Verificar faixa de validade do método e perdas localizadas antes do dimensionamento.','ABNT NBR 5626:2020');
define('perda-darcy-weisbach','Hidrossanitário','Perda de carga por Darcy-Weisbach',
'Velocidade, perda distribuída, perdas localizadas e perda total.',
'Q|Vazão|L/s|10|0.001|100000;L|Trecho|m|180|0.1|100000;D|Diâmetro interno|mm|100|1|2000;f|Fator de atrito Darcy|adim.|0.02|0.001|1;K|Somatório dos K locais|adim.|4|0|10000',
'v|Velocidade|m/s|(Q/1000)/(PI()*(D/1000)^2/4);hd|Perda distribuída|m|f*(L/(D/1000))*v^2/(2*9.81);hl|Perda localizada|m|K*v^2/(2*9.81);ht|Perda total|m|hd+hl',
'Q','Formulação energética de Darcy com fator f e K informados.','Fator de atrito não é estimado automaticamente; confira regime e rugosidade.','ABNT NBR 5626:2020');
define('galeria-manning','Drenagem','Tubo circular cheio pela equação de Manning',
'Vazão de referência e velocidade com conduto circular em seção plena.',
'D|Diâmetro interno|m|0.6|0.05|10;n|Rugosidade de Manning|s/m^(1/3)|0.013|0.005|0.1;S|Declividade energética|m/m|0.005|0.000001|1',
'A|Área de seção|m²|PI()*D^2/4;R|Raio hidráulico|m|D/4;Q|Vazão estimada|m³/s|A*R^(2/3)*SQRT(S)/n;v|Velocidade|m/s|Q/A',
'D','Equação de Manning para tubo circular funcionando cheio.','Não considera transição entre regimes de escoamento, remanso, entrada ou sobrepressões.','ABNT NBR 10844:1989 (escopo predial, quando aplicável)');
define('canal-retangular','Drenagem','Canal aberto retangular por Manning',
'Seção molhada, perímetro, raio hidráulico, vazão e velocidade.',
'b|Largura de fundo|m|1.2|0.01|100;y|Lâmina de água|m|0.6|0.001|100;n|Rugosidade de Manning|s/m^(1/3)|0.015|0.005|0.1;S|Declividade|m/m|0.002|0.000001|1',
'A|Área molhada|m²|b*y;P|Perímetro molhado|m|b+2*y;R|Raio hidráulico|m|A/P;Q|Vazão estimada|m³/s|A*R^(2/3)*SQRT(S)/n;v|Velocidade|m/s|Q/A',
'b','Modelo uniforme de Manning para seção retangular.','Não calcula borda livre, regime gradualmente variado ou influência de jusante.','Estudo hidráulico; critérios locais da drenagem');
define('drenagem-metodo-racional','Drenagem','Vazão de pico pelo método racional',
'Estima vazão de contribuição para a intensidade, área e coeficiente informados.',
'C|Coeficiente de escoamento|adim.|0.7|0.01|1;i|Intensidade da chuva|mm/h|130|0.001|10000;A|Área contribuinte|ha|3.5|0.0001|100000',
'Q|Vazão de pico|m³/s|C*i*A/360;QL|Vazão de pico|L/s|Q*1000',
'A','Método racional com intensidade e período de retorno definidos externamente.','Não substitui estudo IDF local, tempo de concentração nem hidrograma.','Critérios de drenagem da autoridade local');
define('potencia-bombeamento','Hidrossanitário','Potência hidráulica e potência no eixo',
'Estima a potência a partir da vazão, altura manométrica e rendimento informado.',
'Q|Vazão|L/s|14|0.001|100000;H|Altura manométrica|m|38|0.01|10000;eta|Rendimento global|%|72|1|100',
'Ph|Potência hidráulica|kW|9.81*(Q/1000)*H;Pe|Potência no eixo|kW|Ph/(eta/100);cv|Potência estimada|cv|Pe/0.73549875',
'Q','Balanço de energia hidráulica com densidade de água adotada como 1000 kg/m³.','Rendimento deve ser confirmado na curva da bomba, com NPSH e ponto de operação.','ABNT NBR 5626:2020');
define('reservatorio-consumo','Hidrossanitário','Reservatório predial por consumo e autonomia',
'Consumo diário, capacidade útil e volume com reserva definida no projeto.',
'p|População de projeto|pessoas|80|1|1000000;c|Consumo unitário|L/pessoa.dia|150|1|10000;d|Autonomia|dias|1|0.1|60;r|Reserva adicional|%|20|0|1000',
'Cd|Consumo diário|m³/dia|p*c/1000;V|Volume útil|m³|Cd*d;Vt|Volume total com reserva|m³|V*(1+r/100)',
'p','Memória quantitativa de armazenamento com parâmetros declarados.','Autonomia e reservas legais ou de incêndio dependem do uso e de exigências locais.','ABNT NBR 5626:2020');
define('esgoto-vazao-contribuicao','Hidrossanitário','Vazão sanitária por contribuição',
'Converte população, consumo, retorno e fator de pico em vazão estimada.',
'p|População|pessoas|240|1|10000000;c|Consumo|L/pessoa.dia|160|1|10000;r|Coeficiente de retorno|adim.|0.8|0.01|1;kp|Fator de pico informado|adim.|1.8|1|20',
'Vd|Volume de esgoto diário|m³/dia|p*c*r/1000;Qmed|Vazão média|L/s|Vd*1000/86400;Qp|Vazão de pico|L/s|Qmed*kp',
'p','Estimativa agregada de contribuição doméstica.','Não calcula simultaneidade por aparelhos, infiltração, declividades ou ventilação.','ABNT NBR 8160:1999');
define('perda-singular','Hidrossanitário','Perda localizada em conexões e acessórios',
'Estima velocidade, altura de velocidade e perda pelo somatório dos coeficientes.',
'Q|Vazão|L/s|6|0.001|100000;D|Diâmetro interno|mm|80|1|2000;K|Somatório de coeficientes|adim.|12|0|10000',
'v|Velocidade do fluido|m/s|(Q/1000)/(PI()*(D/1000)^2/4);hv|Altura de velocidade|m|v^2/(2*9.81);hl|Perda localizada|m|K*hv',
'K','Formulação energética para perdas singulares; usuário informa K total.','Não substitui levantamento dos acessórios, redução de seção ou estudo de transientes.','ABNT NBR 5626:2020');
define('eletrica-queda-tensao-monofasica','Instalações elétricas','Queda de tensão em circuito monofásico',
'Queda aproximada resistiva em ida e volta e porcentagem na alimentação.',
'I|Corrente de projeto|A|24|0.01|100000;L|Comprimento unidirecional|m|60|0.01|100000;rho|Resistividade adotada|ohm.mm²/m|0.0225|0.0001|1;S|Seção do condutor|mm²|6|0.01|10000;V|Tensão nominal|V|220|1|100000;fp|Fator de potência|adim.|0.92|0.01|1',
'R|Resistência ida e volta|ohm|2*rho*L/S;dV|Queda resistiva|V|I*R*fp;pct|Queda relativa|%|dV/V*100',
'L','Estimativa resistiva, condutor de mesma seção nos dois sentidos.','Não incorpora reatância, harmônicos, temperatura real nem os critérios de proteção e agrupamento.','ABNT NBR 5410:2004, versão corrigida 2008');
define('eletrica-queda-tensao-trifasica','Instalações elétricas','Queda de tensão em circuito trifásico',
'Estimativa resistiva equilibrada e percentual da tensão entre fases.',
'I|Corrente por fase|A|63|0.01|100000;L|Comprimento|m|90|0.01|100000;rho|Resistividade de cálculo|ohm.mm²/m|0.0225|0.0001|1;S|Seção do condutor|mm²|25|0.01|10000;V|Tensão entre fases|V|380|1|100000;fp|Fator de potência|adim.|0.9|0.01|1',
'R|Resistência de fase|ohm|rho*L/S;dV|Queda resistiva|V|SQRT(3)*I*R*fp;pct|Queda relativa|%|100*dV/V',
'L','Circuito trifásico balanceado com termo resistivo.','Dimensionamento final exige reatância, temperatura, método de instalação, proteção e verificações da norma.','ABNT NBR 5410:2004, versão corrigida 2008');
define('eletrica-corrente-trifasica','Instalações elétricas','Corrente de projeto trifásica por demanda',
'Potência ativa de demanda, potência aparente e corrente de linha.',
'P|Potência instalada|kW|95|0.001|10000000;fd|Fator de demanda|adim.|0.72|0.01|1;fp|Fator de potência|adim.|0.9|0.01|1;V|Tensão entre fases|V|380|1|100000',
'Pd|Potência de demanda|kW|P*fd;S|Potência aparente|kVA|Pd/fp;I|Corrente de linha|A|S*1000/(SQRT(3)*V)',
'P','Balanço trifásico balanceado de potências.','Não dimensiona condutores, proteções ou capacidade de curto-circuito.','ABNT NBR 5410:2004, versão corrigida 2008');
define('eletrica-correcao-fator-potencia','Instalações elétricas','Banco de capacitores para fator de potência',
'Potência reativa inicial, reativa alvo e compensação teórica necessária.',
'P|Potência ativa|kW|125|0.001|1000000;fpi|Fator de potência inicial|adim.|0.78|0.1|0.999;fpf|Fator de potência desejado|adim.|0.95|0.1|1',
'Qi|Potência reativa atual|kVAr|P*TAN(ACOS(fpi));Qf|Potência reativa alvo|kVAr|P*TAN(ACOS(fpf));Qc|Compensação requerida|kVAr|Qi-Qf',
'P','Compensação senoidal em regime permanente.','Confirmar fpf maior que fpi, harmônicos, ressonância e comando em estágios.','ABNT NBR 5410:2004, versão corrigida 2008');
define('eletrica-potencia-motor','Instalações elétricas','Corrente de motor trifásico',
'Converte potência mecânica, rendimento e fator de potência em corrente elétrica.',
'Pm|Potência mecânica|kW|22|0.01|100000;eta|Rendimento|%|91|1|100;fp|Fator de potência|adim.|0.86|0.01|1;V|Tensão entre fases|V|380|1|100000',
'Pin|Potência ativa de entrada|kW|Pm/(eta/100);S|Potência aparente|kVA|Pin/fp;I|Corrente nominal estimada|A|S*1000/(SQRT(3)*V)',
'Pm','Conversão de potência nominal em regime permanente.','Não calcula corrente de partida, transitórios ou coordenação de proteção.','ABNT NBR 5410:2004, versão corrigida 2008');
define('eletrica-curto-teorico','Instalações elétricas','Curto-circuito trifásico por impedância equivalente',
'Corrente simétrica inicial para impedância equivalente informada.',
'V|Tensão entre fases|V|380|1|100000;Z|Impedância por fase|ohm|0.025|0.000001|100000;fator|Fator de tensão adotado|adim.|1|0.5|2',
'I|Corrente de curto estimada|A|fator*V/(SQRT(3)*Z);Ik|Corrente de curto|kA|I/1000',
'Z','Circuito trifásico simétrico de Thévenin com impedância fornecida.','Não determina impedância da rede, contribuição de motores ou corrente de pico assimétrica.','Análise elétrica; projeto de proteção');
define('iluminacao-metodo-lumens','Instalações elétricas','Estimativa de luminárias pelo método dos lúmens',
'Fluxo requerido e número inteiro de luminárias com fatores de utilização e manutenção.',
'A|Área do recinto|m²|92|0.1|100000;E|Iluminância de projeto|lux|500|1|100000;F|Fluxo por luminária|lm|4800|1|1000000;FU|Fator de utilização|adim.|0.66|0.01|1;FM|Fator de manutenção|adim.|0.8|0.01|1',
'Ft|Fluxo luminoso requerido|lm|E*A/(FU*FM);N|Luminárias aproximadas|un.|CEILING(Ft/F,1);Ereal|Iluminância média teórica|lux|N*F*FU*FM/A',
'A','Método do fluxo luminoso para estimativa inicial de média.','Não calcula uniformidade, ofuscamento, malha ponto a ponto ou iluminância de emergência.','Projeto luminotécnico; referência de requisitos por atividade');
define('hvac-vazao-ar-sensivel','Climatização','Vazão de ar para carga sensível',
'Estima a vazão volumétrica pela diferença de temperatura e propriedades do ar.',
'Qs|Carga sensível|kW|14|0.001|100000;delta|Diferença de temperatura|K|10|0.1|100;rho|Densidade do ar|kg/m³|1.2|0.1|5;cp|Calor específico|J/kg.K|1006|100|10000',
'Vm|Vazão de ar|m³/s|Qs*1000/(rho*cp*delta);Vh|Vazão de ar|m³/h|Vm*3600',
'Qs','Balanço de calor sensível para vazão de ar seco aproximada.','Não contempla carga latente, renovação de ar, psicrometria ou distribuição de bocas.','ABNT NBR 16401-1:2024');
define('hvac-carga-estimativa','Climatização','Estimativa preliminar de carga térmica',
'Soma aporte por área, pessoas e equipamentos e converte capacidade de refrigeração.',
'A|Área climatizada|m²|140|1|100000;q|Densidade térmica adotada|W/m²|120|1|2000;n|Ocupantes|pessoas|12|0|100000;qp|Calor por ocupante|W/pessoa|115|0|10000;equip|Equipamentos e iluminação|W|3200|0|10000000',
'Qamb|Carga associada à área|W|A*q;Qp|Carga de ocupantes|W|n*qp;Qtotal|Carga térmica estimada|W|Qamb+Qp+equip;kW|Capacidade estimada|kW|Qtotal/1000;BTU|Capacidade estimada|BTU/h|kW*3412.142',
'A','Somatório de parcelas parametrizadas; não contém método RTS ou balanço horário.','Usar somente para triagem. Dimensionamento de projeto requer envoltória, orientação, vazão externa, umidade e perfis de uso.','ABNT NBR 16401-1:2024; ABNT NBR 16401-2:2024');
define('transmitancia-multicamadas','Climatização','Transmitância térmica de parede multicamada',
'Resistência térmica por camada e transmitância global por unidade de área.',
'e1|Espessura camada 1|m|0.12|0.0001|10;k1|Condutividade camada 1|W/m.K|0.7|0.001|100;e2|Espessura camada 2|m|0.03|0.0001|10;k2|Condutividade camada 2|W/m.K|0.04|0.001|100;Rsi|Resistência superficial interna|m².K/W|0.13|0|10;Rse|Resistência superficial externa|m².K/W|0.04|0|10',
'R1|Resistência camada 1|m².K/W|e1/k1;R2|Resistência camada 2|m².K/W|e2/k2;Rt|Resistência total|m².K/W|Rsi+R1+R2+Rse;U|Transmitância térmica global|W/m².K|1/Rt',
'e2','Resistências em série para fluxo unidimensional.','Não considera pontes térmicas, heterogeneidade, umidade, radiação ou massa térmica.','ABNT NBR 15575-4:2025 (escopo de desempenho)');
define('aquecimento-agua-potencia','Climatização','Potência de aquecimento de água',
'Cálculo da potência para vazão contínua e variação de temperatura.',
'Q|Vazão|L/min|18|0.01|100000;delta|Aumento de temperatura|K|28|0.1|100;eta|Eficiência de transferência|%|91|1|100',
'Putil|Potência térmica útil|kW|(Q/60)*4.186*delta;Pentrada|Potência térmica requerida|kW|Putil/(eta/100)',
'Q','Calor sensível de água de densidade próxima a 1 kg/L.','Não avalia potência de pico de mistura, perdas da rede, acumulação ou características do equipamento.','ABNT NBR 5626:2020');
define('fotovoltaico-dimensionamento','Energia','Potência fotovoltaica por consumo',
'Estima potência instalada, quantidade de módulos e geração média de projeto.',
'E|Consumo de referência|kWh/mês|1050|1|10000000;HSP|Horas solares de pico|h/dia|4.6|0.1|12;PR|Performance ratio|adim.|0.8|0.1|1;dias|Dias do período|dias|30|1|366;Wp|Potência do módulo|Wp|550|50|2000',
'kWp|Potência necessária|kWp|E/(HSP*PR*dias);Nm|Quantidade de módulos|un.|CEILING(kWp*1000/Wp,1);Pot|Potência adotada|kWp|Nm*Wp/1000;Eger|Geração média projetada|kWh/mês|Pot*HSP*PR*dias',
'E','Estimativa energética estática por irradiância média diária e desempenho agregado.','Não contempla sombreamento detalhado, orientação, clipping, perdas sazonais ou regras tarifárias.','Estudo fotovoltaico de viabilidade');
define('fotovoltaico-geracao','Energia','Geração fotovoltaica mensal e específica',
'Calcula produtividade anual equivalente e energia por período.',
'kWp|Potência de pico instalada|kWp|14.3|0.01|1000000;HSP|Horas solares de pico|h/dia|4.5|0.1|12;PR|Índice de desempenho|adim.|0.78|0.1|1;dias|Dias do mês|dias|30|1|366',
'Ed|Geração diária|kWh/dia|kWp*HSP*PR;Em|Geração no mês|kWh/mês|Ed*dias;Es|Produtividade no mês|kWh/kWp|Em/kWp;Ea|Geração anualizada|kWh/ano|Ed*365',
'HSP','Balanço energético baseado em média horária equivalente.','A anualização é indicativa e não substitui simulação climática horária por local.','Estudo de energia solar');
define('energia-payback-simples','Energia','Retorno simples de investimento energético',
'Economia líquida anual e tempo de retorno simples.',
'I|Investimento inicial|R$|85000|0.01|1000000000;E|Energia compensável|kWh/mês|1550|0|100000000;T|Tarifa efetivamente evitada|R$/kWh|0.88|0|10000;op|Custo mensal de operação|R$|110|0|1000000',
'Rbr|Economia bruta mensal|R$|E*T;Rliq|Benefício líquido mensal|R$|Rbr-op;Ra|Benefício líquido anual|R$|Rliq*12;Tret|Retorno simples|anos|I/Ra',
'E','Payback aritmético sem desconto financeiro.','Se Ra <= 0, não há retorno; tarifa e energia compensável devem refletir o contrato real.','Estudo econômico; não constitui parecer regulatório');
define('corte-aterro-secoes','Terraplenagem','Volume entre duas seções de corte ou aterro',
'Volume pelo método das áreas médias e estimativa de material transportado.',
'A1|Área da seção inicial|m²|14|0|100000;A2|Área da seção final|m²|22|0|100000;L|Distância entre estacas|m|20|0.01|100000;emp|Fator de empolamento|%|22|0|500',
'Vm|Volume geométrico|m³|(A1+A2)*L/2;Vsolto|Volume solto estimado|m³|Vm*(1+emp/100)',
'L','Regra trapezoidal de áreas médias em uma única distância.','Acurácia depende da densidade das seções e perfil; não inclui compensação lateral.','Estudo de terraplenagem');
define('aterro-compactado','Terraplenagem','Material para aterro compactado',
'Volume geométrico compactado e massa solta equivalente a transportar.',
'A|Área em planta|m²|7200|0.01|100000000;h|Espessura compactada|m|0.35|0.001|100;rho|Massa específica seca compactada|t/m³|1.85|0.1|5;rhos|Massa específica solta|t/m³|1.5|0.1|5',
'Vc|Volume compactado|m³|A*h;M|Massa seca requerida|t|Vc*rho;Vs|Volume solto estimado|m³|M/rhos',
'A','Balanço aproximado de massa seca.','Não substitui Proctor, umidade ótima, grau de compactação ou controle tecnológico.','ABNT NBR 6484:2020 (investigação geotécnica, quando aplicável)');
define('pavimento-asfalto','Terraplenagem','Consumo de mistura asfáltica por camada',
'Volume compactado e tonelagem teórica com perdas de produção.',
'A|Área de aplicação|m²|12500|0.01|100000000;h|Espessura compactada|cm|5|0.1|100;rho|Densidade compactada|t/m³|2.35|0.1|5;perdas|Perdas estimadas|%|3|0|100',
'V|Volume compactado|m³|A*(h/100);M|Massa teórica|t|V*rho;Mpedido|Tonelagem com perdas|t|M*(1+perdas/100)',
'A','Volume e densidade aparente informados pelo usuário.','Não calcula composição granulométrica, teor de ligante, compactação ou espessura efetiva.','Projeto de pavimentação; especificações contratuais');
define('obra-valor-agregado','Obras e contratos','Valor agregado e desempenho de obra',
'Índices SPI e CPI, projeção de custo e variação na conclusão.',
'BAC|Orçamento no término|R$|1000000|0.01|100000000000;PV|Valor planejado|R$|490000|0.01|100000000000;EV|Valor agregado|R$|430000|0.01|100000000000;AC|Custo real|R$|465000|0.01|100000000000',
'SPI|Índice de prazo SPI|vezes|EV/PV;CPI|Índice de custo CPI|vezes|EV/AC;EAC|Custo estimado na conclusão|R$|BAC/CPI;ETC|Custo para completar|R$|EAC-AC;VAC|Variação projetada|R$|BAC-EAC',
'EV','Indicadores de valor agregado para orçamento e avanço físico mensurado.','Projetar BAC/CPI pressupõe manutenção do desempenho. Valores devem vir de medição e custo real verificáveis.','Gestão contratual; diretrizes de valor agregado');
define('obra-reajuste-indice','Obras e contratos','Reajuste de preços por índice',
'Fator de reajustamento, valor atualizado e diferença nominal.',
'V|Valor-base reajustável|R$|280000|0.01|100000000000;Io|Índice de origem|pontos|1000|0.001|10000000;If|Índice na data aplicável|pontos|1125|0.001|10000000',
'F|Fator de reajuste|vezes|If/Io;Vcorr|Valor reajustado|R$|V*F;Delta|Variação nominal|R$|Vcorr-V',
'If','Atualização direta pelo quociente de índices.','A definição da data-base, índice, parcela elegível e fórmula contratual prevalecem sobre esta simulação.','Contrato e legislação aplicável');
define('obra-lucro-contribuicao','Obras e contratos','Margem de contribuição de contrato',
'Receita líquida, margem em reais e ponto de equilíbrio do contrato.',
'V|Preço do contrato|R$|380000|0.01|100000000000;tax|Tributos sobre receita|%|11|0|99;var|Custo variável|R$|245000|0|100000000000;fix|Custos fixos atribuíveis|R$|65000|0|100000000000',
'RL|Receita após tributos|R$|V*(1-tax/100);MC|Margem de contribuição|R$|RL-var;R|Resultado operacional|R$|MC-fix;Mpc|Margem líquida do contrato|%|R/V*100',
'V','Demonstração da receita líquida, margem de contribuição e resultado operacional com base nos valores informados.','Não confundir proposta, contratação, faturamento e recebimento; fluxo de caixa deve ser modelado à parte.','Gestão econômico-financeira');
define('viabilidade-valor-presente','Obras e contratos','Valor presente de fluxo anual uniforme',
'Valor presente líquido e índice de recuperação para recebimento uniforme.',
'I|Investimento inicial|R$|120000|0.01|10000000000;R|Fluxo anual líquido|R$|35000|0|1000000000;n|Horizonte|anos|5|1|100;tax|Taxa de desconto anual|%|12|0.0001|1000',
'r|Taxa decimal|adim.|tax/100;FVA|Fator de valor presente|vezes|(1-(1+r)^(-n))/r;VP|Valor presente das entradas|R$|R*FVA;VPL|Valor presente líquido|R$|VP-I',
'R','Fluxos anuais uniformes ao fim de cada período e taxa constante.','Não inclui impostos adicionais, valor residual, sazonalidade ou risco de execução.','Análise econômico-financeira');
define('obra-indice-produtividade','Obras e contratos','Produtividade e custo unitário de execução',
'Produção por hora-homem, prazo estimado e custo unitário da equipe.',
'Q|Quantidade de serviço|unidade|900|0.001|100000000;n|Número de trabalhadores|pessoas|8|1|100000;h|Horas por jornada|h/dia|8|0.1|24;d|Duração observada|dias|18|0.1|100000;c|Custo por hora-homem|R$/hh|42|0.01|100000',
'HH|Horas-homem consumidas|hh|n*h*d;prod|Produtividade observada|unidade/hh|Q/HH;Cu|Custo de mão de obra por unidade|R$/unidade|HH*c/Q',
'Q','Razão de quantidades e horas observadas de uma equipe homogênea.','A produtividade do período pode não se repetir; considerar interferências, equipamentos e composição.','Gestão de obras');
define('topografia-declividade','Terraplenagem','Declividade e desnível de traçado',
'Converte desnível e distância horizontal em declividade e ângulo.',
'zi|Cota inicial|m|104.5|-10000|100000;zf|Cota final|m|101.2|-10000|100000;L|Distância horizontal|m|65|0.001|1000000',
'dz|Desnível|m|zf-zi;i|Declividade longitudinal|%|dz/L*100;grau|Inclinação|graus|ATAN(dz/L)*180/PI()',
'L','Geometria de perfil entre dois pontos.','Não representa curvas de concordância em perfil longitudinal nem verifica critérios de acessibilidade, drenagem ou projeto viário.','ABNT NBR 9050:2020 (quando aplicável)');
define('escada-geometria','Arquitetura','Geometria preliminar de escada',
'Calcula espelhos, piso a partir de relação ergonômica inserida e desenvolvimento.',
'H|Desnível entre pisos|cm|306|1|10000;n|Número de espelhos|un.|18|1|200;Bl|Relação ergonômica escolhida|cm|63|50|70;pmin|Piso mínimo definido|cm|28|1|100',
'e|Altura do espelho|cm|H/n;p|Piso derivado|cm|Bl-2*e;L|Desenvolvimento de um lance|cm|p*(n-1);uso|Relação piso / piso mínimo|vezes|p/pmin',
'H','Regra geométrica 2e + p parametrizada pelo usuário.','Exige conferir geometria por lance, patamares, acessibilidade e uso previsto.','ABNT NBR 9050:2020; códigos de obras');
export const MODELS = Object.freeze(catalog);
export const AREAS = Object.freeze([...new Set(catalog.map(model => model.area))]);
export function getModel(slug) {return MODELS.find(model => model.slug === slug);}
export function parseExpression(expr, scope) {
  const tokens = String(expr).match(/(?:[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|<=|>=|<>|!=|[()+*\/^,<>=-])/g) || [];
  if (tokens.join('') !== String(expr).replace(/\s/g,'')) throw Error('Expressão inválida: ' + expr);
  let pos = 0;
  const one = () => {
    const t = tokens[pos++];
    if (t === '(') {const val=cmp();if(tokens[pos++]!==')')throw Error('Parênteses incompletos');return val;}
    if (t === '-') return -one();
    if (t === '+') return one();
    if (/^\d/.test(t || '')) return Number(t);
    if (/^[A-Za-z_]/.test(t || '')) {
      if (tokens[pos] === '(') {
        pos++;
        const args=[];
        if (tokens[pos] !== ')') { do {args.push(cmp());if(tokens[pos]!==',')break;pos++;} while(true);}
        if(tokens[pos++]!==')')throw Error('Função incompleta');
        const functions={PI:()=>Math.PI,SQRT:Math.sqrt,ABS:Math.abs,MIN:Math.min,MAX:Math.max,
          TAN:Math.tan,SIN:Math.sin,COS:Math.cos,ATAN:Math.atan,ACOS:Math.acos,
          LN:Math.log,LOG:Math.log10,EXP:Math.exp,ROUND:(x,n=0)=>Number(x.toFixed(n)),
          CEILING:(x,n=1)=>Math.ceil(x/n)*n,FLOOR:(x,n=1)=>Math.floor(x/n)*n};
        if(!Object.hasOwn(functions,t.toUpperCase()))throw Error('Função desconhecida: '+t);
        return functions[t.toUpperCase()](...args);
      }
      if(!Object.hasOwn(scope,t))throw Error('Variável sem definição: '+t);
      return scope[t];
    }
    throw Error('Termo inesperado: '+t);
  };
  const power = () => {let left=one();if(tokens[pos]==='^'){pos++;left=Math.pow(left,power());}return left;};
  const mul = () => {let v=power();while(tokens[pos]==='*'||tokens[pos]==='/'){const op=tokens[pos++],r=power();v=op==='*'?v*r:v/r;}return v;};
  const add = () => {let v=mul();while(tokens[pos]==='+'||tokens[pos]==='-'){const op=tokens[pos++],r=mul();v=op==='+'?v+r:v-r;}return v;};
  const cmp = () => {let v=add();while(['<','>','<=','>=','=','<>','!='].includes(tokens[pos])){const op=tokens[pos++],r=add();v=Number(op==='<'?v<r:op==='>'?v>r:op==='<='?v<=r:op==='>='?v>=r:op==='='?v===r:v!==r);}return v;};
  const value=cmp();
  if(pos!==tokens.length || !Number.isFinite(value))throw Error('Resultado não finito ou expressão incompleta: '+expr);
  return value;
}
export function calculate(model, input) {
  if(!model)throw Error('Modelo não encontrado');
  const scope={};
  for(const field of model.fields){
    const val=Number(input[field.key]);
    if(!Number.isFinite(val)||val<field.min||val>field.max)throw Error('Confira '+field.label+' ('+field.min+' a '+field.max+').');
    scope[field.key]=val;
  }
  if(model.slug==='viga-carga-pontual' && scope.a>=scope.L)throw Error('A posição da carga deve estar dentro do vão.');
  if(model.slug==='eletrica-correcao-fator-potencia' && scope.fpf<=scope.fpi)throw Error('O fator de potência desejado deve superar o atual.');
  if(model.slug==='energia-payback-simples' && scope.E*scope.T<=scope.op)throw Error('A economia líquida deve ser positiva para calcular retorno.');
  if(model.slug==='muro-empuxo-ativo' && scope.gamma*scope.H+scope.q===0)throw Error('O empuxo deve ser positivo.');
  for(const step of model.steps)scope[step.key]=parseExpression(step.expr,scope);
  return {scope,steps:model.steps.map(x=>({...x,value:scope[x.key]})),primary:scope[model.keyResult]};
}
export function scenario(model,input,points=21){
  const field=model.fields.find(x=>x.key===model.driver);
  const base=Number(input[field.key]);
  const samples=[];
  for(let i=0;i<points;i++){
    const factor=0.5+i*0.05;
    const value=base*factor;
    try{if(value<field.min||value>field.max)continue;
      const result=calculate(model,{...input,[field.key]:value});
      samples.push({factor,value,result:result.primary,steps:result.steps});
    }catch{/* Os cenários fisicamente inválidos não recebem gráfico. */}
  }
  return samples;
}
export function excelExpression(expr, references) {
  return expr.replace(/\b[A-Za-z_][A-Za-z_0-9]*\b/g,(token,index,full)=>{
    if(full.slice(index+token.length).trimStart().startsWith('('))return token.toUpperCase();
    if(!Object.hasOwn(references,token))throw Error('Fórmula sem referência: '+token);
    return references[token];
  });
}
