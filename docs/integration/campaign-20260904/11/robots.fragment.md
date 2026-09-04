# Fragment: robots.txt

- `target_path`: `robots.txt`
- `operation`: `insert_disallow`
- `stable_key`: `Disallow: /grande-florianopolis/`
- `depends_on`: public artifact membership. While the file lives under `docs/`, robots.txt is irrelevant because the URL is not in `_site`.
- `teste`: `curl` of production robots after apply; crawler fetch of the URL still sees meta noindex
- `rollback`: delete the Disallow line when goal 99 authorizes indexation **and** the public-family registry is live. Never Allow a single URL as a deindexation strategy.

## Payload

```
# Campaign 11 local hub — noindex until goal 99
Disallow: /grande-florianopolis/
```
