"""One bounded, parameter-only scientific calculation. No user code or paths."""
from __future__ import annotations

import contextlib
import importlib
import importlib.metadata
import io
import json
import math
import os
from pathlib import Path
import resource
import sys
import warnings

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
OPERATIONS = {
    "memory": "memory",
    "section": "sections",
    "concrete": "concrete",
    "frame": "frames",
    "geotechnical": "geotechnical",
    "comfort": "comfort",
    "solar": "solar",
}


class InputError(ValueError):
    pass


def number(data, key, low, high, default=None):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise InputError(f"{key}: informe um número entre {low:g} e {high:g}.")
    return float(value)


def choice(data, key, allowed, default=None):
    value = data.get(key, default)
    if value not in allowed:
        raise InputError(f"{key}: opção inválida.")
    return value


def sequence(data, key, minimum, maximum):
    value = data.get(key)
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise InputError(f"{key}: informe de {minimum} a {maximum} registros.")
    return value


def exact_keys(data, allowed):
    if not isinstance(data, dict) or set(data) - set(allowed):
        raise InputError("Dados ou campos não reconhecidos.")


def finite_json(value):
    if hasattr(value, "tolist"):
        return finite_json(value.tolist())
    if hasattr(value, "item"):
        return finite_json(value.item())
    if isinstance(value, dict):
        return {str(k): finite_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite_json(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        raise InputError("O modelo não produziu resultado finito. Confira os dados e o domínio do método.")
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError("unsupported_result_type")


def calculation(operation, data):
    if operation not in OPERATIONS:
        raise InputError("Operação não reconhecida.")
    if not isinstance(data, dict):
        raise InputError("Dados de entrada inválidos.")
    module = importlib.import_module("operations." + OPERATIONS[operation])
    with contextlib.redirect_stdout(io.StringIO()), warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = module.calculate(data)
    return finite_json({"schema": "confenge.science-result/v1", "operation": operation, **result})


def set_limits():
    resource.setrlimit(resource.RLIMIT_CPU, (18, 20))
    resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def no_network(event, args):
    if event in {"socket.connect", "socket.bind", "socket.getaddrinfo", "os.system", "subprocess.Popen"}:
        raise PermissionError("external_io_disabled")


def main():
    set_limits()
    sys.addaudithook(no_network)
    # Importing this file from an operation must preserve the same error class.
    sys.modules["worker"] = sys.modules[__name__]
    try:
        raw = sys.stdin.buffer.read(480 * 1024 + 1)
        if len(raw) > 480 * 1024:
            raise InputError("O conjunto de dados excede 480 KiB.")
        request = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(InputError("Número inválido.")))
        exact_keys(request, {"operation", "data"})
        output = {"ok": True, "result": calculation(request.get("operation"), request.get("data"))}
    except InputError as exc:
        output = {"ok": False, "error": "INVALID_MODEL", "message": str(exc)}
    except (MemoryError, RecursionError):
        output = {"ok": False, "error": "MODEL_LIMIT", "message": "Reduza o tamanho ou a complexidade do modelo."}
    except (ValueError, KeyError, TypeError, ZeroDivisionError, ArithmeticError):
        output = {"ok": False, "error": "CALCULATION_FAILED", "message": "Não foi possível resolver este modelo. Confira unidades, geometria, apoios e faixas do método."}
    except Exception:
        output = {"ok": False, "error": "CALCULATION_UNAVAILABLE", "message": "O cálculo está temporariamente indisponível."}
    encoded = json.dumps(output, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if len(encoded.encode()) > 2 * 1024 * 1024:
        encoded = '{"ok":false,"error":"MODEL_LIMIT","message":"O resultado excede o limite. Reduza o modelo."}'
    sys.stdout.write(encoded)


if __name__ == "__main__":
    main()
