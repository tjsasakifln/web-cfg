# CONFENGE website: engineering and product case study

## Context

CONFENGE operates a public website for engineering services and digital tools. The site must explain specialized engineering offerings, support inquiries and customer journeys, and preserve the difference between published information and authenticated or operational workflows.

**Public reference:** [confenge.com.br](https://confenge.com.br/)

## Engineering and product challenges

- Convey complex technical services in a form that visitors can understand and act on.
- Organize a large set of service and topic pages without losing navigability.
- Connect public interfaces to operational services and external integrations with clear boundaries.
- Maintain SEO and accessibility considerations alongside functional tests.
- Separate Git history, preview deployments and actual production verification.

## Implementation evidence

| Concern | Repository evidence |
| --- | --- |
| Public pages and navigation | [Homepage](../../index.html), [service paths](../../servicos/), [site assets](../../assets/) |
| Browser-side behavior and UI | [JavaScript](../../js/), [styles](../../css/) |
| Digital engineering tools | [BIM section](../../bim/), [CAD section](../../cad/) |
| Runtime and integration boundaries | [Runtime](../../runtime/), [Netlify code](../../netlify/), [configuration](../../netlify.toml) |
| Verification assets | [Tests](../../tests/), [scripts](../../scripts/), [package scripts](../../package.json) |

These links show what can be inspected in source control. They are not substitutes for a live user test, security review or verified deployment log.

## Limitations

This case study makes **no unverified claims** about lead conversion rate, organic traffic, availability, payment success, production deployment of every feature or monetary results. Such statements require contemporaneous analytics, end-to-end evidence and appropriate authorization to disclose.

The repository contains business-specific code; prospective collaborators should not treat it as a public playground or use it to access customer information.

## Role and collaboration context

The project combines engineering-domain requirements, product direction, web delivery and acceptance testing. For the maintainer's other projects and international collaboration interests, see [the selected portfolio](https://github.com/tjsasakifln/devflow/blob/main/PORTFOLIO.md).
