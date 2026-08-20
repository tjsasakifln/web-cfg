# ROLLBACK

## Before merge
- previous_main (pre-#170): `5d5081237aec99f5bedf1ab441bfbde41e724f51`
- previous production deploy: `6a86846deb6faf0008236690` (`commit` 5d508123)
- campaign content merge (#168): `f767554bcdfb7594c1e079cd39791a7c9770ef22` / deploy `6a8680f16e35db00084a9147`
- pre-campaign main: `4e1d3dbc5f9305bbdaabc03145e01ac91a39f3bd`

## Tripwires (revert the convergence PR, do not edit production by hand)
- Netlify publishes a SHA that is not main
- lead form does not persist
- sitemap/robots diverge from the closed graph
- noindex flipped to INDEX without a valid gate
- any of the six frozen #128 HTML pages changes
- PII/secret in artifacts
- checkout reachable with flags false
- event duplication or downstream inference from click
- critical 5xx / nav break

## Procedure
1. `git revert` of the convergence merge commit on main
2. Wait for the revert Netlify deploy
3. Re-validate graph, seven BOFU URLs, lead persist-first, Market Answer noindex
4. Keep before/after/reason in this file
