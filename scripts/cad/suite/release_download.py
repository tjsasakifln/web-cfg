"""Download a pinned public GitHub release asset, even if its web gateway fails."""

import json
from pathlib import Path
import re
import shutil
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen

_GATEWAY_ERRORS = {408, 429, 500, 502, 503, 504}
_RELEASE = re.compile(
    r"/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)/releases/download/([^/]+)/([^/]+)"
)


def _copy(request: str | Request, destination: Path) -> None:
    with urlopen(request, timeout=90) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def download_release(url: str, destination: Path, sha256: str) -> None:
    """Fetch bytes into a temporary path; callers verify the pin before installing."""
    try:
        _copy(url, destination)
        return
    except (URLError, TimeoutError) as error:
        if isinstance(error, HTTPError) and error.code not in _GATEWAY_ERRORS:
            raise
        parsed = urlsplit(url)
        release = _RELEASE.fullmatch(parsed.path)
        if parsed.scheme != "https" or parsed.netloc != "github.com" or not release:
            raise

    owner, repo, encoded_tag, encoded_name = release.groups()
    tag, name = unquote(encoded_tag), unquote(encoded_name)
    api = f"https://api.github.com/repos/{owner}/{repo}/releases"
    with urlopen(Request(f"{api}/tags/{quote(tag, safe='')}",
                         headers={"Accept": "application/vnd.github+json"}), timeout=20) as response:
        assets = json.load(response)["assets"]
    matches = [asset for asset in assets if asset.get("name") == name]
    if len(matches) != 1 or type(matches[0].get("id")) is not int or matches[0]["id"] <= 0:
        raise ValueError(f"O arquivo fixado {name} não está na release {tag}.")
    asset = matches[0]
    if asset.get("digest") not in (None, f"sha256:{sha256}"):
        raise ValueError(f"O hash anunciado para {name} diverge da versão fixada.")
    _copy(Request(f"{api}/assets/{asset['id']}", headers={"Accept": "application/octet-stream"}),
          destination)
