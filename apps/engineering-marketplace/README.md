# Serviços de engenharia CONFENGE

Aplicação privada baseada em Mercur **2.4.1**, Medusa **2.22.3** e Node
**22.22.0**, integrada ao site em `/profissionais/`. O frontend existente
consome somente as operações declaradas pelo gateway de mesma origem.

O serviço acrescenta o ciclo de engenharia: solicitação, proposta com escopo,
valor, comissão e prazo, aceite de uma revisão específica, pagamento,
entrega, aceite da entrega e uma avaliação de 1 a 5. Perfil preenchido não é
aprovação profissional. O operador revisa o registro e as atribuições antes
de publicar; editar o perfil retira essa aprovação até nova conferência.

## Estado de entrega

A configuração distribuída deixa a operação e os pagamentos desabilitados.
Os testes locais não enviam cobranças, não validam uma conta Stripe real e
não comprovam repasse bancário. A implantação exige o serviço privado e seus
bancos, configuração das contas e homologação descrita no runbook.

- [Decisão e comparação de repositórios](../../docs/marketplace/repository-selection.md)
- [Pagamentos e conciliação](../../docs/marketplace/payments.md)
- [Instalação, operação e reversão](../../docs/marketplace/operations.md)
- [Decisão de arquitetura](../../docs/architecture/ADR-MARKETPLACE-001-engineering-services.md)

## Desenvolvimento e verificação

Use Node 22.22.0 e uma cópia local de `.env.example`. Dados e chaves reais
ficam somente no ambiente privado. O launcher `scripts/medusa.cjs` aplica a
opção de desativação da telemetria do framework antes de carregar sua CLI.

```sh
npm ci --legacy-peer-deps --ignore-scripts
npm run typecheck
npm test
npm run build
npm run migrate
npm run seed
npm run dev
```

`seed` cria ou reutiliza apenas a loja em BRL, o canal dedicado e a chave
publicável do Store API. Não instala produtos, contas, perfis ou avaliações
de demonstração. A chave `pk_` emitida é colocada no gateway pelo operador.

`npm run test:integration` exige `NODE_ENV=test`,
`MARKETPLACE_INTEGRATION_TEST=1`, PostgreSQL local em banco com nome terminado
em `_test`, pagamentos desabilitados e ausência de chave Stripe. A suíte
exercita a API Mercur real com clientes e prestadores fictícios restritos ao
banco descartável. Ela nunca deve apontar para o banco operacional.

Os testes do gateway e do navegador ficam na raiz do repositório:

```sh
npm run test:marketplace
CHROME_PATH=/caminho/do/chrome npm run test:marketplace:browser
```

## Fronteiras financeiras

O Mercur fornece identidades, contas de prestadores e cadastro financeiro
Express. A extensão usa Stripe Checkout com valor inteiro em centavos,
cartão em BRL e destino na conta conectada. A divisão ocorre após a cobrança;
o crédito bancário segue o processador. Não há promessa de retenção até a
entrega. Transferências e liquidações nativas de comércio permanecem
desativadas para impedir uma segunda movimentação sobre a mesma contratação.

Retorno do navegador não confirma pagamento. O webhook assinado e a consulta
autenticada ao processador verificam valor, conta, moeda, revisão, comissão,
captura, reembolsos e contestações. Falhas ou criação interrompida exigem
conciliação, sem gerar uma segunda cobrança automaticamente.

## Licença e atualização

O core reutilizado é MIT. O aviso upstream está em `LICENSE-MERCUR.txt`.
Versões e dependências estão fixadas no `package-lock.json` deste diretório;
o site continua com instalação separada. Uma atualização do core deve repetir
o teste integrado de autenticação, relações entre prestador e membro,
aprovação e workflow financeiro. Não atualizar automaticamente para canary.
