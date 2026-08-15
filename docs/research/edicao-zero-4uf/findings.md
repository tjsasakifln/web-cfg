# Findings

Nenhum finding abaixo afirma cobertura de 27 UFs. Frases sem número só
aparecem quando o status é `unsupported`.

### F1 (answered)

Os 4 mercados publicados somam 48 contratos e 70292373.24 BRL nominais (data_as_of do snapshot). O snapshot classifica 233 contratos aec_confirmed em 11931 carregados.

### F2 (answered)

Compradores distintos por mercado publicado: SC pavimentacao=11, PI pavimentacao=6, MG edificacoes=10, RS edificacoes=10. Identidades nominais dos top buyers estão suprimidas.

### F3 (answered)

Fornecedores observados por mercado publicado: SC=11, PI=13, MG=11, RS=10.

### F4 (partial)

Concentração mensurável só na fatia MRS-PREFEITURA MUNICIPAL DE CAXIAS DO SUL (RS): 49 contratos, 1 fornecedor(es), top3_share=1.0, período 2026-07-03–2026-07-03. 13 objetos rotulados reajuste.

### F5 (answered)

Tickets (piso 5000 BRL, contrato integral): MG Edificações públicas n=15 P25=412900.0 mediana=504997.83 P75=1300000.0; PI Pavimentação e infraestrutura viária n=13 P25=744003.0 mediana=996225.26 P75=1463918.41; RS Edificações públicas n=12 P25=199500.0 mediana=415499.99 P75=1390000.0; SC Pavimentação e infraestrutura viária n=12 P25=224135.0 mediana=345532.53 P75=635000.0. Não é preço unitário.

### F6 (unsupported)

Evolução temporal do recorte: não sustentado. Série anual insuficiente: 3 de 4 mercados publicados têm um único ano (pavimentacao-infraestrutura-viaria-sc, pavimentacao-infraestrutura-viaria-pi, edificacoes-publicas-mg). Apenas 1 mercado cruza dois anos civis, com n anual baixo e janelas de poucas semanas. Evolução do recorte: não sustentado.


## Perguntas

### Q1 — volume_valor

**Pergunta:** Qual o volume e o valor observado de contratos AEC confirmados nos mercados publicados do recorte?

**Status:** `answered`

**Limitação:** Os contratos dos 4 mercados publicados não equivalem ao conjunto aec_confirmed do snapshot nem a um recorte de 27 UFs. O manifest declara cobertura incompleta frente ao conjunto nacional de referência da base canônica de contratos.

### Q2 — compradores

**Pergunta:** Quantos órgãos compradores distintos o recorte observa por mercado?

**Status:** `answered`

**Limitação:** Contagens de compradores são por célula mercado×UF. Identidades nominais dos top buyers estão suprimidas neste snapshot.

### Q3 — fornecedores

**Pergunta:** Quantos fornecedores o recorte observa por mercado?

**Status:** `answered`

**Limitação:** Ausência na lista não implica ausência de atuação. O recorte de concorrência publicado é 1 célula (manutenção predial RS).

### Q4 — concentracao

**Pergunta:** Há concentração mensurável de compradores ou fornecedores no recorte?

**Status:** `partial`

**Limitação:** Concentração só é mensurável na fatia Caxias do Sul / manutenção predial (1 dia civil, 1 órgão, 1 fornecedor dominante). HHI dos 4 mercados publicados é nulo; top buyers estão suprimidos.

### Q5 — regional

**Pergunta:** Como os mercados publicados se comparam entre as UFs do recorte?

**Status:** `answered`

**Limitação:** Comparação regional restrita a SC, PI, MG e RS. Não é ranking de regiões brasileiras.

### Q6 — categorias

**Pergunta:** Quais categorias/arquétipos o snapshot publica, e com que massa?

**Status:** `answered`

**Limitação:** Arquétipos listam UFs além de SC/PI/MG/RS com n pequeno. Essas UFs não viram mercado publicado e não sustentam recorte nacional.

### Q7 — tamanho_tipico

**Pergunta:** Qual o tamanho típico do contrato (P25, mediana, P75) por mercado, e o que esse número não significa?

**Status:** `answered`

**Limitação:** prices.json e markets.json são populações de query distintas. n e percentis divergem nos dois sentidos e não se explica o desvio pelo piso de 5000 BRL (esse piso é critério da célula de preço, não uma prova de que n_preço < n_mercado). Células de preço sem mercado publicado (ex.: manutenção predial) não entram no wedge. Objetos do mesmo arquétipo podem ser tecnicamente incomparáveis.

### Q8 — evolucao

**Pergunta:** Há série temporal suficiente para afirmar evolução do recorte?

**Status:** `unsupported`

**Limitação:** Série anual insuficiente: 3 de 4 mercados publicados têm um único ano (pavimentacao-infraestrutura-viaria-sc, pavimentacao-infraestrutura-viaria-pi, edificacoes-publicas-mg). Apenas 1 mercado cruza dois anos civis, com n anual baixo e janelas de poucas semanas. Evolução do recorte: não sustentado.

