"""Browser adapter. Fit, subject assessment, cost and classification belong to Modela Pro."""

import csv
import io
import json
import math
from pathlib import Path
from zipfile import ZipFile

MAX_ROWS = 10000
MAX_COLUMNS = 100


def pack(data):
    def clean(obj):
        if isinstance(obj, dict):
            return {str(k): clean(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [clean(v) for v in obj]
        if isinstance(obj, float) and not math.isfinite(obj):
            return None
        if hasattr(obj, "item"):
            return clean(obj.item())
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return obj

    return json.dumps(clean(data), ensure_ascii=False, allow_nan=False)


def table(records):
    records = iter(records)
    header = [str(v or "").strip() for v in next(records, ())]
    if not 2 <= len(header) <= MAX_COLUMNS:
        raise ValueError("Use de 2 a 100 colunas na planilha.")
    if any(not v or len(v) > 150 for v in header) or len(set(header)) != len(header):
        raise ValueError("Nomeie as colunas da primeira linha, sem títulos repetidos.")
    if set(header) & {"row_id", "__proto__", "constructor", "prototype"}:
        raise ValueError("Renomeie a coluna reservada antes de importar a planilha.")
    rows = []
    for values in records:
        if not values or not any(x is not None and x != "" for x in values):
            continue
        if len(values) != len(header):
            raise ValueError(
                "Há uma linha com quantidade de colunas diferente do cabeçalho."
            )
        if len(rows) >= MAX_ROWS or (len(rows) + 1) * len(header) > 250000:
            raise ValueError(
                "A planilha excede o limite de 10 mil imóveis ou 250 mil células."
            )
        rows.append(dict(zip(header, values)))
    if not rows:
        raise ValueError("A planilha contém apenas cabeçalhos.")
    return {"columns": header, "rows": rows}


def read_file(name, path):
    suffix = Path(name).suffix.lower()
    source = Path(path).read_bytes()
    if suffix in {".csv", ".txt", ".tsv"}:
        for encoding in ("utf-8-sig", "cp1252"):
            try:
                text = source.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Salve o CSV com codificação UTF-8.")
        if "\x00" in text:
            raise ValueError("O arquivo não é um CSV de texto.")
        try:
            dialect = csv.Sniffer().sniff(text[:16384], delimiters=";,\t")
        except csv.Error:
            raise ValueError(
                "Separe as colunas com ponto e vírgula, vírgula ou tabulação."
            ) from None
        return table(csv.reader(io.StringIO(text), dialect))
    if suffix != ".xlsx":
        raise ValueError("Use uma planilha XLSX ou um arquivo CSV.")
    with ZipFile(io.BytesIO(source)) as zipped:
        files = zipped.infolist()
        if len(files) > 2048 or sum(f.file_size for f in files) > 40 * 1024 * 1024:
            raise ValueError("A planilha descompactada excede o limite de 40 MB.")
    import openpyxl

    wb = openpyxl.load_workbook(
        io.BytesIO(source), read_only=True, data_only=True, keep_links=False
    )
    try:
        sheet = next((s for s in wb.worksheets if s.sheet_state == "visible"), None)
        if (
            not sheet
            or (sheet.max_column or 0) > MAX_COLUMNS
            or (sheet.max_row or 0) > MAX_ROWS + 1
        ):
            raise ValueError(
                "Use uma primeira aba visível com até 10 mil imóveis e 100 colunas."
            )
        result = table(sheet.values)
        result["sheet"] = sheet.title
        return result
    finally:
        wb.close()


def call_cost(raw):
    from modules.cost_valuation.reconstruction import compute_reconstruction_cost

    payload = json.loads(raw)
    return pack(
        compute_reconstruction_cost(
            payload["bom"],
            value_basis=payload["value_basis"],
            include_depreciation=bool(payload["include_depreciation"]),
        )
    )


def call_calculate(raw):
    import pandas as pd
    from modules.model_builder import CandidateSpec, evaluate_fitted, fit_candidate
    from modules.preprocessing import fit_dataset, transform_subject
    from modules.utils import parse_numeric_token
    from scipy.stats import shapiro
    from statsmodels.stats.diagnostic import het_breuschpagan
    from statsmodels.stats.stattools import durbin_watson
    from statsmodels.stats.outliers_influence import variance_inflation_factor

    req = json.loads(raw)
    rows, target, features = req["rows"], req["target"], req["features"]
    if not rows or len(rows) > MAX_ROWS or not 1 <= len(features) <= 25:
        raise ValueError("Escolha uma amostra e de 1 a 25 variáveis explicativas.")
    if target in features or len(set(features)) != len(features):
        raise ValueError(
            "As variáveis explicativas devem ser distintas da variável de preço."
        )
    if len(rows) * len(features) > 250000:
        raise ValueError("Reduza a seleção a no máximo 250 mil células.")
    df = pd.DataFrame(rows)
    if not set([target, *features]).issubset(df.columns):
        raise ValueError("Há uma coluna selecionada que não consta na amostra.")

    def number(value, where):
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        val = parse_numeric_token(value, locale="auto")
        if val.value is None:
            raise ValueError(
                f"Confira o número em {where}. Evite separadores de milhar ambíguos."
            )
        return val.value

    df = df.reindex(columns=[target, *features]).copy()
    for col in df.columns:
        df[col] = [
            number(value, f"{col}, registro {i+1}")
            for i, value in enumerate(
                df[col].astype(object).where(df[col].notna(), None).tolist()
            )
        ]
    ids = [str(i + 1) for i in range(len(df))]
    df.insert(0, "row_id", ids)
    subject = {
        col: number(req["subject"].get(col), f"avaliando, {col}") for col in features
    }
    if any(v is None for v in subject.values()):
        raise ValueError("Preencha todos os atributos do imóvel avaliando.")
    spec = {
        "schema_version": "MP/1",
        "target_col": target,
        "candidate_cols": features,
        "roles": {k: "predictor" for k in features},
        "kinds": {k: "numeric" for k in features},
        "units": {target: req.get("unit")},
        "target_unit": req.get("unit"),
        "import_options": {"locale": "auto"},
        "missing_policy": {"target": "never_impute", "predictors": "complete_case"},
        "outlier_policy": {"mode": "report_only", "scenario": "principal"},
    }
    prepared = fit_dataset({"parsed_frame": df}, spec)
    if list(prepared.X.columns) != features and set(prepared.X.columns) != set(
        features
    ):
        raise ValueError(
            "Uma variável é constante, não tem dados suficientes ou não pode ser ajustada."
        )
    fit = fit_candidate(
        prepared,
        CandidateSpec(
            candidate_id="modelo-manual",
            features=features,
            base_variables=features,
            feature_groups={},
            x_transformations={},
            y_transformation="identity",
            intercept=True,
        ),
        spec,
    )
    if fit.status != "fitted":
        reasons = [it["message"] for it in fit.issues if it.get("severity") == "error"]
        raise ValueError(
            " ".join(reasons) or "A amostra não permite ajustar este modelo."
        )
    design = transform_subject(subject, prepared.feature_schema, prepared.encoder_state)
    if not design.supported:
        raise ValueError(
            "Os atributos do avaliando não são compatíveis com as variáveis ajustadas."
        )
    assessment = evaluate_fitted(fit, design, spec)
    if assessment.value.get("point") is None:
        raise ValueError("O motor não retornou estimativa para o avaliando.")
    model = fit.model_object
    influence = fit.diagnostics.get("influence", {})
    prec = assessment.normative.get("precisao", {})
    fund = assessment.normative.get("fundamentacao", {})
    items = fund.get("items", [])
    item4 = next((i for i in items if i.get("item") == 4), {})
    used = [str(i) for i in fit.used_row_ids]
    set_used = set(used)
    excluded = [i for i in ids if i not in set_used]
    coefficients = [
        {"name": str(k), "value": float(v), "p": float(model.pvalues[k])}
        for k, v in model.params.items()
    ]
    residuals = [
        {
            "id": rid,
            "observed": float(y),
            "predicted": float(pred),
            "residual": float(r),
            "cook": influence.get("cooks_distance", {}).get(rid),
            "leverage": influence.get("leverage", {}).get(rid),
        }
        for rid, y, pred, r in zip(used, fit.y_design, model.fittedvalues, model.resid)
    ]

    def bounds(key):
        band = assessment.value.get(key)
        return [band["lower"], band["upper"]] if band else None

    diagnostics = []

    def diagnostic(label, fn):
        try:
            value = float(fn())
            diagnostics.append(
                {"label": label, "value": value if math.isfinite(value) else None}
            )
        except (ValueError, ZeroDivisionError, FloatingPointError):
            diagnostics.append({"label": label, "value": None})

    if len(used) <= 5000:
        diagnostic(
            "Normalidade dos resíduos (p de Shapiro-Wilk)",
            lambda: shapiro(model.resid).pvalue,
        )
    diagnostic(
        "Heterocedasticidade (p de Breusch-Pagan)",
        lambda: het_breuschpagan(model.resid, model.model.exog)[1],
    )
    diagnostic("Durbin-Watson na ordem da amostra", lambda: durbin_watson(model.resid))
    for j, k in enumerate(model.model.exog_names):
        if k != "const":
            diagnostic(
                "VIF · " + k, lambda: variance_inflation_factor(model.model.exog, j)
            )
    issues = list(
        dict.fromkeys(
            i["message"]
            for i in [
                *prepared.issues,
                *fit.issues,
                *assessment.issues,
                *assessment.normative.get("issues", []),
            ]
            if i.get("severity") not in {"info"} and i.get("message")
        )
    )
    return pack(
        {
            "point": assessment.value["point"],
            "meanCI": bounds("mean_ci80"),
            "predictionInterval": bounds("prediction_interval"),
            "coefficients": coefficients,
            "r2": model.rsquared,
            "adjustedR2": model.rsquared_adj,
            "n": len(used),
            "k": len(features),
            "fPValue": model.f_pvalue,
            "precision": prec.get("grade"),
            "amplitude": prec.get("amplitude_pct"),
            "items": items,
            "diagnostics": diagnostics,
            "issues": issues,
            "extrapolation": item4.get("detail")
            or "Consulte o item 4 do enquadramento.",
            "usedRows": used,
            "excludedRows": excluded,
            "residuals": residuals,
            "normative": assessment.normative,
            "value": assessment.value,
            "unit": req.get("unit"),
            "modelHash": fit.model_sha256,
            "sourceRevision": (Path(__file__).parent / "REVISION").read_text(),
        }
    )
