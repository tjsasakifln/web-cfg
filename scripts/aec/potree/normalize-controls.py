from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
import re

ORIGINAL_SHA256 = "c53cd9954c25746e286155fc76ab3c0de8b8f7efd3f9a37c6e74b8d8d7bddd18"
ORIGINAL_CSS_SHA256 = "541e8dafc86ba3704763c35927552b15788fc0df15581d040a1a2b16a9dcd50d"
DECORATION = re.compile(r"\s*(?:border(?:-[a-z-]+)?-radius|box-shadow):[^;{}]+;")
STYLE = re.compile(r'(?:(?<=\s)|(?<=\\t)|(?<=\\n))style="([^"<>\\{}]*)"')


def patch(original: Path, javascript: Path, css: Path, original_css: Path, site_css: Path) -> None:
    source = original.read_bytes()
    if sha256(source).hexdigest() != ORIGINAL_SHA256:
        raise ValueError("O build Potree de origem não corresponde à versão revisada.")
    source_css = original_css.read_bytes()
    if sha256(source_css).hexdigest() != ORIGINAL_CSS_SHA256:
        raise ValueError("A folha Potree de origem não corresponde à versão revisada.")
    site_css.write_text(DECORATION.sub("", source_css.decode("utf-8")).replace("\r\n", "\n"),
                        encoding="utf-8", newline="\n")
    styles: dict[str, str] = {}

    def replace_style(match: re.Match[str]) -> str:
        declaration = match.group(1).strip()
        if not declaration:
            return ""
        if ":" not in declaration or "url(" in declaration.lower():
            return match[0]
        normalized = re.sub(r"(^|;\s*)whitespace:", r"\1white-space:", declaration)
        key = styles.setdefault(DECORATION.sub("", normalized), f"p{len(styles) + 1}")
        return f'data-confenge-potree-style="{key}"'

    text = STYLE.sub(replace_style, source.decode("utf-8"))
    handler = ' oncontextmenu="return false;"'
    if text.count(handler) != 1:
        raise ValueError("A anotação padrão do Potree precisa de nova revisão.")
    text = text.replace(handler, "")
    javascript.write_text(text, encoding="utf-8", newline="\n")
    css.write_text("".join(
        f'.cloud-page [data-confenge-potree-style="{key}"] {{ {declaration.rstrip(";")}; }}\n'
        for declaration, key in styles.items()
    ), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    parser = ArgumentParser()
    for name in ("original", "javascript", "css", "original_css", "site_css"):
        parser.add_argument(name, type=Path)
    patch(**vars(parser.parse_args()))
