"""Conforming Tri6 meshes using GEOS, without Triangle or CyTriangle.

This small adapter implements the Tri3/Tri6 dictionary interfaces used by
SectionProperties and ConcreteProperties. Uniform refinement preserves edges.
It does not claim Triangle's minimum-angle guarantees.
"""
from __future__ import annotations

import math
import numpy as np
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

MAX_TRIANGLES = 6000


def triangulate(data, options="pAo2"):
    vertices = data["vertices"]
    facets = data["segments"]
    regions = data.get("regions", [])
    if len(vertices) > 2000 or len(facets) > 4000:
        raise ValueError("mesh_input_limit")
    lines = [LineString([vertices[a], vertices[b]]) for a, b in facets]
    faces = list(polygonize(unary_union(lines)))
    triangles = []
    target = math.inf
    selections = []
    if regions:
        for x, y, attribute, area in regions:
            candidates = [f for f in faces if f.covers(Point(x, y))]
            if len(candidates) != 1:
                raise ValueError("mesh_region_ambiguous")
            selections.append((candidates[0], attribute, area))
    else:
        holes = [Point(point) for point in data.get("holes", [])]
        selections = [(face, 0, 0) for face in faces if not any(face.covers(hole) for hole in holes)]
    for face, attribute, area in selections:
        if not face.is_valid or face.area <= 0:
            raise ValueError("mesh_invalid_polygon")
        cells = list(constrained_delaunay_triangles(face).geoms)
        if abs(sum(c.area for c in cells) - face.area) > max(1e-8, face.area * 1e-9):
            raise ValueError("mesh_area_mismatch")
        for cell in cells:
            points = list(cell.exterior.coords)[:3]
            a, b, c = points
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0:
                points = [a, c, b]
            triangles.append((points, int(attribute)))
        if "a" in options and area > 0:
            target = min(target, float(area))
    # Refine every cell together; independently splitting cells causes hanging
    # nodes and invalid warping stiffness across neighbouring regions.
    for _ in range(8):
        if not triangles:
            raise ValueError("empty_mesh")
        if max(Polygon(points).area for points, _ in triangles) <= target * (1 + 1e-9):
            break
        if len(triangles) * 4 > MAX_TRIANGLES:
            raise ValueError("mesh_element_limit")
        refined = []
        for (a, b, c), material in triangles:
            ab, bc, ca = ((a[0]+b[0])/2, (a[1]+b[1])/2), ((b[0]+c[0])/2, (b[1]+c[1])/2), ((c[0]+a[0])/2, (c[1]+a[1])/2)
            refined.extend([([a, ab, ca], material), ([ab, b, bc], material), ([ca, bc, c], material), ([ab, bc, ca], material)])
        triangles = refined
    if len(triangles) > MAX_TRIANGLES:
        raise ValueError("mesh_element_limit")
    nodes, lookup, elements, attributes = [], {}, [], []
    def node(point):
        key = (round(float(point[0]), 10), round(float(point[1]), 10))
        if key not in lookup:
            lookup[key] = len(nodes)
            nodes.append(key)
        return lookup[key]
    for (a, b, c), attribute in triangles:
        ab, bc, ca = ((a[0]+b[0])/2, (a[1]+b[1])/2), ((b[0]+c[0])/2, (b[1]+c[1])/2), ((c[0]+a[0])/2, (c[1]+a[1])/2)
        # Triangle's edge order is (1,2),(2,0),(0,1); Section swaps it to
        # (0,1),(1,2),(2,0) when constructing its quadratic elements.
        elements.append([node(a), node(b), node(c), node(bc), node(ca), node(ab)] if "o2" in options else [node(a), node(b), node(c)])
        attributes.append([attribute])
    return {"vertices": np.asarray(nodes), "triangles": np.asarray(elements, dtype=int),
            "triangle_attributes": np.asarray(attributes, dtype=int)}
