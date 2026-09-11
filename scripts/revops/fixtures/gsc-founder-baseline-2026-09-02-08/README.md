# Fixture: founder GSC Web baseline 02–08/09/2026

Historical/test fixture only. Not live Search Analytics. Not `CURRENT`.
Ingest date does not become freshness. Zip filename date is not last-data date.

Property grain (Grafico.csv): 6 clicks, 176 impressions, 02–08/09/2026.
Page grain (Paginas.csv): 215 impressions — a different aggregation; do not add to 176.
Query grain (Consultas.csv): 4 disclosed rows, 16 impressions, 0 clicks.
Omitted queries remain UNKNOWN and are not reconstructed as zero.
Country grain (Paises.csv): Brasil 147 impressions, 6 clicks.
No Brazil *filter* is present in Filtros.csv — availability of a country table is not a filter.

Extraction date recorded in `meta.json` (2026-09-11). Source daily positions are already rounded.
