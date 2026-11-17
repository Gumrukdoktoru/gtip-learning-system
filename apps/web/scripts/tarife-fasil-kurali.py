"""Tarife sorularını fasıllara kuralla bağlar (metin benzerliği kullanılmaz) ve kaynaklar arası tekrarları ayıklar.

build-sorular-data.py tarafından yüklenir. Kural:
  * "NN.NN", "NNNN.NN", "NNNN.NN.NN.NN.NN", "NNNN pozisyonu", "Fasıl N", "N. fasıl", "N-M fasıl" -> NN faslı.
  * dogru   : soru kökünde geçen fasıllar + doğru şıkta geçen fasıllar (kök "hangi fasılda" diye soruyorsa
              yalın sayı şıklar da fasıl sayılır: "A) 22").
  * secenek : yalnızca diğer şıklarda geçen fasıllar.
  * "gyk"   : kökte ya da doğru şıkta genel yorum kuralı anılıyorsa dogru, yalnızca diğer şıklardaysa secenek.
  * Kodun biçimini soran sorularda (basamak, açılım, nomanklatür kodu örneği) şıklardaki kodlar örnektir, fasıl
    sayılmaz; vergi hesaplama sorularında pozisyon yalnızca veridir, hiç fasıl atanmaz.
  * Romen rakamlı "Bölüm" tek başına fasıl işareti sayılmaz (zayıf ipucu): böyle sorular genel konuya gider.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

ORDINAL = r"(?:\s*[.’'`]?\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü))?"
GTIP_RE = re.compile(r"(?<![\d.,/])(\d{4})\.(\d{2})(?:\.\d{2}){0,3}(?!\d)")
POSITION_RE = re.compile(r"(?<![\d.,/%])(\d{2})\.(\d{2})(?!\d)(?!\.\d)")
BARE_POSITION_RE = re.compile(
    r"(?<![\d.,/])(\d{4})(?![\d.,/])\s*(?:tarife\s+)?(?:alt\s+)?pozisyon"
)
CHAPTER_RANGE_RE = re.compile(
    r"(?<![\d.,])(\d{1,2})\s*[-–]\s*(\d{1,2})" + ORDINAL + r"\s*\.?\s*fas[ıi]?l"
)
CHAPTER_BEFORE_RE = re.compile(
    r"(?<![\d.,])(\d{1,2})"
    + ORDINAL
    + r"\s*\.?\s*fas[ıi]?l(?!\w*\s+(?:oluş|meydana|ibaret))"
)
CHAPTER_AFTER_RE = re.compile(
    r"fas[ıi]l[ıi]?\s*(\d{1,2})(?!\d)(?!\s*(?:no\b|no\.|nolu|numaralı|sayılı))"
)
BARE_NUMBER_RE = re.compile(r"(\d{1,2})\s*\.?\s*(?:fas[ıi]?l\w*)?\.?")
RULE_RE = re.compile(r"yorum\w*\s+(?:\w+\s+){0,2}(?:genel\s+)?kural|genel\s+kural|\bgyk\b")
DOTTED_GTIP_RE = re.compile(r"(?<![\d.,/])(\d{2})\.\d{2}(?:\.\d{2}){1,4}(?![\d.])")  # 64.06.90.90.10.00
SPACED_CODE_RE = re.compile(r"(?<![\d.,/])(\d{4}) \d{2} \d{2}(?!\d)")  # 0701 90 50
CODE_FORMAT_RE = re.compile(
    r"basama|rakam|açılım|hane|istatistik|örne[kğ]|kaç (?:fasıl|bölüm)|nomanklatür\w* (?:pozisyon|kod)"
)
MONEY_RE = re.compile(
    r"\d\s*(?:tl|try|euro|avro|eur|usd|abd doları|dolar)\b|\bcif\b|\bfob\b|vergisi? oran|vergisi? tutar|ilave gümrük vergisi|matrah"
)
MAX_RANGE = 20


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def squash(text: str) -> str:
    return re.sub(r"[^0-9a-zçğıöşü]", "", lower_tr(text))


def chapters(text: str) -> set[str]:
    """Metinde (küçük harfe çevrilmiş) açıkça geçen fasıllar: {"02", "84"}."""
    found: set[int] = set()
    for a, b in CHAPTER_RANGE_RE.findall(text):
        if int(a) < int(b) <= int(a) + MAX_RANGE:
            found.update(range(int(a), int(b) + 1))
    found.update(int(code[:2]) for code, _ in GTIP_RE.findall(text))
    found.update(int(a) for a, b in POSITION_RE.findall(text) if b != "00")
    found.update(int(code[:2]) for code in BARE_POSITION_RE.findall(text))
    found.update(int(a) for a in DOTTED_GTIP_RE.findall(text))
    found.update(int(code[:2]) for code in SPACED_CODE_RE.findall(text))
    found.update(int(n) for n in CHAPTER_BEFORE_RE.findall(text))
    found.update(int(n) for n in CHAPTER_AFTER_RE.findall(text))
    return {"%02d" % n for n in found if 1 <= n <= 97}


def roles(question: dict) -> tuple[set[str], set[str]]:
    """(dogru, secenek): fasıl numaraları ("01"…"97") ve genel yorum kuralları için "gyk"."""
    stem = lower_tr(" ".join(question["kok"]))
    if MONEY_RE.search(stem):
        return set(), set()
    answer = question["cevap"] if len(question["cevap"]) == 1 else ""
    asks_chapter = bool(re.search(r"fas[ıi]?l", stem))
    use_options = not CODE_FORMAT_RE.search(stem)
    right: set[str] = chapters(stem)
    other: set[str] = set()
    if RULE_RE.search(stem):
        right.add("gyk")
    for option in question["siklar"]:
        body = lower_tr(option[2:].strip())
        marks = chapters(body) if use_options else set()
        number = BARE_NUMBER_RE.fullmatch(body)
        if use_options and asks_chapter and number and 1 <= int(number.group(1)) <= 97:
            marks.add("%02d" % int(number.group(1)))
        if RULE_RE.search(body):
            marks.add("gyk")
        (right if answer and option.startswith(answer + ")") else other).update(marks)
    return right, other - right


def words(question: dict) -> set[str]:
    text = lower_tr(" ".join(question["kok"] + [o[2:] for o in question["siklar"]]))
    return {w[:6] for w in re.findall(r"[0-9a-zçğıöşü]{2,}", text)}


def rank(entry: dict) -> tuple[int, int, int]:
    """Tekrarlardan hangisinin tutulacağı: harf cevabı olan > kitapçık sürümü (dayanak/madde bağlantısı) > sınav etiketli."""
    question = entry["soru"]
    return (
        len(question["cevap"]) == 1 and bool(question["siklar"]),
        entry["kaynak"] == "kitapcik",
        bool(entry.get("etiket")),
    )


def answer_text(question: dict) -> str:
    if len(question["cevap"]) != 1:
        return ""
    return next((squash(o[2:]) for o in question["siklar"] if o.startswith(question["cevap"] + ")")), "")


def dedupe(entries: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """Aynı soruyu (kök + şıklar, yazım farklarına dayanıklı) tek girdide toplar.

    entries: {"soru", "kaynak": "kitapcik" | "pdf" | "kart", "etiket", "ev": {fasıl}, "cozum"?}
    Dönen girdilerde "kaynaklar" (birleşen kaynak adları), "ev" (kartların bulunduğu fasılların birleşimi),
    "cozum" (kitaptaki çözüm, varsa) ve "celiski" (aynı soruya farklı harf cevabı veren kaynak varsa) bulunur.
    """
    keyed = [
        (
            squash(" ".join(e["soru"]["kok"]))
            + "|"
            + squash(" ".join(o[2:] for o in e["soru"]["siklar"])),
            words(e["soru"]),
            e,
        )
        for e in entries
    ]
    groups: list[list[tuple[str, set[str], dict]]] = []
    exact: dict[str, int] = {}
    for key, bag, entry in keyed:
        at = exact.get(key)
        if at is None:
            for i, group in enumerate(groups):
                other_key, other_bag, _ = group[0]
                union = len(bag | other_bag)
                if (
                    union
                    and len(bag & other_bag) / union >= 0.7
                    and SequenceMatcher(None, key, other_key, autojunk=False).ratio()
                    >= 0.88
                ):
                    at = i
                    break
        if at is None:
            at = len(groups)
            groups.append([])
        exact.setdefault(key, at)
        groups[at].append((key, bag, entry))
    stats = {"girdi": len(entries), "tekil": len(groups), "celiski": 0}
    merged = []
    for group in groups:
        members = [entry for _, _, entry in group]
        best = max(
            members, key=rank
        )  # eşitlikte ilk gelen (kitapçıklar yeni yıldan eskiye sıralıdır)
        # Aynı soru farklı sınavlarda şıkları karışık sorulabilir: harf değil, doğru şıkkın metni karşılaştırılır.
        letters = {answer_text(m["soru"]) for m in members} - {""}
        result = {
            **best,
            "kaynaklar": sorted({m["kaynak"] for m in members}),
            "ev": set().union(*(m.get("ev", set()) for m in members)),
            "uyeler": members,
        }
        solution = next((m["cozum"] for m in members if m.get("cozum")), None)
        if solution:
            result["cozum"] = solution
        # Yazım/tarama farkı ("Deniz" ~ "Deniz suyu") çelişki sayılmaz.
        texts = sorted(letters)
        differ = any(not (a in b or b in a) and SequenceMatcher(None, a, b).ratio() < 0.8 for i, a in enumerate(texts) for b in texts[i + 1 :])
        if differ:
            result["celiski"] = sorted(letters)
            stats["celiski"] += 1
        merged.append(result)
    return merged, stats
