# Fragmento de promoção para MV-09

## Mapeamento de origem para destino

| Origem no pacote | Destino público candidato |
| --- | --- |
| `public-candidates/engenharia-projetos-obras/` | `/engenharia-projetos-obras/` |
| `public-candidates/compatibilizacao-revisao-projetos/` | `/compatibilizacao-revisao-projetos/` |
| `public-candidates/quantitativos-orcamento-obras/` | `/quantitativos-orcamento-obras/` |
| `public-candidates/inspecao-documentacao-edificacoes/` | `/inspecao-documentacao-edificacoes/` |
| `public-candidates/assets/` | assets route-local ou bundle público escolhido pela MV-09 |

Remover o elemento `[data-integration-only]` no copy. Preservar canonical, H1, artefatos sintéticos e limites. Rebasear o shell no estado integrado da taxonomia/navegação, sem copiar chrome B2G antigo do candidato.

## Aplicação fail-closed

1. Escolher apenas rotas com oferta e capacidade aprovadas.
2. Copiar o HTML/assets para o destino exato.
3. Renderizar dentro do `<main>` o formulário adaptativo vigente, com o contexto de [`capture.fragment.json`](capture.fragment.json). O link de prévia para `/triagem-tecnica/` deve ser substituído ou mantido apenas como caminho secundário; sozinho não cumpre `capture_form`.
4. Aplicar somente as famílias correspondentes do [`public-family-registry.fragment.json`](public-family-registry.fragment.json).
5. Adicionar ao sitemap somente as URLs efetivamente copiadas. Se o hub for publicado com uma única money page, remover cards/links para as demais, sem criar 404.
6. Inserir um único item de navegação para o hub. Não inserir links por persona.
7. Regerar o artefato público e executar gates completos. Não promover com contrato de intake divergente ou sem protocolo persistido.

## Checks antes do merge

- canonical e schema apontam para o mesmo URL final;
- `robots=index,follow` só depois de família, captura e oferta aprovadas;
- nenhuma rota exibe preço, prazo, case, cliente, disponibilidade ou ART garantida;
- evento público usa IDs fechados; PII fica fora de URL e analytics;
- links B2G existentes permanecem intactos;
- promoção/rollback são URL-exact; zero redirect genérico para `/`;
- `python scripts/site/test_public_plain_language.py`;
- `npm run inbound:gates`;
- testes de schema, canonical, acessibilidade, privacidade, analytics e captura;
- smoke de 390×844 e 1366×768 no artefato integrado.

