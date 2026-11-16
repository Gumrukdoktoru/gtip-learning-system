#!/usr/bin/env python3
"""Konu esaslı mevzuat derlemesini (Markdown) okuyucu için JSON'a çevirir.

Kullanım:
    python3 apps/web/scripts/build-mevzuat-data.py <GUMRUK_MEVZUATI_TUMU.md> [çıktı klasörü]

Çıktı (varsayılan apps/web/public/data):
    index.json       konu listesi + Kanun/Yönetmelik madde dizinleri
    konu-<n>.json    her konunun blokları (başlık, paragraf, madde)
    refs.json        atıf önizlemesi için GK/GY madde metinleri
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SKIPPED_TOPICS = {0}  # 0: soru hazırlama promptu, mevzuat değil
PREVIEW_PARAGRAPHS = 14

TOPIC_RE = re.compile(r"^## (\d+)\. (.+)$")
ARTICLE_RE = re.compile(
    r"^(?:(GÜMRÜK KANUNU|GÜMRÜK YÖNETMELİĞİ|\d+ Say\.B[BK]K)\s+)?"
    r"(?:(GEÇİCİ|Geçici|EK|Ek)\s+)?"
    r"(?:MADDE|Madde)\s+(\d+)\s*(?:/\s*([A-Z]))?\s*[-–—]\s*(.*)$"
)
MARKER_RE = re.compile(
    r"^(?:(?:Değ\.|Yönetmelik Maddeleri|Genelgeler|Tasarruflu [Yy]azılar|Tassaruflu Yazılar|"
    r"Danıştay Kararları|Gerekçe|Kılavuz|Web kılavuz)[\s,\d]*)+$"
)
LINK_REMNANT_RE = re.compile(r"Genelgeler|Tasarruflu|Tassaruflu|Yönetmelik Maddeleri|Danıştay Kararları|^GGT\b")
KIND_LABELS = {"geçici": "Geçici", "ek": "Ek"}
DOC_TITLE_RE = re.compile(
    r"(KANUNU|Kanunu|YÖNETMELİĞİ|Yönetmeliği|YÖNETMELİK|TEBLİĞİ|Tebliği|TEBLİĞ|KARARI|SÖZLEŞMESİ|Sözleşmesi)"
)
NOT_HEADING_START_RE = re.compile(r"^(\(|\d+[.)\-]|[a-zçğıöşü]{1,2}\)|[-–—•§ü] )")
SOURCE_NAMES = {"GK": "Gümrük Kanunu", "GY": "Gümrük Yönetmeliği"}


def clean(line: str) -> str:
    text = line.replace("*", "").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def is_noise(text: str) -> bool:
    if not text or text.startswith("<!--"):
        return True
    if re.fullmatch(r"[-_=\s]{3,}", text):
        return True
    if MARKER_RE.match(text):
        return True
    # köprüleri silinmiş bağlantı listesi kalıntıları
    return len(text) <= 120 and bool(LINK_REMNANT_RE.search(text))


def is_heading(text: str) -> bool:
    if len(text) > 120 or text[-1] in ".;:,…" or NOT_HEADING_START_RE.match(text):
        return False
    return text[0].isupper() and sum(ch.isalpha() for ch in text) >= 3


def topic_title(raw: str) -> str:
    title = re.sub(r"^\d+\s*-\s*", "", raw).strip()
    return title[:1].upper() + title[1:]


class TopicParser:
    """Bir konunun satırlarını blok listesine çevirir."""

    def __init__(self, topic_id: int, used_ids: set[str]) -> None:
        self.topic_id = topic_id
        self.used_ids = used_ids
        self.blocks: list[dict] = []
        self.article: dict | None = None
        self.pending: list[str] = []  # madde başlığı adayı kısa satırlar
        self.doc: tuple[str, str] | None = None  # (kaynak kodu, belge adı)
        self.doc_fresh = False  # belge başlığından sonra henüz madde gelmedi
        self.last: tuple[str, int] | None = None  # (kaynak, madde no)
        self.seq = 0

    def feed(self, text: str) -> None:
        match = ARTICLE_RE.match(text)
        if match:
            self.start_article(match)
        elif is_heading(text):
            self.pending.append(text)
        else:
            self.flush_pending(as_headings=self.article is None)
            self.add_paragraph(text)

    def add_paragraph(self, text: str) -> None:
        if self.article is not None:
            self.article["p"].append(text)
        else:
            self.blocks.append({"t": "p", "x": text})

    def flush_pending(self, as_headings: bool) -> None:
        for text in self.pending:
            if (
                DOC_TITLE_RE.search(text)
                and text == text.upper()
                or text.startswith("Gümrük Genel Tebliği")
            ):
                self.set_doc(text)
            elif as_headings:
                self.blocks.append({"t": "h", "x": text})
            else:
                self.add_paragraph(text)
        self.pending = []

    def set_doc(self, text: str) -> None:
        self.article = None
        upper = text.upper()
        code = (
            "GK"
            if upper == "GÜMRÜK KANUNU"
            else "GY" if upper == "GÜMRÜK YÖNETMELİĞİ" else ""
        )
        last_block = self.blocks[-1] if self.blocks else None
        if last_block and last_block["t"] == "d" and self.doc_fresh:
            last_block["x"] += " " + text  # çok satırlı belge başlığı
            self.doc = (self.doc[0], last_block["x"])
            return
        self.blocks.append({"t": "d", "x": text})
        self.doc = (code, SOURCE_NAMES.get(code, text))
        self.doc_fresh = True

    def take_title(self) -> str:
        """Maddeden hemen önceki kısa satır madde başlığıdır; öncekiler ara başlıktır."""
        title = ""
        if self.pending and not (
            DOC_TITLE_RE.search(self.pending[-1]) and self.pending[-1].isupper()
        ):
            title = self.pending.pop()
        self.article = None
        self.flush_pending(as_headings=True)
        if self.pending:
            self.flush_pending(as_headings=True)
        return title

    def resolve_source(self, prefix: str | None, number: int) -> tuple[str, str]:
        if prefix == "GÜMRÜK KANUNU":
            return "GK", SOURCE_NAMES["GK"]
        if prefix == "GÜMRÜK YÖNETMELİĞİ":
            return "GY", SOURCE_NAMES["GY"]
        if prefix:
            return "", prefix
        if self.doc and self.doc_fresh:
            return self.doc
        if self.last and 0 <= number - self.last[1] <= 2:
            return self.last[0], SOURCE_NAMES.get(
                self.last[0], self.doc[1] if self.doc else ""
            )
        if self.doc and self.last is None:
            return self.doc
        if self.last is None and 1 < number <= 248:
            return (
                "GK",
                SOURCE_NAMES["GK"],
            )  # konu, belge başlığı olmadan Kanun maddesiyle açılıyor
        if self.doc and not self.doc[0]:
            return self.doc
        return "", ""

    def start_article(self, match: re.Match[str]) -> None:
        prefix, kind, number_text, letter, rest = match.groups()
        title = self.take_title()
        number = int(number_text)
        source, doc_name = self.resolve_source(prefix, number)
        if kind:
            source = ""  # geçici/ek maddeler asıl madde dizinine girmez
        no = number_text + (f"/{letter}" if letter else "")
        kind_label = KIND_LABELS["geçici" if kind[0] in "Gg" else "ek"] + " " if kind else ""
        label = f"{source + ' ' if source else ''}{kind_label}Madde {no}"
        self.seq += 1
        base = (
            f"{source.lower()}-{no.replace('/', '-')}"
            if source
            else f"k{self.topic_id}-{self.seq}"
        )
        article_id, dup = base, 2
        while article_id in self.used_ids:
            article_id, dup = f"{base}-v{dup}", dup + 1
        self.used_ids.add(article_id)
        self.article = {
            "t": "a",
            "id": article_id,
            "src": source,
            "no": no,
            "label": label,
            "title": title,
            "doc": doc_name,
            "p": [rest] if rest else [],
        }
        self.blocks.append(self.article)
        self.last = (source, number) if not kind else self.last
        self.doc_fresh = False

    def finish(self) -> list[dict]:
        self.flush_pending(as_headings=self.article is None)
        return self.blocks


def number_key(no: str) -> tuple[int, str]:
    digits, _, letter = no.partition("/")
    return int(digits), letter


def build(source_path: Path, out_dir: Path) -> None:
    lines = source_path.read_text(encoding="utf-8").split("\n")
    topics: list[tuple[int, str, list[str]]] = []
    for line in lines:
        match = TOPIC_RE.match(line)
        if match:
            topics.append((int(match.group(1)), topic_title(match.group(2)), []))
        elif topics:
            topics[-1][2].append(line)

    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("konu-*.json"):
        stale.unlink()
    used_ids: set[str] = set()
    index_topics, refs = [], {}
    law_index: dict[str, list[dict]] = {"GK": [], "GY": []}
    for topic_id, title, body in topics:
        if topic_id in SKIPPED_TOPICS:
            continue
        parser = TopicParser(topic_id, used_ids)
        for raw in body:
            text = clean(raw)
            if not is_noise(text):
                parser.feed(text)
        blocks = parser.finish()
        articles = [b for b in blocks if b["t"] == "a"]
        if not articles and not any(b["t"] == "p" for b in blocks):
            continue  # boş konu
        (out_dir / f"konu-{topic_id}.json").write_text(
            json.dumps(
                {"id": topic_id, "title": title, "blocks": blocks}, ensure_ascii=False
            ),
            encoding="utf-8",
        )
        index_topics.append(
            {
                "id": topic_id,
                "title": title,
                "articles": [
                    {"id": a["id"], "label": a["label"], "title": a["title"]}
                    for a in articles
                ],
            }
        )
        for article in articles:
            if article["src"] in law_index:
                law_index[article["src"]].append(
                    {
                        "id": article["id"],
                        "no": article["no"],
                        "title": article["title"],
                        "topic": topic_id,
                    }
                )
                refs[article["id"]] = {
                    "label": article["label"],
                    "title": article["title"],
                    "topic": topic_id,
                    "p": article["p"][:PREVIEW_PARAGRAPHS],
                    "more": len(article["p"]) > PREVIEW_PARAGRAPHS,
                }
    for entries in law_index.values():
        entries.sort(key=lambda e: (number_key(e["no"]), e["id"]))
    index = {"topics": index_topics, "gk": law_index["GK"], "gy": law_index["GY"]}
    (out_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "refs.json").write_text(
        json.dumps(refs, ensure_ascii=False), encoding="utf-8"
    )
    total = sum(len(t["articles"]) for t in index_topics)
    print(
        f"{len(index_topics)} konu, {total} madde (GK {len(law_index['GK'])}, GY {len(law_index['GY'])}) -> {out_dir}"
    )


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    default_out = Path(__file__).resolve().parent.parent / "public" / "data"
    build(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else default_out)


if __name__ == "__main__":
    main()
