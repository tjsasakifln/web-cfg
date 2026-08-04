# Matriz de componentes (antigo → novo)

| Antigo | Novo |
|--------|------|
| `<style>` inline por página com `#0b5fff` | `styles-tools.css` (tokens verde/marinho) |
| `.tool-card` / `.tool-card-list` sem CSS | Estilos reais em `styles-tools.css` |
| `.checklist-item` genérico em tools | `.tool-req` / `.tool-option` (escopo tool) |
| Inferência `page_id.startswith("guia-")` | `interaction_type` + `checklist_items` |
| Checkbox binário + barra de contagem | Tri-estado Atendido/Pendente/N/A + bloqueadores |
| `computeChecklistScore` média simples | `computeReequilibrio` ponderado com veto de bloqueador |
| `computeMatrizAtraso` contagem de causas | `computeMatrizEventos` hipóteses por evento |
| `ConfengeTools.num` → 0 silencioso | `parseBRL` / `moneyFromField` rejeita inválido |
| Resultado “OK” / verde jurídico | “Dentro do limite numérico calculado…” |
| CTA “Quando a CONFENGE agrega valor” ×N | Um CTA contextual pós-resultado |
| Hub `WebApplication` | `CollectionPage` + `ItemList` |
| Sem nav Ferramentas | Item em `brand.json` navigation.desktop |
| Datas `2026-08-02` cruas | `format_date_br` → “2 de agosto de 2026” |
