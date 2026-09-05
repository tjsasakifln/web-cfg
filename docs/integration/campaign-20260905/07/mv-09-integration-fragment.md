# Fragmento de integração para MV-09

Este arquivo registra alterações necessárias fora do `WRITE_SET` da MV-07. Ele não autoriza merge, deploy nem edição concorrente. A MV-09 deve reaplicar a intenção contra seu SHA de integração e manter somente o que continuar válido.

## 1. Registrar o entregável e o nome

Arquivos owner:

- `data/commercial/deliverables-registry.v1.json`
- `data/commercial/offer-naming.v1.json`
- contratos de página/copy que derivem o catálogo

Mudança:

- adicionar o 55º entregável como `CFG-D55`;
- nome público: `Planejamento Técnico de Licitações de Obras Públicas`;
- núcleo: `public_works_b2g`;
- rota: `/planejamento-tecnico-licitacoes-obras-publicas/`;
- estado: `EXECUTE_NOW` para modelagem/publicação controlada e `VALIDATE` antes de escala;
- preço público `null`; proposta por escopo e evidência;
- importar o contrato de `public-candidates/.../offer-contract.json`, sem copiar campos internos para copy.

Não renumerar `CFG-D01`–`CFG-D54`, não converter pacote/plano em entregável e não publicar preço inventado.

## 2. Criar a rota candidata

Arquivo owner: `planejamento-tecnico-licitacoes-obras-publicas/index.html` e assets compartilhados estritamente necessários.

Usar `public-copy.md` como copy-base, preservando:

- primeiro bloco “Para o ente que prepara a contratação”;
- divisor de papéis antes da lista de módulos;
- links da audiência licitante para `/bid-room-licitacoes-obras/`, `/diagnostico-pre-licitacao/` e `/servicos-obras-publicas/`;
- módulos, matriz, responsabilidades, ART/NF e limites antes da ação terminal;
- FAQ sobre DFD/DOD e âmbito das INs federais;
- `Service` JSON-LD com provider CONFENGE, área Brasil e nenhuma promessa de êxito;
- canonical self, `index,follow`, idioma pt-BR e breadcrumbs;
- nenhum upload no contato inicial.

Não criar portal, gerador automático, DataLake, sistema de processos ou superfície SmartLic.

## 3. Declarar família pública e sitemap

Arquivo owner: `data/organic/public-family-registry.json`.

Adicionar família route-exact, sem absorvê-la na família antiga de pilares para empresas:

```json
{
  "id": "public-contracting-planning",
  "visitor_job": "Organizar o pacote técnico de uma contratação de obra ou serviço de engenharia antes da publicação, sem transferir decisões do ente.",
  "profile": "commercial_content",
  "terminal_action": "capture_form",
  "match": {
    "routes": [
      "/planejamento-tecnico-licitacoes-obras-publicas/"
    ]
  },
  "gate_coverage": {
    "conversion": "full",
    "copy": "full",
    "accessibility": "full"
  },
  "declared_at": "2026-09-05",
  "owner_issue": 588,
  "debt": [],
  "index_evidence": {
    "substrate": "first_party_publication",
    "not_applicable": [
      "citable_source"
    ],
    "reason": "Oferta técnica de primeira parte; as normas oficiais sustentam o enquadramento, mas a página descreve o serviço da própria CONFENGE.",
    "authority": [
      "docs/integration/campaign-20260905/07/public-candidates/planejamento-tecnico-licitacoes-obras-publicas/legal-research.md",
      "issues #587 e #588"
    ],
    "declared_at": "2026-09-05",
    "owner_issue": 588
  }
}
```

Adicionar a URL exata a `sitemap.xml`/gerador de sitemap sem remover nenhuma rota listada em `b2g-conservation-baseline.json`.

## 4. Captura e handoff

Owners: campanha/PR da #580 e integração MV-09.

Campos públicos mínimos:

- tipo de ente e esfera;
- tipo de obra/serviço;
- estágio do planejamento;
- peças existentes e pretendidas;
- origem do recurso/regulamento, se conhecidos;
- prazo objetivo;
- necessidade de campo: sim/não/a confirmar;
- existe matéria/certame relacionado: sim/não/não sei;
- autorização para contato e para combinar canal seguro.

Não coletar em analytics nem em query string: nomes, contato, texto livre, partes, número do processo/certame, arquivo, conteúdo sigiloso ou dado pessoal. Esses dados seguem apenas no payload protegido necessário ao retorno, de acordo com a implementação da #580; conflito detalhado ocorre no canal protegido.

Atributos técnicos mínimos:

```text
source=CONFENGE_WEB
nucleus_id=public_works_b2g
offer_candidate_id=planejamento_tecnico_licitacoes_obras_publicas
deliverable_id=CFG-D55
landing_family=planejamento-tecnico-licitacoes-obras-publicas
next_state_profile=service_fit_and_conflict_review
outbound_eligible=false
auto_send=false
smtp_authorized=false
```

Recibo visível: “Recebemos o contexto. Primeiro verificaremos aderência, escopo e conflito. Se for possível avançar, combinaremos o canal seguro para os documentos necessários.” Não prometer proposta, aceitação, prazo de resposta novo ou início.

## 5. Corrigir a colisão `/servicos/` sem apagar B2G

Hoje `_redirects:35`, `:47` e `:62` enviam `/servicos`, `/servicos.html` e `/services` para `/servicos-obras-publicas/`.

Se `/servicos/` corporativo for publicado:

| URL legada | Decisão | Destino |
| --- | --- | --- |
| `/servicos` | MIGRATE | `/servicos/` |
| `/servicos.html` | REDIRECT | `/servicos/` |
| `/services` | REDIRECT | `/servicos/` |
| `/servicos-obras-publicas/` | KEEP | ela mesma, sem redirect |

O runtime deve resolver `/servicos/` como 200/self-canonical. O novo hub corporativo deve ligar diretamente para `/servicos-obras-publicas/` com rótulo “Obras Públicas e B2G”. Nunca canonizar o hub B2G para o hub corporativo.

## 6. Portas de navegação e separação de papéis

### Home/shared shell

Mesmo com hero corporativo, manter um caminho visível para “Obras Públicas e B2G” no header, no conjunto de núcleos ou no primeiro bloco de escolha. A rota B2G deve estar a no máximo duas ações a partir da home.

Preservar no primeiro contato B2G ao menos estas situações em português direto:

- “Preparar edital e proposta” para empresa licitante;
- “Resolver problema em contrato público” para empresa contratada;
- “Organizar a operação no mercado público” para rotina B2G;
- “Preparar a contratação de obra pública” para ente contratante.

### `/servicos-obras-publicas/`

Adicionar, sem reescrever o H1 ou o catálogo existente:

> Esta página atende empresas que disputam licitações ou executam contratos de obras públicas. Você representa o ente que está preparando a contratação? Veja o Planejamento Técnico de Licitações de Obras Públicas.

O link do segundo período aponta para a nova rota. A frase precisa aparecer antes dos cards que podem ser confundidos com a nova oferta.

### Nova rota

Antes dos módulos, mostrar o bloco inverso:

> Sua empresa quer disputar o edital ou executar o contrato? Esta não é a oferta para o seu papel. Veja o apoio para edital, proposta e contratos de obras públicas.

## 7. PNCP

Se o bloco numérico atual de `index.html:125,282,314,332,350` for mantido na home corporativa, envolvê-lo numa seção “Obras Públicas e B2G”. Se for movido, preservar na vertical:

- universo/denominador;
- objeto classificado;
- geografia;
- data de corte;
- método/limites;
- links oficiais PNCP;
- ressalva de que o recorte não representa o país inteiro nem resultado de cliente.

## 8. Analytics, teste e gate

Adicionar a rota aos seletores de build/teste somente depois da família pública e da captura existirem. Rodar:

```text
python3 -m pytest tests/campaigns/mv-07 -q
python3 scripts/site/test_public_plain_language.py
npm run test:inbound-gates
npm run validate:seo
npm run test:nav
npm run test:conversion
npm run build
```

Antes de integrar, a MV-09 deve ligar `python3 -m pytest tests/campaigns/mv-07 -q` a um check obrigatório da PR. A execução apenas manual não constitui o gate de conservação: mudanças futuras em home, `/servicos/`, rotas B2G, ferramentas ou dados precisam acionar essa suíte no CI.

Após build, validar 390×844 e 1366×768: primeiro bloco, divisor de papéis, foco, formulário, ausência de overflow e leitura sem jargão interno. Produção só depois do merge/deploy autorizado pela MV-09, com comparação de SHA e rollback URL a URL.
