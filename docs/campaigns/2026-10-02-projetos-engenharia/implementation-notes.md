# Notas de implementação — projetos de engenharia

Estado: em execução
Decisão: `P0 / EXECUTE_NOW`
Frente executiva: `INBOUND_ENGINE / REVENUE_NOW`
Horizonte de primeira evidência: 30 dias
Alavancas: receita, confiança, cliente e distribuição orgânica.

## Linha de base e rollback

- Repositório canônico: `web-cfg`.
- Branch de produção: `main`.
- Versão pública preservada antes da mudança: commit `aa276d0546016144e0b96441248c0d6aa25b24d9`.
- Artefato público de linha de base: `6e71eee` (prefixo registrado pelo endpoint de build da produção).
- Autoridade de runtime: Cloudflare na borda, nginx e aplicação Node no Netcup.
- Rollback: controlador versionado em `deploy/netcup/run_bundle_control.py`, usando o bundle anterior preservado pelo pipeline.

## Hipótese comercial

Se a superfície pública tornar projetos de estruturas, instalações, infraestrutura e coordenação multidisciplinar imediatamente reconhecíveis, e cada página de alta intenção expuser escopo, entradas, interfaces, entregáveis e responsabilidade antes do contato, compradores técnicos terão menos incerteza para solicitar avaliação do escopo. A conversão será medida pelos eventos de CTA, WhatsApp, e-mail e captura de lead já governados no site.

## Trabalho autorizado

- Reconstruir a primeira dobra e a arquitetura de informação sem apagar frentes comerciais válidas.
- Criar hubs de práticas e páginas de alta intenção apoiados em conteúdo próprio e verificável.
- Preservar captura, analytics, eventos, segurança do formulário e a vertical protegida de obras públicas.
- Publicar diretamente pelo pipeline de produção depois dos gates locais e da revisão adversarial.

## Limites de autoridade

- `web-cfg` permanece autoridade de aquisição pública e entrada de lead.
- `extra-cli` permanece autoridade de verdade operacional.
- Warmbly continua autoridade para ações comerciais e destino de automações.
- Nenhum limite de sistema, marca ou domínio foi transferido por esta campanha.

## Critério de encerramento

Esta nota só passa a `concluído` quando o commit final estiver servido por `https://confenge.com.br/`, os checks de CI e deploy estiverem verdes e a validação pós-publicação confirmar rotas, assets, navegação, CTAs, captura, eventos, metadados, sitemap, robots, 404 e fluxos críticos.
