# Before / After — linguagem artificial → português natural

Exemplos **reais** do repositório (branch de remediação).

---

## 1. FAQ mecânica a partir do slug

**URL:** `/conteudos/atraso-na-medicao-obra-publica/`

| | |
|--|--|
| **Antes** | `Qual documento deve ser lido primeiro em um caso de atraso na medição obra pública?` |
| **Problema** | Sequência do slug/consulta sem preposições naturais; pergunta fabricada para repetir keyword. |
| **Depois** | `Quais documentos montar primeiro quando a medição não anda?` |
| **Razão** | Soa como engenheiro falando com diretor; mantém intenção sem stuffing. |
| **Efeito** | Maior clareza → confiança → clique no CTA de envio de documentos. |

---

## 2. “Converta a discussão…” (resíduo de gerador)

**URL:** `/conteudos/tributos-bdi-obra-publica/` (padrão em dezenas de páginas)

| | |
|--|--|
| **Antes** | `Converta a discussão sobre tributos BDI obra pública em um objeto delimitado, com valor, período, serviço, decisão e responsável identificados.` |
| **Problema** | Instrução interna de pipeline/template colada no corpo. |
| **Depois** | `Delimite o problema — valor, período, serviço afetado, decisão necessária e responsável — antes de discutir tributos BDI obra pública. Objeto vago gera resposta vaga.` *(em noindex: soft-fix; indexáveis reescritos com tópico legível)* |
| **Razão** | Remove tom de prompt; mantém o conselho operacional. |
| **Efeito** | Página deixa de parecer automatizada. |

---

## 3. “Primeiro risco prático em um caso de {keyword}”

**URL:** `/conteudos/glosa-por-qualidade-obra-publica/`

| | |
|--|--|
| **Antes** | `Qual o primeiro risco prático em um caso de glosa por qualidade obra pública?` + resposta com “amarrar fato, cláusula, documento e impacto” genérico. |
| **Problema** | FAQ clonada entre dezenas de URLs; só muda a keyword. |
| **Depois** | `Qual o risco de aceitar glosa calado?` → `Criar precedente e corroer margem em medições futuras. Conteste no prazo e separe o que é retrabalho legítimo do que é glosa indevida.` |
| **Razão** | Cenário específico de glosa por qualidade. |
| **Efeito** | Diferenciação entre páginas vizinhas (gate de similaridade). |

---

## 4. Shell / posicionamento

**Superfície:** footer + Organization schema em artigos

| | |
|--|--|
| **Antes** | `Diretoria B2G fracionada para construtoras e empresas de engenharia: inteligência de mercado...` |
| **Problema** | Nome proprietário antes do benefício; visitante precisa decodificar jargão. |
| **Depois** | `Consultoria para licitações e contratos de obras públicas: análise de edital, orçamento, proposta e proteção de margem na execução para construtoras.` (footer: plain first + “Modelo de rotina contínua: Diretoria B2G fracionada.”) |
| **Razão** | Regra: linguagem comum primeiro; marca depois. |
| **Efeito** | Homepage/ofertas e artigos falam a mesma língua (`brand.json`). |

---

## 5. Hub — contagem honesta

**URL:** `/conteudos/`

| | |
|--|--|
| **Antes** | `120 guias organizados...` / `120 conteúdos encontrados` com 98 noindex listados. |
| **Problema** | Biblioteca anuncia profundidade que o sistema editorial rejeita. |
| **Depois** | `22 guias indexáveis...` + diretório só com indexáveis; noindex fora do hub/feed/sitemap. |
| **Razão** | Superfície = realidade editorial. |
| **Efeito** | Confiança + SEO técnico (sem doorway de descoberta). |

---

## Padrão a evitar (não reintroduzir)

```
Converta a discussão sobre {slug} em um objeto delimitado...
Qual documento deve ser lido primeiro em um caso de {slug}?
Qual o primeiro risco prático em um caso de {slug}?
O caso de {slug tokens} só se sustenta...
absorver custo ou risco de {slug} sem prova
```

Gates: `npm run test:inbound-gates`.
