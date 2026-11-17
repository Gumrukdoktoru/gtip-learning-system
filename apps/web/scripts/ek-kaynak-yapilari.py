"""Ek kaynak dosyalarına özgü yapılar (build-mevzuat-data.py tarafından yüklenir).

- Fasıl derlemesi: her fasıl "Fasıl 13 — <ad>" başlıklı tek konu olur.
- Tarife ana derlemesi: kitap ders notları, çıkmış sorular ve alıştırma soruları ayrı klasörlere ayrılır.
- STA notları: "SORU: 2025 GM" sayfaları çıkmış soru olarak ayrı konulara alınır.
- Hesaplama soruları: iki sütunlu sayfalar ayrıştırılır, her soru çözümüyle eşlenir.

Hiçbir metin üretilmez; yalnızca kaynaktaki satırlar yeniden düzenlenir.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable, NamedTuple

Blocks = list[dict]
Section = tuple[
    str, "list[str] | Blocks"
]  # (konu başlığı, ham satırlar veya hazır bloklar)


class FolderPlan(NamedTuple):
    """Bir kaynak dosyadan üretilecek klasör: alt numara 0 ise dosyanın kendi klasörüdür."""

    sub: int
    group: str | None
    title: str | None
    sections: list[Section]


PAGE_RE = re.compile(r"^#{2,3} Sayfa (\d+)\s*$")
OPTION_RE = re.compile(r"^([A-E])(?:\)\s*|\.\s+)(.*)$")
INLINE_OPTION_RE = re.compile(r"\s+(?=[B-E][).]\s)")
# hesaplama sorularında şıklar küçük harfle de yazılmış: "a. 182,98 b. 181,98"
ANY_CASE_OPTION_RE = re.compile(r"^([A-Ea-e])(?:\)\s*|\.\s+)(.*)$")
ANY_CASE_INLINE_RE = re.compile(r"\s+(?=[B-Eb-e][).](?:\s|\d))")
STEM_BREAK_RE = re.compile(r"^(?:[IİVX]{1,4}[.)\-]|[iıvx]{1,4}\)|[a-e]\)|[-–•➢✓])\s*")
TITLE_LIMIT = 96


def tr_lower(text: str) -> str:
    return text.replace("I", "ı").replace("İ", "i").lower()


def tr_capitalize(text: str) -> str:
    lowered = tr_lower(text.strip())
    first = {"i": "İ", "ı": "I"}.get(lowered[:1], lowered[:1].upper())
    return first + lowered[1:]


def squeeze(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("*", "")).strip()


def shorten(title: str, limit: int = TITLE_LIMIT) -> str:
    title = squeeze(title)
    if len(title) <= limit:
        return title
    return title[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def page_list(lines: list[str]) -> list[tuple[int, list[str]]]:
    """Sayfa dökümünü (sayfa no, satırlar) listesine çevirir; ilk sayfadan önceki satırlar 0. sayfadır."""
    pages: list[tuple[int, list[str]]] = [(0, [])]
    for line in lines:
        match = PAGE_RE.match(line.rstrip())
        if match:
            pages.append((int(match.group(1)), []))
        else:
            pages[-1][1].append(line.rstrip())
    return pages


def page_range(numbers: list[int]) -> str:
    if not numbers:
        return ""
    return (
        f"s. {numbers[0]}"
        if numbers[0] == numbers[-1]
        else f"s. {numbers[0]}–{numbers[-1]}"
    )


# ---------------------------------------------------------------- soru blokları


def question_block(
    no: str, lines: list[str], answer: str = "", solution: list[str] | None = None, any_case: bool = False, ready: bool = False
) -> dict:
    """Soru satırlarını kök ve şıklara ayırır: {t:'q', no, kok, siklar, cevap, cozum}.

    `ready`: satırlar önceden birleştirilmiş paragraflardır (hesaplama); kök satırları yeniden birleştirilmez.
    """
    option_re, inline_re = (ANY_CASE_OPTION_RE, ANY_CASE_INLINE_RE) if any_case else (OPTION_RE, INLINE_OPTION_RE)
    stem: list[str] = []
    options: list[str] = []
    for raw in lines:
        text = raw if ready else squeeze(raw)
        if not text:
            continue
        if option_re.match(text) and (options or text[0] in "Aa"):
            options.append(text)
        elif options:
            options[-1] += " " + text
        elif stem and not ready and not STEM_BREAK_RE.match(text) and not stem[-1].endswith(":"):
            stem[-1] += " " + text
        else:
            stem.append(text)
    options = [part for option in options for part in inline_re.split(option)]  # aynı satırdaki şıklar
    return {"t": "q", "no": no, "kok": stem, "siklar": options, "cevap": answer, "cozum": solution or []}


def join_wrapped(lines: list[str]) -> list[str]:
    """Satır sonlarında bölünmüş cümleleri birleştirir; yeni madde/başlık satırları ayrı kalır."""
    result: list[str] = []
    for raw in lines:
        text = squeeze(raw)
        if not text:
            continue
        starts_new = bool(
            re.match(r"^(?:[-–•➢✓]|\d+[.)]\s|[A-ZÇĞİÖŞÜ][a-zçğıöşü]+:)", text)
        )
        if result and not starts_new and not re.search(r"[.:?!]$", result[-1]):
            result[-1] += " " + text
        else:
            result.append(text)
    return result


# ---------------------------------------------------------------- fasıl derlemesi

CHAPTER_HEAD_RE = re.compile(r"^## (\d+)\. (.+?)\s*$")
CHAPTER_NAME_RE = re.compile(r"^FASIL\s*(\d+)$")
TOC_RE = re.compile(r"^\W*Fas[ıi]l\s+(\d+)\s+(\S.+)$")
PART_BYTES = 200_000


def chapter_names(lines: list[str]) -> dict[int, str]:
    """Kaynağın kendi içindekiler listesinden fasıl adlarını okur ("Fasıl 13<TAB>Lak; sakız, …")."""
    names: dict[int, str] = {}
    for line in lines:
        match = TOC_RE.match(line.strip())
        if match:
            names.setdefault(int(match.group(1)), squeeze(match.group(2)).strip("()"))
    return names


def name_from_body(body: list[str], number: int) -> str:
    """İçindekilerde adı olmayan fasıl için: "FASIL 12" satırını izleyen büyük harfli başlık satırları."""
    parts: list[str] = []
    seen = False
    for line in body[:60]:
        text = squeeze(line.lstrip("# "))
        if not text:
            continue
        if re.fullmatch(rf"FASIL\s+{number}", text):
            seen = True
        elif seen and text == text.upper() and any(ch.isalpha() for ch in text) and "AÇIKLAMA" not in text:
            parts.append(text)
        elif seen:
            break
    return tr_capitalize(" ".join(parts)) if parts else ""


def plan_chapters(lines: list[str]) -> list[FolderPlan]:
    """Fasıl derlemesi: yalnızca "## N. FASILxx" başlıkları konu açar; iç başlıklar ara başlık olarak kalır."""
    sections: list[tuple[str, list[str]]] = []
    for line in lines:
        match = CHAPTER_HEAD_RE.match(line.rstrip())
        if match:
            sections.append((match.group(2), []))
        elif sections:
            sections[-1][1].append("##" + line if re.match(r"^# \S", line) else line)
    toc = next((body for name, body in sections if "İÇİNDEKİLER" in name), [])
    names = chapter_names(toc)
    result: list[Section] = []
    for name, body in sections:
        chapter = CHAPTER_NAME_RE.match(name)
        if chapter:
            number = int(chapter.group(1))
            label = names.get(number) or name_from_body(body, number)
            title = (
                f"Fasıl {number:02d} — {shorten(label, 84)}"
                if label
                else f"Fasıl {number:02d}"
            )
        else:
            title = tr_capitalize(name)
        part: list[str] = []
        size, count = 0, 1
        for line in body:
            if size > PART_BYTES and re.match(
                r"^\*{0,2}\d\d\.\d\d\b", line
            ):  # yeni pozisyon başlığında böl
                result.append(
                    (title if count == 1 else f"{title} ({count}. kısım)", part)
                )
                part, size, count = [], 0, count + 1
            part.append(line)
            size += len(line)
        result.append((title if count == 1 else f"{title} ({count}. kısım)", part))
    return [FolderPlan(0, None, None, result)]


def plan_numbered(lines: list[str]) -> list[Section]:
    """ "## N. BAŞLIK" bölümlerinden oluşan derlemeyi bölümlerine ayırır; sayfa işaretleri atılır."""
    sections: list[Section] = []
    for line in lines:
        match = CHAPTER_HEAD_RE.match(line.rstrip())
        if match:
            sections.append((tr_capitalize(match.group(2)), []))
        elif sections and not PAGE_RE.match(line.rstrip()) and not line.startswith("Kaynak: "):
            sections[-1][1].append("##" + line if re.match(r"^# \S", line) else line)
    return sections


# ---------------------------------------------------------------- tarife ana derlemesi

BOOK_HEADER_RE = re.compile(r"^Gümrük Koçu (.+)$")
BOOK_FOOTER_RE = re.compile(r"^Ufuk Çetintaş \d+$")
BOOK_CHAPTER_RE = re.compile(r"^Bölüm [IVXL]+ · Fasıl (\d+) · (.+)$")
BOOK_EXAM_RE = re.compile(r"^Denemeler · (Deneme Sınavı \d+)( · Cevaplar)?$")
BLOCK_RE = re.compile(r"^BLOK (\d+) · (.+)$")
QUESTIONS_HEAD_RE = re.compile(
    r"^(?:FASIL \d+|GİRİŞ|DENEME SINAVI \d+)(?: · SORULAR)?$"
)
ANSWERS_HEAD_RE = re.compile(r"^.+ · CEVAP ANAHTARI VE GEREKÇELER$")
NUMBERED_RE = re.compile(r"^(\d+)-\s*(.*)$")
RIGHT_ANSWER_RE = re.compile(r"^(\d+)- Doğru Cevap: ([A-E])\b(.*)$")
EXAMPLE_RE = re.compile(r"^Örnek (\d+)\.\s*(.*)$")
EXAMPLE_ANSWER_RE = re.compile(r"^Cevap: ([A-E])\s*[—–-]\s*(.*)$")
SLIDE_CHAPTER_RE = re.compile(r"^(\d+)\s*\.\s*FAS[Iı]L\s*/?\s*(.*)$", re.I)
SLIDE_SECTION_RE = re.compile(r"^(\d+)\s*\.\s*BÖLÜM\b", re.I)
PAST_PAGES_PER_TOPIC = 3
FRONT_MATTER = "Kapak ve içindekiler"
NOTE_TWO_COLUMN = "Not: Bu bölüm iki sütunlu sayfa dökümüdür; sütunlar ayrıştırılamadığı için satırlar kaynakta olduğu gibi (karışık) verilmiştir."


def practice_blocks(questions: list[str], answers: list[str]) -> Blocks | None:
    """ "1- soru" ve "1- Doğru Cevap: A / Gerekçe / Dayanak" satırlarını numaraya göre eşler."""
    asked: list[tuple[str, list[str]]] = []
    for line in questions:
        match = NUMBERED_RE.match(line)
        if match and int(match.group(1)) == len(asked) + 1:
            asked.append((match.group(1), [match.group(2)]))
        elif asked:
            asked[-1][1].append(line)
    solved: dict[str, tuple[str, list[str]]] = {}
    current: list[str] | None = None
    for line in answers:
        match = RIGHT_ANSWER_RE.match(line)
        if match:
            current = (
                [squeeze(match.group(3).lstrip(" ·"))]
                if squeeze(match.group(3).lstrip(" ·"))
                else []
            )
            solved[match.group(1)] = (match.group(2), current)
        elif current is not None:
            current.append(line)
    if not asked:
        return None
    blocks: Blocks = []
    for no, body in asked:
        answer, solution = solved.get(no, ("", []))
        blocks.append(
            question_block(f"Soru {no}", body, answer, join_wrapped(solution))
        )
    return blocks


def example_blocks(lines: list[str]) -> Blocks:
    """ "Örnek 1. … Cevap: C — açıklama" biçimindeki çıkmış soru örneklerini soru bloklarına çevirir."""
    blocks: Blocks = []
    body: list[str] | None = None
    answer, solution, no = "", [], ""
    loose: list[str] = []

    def flush() -> None:
        if body is not None:
            blocks.append(
                question_block(f"Örnek {no}", body, answer, join_wrapped(solution))
            )

    for line in lines:
        start, end = EXAMPLE_RE.match(line), EXAMPLE_ANSWER_RE.match(line)
        if start:
            flush()
            no, body, answer, solution = start.group(1), [start.group(2)], "", []
        elif end and body is not None:
            answer, solution = end.group(1), [end.group(2)]
        elif body is None:
            loose.append(line)
        elif answer:
            solution.append(line)
        else:
            body.append(line)
    flush()
    return [{"t": "p", "x": squeeze(text)} for text in loose if squeeze(text)] + blocks


def split_book_unit(lines: list[str]) -> dict[str, list[str]]:
    """Kitabın bir faslını ders notu, çıkmış sorular (BLOK 8–9), alıştırma soruları ve cevaplarına ayırır."""
    parts: dict[str, list[str]] = {
        "ders": [],
        "baz": [],
        "ornek": [],
        "soru": [],
        "cevap": [],
    }
    mode = "ders"
    for line in lines:
        block = BLOCK_RE.match(line)
        if block:
            mode = {"8": "baz", "9": "ornek"}.get(block.group(1), "ders")
            if mode == "ders":
                parts["ders"].append(f"### {block.group(2)}")
            continue
        if ANSWERS_HEAD_RE.match(line):
            mode = "cevap"
            continue
        if re.match(r"^(?:FASIL \d+|GİRİŞ) · SORULAR$", line):
            mode = "soru"
            continue
        parts[mode].append(line)
    return parts


def book_sections(
    pages: list[tuple[int, list[str]]],
) -> tuple[list[Section], list[Section], list[Section]]:
    """Tarife kitabını (ders notları, çıkmış sorular, alıştırma ve denemeler) konularına böler."""
    units: list[tuple[str, list[str]]] = []
    loose: list[str] = []  # üst bilgisi olmayan sayfalar (bölüm kapakları): izleyen fasla eklenir
    for _, body in pages:
        key = ""
        kept: list[str] = []
        for line in body:
            header = BOOK_HEADER_RE.match(line)
            if header:
                key = header.group(1)
            elif not BOOK_FOOTER_RE.match(line):
                kept.append(line)
        if not key and units:
            loose += kept
            continue
        chapter = BOOK_CHAPTER_RE.match(key)
        if chapter:
            key = f"Fasıl {int(chapter.group(1)):02d} — {shorten(chapter.group(2).strip('().'), 84)}"
        elif key in ("", "İçindekiler"):
            key = FRONT_MATTER
        if units and (units[-1][0] == key or (chapter and units[-1][0].startswith(key[:9]))):
            units[-1][1].extend(loose + kept)
        else:
            units.append((key, loose + kept))
        loose = []
    units[0][1].extend(loose)
    lessons: list[Section] = []
    past: list[Section] = []
    practice: list[Section] = []
    exams: dict[str, dict[str, list[str]]] = {}
    for key, lines in units:
        exam = BOOK_EXAM_RE.match(key)
        if exam:
            exams.setdefault(exam.group(1), {"soru": [], "cevap": []})[
                "cevap" if exam.group(2) else "soru"
            ] += lines
            continue
        parts = split_book_unit(lines)
        lessons.append((key, parts["ders"]))
        if parts["baz"] or parts["ornek"]:
            blocks: Blocks = []
            if parts["baz"]:
                blocks += [{"t": "h", "x": "Çıkmış sorularda baz alınanlar"}] + [
                    {"t": "p", "x": x} for x in join_wrapped(parts["baz"])
                ]
            if parts["ornek"]:
                blocks += [{"t": "h", "x": "Çıkmış soru örnekleri"}] + example_blocks(
                    parts["ornek"]
                )
            past.append((f"Çıkmış sorular — {key}", blocks))
        if parts["soru"]:
            head = [x for x in parts["soru"][:2] if "Soru ·" in x]
            solved = practice_blocks(parts["soru"], parts["cevap"])
            intro: Blocks = [{"t": "p", "x": head[0]}] if head else []
            practice.append((f"Alıştırma soruları — {key}", intro + solved if solved else parts["soru"] + parts["cevap"]))
    for name, parts in exams.items():
        solved = practice_blocks(parts["soru"], parts["cevap"])
        practice.append(
            (f"{name} (çözümlü)", solved or parts["soru"] + parts["cevap"])
        )
    return lessons, past, practice


def is_question_slide(body: list[str]) -> bool:
    letters = {line[0] for line in body if re.match(r"^[A-E]\)", line)}
    return len(letters) >= 4


def slide_sections(
    pages: list[tuple[int, list[str]]],
) -> tuple[list[Section], list[Section]]:
    """Sunum notlarını slayt başlıklarına göre (giriş, bölüm, fasıl, hesaplama) konulara ayırır."""
    topics: list[tuple[tuple[str, int], str, list[int], list[str]]] = []
    solved_pages: list[int] = []
    solved_lines: list[str] = []
    key: tuple[str, int] = ("giris", 0)
    for number, body in pages:
        if number == 0:
            continue
        first = next((squeeze(x) for x in body if x.strip()), "")
        chapter, section = SLIDE_CHAPTER_RE.match(first), SLIDE_SECTION_RE.match(first)
        title = ""
        if first.startswith("Hesaplama (Özet") or key[0] == "hesap":
            new_key, title = ("hesap", 0), "Sunum — hesaplama özet formülleri"
        elif chapter:
            new_key = ("fasil", int(chapter.group(1)))
            name = shorten(chapter.group(2).rstrip(".…; "), 76)
            title = f"Sunum — Fasıl {new_key[1]:02d}" + (f": {name}" if name else "")
        elif section:
            new_key, title = (
                "bolum",
                int(section.group(1)),
            ), f"Sunum — {int(section.group(1))}. Bölüm yapısı ve bölüm notu"
        else:
            new_key, title = key, "Sunum — tarife giriş ve genel yorum kuralları"
        if is_question_slide(body):
            solved_pages.append(number)
            solved_lines += [f"### Sayfa {number}"] + body
            continue
        if new_key != key or not topics:
            key = new_key
            topics.append((key, title, [], []))
        topics[-1][2].append(number)
        topics[-1][3].extend(body)
    lessons = [
        (f"{title} ({page_range(numbers)})", body) for _, title, numbers, body in topics
    ]
    solved: list[Section] = []
    if solved_lines:
        pages_text = ", ".join(str(n) for n in solved_pages)
        solved.append(
            (
                f"Sunumdaki çözümlü soru örnekleri (s. {pages_text})",
                [NOTE_TWO_COLUMN] + solved_lines,
            )
        )
    return lessons, solved


def plan_tarife_ana(lines: list[str]) -> list[FolderPlan]:
    """Tarife ana derlemesi: ders notu/sunum, kitap ders notları, çıkmış sorular ve alıştırmalar ayrı klasörlerdir."""
    parts: dict[int, tuple[str, list[str]]] = {}
    current = 0
    for line in lines:
        match = re.match(r"^## BÖLÜM (\d+): (.+?)\s*$", line)
        if match:
            current = int(match.group(1))
            parts[current] = (match.group(2), [])
        elif current and not line.startswith("## ") and not line.startswith("Kaynak: "):
            parts[current][1].append(line)
    notes: list[Section] = []
    lessons: list[Section] = []
    past: list[Section] = []
    practice: list[Section] = []
    for number, (name, body) in sorted(parts.items()):
        if "FASIL DERLEMESİ" in name:
            continue  # fasıl derlemesinin birebir kopyası; "Fasıllar" klasöründe zaten var
        pages = page_list(body)
        if "TARİFE KİTABI" in name:
            lessons, book_past, book_practice = book_sections(pages)
            past = book_past + past
            practice = book_practice + practice
        elif "SUNUM" in name:
            slides, solved = slide_sections(pages)
            notes += slides
            practice += solved
        elif "GEÇMİŞ YIL" in name:
            real = [(n, b) for n, b in pages if n]
            for at in range(0, len(real), PAST_PAGES_PER_TOPIC):
                chunk = real[at : at + PAST_PAGES_PER_TOPIC]
                text = [NOTE_TWO_COLUMN] + [
                    x for n, b in chunk for x in [f"### Sayfa {n}"] + b
                ]
                past.append(
                    (
                        f"Çıkmış sorular — geçmiş yıl tarife soruları ({page_range([n for n, _ in chunk])})",
                        text,
                    )
                )
        else:
            notes.append((tr_capitalize(name), [x for _, b in pages for x in b]))
    return [
        FolderPlan(1, "tarife", "Tarife Kitabı — fasıl fasıl ders notları", lessons),
        FolderPlan(2, "tarife", "ÇIKMIŞ SORULAR — Tarife (fasıl fasıl)", past),
        FolderPlan(
            3, "tarife", "Alıştırma soruları ve deneme sınavları (çözümlü)", practice
        ),
        FolderPlan(0, "tarife", "Tarife ders notu ve sunum notları", notes),
    ]


# ---------------------------------------------------------------- STA: çıkmış soru sayfaları

ASKED_RE = re.compile(r"^SORU\s*:\s*(.+)$")
ANSWER_PAGE_RE = re.compile(r"^CEVAP\b\s*:?\s*(.*)$")


def plan_sta(lines: list[str]) -> tuple[list[str], list[FolderPlan]]:
    """ "SORU: 2025 GM" sayfalarını ve izleyen cevap sayfasını ders metninden ayırır, yıllara göre gruplar."""
    kept: list[str] = []
    groups: dict[str, Blocks] = {}
    seen: dict[str, dict] = {}
    last: dict | None = None
    for number, body in page_list(lines):
        text = [squeeze(x) for x in body if squeeze(x)]
        asked = ASKED_RE.match(text[0]) if text else None
        if asked:
            tag = asked.group(1)
            numbered = re.match(r"^(\d+)\.\s*(.*)$", text[1]) if len(text) > 1 else None
            no = f"{tag} · Soru {numbered.group(1)}" if numbered else tag
            stem = [numbered.group(2)] + text[2:] if numbered else text[1:]
            last = question_block(no, stem, any_case=True)
            same = seen.get(" ".join(last["kok"]))
            if same is not None:  # ders içinde ve soru bölümünde iki kez geçen soru: cevabı olan tutulur
                last = same
                continue
            seen[" ".join(last["kok"])] = last
            year = re.search(r"\d{4}", tag)
            groups.setdefault(year.group(0) if year else tag, []).append(last)
            continue
        answer = ANSWER_PAGE_RE.match(text[0]) if text else None
        if last is not None and text and (answer or OPTION_RE.match(text[0])):
            rest = (
                " ".join(
                    ([answer.group(1)] if answer and answer.group(1) else []) + text[1:]
                )
                if answer
                else " ".join(text)
            )
            letter = OPTION_RE.match(rest)
            last["cevap"] = letter.group(1).upper() if letter else rest
            last = None
            continue
        last = None
        kept += ([f"## Sayfa {number}"] if number else []) + body
    sections: list[Section] = [
        (f"Çıkmış sorular — STA ve menşe · {year} ({len(blocks)} soru)", blocks)
        for year, blocks in sorted(groups.items(), reverse=True)
    ]
    return kept, [
        FolderPlan(
            1,
            "sair",
            "ÇIKMIŞ SORULAR — Serbest ticaret anlaşmaları ve kümülasyon",
            sections,
        )
    ]


# ---------------------------------------------------------------- hesaplama: soru + çözüm

COLUMN_FILE = Path(__file__).resolve().parent / "hesaplama-sutunlari.json"
SOLVED_NO_RE = re.compile(r"^(\d{1,3})\.(?:\s+(.*))?$")
ANSWER_KEY_RE = re.compile(r"(\d{1,3}) ([A-E])\b")
SHARED_DATA_RE = re.compile(r"^((?:\d{1,3}(?:, | ve )?)+)(?:’inci|\.)? (?:numaralı )?soruları aşağıdaki (?:verilere|metne) göre")
REFERS_BACK_RE = re.compile(r"^(?:Yukarıdaki|Yukarıda yer alan|Yukarıda soruda|Bir önceki soru)|bir önceki soruda", re.I)
DATA_ROW_RE = re.compile(r"[=:]\s*[%\d][\d.,]*\.?-?\s*(?:TL|USD|EUR|Euro|kg|\$|₺)?$")
TERMINAL_RE = re.compile(r"[.?!:;][)”\"’']*$")
MISSING_SOLUTION = "Çözüm kaynakta bulunamadı"
SOLVED_PER_TOPIC = 8
WRAP_WIDTH = 40  # bundan kısa satır sütun sonuna gelmeden bitmiştir (veri/başlık satırı)


def plain(text: str) -> str:
    """Yalnızca boşlukları toplar; çarpma işareti olarak kullanılan "*" korunur."""
    return re.sub(r"\s+", " ", text).strip()


def split_columns(body: list[str], marks: list[str]) -> list[str] | None:
    """İki sütunlu sayfanın satırlarını elle doğrulanmış işaretlere göre sol + sağ sütun sırasına dizer.

    İşaretler satır başına birer tanedir: "L" sol, "R" sağ, sayı = sağ sütunun başladığı karakter
    konumu. Satır sayısı tutmazsa None döner ve eşleme yapılmaz.
    """
    if len(body) != len(marks):
        return None
    left: list[str] = []
    right: list[str] = []
    for line, mark in zip(body, marks):
        if mark == "L":
            left.append(line)
        elif mark == "R":
            right.append(line)
        else:
            left.append(line[: int(mark)].rstrip())
            right.append(line[int(mark) :].strip())
    return left + right


def numbered_items(stream: list[str], last: int, skip: list[str]) -> dict[int, list[str]]:
    """Sıralı "N." başlıklarına göre keser: yalnızca beklenen bir sonraki numara yeni madde açar.

    `skip`: soru/çözüm içindeki numaralı liste satırları (yanlışlıkla yeni madde sayılmaması için).
    """
    items: dict[int, list[str]] = {}
    current = 0
    pending = list(skip)
    for line in stream:
        match = SOLVED_NO_RE.match(line)
        if match and line in pending:
            pending.remove(line)
            match = None
        if match and int(match.group(1)) == current + 1 and current < last:
            current += 1
            items[current] = [match.group(2)] if match.group(2) else []
        elif current:
            items[current].append(line)
    return items


def unwrap(lines: list[str], sentences: bool) -> list[str]:
    """Sütun genişliğinde bölünmüş satırları birleştirir; veri satırları ve hesap adımları ayrı kalır.

    `sentences`: soru metni (sütun sonuna kadar dolmuş satır sonraki satırla birleşir);
    çözümde yalnızca küçük harfle süren satır eklenir.
    """
    result: list[str] = []
    width = 0  # son eklenen kaynak satırının uzunluğu
    for text in lines:
        previous = result[-1] if result else ""
        starts_item = bool(STEM_BREAK_RE.match(text) or ANY_CASE_OPTION_RE.match(text))
        continues = text[:1].islower() and not starts_item
        wrapped = sentences and width >= WRAP_WIDTH and not TERMINAL_RE.search(previous) and not DATA_ROW_RE.search(previous)
        if previous and not starts_item and (continues or wrapped) and not ANY_CASE_OPTION_RE.match(previous):
            result[-1] += " " + text
        else:
            result.append(text)
        width = len(text)
    return result


def share_context(questions: dict[int, list[str]]) -> dict[int, list[str]]:
    """ "102 ve 103 numaralı soruları aşağıdaki verilere göre…" ortak verisini ilgili her soruya taşır.

    Ortak veri, kaynakta bir önceki sorunun şıklarından sonra durur; oradan alınıp kapsadığı
    soruların başına eklenir. Metin değişmez, yalnızca yeri düzelir.
    """
    shared: dict[int, list[str]] = {}
    for no in sorted(questions):
        body = questions[no]
        at = next((i for i, line in enumerate(body) if i and SHARED_DATA_RE.match(line)), None)
        if at is None:
            continue
        context, questions[no] = body[at:], body[:at]
        for target in (int(x) for x in re.findall(r"\d{1,3}", SHARED_DATA_RE.match(context[0]).group(1))):
            shared[target] = context
    return shared


def plan_hesaplama(lines: list[str], brand_free: Callable[[str], str]) -> list[FolderPlan] | None:
    """Geçmiş yıl hesaplama sorularını cevap anahtarı ve çözümleriyle soru soru eşler."""
    if not COLUMN_FILE.exists():
        return None
    config = json.loads(COLUMN_FILE.read_text(encoding="utf-8"))
    marks: dict[str, list[str]] = config["sayfalar"]
    asked: list[str] = []
    solved: list[str] = []
    key: dict[int, str] = {}
    side = asked
    for number, raw in page_list(lines):
        body = [x for x in (brand_free(plain(line)) for line in raw) if x.replace("*", "").strip()]
        if not number or not body:
            continue
        if body[0] == "ÇÖZÜMLER":
            side = solved
        if len(ANSWER_KEY_RE.findall(" ".join(body))) > 60:
            key.update({int(no): letter for no, letter in ANSWER_KEY_RE.findall(" ".join(body))})
            continue
        ordered = split_columns(body, marks.get(str(number), []))
        if ordered is None:
            return None
        side.extend(ordered)
    total = max(key) if key else 0
    questions = numbered_items(asked, total, [])
    solutions = numbered_items([x for x in solved if x != "ÇÖZÜMLER"], total, config.get("cozum_degil", []))
    if len(questions) != total:
        return None
    shared = share_context(questions)
    swapped = {int(k): int(v) for k, v in config.get("cozum_esleme", {}).items()}
    blocks: dict[int, dict] = {}
    for no in sorted(questions):
        solution = unwrap(solutions.get(swapped.get(no, no), []), sentences=False) or [MISSING_SOLUTION]
        block = question_block(f"Soru {no}", unwrap(questions[no], sentences=True), key.get(no, ""), solution, any_case=True, ready=True)
        if no in shared:
            block["kok"] = unwrap(shared[no], sentences=True) + block["kok"]
        elif no > 1 and block["kok"] and REFERS_BACK_RE.search(block["kok"][0]):
            block["kok"] = [f"(Soru {no - 1}’in verileri:)"] + blocks[no - 1]["kok"] + [f"(Soru {no}:)"] + block["kok"]
        blocks[no] = block
    numbers = sorted(blocks)
    sections: list[Section] = []
    for at in range(0, len(numbers), SOLVED_PER_TOPIC):
        chunk = numbers[at : at + SOLVED_PER_TOPIC]
        sections.append((f"Sorular {chunk[0]}–{chunk[-1]} (çözümü altında)", [blocks[no] for no in chunk]))
    return [FolderPlan(0, None, None, sections)]
