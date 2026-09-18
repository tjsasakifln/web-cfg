# Contato: o que acontece depois do envio, estados do formulário e hierarquia por página

Procedência: lido em 2026-09-17 na base `47da03b64` (worktree `salto-01-piloto`): `index.html` (`#descrever-situacao`, `#triagem-tecnica`, `#contato`, `#formulario-contato`, `#form-status`), `obrigado.html`, `triagem-tecnica/index.html`, `servicos/index.html`, `quantitativos-orcamento-obras/index.html`, `casos/demonstrativo-projeto-privado/index.html`, `medicoes-glosas-obras-publicas/index.html`, `js/modules/form.js` (fonte de `script.js`), `scripts/site/test_home_conversion_contract.py` (`CAPTURE_FORM_SHA256`), `tests/commercial/test_cta_form_next_state.mjs`, `data/organic/public-family-registry.json`, `data/site/brand.json` (`contact`). Frente A, conteúdo e percurso. Nada aqui altera HTML nem JavaScript.

## 1. O que acontece depois do envio (três passos)

Fontes dos prazos: `obrigado.html` ("Prazo: retorno em até 2 dias úteis; em contrato ou obra pública urgente, em até 1 dia útil") e `index.html#contato` ("Recebimento: confirmação imediata na tela. Prazo em obra pública: até 1 dia útil em casos urgentes; demais, até 2 dias úteis. Depois: resposta com o trabalho, a entrega e o que falta para a proposta"), coerentes com `#descrever-situacao` ("em obra pública, casos urgentes em até 1 dia útil; os demais, em até 2"). A frase de `/triagem-tecnica/#corrigir-o-site` ("sem prazo prometido em dias") vale só para avisos de erro no site e não é generalizada aqui. Nenhum prazo novo é criado.

Texto proposto (serve para a home, para `/triagem-tecnica/` e para o rodapé do formulário do pilar; em `/obrigado` os mesmos três passos aparecem com o protocolo já preenchido):

1. Recebimento na hora. Ao enviar, você vê a confirmação na tela com o número de protocolo. Guarde o protocolo: é com ele que você pede o canal seguro para documentos ou a exclusão dos dados.
2. Leitura e resposta. O Engº Tiago Sasaki lê a solicitação e responde pelo canal que você informou, em até 2 dias úteis; em contrato ou obra pública urgente, em até 1 dia útil. A resposta nomeia o serviço, o trabalho que assumimos, o que será entregue e o que ainda falta reunir.
3. Proposta, depois de confirmar o essencial. Escopo, visita, responsabilidade técnica, prazo e preço entram na proposta, depois de confirmarmos local, atribuição profissional e ART quando couber. Planta, contrato, laudo ou planilha só entram nessa etapa, por canal seguro combinado com você. Decisões administrativas, contratuais e judiciais permanecem com quem tem competência para tomá-las.

Versão curta para a caixa ao lado do formulário (substitui os três pares "Recebimento / Prazo em obra pública / Depois" de `#contato` mantendo o mesmo conteúdo): "1 · Confirmação imediata na tela, com protocolo. 2 · Resposta em até 2 dias úteis; contrato ou obra pública urgente, até 1 dia útil. 3 · Proposta com escopo, responsabilidade e preço, depois de confirmarmos o caso."

## 2. Estados do formulário da home (`#formulario-contato`)

Limite: o `<form id="formulario-contato">` é byte-idêntico por contrato (`CAPTURE_FORM_SHA256 = 798d9b47c8b32c45c506e92eb55f0c7a9c5b0f4cabe3cd210326922f7c15d220`, 23 controles, 3 obrigatórios: `nome`, `estagio`, `consentimento`; `action="/obrigado"`, `name="diagnostico-b2g"`, `document_intent=secure_channel_request`). `#form-status` e `#turnstile-slot` estão dentro do form, logo a marcação dos estados está congelada; o que muda é a apresentação (CSS) e as strings que o runtime injeta. As strings vivem em `js/modules/form.js` (compilado em `script.js`), arquivo do integrador, fora do escopo de escrita desta frente. Os cinco estados canônicos do contrato next-state/v1 (`test_cta_form_next_state.mjs`) são: `initial`, `validation-error`, `turnstile-error`, `submit-loading`, `success-receipt`.

| Estado | Como funciona hoje | Texto atual (runtime) | Texto proposto |
| --- | --- | --- | --- |
| initial | duas etapas; a segunda é opcional; consentimento obrigatório | rótulos e dicas do HTML (congelados): "Informe WhatsApp ou e-mail para retorno. WhatsApp com DDD, 10 ou 11 dígitos, como (48) 98834-4559. E-mail completo, como nome@empresa.com.br." | sem mudança de texto; apresentação: uma coluna, campos com altura mínima de toque, a etapa 2 recolhida com o rótulo já existente "Adicionar mais detalhes" |
| validation-error (nome vazio) | `setControlInvalid(nomeEl, true, 'Informe seu nome.')` (`js/modules/form.js:309`) | "Informe seu nome." | "Informe o seu nome." |
| validation-error (sem canal) | `requireEmailOrPhone()` (`js/modules/form.js:287`), um resumo em `#form-status` e os dois campos marcados | "Informe e-mail ou WhatsApp para retorno." | "Informe um WhatsApp ou um e-mail para receber a resposta." |
| validation-error (sem tipo) | `setControlInvalid(estagioEl, true, 'Selecione o tipo de necessidade.')` (`js/modules/form.js:316`) | "Selecione o tipo de necessidade." | "Escolha o tipo de necessidade; se não souber, marque a primeira opção." (a primeira opção do select é "Ainda não sei qual serviço preciso, quero ser orientado") |
| turnstile-error | slot `#turnstile-slot`; erro tratado pelo runtime com fallback | mensagem do widget | "Não conseguimos confirmar que o envio veio de uma pessoa. Tente de novo; se persistir, use o WhatsApp ou o e-mail ao lado." |
| submit-loading | botão desabilitado, `showFormStatus('Enviando…', 'ok')` (`js/modules/form.js:491`) | "Enviando…" | "Enviando. Não feche a página." |
| success-receipt | `window.location.assign('/obrigado?receipt=<protocolo>')`; o protocolo aparece em `#receipt-id` de `/obrigado` | texto de `obrigado.html` | sem mudança de mecanismo; ver §1 para o texto dos três passos em `/obrigado` |
| erro de servidor | `finishFallback` (`js/modules/form.js:543`, rótulo do botão em 559): mensagem em `#form-status` e botão "Continuar pelo WhatsApp (fallback)" com a mensagem "Olá, Tiago. Tentei enviar pelo formulário do site (...) e não recebi confirmação. Preciso de retorno." | "Não foi possível enviar ao servidor. Use o WhatsApp abaixo para não perder o contato [travessão no original] o protocolo só aparece depois da gravação confirmada." (contém travessão) | "Não foi possível registrar o envio. Use o WhatsApp abaixo para não perder o contato: o protocolo só aparece depois que o registro é confirmado." Rótulo do botão: "Continuar pelo WhatsApp" (sem "(fallback)", que é termo interno) |
| tempo esgotado | idem, variante (`js/modules/form.js:556`, `leftTheBrowser`: também cobre `receipt_unconfirmed`) | "Não recebemos a confirmação a tempo. O seu pedido pode ter sido registrado [travessão no original] não reescreva os dados: tente enviar de novo, ou use o WhatsApp abaixo. O protocolo só aparece depois da gravação confirmada." (contém travessão) | "Não recebemos a confirmação a tempo. O seu pedido pode ter sido registrado; não reescreva os dados. Tente enviar de novo (o mesmo pedido, sem duplicar) ou use o WhatsApp abaixo. O protocolo só aparece depois que o registro é confirmado." — o parêntese foi acrescentado pela campanha POS-REDESIGN-FECHAMENTO-20260918 (G03-03): o reenvio com a mesma chave devolve o mesmo recibo, sem novo registro; `tests/intake/test_mv03_adaptive_intake.mjs` ancora "pode ter sido registrado" |
| muitas tentativas | `showFormStatus('Muitas tentativas. Aguarde um minuto e tente de novo.', 'error')` (`js/modules/form.js:602`) | "Muitas tentativas. Aguarde um minuto e tente de novo." | sem mudança |
| consentimento | checkbox obrigatório no HTML congelado | "Autorizo o uso destes dados para retorno sobre a solicitação, conforme a Política de Privacidade." | sem mudança (texto dentro do form congelado); apresentação: caixa de marcação com área de toque ampla e o link visível |
| canal seguro (opcional) | checkbox `canal_seguro` no HTML congelado | "Solicitar canal seguro para envio de documentos." | sem mudança (literal cobrado por `test_copy_gates`) |

Regras para qualquer estado: nunca dizer que o formulário recebe arquivos; nunca chamar o clique no WhatsApp de conversa iniciada (é abertura de canal, e a mensagem sai pré-preenchida); o protocolo só aparece com gravação confirmada; um clique em WhatsApp ou e-mail não gera protocolo.

Formulário do pilar (`/medicoes-glosas-obras-publicas/#captura-pilar`, `shared_lead_form_v1`, recibo inline "Protocolo CONFENGE:"): os mesmos textos valem, trocando "a solicitação" por "esta medição ou glosa" onde o HTML já faz isso; a marcação está congelada por hash (ver `medicoes-estrutura.md`).

Formulário ausente (`/quantitativos-orcamento-obras/` e `/triagem-tecnica/`, runtime `adaptive-intake.js`, fallback declarado WhatsApp, e-mail, telefone): o texto de indisponibilidade já publicado na home serve de modelo e fica: "Neste navegador o formulário não conseguiria registrar o seu pedido nem devolver um protocolo, então preferimos não exibi-lo em vez de perder a sua mensagem. Fale pelo WhatsApp, pelo e-mail ou pelo telefone ao lado: chegam direto e valem o mesmo."

## 3. Hierarquia de contato por página do piloto

Regra: uma ação dominante por página (ou por seção, quando a seção é o destino contratual), alternativas subordinadas com os hrefs já existentes. Nenhum href novo. Os hrefs abaixo são os do HTML atual, decodificados só onde indicado.

### `/`

- Hero: o único `button-primary` continua sendo "Ver serviços por situação" (`/servicos/`); é invariante de teste. O hero não recebe ação de contato dominante; mantém o link de texto "Descrever a minha situação" (`/triagem-tecnica/`).
- `#descrever-situacao` (fim do índice de situações): dominante "Descrever pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Quero%20explicar%20uma%20situa%C3%A7%C3%A3o%20t%C3%A9cnica%20e%20entender%20o%20pr%C3%B3ximo%20passo.`), subordinados: "use o formulário" (`#contato`) e "Descrever por e-mail" (`mailto:tiago.sasaki@confenge.com.br?subject=Situa%C3%A7%C3%A3o%20t%C3%A9cnica&body=...`).
- `#triagem-tecnica` + `#contato` (bloco final de contato): dominante = o formulário `#formulario-contato` (botão "Descrever minha situação", já existente). Subordinados, nesta ordem: "Conversar sobre o serviço pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Quero%20conversar%20sobre%20um%20projeto%20ou%20servi%C3%A7o%20de%20engenharia%20e%20solicitar%20uma%20proposta.`), "Solicitar proposta por e-mail" (`mailto:tiago.sasaki@confenge.com.br?subject=Solicita%C3%A7%C3%A3o%20de%20proposta%20de%20engenharia&body=...`), telefone `tel:+5548988344559`. A seção `#triagem-tecnica` precisa continuar contendo `mailto:tiago.sasaki@confenge.com.br`, `wa.me/5548988344559` e a frase "Não envie documentos sensíveis" (invariante de teste); a proposta é rebaixar os dois botões grandes a um botão secundário (WhatsApp) e um link (e-mail), com a frase mantida. "Situação de obra pública? Falar sobre obras públicas" (`/servicos-obras-publicas/`) fica como link de texto.
- Bolha flutuante de WhatsApp (fora do main): permanece uma só, com o href atual.

### `/servicos/`

- Página: dominante "Descrever a situação pelo WhatsApp" no hero (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Quero%20explicar%20uma%20situa%C3%A7%C3%A3o%20t%C3%A9cnica%20e%20entender%20o%20pr%C3%B3ximo%20passo.`), subordinado "Ou pela triagem técnica" (`/triagem-tecnica/`). Bloco final `#services-contact-title`: mesmo WhatsApp como dominante, "Solicitar proposta" (`/triagem-tecnica/`) secundário, e-mail e telefone como texto.
- Seção `#servico-avaliacao`: dominante "Pedir pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Preciso%20de%20avalia%C3%A7%C3%A3o%20de%20im%C3%B3vel.`), subordinados "Enviar contexto por e-mail" (`mailto:tiago.sasaki@confenge.com.br?subject=Avalia%C3%A7%C3%A3o%20de%20im%C3%B3vel`) e "Pedir pela triagem" (`/triagem-tecnica/#pericia-avaliacao`).
- Demais linhas: cada uma mantém sua ação (`list-ruled__action`) para a página do serviço e um link de contato (`/triagem-tecnica/#projetos`, `/quantitativos-orcamento-obras/#triagem-quantitativos`, `/inspecao-diagnostico-edificacoes/#contato-inspecao`, `/assistencia-tecnica-pericial-engenharia/#contato-assistencia`, `/seguranca-trabalho-apoio-tecnico/#contato-sst`, `/triagem-tecnica/#planejamento-publico`).

### `/quantitativos-orcamento-obras/`

- Dominante: "Solicitar proposta de orçamento" (`#triagem-quantitativos`, rótulo e fragmento do registro de famílias), no hero e no fim do reconhecimento.
- Dentro de `#triagem-quantitativos`: "Solicitar proposta pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Quero%20solicitar%20proposta%20de%20levantamento%20de%20quantitativos%20ou%20or%C3%A7amento%20de%20uma%20obra.`) como botão dominante do bloco, "Solicitar proposta por e-mail" (`mailto:tiago.sasaki@confenge.com.br?subject=Proposta%20de%20quantitativos%20e%20or%C3%A7amento`) secundário, "Ligar sobre o orçamento: (48) 98834-4559" (`tel:+5548988344559`) como texto. Fecho: "contato e triagem geral" (`/triagem-tecnica/`).
- Hero: o WhatsApp fica como link secundário ("WhatsApp (48) 98834-4559") e o e-mail como link de texto, ambos com os hrefs acima.

### `/casos/demonstrativo-projeto-privado/`

- Página gerada. Dominante em `#contratar`: "Descrever o projeto pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20vi%20o%20exemplo%20demonstrativo%20de%20recorte%20de%20projeto%20privado%20e%20quero%20pedir%20quantitativos%2C%20or%C3%A7amento%2C%20revis%C3%A3o%20ou%20compatibiliza%C3%A7%C3%A3o%20do%20meu%20projeto.`), secundário "Pedir pela triagem técnica" (`/triagem-tecnica/#projetos`), texto "Ver outros exemplos demonstrativos" (`/casos/`). Os três links para os serviços (`/quantitativos-orcamento-obras/`, `/revisao-tecnica-projetos-engenharia/`, `/compatibilizacao-projetos-engenharia/`) vêm antes, como texto.

### `/medicoes-glosas-obras-publicas/`

- Dominante: o formulário `#captura-pilar` (ação terminal `capture_form`); no hero, botão "Descrever a medição" apontando para `#captura-pilar`.
- Subordinado: um botão secundário "Falar pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Tenho%20glosa%20ou%20medi%C3%A7%C3%A3o%20contestada%20e%20preciso%20enquadrar%20a%20posi%C3%A7%C3%A3o%20t%C3%A9cnica.`) no hero e no próximo passo; hoje o mesmo href aparece em três botões primários.
- Terciário: "Diagnosticar contrato" (`/ferramentas/diagnostico-defesa-margem/`) e "Diretoria Fracionada para o Mercado Público na execução" (`/diretoria-b2g/`) como links de texto. Mudanças aqui exigem recaptura de hash (ver `medicoes-estrutura.md`).

### `/triagem-tecnica/`

- Dominante: "Falar pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Quero%20explicar%20uma%20demanda%20t%C3%A9cnica%20e%20entender%20o%20pr%C3%B3ximo%20passo.`).
- Secundário: "Enviar o contexto por e-mail" (`mailto:tiago.sasaki@confenge.com.br?subject=Triagem%20t%C3%A9cnica%20CONFENGE&body=...`). Texto: "Ligar para explicar a demanda: (48) 98834-4559" (`tel:+5548988344559`).
- Lista de situações (`#projetos`, `#obra-imovel`, `#pericia-avaliacao`, `#sst`, `#planejamento-publico`): cada item mantém o seu WhatsApp pré-preenchido ou o link de serviço (`/quantitativos-orcamento-obras/`, `/servicos-obras-publicas/`); são caminhos de texto, não botões.
- `#corrigir-o-site`: e-mail e WhatsApp próprios, separados do contato comercial, com a frase "Isso não é um pedido de orçamento e não vira contato comercial."
- Bloco "O que dizer no primeiro contato" (`#depois-titulo`) recebe os três passos do §1 logo abaixo de "O que você recebe em seguida".

### `/obrigado`

- Dominante: "Continuar pelo WhatsApp" (`https://wa.me/5548988344559?text=Ol%C3%A1%2C%20Tiago.%20Quero%20conversar%20sobre%20uma%20necessidade%20de%20projeto%2C%20servi%C3%A7o%20ou%20an%C3%A1lise%20t%C3%A9cnica%20pelo%20site.`), para urgência.
- Secundário: "Alternativa por e-mail" (`mailto:tiago.sasaki@confenge.com.br?subject=Necessidade%20de%20engenharia%20-%20contato%20CONFENGE`) e o botão copiável do e-mail.
- Terciário: "Conhecer quem vai analisar o caso" (`/especialista/tiago-jun-sasaki/`) e "Voltar para a página inicial" (`/`).
- O protocolo (`#receipt-id`) vem antes de qualquer botão; os três passos do §1 substituem os quatro pares "O que vem a seguir / Prazo / O que ainda não está definido / Documentos" sem perder nenhuma das frases (todas estão redistribuídas nos passos 1 a 3).

## 4. Decisões que precisam do integrador

- Strings de `js/modules/form.js` (tabela do §2) e o rebuild de `script.js`; os dois textos de falha têm travessão hoje e o arquivo não está no escopo do gate de travessão, mas a cópia visível fica mais consistente sem ele.
- Rebaixar os botões de `#triagem-tecnica` na home mantendo os três literais cobrados.
- Em `/obrigado`, a redistribuição das frases muda um arquivo listado em `test_no_em_dash` e no gate de honestidade de documentos; conferir "Não anexe arquivo nesta mensagem nem envie dados de terceiros" (permanece no passo 3).
- Nenhuma mudança de href, de destino de formulário ou de política de retenção (730 dias) é proposta.
