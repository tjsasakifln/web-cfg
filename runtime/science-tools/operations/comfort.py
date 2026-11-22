from importlib.metadata import version
from pythermalcomfort.models import pmv_ppd_iso, set_tmp, utci
from worker import number, sequence, exact_keys


def calculate(data):
    exact_keys(data,{"environments"})
    rows=[]
    outside=[]
    for index,room in enumerate(sequence(data,"environments",1,100)):
        exact_keys(room,{"name","tdb","tr","velocity","rh","met","clo","wind10"})
        name=room.get("name","Ambiente "+str(index+1))
        if not isinstance(name,str) or len(name)>80: raise ValueError("invalid_name")
        tdb=number(room,"tdb",10,30); tr=number(room,"tr",10,40)
        v=number(room,"velocity",0,1); rh=number(room,"rh",0,100)
        met=number(room,"met",0.8,4); clo=number(room,"clo",0,2)
        wind=number(room,"wind10",0.5,17)
        pmv=pmv_ppd_iso(tdb=tdb,tr=tr,vr=v,rh=rh,met=met,clo=clo,model="7730-2025",limit_inputs=True,round_output=False)
        set_value=set_tmp(tdb=tdb,tr=tr,v=v,rh=rh,met=met,clo=clo,limit_inputs=True,round_output=False)
        outdoor=utci(tdb=tdb,tr=tr,v=wind,rh=rh,limit_inputs=True,round_output=False)
        # NBR 16401-2:2024, 6.3.1: PMV only for air speed below 0,20 m/s (above it, Anexo D/SET);
        # 6.2.1.4 excludes occupants above 2,0 met. Relative speed is compared (conservative).
        if v>=0.20 or met>2.0: outside.append(name)
        rows.append([name,tdb,tr,rh,v,met,clo,float(pmv.pmv),float(pmv.ppd),float(set_value.set),float(outdoor.utci)])
    return {"title":"Conforto térmico de ambientes","engine":"pythermalcomfort "+version("pythermalcomfort"),"method":"PMV/PPD conforme o modelo ISO 7730:2025, SET pelo modelo de dois nós e UTCI com vento a 10 m.","inputs":data,"summary":[{"label":"Ambientes","value":len(rows),"unit":""},{"label":"Maior |PMV|","value":max(abs(r[7]) for r in rows),"unit":""},{"label":"Maior PPD","value":max(r[8] for r in rows),"unit":"%"},{"label":"Ambientes fora do domínio do PMV da NBR 16401-2 (v relativa ≥ 0,20 m/s ou met > 2,0)","value":len(outside),"unit":""}],"tables":[{"title":"Indicadores calculados","columns":["Ambiente","Ta (°C)","Tr (°C)","UR (%)","v relativa (m/s)","met","clo","PMV","PPD (%)","SET (°C)","UTCI (°C)"],"rows":rows}],"charts":[{"title":"PMV por ambiente","xLabel":"Ambiente (ordem da tabela)","yLabel":"PMV","series":[{"name":"PMV","points":[[i+1,r[7]] for i,r in enumerate(rows)]}]}],"assumptions":["A velocidade informada ao PMV é a relativa ao ocupante. UTCI usa separadamente o vento a 10 m e seus próprios pressupostos de vestimenta e atividade.","SET usa área corporal padrão de 1,8258 m², pessoa em pé e pressão de 101325 Pa. Trabalho mecânico externo é zero.","Os modelos possuem domínios de validade. Entradas que produzam valores fora desses domínios são rejeitadas; não constituem diagnóstico individual de saúde.","A ABNT NBR 16401-2:2024 (6.3.1) restringe o PMV a velocidades do ar inferiores a 0,20 m/s (6.3.1) e não se aplica acima de 2,0 met (6.2.1.4). A sinalização compara a velocidade relativa informada, o que é conservador quando a velocidade média do ar é menor. Acima de 0,20 m/s, a norma exige o método de alta velocidade do ar pelo SET (Anexo D). O SET calculado aqui segue a revisão atual do modelo de dois nós da ASHRAE 55, não o código da edição de 2017 reproduzido no Anexo D: a 1,0 met difere em até 0,5 °C da Tabela D.2 nas entradas aceitas, e a diferença cresce com a atividade (cerca de 4 °C a 2,0 met). Não o use como verificação do Anexo D."]+(["Fora do domínio do PMV da NBR 16401-2: "+", ".join(outside)+". Para verificar conformidade com a norma, use o procedimento do Anexo D."] if outside else [])}
