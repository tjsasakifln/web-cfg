from importlib.metadata import version
import math
from shapely.geometry import Polygon
from sectionproperties.pre.geometry import Geometry
from sectionproperties.analysis.section import Section
from worker import InputError, number, exact_keys


def polygon_input(data):
    outer = data.get("vertices")
    holes = data.get("holes", [])
    if not isinstance(outer, list) or not 3 <= len(outer) <= 120 or not isinstance(holes, list) or len(holes) > 12:
        raise InputError("Informe de 3 a 120 vértices e até 12 furos.")
    rings = [outer] + holes
    for ring in rings:
        if not isinstance(ring, list) or not 3 <= len(ring) <= 120:
            raise InputError("Cada contorno precisa de 3 a 120 vértices.")
        for point in ring:
            if not isinstance(point, list) or len(point) != 2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>100000 for v in point):
                raise InputError("Vértices inválidos. Use coordenadas x e y em milímetros.")
    polygon = Polygon(outer, holes)
    if not polygon.is_valid or polygon.area < 1 or max(polygon.bounds[2]-polygon.bounds[0],polygon.bounds[3]-polygon.bounds[1]) > 100000:
        raise InputError("Contorno inválido: confira cruzamentos, furos e escala em milímetros.")
    return polygon


def calculate(data):
    exact_keys(data, {"vertices", "holes", "mesh", "axial", "momentX", "momentY", "warping"})
    polygon = polygon_input(data)
    divisions = number(data, "mesh", 16, 512, 128)
    axial = number(data, "axial", -1e7, 1e7, 0) * 1000
    mx = number(data, "momentX", -1e8, 1e8, 0) * 1e6
    my = number(data, "momentY", -1e8, 1e8, 0) * 1e6
    if type(data.get("warping", True)) is not bool:
        raise InputError("Escolha se deseja calcular torção e centro de cisalhamento.")
    geometry = Geometry(polygon)
    geometry.create_mesh(mesh_sizes=polygon.area/divisions)
    section = Section(geometry)
    section.calculate_geometric_properties()
    area, (cx, cy), (ix, iy, ixy) = section.get_area(), section.get_c(), section.get_ic()
    summary = [{"label":"Área","value":area,"unit":"mm²"},{"label":"Centroide x","value":cx,"unit":"mm"},{"label":"Centroide y","value":cy,"unit":"mm"},{"label":"Inércia Ix","value":ix,"unit":"mm⁴"},{"label":"Inércia Iy","value":iy,"unit":"mm⁴"},{"label":"Produto Ixy","value":ixy,"unit":"mm⁴"},{"label":"Eixo principal","value":section.get_phi(),"unit":"°"}]
    if data.get("warping", True):
        section.calculate_warping_properties()
        j, (sx, sy) = section.get_j(), section.get_sc()
        summary += [{"label":"Constante de torção J","value":j,"unit":"mm⁴"},{"label":"Centro de cisalhamento x","value":sx,"unit":"mm"},{"label":"Centro de cisalhamento y","value":sy,"unit":"mm"}]
    stresses = section.calculate_stress(n=axial,mxx=mx,myy=my).get_stress()[0]
    sigma = stresses["sig_zz"]
    summary += [{"label":"Tensão longitudinal mínima","value":float(min(sigma)),"unit":"MPa"},{"label":"Tensão longitudinal máxima","value":float(max(sigma)),"unit":"MPa"},{"label":"Elementos quadráticos","value":len(section.elements),"unit":""}]
    return {"title":"Propriedades de seção e tensões elásticas", "engine":"sectionproperties "+version("sectionproperties")+"; mesher GEOS/Shapely "+version("shapely"), "method":"Seção homogênea com geometria poligonal. Propriedades geométricas e solução de empenamento por elementos finitos Tri6.", "inputs":data, "summary":summary,
        "tables":[{"title":"Nós e tensões longitudinais", "columns":["x (mm)","y (mm)","σz (MPa)"],"rows":[[float(p[0]),float(p[1]),float(s)] for p,s in zip(section.mesh_nodes,sigma)]}],
        "geometry":{"rings":[data["vertices"]]+data.get("holes",[])},
        "assumptions":["N em kN, momentos em kN·m e coordenadas em mm. Tensões positivas indicam tração. Não inclui plasticidade nem verificação normativa de capacidade.","Torção e centro de cisalhamento dependem da discretização. Compare malhas sucessivas para o seu contorno; polígonos de curvas são aproximações da geometria curva.","Triangulação restrita GEOS com refinamento uniforme. Nenhum código Triangle/CyTriangle é utilizado."]}
