#!/usr/bin/env python3
"""Konu esaslı mevzuat derlemesini (Markdown) okuyucu için JSON'a çevirir.

Kullanım:
    python3 apps/web/scripts/build-mevzuat-data.py <GUMRUK_MEVZUATI_TUMU.md> [--yys <3-YYS.md>] [--ek <not dosyaları>...]

Çıktı (varsayılan apps/web/public/data):
    index.json       konu listesi + Kanun/Yönetmelik/YYS Yönetmeliği madde dizinleri
    konu-<n>.json    her konunun blokları (başlık, paragraf, madde)
    refs.json        atıf önizlemesi için GK/GY/YYS madde metinleri

--yys verilmezse scripts/kaynaklar/3-YYS.md (Gümrük İşlemlerinin Kolaylaştırılması Yönetmeliği notu) kullanılır.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from types import ModuleType

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
YYS_NAME = "Gümrük İşlemlerinin Kolaylaştırılması Yönetmeliği"
SOURCE_NAMES = {"GK": "Gümrük Kanunu", "GY": "Gümrük Yönetmeliği", "YYS": YYS_NAME}
YYS_FILE = Path(__file__).resolve().parent / "kaynaklar" / "3-YYS.md"


# Eğitmen/kurum tanıtım satırları (sayfa altlıkları, kapak imzası) hiçbir çıktıya alınmaz.
BRAND_RE = re.compile(
    r"(?:[Hh][Aa][Rr][Uu][Nn]\s+)?[Aa][Ll][Tt][Iıİi][Nn][Ss][Oo][Yy](?:\s+Gümrük Eğitim ve Danışmanlık Hizmetleri(?:\s+\d+)?)?"
)
BRAND_LINE_LIMIT = 120


def strip_branding(text: str) -> str:
    """Tanıtım satırını tümüyle atar; ad uzun bir cümlenin içindeyse yalnızca adı çıkarır."""
    if not BRAND_RE.search(text):
        return text
    if len(text) <= BRAND_LINE_LIMIT:
        return ""
    return re.sub(r"\s+", " ", BRAND_RE.sub("", text)).strip()


def clean(line: str) -> str:
    text = line.replace("*", "").replace(" ", " ")
    return strip_branding(re.sub(r"\s+", " ", text).strip())


def is_noise(text: str) -> bool:
    if not text or text.startswith("<!--") or text.startswith("![](assets/"):
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
        self.plain_source = False  # ek kaynaklar: GK/GY dizinine madde eklenmez

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
        if self.plain_source:
            source = ""
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


YYS_TOPIC_TITLE = "YYS Yönetmeliği"  # maddelerin üst satırında Yönetmeliğin tam adı ayrıca yazılır
YYS_ARTICLE_RE = re.compile(r"^MADDE\s+(\d+)(?:\s*/\s*([A-Z]))?(?:\s*[-–—]\s*(.+))?$")
YYS_PART_RE = re.compile(r"^(?:[A-ZÇĞİÖŞÜ]+ )?(?:KİTAP|KISIM|BÖLÜM)$")
YYS_MATCH_SHARE = 0.8  # konunun YYS notu sayılması için madde başlıklarının en az bu kadarı konuda bulunmalı


def parse_yys(lines: list[str]) -> list[dict]:
    """Gümrük İşlemlerinin Kolaylaştırılması Yönetmeliği notunu madde madde bloklara çevirir (kaynak kodu YYS).

    Notta her madde tek başına "**MADDE N**" satırıyla açılır; hemen önceki satır maddenin başlığıdır, onun önündeki
    "BİRİNCİ KİTAP / KISIM / BÖLÜM" + ad satır çiftleri ara başlıktır ("h" bloğu). Bölüm adı doğrudan maddeden önce
    geliyorsa (madde başlığı yok) bölüm adı madde başlığı olarak da kullanılır. Maddenin ortasında aynı numarayla
    tekrarlanan "MADDE 4 – <başlık>" satırı yeni madde açmaz ve atlanır. Metin değiştirilmez; yalnızca ** işaretleri atılır.
    Kimlikler: yys-16, harfli maddelerde yys-4-a.
    """
    texts = [t for t in (clean(line) for line in lines) if t]
    heads: list[tuple[int, re.Match[str]]] = []
    skipped: set[int] = set()
    for at, text in enumerate(texts):
        match = YYS_ARTICLE_RE.match(text)
        if not match:
            continue
        if match.group(3) and heads and heads[-1][1].group(1, 2) == match.group(1, 2):
            skipped.add(at)  # aynı maddenin devamında tekrarlanan başlık
        else:
            heads.append((at, match))
    blocks: list[dict] = []
    preambles = []  # (önsözün başladığı satır, ara başlıklar, madde başlığı)
    floor = 0
    for at, _ in heads:
        start, parts, title = at, [], ""
        if start - 2 >= floor and YYS_PART_RE.match(texts[start - 2]):
            title = texts[start - 1]  # bölüm adı maddenin de başlığıdır
            parts.append(f"{texts[start - 2]} — {texts[start - 1]}")
            start -= 2
        elif start - 1 >= floor:
            title = texts[start - 1]
            start -= 1
        while start - 2 >= floor and YYS_PART_RE.match(texts[start - 2]):
            parts.insert(0, f"{texts[start - 2]} — {texts[start - 1]}")
            start -= 2
        preambles.append((start, parts, title))
        floor = at + 1
    blocks += [{"t": "p", "x": text} for text in texts[: preambles[0][0] if preambles else len(texts)]]
    for number, ((at, match), (_, parts, title)) in enumerate(zip(heads, preambles)):
        end = preambles[number + 1][0] if number + 1 < len(preambles) else len(texts)
        letter = match.group(2) or ""
        no = match.group(1) + (f"/{letter}" if letter else "")
        blocks += [{"t": "h", "x": part} for part in parts]
        blocks.append({
            "t": "a", "id": f"yys-{match.group(1)}" + (f"-{letter.lower()}" if letter else ""), "src": "YYS", "no": no,
            "label": f"YYS Madde {no}", "title": title, "doc": YYS_NAME,
            "p": [text for i, text in enumerate(texts[at + 1:end], at + 1) if i not in skipped],
        })
    return blocks


def find_yys_topic(topics: list[tuple[int, str, list[str]]], yys_lines: list[str]) -> int | None:
    """Ana derlemede YYS notunun aynısını taşıyan konu (madde başlıklarının çoğu konuda geçiyorsa); yoksa None."""
    wanted = {t for t in (clean(line) for line in yys_lines) if YYS_ARTICLE_RE.match(t)}
    best, share = None, 0.0
    for topic_id, _, body in topics:
        found = wanted & {t for t in (clean(line) for line in body) if YYS_ARTICLE_RE.match(t)}
        if wanted and len(found) / len(wanted) > share:
            best, share = topic_id, len(found) / len(wanted)
    if best is None or share < YYS_MATCH_SHARE:
        return None
    body = next(b for i, _, b in topics if i == best)
    mine = [t for t in (clean(line) for line in body) if t and not is_noise(t)]
    theirs = [t for t in (clean(line) for line in yys_lines) if t]
    if mine == theirs:
        print(f"YYS notu: ana derlemenin {best}. konusuyla aynı; konu YYS dosyasından madde madde kurulur")
    else:
        extra, missing = len(set(mine) - set(theirs)), len(set(theirs) - set(mine))
        print(f"UYARI: {best}. konu YYS notundan farklı (konuda fazla {extra}, eksik {missing} satır); YYS dosyası esas alındı")
    return best


SECTION_LIMIT = 200_000  # tek konunun en fazla boyutu
PAGE_CHUNK = 40_000  # sayfa sayfa aktarılmış dosyalarda konu boyutu
BUNDLE_BYTES = 300_000  # ek-*.json paket boyutu
PAGE_RE = re.compile(r"^Sayfa (\d+)$")
TABLE_RULE_RE = re.compile(r"^\|?[\s:|-]+\|?$")
GROUPS = [("tarife", "Tarife"), ("genelge", "Genelge ve Tebliğler"), ("sair", "Sair Mevzuat"), ("hesap", "Vergi Hesaplama")]
# (dosya adında aranan parça, sekme, klasör adı); ilk eşleşen kullanılır
FOLDER_RULES = [
    ("TARIFE_ANA", "tarife", "Tarife Ana Derleme"),
    ("FASIL", "tarife", "Tarife Cetveli — Fasıllar (01–97), fasıl fasıl"),
    ("GENELGE", "genelge", "Genelge, Tebliğ ve Kararlar"),
    ("VERGI_HESAPLAMA", "hesap", "Vergi Hesaplama Derlemesi"),
    ("Hesaplama", "hesap", "Çıkmış vergi hesaplama soruları (soru + çözüm)"),
    ("ck_2020", "sair", "İthalat Rejimi Kararı (2020/3350)"),
    ("ck_2025", "sair", "İthalat Rejimi Kararında Değişiklik (2025/10790)"),
    ("Koleksiyon", "sair", "Gümrük Mevzuatı Koleksiyonu"),
    ("STA ve", "sair", "Serbest Ticaret Anlaşmaları ve Kümülasyon"),
    ("Teslim", "sair", "Teslim Şekilleri (INCOTERMS)"),
    ("MEVZUAT K", "sair", "Sair Mevzuat Kitabı (KDV, ÖTV, TPKHK…)"),
]


def pretty_title(title: str) -> str:
    if "_" in title and " " not in title:  # dosya adından gelen başlık
        title = title.replace("_x1", " (").replace("x2_", ") ").replace("x2", ")").replace("_", " ").strip().capitalize()
    return title[:140]


TOPIC_MIN_BYTES = 12_000  # sayfa dökümlerinde bir konunun en az boyutu


def is_topic_heading(text: str) -> bool:
    """Sayfa dökümlerinde konu başlığı: rakamsız, tamamı büyük harfli kısa satır."""
    if not 10 <= len(text) <= 80 or text != text.upper() or len(text.split()) < 2:
        return False
    if any(ch.isdigit() or ch in "=•|%" for ch in text) or text[-1] in ".,;:":
        return False
    return sum(ch.isalpha() for ch in text) > len(text) * 0.7


def split_page_dump(lines: list[str]) -> list[tuple[str, list[str]]]:
    """Sayfa sayfa aktarılmış dosyayı içindeki konu başlıklarına göre böler; başlığa sayfa aralığı eklenir."""
    sections: list[list] = []  # [başlık, satırlar, ilk sayfa, son sayfa, boyut]
    page = 1
    for line in lines:
        text = clean(line.lstrip("# "))
        page_match = PAGE_RE.match(text)
        if page_match:
            page = int(page_match.group(1))
            continue
        if line.startswith("# "):
            continue  # dosya başlığı
        if is_topic_heading(text) and (not sections or sections[-1][4] >= TOPIC_MIN_BYTES):
            sections.append([text, [], page, page, 0])
        elif not sections:
            sections.append(["Giriş", [], page, page, 0])
        sections[-1][1].append(line)
        sections[-1][3] = page
        sections[-1][4] += len(line)
    result = []
    for title, body, first, last, size in sections:
        if size >= 40:
            pages = f"s. {first}" if first == last else f"s. {first}–{last}"
            result.append((f"{title[:1]}{title[1:].lower()} ({pages})" if False else f"{title} ({pages})", body))
    return result


OUTLINE_FILE = Path(__file__).resolve().parent / "sayfa-konulari.json"


def split_by_outline(lines: list[str], outline: list[dict]) -> list[tuple[str, list[str]]]:
    """Elle hazırlanmış konu dökümüne (sayfa-konulari.json) göre böler: her konu başladığı sayfadan itibaren."""
    starts = {item["sayfa"]: item["baslik"] for item in outline}
    sections: list[tuple[str, list[str]]] = []
    for line in lines:
        page_match = PAGE_RE.match(clean(line.lstrip("# ")))
        if page_match:
            if int(page_match.group(1)) in starts or not sections:
                sections.append((starts.get(int(page_match.group(1)), "Giriş"), []))
        elif sections and not line.startswith("# "):
            sections[-1][1].append(line)
    return [(title, body) for title, body in sections if sum(len(l.strip()) for l in body) >= 40]


def split_sections(lines: list[str], outline: list[dict] | None = None) -> list[tuple[str, list[str]]]:
    """Dosyayı gerçek başlıklarına (# / ##) göre konulara ayırır; sayfa dökümlerini sayfa aralıklarına böler."""
    if outline:
        return split_by_outline(lines, outline)
    headings = [clean(l.lstrip("# ")) for l in lines if re.match(r"^#{1,2} ", l)]
    pages = sum(1 for h in headings if PAGE_RE.match(h))
    if pages >= 3 and pages > 0.6 * len(headings):  # başlıklarının çoğu sayfa numarası olan döküm
        return split_page_dump(lines)
    sections: list[tuple[str, list[str]]] = []
    keep = False
    page, first_page, size = 0, 0, 0
    for line in lines:
        heading = re.match(r"^(#{1,2}) (.+)$", line)
        title = clean(heading.group(2)) if heading else ""
        page_match = PAGE_RE.match(title)
        if page_match:
            page = int(page_match.group(1))
            if not sections or size > PAGE_CHUNK or not sections[-1][0].startswith("Sayfa "):
                sections.append((f"Sayfa {page}", []))
                first_page, size, keep = page, 0, True
            sections[-1] = (f"Sayfa {first_page}–{page}" if page != first_page else f"Sayfa {page}", sections[-1][1])
        elif heading:
            keep = "İÇİNDEKİLER" not in title.upper().replace("I", "İ")
            if keep:
                sections.append((pretty_title(title), []))
        elif keep or not sections:
            if not sections:
                sections.append(("", []))
                keep = True
            sections[-1][1].append(line)
            size += len(line)
    result = []
    for title, body in sections:
        if sum(len(l.strip()) for l in body) < 40:
            continue  # yalnızca başlıktan ibaret bölüm
        part, weight, number = [], 0, 1
        for line in body:
            if weight > SECTION_LIMIT:
                result.append((title if number == 1 else f"{title} ({number})", part))
                part, weight, number = [], 0, number + 1
            part.append(line)
            weight += len(line)
        result.append((title if number == 1 else f"{title} ({number})", part))
    return result


def section_blocks(body: list[str], topic_id: int, used_ids: set[str]) -> list[dict]:
    parser = TopicParser(topic_id, used_ids)
    parser.plain_source = True
    table: list[list[str]] = []

    def flush_table() -> None:
        if table:
            parser.flush_pending(as_headings=parser.article is None)
            parser.article = None
            parser.blocks.append({"t": "t", "rows": table.copy()})
            table.clear()

    for raw in body:
        stripped = raw.strip()
        if stripped.startswith("|"):
            if not (TABLE_RULE_RE.match(stripped) and "-" in stripped):
                table.append([clean(cell) for cell in stripped.strip("|").split("|")])
            continue
        flush_table()
        if raw.startswith("#"):
            parser.flush_pending(as_headings=True)
            parser.article = None
            parser.blocks.append({"t": "h", "x": clean(raw.lstrip("# "))})
            continue
        text = clean(raw)
        if not is_noise(text):
            parser.feed(text)
    flush_table()
    return parser.finish()


def load_structures() -> ModuleType:
    """Dosyaya özgü bölme kurallarını (ek-kaynak-yapilari.py) yükler."""
    spec = importlib.util.spec_from_file_location("ek_kaynak_yapilari", Path(__file__).resolve().parent / "ek-kaynak-yapilari.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


STRUCTURES = load_structures()
DUPLICATE_SECTION_RE = re.compile(r"^## \d+\. GEÇMİŞ YILLAR VERGİ HESAPLAMA SORULARI")


def plan_folders(name: str, lines: list[str], outline: list[dict] | None) -> list:
    """Bir kaynak dosyanın klasör planı: özel yapısı varsa onu, yoksa genel başlık/sayfa bölmesini kullanır."""
    extra: list = []
    if "TARIFE_ANA" in name:
        return STRUCTURES.plan_tarife_ana(lines)
    if "FASIL" in name:
        return STRUCTURES.plan_chapters(lines)
    if "Hesaplama" in name:
        paired = STRUCTURES.plan_hesaplama(lines, strip_branding)
        if paired:
            return paired
        print("UYARI: hesaplama soruları çözümleriyle eşlenemedi; sayfa dökümü olarak bırakıldı")
    if "STA ve" in name:
        lines, extra = STRUCTURES.plan_sta(lines)
    if "VERGI_HESAPLAMA" in name:  # son bölüm, çıkmış hesaplama soruları dosyasının birebir kopyası
        cut = next((i for i, line in enumerate(lines) if DUPLICATE_SECTION_RE.match(line)), len(lines))
        return [STRUCTURES.FolderPlan(0, None, None, STRUCTURES.plan_numbered(lines[:cut]))]
    return [STRUCTURES.FolderPlan(0, None, None, split_sections(lines, outline))] + extra


def build_folders(paths: list[Path], out_dir: Path, used_ids: set[str]) -> list[dict]:
    """Diğer not dosyalarını sekmelere (tarife, genelge, sair, hesaplama) ayrılmış klasörlere çevirir.

    Konular ek-<klasör>-<n>.json paketlerine yazılır; konu kimliği 1000*klasör + sıradır.
    Bir dosyadan türeyen ek klasörlerin (çıkmış sorular vb.) numarası 100*dosya sırası + alt numaradır.
    """
    for stale in out_dir.glob("ek-*.json"):
        stale.unlink()
    groups = {key: {"id": key, "title": title, "folders": []} for key, title in GROUPS}
    outlines = json.loads(OUTLINE_FILE.read_text(encoding="utf-8")) if OUTLINE_FILE.exists() else {}
    for file_no, path in enumerate(paths, 1):
        lines = path.read_text(encoding="utf-8").split("\n")
        rule = next((r for r in FOLDER_RULES if r[0] in path.name), None)
        heading = next((clean(l.lstrip("# ")) for l in lines if l.startswith("# ")), path.stem)
        group_key, folder_title = (rule[1], rule[2]) if rule else ("sair", heading.title() if heading.isupper() else heading)
        for plan in plan_folders(path.name, lines, outlines.get(path.name)):
            folder_id = file_no * 100 + plan.sub if plan.sub else file_no
            topics, bundle, bundle_size, bundle_no = [], [], 0, 1
            for order, (title, body) in enumerate(plan.sections, 1):
                topic_id = folder_id * 1000 + order
                ready = bool(body) and isinstance(body[0], dict)
                blocks = body if ready else section_blocks(body, topic_id, used_ids)
                if not blocks:
                    continue
                if bundle_size > BUNDLE_BYTES:
                    (out_dir / f"ek-{folder_id}-{bundle_no}.json").write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
                    bundle, bundle_size, bundle_no = [], 0, bundle_no + 1
                title = title or plan.title or folder_title
                bundle.append({"id": topic_id, "title": title, "blocks": blocks})
                bundle_size += len(json.dumps(blocks, ensure_ascii=False)) if ready else sum(len(l) for l in body)
                articles = [{"id": b["id"], "label": b["label"], "title": b["title"]} for b in blocks if b["t"] == "a"]
                topics.append({"id": topic_id, "title": title, "file": f"ek-{folder_id}-{bundle_no}.json", "articles": articles})
            if not topics:
                continue
            (out_dir / f"ek-{folder_id}-{bundle_no}.json").write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
            group = groups[plan.group or group_key]
            group["folders"].append({"id": folder_id, "title": plan.title or folder_title, "topics": topics})
            print(f"{group['title']:22} | {(plan.title or folder_title)[:50]:50} | {len(topics)} konu, {bundle_no} paket")
    return [group for group in groups.values() if group["folders"]]


def number_key(no: str) -> tuple[int, str]:
    digits, _, letter = no.partition("/")
    return int(digits), letter


def build(source_path: Path, out_dir: Path, extra_paths: list[Path] | None = None, yys_path: Path | None = None) -> None:
    lines = source_path.read_text(encoding="utf-8").split("\n")
    topics: list[tuple[int, str, list[str]]] = []
    for line in lines:
        match = TOPIC_RE.match(line)
        if match:
            topics.append((int(match.group(1)), topic_title(match.group(2)), []))
        elif topics:
            topics[-1][2].append(line)

    # YYS Yönetmeliği ayrı bir mevzuattır: ana derlemedeki kopyası (3-YYS) GK maddesi sanılmasın diye bu konu
    # YYS dosyasından madde madde kurulur; derlemede yoksa yeni bir konu olarak eklenir.
    yys_lines = yys_path.read_text(encoding="utf-8").split("\n") if yys_path and yys_path.exists() else None
    yys_topic = find_yys_topic(topics, yys_lines) if yys_lines else None
    if yys_lines and yys_topic is None:
        yys_topic = max(t[0] for t in topics) + 1
        topics.append((yys_topic, YYS_TOPIC_TITLE, []))
        print(f"YYS notu ana derlemede bulunamadı: {yys_topic}. konu olarak eklendi")

    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("konu-*.json"):
        stale.unlink()
    used_ids: set[str] = set()
    index_topics, refs = [], {}
    law_index: dict[str, list[dict]] = {"GK": [], "GY": [], "YYS": []}
    for topic_id, title, body in topics:
        if topic_id in SKIPPED_TOPICS:
            continue
        if topic_id == yys_topic:
            title, blocks = YYS_TOPIC_TITLE, parse_yys(yys_lines)
            used_ids.update(b["id"] for b in blocks if b["t"] == "a")
        else:
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
    index = {
        "topics": index_topics, "gk": law_index["GK"], "gy": law_index["GY"], "yys": law_index["YYS"],
        "groups": build_folders(extra_paths or [], out_dir, used_ids),
    }
    (out_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "refs.json").write_text(
        json.dumps(refs, ensure_ascii=False), encoding="utf-8"
    )
    total = sum(len(t["articles"]) for t in index_topics)
    print(
        f"{len(index_topics)} konu, {total} madde (GK {len(law_index['GK'])}, GY {len(law_index['GY'])}, "
        f"YYS {len(law_index['YYS'])}) -> {out_dir}"
    )


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    default_out = Path(__file__).resolve().parent.parent / "public" / "data"
    args = sys.argv[2:]
    yys = YYS_FILE
    if "--yys" in args:  # --yys <dosya>; --ek listesinin önünde ya da arkasında verilebilir
        at = args.index("--yys")
        yys, args = Path(args[at + 1]), args[:at] + args[at + 2:]
    extra = [Path(p) for p in args[args.index("--ek") + 1:]] if "--ek" in args else []
    build(Path(sys.argv[1]), default_out, extra, yys)


if __name__ == "__main__":
    main()
