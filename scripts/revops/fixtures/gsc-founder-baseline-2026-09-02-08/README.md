# Provided aggregate: founder GSC Web baseline 02–08/09/2026

Source kind: `provided_aggregate`. Not live Search Analytics, not a synthetic
fixture, not `CURRENT`. Ingest date does not become freshness. Zip filename
date is not last-data date. Extraction date (2026-09-11) is not `as_of`.

Property grain (Grafico.csv): 6 clicks, 176 impressions, 02–08/09/2026.
These daily rows are the property-by-date table of the provided export. They
were not reconstructed from the period totals.

Page grain (Paginas.csv): 215 impressions — a different aggregation; do not
add to 176. Page metrics are not keywords. medições/glosas 28/0/4.79, SINAPI
17/1/6.71, aditivos 30/0/23.83, quantitativos 1/0/1.00 are page rows.

Query grain (Consultas.csv): original INB-10 bytes preserved. Four label rows
total 16 impressions / 0 clicks. Those labels are not observed search terms
and are not the six unknown click terms. The importer stores disclosed query
metrics with query text UNKNOWN.

Country grain (Paises.csv): Brasil 147 impressions, 6 clicks.
No Brazil *filter* is present in Filtros.csv — availability of a country
table is not a filter.

Absence of a dimension stays ABSENT/UNKNOWN, never numeric zero.
