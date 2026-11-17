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
    sorular-diger.json   [{sinav, sorular: [...]}]  (Kanun/Yönetmelik dışı sorular; "ilgili": otomatik eşleşen madde)
    sorular-sinav.json   [{sinav, yil, sorular: [...]}] (bütün sorular, sınavlara göre)
"""
from __future__ import annotations

import html
import json
import math
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


STOP_PREFIXES = {"aşağı", "hangi", "göre", "ilişk", "doğru", "yanlı", "değil", "olara", "tarif", "gümrü", "madde", "sayıl", "yukar", "veril", "ifade"}
MATCH_THRESHOLD = 0.35  # altındaki eşleşmeler güvenilir değil


def tokens(text: str) -> set[str]:
    words = re.findall(r"[0-9a-zçğıöşü]{4,}", text.lower().replace("İ", "i").replace("I", "ı"))
    return {w[:6] for w in words if w[:5] not in STOP_PREFIXES}


class ArticleMatcher:
    """Maddeye bağlı olmayan soruyu, derlemedeki en benzer maddeyle eşleştirir (TF-IDF benzeri)."""

    def __init__(self) -> None:
        self.articles: list[tuple[str, str, set[str]]] = []
        self.names: dict[str, str] = {}
        self.paragraphs: dict[str, list[str]] = {}
        loaded = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(DATA_DIR.glob("konu-*.json"))]
        for path in sorted(DATA_DIR.glob("ek-*.json")):  # diğer not dosyalarının konu paketleri
            loaded += json.loads(path.read_text(encoding="utf-8"))
        for topic in loaded:
            for block in topic["blocks"]:
                if block["t"] == "a":
                    name = " · ".join(x for x in (block["doc"], block["label"], block["title"]) if x)
                    self.articles.append((block["id"], name, tokens(block["title"] + " " + " ".join(block["p"]))))
                    self.names[block["id"]] = name
                    self.paragraphs[block["id"]] = block["p"]
        counts: dict[str, int] = {}
        for _, _, bag in self.articles:
            for token in bag:
                counts[token] = counts.get(token, 0) + 1
        total = len(self.articles)
        self.idf = {token: math.log(total / count) for token, count in counts.items()}
        self.norms = [math.sqrt(sum(self.idf[t] ** 2 for t in bag)) or 1.0 for _, _, bag in self.articles]

    def basis(self, question: dict, article_ids: list[str]) -> dict | None:
        """Sorunun dayanağı: bağlı maddelerde soru kökü ve doğru şıkla en çok örtüşen hüküm."""
        answer = [o for o in question["siklar"] if o.startswith(question["cevap"] + ")")] if len(question["cevap"]) == 1 else []
        bag = tokens(" ".join(question["kok"] + answer))
        best: tuple[float, str, str] | None = None
        for article_id in article_ids:
            for paragraph in self.paragraphs.get(article_id, []):
                shared = bag & tokens(paragraph)
                score = sum(self.idf.get(t, 0.0) for t in shared)
                if len(shared) >= 2 and (best is None or score > best[0]):
                    best = (score, article_id, paragraph)
        if best is None:
            return None
        text = best[2] if len(best[2]) <= 700 else best[2][:700].rsplit(" ", 1)[0] + " …"
        return {"id": best[1], "ad": self.names[best[1]], "metin": text}

    def best(self, question: dict) -> dict | None:
        answer = [o for o in question["siklar"] if o.startswith(question["cevap"] + ")")] if len(question["cevap"]) == 1 else []
        bag = {t for t in tokens(" ".join(question["kok"] + answer)) if t in self.idf}
        norm = math.sqrt(sum(self.idf[t] ** 2 for t in bag))
        if len(bag) < 4 or not norm:
            return None
        score, at = max(
            (sum(self.idf[t] ** 2 for t in bag & other) / (norm * self.norms[i]), i)
            for i, (_, _, other) in enumerate(self.articles)
        )
        if score < MATCH_THRESHOLD:
            return None
        return {"id": self.articles[at][0], "ad": self.articles[at][1], "puan": round(score, 2)}


UNKNOWN_EXAM: list[dict] = []
SUPPLEMENT_FILE = Path(__file__).resolve().parent / "ek-sinavlar.json"


def merge_supplement(exams: dict[str, dict[int, dict]]) -> int:
    """Sınav PDF'lerinden çıkarılan tam kitapçıkları (ek-sinavlar.json) esas alır.

    Kitapçığın numarası ve metni PDF'ten gelir; aynı sorunun madde bağlantısı, kök metni
    eşleşen mevcut sorudan taşınır. PDF kitapçığında bulunmayan mevcut sorular ayrı tutulur.
    """
    if not SUPPLEMENT_FILE.exists():
        return 0
    added = 0
    for exam in json.loads(SUPPLEMENT_FILE.read_text(encoding="utf-8")):
        old = exams.get(exam["sinav"], {})
        by_stem = {squash(" ".join(q["kok"]))[:60]: q for q in old.values()}
        items: dict[int, dict] = {}
        for question in exam["sorular"]:
            match = by_stem.pop(squash(" ".join(question["kok"]))[:60], None)
            items[question["no"]] = {
                "id": match["id"] if match else "", "sinav": f"Soru {question['no']} · {exam['sinav']}",
                "kok": question["kok"], "siklar": question["siklar"], "cevap": question["cevap"],
                **({"madde": match["madde"]} if match and match.get("madde") else {}),
                **({"ilgili": match["ilgili"]} if match and match.get("ilgili") else {}),
                **({"dayanak": match["dayanak"]} if match and match.get("dayanak") else {}),
            }
            added += match is None
        exams[exam["sinav"]] = items
        if by_stem:
            exams[exam["sinav"] + " (kitapçık dışı)"] = dict(enumerate(by_stem.values(), 1))
    return added


MISC_GROUP = "Diğer sınav ve kaynaklardan tekil sorular"


def build_booklets(exams: dict[str, dict[int, dict]], year) -> list[dict]:
    """Tam kitapçıkları (>= 40 soru) sıra numarasıyla, eksik numaraları belirterek döndürür.

    Birkaç soruluk parça gruplar ve kitapçık boyunu aşan numaralar tek bir "tekil sorular"
    başlığında toplanır; kitapçıklarda zaten bulunan sorular oraya tekrar yazılmaz.
    """
    booklets, loose = [], []
    for name, items in sorted(exams.items(), key=lambda pair: (year(pair[0]), pair[0])):
        if len(items) < 40 or name.startswith("Sınavı belirtilmemiş"):
            loose += items.values()
            continue
        size = 100 if len(items) > 80 else 80 if len(items) > 50 else 50
        inside = {n: q for n, q in items.items() if 1 <= n <= size}
        loose += [q for n, q in items.items() if n not in inside]
        booklets.append({
            "sinav": name, "yil": year(name), "toplam": size,
            "eksik": [n for n in range(1, size + 1) if n not in inside],
            "sorular": [inside[n] for n in sorted(inside)],
        })
    seen = {squash(" ".join(q["kok"]))[:80] for b in booklets for q in b["sorular"]}
    extra = []
    for question in loose:
        key = squash(" ".join(question["kok"]))[:80]
        if key not in seen:
            seen.add(key)
            extra.append(question)
    return booklets + [{"sinav": MISC_GROUP, "yil": 0, "sorular": extra}]


def exam_key(question: dict) -> tuple[str, int]:
    """'Soru 46 · Sınav · tarih' -> ('Sınav · tarih', 46)"""
    head, _, rest = question["sinav"].partition(" · ")
    number = re.search(r"\d+", head)
    if not rest:  # sınav bilgisi olmayan sorular tek başlıkta toplanır
        UNKNOWN_EXAM.append(question)
        return "Sınavı belirtilmemiş sorular", len(UNKNOWN_EXAM)
    return rest, int(number.group()) if number else 0


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

    topics = json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))["topics"]
    labels = {a["id"]: a["label"] for t in topics for a in t["articles"]}
    matcher = ArticleMatcher()
    by_article: dict[str, list[dict]] = {}
    exams: dict[str, dict[int, dict]] = {}
    for container, _, question in scan(law_html) + scan(regulation_html):
        if not container:
            continue
        key = article_id(container)
        ground = matcher.basis(question, [key])
        if ground:
            question["dayanak"] = ground
        if question["siklar"]:
            by_article.setdefault(key, []).append(question)
        name, number = exam_key(question)
        entry = exams.setdefault(name, {}).setdefault(number, {**question, "madde": []})
        code, _, no = key.partition("-")
        link = {"id": key if key in labels else "", "ad": labels.get(key, f"{code.upper()} Madde {no.replace('-', '/')}")}
        if link not in entry["madde"]:
            entry["madde"].append(link)

    groups: dict[str, list[dict]] = {}
    matched = 0
    for _, group, question in scan(other_html):
        related = matcher.best(question) if question["siklar"] else None
        if related:
            question["ilgili"] = related
            ground = matcher.basis(question, [related["id"]])
            if ground:
                question["dayanak"] = ground
            matched += 1
        if question["siklar"]:
            groups.setdefault(group, []).append(question)
        name, number = exam_key(question)
        exams.setdefault(name, {}).setdefault(number, question)

    missing = sorted(k for k in by_article if k not in labels)
    for key in missing:  # derlemede karşılığı olmayan maddeler: sorular kaybolmasın
        code, _, number = key.partition("-")
        groups[f"Maddesi derlemede ayrılamayan sorular · {code.upper()} Madde {number.replace('-', '/')}"] = by_article[key]
    total = sum(len(v) for v in by_article.values())
    by_article = {k: v for k, v in by_article.items() if k in labels}
    attached = sum(len(v) for v in by_article.values())

    def year(name: str) -> int:
        found = re.findall(r"(?:19|20)\d\d", name)
        return int(found[-1]) if found else 0

    added = merge_supplement(exams)
    exam_list = build_booklets(exams, year)
    print(f"ek kaynaktan (PDF) tamamlanan soru: {added}")
    other = [{"sinav": name, "sorular": items} for name, items in groups.items()]
    for file, payload in (("sorular-madde.json", by_article), ("sorular-diger.json", other), ("sorular-sinav.json", exam_list)):
        (DATA_DIR / file).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    print(f"madde soruları: {total}; derlemede karşılığı olan: {attached}; karşılığı olmayan madde: {len(missing)}")
    print(f"diğer sorular: {sum(len(g['sorular']) for g in other)}; otomatik ilgili madde bulunan: {matched}")
    for exam in exam_list:
        gaps = exam.get("eksik", [])
        print(f"  {exam['sinav'][:60]:60} {len(exam['sorular'])}/{exam.get('toplam', '-')} eksik: {gaps if len(gaps) <= 12 else str(len(gaps)) + ' soru'}")
    if exam_files:
        verify([q for e in exam_list for q in e["sorular"]], exam_files)


if __name__ == "__main__":
    main()
