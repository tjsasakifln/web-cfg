# CONFENGE | Engineering services website and digital tools

Source repository for [confenge.com.br](https://confenge.com.br/), a Brazil-based engineering services website with public technical content, customer journeys and web tools. The codebase includes static pages, JavaScript and Node.js tooling, server-side runtime components, and automated tests for several business and website workflows.

**Public product:** [CONFENGE website](https://confenge.com.br/) · **Technical overview:** [Engineering case study](docs/portfolio/CASE_STUDY.md) · **Maintainer's selected work:** [International portfolio](https://github.com/tjsasakifln/devflow/blob/main/PORTFOLIO.md)

## What is in this repository?

| Area | Where to start |
| --- | --- |
| Public website and service journeys | [`index.html`](index.html), [`projetos-prontos/`](projetos-prontos/), [`servicos/`](servicos/) |
| Frontend assets | [`css/`](css/), [`js/`](js/), [`assets/`](assets/) |
| Interactive tools | [`bim/`](bim/), [`cad/`](cad/), [`ferramentas/`](ferramentas/) |
| Service-side code and integrations | [`runtime/`](runtime/), [`netlify/`](netlify/), [`supabase/`](supabase/) |
| Tests and build tasks | [`tests/`](tests/), [`scripts/`](scripts/), [`package.json`](package.json) |
| Architecture and operating guidance | [`docs/`](docs/), [`netlify.toml`](netlify.toml) |

The presence of a tool directory or test does not by itself prove that a feature is deployed, available to every visitor, or fully validated.

## Technical orientation

- **Frontend:** HTML, CSS and JavaScript.
- **Tooling:** Node.js scripts, Python-based checks and automated tests; see [package.json](package.json) for available tasks.
- **Delivery:** The repository includes Netlify configuration for previews and other deployment artifacts. **A GitHub merge must not be interpreted as proof that the canonical production environment was updated.**
- **Testing:** Run the relevant documented project-specific checks. Do not assume a global test command covers every service or revenue-critical flow.

## Intended audience

This repository serves the CONFENGE website and its operations. The public code and case study can also help engineering technology reviewers understand product constraints, workflow design and verification practices. Commercial operations, customer data and confidential integrations are outside the scope of public portfolio demonstrations.

For career-oriented context and additional open projects, see [Tiago Sasaki's selected work](https://github.com/tjsasakifln/devflow/blob/main/PORTFOLIO.md).

## Use and limitations

This repository is not a turnkey product or a supported public API. Review all licensing, data rights, authentication, payment and security boundaries before reuse. Do not publish or reuse customer information, protected engineering deliverables, secrets or production credentials.
