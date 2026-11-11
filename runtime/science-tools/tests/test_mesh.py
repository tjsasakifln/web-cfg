import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from shapely.geometry import Polygon
from confenge_mesh import triangulate


def check(data,area,options='pAo2a'):
    mesh=triangulate(data,options)
    total=0
    for ids in mesh['triangles']:
        points=mesh['vertices'][ids[:3]]
        signed=np.linalg.det(np.array([points[1]-points[0],points[2]-points[0]]))/2
        assert signed>0
        total+=signed
        if len(ids)==6:
            for index,(a,b) in zip(ids[3:],[(1,2),(2,0),(0,1)]):assert np.allclose(mesh['vertices'][index],(points[a]+points[b])/2)
    assert abs(total-area)<1e-8,(total,area)
    assert len(set(map(tuple,mesh['vertices'])))==len(mesh['vertices'])
    return mesh

check({'vertices':[[0,0],[10,0],[10,10],[0,10],[4,4],[6,4],[6,6],[4,6]],'segments':[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],'regions':[[2,2,0,1]],'holes':[[5,5]]},96)
check({'vertices':[[0,0],[10,0],[10,10],[0,10],[4,4],[6,4],[6,6],[4,6]],'segments':[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],'holes':[[5,5]]},96,'p')
check({'vertices':[[0,0],[5,0],[10,0],[10,10],[5,10],[0,10]],'segments':[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],'regions':[[2,2,0,1],[7,2,1,1]]},100)
check({'vertices':[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]],'segments':[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]],'regions':[[.5,.5,0,.1]]},7)
print('GEOS Tri3/Tri6: area, holes, concavity, orientation, mid-nodes and shared vertices passed.')
