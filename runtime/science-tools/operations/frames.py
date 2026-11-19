"""Planar frame and truss analysis with the actual PyNite solver."""
from importlib.metadata import version
import math
from Pynite import FEModel3D
from worker import InputError, number, choice, sequence, exact_keys


def identifier(value):
    if not isinstance(value,str) or not value.isascii() or not value.replace("_","").isalnum() or not 1 <= len(value) <= 20:
        raise InputError("Identificadores devem ter até 20 letras ASCII, números ou sublinhados.")
    return value


def calculate(data):
    exact_keys(data,{"nodes","members","loads","distributed","elastic","poisson","area","inertia","analysis","kind","factor"})
    nodes, members = sequence(data,"nodes",2,50), sequence(data,"members",1,80)
    loads, distributed = sequence(data,"loads",0,100), sequence(data,"distributed",0,80)
    kind = choice(data,"kind",("frame","truss"),"frame")
    method = choice(data,"analysis",("linear","pdelta"),"linear")
    e = number(data,"elastic",0.1,1000,200)*1e6
    nu = number(data,"poisson",0,0.49,0.3)
    a = number(data,"area",0.01,1e6,100)*1e-4
    iz = number(data,"inertia",0.0001,1e10,8333)*1e-8
    factor = number(data,"factor",-20,20,1)
    if kind=="truss" and (distributed or method=="pdelta"):
        raise InputError("A treliça usa análise linear e forças aplicadas nos nós. P-Delta e cargas distribuídas estão disponíveis para pórticos.")
    model = FEModel3D()
    model.add_material("M",e,e/(2*(1+nu)),nu,0)
    model.add_section("S",a,iz,iz,2*iz)
    names = set()
    for node in nodes:
        exact_keys(node,{"id","x","y","support"})
        name=identifier(node.get("id"))
        if name in names: raise InputError("Há identificadores de nó repetidos.")
        names.add(name)
        x,y=number(node,"x",-10000,10000),number(node,"y",-10000,10000)
        support=choice(node,"support",("free","fixed","pin","rollerY","rollerX"),"free")
        model.add_node(name,x,y,0)
        model.def_support(name,support_DX=support in ("fixed","pin","rollerX"),support_DY=support in ("fixed","pin","rollerY"),support_DZ=True,support_RX=True,support_RY=True,support_RZ=(kind=="truss" or support=="fixed"))
    member_names=set()
    for member in members:
        exact_keys(member,{"id","start","end","releaseStart","releaseEnd"})
        name=identifier(member.get("id")); start=identifier(member.get("start")); end=identifier(member.get("end"))
        if name in member_names or start not in names or end not in names or start==end:
            raise InputError("Barra repetida ou com nós de extremidade inválidos.")
        first,last=model.nodes[start],model.nodes[end]
        if math.hypot(first.X-last.X,first.Y-last.Y)<0.001:
            raise InputError("Comprimento mínimo de barra: 1 mm.")
        member_names.add(name)
        for key in ("releaseStart","releaseEnd"):
            if type(member.get(key,False)) is not bool: raise InputError("Liberações de extremidade devem ser booleanas.")
        model.add_member(name,start,end,"M","S")
        model.def_releases(name,Rzi=kind=="truss" or member.get("releaseStart",False),Rzj=kind=="truss" or member.get("releaseEnd",False))
    for load in loads:
        exact_keys(load,{"node","fx","fy","mz"})
        if load.get("node") not in names: raise InputError("Carga aponta para nó inexistente.")
        for key,direction in (("fx","FX"),("fy","FY"),("mz","MZ")):
            value=number(load,key,-1e7,1e7,0)
            if kind=="truss" and key=="mz" and value: raise InputError("Treliças recebem apenas forças nodais.")
            if value: model.add_node_load(load["node"],direction,value,case="Carga")
    for load in distributed:
        exact_keys(load,{"member","wyStart","wyEnd"})
        if load.get("member") not in member_names: raise InputError("Carga distribuída aponta para barra inexistente.")
        model.add_member_dist_load(load["member"],"FY",number(load,"wyStart",-1e6,1e6),number(load,"wyEnd",-1e6,1e6),case="Carga")
    model.add_load_combo("Combinação",{"Carga":factor})
    if method=="pdelta": model.analyze_PDelta(check_stability=True,max_iter=25)
    else: model.analyze_linear(check_stability=True)
    combo="Combinação"
    node_rows=[[name,n.DX[combo]*1000,n.DY[combo]*1000,n.RZ[combo],n.RxnFX[combo],n.RxnFY[combo],n.RxnMZ[combo]] for name,n in model.nodes.items()]
    force_rows=[]; charts=[]
    for name,m in model.members.items():
        axial=m.axial_array(21,combo_name=combo); shear=m.shear_array("Fy",21,combo_name=combo); moment=m.moment_array("Mz",21,combo_name=combo); displacement=m.deflection_array("dy",21,combo_name=combo)
        force_rows.extend([[name,x,n,v,mo,d*1000] for x,n,v,mo,d in zip(axial[0],axial[1],shear[1],moment[1],displacement[1])])
        charts.append({"title":"Barra "+name,"xLabel":"x local (m)","yLabel":"N (kN)" if kind=="truss" else "Mz (kN·m)","series":[{"name":"Axial" if kind=="truss" else "Momento","points":[[float(x),float(v)] for x,v in zip(axial[0],axial[1] if kind=="truss" else moment[1])]}]})
    return {"title":"Treliças e pórticos planos","engine":"PyNiteFEA "+version("PyNiteFEA"),"method":"Método da rigidez com elementos de barra. "+("Análise geométrica de segunda ordem P-Delta." if method=="pdelta" else "Análise elástica de primeira ordem."),"inputs":data,"summary":[{"label":"Nós","value":len(nodes),"unit":""},{"label":"Barras","value":len(members),"unit":""},{"label":"Maior deslocamento nodal","value":max(math.hypot(r[1],r[2]) for r in node_rows),"unit":"mm"},{"label":"Soma das reações verticais","value":sum(r[5] for r in node_rows),"unit":"kN"}],"tables":[{"title":"Deslocamentos e reações globais","columns":["Nó","Ux (mm)","Uy (mm)","Rz (rad)","Rx (kN)","Ry (kN)","Mz (kN·m)"],"rows":node_rows},{"title":"Esforços ao longo das barras","columns":["Barra","x local (m)","N (kN)","Vy local (kN)","Mz local (kN·m)","dy local (mm)"],"rows":force_rows}],"charts":charts,"frame":{"nodes":nodes,"members":members},"assumptions":["Modelo no plano XY, sem peso próprio automático. Cargas distribuídas são verticais globais; diagramas usam os eixos locais e sinais do PyNite.","Todas as barras usam a seção e o material informados. O fator de combinação multiplica todas as cargas.","Treliças têm barras articuladas e cargas nodais. Pórticos admitem liberação de momento em cada extremidade.","Não inclui dimensionamento normativo, plastificação nem imperfeições geométricas automáticas. P-Delta exige modelo estável e convergência."]}
