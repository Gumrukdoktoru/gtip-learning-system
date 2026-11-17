#!/usr/bin/env python3
""" "Tarife ile ilgili geçmiş yıl sınav soruları" PDF'ini (iki sütun, sonda cevap anahtarı) soru verisine çevirir.

Kullanım:
    python3 -I apps/web/scripts/extract-tarife-pdf.py <sorular.pdf> [-o apps/web/scripts/tarife-cikmis-sorular.json]
    python3 -I apps/web/scripts/extract-tarife-pdf.py <sorular.pdf> --ham      # sütun sırasıyla ham satırlar

Gereksinim: PyMuPDF. Satırlar koordinatlarıyla okunur; her sayfada önce sol, sonra sağ sütun işlenir
(pdftotext sütunları karıştırır). Sorular 1'den başlayarak ardışık numarayla tanınır ("17.", "126-");
şıklar A, B, C… sırasıyla aranır, böylece kök içindeki "8. Fasılda" ya da "22.02" soru/şık sanılmaz.

Doğru cevap yalnızca belgenin son sayfasındaki cevap anahtarı tablosundan alınır (numara → harf).
Anahtarda bulunmayan ya da şıklarıyla uyuşmayan cevap boş bırakılır; tahmin yapılmaz.
Sınav etiketi, soruların arasındaki kalın "2014 ÖN ELEME SINAVI" başlıklarından gelir; başlık yoksa boştur
(son başlığın geçerli olduğu son soru: --son-etiketli, bkz. LAST_TAGGED).
Sayfa üst/alt bilgileri, filigran ve kurum/eğitmen adı içeren satırlar alınmaz.

Çıktı: [{"no", "sinav", "kok": [...], "siklar": ["A) …"], "cevap", "sayfa", "gorsel"?: true}]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf

PARAGRAPH_GAP = 15.5  # satır aralığı ~12,2; paragraf ve şık aralığı ~18 punto
ROW_TOLERANCE = 3.0  # aynı satır sayılacak en büyük dikey fark (punto)
RUNNING_HEAD_RE = re.compile(r"TARİFE İLE İLGİLİ GEÇMİŞ YIL SINAV SORULAR", re.I)
BRAND_RE = re.compile(r"alt[ıi]nsoy|eğitim merkezi|can.?l[ıi]\s*7/24|www\.|@", re.I)
EXAM_RE = re.compile(r"^(?:19|20)\d\d\b.*SINAV", re.I)
NUMBER_RE = re.compile(r"^(\d{1,3})\s*[.\-]\s*(.*)$")
ROMAN_RE = re.compile(r"^(?:[IVX]{1,4}|[ivx]{1,4})\s*[.)\-]\s")
KEY_RE = re.compile(r"^[A-E]$|^[İi]ptal$", re.I)
LETTERS = "ABCDE"
# Belgede son başlık "2019 GÜMRÜK MÜŞAVİRLİĞİ SINAVI"dır (114–122. sorular). 123'ten sonrası başlıksız, karışık
# yıllardan (2010, 2021–2023 …) sorulardır; bu, sınav kitapçıklarıyla karşılaştırılarak doğrulanmıştır.
# Bu yüzden 122'den sonraki sorular etiketsiz bırakılır (yanlış "2019" etiketi verilmez).
LAST_TAGGED = 122


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("­", "").replace("‟", "'")).strip()


def page_rows(page: pymupdf.Page) -> list[dict]:
    """Sayfanın görsel satırları: sol sütun, sonra sağ sütun; her satır soldan sağa birleştirilir."""
    middle = page.rect.width / 2
    parts = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip()]
            text = clean("".join(s["text"] for s in line["spans"]))
            if not spans or not text:
                continue
            x0, y0 = line["bbox"][0], min(s["bbox"][1] for s in spans)
            parts.append(
                {
                    "col": int(x0 >= middle),
                    "x": x0,
                    "y": y0,
                    "text": text,
                    "bold": all(s["flags"] & 16 for s in spans),
                }
            )
    parts.sort(key=lambda p: (p["col"], p["y"], p["x"]))
    rows: list[dict] = []
    for part in parts:
        last = rows[-1] if rows else None
        if (
            last
            and last["col"] == part["col"]
            and abs(last["y"] - part["y"]) < ROW_TOLERANCE
        ):
            last["cells"].append((part["x"], part["text"]))
            last["bold"] = last["bold"] and part["bold"]
        else:
            rows.append(
                {
                    "col": part["col"],
                    "y": part["y"],
                    "cells": [(part["x"], part["text"])],
                    "bold": part["bold"],
                }
            )
    for row in rows:
        row["text"] = clean(" ".join(text for _, text in sorted(row["cells"])))
    return [
        r
        for r in rows
        if not RUNNING_HEAD_RE.search(r["text"]) and not BRAND_RE.search(r["text"])
    ]


def is_key_page(rows: list[dict]) -> bool:
    cells = [text for row in rows for _, text in row["cells"]]
    return len(cells) > 40 and sum(
        bool(re.fullmatch(r"\d{1,3}|[A-E]|[İi]ptal", c)) for c in cells
    ) > 0.9 * len(cells)


def read_key(rows: list[dict]) -> dict[int, str]:
    """Cevap anahtarı: her satırda soldan sağa (numara, harf) çiftleri."""
    key: dict[int, str] = {}
    for row in rows:
        cells = [text for _, text in sorted(row["cells"])]
        for number, letter in zip(cells[::2], cells[1::2]):
            if number.isdigit() and KEY_RE.match(letter) and int(number) not in key:
                key[int(number)] = letter.upper() if len(letter) == 1 else "İptal"
    return key


def picture_boxes(page: pymupdf.Page) -> list[tuple[int, float]]:
    """Soruya ait görseller (sütun, y): sayfayı kaplayan filigran dışındaki resimler."""
    middle, found = page.rect.width / 2, []
    for block in page.get_text("dict")["blocks"]:
        x0, y0, x1, y1 = block["bbox"]
        if block["type"] == 1 and (x1 - x0) < 0.6 * page.rect.width:
            found.append((int(x0 >= middle), y0))
    return found


def split_options(text: str) -> list[str] | None:
    """'A) x B) y C) z …' metnini sırayla A, B, C… işaretlerinden böler; sıra bozuksa None."""
    marks = []
    at = 0
    lower = text[:1].islower()  # bazı sorularda şıklar "a. b. c." biçimindedir
    for letter in LETTERS:
        shown = letter.lower() if lower else letter
        found = re.compile(r"(?:^|(?<=\s))" + shown + r"\s*[).]\s*(?=\S)").search(
            text, at
        )
        if not found:
            break
        marks.append((found.start(), found.end(), letter))
        at = found.end()
    if len(marks) < 4 or marks[0][0] != 0:
        return None
    options = []
    for i, (_, end, letter) in enumerate(marks):
        stop = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        options.append(f"{letter}) {clean(text[end:stop])}")
    return options


def build_question(
    number: int, exam: str, rows: list[dict], page: int, warnings: list[str]
) -> dict:
    first = next(
        (i for i, row in enumerate(rows) if re.match(r"^[Aa]\s*[).](?:\s|$)", row["text"])),
        None,
    )
    stem_rows, option_rows = (
        (rows, []) if first is None else (rows[:first], rows[first:])
    )
    stem: list[str] = []
    previous_y = None
    for row in stem_rows:
        # Yeni paragraf: I./II. öncülü ya da satır aralığından büyük boşluk; diğer satırlar öncekine eklenir.
        apart = previous_y is not None and row["y"] - previous_y > PARAGRAPH_GAP
        if stem and not apart and not ROMAN_RE.match(row["text"]):
            stem[-1] = clean(stem[-1] + " " + row["text"])
        else:
            stem.append(row["text"])
        previous_y = row["y"]
    options = (
        split_options(clean(" ".join(row["text"] for row in option_rows)))
        if option_rows
        else None
    )
    if not options:
        warnings.append(f"soru {number} (s. {page}): şıklar ayrıştırılamadı")
    return {
        "no": number,
        "sinav": exam,
        "kok": stem,
        "siklar": options or [],
        "cevap": "",
        "sayfa": page,
    }


def extract(pdf_path: Path, last_tagged: int) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    questions: list[dict] = []
    key: dict[int, str] = {}
    exam, current, current_page = "", None, 0
    pictures: list[tuple[int, int, float]] = []  # (sayfa, sütun, y)
    marks: list[tuple[int, int, float, int]] = (
        []
    )  # (sayfa, sütun, y, soru no): görselleri sorusuna bağlamak için

    def close() -> None:
        nonlocal current
        if current:
            questions.append(
                build_question(
                    current[0], current[1], current[2], current_page, warnings
                )
            )
        current = None

    with pymupdf.open(pdf_path) as document:
        for page_no, page in enumerate(document, start=1):
            rows = page_rows(page)
            if is_key_page(rows):
                key.update(read_key(rows))
                continue
            pictures += [(page_no, col, y) for col, y in picture_boxes(page)]
            for row in rows:
                text = row["text"]
                if row["bold"] and EXAM_RE.match(text):
                    close()
                    exam = text
                    continue
                numbered = NUMBER_RE.match(text)
                expected = (questions[-1]["no"] if questions else 0) + (
                    2 if current else 1
                )
                if (
                    numbered
                    and int(numbered.group(1)) == expected
                    and row["cells"][0][0] == min(x for x, _ in row["cells"])
                ):
                    close()
                    current, current_page = (
                        expected,
                        exam,
                        (
                            [{**row, "text": numbered.group(2)}]
                            if numbered.group(2)
                            else []
                        ),
                    ), page_no
                    marks.append((page_no, row["col"], row["y"], expected))
                elif current:
                    current[2].append(row)
                else:
                    warnings.append(
                        f"s. {page_no}: soru dışı satır atlandı: {text[:60]}"
                    )
    close()
    by_no = {q["no"]: q for q in questions}
    for (
        page_no,
        col,
        y,
    ) in (
        pictures
    ):  # görsel, aynı sayfa ve sütunda kendisinden önce başlayan son soruya aittir
        owners = [m for m in marks if (m[0], m[1]) == (page_no, col) and m[2] <= y] or [
            m for m in marks if (m[0], m[1]) < (page_no, col)
        ]
        if owners:
            by_no[max(owners, key=lambda m: (m[0], m[1], m[2]))[3]]["gorsel"] = True
    for question in questions:
        if last_tagged and question["no"] > last_tagged:
            question["sinav"] = ""
        answer = key.get(question["no"], "")
        letters = {o[0] for o in question["siklar"]}
        if answer and len(answer) == 1 and answer not in letters:
            warnings.append(
                f"soru {question['no']}: anahtardaki cevap ({answer}) şıklarda yok; boş bırakıldı"
            )
            answer = ""
        question["cevap"] = answer
    missing = [n for n in range(1, len(questions) + 1) if n not in by_no]
    if missing:
        warnings.append(f"eksik soru numaraları: {missing}")
    extra = sorted(set(key) - set(by_no))
    if extra:
        warnings.append(f"anahtarda olup metinde bulunmayan numaralar: {extra}")
    return questions, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("pdf", type=Path)
    parser.add_argument("-o", "--cikti", type=Path)
    parser.add_argument("--ham", action="store_true")
    parser.add_argument(
        "--son-etiketli",
        type=int,
        default=LAST_TAGGED,
        help="son sınav başlığının geçerli olduğu son soru numarası (0: sınır yok)",
    )
    args = parser.parse_args()
    if args.ham:
        with pymupdf.open(args.pdf) as document:
            for page_no, page in enumerate(document, start=1):
                for row in page_rows(page):
                    print(
                        f"s{page_no} c{row['col']} y{row['y']:6.1f} {'B' if row['bold'] else ' '} | {row['text']}"
                    )
        return 0
    questions, warnings = extract(args.pdf, args.son_etiketli)
    for warning in warnings:
        print("uyarı:", warning, file=sys.stderr)
    answered = sum(1 for q in questions if q["cevap"])
    tagged = sum(1 for q in questions if q["sinav"])
    print(
        f"{len(questions)} soru; cevaplı {answered}, cevapsız {len(questions) - answered}; sınav etiketli {tagged}, etiketsiz {len(questions) - tagged}",
        file=sys.stderr,
    )
    text = json.dumps(questions, ensure_ascii=False, indent=1)
    if args.cikti:
        args.cikti.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
