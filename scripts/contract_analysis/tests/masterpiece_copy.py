"""Dense claim-bound Portuguese copy for the HUMAN_REVIEW_PENDING masterpiece fixture.

Not a live dossier. Used only to drive the shipped quality function.
"""

from __future__ import annotations

THESIS = (
    "A sequência documental revela que o saldo residual do Art. 125 foi usado "
    "para absorver item novo sem reabrir o regime de formação de preço: a "
    "exposição de margem migra do quantitativo unitário para o insumo sem âncora?"
)

EXECUTIVE = (
    "O instrumento primário é um contrato de preço unitário de pavimentação. "
    "Dois aditivos posteriores não alongam só o prazo. Eles reposicionam o saldo "
    "contratual para caber um serviço que a planilha inicial não descrevia. "
    "A leitura útil não é o valor global. É o deslocamento da âncora de preço: "
    "o que era variação de quantidade vira formação de preço de item novo, "
    "sem memória que permita recalcular BDI, encargos e transporte na mesma base. "
    "A ficha do PNCP mostra o saldo e a data. Não mostra essa transformação."
)

WHY = (
    "Uma construtora B2G que leia só o cartão do PNCP vê aditivo e valor. "
    "Quem precisa decidir se aceita um saldo semelhante, ou se protocola "
    "reequilíbrio, precisa saber se o regime de formação sobreviveu. "
    "Esta página isola essa pergunta e recusa a comparação informal com peers "
    "de regime distinto."
)

UTILITY = (
    "A fonte entrega linhas de aditivo. A análise entrega o protocolo: "
    "exigir o mapa documental do saldo, separar item novo de quantitativo "
    "residual e recusar âncora de preço quando a memória do item não existe. "
    "Isso muda a decisão de assinar, glosar ou pedir reequilíbrio."
)

COUNTERPROOF = (
    "A leitura alternativa é que o aditivo apenas executa quantitativo residual "
    "já previsto, e que o item novo é só nomenclatura. Essa hipótese só se "
    "sustenta se a planilha inicial já descrevesse o serviço com unidade, "
    "insumo e BDI. Os documentos publicados não mostram essa linha. "
    "A contraprova permanece aberta: um anexo não digitalizado poderia "
    "conter a memória. Sem esse anexo, a tese do deslocamento de âncora "
    "é a leitura mais econômica dos papéis visíveis. Não se afirma irregularidade."
)

CANNOT = (
    "UNKNOWN: não se afirma irregularidade, culpa, fraude, má-fé, sobrepreço "
    "ou ilegalidade. Não se conclui o valor devido. Não se afirma que a "
    "Administração tenha agido de má-fé. Não se projeta margem da contratada. "
    "Não se emite parecer jurídico. Atípico descreve a forma de usar o saldo; "
    "atípico nunca se afirma irregular."
)

METHOD = (
    "Método: ler o instrumento, os dois termos aditivos e a planilha publicada; "
    "montar cronologia; classificar cada afirmação como FACT, CALCULATION, "
    "INTERPRETAÇÃO TÉCNICA CONFENGE ou UNKNOWN; recusar comparação sem regime "
    "comum. Não se reestima preço. Não se inventa documento."
)

LIMITATIONS = (
    "Sem memória interna da contratada, sem diário de obra completo e sem "
    "o processo de autorização do saldo em inteiro teor. A ausência de um "
    "anexo não autoriza inferir ocultação."
)

FINDINGS = (
    "O primeiro achado é documental: o item que consome o saldo não aparece "
    "com unidade e composição na planilha inicial. O segundo é econômico: "
    "sem essa composição, o preço unitário residual não é denominador do "
    "serviço novo. O terceiro é de processo: o prazo do segundo aditivo "
    "nasce depois da mudança de escopo, então atraso e escopo não podem "
    "ser lidos como a mesma variável.",
    "A cronologia mostra autorização de saldo, depois inclusão de serviço, "
    "depois prorrogação. Inverter essa ordem muda a tese. Os papéis "
    "publicados sustentam essa ordem e não a inversa.",
    "A comparação com contratos de empreitada global do mesmo município "
    "é NOT_COMPARABLE: o regime, a unidade de medição e a cláusula de "
    "reajuste não coincidem. Extra-cli #415 não autoriza o peer.",
)

IMPLICATIONS = (
    "Antes de aceitar saldo residual, pedir o mapa do item: unidade, insumo, "
    "BDI e transporte na mesma base do contrato original.",
    "Tratar item novo como formação de preço, não como variação de quantidade, "
    "quando a planilha inicial não descreve o serviço.",
    "Separar pedido de prazo de pedido de preço: prorrogação posterior não "
    "reabre, sozinha, a âncora econômica do item novo.",
)

BODY = """
A ficha pública resume objeto, órgão, contratada e valor. Esse resumo é
necessário e insuficiente. O que a sequência de instrumentos muda é o
lugar onde a margem é formada. No preço unitário clássico, a exposição
mora no quantitativo: executa-se mais ou menos da mesma linha, com a
mesma composição. Quando o saldo residual absorve um serviço que essa
linha não descreve, a exposição mora no insumo. Sem composição, não há
como testar se o preço do item novo herda encargos, BDI e transporte
do contrato ou se nasceu de uma negociação pontual.

Chamamos isso de deslocamento de âncora. A âncora é o conjunto de
regras que permite recalcular um preço a partir de documentos já
pactuados. Quantidade residual tem âncora. Item novo sem memória não
tem. A diferença não é semântica. Ela decide se um pedido posterior
de reequilíbrio tem denominador ou se cai em UNKNOWN.

O instrumento primário descreve pavimentação em regime de preço
unitário, com medição por serviço e reajuste anual em série nomeada.
A planilha inicial abre linhas de regularização, base e revestimento.
Não abre linha de drenagem profunda nem de contenção. O primeiro
termo aditivo autoriza usar o saldo do Art. 125. O segundo termo
aditivo descreve execução de drenagem profunda e prorroga o prazo.
A ordem importa. Saldo, depois item, depois prazo.

Um engenheiro de contratos que ignore a ordem lê "aditivo de prazo e
valor" e para. A leitura correta pergunta: o valor consome quantidade
já descrita ou cria serviço? Os documentos visíveis apontam para a
segunda hipótese. A primeira hipótese só volta se aparecer a memória
ausente. Essa memória não está no pacote.

O cálculo reproduzível aqui não é um BDI inventado. É a diferença
entre o saldo autorizado e o valor alocado ao item novo, na mesma
moeda e no mesmo período de competência. Se o valor alocado cabe no
saldo e a planilha inicial não descreve o item, o residual deixou de
ser quantidade e passou a ser envelope financeiro. Envelope financeiro
sem composição é exposição sem âncora.

A leitura enganosa do reajuste seria aplicar a série anual do contrato
sobre o item novo como se ele tivesse nascido na data-base original.
Isso só seria lícito como operação aritmética se a cláusula dissesse
que todo serviço futuro herda a data-base. O instrumento não diz isso
com essa generalidade. Sem cláusula, o reajuste do item novo é
NOT_COMPUTABLE a partir do pacote, não um crédito automático.

Peers aparentes falham por três motivos independentes. Primeiro, o
regime: empreitada global não conversa com preço unitário sem
tradução de unidade. Segundo, o objeto: pavimentação sem drenagem
profunda não é o mesmo serviço. Terceiro, a cláusula de reajuste e a
data-base não coincidem. Por isso a análise marca NOT_COMPARABLE e
não inventa um grupo.

O risco de margem invisível na ficha é simples de enunciar e difícil
de ver no PNCP. A ficha mostra um saldo. O saldo parece folga. Folga
de quantidade é uma coisa. Folga convertida em envelope de item novo
é outra. A segunda come contingência, administração local e transporte
sem que o cartão público avise. Uma construtora que use esse cartão
como analogia de preço leva para o próximo certame um denominador
errado.

A lição transferível não depende do município nem do CNPJ. Sempre que
um saldo legal for usado para caber serviço não descrito, o protocolo
é o mesmo: mapa documental, unidade, composição, data-base, recusa de
peer sem regime comum, e UNKNOWN explícito sobre o que o pacote não
autoriza concluir. Esse protocolo é o produto da página. O contrato
é só o suporte.

Não se afirma que o uso do Art. 125 seja indevido. O artigo existe
para residual. A pergunta técnica é se o residual ainda é o mesmo
serviço. Os papéis visíveis não demonstram que seja. Também não
demonstram o contrário com força de prova plena, porque um anexo
pode existir fora do pacote. A honestidade epistêmica exige manter
as duas portas abertas e ainda assim oferecer um protocolo de decisão.

A cronologia útil tem quatro marcas. Assinatura do instrumento.
Publicação da planilha. Autorização do saldo. Inclusão do item e
prorrogação. Entre a terceira e a quarta marca nasce a tese. Sem
essas quatro marcas a página não existiria. Com elas, a página não
precisa do nome da empresa para continuar verdadeira.

Termos usados com sentido restrito. Âncora de preço: regra documental
que permite recalcular. Item novo: serviço sem linha correspondente
na planilha inicial. Saldo residual: valor autorizado pelo Art. 125
sobre o contrato já firmado. NOT_COMPARABLE: recusa de peer sem
regime, unidade e cláusula comuns. UNKNOWN: o que o pacote não
autoriza afirmar.

A densidade da página vem dessas relações, não de repetir objeto e
valor. Removidos o órgão, a empresa, o município e os números, resta
a tese do deslocamento de âncora. Se essa tese cair, a página deve
cair. Se ela se sustentar em outro contrato com a mesma sequência,
a página continua útil. Esse é o teste anti-doorway aplicado de
propósito, não como enfeite.

O resumo executivo descreve a transformação. A conclusão não se afirma
irregularidade e recusa valor devido. Os dois textos não são o
mesmo parágrafo. Essa separação é deliberada: o leitor leva um
protocolo, não um veredito.

Gráfico não é necessário. A cronologia em tabela já mostra a ordem.
Um gráfico decorativo alongaria a página sem adicionar relação
claim-evidência. Por isso não há figura.

A manutenção desta análise depende da validade do pacote de evidência
e da ausência de anexo que descreva o item na planilha inicial. Se
esse anexo aparecer, a tese se invalida e a página recua para
HOLD_FOR_DATA ou correção. O rollback é retirar a interpretação,
não esconder o fato de que o saldo existiu.

Há ainda uma implicação de medição. Se a fiscalização passar a medir o
item novo por unidade improvisada, o boletim deixa de ser confrontável
com a planilha inicial. O protocolo pede que a unidade de medição do
item novo seja escrita no aditivo com a mesma gramática da planilha
original: serviço, unidade, quantitativo, preço. Sem essa gramática,
o boletim vira narrativa. Narrativa não fecha medição.

Por fim, a página recusa a frase "este contrato é relevante". A
relevância, se existir, está na transformação do escopo e na âncora
perdida. Sem essa transformação, o dossiê volta para a fila e não
vira análise. Page count não é o critério.
"""


def word_count() -> int:
    blob = " ".join(
        [
            THESIS,
            EXECUTIVE,
            WHY,
            UTILITY,
            COUNTERPROOF,
            CANNOT,
            METHOD,
            LIMITATIONS,
            " ".join(FINDINGS),
            " ".join(IMPLICATIONS),
            BODY,
        ]
    )
    return len(blob.split())
