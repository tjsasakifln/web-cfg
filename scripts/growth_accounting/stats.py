"""Pre-registered linear vs log(y+1) comparison. Stdlib only."""

from __future__ import annotations

import math
from typing import Any

from scripts.growth_accounting.constants import (
    AICC_DELTA_MIN,
    MIN_EXPONENTIAL_COHORTS,
    ROLLING_ORIGIN_MIN_TRAIN,
    ROLLING_ORIGIN_RMSE_IMPROVEMENT_MIN,
    SINGLE_ASSET_LIFT_MAX,
)


def ols(x: list[float], y: list[float]) -> tuple[float, float] | None:
    n = len(x)
    if n < 2 or n != len(y):
        return None
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    sxx = sum((xi - x_mean) ** 2 for xi in x)
    if sxx == 0:
        return None
    sxy = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    slope = sxy / sxx
    intercept = y_mean - slope * x_mean
    return intercept, slope


def sse(actual: list[float], predicted: list[float]) -> float:
    return sum((a - p) ** 2 for a, p in zip(actual, predicted))


def rmse(actual: list[float], predicted: list[float]) -> float:
    n = len(actual)
    if n == 0:
        return math.inf
    return math.sqrt(sse(actual, predicted) / n)


def aicc_gaussian(sum_sq_err: float, n: int, k: int) -> float | None:
    if n <= k + 1:
        return None
    if sum_sq_err <= 0:
        # Perfect fit: still defined via a tiny floor so AICc remains comparable.
        sum_sq_err = 1e-18
    aic = n * math.log(sum_sq_err / n) + 2 * k
    return aic + (2 * k * (k + 1)) / (n - k - 1)


def _predict_linear(params: tuple[float, float], t: float) -> float:
    return params[0] + params[1] * t


def _predict_log(params: tuple[float, float], t: float) -> float:
    return math.expm1(params[0] + params[1] * t)


def fit_models(y: list[float]) -> dict[str, Any]:
    n = len(y)
    t = [float(i) for i in range(n)]
    log_y = [math.log(value + 1.0) for value in y]
    linear = ols(t, y)
    logm = ols(t, log_y)
    result: dict[str, Any] = {
        "n": n,
        "y": y,
        "linear": None,
        "log": None,
        "rolling_origin": None,
        "aicc": None,
        "log_beats_linear": False,
        "r": None,
        "r_positive": False,
    }
    if linear is None or logm is None:
        return result
    lin_hat = [_predict_linear(linear, ti) for ti in t]
    log_hat = [_predict_log(logm, ti) for ti in t]
    lin_sse = sse(y, lin_hat)
    log_sse = sse(y, log_hat)
    k = 2
    lin_aicc = aicc_gaussian(lin_sse, n, k)
    log_aicc = aicc_gaussian(log_sse, n, k)
    result["linear"] = {
        "intercept": linear[0],
        "slope": linear[1],
        "sse": lin_sse,
        "rmse": rmse(y, lin_hat),
        "aicc": lin_aicc,
    }
    result["log"] = {
        "alpha": logm[0],
        "r": logm[1],
        "sse": log_sse,
        "rmse": rmse(y, log_hat),
        "aicc": log_aicc,
    }
    result["r"] = logm[1]
    result["r_positive"] = logm[1] > 0

    ro_lin: list[float] = []
    ro_log: list[float] = []
    min_train = ROLLING_ORIGIN_MIN_TRAIN
    if n > min_train:
        for cut in range(min_train, n):
            train_t = t[:cut]
            train_y = y[:cut]
            train_log = log_y[:cut]
            lin_p = ols(train_t, train_y)
            log_p = ols(train_t, train_log)
            if lin_p is None or log_p is None:
                continue
            actual = y[cut]
            ro_lin.append((actual - _predict_linear(lin_p, t[cut])) ** 2)
            ro_log.append((actual - _predict_log(log_p, t[cut])) ** 2)
    ro_rmse_lin = math.sqrt(sum(ro_lin) / len(ro_lin)) if ro_lin else None
    ro_rmse_log = math.sqrt(sum(ro_log) / len(ro_log)) if ro_log else None
    result["rolling_origin"] = {
        "min_train": min_train,
        "folds": len(ro_lin),
        "rmse_linear": ro_rmse_lin,
        "rmse_log": ro_rmse_log,
    }

    aicc_ok = (
        lin_aicc is not None
        and log_aicc is not None
        and (lin_aicc - log_aicc) >= AICC_DELTA_MIN
    )
    ro_ok = (
        ro_rmse_lin is not None
        and ro_rmse_log is not None
        and ro_rmse_lin > 0
        and ro_rmse_log <= ro_rmse_lin * (1.0 - ROLLING_ORIGIN_RMSE_IMPROVEMENT_MIN)
    )
    result["aicc"] = {
        "delta_linear_minus_log": None
        if lin_aicc is None or log_aicc is None
        else lin_aicc - log_aicc,
        "threshold": AICC_DELTA_MIN,
        "log_better": aicc_ok,
    }
    result["rolling_origin"]["improvement_min"] = ROLLING_ORIGIN_RMSE_IMPROVEMENT_MIN
    result["rolling_origin"]["log_better"] = ro_ok
    result["log_beats_linear"] = bool(aicc_ok and ro_ok)
    return result


def lift_share_by_asset(
    per_asset_series: dict[str, list[float]],
) -> dict[str, Any]:
    shares: dict[str, float] = {}
    total_first = 0.0
    total_last = 0.0
    for values in per_asset_series.values():
        if len(values) < 2:
            continue
        total_first += values[0]
        total_last += values[-1]
    total_lift = total_last - total_first
    dominant = None
    dominant_share = 0.0
    for asset_id, values in per_asset_series.items():
        if len(values) < 2:
            continue
        lift = values[-1] - values[0]
        share = 0.0 if total_lift == 0 else lift / total_lift
        shares[asset_id] = share
        if share > dominant_share:
            dominant_share = share
            dominant = asset_id
    return {
        "total_lift": total_lift,
        "shares": shares,
        "dominant_asset": dominant,
        "dominant_share": dominant_share,
        "exceeds_max": dominant_share > SINGLE_ASSET_LIFT_MAX and total_lift > 0,
        "max": SINGLE_ASSET_LIFT_MAX,
    }


def demand_faster_than_assets(clicks: list[float], assets: list[float]) -> bool:
    if len(clicks) < 2 or len(assets) < 2:
        return False
    if assets[0] <= 0 or assets[-1] <= 0:
        return False
    click_growth = (clicks[-1] + 1.0) / (clicks[0] + 1.0)
    asset_growth = assets[-1] / assets[0]
    return click_growth > asset_growth


def clicks_per_asset_not_falling(clicks: list[float], assets: list[float]) -> bool:
    if len(clicks) != len(assets) or len(clicks) < 2:
        return False
    series = []
    for click, asset in zip(clicks, assets):
        if asset <= 0:
            return False
        series.append(click / asset)
    return series[-1] >= series[0]


def eligible_exponential_length(n: int) -> bool:
    return n >= MIN_EXPONENTIAL_COHORTS
