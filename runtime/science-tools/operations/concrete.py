"""ConcreteProperties on user-defined polygons and discrete reinforcement."""
from importlib.metadata import version
import math
from shapely.geometry import Point
from sectionproperties.pre.geometry import Geometry
from concreteproperties import Concrete, SteelBar, ConcreteSection
from concreteproperties.stress_strain_profile import ConcreteLinearNoTension, RectangularStressBlock, SteelElasticPlastic
from concreteproperties.pre import add_bar
from operations.sections import polygon_input
from worker import InputError, number, choice, sequence, exact_keys


def calculate(data):
    exact_keys(data, {"vertices","holes","bars","fc","ec","fct","alpha","gamma","epscu","fy","es","epssu","theta","axial","mode","points"})
    polygon = polygon_input(data)
    fc = number(data,"fc",5,150,30)
    ec = number(data,"ec",5,80,30)*1000
    fct = number(data,"fct",0,20,3)
    alpha = number(data,"alpha",0.1,1,0.85)
    gamma = number(data,"gamma",0.1,1,0.8)
    epscu = number(data,"epscu",0.001,0.02,0.0035)
    fy = number(data,"fy",100,1000,500)
    es = number(data,"es",100,250,200)*1000
    epssu = number(data,"epssu",0.005,0.3,0.05)
    theta = math.radians(number(data,"theta",-180,180,0))
    axial = number(data,"axial",-1e6,1e6,0)*1000
    mode = choice(data,"mode",("interaction","biaxial","curvature"),"interaction")
    points = int(number(data,"points",12,64,24))
    if fc/ec>=epscu or fy/es>=epssu:
        raise InputError("A deformação última deve superar a deformação correspondente à resistência do material.")
    concrete = Concrete("Concreto",2.4e-6,ConcreteLinearNoTension(ec,epscu,fc),"lightgrey",RectangularStressBlock(fc,alpha,gamma,epscu),fct)
    steel = SteelBar("Armadura",7.85e-6,SteelElasticPlastic(fy,es,epssu),"black")
    geometry = Geometry(polygon,material=concrete)
    bars = sequence(data,"bars",1,80)
    circles = []
    for bar in bars:
        exact_keys(bar,{"x","y","area"})
        x,y,a = number(bar,"x",-100000,100000),number(bar,"y",-100000,100000),number(bar,"area",1,20000)
        # The regular polygon used by add_bar has the requested exact area.
        radius = math.sqrt(2*a/(12*math.sin(2*math.pi/12)))
        shape = Point(x,y).buffer(radius,quad_segs=24)
        if not polygon.covers(shape) or any(shape.intersects(previous) for previous in circles):
            raise InputError("As barras devem estar inteiramente dentro do concreto e não podem se sobrepor.")
        circles.append(shape)
        geometry = add_bar(geometry,a,steel,x,y,n=12)
    section = ConcreteSection(geometry)
    summary = [{"label":"Área bruta","value":polygon.area,"unit":"mm²"},{"label":"Armadura longitudinal","value":sum(b["area"] for b in bars),"unit":"mm²"}]
    if mode == "curvature":
        result = section.moment_curvature_analysis(theta=theta,n=axial,progress_bar=False)
        rows = [[k*1000,n/1000,mx/1e6,my/1e6,m/1e6] for k,n,mx,my,m in zip(result.kappa,result.n,result.m_x,result.m_y,result.m_xy)]
        columns = ["Curvatura (1/m)","N (kN)","Mx (kN·m)","My (kN·m)","M resultante (kN·m)"]
        chart = {"title":"Momento e curvatura","xLabel":"Curvatura (1/m)","yLabel":"M (kN·m)","series":[{"name":"Resultante","points":[[r[0],r[4]] for r in rows]}]}
        summary += [{"label":"Momento máximo na trajetória","value":max(r[4] for r in rows),"unit":"kN·m"},{"label":"Curvatura final","value":rows[-1][0],"unit":"1/m"}]
    else:
        result = section.moment_interaction_diagram(theta=theta,n_points=points,progress_bar=False) if mode == "interaction" else section.biaxial_bending_diagram(n=axial,n_points=points,progress_bar=False)
        rows = [[r.n/1000,r.m_x/1e6,r.m_y/1e6,r.m_xy/1e6,math.degrees(r.theta)] for r in result.results]
        columns = ["N (kN)","Mx (kN·m)","My (kN·m)","M resultante (kN·m)","θ (°)"]
        chart = {"title":"Interação N × Mx" if mode=="interaction" else "Interação biaxial","xLabel":"Mx (kN·m)","yLabel":"N (kN)" if mode=="interaction" else "My (kN·m)","series":[{"name":"Resistência","points":[[r[1],r[0] if mode=="interaction" else r[2]] for r in rows]}]}
        summary += [{"label":"N máximo na curva","value":max(r[0] for r in rows),"unit":"kN"},{"label":"Maior |Mx|","value":max(abs(r[1]) for r in rows),"unit":"kN·m"},{"label":"Maior |My|","value":max(abs(r[2]) for r in rows),"unit":"kN·m"}]
    return {"title":"Análise de seção de concreto armado","engine":"concreteproperties "+version("concreteproperties"),"method":"Compatibilidade de deformações e integração da seção. Momento-curvatura usa concreto sem tração, elástico até fc e patamar de compressão até εcu; interação última usa bloco retangular. Aço elastoplástico.","inputs":data,"summary":summary,"tables":[{"title":"Pontos calculados","columns":columns,"rows":rows}],"charts":[chart],"geometry":{"rings":[data["vertices"]]+data.get("holes",[]),"bars":bars},"assumptions":["Coordenadas em mm. Compressão axial positiva. θ é a orientação da linha neutra em relação a x.","Os materiais e coeficientes são os informados. Não há aplicação automática de fatores parciais, detalhamento ou verificação da NBR 6118.","Momento-curvatura despreza a tração do concreto. Não inclui enrijecimento por tração, fluência, retração ou confinamento. O diagrama de interação usa α e γ; a trajetória de curvatura usa fc diretamente.","A armadura desloca o concreto e suas áreas são representadas por polígonos de 12 lados. A análise preserva a área de cada barra."]}
