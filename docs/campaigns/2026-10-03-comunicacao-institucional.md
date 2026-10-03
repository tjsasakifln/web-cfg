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
