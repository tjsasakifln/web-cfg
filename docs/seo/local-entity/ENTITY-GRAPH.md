# Entity graph classification

Machine record: `data/local-entity/entity-graph.json`.

Source: committed `especialista/tiago-jun-sasaki/index.html` JSON-LD, `data/site/proof.json`, `data/site/brand.json` contact.

| Field | Campaign status | Note |
|---|---|---|
| Organization `@id` | SELF_DECLARED | `https://confenge.com.br/#organization` |
| Person `@id` | SELF_DECLARED | `https://confenge.com.br/#tiago` |
| credentials / alumniOf USP | SELF_DECLARED | proof.json circular VERIFIED remapped |
| credentials / CREA | NOT_PUBLIC | not a public proof record |
| worksFor | SELF_DECLARED | Person → Organization `@id` |
| knowsAbout | SELF_DECLARED | published library topics |
| sameAs | UNKNOWN | no classified public profiles; do not invent |
| contact (email, phone, CNPJ) | SELF_DECLARED | already on the specialist page |
| extra personal email | NOT_PUBLIC | must not appear in outputs |
| areaServed Country Brasil | SELF_DECLARED | atendimento nacional |
| city areaServed | UNKNOWN | DDD 48 ≠ city claim |
| streetAddress | NOT_PUBLIC | no public street NAP |

No LocalBusiness, PostalAddress, Review or AggregateRating node is published on the specialist page. Adding one in this PR would fail the honesty gate.

## Adendo #243 (2026-08-23) — escopo do endereço e do sameAs na home

`index.html` (home) passou a publicar, no nó `Organization`, apenas
`address: {"@type":"PostalAddress","addressCountry":"BR"}`. É o país de registro, derivável do
CNPJ já publicado. Nenhuma chave de `INVENTED_NAP_KEYS` (`streetAddress`, `postalCode`,
`addressLocality`, `addressRegion`, `geo`, `hasMap`) é emitida. A classificação
`org-streetAddress = NOT_PUBLIC` continua valendo: não há NAP de rua pública.

A página do especialista continua **sem** nó `PostalAddress` — o gate de honestidade
(`FORBIDDEN_LOCAL_TYPES`) roda sobre `especialista/tiago-jun-sasaki/index.html` e reprovaria.

O `sameAs` verificável (`https://github.com/tjsasakifln`) foi espelhado no nó `Person` da home,
igual ao que já existe na página do especialista, e aparece em texto visível no rodapé. Não foi
atribuído ao nó `Organization` porque é um perfil pessoal do fundador, não da pessoa jurídica.

Número de registro CREA (PJ) e ART continuam `NOT_PUBLIC`: nenhum número verificável existe neste
repositório. O rodapé declara essa ausência em vez de publicar um número inventado.
