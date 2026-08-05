# Jornadas do visitante — validação

## Jornada 1 — problema contratual urgente

1. Home comunica obras públicas + margem + construtoras (hero + provas).
2. Caminho dominante: **Tenho um contrato sob pressão** → `#contato` com `jornada=contrato`.
3. CTA header **Analisar meu caso** também leva ao formulário.

**Interações:** ≤3 (reconhecer → escolher caminho → enviar).

## Jornada 2 — encontrar orientação

1. `/conteudos/` pergunta o problema; busca priorizada (`data-hub-search`).
2. Estágios Antes / Durante / Conflito; temas com conteúdo apenas.
3. Destaque + diretório levam a guias indexáveis reais (sem jargão “indexáveis”).

## Jornada 3 — checklist de aditivo

1. Intro explica o quê / tempo / privacidade / resultado.
2. **Iniciar diagnóstico** → etapa 1 de 4.
3. Continuar / Anterior; respostas persistem no navegador.
4. **Ver diagnóstico** → classificação, pendências, bloqueios, 3 passos, CTA único.
5. Copiar / baixar secundários; apagar com confirmação.

## Jornada 4 — resposta jurídica

1. Hero de artigo: categoria + título + lead + meta em uma linha.
2. **Resposta direta** com regra lateral editorial (não alert box).
3. Corpo em ~68ch; fontes sóbrias no final; CTA lateral único.

## Evidência automatizada

- `npm run test:design` (inclui `test_visitor_redesign.py`)
- `npm run test:hub-truth`
- `npm run test:ui` (geometry + axe home)
- `npm run test:brand` / `test:copy`
- Screenshots em `evidence/after/`
