# CONFENGE | Carteira 24/122 de ferramentas de maior potencial comercial

**Decisão:** EXECUTE_NOW (versões iniciais no navegador) · **Hipótese de mercado:** VALIDATE (concentração de receita) · **Data:** 2026-11-21  
**Frente:** ferramentas e receita própria · **Repositório:** `web-cfg` · **Marca pública:** CONFENGE  
**Rota da primeira versão:** `/ferramentas/analises-de-obra/` (noindex até aprovações de indexação e gates).

## Por que essas 24

Aproximadamente 20% das 122 ideias originais (24/122 = 19,7%) foram agrupadas para testar a hipótese de Pareto: um subconjunto pode concentrar a maior parte das receitas. **Não há evidência de que estas aplicações já produzam 80% do faturamento**. A escolha prioriza proximidade da competência da empresa, preço do problema resolvido, recorrência, simplicidade de uso, reaproveitamento técnico e custo de atendimento.

As 24 operações disponibilizadas são:

| Área | Ferramentas | Mecanismo de valor |
| --- | --- | --- |
| Custos (8) | Comparação de encargos; auditoria aritmética de orçamento; curva ABC; honorários; compra x locação; contingências; equalização de cotações; produtividade de equipe | Reduzir erros, comparar alternativas e sustentar decisão econômica |
| Contratos e caixa (4) | Reajuste por índice; conferência de medição; fluxo de caixa da obra; capital de giro em atraso | Apontar exposição de margem e necessidade de caixa |
| Licitação e evidências (5) | Comparação textual de edital; checklist de habilitação; validade documental; retenção/garantia/multa; linha do tempo de evidências | Encurtar preparação e identificar lacunas documentais |
| Campo e profissão (7) | Diário de obra; pendências de vistoria; inventário CAT/ART/experiência; briefing; escopo técnico; alteração de escopo; observações de segurança | Organizar registros para contratação, execução e aprovação |

**Não foi replicado** o motor existente de BDI, orçamento completo, CAD, BIM, EPANET, cálculo estrutural ou as 45 planilhas da PR #860. A carteira constitui fluxos complementares e versões iniciais, sem induzir que as funções básicas sejam diagnósticos profissionais, leitores legais de edital ou auditoria normativa integral.

## Produto entregue na primeira versão

- Formulários de cada ferramenta, dados demonstrativos sintéticos, cálculos locais ou agrupamentos documentais, resultados com premissas e limites.
- Entrada de CSV com *Papa Parse* v5.5.3, biblioteca MIT distribuída com aviso de licença; suporte a separador e cabeçalhos e mensagens de erro.
- Download e abertura de dados de trabalho em JSON, diretamente no dispositivo, sem cobrança, com exportação dos resultados TXT pela carteira única existente da CONFENGE.
- Sem dependência de API externa para cálculo. Nenhuma base de SINAPI, PNCP, conselho profissional, índices ou certidões é consultada em tempo real.
- Cabeçalho e rodapé com marca CONFENGE e assets já aprovados na aplicação; layout responsivo, campos rotulados, seleção por busca e área.
- Link no catálogo principal sem alterar o gerador das seções automáticas, mantendo reversibilidade e preservação da navegação atual.

**Limites materiais importantes:** o comparador de desoneração utiliza encargos inseridos manualmente, não determina regime legal. O auditor de orçamento reconhece aritmética e duplicidade em CSV, não audita fórmulas de XLSX nem valida valores SINAPI. O leitor de edital compara apenas texto, sem extrair PDF ou parecer jurídico. O gestor CAT/ART contém pesos internos indicativos (CAT mais que ART), sem certificação do CREA ou atualização do ranking do marketplace. Vistoria, SST, medição e diário organizam registros do operador, sem assinatura, geolocalização ou guarda probatória garantida.

## Modelo econômico e fronteiras

**Receita direta:** 1 crédito por arquivo TXT emitido após a cortesia, conforme a carteira compartilhada já existente. Não há novo plano, preço, assinatura, marketplace próprio, processador de pagamento, cobrança ou cadastro paralelo. O código adiciona apenas o identificador `analises-de-obra` ao registro de formatos autorizados `LOCAL_FORMATS`. A autorização só fica operacional quando a configuração de crédito existente permitir. 

**Demanda comercial:** o resultado pode levar à triagem para orçamento, perícia, documentação ou consultoria. O contato não representa proposta, contratação, faturamento ou recebimento. O site mantém `CONFENGE_WEB` como origem; o Warmbly continua proprietário da ação comercial, dos contratos, do faturamento e do recebimento.

**Leitura de dados:** CSV, texto e cálculos ficam no navegador. Na exportação autorizada são transmitidos apenas metadados técnicos da emissão e autenticados os créditos existentes. O aplicativo não copia insumos, nomes ou arquivos para analytics.

## Hipóteses que devem ser medidas

- **H1:** a intenção orgânica relacionada a desoneração e orçamento possui maior conversão de visitantes em análises concluídas e exportações do que a média do catálogo.
- **H2:** conferência de medição, auditoria e previsão de caixa induzem retorno e compra de créditos porque se repetem em cada obra ou competência.
- **H3:** ferramentas documentais atraem solicitações qualificadas de serviços de maior margem, apesar de menor frequência.
- **H4:** integração com cálculo, exportação e armazenamento local reduzirá o esforço de uso e suporte.

**Métricas separadas:** visitas por origem, ferramenta escolhida, cálculo concluído, tentativa de exportação, autorização de exportação, crédito debitado, créditos pagos efetivamente recebidos, contatos qualificados, propostas, contratos, faturamento, recebimento e custo de entrega/suporte. *Impressões, visitas, propostas, exportações autorizadas e pagamentos não são faturamento recebido.* Não inserir dados pessoais ou parâmetros de cálculo na telemetria.

**Experimento:** revisão após 30 dias de observação útil ou 100 exportações emitidas, o que ocorrer primeiro. Priorizar novas melhorias pelas **receitas líquidas efetivamente recebidas e oportunidades qualificadas**, não pelo número de rotas. Sem amostra suficiente, estender a observação e manter hipótese inconclusiva.

## Qualidade, licenças e liberação

| Controle | Evidência prevista | Regra |
| --- | --- | --- |
| Licença reutilizada | `vendor/LICENSE-PAPAPARSE.txt` e cabeçalho do código vendorizado | Não remover aviso MIT nem atribuir autoria do parser à CONFENGE |
| Cálculos | `tests/ferramentas/analises-de-obra.test.mjs` | 24 exemplos, cálculos financeiros conhecidos e entradas inválidas |
| Conversão segura | `runtime/tools-commerce/exports.cjs` | Uma carteira compartilhada, autorização e débito idempotente |
| Privacidade | `aplicativo.mjs` | Sem dados do arquivo na telemetria; saída como texto seguro |
| Arquitetura | ADR-STRAT-002, ADR-STRAT-004, ADR-TOOLS-001, RUNTIME-AUTHORITY | Uma marca, um domínio, Netcup, sem novo CRM ou checkout |
| SEO | Rota noindex na fase inicial | Indexar só após declaração na família pública, evidência de utilidade e gates de SEO/conversão |
| Publicação | `site-ci` e deploy canônico da Netcup | Não declarar produção antes de merge, CI aprovado, promoção e verificação pública |

**Limitações de teste:** a execução local dos exemplos e a verificação automatizada não substituem testes visuais em navegador, de acessibilidade, de créditos em ambiente real ou das barreiras de deploy. Essas provas devem ser observadas no CI e na Netcup antes de declarar entrega publicada.

## Próximas ampliações orientadas por resultado

As ferramentas com maior utilização podem receber XLSX nativo, importação de bases oficiais com data/UF, PDF com OCR/conferência humana, persistência autorizada por projeto e relatórios avançados. Não adicionar cobranças diferenciadas, licenças comerciais de terceiros ou promessa de revisão profissional sem validação econômica, jurídica e operacional.

## Recuperação e não interferência

Alteração isolada em `ferramentas/analises-de-obra/`, inclusão de um formato TXT na carteira existente e um link de entrada no catálogo. Reverter a PR restaura a configuração e as rotas anteriores. **Não apagar pedidos ou saldos financeiros**. Preservar as PRs #859 (editor IFC) e #860 (planilhas) e evitar merges simultâneos sem revalidar o gerador do catálogo.
