# FIVE-LENS CRITIQUE, painel de crítica

Simulação interna pós-reconstrução. Cada lente registra veredito, falhas e correções aplicadas (ou residual).

## 1. Diretor de construtora

**Perguntas:** entendi o que compraria? parece valioso? confiável? fala da minha margem e risco?

| Achado | Correção |
| --- | --- |
| Tese da home e tensão econômica (seleção → preço → execução) falam de margem e caixa com clareza | Mantido |
| Diretoria B2G agora domina visualmente; caminhos situacionais deixam claro por onde começar | Mantido |
| Bid Room parecia incompleto (sem entra/não entra e objeções) | **Corrigido:** escopo dual + seção de objeções |
| Ofertas agora explicam responsabilidades CONFENGE e cliente | Mantido |

**Veredito:** compra-se “decisão e método”, não “plataforma de alertas”. Confiança sobe com rastros verificáveis e foto/trajetória reais, sem cases inventados.

## 2. Diretor de criação

**Perguntas:** existe direção de arte? conceito? momentos memoráveis? componentes repetitivos?

| Achado | Correção |
| --- | --- |
| Conceito “engenharia editorial premium” legível no decision map, model core e trace matrix | Mantido |
| Hero deixa de ser dashboard SaaS | Mantido |
| Ritmo ainda arrisca monotonia se seções futuras voltarem a cards | Gates `test:design` / `forbidden_patterns` |
| Verde-claro não é mais fundo padrão de tudo | Superfícies navy / soft / white alternadas |

**Veredito:** há conceito e momentos (mapa de decisão, núcleo CONFENGE, matriz). Não é mais grade de cards genérica.

## 3. Designer editorial

**Perguntas:** ritmo? medida de linha? hierarquia? espaço vazio com função?

| Achado | Correção |
| --- | --- |
| section--tight / default / loose quebram o padding único de 112px | Mantido |
| Serif só em afirmações estratégicas; mono em evidência | Mantido |
| Hierarquia da oferta: bloco dominante + paths laterais | Mantido |
| Diagnóstico tinha links mortos `href="#"` em “Quando faz sentido” | **Corrigido:** texto + âncora real `#fit` |

**Veredito:** ritmo editorial aceitável; hierarquia radical presente na home e na oferta principal.

## 4. Especialista em conversão

**Perguntas:** oferta dominante? CTA no momento certo? prova? redução de risco? qualificação?

| Achado | Correção |
| --- | --- |
| CTA primário + urgência no hero; formulário com estágio e urgência | Mantido |
| ICP “faz sentido / não faz sentido” qualifica e reduz lead ruim | Mantido |
| Bid Room sem objeções enfraquecia redução de risco | **Corrigido** |
| Prova sem cases fabricados via matriz de rastros | Mantido |

**Veredito:** funil claro (diagnóstico → diretoria → intensivos). CTA final + contato direto com especialista.

## 5. Engenheiro frontend

**Perguntas:** sustentável? acessível? rápido? consistente? hacks?

| Achado | Correção |
| --- | --- |
| Site permanece estático; JS mínimo (journey PE) | Mantido |
| Conteúdo da jornada acessível sem JS | Mantido |
| Gates automatizados leem HTML real | `test:design`, `test:copy`, audits |
| `build:site` / assemble flaky em FS montado | Documentado; não bloqueia HTML fonte |
| jobTitle inválido no Person | **Corrigido** site-wide + shell |

**Veredito:** sustentável e testável. Sem framework pesado.

## Síntese de correções desta rodada (skeptic panel)

1. Bid Room: microcopy duplicada removida; seções **o que entra / o que não entra** e **objeções** adicionadas.
2. Diagnóstico: `href="#"` substituídos por texto + link `#fit`.
3. Este painel de cinco lentes registrado no pack da campanha e referenciado no FINAL-REPORT.

## Residual (não bloqueante para implementação)

- Preview/prod Netlify não publicados (sem autorização na sessão).
- Lighthouse scores oficiais não medidos (auditoria estática + screenshots).
- Percepção “premium” além dos proxies estruturais permanece parcialmente subjetiva, mitigada por gates e este painel.
