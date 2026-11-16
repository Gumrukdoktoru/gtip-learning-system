#!/usr/bin/env python3
"""Madde esaslı derleme sayfasındaki sınav sorularını okuyucu verisine çevirir.

Kullanım:
    python3 apps/web/scripts/build-sorular-data.py <kanun.html> <yonetmelik.json> <diger.json> \
        [--dogrula sinav1.md sinav2.md ...]

Girdi: derleme sayfasının HTML'i ile Yönetmelik ve "diğer sorular" bölümlerinin JSON yanıtları.
Yalnızca soru kökü, şıklar, doğru cevap ve sorunun bağlı olduğu madde alınır; kaynak sayfanın
kendi gerekçe/yorum metinleri alınmaz.

Çıktı (apps/web/public/data):
    sorular-madde.json   {madde kimliği: [soru, ...]}
    sorular-diger.json   [{sinav, sorular: [...]}]  (Kanun/Yönetmelik dışı sorular)
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
CONTAINER_RE = re.compile(r'<(?:article|section)\b[^>]*\bid="(m\d+(?:-[A-Z])?|gy-[\w-]+)"')
GROUP_RE = re.compile(r'<details class="other-exam-group"[^>]*><summary>(.*?)</summary>', re.S)
QUESTION_RE = re.compile(r'<details class="question[^"]*"([^>]*)><summary>(.*?)</summary>', re.S)
PARA_RE = re.compile(r'<p(?: class="([^"]*)")?[^>]*>(.*?)</p>', re.S)
ID_RE = re.compile(r'data-(?:question-id|source-question-ids)="([^"]+)"')
ANSWER_RE = re.compile(r'class="answer-result">(.*?)</p>', re.S)
SKIPPED_CLASSES = {"exam-source-note", "exam-period"}


def plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def parse_question(attrs: str, summary: str, body: str) -> dict:
    head, _, tail = body.partition('<details class="answer"')
    stem, options = [], []
    for css, inner in PARA_RE.findall(head):
        text = plain(inner)
        if not text or css in SKIPPED_CLASSES:
            continue
        (options if css == "question-option" else stem).append(text)
    result = ANSWER_RE.search(tail)
    answer = plain(result.group(1)).removeprefix("Doğru cevap:").strip() if result else ""
    letter = re.match(r"([A-E])\b", answer)
    ident = ID_RE.search(attrs)
    return {
        "id": ident.group(1) if ident else "",
        "sinav": plain(summary),
        "kok": stem,
        "siklar": options,
        "cevap": letter.group(1) if letter else answer,
    }


def scan(markup: str) -> list[tuple[str, str, dict]]:
    """(madde kimliği, sınav grubu, soru) üçlülerini belge sırasıyla döndürür."""
    marks = [(m.start(), "c", m) for m in CONTAINER_RE.finditer(markup)]
    marks += [(m.start(), "g", m) for m in GROUP_RE.finditer(markup)]
    marks += [(m.start(), "q", m) for m in QUESTION_RE.finditer(markup)]
    marks.sort(key=lambda mark: mark[0])
    found, container, group = [], "", ""
    for i, (_, kind, match) in enumerate(marks):
        if kind == "c":
            container = match.group(1)
        elif kind == "g":
            group = plain(match.group(1))
        else:
            end = marks[i + 1][0] if i + 1 < len(marks) else len(markup)
            found.append((container, group, parse_question(match.group(1), match.group(2), markup[match.end():end])))
    return found


def article_id(container: str) -> str:
    return "gk-" + container[1:] if container.startswith("m") else container


def squash(text: str) -> str:
    return re.sub(r"[^0-9a-zçğıöşü]", "", text.lower().replace("İ", "i").replace("I", "ı"))


def verify(questions: list[dict], exam_files: list[Path]) -> None:
    corpus = squash("\n".join(path.read_text(encoding="utf-8") for path in exam_files))
    checked = [q for q in questions if q["kok"] and len(squash(q["kok"][0])) >= 30]
    hits = sum(squash(q["kok"][0])[:30] in corpus for q in checked)
    print(f"doğrulama: {len(checked)} sorudan {hits} tanesinin kökü eldeki sınav dosyalarında bulundu")


def main() -> None:
    args = sys.argv[1:]
    exam_files: list[Path] = []
    if "--dogrula" in args:
        split = args.index("--dogrula")
        args, exam_files = args[:split], [Path(p) for p in args[split + 1:]]
    if len(args) != 3:
        sys.exit(__doc__)
    law_html = Path(args[0]).read_text(encoding="utf-8")
    regulation_html = json.loads(Path(args[1]).read_text(encoding="utf-8"))["html"]
    other_html = json.loads(Path(args[2]).read_text(encoding="utf-8"))["html"]

    by_article: dict[str, list[dict]] = {}
    for container, _, question in scan(law_html) + scan(regulation_html):
        if container and question["siklar"]:
            by_article.setdefault(article_id(container), []).append(question)
    groups: dict[str, list[dict]] = {}
    for _, group, question in scan(other_html):
        if question["siklar"]:
            groups.setdefault(group, []).append(question)

    known = {a["id"] for t in json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))["topics"] for a in t["articles"]}
    missing = sorted(k for k in by_article if k not in known)
    for key in missing:  # derlemede karşılığı olmayan maddeler: sorular kaybolmasın
        code, _, number = key.partition("-")
        groups[f"Maddesi derlemede ayrılamayan sorular · {code.upper()} Madde {number.replace('-', '/')}"] = by_article[key]
    attached = sum(len(v) for k, v in by_article.items() if k in known)
    total = sum(len(v) for v in by_article.values())
    by_article = {k: v for k, v in by_article.items() if k in known}
    (DATA_DIR / "sorular-madde.json").write_text(json.dumps(by_article, ensure_ascii=False), encoding="utf-8")
    other = [{"sinav": name, "sorular": items} for name, items in groups.items()]
    (DATA_DIR / "sorular-diger.json").write_text(json.dumps(other, ensure_ascii=False), encoding="utf-8")

    print(f"madde soruları: {total} ({len(by_article) + len(missing)} madde); derlemede karşılığı olan: {attached}")
    print(f"karşılığı olmayan madde: {len(missing)} -> {', '.join(missing[:40])}")
    print(f"diğer sorular: {sum(len(g['sorular']) for g in other)} ({len(other)} sınav)")
    if exam_files:
        verify([q for v in by_article.values() for q in v] + [q for g in other for q in g["sorular"]], exam_files)


if __name__ == "__main__":
    main()
