"""把字体与脚本内联进模板，产出自包含的单文件网页。"""
import base64
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
OUT_DIRS = [ROOT / "repo", ROOT.parent / "outputs" / "henshishui"]


def main() -> int:
    template = (SITE / "src" / "page.html").read_text(encoding="utf-8")
    poems_js = (SITE / "src" / "poems.js").read_text(encoding="utf-8")
    scene_js = (SITE / "src" / "scene.js").read_text(encoding="utf-8")
    poem_font = base64.b64encode((ROOT / "build" / "poem.woff2").read_bytes()).decode("ascii")
    title_font = base64.b64encode((ROOT / "build" / "title.woff2").read_bytes()).decode("ascii")

    html = template
    html = html.replace("__FONT_POEM__", poem_font)
    html = html.replace("__FONT_TITLE__", title_font)
    html = html.replace("__POEMS_JS__", poems_js)
    html = html.replace("__SCENE_JS__", scene_js)
    for token in ["__FONT_POEM__", "__FONT_TITLE__", "__POEMS_JS__", "__SCENE_JS__"]:
        assert token not in html, f"unreplaced placeholder: {token}"

    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / "index.html"
        target.write_text(html, encoding="utf-8")
        print(f"{target}: {target.stat().st_size / 1024:.1f} KB")

    # 仓库里同时保留可读源码，便于二次修改
    repo = ROOT / "repo"
    (repo / "src").mkdir(parents=True, exist_ok=True)
    (repo / "tools").mkdir(parents=True, exist_ok=True)
    (repo / "src" / "fonts").mkdir(parents=True, exist_ok=True)
    for name in ["page.html", "poems.js", "scene.js"]:
        shutil.copyfile(SITE / "src" / name, repo / "src" / name)
    shutil.copyfile(ROOT / "build" / "poem.woff2", repo / "src" / "fonts" / "poem.woff2")
    shutil.copyfile(ROOT / "build" / "title.woff2", repo / "src" / "fonts" / "title.woff2")
    shutil.copyfile(Path(__file__).resolve(), repo / "tools" / "build_site.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
