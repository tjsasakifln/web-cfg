# 📊 Relatório de Débito Técnico

**Projeto:** CONFENGE (confenge.com.br)  
**Data:** 2026-08-05  
**Versão:** 1.0  
**Audiência:** Stakeholders / dono do produto  
**Base técnica:** `docs/prd/technical-debt-assessment.md`  
**Workflow:** brownfield-discovery · Phase 9 · @analyst  

---

## 🎯 Executive Summary (1 página)

### Situação atual

A CONFENGE opera um site de conversão e conteúdo B2G **já em produção**, com formulário de leads funcionando, jornadas comerciais definidas e qualidade técnica alta em SEO, acessibilidade de laboratório e performance de laboratório. O problema principal **não** é “o site está quebrado”.

O débito técnico concentra-se em três frentes: (1) **segurança operacional dos dados de leads** se configuração errar; (2) **capacidade de analisar e exportar leads** conforme o volume cresce; (3) **manter a experiência premium do visitante** sem regredir para aparência de dashboard/template — trabalho já em curso na branch de redesign.

### Números chave

| Métrica | Valor |
|---------|-------|
| Total de débitos catalogados | 48 |
| Itens críticos / P0 (pacotes) | 5 focos de segurança/confiança |
| Esforço total estimado | **220–360 horas** de engenharia |
| Custo de RESOLVER (faixa, R$150/h) | **R$ 33.000 – R$ 54.000** |
| Custo de só fechar P0+P1 essencial | **~R$ 12.000 – R$ 22.000** (~80–150h) |
| Tempo típico calendário (1 dev focado) | 6–10 semanas (fases A–C) |
| Canal e-mail legado FormSubmit | Ainda pendente de ativação (ação do owner) |

### Recomendação

Aprovar um **pacote em três fases**: primeiro **segurança e gates** (1–2 semanas), depois **exportação de leads + fechamento da experiência do visitante** (2–4 semanas), depois **manutenibilidade e conformidade** (4–8 semanas). Não recomendar reescrita do site em outro framework.

---

## 💰 Análise de Custos

### Custo de RESOLVER

| Categoria | Horas (faixa) | Custo @ R$150/h |
|-----------|---------------|-----------------|
| Segurança store/auth (P0) | 20–40 | R$ 3.000 – R$ 6.000 |
| Dados / export / cohorts (P1) | 50–90 | R$ 7.500 – R$ 13.500 |
| UX visitor closure (P1) | 20–40 | R$ 3.000 – R$ 6.000 |
| Manutenibilidade CSS/JS (P2) | 40–70 | R$ 6.000 – R$ 10.500 |
| Conformidade / hygiene (P2) | 40–70 | R$ 6.000 – R$ 10.500 |
| Excelência opcional (P3) | 50–80 | R$ 7.500 – R$ 12.000 |
| **TOTAL** | **220–360** | **R$ 33.000 – R$ 54.000** |

### Custo de NÃO RESOLVER (risco acumulado)

| Risco | Probabilidade | Impacto | Custo potencial (ordem de grandeza) |
|-------|---------------|---------|-------------------------------------|
| Lead store em modo memória/sem persistência por misconfig | Baixa–Média se P0 adiado | Crítico (perda de leads) | **R$ 50.000 – R$ 200.000+** em oportunidade + confiança |
| Exposição indevida de base de leads (ops) | Baixa com disciplina; sobe sem rotação | Crítico (LGPD/reputação) | **R$ 100.000+** (multas + dano de marca) |
| Regressão visual para “template genérico” | Média sem gates | Alto (conversão/posicionamento) | **R$ 20.000 – R$ 80.000**/ano em conversão perdida |
| Cegueira de RevOps (sem export) | Alta com crescimento | Médio–Alto | **R$ 15.000 – R$ 60.000**/ano em ineficiência comercial |
| Email de notificação incompleto | Média | Médio | Atrasos de resposta a lead (oportunidade) |

**Custo potencial de não agir (conservador, 12 meses):** facilmente **superior a R$ 100.000** se combinados perda de leads + erosão de conversão + risco de conformidade — acima do investimento de resolução completa.

---

## 📈 Impacto no Negócio

### Performance

| Item | Situação |
|------|----------|
| Lab mobile (páginas-chave) | Performance ~99–100; LCP ~1,4–1,6s |
| Campo (CrUX) | Ainda não claimable — monitorar |
| Risco | Crescimento de conteúdo sem higiene pode degradar dev speed mais que LCP |

### Segurança & dados

| Item | Situação |
|------|----------|
| Captura de leads | Persistência durable desenhada corretamente |
| Maior gap | Configuração de store + endurecimento de acesso ops |
| LGPD | Minimização boa na API pública; falta processo DSAR productizado |

### Experiência do usuário

| Item | Situação |
|------|----------|
| Jornadas A/B/C | Definidas e instrumentadas |
| Redesign visitante | Em andamento — reduzir “card soup” e linguagem interna |
| Acessibilidade lab | Excelente (0 issues axe no set medido) |
| Risco | Regressão estética = perda de percepção de alto valor |

### Manutenibilidade / velocidade

| Item | Situação |
|------|----------|
| Gates de qualidade | Fortes (SEO, design, copy, leads) |
| Fricção | Muitos artefatos gerados + CSS/JS monólitos |
| Após resolução P2 | Menos tempo por mudança visual e menos risco de diff ruidoso |

---

## ⏱️ Timeline recomendado

### Fase 1: Quick wins & segurança (1–2 semanas) — ~R$ 3–6 mil

- Travas de store em produção + testes  
- Rotação/hardening de acesso ops  
- Gates de design como checks obrigatórios  
- `.env.example` fiel ao produto  

**ROI:** evita o pior cenário (perda/exposição de leads).

### Fase 2: Fundação (2–4 semanas) — ~R$ 10–20 mil

- Export de leads + cohorts de atribuição  
- Fechar jornadas do redesign (hub, tools, a11y form)  
- Política de artefatos gerados vs fonte  

**ROI:** operação comercial enxerga o funil; visitante completa o caminho.

### Fase 3: Otimização (4–6 semanas) — ~R$ 12–20 mil

- Modularizar CSS/JS  
- DSAR, retention evidence, backup  
- Hygiene GSC/registries  

**ROI:** velocidade de evolução sustentável.

### Fase 4: Opcional

- Warehouse CRM, TypeScript, storybook, programa CrUX  

---

## 📊 ROI da resolução

| Investimento | Retorno esperado |
|--------------|------------------|
| R$ 12–22 mil (P0+P1 essencial) | Evita perda de leads + protege conversão premium |
| R$ 33–54 mil (programa completo A–C) | RevOps escalável + manutenção mais barata + conformidade |
| 6–10 semanas | Produto sustentável sem reescrita |

**ROI estimado (essencial):** facilmente **> 3:1** no horizonte de 12 meses se evitar um único incidente de perda de leads ou queda material de conversão.

---

## ✅ Próximos passos

1. [ ] Aprovar orçamento da **Fase 1** (segurança) imediatamente  
2. [ ] Aprovar **Fase 2** (export + UX) no mesmo ciclo se caixa permitir  
3. [ ] Owner: ativar/confirmar canal de e-mail (Resend) e status FormSubmit  
4. [ ] Alocar 1 engenheiro full-stack familiarizado com o repo  
5. [ ] Iniciar epic: `docs/stories/epic-technical-debt.md`  
6. [ ] Primeira story: fail-closed lead store + CI  

---

## 📎 Anexos

| Documento | Uso |
|-----------|-----|
| `docs/prd/technical-debt-assessment.md` | Assessment técnico completo |
| `docs/architecture/system-architecture.md` | Arquitetura |
| `supabase/docs/SCHEMA.md` + `DB-AUDIT.md` | Plano de dados (Blobs/JSON) |
| `docs/frontend/frontend-spec.md` | UX/front |
| `docs/reviews/*` | Validações especialistas + QA |
| `docs/stories/epic-technical-debt.md` | Epic de resolução |
| `docs/stories/story-1.*` | Stories priorizadas |

---

*Valores em R$ usam premissa de R$150/hora para comparabilidade. Ajustar à taxa real do time.*


## EPIC-TD-001 resolved (2026-08-05)

| ID package | Story | Status |
|------------|-------|--------|
| DATA-04 / DATA-20 / SYS-13 fail-closed store | 1.1 | **resolved** |
| DATA-12 ops auth | 1.2 | **resolved** |
| UX-02 design gates required | 1.3 | **resolved** |
| SYS-05 / DATA-08 env example | 1.4 | **resolved** |
| DATA-01 lead export | 1.5 | **resolved** |
| DATA-11 attribution cohorts | 1.6 | **resolved** |
| UX-03/05/11 visitor residual | 1.7 | **resolved** |
| UX-15/16 form a11y + tool CTA | 1.8 | **resolved** |
| SYS-02 / UX-01 CSS tokens | 1.9 | **resolved** |
| SYS-03 script modules | 1.10 | **resolved** |
| DATA-10 / DATA-16 DSAR/retention | 1.11 | **resolved** |
| DATA-06 / DATA-13 GSC single-source + backup | 1.12 | **resolved** |

### Remaining (non-epic / P3 / owner)

- DATA-02 full CRM dual-write warehouse  
- TypeScript rewrite of functions  
- Owner EXTERNAL-ACTIONS (Resend DNS, Turnstile enforce keys, uptime vendor)  
- Storybook / CrUX field program  

Evidence: `docs/qa/EPIC-TD-001-GATE.md`, `docs/evidence/epic-td-001/composite-scorecard.json`.
