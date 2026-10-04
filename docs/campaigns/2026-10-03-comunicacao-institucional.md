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

Status deste checkpoint de implementação, anterior ao release: **PENDING_PROTECTED_RELEASE**. Este
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

O salto nativo para contato revelou deslocamento causado pelas estimativas de
altura da home anterior. A sequência institucional agora é renderizada sem
essas estimativas: a matriz passou em 224 combinações de rota e largura, de
320 a 1920 px, mais 14 verificações sem JavaScript. O contrato de publicação
exige a abertura de engenharia, nove caminhos atribuídos e a ação de proposta
até um formulário com persistência, AJAX e atribuição sem PII. Seus 20 testes
passaram, incluindo negativos para atributo parecido, evento no filho e
formulário incompatível. Os contratos SST verificam a orientação real sobre
material reservado, as datas estruturadas e o item visível na home; os 10 e
12 testes focados passaram, mantendo os limites técnicos e comerciais.
A medição de primeira tela vinculada a b7b5d08 é conservada como histórico
antes da medição deste novo checkpoint de CSS.

Cinco entradas contextuais de SST conservam evento e intenção declarados na
home, serviços, entregas, triagem e liderança. O perfil chega ao contato do
hub; as demais entradas explicam o serviço no hub, que mantém as quatro
frentes PGR e três canais terminais atribuídos. O teste usa o conteúdo principal
e a âncora real, rejeitando substituição pelo rodapé e metadados em filhos.
Os seis testes de integração e a cadeia completa de correção SST passaram.
O auditor canônico registra 211 chamadas declaradas nas mesmas 31 superfícies
com formulário: a diferença é o link existente de SST em Entregas, agora
atribuído. O histórico de 210 permanece na nota e todos os controles materiais
de next-state/v1 e a verificação de regeneração passaram.
O template do catálogo público também conserva essa atribuição de SST,
byte a byte com a âncora publicada; seu check registra 54 entregas e oito
ofertas sem drift. A suíte completa de contratos comerciais passou depois
desta conciliação, sem nova alteração de HTML, CSS ou medição de primeira tela.
As quatro novas entradas contextuais de SST também declaram a posição do
clique; a home já conservava home_services. O helper exige a posição exata
por ID e rejeita sua remoção. Catálogo e inventário acompanham o metadado;
os 35 testes da biblioteca, seis de integração SST e o gate next-state/v1
passaram. A evidência limpa de 33c0364 fica preservada antes da recaptura
do novo checkpoint de HTML.

O checkpoint de quantitativos restaura duas entradas demonstrativas canônicas,
de edificação e infraestrutura, com suas memórias, quantidades e oito CSVs.
O renderer conserva a seção técnica e rejeita sua retirada da fonte ou do HTML.
Reformas e escopos pequenos continuam acolhidos na proposta. Os cenários de
compra agora verificam as modalidades e condições na estrutura institucional,
com negativos para perda de responsabilidade, aceitação parcial e demanda
pequena: 25 testes passaram. O renderer passou em seis testes e 12 subtestes.
As três larguras de 320, 390 e 1440 px abriram os oito arquivos e exibiram os
dois recortes sem overflow. O build composto contém 610 arquivos sem findings.

O gate de interface de Entregas confere o rodapé inteiro contra o mapa de IA
vigente e a única âncora dominante de cada serviço privado. Exige alvo único,
posição, family/asset, exatamente um evento com destino form e ausência de PII;
19 mutações de âncora/evento e cinco de rodapé são rejeitadas. A verificação
independente em Chrome aprovou 36 findings, com zero erros e zero violações
axe. Os 26 testes de excelência, 440 de copy e 1942 de primeira tela passaram.
Os insumos das 25 rotas medidas permanecem iguais aos de d4071b5; estes ajustes
não constituem nova medição nem conclusão de publicação.

O detector de prosa agora distingue os nomes repetidos dos oito arquivos,
que pertencem a dois contextos técnicos distintos. Só a rota de quantitativos
admite essa leitura na seção exemplos-conferiveis: quatro CSVs canônicos, alvos exclusivos,
contexto único e texto exclusivamente de arquivos. Prosa repetida continua
reprovando; os negativos também recusam alvos compartilhados, arquivo inválido,
nome ausente, inventário duplicado, metadado perdido e prosa escondida. O scan
das 248 páginas fonte terminou sem findings. A extração de JSON-LD SST usa o
parser do navegador e rejeita tags parecidas e entidades duplicadas; a mutação
de atributo do contrato da home preserva seu teste sem simular escape HTML.
Os 31 testes combinados passaram. Esses ajustes respondem aos alertas estáticos
e ao mesmo finding dos dois pipelines; não alteram a superfície pública.

O gerador do hub de serviços agora conserva os seis atributos de intenção SST
já presentes no HTML aprovado. O check de geração e os seis testes de integração
SST passaram; esta correção de fonte não altera os bytes das páginas públicas.

Após o merge protegido, os testes INB-08 revelaram que `origin/main` era uma
referência móvel usada como origem dos artigos. A comparação agora usa o
predecessor imutável `c7d2d0a42ebb531efc0547b34f2f38b4077ee45e`, exige sua
ancestralidade e impede que as emendas de apresentação virem a própria linha
de base. As máscaras e contraprovas de mudanças materiais permanecem iguais;
nenhuma página pública ou aprovação editorial foi alterada nesta correção.
O mesmo leitor preserva os atributos #153, hrefs primários e janelas históricas
de três contratos BOFU; usos de `origin/main` para diff corrente permanecem.
As quatro suítes focadas passaram em 68 testes com main já avançado.

A publicação protegida de `0bacc72b7d63a449961442a32d8afab3e9168d23`
ocorreu em 2026-10-04 às 02:54:07 UTC. A revisão posterior identificou falhas
visuais que os gates anteriores não mediam: texto interno de SVG reduzido,
molduras deslocadas e conflito de padding em ferramentas. O censo cobriu as
550 páginas efetivamente servidas, em 390 e 1440 px; seus alertas foram
confrontados com capturas e revisão independente, sem aprovar automaticamente
as bordas intencionais como defeitos nem aceitar a publicação como conclusão.

A correção seguinte substitui o painel da home por texto HTML responsivo,
retira a moldura deslocada e o filete da foto e mantém os diagramas técnicos
legíveis em seus containers. As variantes de ilustração conservam fatos,
condições e unidades. As ferramentas recebem espaçamento e alvos de interação
adequados. O catálogo de oportunidades passa a oferecer busca local, filtro
por estado e paginação acessível, preservando todos os links sem JavaScript,
objetos oficiais integrais, procedência, canonical e decisões de indexação.
Os novos gates medem geometria e texto renderizado e incluem contraprovas.

O ensaio de contato em produção bloqueou antes de enviar porque seu parser
procurava uma classe antiga. O leitor agora reconhece o formulário realmente
servido e exige atribuição coincidente antes do POST. O formulário mantém os
24 controles anteriores e três campos ocultos de contexto, sem novos dados
solicitados ao visitante. Este registro descreve a correção fonte; publicação,
aceite público final e recebimento efetivo continuam dependentes das respectivas
evidências da nova versão. A recuperação preserva o bundle aceito de 0bacc72.

A inspeção ampliada das figuras encontrou também rótulos atravessando as
caixas de coordenação e empresa e colisões com traços em instalações,
edificações e estruturas metálicas. Os seis SVGs envolvidos, incluindo o
painel antigo já sem referência na home, foram reposicionados sem reduzir
fontes nem alterar seus textos. O gate interno usa as caixas reais e mede
distância entre rótulos e traços; suas contraprovas reproduzem os seis defeitos
anteriores, o encolhimento de três caixas e a retirada de dois traços exigidos.
As 26 verificações passaram. Os gates de figuras e projetos também executam
a navegação real por teclado: 82 e 65 verificações aprovadas, respectivamente.
São evidências técnicas e revisão executada por agentes; não representam
validação por compradores humanos. O aceite público final permanece pendente.

A primeira tela foi medida novamente no checkout limpo
`b61c1680a6a43856d2acfb31711fdca029ad9c0d`: 25 rotas aprovadas nos dois
viewports do contrato, sem falhas ou pendências; 1942 verificações aprovadas.
A medição anterior de d4071b5 permanece histórica, sem substituir a nova.

Os primeiros checks protegidos desta correção pararam no contrato de design
que ainda exigia a legenda da antiga imagem da home. A asserção afetada passa
a exigir o painel HTML completo: três disciplinas, projeto coordenado,
documentação para a obra, conectores e ordem de leitura. Os demais critérios
de hierarquia e contato permanecem. Os 43 testes de design passaram; os
checks completos precisam aprovar o novo head antes da integração.

A execução seguinte sobre o artefato novo rejeitou a abertura mobile com
1586 px em 390×844, acima do limite de 1266 px. A composição foi compactada
sem retirar conteúdo: os textos do painel permanecem completos e com pelo
menos 16 px. No checkpoint fonte limpo
`25c6eaad08efbdbf1ebbba9204f4c8c07db4498b`, a abertura mede 1221 px.
A revisão independente verificou 320, 390, 768 e 1440 px, sem overflow,
com o botão de proposta na primeira tela e todos os elementos do diagrama.
Os testes gerais de geometria passaram sobre a fonte explicitamente servida.
A nova medição de primeira tela aprovou as 25 rotas; as medições anteriores
permanecem históricas. Parte da matriz local geral anterior usou o artefato
0b e não compõe o aceite deste candidato. O artefato novo e o domínio real
precisam passar pelas verificações próprias antes do encerramento público,
registrado na PR #732 e no relatório final da campanha.

A revisão independente do ensaio de contato encontrou divergência possível
entre os atributos declarativos e os campos ocultos realmente enviados.
O leitor agora usa os campos ocultos como autoridade e exige concordância
quando há declaração nos atributos. Valores inválidos, duplicatas, controles
desabilitados, vínculo com outro formulário e overrides explícitos inválidos
bloqueiam antes de qualquer envio. O parser aceita um subconjunto conservador
da estrutura do formulário, sem afirmar reproduzir todos os casos de FormData.
Os 13 cenários locais de contexto passaram, incluindo as contraprovas sem
POST externo; os mocks principal e de QA também passaram. A revisão final
independente fechou os achados deste escopo. O contato real permanece pendente
do release final e da prova de persistência, encaminhamento e recebimento.
