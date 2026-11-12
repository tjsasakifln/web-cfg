# Projetos residenciais: consulta, licença e entrega

Status: EXECUTE_NOW para implantação da captação; comercialização condicionada.
Decisão expressa do fundador em 12/11/2026. Frente: aquisição e receita.
Evidência inicial: contato recebido e qualificação; disposição a pagar somente
quando existir produto efetivamente disponível e compra mantida.

## Decisão e fronteiras

A seção `/projetos-prontos/` integra a CONFENGE e o agrupamento operacional
`building_engineering_documentation`, na intenção existente
`projetar_revisar_compatibilizar` e família de serviço
`engineering_projects_coordination`. O novo registro público `ready_projects`
identifica a consulta residencial. Não altera os cinco agrupamentos nem o B2G.

Licença de um modelo, adaptação ao terreno e disciplinas complementares têm
escopos e contratações distintos. A proposta pode reuni-los, identificando
entregas, condições, prazo e responsabilidades por escopo.

O catálogo inicial é vazio. A busca autorizada encontrou estudos de trabalho,
sem conjunto comprovado de direitos de comercialização, revisão profissional e
preço aprovado. Nenhum arquivo ou identificação de cliente entra na publicação.
R$ 1.190 é somente hipótese do estudo; R$ 15 mil não é autorização de gasto.

O formulário reutiliza o endpoint de lead, armazenamento protegido, proteção
contra abuso, idempotência, consentimento, atribuição e consulta OPS existentes.
O objeto `project_interest` é validado pelo servidor, incluído no material da
idempotência e encaminhado no contexto do contrato `confenge.inbound.v1`.
Warmbly mantém ação comercial, qualificação, proposta, faturamento e resultado.
Não há novo CRM nem envio outbound autorizado por esta implantação.

Assim como ADR-TOOLS-001, a nova fronteira de comércio é estreita: pedido de
licença, confirmação independente do provedor e direito de acesso ao arquivo.
Reutiliza os adaptadores de autenticação e Mercado Pago; flags, coleções,
catálogo, termos e permissões de projetos são independentes de créditos das
ferramentas. Nenhuma compra das ferramentas é ativada por esta decisão.

## Aprovação por produto

A publicação paga requer um produto real, documentação de origem e direitos,
revisão profissional vinculada ao hash e à versão, preço e termos aprovados,
amostras reais publicáveis, escopo completo, conta institucional correta e
entrega protegida verificada. Preenchimento do JSON não substitui evidência nem
aprovação humana. O arquivo técnico completo fica fora de `_site` e do release.

## Medição e publicação

Visitas consentidas usam a medição existente por caminho; o denominador de
contatos usa registros persistidos, excluindo provas sintéticas. Proposta,
contrato, pagamento e acesso aos arquivos são acontecimentos independentes.
Valores, pessoas, município e dimensões não são enviados a analytics.

A avaliação ocorre ao primeiro de: 30 compras mantidas após cancelamentos,
90 dias de oferta publicada ou orçamento realmente aprovado consumido. Registrar
separadamente início de consultas e início da disponibilidade para compra.
Captação sozinha mede procura e orçamento solicitado, sem comprovar preço aceito.

Release por PR revisada, `site-ci`, pacote exato, stage e promoção Netcup.
Prova controlada verifica o formulário servido, persistência, leitura restrita
e encaminhamento, sem e-mail e sem misturar ensaios com demanda real.
Reversão conserva `/var/lib/confenge-web` e Firestore. Desligar novas compras
não elimina a conciliação e o atendimento de pedidos existentes.

## Critérios

1. Página verdadeira, navegação, acessibilidade, canonical e sitemap coerentes.
2. Contato confirmado somente após armazenamento durável; dados editados não
   reutilizam silenciosamente um protocolo anterior.
3. Leitura e exportação restritas; dados de qualificação chegam à operação.
4. Pagamento pendente, preço adulterado, callback inválido/repetido e comprador
   incorreto não liberam arquivo; reversões preservam histórico e retiram acesso.
5. Versionamento público e runtime conferidos depois da promoção.

Cem consultas reutilizam o mesmo contrato e tornam comparáveis interesses,
qualificação e resultados, sem produzir cem páginas ou filas paralelas.
