# Visual spec (no máximo 5 gráficos)

Não é um dashboard. Cada série existe para sustentar uma pergunta executiva.

### C1

- **Pergunta:** Qual o volume e o valor observado de contratos AEC confirmados nos mercados publicados do recorte?
- **Unidade:** BRL nominal (contrato integral)
- **Caveat:** Os contratos dos 4 mercados publicados não equivalem ao conjunto aec_confirmed do snapshot nem a um recorte de 27 UFs. O manifest declara cobertura incompleta frente ao conjunto nacional de referência da base canônica de contratos.
- **Takeaway:** O valor observado vive em 4 células mercado×UF. Somar as células descreve o recorte publicado, não o Brasil.
- **Dados:**

```json
[
  {
    "label": "SC · pavimentacao-infraestrutura-viaria",
    "contract_count": 13,
    "total_value_brl": 15206416.82
  },
  {
    "label": "PI · pavimentacao-infraestrutura-viaria",
    "contract_count": 13,
    "total_value_brl": 26172058.65
  },
  {
    "label": "MG · edificacoes-publicas",
    "contract_count": 12,
    "total_value_brl": 16767654.94
  },
  {
    "label": "RS · edificacoes-publicas",
    "contract_count": 10,
    "total_value_brl": 12146242.83
  }
]
```

### C2

- **Pergunta:** Como se comparam contratos, compradores e fornecedores por mercado?
- **Unidade:** contagem
- **Caveat:** Contagens de compradores são por célula mercado×UF. Identidades nominais dos top buyers estão suprimidas neste snapshot.
- **Takeaway:** Compradores e fornecedores são quase 1:1 na maior parte das células. Isso é n pequeno, não prova atomização nacional.
- **Dados:**

```json
[
  {
    "label": "SC · pavimentacao-infraestrutura-viaria",
    "contracts": 13,
    "buyers": 11,
    "suppliers": 11
  },
  {
    "label": "PI · pavimentacao-infraestrutura-viaria",
    "contracts": 13,
    "buyers": 6,
    "suppliers": 13
  },
  {
    "label": "MG · edificacoes-publicas",
    "contracts": 12,
    "buyers": 10,
    "suppliers": 11
  },
  {
    "label": "RS · edificacoes-publicas",
    "contracts": 10,
    "buyers": 10,
    "suppliers": 10
  }
]
```

### C3

- **Pergunta:** Qual o tamanho típico do contrato (P25, mediana, P75) por mercado, e o que esse número não significa?
- **Unidade:** BRL nominal; P25/mediana/P75 da célula de preço (prices.json)
- **Caveat:** prices.json e markets.json são populações de query distintas. n e percentis divergem nos dois sentidos e não se explica o desvio pelo piso de 5000 BRL (esse piso é critério da célula de preço, não uma prova de que n_preço < n_mercado). Células de preço sem mercado publicado (ex.: manutenção predial) não entram no wedge. Objetos do mesmo arquétipo podem ser tecnicamente incomparáveis.
- **Takeaway:** A mediana de C3 vem de prices.json, população distinta de markets.json. É contrato integral, não preço unitário nem faixa nacional de preço praticado.
- **Dados:**

```json
[
  {
    "label": "MG · Edificações públicas",
    "n": 15,
    "p25": 412900.0,
    "median": 504997.83,
    "p75": 1300000.0
  },
  {
    "label": "PI · Pavimentação e infraestrutura viária",
    "n": 13,
    "p25": 744003.0,
    "median": 996225.26,
    "p75": 1463918.41
  },
  {
    "label": "RS · Edificações públicas",
    "n": 12,
    "p25": 199500.0,
    "median": 415499.99,
    "p75": 1390000.0
  },
  {
    "label": "SC · Pavimentação e infraestrutura viária",
    "n": 12,
    "p25": 224135.0,
    "median": 345532.53,
    "p75": 635000.0
  }
]
```

### C4

- **Pergunta:** Quanto do snapshot publicado chega aos 4 mercados do wedge?
- **Unidade:** contratos
- **Caveat:** Os contratos dos 4 mercados publicados não equivalem ao conjunto aec_confirmed do snapshot nem a um recorte de 27 UFs. O manifest declara cobertura incompleta frente ao conjunto nacional de referência da base canônica de contratos.
- **Takeaway:** A maior parte do snapshot não entra no wedge. Tratar os 4 mercados como Brasil inverteria o funil.
- **Dados:**

```json
[
  {
    "stage": "contratos carregados (snapshot)",
    "n": 11931
  },
  {
    "stage": "aec_confirmed no snapshot",
    "n": 233
  },
  {
    "stage": "contratos nos 4 mercados publicados",
    "n": 48
  }
]
```

### C5

- **Pergunta:** Há concentração mensurável de compradores ou fornecedores no recorte?
- **Unidade:** contratos / fornecedores no órgão publicado
- **Caveat:** Concentração só é mensurável na fatia Caxias do Sul / manutenção predial (1 dia civil, 1 órgão, 1 fornecedor dominante). HHI dos 4 mercados publicados é nulo; top buyers estão suprimidos.
- **Takeaway:** A única concentração mensurável é um órgão em um dia, com reajustes misturados a ordens de serviço.
- **Dados:**

```json
[
  {
    "label": "contratos no órgão",
    "n": 49
  },
  {
    "label": "fornecedores observados",
    "n": 1
  },
  {
    "label": "objetos rotulados reajuste",
    "n": 13
  }
]
```


## Regras de desenho

- Eixo em BRL nominal, nunca "preço de mercado".
- Título afirma o recorte (UF × arquétipo), nunca "Brasil".
- Nota de rodapé obrigatória: `dataset_hash` + `data_as_of` + denominator.
- Sem mapa coroplético nacional nesta edição (4 UFs).
