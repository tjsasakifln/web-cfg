# Runner CORE_QA_SUITE (campanha 15)

Invocação direta — `package.json` pertence à campanha 16:

```
node tests/campaigns/inb_20260911/15/run.mjs \
  --root <candidato> \
  --examined-kind baseline|isolated|composed \
  --mutations \
  --report <arquivo.json>
```

`--included` lista campanhas do manifest do candidato. A matriz CORE 01–10 corre mesmo se o manifest omitir uma delas.

Estados por cheque: `pass`, `fail`, `MISSING_DEPENDENCY`. Exit 0 somente sem `fail` de produto. Ausência de produtor não vira PASS.

INB-16 deve executar de novo no SHA composto final. Este runner não aprova SHA futuro.
