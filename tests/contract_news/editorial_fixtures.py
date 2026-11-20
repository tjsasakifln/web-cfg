"""Synthetic documentary reporting fixtures. Never used by production exports."""

import hashlib

from scripts.contract_news.core import money


LOCATION = "A unidade escolar fica no bairro Central do Município de Teste Editorial."
MEASUREMENT = (
    "As medições das instalações serão discriminadas por etapa e acompanhadas de "
    "memórias de cálculo e registros fotográficos."
)
CONCEALED = (
    "Os serviços embutidos devem ser registrados antes do fechamento de pisos e paredes."
)
START = (
    "O prazo de execução será contado a partir da ordem de serviço; este documento "
    "não informa a emissão dessa ordem."
)
DELIVERY = (
    "O recebimento inclui registros dos ensaios das instalações e desenhos que "
    "representem os serviços efetivamente executados."
)


def enriched_fact(seq: int = 1, value: str = "2000000.0000") -> dict:
    facts = {
        "id": f"12345678000199-2-{seq:06d}/2026",
        "buyer": "Município de Teste Editorial",
        "supplier": "Construtora de Teste Ltda.",
        "supplier_type": "PJ",
        "object": "Construção de unidade escolar com instalações elétricas e hidráulicas no bairro Central.",
        "value": {"amount": value, "kind": "valorGlobal", "currency": "BRL"},
        "source_url": f"https://pncp.gov.br/app/contratos/12345678000199/2026/{seq}",
        "source_published_at": "2026-11-18T12:00:00Z",
        "signed_at": "2026-11-17",
        "starts_at": "2026-11-18",
        "ends_at": "2027-11-18",
        "source_checked_at": "2026-11-18T15:00:00Z",
        "source_updated_at": None,
        "source_sha256": "a" * 64,
        "administrative_location": {"city": "Município de Teste", "state": "SC"},
    }
    text = "\n".join([
        "Documento inteiramente sintético para testes; não representa uma contratação real.",
        "Objeto: " + facts["object"], LOCATION,
        "Contratada: " + facts["supplier"],
        "Valor global registrado no cenário de teste: " + money(facts) + ".",
        MEASUREMENT, CONCEALED, START, DELIVERY,
        "Os projetos de arquitetura e instalações integram a documentação da execução.",
    ])
    facts["editorial_context"] = {
        "schema": "confenge.contract-news-context/v1",
        "contract": {"number": f"{seq}/2026", "type": "Contrato de execução", "category": "Obras"},
        "procurement": None,
        "documents_status": "complete",
        "documents_total": 1,
        "documents": [{
            "id": "1", "title": "Contrato de execução da unidade escolar (exemplo sintético)",
            "url": f"https://pncp.gov.br/pncp-api/v1/orgaos/12345678000199/contratos/2026/{seq}/arquivos/1",
            "sha256": hashlib.sha256(text.encode()).hexdigest(),
            "checked_at": "2026-11-18T15:00:00Z", "pages": 2, "text": text,
        }],
    }
    return facts


def research_for(facts: dict) -> dict:
    return {
        "publishable": True,
        "angle": "O contrato da escola vincula a medição das instalações ao registro das etapas, incluindo os serviços que ficarão embutidos.",
        "findings": [
            {"id": "f1", "statement": facts["object"], "source_id": "contract", "evidence": facts["object"]},
            {"id": "f2", "statement": LOCATION, "source_id": "document-1", "evidence": LOCATION},
            {"id": "f3", "statement": MEASUREMENT, "source_id": "document-1", "evidence": MEASUREMENT},
            {"id": "f4", "statement": CONCEALED, "source_id": "document-1", "evidence": CONCEALED},
            {"id": "f5", "statement": START, "source_id": "document-1", "evidence": START},
            {"id": "f6", "statement": DELIVERY, "source_id": "document-1", "evidence": DELIVERY},
        ],
        "value_scope": "O valor global identifica o montante do contrato no cadastro. A medição depende das etapas documentadas, e o registro não comprova pagamento.",
        "uncertainties": ["O documento recebido não informa se a ordem de serviço já foi emitida."],
    }


def analysis_for(research: dict) -> dict:
    return {
        "thesis": "Na leitura documental da CONFENGE, a exigência de registros antes do fechamento das instalações torna a sequência das inspeções parte relevante do planejamento da escola.",
        "points": [
            {
                "heading": "Registro das instalações antes do fechamento",
                "explanation": "A previsão de documentar os serviços embutidos antes do fechamento exige organizar os registros junto com a sequência de execução. Como interpretação técnica, fotografias identificadas por ambiente e etapa podem permitir a conferência posterior dos trajetos e pontos executados. Isso conecta a exigência documental às condições práticas de inspeção, sem afirmar que existem falhas na obra ou que os serviços já começaram.",
                "finding_ids": ["f1", "f3", "f4"],
            },
            {
                "heading": "Medição ligada às etapas e ao recebimento",
                "explanation": "As memórias de cálculo e os registros fotográficos previstos no documento permitem relacionar os quantitativos de cada medição às etapas executadas. A avaliação técnica é que essa organização deve ser coerente com os desenhos entregues no recebimento, para que a documentação final corresponda ao que foi medido. A leitura desses instrumentos não substitui a conferência dos serviços em campo nem demonstra que houve pagamento.",
                "finding_ids": ["f3", "f6"],
            },
        ],
        "watch_points": [
            "A ordem de serviço foi emitida e identifica o início da contagem do prazo de execução?",
            "Os registros das instalações embutidas estão associados aos ambientes e às etapas medidas?",
        ],
    }


def editorial_draft(facts: dict) -> dict:
    return {
        "subject": "Construção da escola e documentação das instalações",
        "title": "Escola de Teste Editorial prevê registro das instalações antes do fechamento",
        "description": "Contrato da unidade escolar no bairro Central relaciona as medições das instalações aos registros de execução e à documentação entregue no recebimento.",
        "lead": "O Município de Teste Editorial contratou a construção de uma unidade escolar no bairro Central com instalações elétricas e hidráulicas. O documento anexo ao PNCP exige registrar os serviços embutidos antes do fechamento de pisos e paredes, uma condição relevante para acompanhar as etapas e conferir as medições.",
        "paragraphs": [
            "A fornecedora indicada no cadastro é a Construtora de Teste Ltda., e o valor global registrado é " + money(facts) + ". O instrumento descreve a medição das instalações por etapa, acompanhada de memórias de cálculo e registros fotográficos. Essa previsão permite identificar quais documentos devem acompanhar a conferência dos quantitativos, sem tratar o valor cadastral como prova de pagamento ou de serviços já realizados.",
            "O local da unidade escolar está identificado no documento de execução, que também relaciona os projetos de arquitetura e instalações à documentação da obra. A informação é mais específica que a localização administrativa do órgão no cadastro. O prazo de execução depende da ordem de serviço; o material examinado não informa a emissão dessa ordem e, portanto, não estabelece que a construção tenha começado.",
        ],
        "editorial": {
            "summary": [
                "O documento identifica a escola no bairro Central e inclui instalações elétricas e hidráulicas.",
                "As etapas medidas devem contar com memórias de cálculo e registros fotográficos.",
                "O recebimento prevê ensaios e desenhos correspondentes aos serviços efetivamente executados.",
            ],
            "sections": [
                {
                    "heading": "O que o documento acrescenta ao cadastro",
                    "kind": "context", "source_ids": ["contract", "document-1"],
                    "paragraphs": [
                        "Além da descrição geral da escola, o anexo informa como as instalações devem ser documentadas durante a execução e no recebimento. O registro das partes embutidas precisa ocorrer enquanto os serviços ainda estão acessíveis. Já os ensaios e os desenhos finais integram a documentação de recebimento. São exigências apresentadas no instrumento consultado, cuja previsão não equivale à confirmação de que tenham sido cumpridas pela contratada."
                    ],
                },
                {
                    "heading": "Leitura técnica da CONFENGE sobre as etapas embutidas",
                    "kind": "technical", "source_ids": ["document-1"],
                    "paragraphs": [
                        "Na avaliação técnica da CONFENGE, a sequência das inspeções merece ser organizada junto com a sequência de fechamento dos pisos e paredes. Depois do fechamento, a observação direta dos trajetos das instalações pode depender de novas aberturas. Associar cada registro ao ambiente e à etapa correspondente ajuda a preservar a possibilidade de conferência posterior. Trata-se de uma interpretação da exigência documental, sem diagnóstico de falha na obra ou afirmação sobre o seu andamento.",
                        "A mesma lógica alcança as medições. Relacionar os quantitativos aos registros da etapa permite conferir se o serviço documentado corresponde ao item apresentado para medição. No recebimento, os desenhos dos serviços executados podem ser comparados com esse histórico. Essa continuidade documental dá utilidade aos registros ao longo do acompanhamento e evita que a conferência dependa somente de descrições genéricas do escopo contratado."
                    ],
                },
                {
                    "heading": "Documentos que esclarecem o avanço da construção",
                    "kind": "watch", "source_ids": ["document-1"],
                    "paragraphs": [
                        "A ordem de serviço é o documento indicado para situar o início da contagem do prazo de execução. As medições e seus registros permitem examinar o avanço das etapas quando estiverem disponíveis. Para avaliar o recebimento, importam os resultados dos ensaios e os desenhos finais previstos no instrumento. A publicação do contrato fornece a referência da contratação, enquanto esses documentos acrescentam evidências sobre o desenvolvimento e a conclusão dos serviços."
                    ],
                },
            ],
            "display": {"buyer": facts["buyer"], "supplier": facts["supplier"], "object": facts["object"]},
            "source_ids": ["contract", "document-1"],
        },
    }
