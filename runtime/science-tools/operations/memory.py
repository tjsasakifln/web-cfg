from importlib.metadata import version
from handcalcs.handcalcs import LatexRenderer
from worker import number, choice, exact_keys


def calculate(data):
    exact_keys(data, {"template", "length", "load", "modulus", "inertia", "force", "area", "flow", "diameter", "coefficient"})
    template = choice(data, "template", {"beam", "axial", "hazen"}, "beam")
    rows, values, code = [], {}, ""
    if template == "beam":
        L = number(data, "length", 0.01, 100)
        q = number(data, "load", -10000, 10000)
        E = number(data, "modulus", 0.1, 1000) * 1e6  # GPa to kN/m²
        I = number(data, "inertia", 0.01, 1e9) * 1e-8  # cm4 to m4
        R, M, delta = q*L/2, q*L**2/8, 5*q*L**4/(384*E*I)
        values = dict(L=L, q=q, E=E, I=I, R=R, M=M, delta=delta)
        code = "R = q * L / 2\nM = q * L**2 / 8\ndelta = 5 * q * L**4 / (384 * E * I)"
        rows = [["Reação em cada apoio", "q × L / 2", f"{q:g} × {L:g} / 2", R, "kN"], ["Momento no meio do vão", "q × L² / 8", f"{q:g} × {L:g}² / 8", M, "kN·m"], ["Flecha no meio do vão", "5 × q × L⁴ / (384 × E × I)", f"5 × {q:g} × {L:g}⁴ / (384 × {E:g} × {I:g})", delta*1000, "mm"]]
        scope = "Viga biapoiada, carga uniforme, Euler-Bernoulli, E e I constantes. Carga e flecha positivas para baixo."
    elif template == "axial":
        N = number(data, "force", -1e7, 1e7)*1000
        A = number(data, "area", 0.01, 1e9)
        L = number(data, "length", 0.01, 100)*1000
        E = number(data, "modulus", 0.1, 1000)*1000
        sigma, delta = N/A, N*L/(E*A)
        values = dict(N=N,A=A,L=L,E=E,sigma=sigma,delta=delta)
        code = "sigma = N / A\ndelta = N * L / (E * A)"
        rows = [["Tensão axial", "N / A", f"{N:g} / {A:g}", sigma, "MPa"], ["Deformação longitudinal", "N × L / (E × A)", f"{N:g} × {L:g} / ({E:g} × {A:g})", delta, "mm"]]
        scope = "Barra prismática elástica linear. Força positiva indica tração; não verifica flambagem, ligações ou resistência normativa."
    else:
        L = number(data, "length", 0.01, 1e5)
        Q = number(data, "flow", 0.001, 1e5)/1000
        D = number(data, "diameter", 1, 5000)/1000
        C = number(data, "coefficient", 20, 160)
        h_f = 10.67*L*Q**1.852/(C**1.852*D**4.8704)
        values = dict(L=L,Q=Q,D=D,C=C,h_f=h_f)
        code = "h_f = 10.67 * L * Q**1.852 / (C**1.852 * D**4.8704)"
        rows = [["Perda de carga distribuída", "10,67 × L × Q^1,852 / (C^1,852 × D^4,8704)", f"L={L:g} m; Q={Q:g} m³/s; C={C:g}; D={D:g} m",h_f,"m"]]
        scope = "Hazen-Williams para água em escoamento pressurizado turbulento. Não inclui perdas localizadas nem substitui uma simulação de rede."
    latex = LatexRenderer(code, values, {"precision": 5, "sci_not": None, "override": ""}).render()
    return {"title": "Memória de cálculo", "engine": "handcalcs " + version("handcalcs"), "method": scope, "inputs": data,
            "summary": [{"label": row[0], "value": row[3], "unit": row[4]} for row in rows],
            "tables": [{"title": "Fórmulas e substituições", "columns": ["Verificação", "Fórmula", "Substituição", "Resultado", "Unidade"], "rows": rows}],
            "latex": latex, "assumptions": ["Conversões de unidades são aplicadas antes da substituição. O arquivo LaTeX preserva as equações e os resultados."]}
