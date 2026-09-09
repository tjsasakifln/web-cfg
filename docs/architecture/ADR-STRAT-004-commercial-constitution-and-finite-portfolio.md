# ADR-STRAT-004 — Constituição comercial e portfólio finito

- **Status:** Accepted
- **Date:** 2026-09-05
- **Decision owner:** CONFENGE
- **Campaign:** `CONFENGE_MV_CAMPAIGN=01`
- **Amends:** ADR-STRAT-002 apenas na tese de categoria e na linguagem de entrada

## Contexto

A taxonomia anterior tratava cinco núcleos como se fossem ao mesmo tempo
mercado, disciplina, tipo de trabalho e possível navegação. Isso era útil para
separar responsabilidade interna, mas fraco para o comprador: uma pessoa chega
com uma situação — projeto incompleto, infiltração, disputa, documentação de SST
ou contrato público — e não com o nome de um núcleo.

O catálogo B2G vigente possui 54 entregáveis e dois contêineres, preços e gates
próprios. Expandir esse registro por cópia criaria duas verdades e poderia
canibalizar a vertical já publicada.

## Decisão

### Emenda vigente de 2026-09-09

Decisão expressa do fundador: EXECUTE_NOW na campanha de comunicação pública
vinculada à #611. Engenharia e projetos atendem necessidades públicas e privadas;
o cadastro operacional incompleto pede apuração, não recusa pública automática.
Estados de maturidade e lacunas internas não são conteúdo obrigatório de oferta.
As entregas, fases, autoria e responsabilidade profissional continuam verdadeiras.

Preço autorizado exige condições materiais claras, contato contextual funcional
e eventos que descrevam o que ocorreu. Não exige por si só um formulário.
Formulários ativos preservam consentimento, atribuição e persistência comprovada;
abrir um canal direto não significa pedido recebido. Preço, margem e checkout
continuam autorizações distintas. Esta campanha pode integrar os registros e
publicar pelas proteções existentes, substituindo a exclusividade operacional
temporária de MV-09. A vigência desta emenda alcança validadores e geradores.

### Decisão estrutural preservada

CONFENGE é a única marca pública e sua categoria é **Engenharia, Perícias e
Inteligência Técnica**. Obras públicas e B2G permanecem uma vertical protegida,
não a categoria corporativa inteira.

A autoridade comercial tem duas camadas:

1. cinco núcleos operacionais internos, preservados em
   `CONFENGE_CORPORATE_TAXONOMY/1.0.0` para ownership, conflito, sensibilidade e
   medição;
2. famílias públicas por situação e decisão, em
   `CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0`, que resolvem para uma família de
   serviço, ofertas finitas ou `NEEDS_CONTEXT`/GAP.

Persona é somente exemplo de audiência. Não decide rota. O catálogo
multivertical referencia os 54 entregáveis e quatro ofertas de checkout B2G nas
fontes existentes; não duplica IDs, nomes nem preços. Uma demanda nova nunca
cria SKU automaticamente.

Atendimento é nacional como disponibilidade comercial. Responsabilidade
técnica só é assumida depois de confirmar objeto, local, campo, atribuições,
registro ou visto, pessoa jurídica e ART aplicável. A ausência de evidência de
credencial ou capacidade mantém a oferta retida.

Autorização do fundador para experimentar preço, validação posterior de margem,
autorização para exibir preço e autorização de checkout são estados separados.
Nenhum deles é inferido do outro.

## Consequências

- Home, navegação e páginas de serviço devem falar primeiro da situação do
  comprador; nomes de núcleo podem aparecer como organização secundária, nunca
  como obrigação de copy.
- As campanhas MV-04 a MV-07 consomem o contrato sem inventar famílias, ofertas,
  preços, prazos ou claims.
- A integração dos registros compartilhados e a publicação seguem a campanha
  autorizada pelo fundador e as proteções do repositório.
- B2G mantém rotas, catálogo, preço, captura e equity até decisão URL-exata.
- `web-cfg` não recebe CRM, fila, cadência, SMTP ou dispatch; Warmbly continua
  dono da ação comercial.
- Reverter os arquivos desta decisão não altera HTML, dinheiro, captura, DNS ou
  produção.

## Alternativas rejeitadas

- Expor os cinco núcleos como única linguagem de navegação.
- Organizar rotas por persona.
- Acrescentar novos itens ao catálogo 54/54 sem o owner do registro.
- Publicar toda capacidade modelada como oferta ou money page.
- Usar “atendimento nacional” como prova de habilitação irrestrita.
- Tratar preço autorizado pelo fundador como margem validada ou checkout.
