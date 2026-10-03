"""Keep Article wordCount equal to the final visible article text."""
import json, re
from pathlib import Path
from scripts.site.public_copy_scope import visible_text


def sync_word_count(text: str) -> str:
    article=re.search(r'<article\b.*?</article>',text,flags=re.I|re.S)
    if not article:return text
    words=len(visible_text(article.group(0)).split())
    def rewrite(match):
        data=json.loads(match.group(2));changed=False
        for node in data.get('@graph',[data]):
            if node.get('@type') in {'Article','TechArticle','BlogPosting'} and 'wordCount' in node and node['wordCount']!=words:
                node['wordCount']=words;changed=True
        if not changed:return match.group(0)
        return match.group(1)+json.dumps(data,ensure_ascii=False,separators=(',',':'))+match.group(3)
    return re.sub(r'(<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>)(.*?)(</script>)',rewrite,text,flags=re.S|re.I)


def sync(root: Path) -> list[str]:
    from scripts.site.scrub_em_dashes import iter_public_html
    changed=[]
    for path in iter_public_html(root):
        before=path.read_text(encoding='utf-8');after=sync_word_count(before)
        if before!=after:
            path.write_text(after,encoding='utf-8',newline='\n');changed.append(path.relative_to(root).as_posix())
    return changed


if __name__=='__main__':
    print(json.dumps({'updated':sync(Path(__file__).resolve().parents[2])}))
