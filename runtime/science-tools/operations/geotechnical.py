from importlib.metadata import version
import math
from groundhog.siteinvestigation.insitutests.pcpt_correlations import pcpt_normalisations
from groundhog.deepfoundations.axialcapacity.skinfriction import API_unit_shaft_friction_clay, API_unit_shaft_friction_sand_rp2geo
from groundhog.deepfoundations.axialcapacity.endbearing import API_unit_end_bearing_clay, API_unit_end_bearing_sand_rp2geo
from worker import InputError, number, choice, sequence, exact_keys


def calculate(data):
    exact_keys(data,{"mode","coneArea","waterTable","cpt","diameter","length","factor","layers"})
    mode=choice(data,"mode",("cpt","pile"),"cpt")
    if mode=="cpt":
        ratio=number(data,"coneArea",0.1,1,0.8)
        water=number(data,"waterTable",0,200,0)
        rows=[]; previous=-1
        for row in sequence(data,"cpt",1,1000):
            exact_keys(row,{"depth","qc","fs","u2","total","effective"})
            depth=number(row,"depth",0.01,250)
            if depth<=previous: raise InputError("Profundidades CPT devem ser crescentes e sem duplicatas.")
            previous=depth
            qc=number(row,"qc",0.001,150); fs=number(row,"fs",0.00001,10); u2=number(row,"u2",-10,10)
            total=number(row,"total",0.01,20000); effective=number(row,"effective",0.01,20000)
            if effective>total or qc*1000+u2*(1-ratio)*1000<=total: raise InputError("Confira tensões e resistência líquida do CPT.")
            values=pcpt_normalisations(measured_qc=qc,measured_fs=fs,measured_u2=u2,sigma_vo_tot=total,sigma_vo_eff=effective,depth=max(0,depth-water),cone_area_ratio=ratio)
            result=[depth,values["qt [MPa]"],values["Rf [pct]"],values["Bq [-]"],values["Qt [-]"],values["Fr [%]"],values["Qtn [-]"],values["Ic [-]"],values["Ic class"]]
            if any(not math.isfinite(float(v)) for v in result[:8]): raise InputError(f"CPT na profundidade {depth:g} m fora do domínio de normalização. Confira qc, fs e tensões.")
            rows.append(result)
        summary=[{"label":"Leituras","value":len(rows),"unit":""},{"label":"Profundidade final","value":rows[-1][0],"unit":"m"},{"label":"qt máximo","value":max(r[1] for r in rows),"unit":"MPa"}]
        tables=[{"title":"Normalização e comportamento CPT","columns":["z (m)","qt (MPa)","Rf (%)","Bq","Qt","Fr (%)","Qtn","Ic","Comportamento Robertson"],"rows":rows}]
        charts=[{"title":"Perfil de resistência corrigida","xLabel":"Profundidade (m)","yLabel":"qt (MPa)","series":[{"name":"qt","points":[[r[0],r[1]] for r in rows]}]}]
        assumptions=["qc, fs e u2 em MPa; tensões verticais totais e efetivas em kPa. A pressão hidrostática de referência usa a profundidade abaixo do nível d'água e peso específico de 10,25 kN/m³ do método.","Ic classifica comportamento, não substitui a identificação geológica ou ensaios de laboratório. Não se infere SPT nem resistência de estaca automaticamente do CPT."]
        method="Correção de ponta, normalizações CPT e índice de comportamento de Robertson implementados no Groundhog."
    else:
        diameter=number(data,"diameter",0.05,5,0.5); length=number(data,"length",0.1,150,10); safety=number(data,"factor",1,10,2)
        layers=sequence(data,"layers",1,50); rows=[]; last=0; shaft=0; tip=None
        for layer in layers:
            exact_keys(layer,{"top","bottom","soil","density","sigmaTop","sigmaBottom","su"})
            top=number(layer,"top",0,250); bottom=number(layer,"bottom",0,250)
            if abs(top-last)>1e-6 or bottom<=top: raise InputError("Camadas devem ser contíguas, da superfície para a base.")
            last=bottom
            soil=choice(layer,"soil",("clay","sand","sand-silt")); density=choice(layer,"density",("Medium dense","Dense","Very dense"),"Medium dense")
            s0=number(layer,"sigmaTop",0,10000); s1=number(layer,"sigmaBottom",0.01,10000)
            if s1<s0: raise InputError("A tensão efetiva deve crescer em cada camada deste modelo.")
            su=number(layer,"su",0.1,400,50)
            if top>=length: continue
            z=min(bottom,length); midpoint=(top+z)/2
            sig=s0+(s1-s0)*(midpoint-top)/(bottom-top)
            sigtip=s0+(s1-s0)*(z-top)/(bottom-top)
            if soil=="clay":
                # Groundhog's uncapped alpha equation would exceed unity below
                # psi=0.25. Do not silently report that extrapolation as API
                # resistance; this product restricts its applicable domain.
                if su/sig<0.25:
                    raise InputError("Para argila, este modelo exige Su/σ′v médio de pelo menos 0,25. Confira as camadas e escolha um método adequado ao perfil.")
                fs=API_unit_shaft_friction_clay(undrained_shear_strength=su,sigma_vo_eff=sig)["f_s_comp_out [kPa]"]
                qb=API_unit_end_bearing_clay(undrained_shear_strength=su)["q_b_plugged [kPa]"]
            else:
                desc="Sand" if soil=="sand" else "Sand-silt"
                fs=API_unit_shaft_friction_sand_rp2geo(density,desc,sig,fs_limit=True)["f_s_comp_out [kPa]"]
                qb=API_unit_end_bearing_sand_rp2geo(density,desc,sigtip,qb_limit=True)["q_b_plugged [kPa]"]
            contribution=fs*math.pi*diameter*(z-top); shaft+=contribution
            rows.append([top,z,soil,sig,fs,contribution])
            if z==length: tip=qb*math.pi*diameter**2/4
        if last<length or tip is None: raise InputError("O perfil deve alcançar a ponta da estaca.")
        total=shaft+tip
        summary=[{"label":"Resistência lateral","value":shaft,"unit":"kN"},{"label":"Resistência de ponta","value":tip,"unit":"kN"},{"label":"Resistência axial calculada","value":total,"unit":"kN"},{"label":"Resistência dividida pelo fator global","value":total/safety,"unit":"kN"}]
        tables=[{"title":"Contribuição lateral por camada","columns":["Topo (m)","Base usada (m)","Solo","σ′v média (kPa)","fs (kPa)","Qs (kN)"],"rows":rows}]
        charts=[]
        assumptions=["Estaca circular de ponta fechada submetida à compressão. Tensões efetivas variam linearmente dentro da camada; atrito lateral é avaliado no ponto médio.","Areias usam limites de atrito e ponta do API RP 2GEO. Argilas usam os métodos alfa e Nc=9 do Groundhog, restritos aqui a Su/σ′v médio ≥ 0,25 para não extrapolar alfa acima de 1. Considere subdividir camadas para conferir a integração.","O fator global é fornecido pelo usuário e não constitui verificação da NBR 6122. Não inclui recalques, atrito negativo, efeito de grupo, tração, carregamento lateral ou comportamento de estacas escavadas."]
        method="Integração por camadas de resistências unitárias API para estacas cravadas, com os métodos oficiais implementados no Groundhog."
    return {"title":"Geotecnia: CPT e resistência axial de estacas","engine":"groundhog "+version("groundhog"),"method":method,"inputs":data,"summary":summary,"tables":tables,"charts":charts,"assumptions":assumptions}
