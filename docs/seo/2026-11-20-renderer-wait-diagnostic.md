# Experimento de diagnóstico das esperas na qualificação SEO852

Estado: diagnóstico separado, sem autorização de promoção.
Candidato: `608256ef5b009aa55e51936d72ab2a1853f3a80e`.
Origem: release `44673482607`, qualificação `136102991037`.
A reprovação original permanece `MEASURED_FAIL`.

## Pergunta e hipótese

Na primeira medição da home, o TBT foi 227,96685 ms; nas outras duas,
0 ms e 23 ms. O trace contém eventos de DocumentLoader e recebimento de
recurso com dezenas de milissegundos decorridos e pouco tempo de CPU.
Os dados originais não distinguem espera no escalonador, bloqueio nativo
ou pausa de instrumentação.

A experiência procura essa distinção. Não procura substituir a nota da
qualificação nem produzir uma aprovação de produção.

## Protocolo registrado antes da execução

Uma execução, três medições da home, com `--only=/` e
`--label=seo852-renderer-waits`. Todos os resultados serão preservados.
Um único push final à branch e uma execução do workflow. Nenhuma medição
concluída será repetida. A recuperação limitada de falhas de lançamento
anteriores ao relatório continua sendo a do contrato original. Não haverá
alteração de limites, percentil, método de simulação ou aplicação. Um resultado aprovado nesta experiência
continua inelegível para qualificação.

O código, os três pacotes e a ordem de sua preparação correspondem ao
candidato reprovado. O Node é 22.23.4, Chrome 152.0.7977.42, Lighthouse
13.4.1 e Puppeteer 25.8.0. A região, a imagem e a carga do runner podem
diferir; seus valores disponíveis serão registrados. Os downloads usam os
IDs imutáveis dos três artefatos. O hash de conteúdo restaurado, o inventário
e o digest do bundle serão conferidos após a captura para não acrescentar
uma leitura integral dos pacotes à preparação anterior às amostras. A
identidade permanece pendente até essa conferência. Não há acesso a
credenciais de implantação ou etapa de promoção.

Na qualificação original, a home foi a quinta medição. Aqui será a primeira
após o preflight. O estado de carga e o cache gzip do servidor podem diferir;
a mesma ordem de downloads não reproduz o estado completo de I/O anterior.

Dois observadores adicionais tornam esta execução diferente da qualificação:
um coletor Linux a cada 20 ms e um log passivo do transporte CDP. O custo,
atraso e perdas serão registrados. Não comparar notas como se fossem
resultado de uma intervenção causal ou de um controle pareado.

Para disponibilizar o contador de espera na fila, a VM efêmera tentará
habilitar `kernel.sched_schedstats=1` se estiver desabilitado, registrando
antes e depois. Se não for permitido, o dado será explicitamente
indisponível. Essa configuração não é aplicada à produção.

## Evidências esperadas

- Relatório, trace, rede e manifesto de cada uma das três medições.
- Estado e identidade PID/TID/starttime, schedstat, trocas de contexto,
  wchan, CPU steal e pressão de CPU, memória e I/O.
- Métodos e eventos CDP com tempo, sem conteúdo de páginas, parâmetros
  livres, URLs, credenciais ou captura de ambiente.
- Janelas de leitura e pares de relógios. A associação ao relógio do trace
  deve ser demonstrada e ter incerteza declarada; um timestamp monotônico
  isolado não basta.
- Recibo com `qualification_eligible=false`, escopo da home, identificação
  da experiência e terminal_state original do runner, sem reescrevê-lo.

## Regras de interpretação

Três amostras sem repetir o intervalo deixam a causa inconclusiva. Não
comprovam cura nem autorizam nova qualificação por si.

Atribuir demora à fila de CPU exige delta schedstat da mesma thread, sem
reutilização de PID, e janela compatível com o intervalo do trace.
PSI e steal são contexto adicional, não atribuição individual. Uma espera
acumulada no schedstat pode aparecer somente na retomada da thread; não
localizar automaticamente todo o delta no último intervalo de 20 ms nem
convertê-lo diretamente em contribuição ao TBT. Lacunas de amostragem serão
registradas e impedem declarar a captura completa, preservando os dados
disponíveis para análise.

Estado S ou D e wchan podem indicar bloqueio, mas não identificam
automaticamente o componente responsável. Pausa de instrumentação exige
eventos de pausa e retomada correlacionados; Debugger.enable isolado não
prova interferência.

Uma mudança posterior precisa de mecanismo identificado, alvo concreto e
previsão verificável de efeito. A versão alterada continuará sujeita aos
testes e à qualificação integral normais, seguida de conferência pública.

## Preservação e recuperação

A branch diagnóstica não é uma mudança de produção. Não emite
release-qualification e não utiliza resultados desta experiência para
promover um pacote. O código e o resultado original permanecem íntegros.
Encerrar a branch encerra a experiência sem reversão do site.
