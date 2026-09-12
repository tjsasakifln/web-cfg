# Schema decision — `/grande-florianopolis/`

`as_of`: 2026-09-04
`campaign_id`: 11
`decision`: **WebPage + Organization (minimal) + BreadcrumbList + Service/areaServed as City names. Omit LocalBusiness, ProfessionalService, PostalAddress, geo, hasMap, openingHours, taxID, streetAddress.**

## Why this graph

`scripts/local_entity` still forbids `LocalBusiness` and `PostalAddress` and records `USE_EXISTING_SERVICE` with `new_public_landing_created: false`. This campaign must not silently rewrite that owner. The hub is a noindex prototype outside `PUBLIC_TOP_DIRS`.

Founder clarification on #579 (2026-09-04): there is no public walk-in office; the registered address is fiscal/cadastral only. #243 owns publishable address and CREA/CNPJ projection. Until that registry is ratified and this route is promoted, projecting NAP would invent a storefront.

## Canonical

One canonical: `https://confenge.com.br/grande-florianopolis/`.
Robots: `noindex,nofollow` until goal 99.
The file currently lives under `docs/campaigns/campaign-20260904/11/hub/grande-florianopolis/` so `assemble_public_artifact` cannot copy it.

## areaServed

Visible copy and JSON-LD name the four cities: Florianópolis, São José, Palhoça, Biguaçu. Typed as `City` without address fields. National B2G capacity is stated in visible copy as additive; it is not encoded as a fake `GeoCircle` around an office.

## Explicit omissions

| Type / property | Status | Reason |
|---|---|---|
| `LocalBusiness` | omitted | Would imply storefront. Forbidden by local-entity gates. |
| `ProfessionalService` | omitted | Same, until credential registry projects a ratified node. |
| `PostalAddress` / `streetAddress` / `postalCode` | omitted | Address is cadastral; #243 owns publication. |
| `geo` / `hasMap` / `openingHours` | omitted | No walk-in office. |
| `taxID` / CREA / CPTEC / ART numbers | omitted | Credential registry (#243/#581). |
| `Review` / `AggregateRating` / `CaseStudy` | omitted | No permissioned local proof. |

## Promotion path (not this campaign)

Goal 97 may move the HTML to a public top-level dir and keep noindex. Goal 99 may authorize indexation only after offer, proof, credential, capture, conflict, public-family registry and this distinct-answer test are complete. Schema may gain Organization taxID and a truthful service-area ProfessionalService **only** when the credential owner projects those values.

## Rollback

Delete or unpublish the exact URL `/grande-florianopolis/`. Do not 301 the hub to `/`.
