# Comunicação institucional, competência e conversão — 2026-10-03

- **Decisão:** `EXECUTE_NOW`
- **Frente executiva:** comunicação institucional e comercial
- **Alavancas:** confiança, cliente e receita
- **Tempo até evidência:** na geração e publicação verificadas desta campanha

## Diretriz vigente

A CONFENGE se apresenta como empresa que elabora projetos e serviços de
engenharia para edificações, infraestrutura e indústria. A liderança técnica
aparece com formação e trajetória reais, sem reduzir a organização a uma única
pessoa ou inventar equipe, clientes, vínculos ou resultados.

Esta decisão substitui regras comerciais e editoriais anteriores que imponham
ressalvas promocionais, rótulos de evidência em cada afirmação institucional,
estrutura de classificados ou posicionamento limitado a complementar trabalho
de terceiros. Avaliar a comunicação por função para o comprador, coerência com
o serviço e veracidade. Fontes, permissões, privacidade, integridade dos
registros, condições materiais, responsabilidade técnica e recuperação de
versão permanecem obrigatórias.

## Aplicação nesta frente

`data/site/credential-registry.json` continua sendo a autoridade para fonte,
data, permissão de projeção e revogação de cada fato. O gerador de credenciais
mantém esse controle e os testes fail-closed, mas deixa de imprimir rótulos
automáticos de evidência ao lado de cada item na comunicação institucional.
As fontes oficiais seguem disponíveis nos registros internos e onde a consulta
direta ajuda o comprador, como o CNPJ.

O catálogo legado `data/site/proof.json` deixa de autorizar “Método e limites
publicados” e “Como conferir credenciais e limites” como prova promocional.
O histórico do Git preserva esse registro e a atualidade das fontes permanece
revalidável pelo registro canônico.

## Proteções preservadas

- Fatos retidos, credenciais vencidas, revogadas ou privadas continuam fora da
  projeção pública.
- Números de registro profissional, processos ativos, nomes de clientes e
  resultados não autorizados continuam protegidos.
- ART, nota fiscal, responsabilidade profissional, condições materiais e
  confirmação técnica antes da aceitação permanecem regras operacionais.
- `/confianca/` permanece como página de informações institucionais; Empresa e
  liderança técnica conduzem a apresentação comercial. URLs úteis são preservadas.

## Integração e verificação da campanha

Home, Empresa, liderança, processo, 13 páginas de projetos, seis serviços de
engenharia e seis aberturas de serviços de contratos públicos foram revisados.
Os geradores responsáveis, as chamadas comerciais e o rodapé acompanham o
posicionamento institucional. Desenhos demonstrativos descrevem problemas e
entregas de engenharia; não são apresentados como obras de clientes.

O build final local reuniu 610 arquivos públicos e 249 HTML, sem achados na
auditoria do artefato. Os testes editoriais (151) e das ferramentas no navegador
passaram. O ambiente local é Windows/Node 24; a publicação exige os gates
protegidos Linux/Node 22, inclusive os controles de permissões do armazenamento.
Medições automáticas de geometria não representam sessões humanas de compra.

Os dois conteúdos factualmente aprovados em agosto preservam autor, data,
fontes, hash e preview da decisão humana original. Um adendo estrito registra
somente a troca de saudação de Tiago para CONFENGE em dois campos comerciais;
qualquer outra alteração material continua invalidando a aprovação.

O teste de contato em produção é sintético, autenticado e vinculado ao SHA
publicado. Sua mensagem de QA tem destinatário fixo e somente pode ser enviada
após persistência e handoff confirmados. Não participa de métricas comerciais,
cadências, cobrança ou disparos ordinários. A verificação de recebimento será
feita pelo assunto único na caixa existente.

## Recuperação preparada antes da promoção

Na primeira execução protegida da PR #729, os gates recusaram uma exportação
GSC incidental de teste e a ausência das quatro rotas editoriais aprovadas no
índice de sitemaps. A exportação foi restaurada byte a byte ao baseline; o
gerador registra novamente cada segmento aprovado que deixe de estar vazio.
Não houve nova coleta nem alteração de métricas comerciais nesta correção.

Os seis artigos de medição preservam a revisão técnica de 19 de setembro e
os fingerprints históricos. O comparador projeta apenas a saudação autorizada
no link WhatsApp da CONFENGE; destinatário, mensagem restante, texto visível,
fatos e fontes continuam vinculados ao hash. Os verificadores de texto de
serviços passaram a usar um parser HTML, e o perfil técnico recebeu os três
canais diretos no fechamento. Essas correções seguem os mesmos gates
protegidos antes da publicação.

A segunda execução já encerrou o CodeQL sem alertas. Foram conciliadas as
referências derivadas do catálogo corporativo e os testes BOFU de navegação e
pontuação: a página de obras públicas volta a oferecer acesso direto aos
documentos e condições existentes. A promoção focal de medições na home da
issue #390 fica preservada como histórico e supersedida pelo portfólio de
projetos; a transferência canônica continua no hub e no artigo correspondente.
As seis páginas B2G revisadas recebem novo checkpoint de integridade pela
cadeia existente, sem recapturar aprovações factuais nem o canário já válido.
O novo índice exige repetição da medição real de primeira tela.

Baseline servido: `c7d2d0a42ebb531efc0547b34f2f38b4077ee45e`, publicado pelo
[release 37095012142](https://github.com/tjsasakifln/web-cfg/actions/runs/37095012142).
O pacote imutável foi recuperado e seu SHA-256 confirmado:
`dd7a67213bac6e62d6ed0ccb001b890e8c07d934f03923c538e8303783397dac`.
O fluxo protegido verifica o predecessor antes da troca atômica e conserva
o release e seu controlador para rollback. A recuperação usa o controlador
verificado da versão publicada, `run_bundle_control.py --operation rollback
--rollback-target c7d2d0a42ebb531efc0547b34f2f38b4077ee45e
--expected-current <SHA_PUBLICADO>`, conforme `docs/ops/ROLLBACK.md`.

Status de publicação desta campanha: **PENDING_PROTECTED_RELEASE**. Este
registro substitui a comunicação comercial das campanhas anteriores, sem
apagar suas decisões, evidências históricas ou limitações observadas. Não há
afirmação de ganho de conversão sem dados posteriores à publicação.


## Conciliação final dos contratos de interface

A terceira execução protegida apontou dois contratos antigos de apresentação:
credenciais da home antes localizadas no herói e textos literais da triagem.
Os testes agora conferem as credenciais reais na seção Empresa, respeitam a
projeção pública autorizada da identidade e validam o contexto incompleto,
os canais reais e as condições técnicas, sem exigir as frases substituídas.
O formulário, sua persistência, consentimento e controles permanecem cobertos.

A revisão técnica independente preservou a avaliação de imóvel como caminho
com finalidade, data-base, método e documentos, conforme taxonomia existente,
condicionando habilitação/ART ao ato e à atribuição. Sua triagem oferece
WhatsApp e e-mail próprios. A revisão não habilita produto retido, preço,
prazo ou prova de cliente. Os serviços explicam o pedido de proposta com
contexto disponível e reservam o canal de documentos confidenciais.

A home conserva nove destinos editoriais visíveis, agora com atribuição
explícita. O auditor canônico apurou 210 chamadas em 31 rotas de captura.
Descoberta editorial não é tratada como promoção primária; o gate de excesso
continua contando botões primários e formulários compartilhados ou legados,
com negativos independentes para excesso de ambos. A geometria exige 44 px
de alvo também nos links de disciplinas e coordenação. Os testes de eventos,
navegação sem JavaScript e fragmentos usam os destinos efetivamente exibidos.
A medição de primeira tela será novamente vinculada ao checkpoint final limpo.


A navegação final foi medida sobre as 113 rotas indexáveis: nenhuma órfã,
19 páginas em um salto, 78 em dois e 15 em três, além da home; média de
1,9469026548672566 e máximo de 3. A medição histórica de agosto cobria
75 rotas, com uma órfã e máximo de 5; sua média de 1,8243243243243243 não
compara o mesmo conjunto. O novo baseline deriva do censo expandido, conserva
a medição anterior e os bytes de origem em navigation-depth.json, mantém
zero órfãos e as quatro tarefas verificadas e estreita o máximo de 5 para 3.
O rodapé isolado do gerador acompanha a navegação institucional atual; as
condições materiais continuam nas explicações dos serviços e na proposta.

A auditoria canônica do contrato de redação foi recapturada no checkout limpo
8832d49612ddb9b2bfeeb18d4f38daf0accfe960: 23 rotas, 26 trechos de
condições, zero violações e zero prova social estruturada; as 54 entregas,
as oito ofertas públicas e as 120 cláusulas únicas permanecem intactas.
O registro de 25 condições é conservado como histórico. Não houve mudança
no scanner, nos limites de aceitação nem no estado de revisão humana.

A quarta execução protegida também encontrou contratos literais anteriores
à campanha nos artigos. A comparação dos três artigos de origem de clique
projeta somente a saudação institucional, a frase exata de orientação sobre
documentos e o wordCount derivado, que é recalculado independentemente.
Quantidade de ocorrências, destinatário, restante da mensagem, título,
corpo técnico, fontes e canonical seguem pinados; os negativos rejeitam
conteúdo novo, contagem inventada e promessa de envio automático.
Os nove artigos de orçamento passam a verificar a ação de proposta real,
o WhatsApp institucional, a orientação de material confidencial e envio
reservado e o formulário no pilar correto. Datas e exemplos técnicos
permanecem verificados. A distinção entre empresa contratada e órgão público
é exigida no bloco de responsabilidade, com negativo para a remoção de cada
parte. Os 18 testes orgânicos passaram sem alterar os artigos publicados.
Os quatro testes do caso demonstrativo da home e o gate de adequação da
oferta também passaram, usando as competências efetivamente exibidas.

A biblioteca de entregas mantém saída concreta e finalidade no bloco próprio,
competências antes da vertical de obras públicas e abertura responsiva com CSS
crítico. O CTA do herói chega ao formulário com confirmação dependente de
persistência e atribuição sem PII; os negativos cobrem perda dessas propriedades.
Os 51 testes da biblioteca e modelos passaram. As mensagens dos modelos só
trocam a saudação para CONFENGE, mantendo intenção, assunto, preço e número.
O inventário exige 46 arquivos, 28 bibliotecas e os mesmos 16 handlers, incluindo
explicitamente qa-email como biblioteca; seus três testes passaram.
