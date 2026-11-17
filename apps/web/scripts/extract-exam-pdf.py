#!/usr/bin/env python3
"""İki sütunlu, cevapları kırmızıyla işaretli sınav kitapçığı PDF'ini soru verisine çevirir.

Kullanım:
    python3 apps/web/scripts/extract-exam-pdf.py <kitapcik.pdf> "<sınav adı>" [-o cikti.json] [--ekle]
    python3 apps/web/scripts/extract-exam-pdf.py <kitapcik.pdf> "<sınav adı>" --ham   # ham sütun metni

Gereksinim: PyMuPDF (pip install pymupdf). pdftotext sütunları satır satır karıştırdığı için
satırlar koordinatlarıyla okunur; her sayfada önce sol, sonra sağ sütun işlenir.
Doğru cevap, kitapçıkta kırmızı yazılmış şıktan alınır; kırmızı şık yoksa veya birden fazlaysa
cevap boş bırakılır (tahmin yapılmaz). Kırmızı "iptal" notu taşıyan sorunun cevabı "İptal" olur.

Çıktı: {"sinav": ad, "sorular": [{"no", "kok": [...], "siklar": [...], "cevap"}]}
    kok: paragraflar; I./II. öncülleri, tablo satırları ("hücre | hücre") ayrı girdidir.
    -o verilmezse standart çıktıya yazılır; --ekle ile -o dosyasındaki listeye eklenir
    (aynı adlı sınav varsa yenisiyle değiştirilir). Uyarılar standart hataya yazılır.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

TOP_RATIO = (
    0.105  # sayfa başlığı (logo, sınav adı, kitapçık türü) bu oranın üstünde kalır
)
BOTTOM_RATIO = 0.905  # sayfa numarası ve süs çizgileri bu oranın altında kalır
SAME_LINE_TOLERANCE = 4.0
COLUMN_OVERFLOW = 12.0
PARAGRAPH_GAP_RATIO = (
    1.6  # satır yüksekliğinin bu katından büyük boşluk yeni paragraf sayılır
)
MAX_SKIPPED_NUMBERS = 3
QUESTION_RE = re.compile(r"^(\d{1,3})\.\s*(.*)$", re.S)
OPTION_RE = re.compile(r"^([A-E])\)\s*(.*)$", re.S)
ROMAN_RE = re.compile(r"^(I{1,3}|IV|VI{0,3}|IX|X|i{1,3}|iv|vi{0,3}|ix|x)[.)]\s")
ROMAN_VALUES = {
    "i": 1,
    "ii": 2,
    "iii": 3,
    "iv": 4,
    "v": 5,
    "vi": 6,
    "vii": 7,
    "viii": 8,
    "ix": 9,
    "x": 10,
}
LIST_ITEM_RE = re.compile(
    r"^(?:\d{4}\.\d{2}[\d.]*\s|-\s-\s)"
)  # tarife satırı: "8702.10 - …", "- - …"
NOISE_RE = re.compile(
    r"^(?:Diğer Sayfaya Geçiniz\.?|SINAV BİTTİ.*|TEST BİTTİ.*|CEVAPLARINIZI KONTROL EDİNİZ.*)$",
    re.I,
)
CANCEL_RE = re.compile(r"iptal", re.I)


@dataclass
class Line:
    page: int
    column: int
    x0: float
    x1: float
    y0: float
    y1: float
    text: str
    bold_start: bool  # ilk parça kalın mı (soru numarası ve şık harfi kalın yazılır)
    bold: bool  # satırın çoğu kalın mı
    red: bool
    table_row: bool = False


@dataclass
class Question:
    no: int
    stem: list[Line] = field(default_factory=list)
    siklar: list[str] = field(default_factory=list)
    red_letters: list[str] = field(default_factory=list)
    cancelled: bool = False


def is_red(color: int) -> bool:
    red, green, blue = (color >> 16) & 255, (color >> 8) & 255, color & 255
    return red > 150 and green < 90 and blue < 90


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("­", "")).strip()


def span_line(spans: list[dict], page_no: int, middle: float) -> Line:
    x0, y0 = min(s["bbox"][0] for s in spans), min(s["bbox"][1] for s in spans)
    x1, y1 = max(s["bbox"][2] for s in spans), max(s["bbox"][3] for s in spans)
    body = (
        spans[1:]
        if len(spans) > 1 and QUESTION_RE.match(spans[0]["text"].strip())
        else spans
    )
    bold_chars = sum(len(s["text"].strip()) for s in body if "Bold" in s["font"])
    total_chars = sum(len(s["text"].strip()) for s in body)
    return Line(
        page=page_no,
        column=0 if x0 < middle else 1,
        x0=x0,
        x1=x1,
        y0=y0,
        y1=y1,
        text=clean("".join(s["text"] for s in spans)),
        bold_start="Bold" in spans[0]["font"],
        bold=bold_chars * 2 > total_chars,
        red=any(is_red(s["color"]) for s in spans),
    )


def table_rows(page: pymupdf.Page, lines: list[Line]) -> list[Line]:
    """Çizgili tabloların içindeki satırları hücre hücre toplayıp her tablo satırını tek satıra indirir."""
    result = list(lines)
    for table in page.find_tables().tables:
        for row in table.rows:
            cells: list[str] = []
            members: list[Line] = []
            for cell in row.cells:
                if cell is None:
                    continue
                inside = [
                    item
                    for item in result
                    if cell[0] <= (item.x0 + item.x1) / 2 <= cell[2]
                    and cell[1] <= (item.y0 + item.y1) / 2 <= cell[3]
                ]
                inside.sort(key=lambda item: (round(item.y0), item.x0))
                members.extend(inside)
                if inside:
                    cells.append(clean(" ".join(item.text for item in inside)))
            if not members:
                continue
            result = [
                item for item in result if all(item is not member for member in members)
            ]
            first = min(members, key=lambda item: item.y0)
            result.append(
                Line(
                    page=first.page,
                    column=first.column,
                    x0=min(item.x0 for item in members),
                    x1=max(item.x1 for item in members),
                    y0=first.y0,
                    y1=first.y1,
                    text=" | ".join(cells),
                    bold_start=False,
                    bold=False,
                    red=any(item.red for item in members),
                    table_row=True,
                )
            )
    return result


def read_page_lines(
    page: pymupdf.Page, page_no: int, warnings: list[str]
) -> list[Line]:
    """Sayfadaki metin satırlarını sütunlara ayırıp sol sütun, sonra sağ sütun sırasıyla döndürür."""
    height, middle = page.rect.height, page.rect.width / 2
    raw: list[Line] = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [
                s for s in line["spans"] if s["text"].strip() and "OCR" not in s["font"]
            ]
            if not spans:
                continue
            item = span_line(spans, page_no, middle)
            # Boşluk parçaları da metne katılır; yoksa "I.Eşya", "göre,aşağıdaki" gibi yapışmalar olur.
            item.text = clean(
                "".join(s["text"] for s in line["spans"] if "OCR" not in s["font"])
            )
            if (
                item.y0 < height * TOP_RATIO
                or item.y0 > height * BOTTOM_RATIO
                or NOISE_RE.match(item.text)
            ):
                continue
            raw.append(item)
    raw = table_rows(page, raw)
    raw.sort(key=lambda item: (item.column, item.y0, item.x0))
    merged: list[Line] = []
    for item in raw:
        last = merged[-1] if merged else None
        same_row = (
            last is not None
            and last.column == item.column
            and abs(last.y0 - item.y0) < SAME_LINE_TOLERANCE
        )
        if (
            last is not None
            and same_row
            and item.x0 >= last.x0
            and not (last.table_row or item.table_row)
        ):
            last.text = clean(f"{last.text} {item.text}")
            last.x1, last.y1, last.red = (
                max(last.x1, item.x1),
                max(last.y1, item.y1),
                last.red or item.red,
            )
        else:
            merged.append(item)
    for item in merged:
        if item.column == 0 and item.x1 > middle + COLUMN_OVERFLOW:
            warnings.append(
                f"sayfa {page_no}: satır sütun sınırını aşıyor: {item.text[:60]}"
            )
    return merged


def read_lines(pdf_path: Path, warnings: list[str]) -> list[Line]:
    """Soru içeren sayfaların satırlarını okur; kapak ve açıklama sayfalarını (şık satırı olmayan) atlar."""
    lines: list[Line] = []
    with pymupdf.open(pdf_path) as document:
        for index, page in enumerate(document, start=1):
            page_warnings: list[str] = []
            page_lines = read_page_lines(page, index, page_warnings)
            if any(OPTION_RE.match(item.text) for item in page_lines):
                lines.extend(page_lines)
                warnings.extend(page_warnings)
    return lines


def same_flow(first: Line | None, second: Line) -> bool:
    return first is not None and (first.page, first.column) == (
        second.page,
        second.column,
    )


def parse_questions(lines: list[Line], warnings: list[str]) -> list[Question]:
    """Satır akışını sorulara böler: "N." soru başlatır, "A)"…"E)" şık başlatır, kalanı devam satırıdır."""
    questions: list[Question] = []
    current: Question | None = None
    previous: Line | None = None
    for line in lines:
        last_no = current.no if current else 0
        question_match = QUESTION_RE.match(line.text)
        option_match = OPTION_RE.match(line.text)
        number = (
            int(question_match.group(1)) if question_match and line.bold_start else 0
        )
        if last_no < number <= last_no + MAX_SKIPPED_NUMBERS:
            if number != last_no + 1:
                warnings.append(
                    f"soru {last_no + 1}-{number - 1}: numara bulunamadı (sayfa {line.page})"
                )
            current = Question(number)
            questions.append(current)
            line.text = question_match.group(2) if question_match else ""
            if line.text:
                current.stem.append(line)
        elif current is None:
            warnings.append(
                f"sayfa {line.page}: ilk sorudan önce metin atlandı: {line.text[:60]}"
            )
        elif (
            line.red
            and not option_match
            and CANCEL_RE.search(line.text)
            and not (previous and previous.red)
        ):
            current.cancelled = True
        elif option_match:
            letter = option_match.group(1)
            expected = "ABCDE"[len(current.siklar)] if len(current.siklar) < 5 else "?"
            if letter != expected:
                warnings.append(
                    f"soru {current.no}: şık sırası bozuk ({letter}, beklenen {expected})"
                )
            current.siklar.append(clean(f"{letter}) {option_match.group(2)}"))
            if line.red:
                current.red_letters.append(letter)
        elif current.siklar:
            gap = (
                line.y0 - previous.y0 if previous and same_flow(previous, line) else 0.0
            )
            if gap > (line.y1 - line.y0) * PARAGRAPH_GAP_RATIO * 1.5:
                warnings.append(
                    f"soru {current.no}: son şıktan sonra kopuk metin eklendi: {line.text[:60]}"
                )
            current.siklar[-1] = clean(f"{current.siklar[-1]} {line.text}")
        else:
            current.stem.append(line)
        previous = line
    return questions


def roman_value(line: Line) -> int:
    match = ROMAN_RE.match(line.text)
    return ROMAN_VALUES[match.group(1).lower()] if match else 0


def build_stem(stem: list[Line]) -> list[str]:
    """Kök satırlarını paragraflara toplar; öncüller, tablo satırları ve boşlukla ayrılan bölümler ayrı girdi olur."""
    numerals = {roman_value(line) for line in stem}
    has_roman_list = {
        1,
        2,
    } <= numerals  # tek başına "I." bir öncül değil, "I. Dünya Savaşı" gibi metin olabilir
    entries: list[str] = []
    previous: Line | None = None
    for line in stem:
        gap = line.y0 - previous.y0 if previous and same_flow(previous, line) else 0.0
        new_entry = (
            previous is None
            or line.table_row
            or previous.table_row
            or (has_roman_list and roman_value(line) > 0)
            or bool(LIST_ITEM_RE.match(line.text))
            or gap > (line.y1 - line.y0) * PARAGRAPH_GAP_RATIO
            or line.bold != previous.bold
        )
        if new_entry:
            entries.append(line.text)
        else:
            entries[-1] = clean(f"{entries[-1]} {line.text}")
        previous = line
    return entries


def to_records(questions: list[Question], warnings: list[str]) -> list[dict]:
    records: list[dict] = []
    for question in questions:
        if question.cancelled:
            answer = "İptal"
        elif len(question.red_letters) == 1:
            answer = question.red_letters[0]
        else:
            answer = ""
            state = (
                "yok"
                if not question.red_letters
                else "birden fazla: " + ",".join(question.red_letters)
            )
            warnings.append(
                f"soru {question.no}: kırmızı şık {state}, cevap boş bırakıldı"
            )
        if len(question.siklar) < 4:
            warnings.append(f"soru {question.no}: {len(question.siklar)} şık bulundu")
        if not question.stem:
            warnings.append(f"soru {question.no}: soru kökü boş")
        records.append(
            {
                "no": question.no,
                "kok": build_stem(question.stem),
                "siklar": question.siklar,
                "cevap": answer,
            }
        )
    return records


def extract_exam(pdf_path: Path, exam_name: str) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    questions = parse_questions(read_lines(pdf_path, warnings), warnings)
    return {"sinav": exam_name, "sorular": to_records(questions, warnings)}, warnings


def dump_raw(pdf_path: Path) -> None:
    """Denetim için ham sütun metnini (sayfa, sütun, koordinat, işaretler) yazdırır."""
    for line in read_lines(pdf_path, []):
        flags = (
            ("B" if line.bold else "-")
            + ("R" if line.red else "-")
            + ("T" if line.table_row else "-")
        )
        print(
            f"s{line.page:02d} k{line.column} x{line.x0:5.0f} y{line.y0:5.0f} {flags} {line.text}"
        )


def write_output(exam: dict, output: Path | None, append: bool) -> None:
    if output is None:
        json.dump(exam, sys.stdout, ensure_ascii=False, indent=1)
        sys.stdout.write("\n")
        return
    exams: list[dict] = []
    if append and output.exists():
        exams = [
            item
            for item in json.loads(output.read_text(encoding="utf-8"))
            if item["sinav"] != exam["sinav"]
        ]
    exams.append(exam)
    output.write_text(
        json.dumps(exams, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sınav kitapçığı PDF'inden soruları çıkarır."
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "sinav", help='sınav adı, örn. "Gümrük Müşavirliği Sınavı · 2023"'
    )
    parser.add_argument("-o", "--cikti", type=Path, help="JSON dosyası (sınav listesi)")
    parser.add_argument(
        "--ekle", action="store_true", help="çıktı dosyasındaki listeye ekle"
    )
    parser.add_argument(
        "--ham", action="store_true", help="yalnızca ham sütun metnini yazdır"
    )
    args = parser.parse_args()
    if args.ham:
        dump_raw(args.pdf)
        return 0
    exam, warnings = extract_exam(args.pdf, args.sinav)
    write_output(exam, args.cikti, args.ekle)
    for warning in warnings:
        print(f"UYARI {args.sinav}: {warning}", file=sys.stderr)
    print(
        f"{args.sinav}: {len(exam['sorular'])} soru, {len(warnings)} uyarı",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
