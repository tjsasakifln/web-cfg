# Projetos prontos: operação do experimento

## Situação de lançamento

Oferta: `https://confenge.com.br/projetos-prontos/`.
Catálogo de licenças: vazio. Nenhum produto ou preço aprovado foi recuperado.
O formulário recebe consultas de projeto pronto, adaptação, complementares e
desenvolvimento sob medida. A página não anuncia entrega imediata nem cobra.

Link dos primeiros acessos:
`https://confenge.com.br/projetos-prontos/?utm_source=confenge&utm_medium=owned&utm_campaign=projetos_prontos_piloto&utm_content=primeira_divulgacao`.
Use somente nos canais cuja divulgação estiver autorizada. A implantação não
envia campanhas. Não coloque nomes, telefones ou e-mails nos parâmetros.

## Consultar e atender interessados

Abra `https://confenge.com.br/ops/` e use a credencial institucional já existente.
Não envie o token por URL, mensagens ou arquivos públicos. A consulta e a
exportação exigem autenticação. A seção de projetos residenciais mostra o
interesse e os dados do terreno. O acesso a nome e contato é explícito e restrito.

A origem permanece `CONFENGE_WEB`, a família `ready_projects` e o ativo
`ready-projects`. O objeto `project_interest` guarda interesse, produto quando
existir, município/UF, medidas opcionais, situação do lote, dormitórios e prazo.
O processamento envia esse contexto ao fluxo comercial institucional existente.
Dados de ensaio são marcados `synthetic` e excluídos de contatos e resultados.

Use as etapas existentes: recebido, contatado, qualificado, proposta,
contratação ou perda. Qualifique somente após confirmar necessidade, local,
adequação, decisão e próximo movimento. Contratação não significa recebimento.
Mantenha proposta, valor contratado e valor recebido nos campos respectivos.
Pedido de licença e contratação de serviços adicionais são receitas distintas.

Exportação existente: `scripts/revops/export_leads.mjs`, com origem e autenticação
configuradas no ambiente privado. A projeção inclui os campos residenciais;
trate a saída como dado pessoal e não a adicione ao repositório. O painel
também oferece exportação autenticada. Em um checkout operacional autorizado,
com acesso ao armazenamento, use um destino privado:

```sh
CONFENGE_STORAGE_BACKEND=filesystem CONFENGE_STORAGE_DIR=/var/lib/confenge-web \
node scripts/revops/export_leads.mjs --kind real --family ready_projects \
  --out /CAMINHO_PRIVADO/projetos-prontos.jsonl
```

## Cadastrar o primeiro produto

1. Escolha um projeto original ou com licença que permita a comercialização e
   a adaptação pretendidas. Guarde documentos de autoria, direitos, escopo e
   profissional responsável no acervo privado. Projeto de cliente não pressupõe
   revenda permitida.
2. Complete e revise o pacote real. Um profissional habilitado precisa aprovar
   a versão exata e o hash dos arquivos, com as formalidades pertinentes. Prévia
   ou revisão automatizada não substitui essa aprovação.
3. Confirme programa, área, pavimentos, dimensões, condições do terreno,
   disciplinas, documentos, formatos, versão, prazo, inclusões, exclusões,
   licença de uma implantação, suporte, alterações e responsabilidades.
4. Aprove preço e condições. As hipóteses financeiras anteriores não são preço
   nem orçamento autorizados. Confirme também identidade empresarial e endereço
   do fornecedor nos termos específicos antes da compra.
5. Cadastre o registro em `data/projects-ready/catalog.v1.json` conforme o
   contrato de `runtime/project-commerce/README.md`. Use referências de aprovação
   sem documentos confidenciais. Publique amostras legíveis autorizadas e uma
   página própria do produto com todas as condições materiais. Inclua a rota no
   registro público e no mapa de navegação. Revise o HTML efetivamente servido.
6. Instale o ZIP completo somente na raiz privada de entregas, fora do release
   e de `_site`. Confira o hash, tamanho, permissões e integridade. Nunca use
   um link público permanente como entrega comercial.

O primeiro lançamento pago deve ter um único modelo tecnicamente preparado.
Novos modelos reutilizam catálogo e processo; não é necessário produzir um
catálogo extenso antes de testar demanda.

## Cobrança, pedidos, entrega e cancelamento

A área preparada é `/projetos-prontos/pedidos/`, sem indexação. Com modo desligado
ela informa a indisponibilidade e não carrega autenticação. O backend separado
usa `/api/web/project-orders` e `/api/web/project-orders-webhook`.

Consulte `runtime/project-commerce/README.md` para configuração de homologação,
identidade Firebase, regras, vendedor Mercado Pago, segredo de notificação,
termos e flags. Não reutilize a ativação de compras de créditos das ferramentas.
Não use chave de produção em ensaio. O ambiente de homologação deve provar
autenticação, pedido, notificação assinada, confirmação, download, repetição,
recusa, cancelamento, estorno e recuperação. Os testes locais usam respostas
controladas; não comprovam conexão com uma conta real.

O preço vem do servidor. O retorno do navegador não confirma pagamento.
Pedidos conservam termos aceitos, hash, versão do produto e histórico. Comprador
autenticado só acessa os arquivos do próprio pedido pago. Reembolso e disputa
suspendem o acesso conforme o fato conciliado, sem apagar registros.

Solicitações de atendimento e cancelamento recebem protocolo. Protocolo de
solicitação não é comprovante de estorno. A equipe consulta os pedidos pela CLI
privada de projetos, trata a solicitação no fluxo institucional, efetua o
reembolso no provedor quando devido e reconcilia o pedido. Preserve os direitos
do consumidor, inclusive arrependimento; download não significa renúncia.
Nas compras eletrônicas, mantenha atendimento e prazos legais, inclusive o
retorno às demandas previsto no Decreto nº 7.962/2013.

Para falha de entrega, confira o arquivo privado e seu hash antes de orientar
novo acesso. O comprador pode repetir o download autenticado da versão adquirida;
não altere silenciosamente o arquivo de uma versão. Atualização de projeto exige
nova versão e política explícita para compradores anteriores.

## Indicadores e avaliação

| Indicador | Fonte e limite |
|---|---|
| Visitas à oferta | Analytics existente por `/projetos-prontos/`, conforme consentimento; não representa todos os acessos |
| Contatos válidos | Registros realmente persistidos, excluídos sintéticos, inválidos e spam |
| Contatos qualificados | Qualificação registrada pela operação, separada do simples preenchimento |
| Propostas e contratações | Campos existentes e evidências do fluxo comercial |
| Pedidos, pagamentos e reembolsos | Relatório privado do módulo de projetos, conciliado com o provedor |
| Valores recebidos e a receber | Conciliação financeira e operação, sem tratar preço do catálogo como recebimento |
| Taxas e custo de aquisição | Valores efetivos do provedor e despesas autorizadas, registrados manualmente enquanto não houver integração |
| Horas de atendimento | Apontamento manual efetivo por caso, sem estimar como fato |
| Adaptação e complementares | Apuração separada da receita de licenças |

Dados ausentes permanecem não informados. Banco indisponível não vira zero.
Com captação sem venda, receita de licenças e disposição a pagar não estão
validadas. O relatório não inventa tráfego, contratos ou transações.

Registre a data da primeira publicação verificada da captação e a data em que
o primeiro produto ficou efetivamente disponível para compra. Avalie o
experimento ao atingir 30 compras mantidas após cancelamentos, 90 dias de oferta
publicada ou orçamento efetivamente aprovado, o que vier primeiro. Considere
separadamente os dias de disponibilidade para compra. Não há autorização de
anúncios, fornecedores ou desembolsos nesta implantação.

## Publicação, provas e reversão

A PR passa por testes de formulário, persistência, privacidade, fluxo comercial,
pagamento e entrega, além dos gates do repositório. A `main` publica pelo
workflow Netcup existente, com artefato exato, stage e promoção atômica.
O passo residencial pós-publicação confere a página e o registro sintético sem
e-mail e sem misturar testes com contatos comerciais. Os relatórios ficam nos artefatos da execução, sem tokens ou conteúdo pessoal
em arquivos e logs públicos.

Confira `/.well-known/build-info.json` e `/.well-known/runtime-info.json`, a rota
pública, a leitura restrita e o estado de compras após integração. A reversão
usa o procedimento já versionado em `docs/ops/ROLLBACK.md`. Preserve o diretório
de dados persistentes, Firestore, pedidos e arquivos privados. Desative novas
compras antes de reverter um backend que possua pedidos, mantendo conciliação e
acesso dos compradores até a conclusão do atendimento.

Não houve transação com dinheiro real como parte desta implantação. A autorização
para publicar não autoriza um pagamento real de ensaio.
