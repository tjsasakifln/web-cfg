# Fragmento de integração — lastmod e baseline BOFU

Owner de integração: **MV-09**. A MV-02 não autoriza nem realiza estas edições porque `sitemap.xml` e `data/bofu-dominance/frozen-specs/hashes.json` estão fora do seu WRITE_SET.

## Por que o handoff é necessário

Após integrar a producer, `npm run editorial:build` deriva corretamente três mudanças em `sitemap.xml`:

| URL | lastmod anterior | lastmod derivado |
| --- | --- | --- |
| `/confianca/` | `2026-09-04` | `2026-09-05` |
| `/conflitos/` | `2026-08-16` | `2026-09-05` |
| `/especialista/tiago-jun-sasaki/` | `2026-09-04` | `2026-09-05` |

O hash SHA-256 congelado de `sitemap.xml` é `2776c80930c5276ad01a1a2224c9572326bf55138d802e868d3fe8c0028bd45d`; no build isolado da producer, o arquivo derivado passou a `a4621384e938f0f64fc9545d97499fbc4e078f17996b326eb68ca21af406fc17`. A MV-09 deve recalcular o valor sobre a árvore integrada, pois outras campanhas podem alterar o mesmo arquivo.

## Procedimento para a MV-09

1. Integrar as producers selecionadas sobre o `origin/main` então vigente.
2. Executar `npm run editorial:build` e revisar o diff completo dos sitemaps.
3. Confirmar que os três deltas acima são apenas datas das superfícies MV-02 e que nenhuma URL foi criada, removida, redirecionada ou teve canonical alterada por esta campanha.
4. Recapturar `sitemap.xml` como collateral não renderizante pelo procedimento BOFU vigente, com motivo escrito e pin alcançável da árvore revisada. Não recapturar os seis HTMLs congelados nem assets de renderização em nome da MV-02.
5. Executar `npm run test:bofu-dominance`, a suíte pSEO e o `site-ci` completo antes de merge ou publicação.

## Rollback

Ao reverter a MV-02 depois da integração, restaurar juntos os três `lastmod` anteriores e o hash BOFU anterior de `sitemap.xml`. A reversão não altera URLs, canonicals, redirects nem os HTMLs BOFU congelados.
