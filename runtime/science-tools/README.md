# Cálculos científicos no runtime existente

Decisão: EXECUTE_NOW. Frente: aquisição por ferramentas úteis, conversão em
exportações pela carteira compartilhada e confiança técnica. A aplicação usa a
mesma superfície CONFENGE, o mesmo Node e a mesma publicação atômica Netcup.
Não cria serviço, porta, usuário de sistema ou armazenamento de modelos.

## Contrato e execução

`POST /api/web/science-tools`, JSON com exatamente `operation` e `data`.
Operações permitidas: `memory`, `section`, `concrete`, `frame`, `geotechnical`,
`comfort` e `solar`. Cada módulo aceita somente seu conjunto de parâmetros.
Não há campo de código, comando, caminho de arquivo, URL, pacote ou expressão
executável. Os dados meteorológicos vêm do visitante, sem consultas externas.

O adaptador já existente descobre `netlify/functions/science-tools.cjs` e
normaliza os cabeçalhos de origem do cliente. Esse handler chama um executável
fixo, com `shell: false`, `-I -B`, ambiente mínimo sem credenciais e um diretório
temporário privado. O worker importa uma operação de uma lista fixa. Não há
armazenamento ou log do modelo, do resultado ou dos diagnósticos do Python.

| Controle | Valor |
| --- | --- |
| Corpo JSON | 480 KiB, profundidade 12, até 100000 valores |
| Resultado | 2 MiB |
| Concorrência | Um processo científico por processo Node |
| Frequência por cliente | 12 pedidos a cada 5 minutos, chaves HMAC efêmeras |
| Clientes no limitador | 2048 entradas, sem expulsar limites ainda ativos |
| Tempo de parede | 21 s, encerramento por SIGKILL |
| CPU | Limite suave 18 s, rígido 20 s |
| Espaço de endereços | 1536 MiB |
| Arquivo individual | 16 MiB |
| Descritores | 128 |
| Rede e subprocessos Python | Bloqueados por audit hook |
| Core dump | Desabilitado |

O audit hook é uma defesa adicional ao contrato parametrizado, não uma sandbox
para executar código de terceiros. O resultado é rejeitado se contiver números
não finitos. Pedidos excessivamente profundos são rejeitados antes do spawn,
inclusive para evitar um processo órfão em falha de serialização.

O cache Numba contém exclusivamente código compilado dos pacotes fixados. Ele
fica em outro `mkdtemp` privado por processo Node e release, separado do modelo,
e é removido no encerramento normal do processo. Não aceita caches enviados por
visitantes. Uma interrupção SIGKILL do Node pode deixar artefatos de compilação
em seu PrivateTmp, sem entradas ou resultados. O `PrivateTmp` do systemd limita
essa pasta ao serviço. Não se usa cache Python de outro usuário ou release.

## Build reproduzível e publicação

```sh
python3 -B runtime/science-tools/build_runtime.py
node --test runtime/science-tools/tests/platform.test.cjs
OPENBLAS_NUM_THREADS=1 runtime/science-tools/python/bin/python3.12 -B runtime/science-tools/tests/test_mesh.py
python3 -B runtime/science-tools/tests/validate_runtime.py
```

O builder baixa CPython 3.12.16 standalone do release Astral 20261110 por URL e
SHA-256 fixados. Instala somente wheels com versões e hashes registrados em
`requirements.lock`, sem resolução transitiva ou código arbitrário de build.
`requirements.in` é a lista integral das 57 distribuições aprovadas, não somente
os sete motores. Atualizações exigem novo lock, revisão de licenças e execução
dos testes. Não atualizar versões automaticamente durante uma publicação.

`python/`, `runtime-manifest.json` e `license-inventory.json` são artefatos do
build, não arquivos Git. O manifesto identifica o interpreter, o lock, os
patches de importação do mesher e as licenças. O empacotador valida esses dados,
o executável ELF e a ausência de Triangle. Todos os bytes entram também no
manifesto SHA-256 da publicação. Instalações no host não são necessárias.

O workflow verifica as mesmas operações novamente depois de extrair o tarball
em outro caminho. Isso comprova que o Python funciona depois da relocação. O
rollback restaura código, bibliotecas e interpreter juntos. As proteções de
SHA exato, attestation, stage, qualificação e promoção existentes permanecem.

O bundle científico ocupa aproximadamente 684 MiB descompactado nesta versão.
As bibliotecas LLVM, NumPy e SciPy são a maior parte. O limite de 64 MiB da
transição de cache CSS do deploy não é o limite do tarball da aplicação. A
capacidade de disco deve considerar a retenção dos releases completos.

## Licenças e mesher

| Motor | Licença | Origem |
| --- | --- | --- |
| handcalcs 1.11.0 | Apache-2.0 | https://github.com/connorferster/handcalcs |
| SectionProperties 3.10.2 | MIT | https://github.com/robbievanleeuwen/section-properties |
| ConcreteProperties 0.8.0 | MIT | https://github.com/robbievanleeuwen/concrete-properties |
| PyNiteFEA 3.2.1 | MIT | https://github.com/JWock82/PyNite |
| Groundhog 0.15.0 | GPL-3.0-or-later | https://github.com/snakesonabrain/groundhog |
| pythermalcomfort 4.8.1 | MIT | https://github.com/pythermalcomfort/pythermalcomfort |
| pvlib 0.16.1 | BSD-3-Clause | https://github.com/pvlib/pvlib-python |

Triangle/CyTriangle não integra o lock nem a distribuição. A restrição de
redistribuição comercial do Triangle impede tratá-lo como uma dependência MIT.
`confenge_mesh.py` implementa o contrato mínimo Tri3/Tri6 sobre triangulação
restrita GEOS/Shapely e refinamento uniforme, sem copiar código Triangle. O
builder altera apenas os dois imports dos consumidores e a dependência em seus
metadados, registrando hashes antes e depois. O código de análise dos motores
permanece original. Não se promete a garantia de ângulo mínimo do Triangle.

Shapely usa licença BSD e inclui GEOS LGPL-2.1-or-later como biblioteca dinâmica.
Groundhog é GPL, não AGPL. O serviço não entrega seus binários ao visitante;
fontes e notices ficam preservados no repositório e no release. Qualquer
redistribuição desses binários deve levar as fontes correspondentes e manter
as condições de substituição da biblioteca LGPL. A publicação de resultados
de cálculo não transfere a licença do motor para o documento do usuário.

O builder exige texto de licença para cada distribuição e conserva notices de
bibliotecas compiladas. Matplotlib inclui DejaVu/Bitstream Vera e STIX/OFL, com
textos próprios preservados. A interface mantém a fonte Archivo já existente.
`assets/science-tools/THIRD_PARTY_NOTICES.txt` contém os textos das 57
distribuições e dessas fontes para consulta pública. Nenhuma fonte externa é
carregada pelos novos formulários.

O arquivo install-only do CPython não inclui os notices das dependências do
interpreter. Por isso `licenses/python-standalone/` conserva separadamente os
textos extraídos do arquivo full correspondente ao mesmo release, verificado
por SHA-256. `provenance.json` registra URL, hash e versão. Inclui OpenSSL,
libedit, SQLite, zlib, bzip2 e demais notices publicados pelo fornecedor; nenhum
texto de licença é removido por não participar dos cálculos atuais.

## Evidências e limites dos produtos

`tests/cases/*.json` pertence ao commit de cada produto. A suíte executa o worker
real sob limites e verifica resultados de referência ou rejeições esperadas.
Foram conferidos 23 casos: vigas/barra/Hazen-Williams, área/inércias/tensões,
furos, curvas de concreto, treliça/pórtico/P-Delta, CPT/estacas, conforto e solar.
O teste de malha verifica área, orientação, nós médios, furos, concavidade e
interface entre regiões. O teste Node cobre profundidade hostil, Infinity,
origem, payload, frequência e concorrência.

Na medição desta implementação: pico RSS até 334 MiB; PMV/PPD/SET/UTCI de um
ambiente em 14,14 s com cache frio e 3,22 s com cache quente, com PMV e PPD
idênticos. As medições variam conforme o host. Não há garantia de latência para
qualquer modelo que caiba nos limites de entrada.

### Capacidade conhecida e resposta à ocupação

Os sete módulos científicos compartilham **uma única execução simultânea por
processo Node**, sem fila de espera no servidor. Um segundo pedido, inclusive
de outra pessoa, recebe HTTP 429 `CALCULATION_BUSY` e `Retry-After: 5`.
O limite por endereço de origem é de **12 tentativas em cinco minutos**,
incluindo pedidos recebidos durante ocupação; ao atingir esse limite, a resposta
é HTTP 429 `RATE_LIMIT`, com `Retry-After` entre 1 e 300 segundos até a janela
atual terminar. Os endereços são representados apenas por HMAC efêmero.

A interface informa o motivo e a espera indicada pelo servidor, mantém todos
os campos e libera o botão **Tentar novamente** após esse prazo. Não recalcula
automaticamente. Os campos continuam editáveis durante a espera; a nova
tentativa usa os valores presentes naquele momento. O prazo não reserva uma
vaga: outro cálculo pode estar em andamento quando a pessoa tentar de novo.

Os 23 casos de cálculo e rejeição, a execução pelo HTTP real e a relocação comprovam
o funcionamento dentro desses limites. **Não há ensaio de carga que comprove
atendimento científico simultâneo em massa.** A medição de 14,14 s com cache
frio e 3,22 s com cache quente refere-se a um ambiente do cálculo de conforto,
não à capacidade média de todas as operações. Aumentar a concorrência exige
medir CPU, RAM, latência e taxa de 429 no host Netcup, preservando o atendimento
das demais rotas. Ferramentas que calculam inteiramente no navegador, como DXF,
EPANET, cronogramas e BIM, não ocupam esse processo científico do servidor.

O navegador invalida resultados quando os dados mudam, inclusive durante uma
resposta em andamento. Tabelas usam textContent; exportações CSV protegem
prefixos de fórmulas; geometria preserva escala igual nos eixos. Exportações
usam a carteira compartilhada existente, com os slugs como `toolId`.

O script `tests/browser.mjs` exercita as páginas existentes e os cálculos reais,
incluindo largura de 390 px, uma resposta atrasada, importações CSV fora de ordem
e recuperação de 429. O teste de espera usa duas respostas controladas com prazo
curto e, depois, uma tentativa manual com cálculo real e valores editados.
Chromium não pôde iniciar
no ambiente de execução desta sessão devido à restrição de socket Unix; essa
verificação deve rodar no runner do CI e não foi declarada como aprovação local.

Os modelos publicados descrevem seus materiais, métodos, unidades e exclusões
reais. Não há declaração automática de conformidade normativa ou dimensionamento
completo. O caso solar não extrapola uma série parcial para um ano. O caso de
estacas se restringe à resistência axial do modelo API de estaca cravada de
ponta fechada. Nenhum dado do modelo é enviado à medição de uso ou marketing.

## Integração comercial e recuperação

Visitante: resolver e revisar um cálculo de engenharia. Hipótese de conversão:
a utilidade gratuita e verificável cria demanda por guardar, compartilhar e
integrar o resultado a projetos; exportações usam a carteira já autorizada.
O catálogo, formatos permitidos, família orgânica e metadados são registrados
pela integração de cada produto. Contato contextual leva à triagem técnica.
Não foram acrescentadas promessas de receita, preços ou créditos.

Dados pertencem ao usuário. Não há segundo DataLake, CRM ou identidade. ADRs
STRAT-002/004 e RUNTIME-AUTHORITY são preservados. A desativação consiste em
retirar a rota do catálogo e desabilitar a operação; rollback do release restaura
o estado completo. Não há migração de banco ou esquema de dados persistentes.
