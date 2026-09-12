# Fragment: sitemaps

- `target_path`: `sitemap.xml` / `sitemap-index.xml` and the generator that emits them
- `operation`: `omit_until_index_authorization`
- `stable_key`: `https://confenge.com.br/grande-florianopolis/`
- `depends_on`: goal 99 + public-family registry + distinct-answer still green
- `teste`: campaign 11 test already asserts every root `sitemap*.xml` omits the slug. After promotion, add a single URL with lastmod; never four city URLs
- `rollback`: remove the loc; keep meta noindex if the URL still exists
