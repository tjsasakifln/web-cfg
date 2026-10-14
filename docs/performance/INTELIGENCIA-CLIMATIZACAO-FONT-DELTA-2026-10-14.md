# Delta de fonte: amostra de climatização

Em 14/10/2026, a rota pública única
`/inteligencia/fornecedores-climatizacao-contratos-publicos/` passou a integrar
o censo de fontes do baseline de performance. Ela referencia a mesma fonte
Archivo já declarada pelas rotas existentes.

O delta é somente de cobertura: uma rota a mais em
`routes_with_font_files` e `routes_with_font_face_rules`. Não há novo arquivo
de fonte, alteração de CSS, mudança de orçamento ou aumento de peso: o censo
permanece em 1 arquivo, 41,25 KB gzip por rota e 41,25 KB no total, abaixo dos
limites vigentes de 1 arquivo e 60 KB gzip por rota.

O comando canônico de atualização completa é
`npm run audit:performance -- --write-baseline`. Nesta reconciliação ele não
foi executado porque também reancora a evidência de CLS e o snapshot
informacional de ativos; estes não fazem parte do delta da única URL nova.
