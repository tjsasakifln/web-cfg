import gzip, hashlib, json, math
from pathlib import Path
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("geometry", type=Path)
parser.add_argument("names", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
geometry = args.geometry.read_bytes()
names = {str(row["id"]): row["nome"] for row in json.loads(args.names.read_bytes())}
center = (-27.62, -48.63)
def km(lon, lat):
    lat1, lat2, dy, dx = map(math.radians, (center[0], lat, lat-center[0], lon-center[1]))
    k = math.sin(dy/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dx/2)**2
    return 2*6371.0088*math.atan2(math.sqrt(k), math.sqrt(1-k))
result = {}
border = {}
for f in json.loads(geometry)["features"]:
    code = f["properties"]["codarea"]
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    points = [p for poly in polys for ring in poly for p in ring]
    minx = min(p[0] for p in points)
    maxx = max(p[0] for p in points)
    miny = min(p[1] for p in points)
    maxy = max(p[1] for p in points)
    # Bound area by the geodesic radius of the smallest coordinate box. The
    # maximum is at a corner for the latitude/longitude ranges found in SC.
    # Round outwards by 2 km around the 2-decimal source point.
    upper = math.ceil(max(km(x,y) for x in (minx,maxx) for y in (miny,maxy))) + 2
    lat = min(max(center[0], miny), maxy)
    lon = min(max(center[1], minx), maxx)
    # For these short distances, a computed lat/lon box clamp can overstate
    # the lower bound by at most ~0.2 km. Use a latitude-only lower bound plus
    # the longitude-only global minimum for points in the EPSG:4674 SC box.
    lat_only = abs(center[0] - lat) * 111.19
    lon_only = abs(center[1] - lon) * 95
    lower = max(0, math.floor(max(lat_only,lon_only)) - 2)
    result[code] = [names[code], lower, upper]
    if lower <= 200 < upper:
        border[code] = [[[[round(x, 6), round(y, 6)] for x, y in ring] for ring in poly] for poly in polys]
assert len(result) == 295 and all(k.startswith("42") for k in result)
meta = {
    "center":{"lat":center[0],"lon":center[1],"ibge":"4216602"},
    "geometrySha256":hashlib.sha256(geometry).hexdigest(),
    "mapSource":"https://geoftp.ibge.gov.br/cartas_e_mapas/mapas_para_fins_de_levantamentos_estatisticos/censo_demografico_2022/mapas_municipais_estatisticos/SC/sao_jose_4216602/sao_jose_4216602_mme_a0.pdf",
    "geographySource":"https://servicodados.ibge.gov.br/api/v3/malhas/estados/42?formato=application%2Fvnd.geo%2Bjson&qualidade=maxima&intrarregiao=municipio",
}
out = args.output / "extra-sc-municipalities.json"
out.write_text(json.dumps(meta,indent=2,ensure_ascii=False)[:-2]+',\n  "municipalities": {\n'+',\n'.join('    '+json.dumps(k)+': '+json.dumps(v,ensure_ascii=False) for k,v in sorted(result.items()))+'\n  }\n}\n')
(args.output / "extra-sc-border.json.gz").write_bytes(gzip.compress(json.dumps(border, sort_keys=True, separators=(",", ":")).encode(), mtime=0))
