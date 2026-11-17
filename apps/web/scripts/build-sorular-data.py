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
    sorular-konu.json    {konu kimliği: [soru, ...]}  (Tarife, Sair Mevzuat vb. konularının çıkmış soruları)
    ek-90x-1.json        sekme başına, hiçbir konuya bağlanamayan çıkmış sorular (Tarife: genel tarife bilgisi soruları)

Tarife fasılları kuralla doldurulur (tarife-fasil-kurali.py): sınav kitapçıkları, tarife-cikmis-sorular.json
(extract-tarife-pdf.py çıktısı) ve Tarife Kitabının fasıl fasıl "çıkmış soru örneği" kartları tekrarsız hâle getirilir;
soru, kökünde/doğru şıkkında geçen fasla "dogru", yalnızca diğer şıklarda geçen fasla "secenek" rolüyle bağlanır.
PDF derlemesinin tamamı "Tarife çıkmış sorular — tümü" konusunda verilir; aynı belgenin ham sayfa dökümü konuları kaldırılır.

Madde dayanağı olmayan sorular için dayanak, diğer not dosyalarının (ek-*.json) pasajlarında aranır
(PassageMatcher); eşiğin altında kalan soru dayanaksız bırakılır, metin üretilmez.

Otomatik eşleştiricilerden sonra hâlâ dayanağı olmayan sorulara, adayları okunarak seçilmiş dayanaklar
(dayanak-secimleri.json; ReviewedBasis) uygulanır. Her seçimin metni güncel veride aynen aranır; bulunamayan
(eskimiş) seçim uygulanmaz ve sayılır.
"""
from __future__ import annotations

import hashlib
import html
import importlib.util
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
        self.paragraph_bags: dict[str, list[set[str]]] = {}
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


    def best_law(self, question: dict) -> dict | None:
        """Kökü Gümrük Kanununu ya da Yönetmeliğini adıyla anan soru için o mevzuattaki en benzer madde.

        Yalnızca güvenli eşleşme döner; üç ölçütten biri yeterlidir, ölçütler farklı madde gösterirse eşleşme yok sayılır:
          * kök + doğru şık ile madde benzerliği >= LAW_SCORE, ikinci adayla fark >= LAW_MARGIN ve kök ağırlığının
            LAW_STEM_COVER kadarı maddede;
          * kök + doğru şıkkın ağırlığının LAW_PARA_COVER kadarı maddenin tek bir fıkrasında, ikinci maddeyle fark >= LAW_PARA_MARGIN;
          * kök + bütün şıklar ile madde benzerliği >= LAW_ALL_SCORE, ikinci adayla fark >= LAW_ALL_MARGIN (şıkların
            çoğu aynı maddenin hükümleridir).
        Ölçüm: kaynağın maddesini gösterdiği, kökü Kanunu/Yönetmeliği anan 618 sorunun 292'si bu ölçütleri geçer; bunların
        265'i (%91) kaynağın gösterdiği maddeyle aynıdır (kalan 27'nin 11'i komşu madde ya da diğer mevzuattaki karşılığı).
        """
        stem = lower_tr(" ".join(question["kok"]))
        if re.search(r"\d\s+sayılı", stem.replace("4458 sayılı", "")):  # başka bir mevzuat da anılıyor
            return None
        prefix = "gy-" if "gümrük yönetmeli" in stem else "gk-" if LAW_NAMED_RE.search(stem) else ""
        answer = [o for o in question["siklar"] if o.startswith(question["cevap"] + ")")] if len(question["cevap"]) == 1 else []
        bag = {t for t in tokens(" ".join(question["kok"] + answer)) if t in self.idf}
        norm = math.sqrt(sum(self.idf[t] ** 2 for t in bag))
        weight = sum(self.idf[t] for t in bag)
        if not prefix or len(bag) < 4 or not norm or not weight:
            return None
        scope = [i for i, (ident, _, _) in enumerate(self.articles) if ident.startswith(prefix)]
        if len(scope) < 2:
            return None
        if not self.paragraph_bags:
            self.paragraph_bags = {ident: [tokens(p) for p in paragraphs] for ident, paragraphs in self.paragraphs.items()}
        cosine = sorted(((sum(self.idf[t] ** 2 for t in bag & self.articles[i][2]) / (norm * self.norms[i]), i) for i in scope), reverse=True)
        cover = sorted(((max((sum(self.idf[t] for t in bag & p) for p in self.paragraph_bags[self.articles[i][0]]), default=0.0) / weight, i) for i in scope), reverse=True)
        picks = set()
        if cosine[0][0] >= LAW_SCORE and cosine[0][0] - cosine[1][0] >= LAW_MARGIN:
            article = self.articles[cosine[0][1]][2]
            stem_bag = {t for t in tokens(" ".join(question["kok"])) if t in self.idf}
            if sum(self.idf[t] for t in stem_bag & article) >= LAW_STEM_COVER * (sum(self.idf[t] for t in stem_bag) or 1.0):
                picks.add(cosine[0][1])
        if cover[0][0] >= LAW_PARA_COVER and cover[0][0] - cover[1][0] >= LAW_PARA_MARGIN:
            picks.add(cover[0][1])
        wide = {t for t in tokens(" ".join(question["kok"] + question["siklar"])) if t in self.idf}
        wide_norm = math.sqrt(sum(self.idf[t] ** 2 for t in wide)) or 1.0
        broad = sorted(((sum(self.idf[t] ** 2 for t in wide & self.articles[i][2]) / (wide_norm * self.norms[i]), i) for i in scope), reverse=True)
        if broad[0][0] >= LAW_ALL_SCORE and broad[0][0] - broad[1][0] >= LAW_ALL_MARGIN:
            picks.add(broad[0][1])
        if len(picks) != 1:
            return None
        at = picks.pop()
        return {"id": self.articles[at][0], "ad": self.articles[at][1], "puan": round(dict((i, score) for score, i in cosine)[at], 2)}


# --- Konu notlarında (ek-*.json) pasaj düzeyinde dayanak eşleştirme ---------------------------
ORDINAL = r"(?:\s*[.’'`]?\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü))?"
# "Gümrük Kanunu'nun 5 inci maddesi", "Gümrük Yönetmeliğinin 561 inci maddesi", "Gümrük Kanunu 57 nci maddesi"
CITED_ARTICLE_RE = re.compile(r"gümrük (kanunu|yönetmeliği)(?:\W{0,2}n[uıiü]n|n)?\s+(\d{1,3})(?:\s*/\s*([a-z]))?" + ORDINAL + r"\s*\.?\s*madde")
LAW_NAMED_RE = re.compile(r"gümrük kanun\w*\b(?!\s+bazı)")  # "…Kanununun Bazı Maddelerinin Uygulanması Hakkında Karar" değil
LAW_SCORE, LAW_MARGIN, LAW_STEM_COVER = 0.4, 0.15, 0.6
LAW_PARA_COVER, LAW_PARA_MARGIN = 0.8, 0.1
LAW_ALL_SCORE, LAW_ALL_MARGIN = 0.35, 0.1
CODE4_RE = re.compile(r"(?<![\d.,/])(\d{2})\.(\d{2})(?!\d)(?!\.\d)")  # 96.03 (tarih ve tutar değil)
CODE6_RE = re.compile(r"(?<![\d.,/])(\d{4})\.(\d{2})(?!\d)")  # 8471.30, 4602.11.00.10.00
CHAPTER_RES = [re.compile(r"fas[ıi]l[ıi]?\s*(\d{1,2})(?!\d)"), re.compile(r"(?<![\d.,])(\d{1,2})" + ORDINAL + r"\s*\.?\s*fas[ıi]?l")]
ARTICLE_RES = [re.compile(r"(?:madde|md)\s*\.?\s*(\d{1,3})(?!\d)"), re.compile(r"(?<![\d.,])(\d{1,3})" + ORDINAL + r"\s*\.?\s*madde")]
RULE_RES = [re.compile(r"gyk\s*(\d)"), re.compile(r"kural[ıi]?\s*(\d)(?!\d)"),
            re.compile(r"(?<![\d.,])(\d)\s*(?:\(\w\))?\s*(?:numaralı|no\.?lu|nolu|sayılı|\.)?\s*(?:genel\s+yorum\s+)?kural")]
SENTENCE_END_RE = re.compile(r"[.!?][\"”’')\]]*$")
LINE_OPEN_RE = re.compile(r"[.!?:][\"”’')\]]*$")
QUESTION_LIKE_RE = re.compile(r"aşağıdaki\w*\s.*hangi|\?\s*$|\bA\)\s.*\bB\)\s")
MONEY_RE = re.compile(r"\d\s*(?:tl|try|euro|avro|eur|usd|abd doları|dolar)\b|\bcif\b|\bfob\b|vergisi? oran|vergisi? tutar|ilave gümrük vergisi|matrah")
CODE_FORMAT_RE = re.compile(r"basama|rakam|açılım|hane|istatistik|örne[kğ]|kaç (?:fasıl|bölüm)")  # kodun yapısını soran sorular
GLUED_RE = re.compile(r"(?<=[A-ZÇĞİÖŞÜ]{3})(?=[a-zçğıöşü]{2})")
GLUED_CAPITAL_RE = re.compile(r"(?<=[A-ZÇĞİÖŞÜ]{3})(?=[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2})")
PURPOSE_RE = re.compile(r"amaç ve kapsam|(?:yönetmeliğin|tebliğin|kararın|kanunun) amacı|dayanak\s*[–-]\s*md")  # belge başı: her soruyla örtüşür
NEGATIVE_RE = re.compile(r"değildir|yanlış|sayıl(?:a)?maz|almaz|söylenemez|olamaz|bulunmaz|yoktur|m[ae]mıştır|m[ae]miştir|m[ae]maktadır|m[ae]mektedir|hariç|dışında|[ae]maz\b|[ae]mez\b")
ROMAN_RE = re.compile(r"^[a-e]\)\s*(?:yalnız\s+)?[ıivx]+(?:\s*(?:,|ve)\s*[ıivx]+)*\.?$")
TARIFF_HOME_FOLDER = 801  # fasıl sorularının toplandığı klasör: "Tarife Kitabı — fasıl fasıl ders notları"
ANCHORED_MIN = 0.3  # soru kökü mevzuatı adıyla anıyorsa ve pasaj o mevzuatın notundaysa yeterli puan
TRUSTED_FOLDERS = {1, 6, 7, 9, 10, 11, 12}  # elle hazırlanmış ders notları; diğerleri ham mevzuat dökümü


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def passage_tokens(text: str, derive: bool = False) -> set[str]:
    """tokens() + tarife kodları (p9603, s847130), fasıl (f13), madde (m14) ve yorum kuralı (g3) simgeleri.

    derive=True (soru tarafı): pozisyon kodundan faslı da üretir, böylece soru kendi faslının notuna yönelir.
    """
    # Sayfa dökümünde yapışmış sözcükler iki biçimde de ayrılır: "YILAkadar" -> YILA kadar, "CEZAMahkemesi" -> CEZA Mahkemesi
    bag = tokens(GLUED_CAPITAL_RE.sub(" ", text)) if GLUED_CAPITAL_RE.search(text) else set()
    text = GLUED_RE.sub(" ", text)
    low = lower_tr(text)
    bag |= tokens(text)
    for a, b in CODE4_RE.findall(low):
        if "01" <= a <= "97":
            bag.add("p" + a + b)
            if derive:
                bag.add("f" + a)
    for a, b in CODE6_RE.findall(low):
        if "01" <= a[:2] <= "97":
            bag.update(("p" + a, "s" + a + b))
            if derive:
                bag.add("f" + a[:2])
    for pattern in CHAPTER_RES:
        bag.update("f%02d" % int(n) for n in pattern.findall(low) if 1 <= int(n) <= 97)
    for pattern in ARTICLE_RES:
        bag.update("m" + n for n in pattern.findall(low))
    for pattern in RULE_RES:
        bag.update("g" + n for n in pattern.findall(low) if "1" <= n <= "6")
    return bag


def word_pairs(text: str) -> set[tuple[str, str]]:
    """Ardışık sözcük çiftleri: mevzuat cümlesinin soruda aynen geçtiğinin göstergesi."""
    words = [w[:6] for w in re.findall(r"[0-9a-zçğıöşü]{3,}", lower_tr(GLUED_RE.sub(" ", text)))]
    return set(zip(words, words[1:]))


def trim_passage(text: str, limit: int = 700) -> str:
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + " …"


class Passage:
    __slots__ = ("topic", "folder", "anchor", "name", "text", "bag", "context")

    def __init__(self, topic: int, folder: int, anchor: str, name: str, text: str, context: set[str]) -> None:
        self.topic, self.folder, self.anchor, self.name, self.text = topic, folder, anchor, name, text
        self.bag = passage_tokens(text)
        self.context = context


class PassageMatcher:
    """Diğer not dosyalarındaki (ek-*.json) paragraf, tablo satırı ve madde fıkralarında dayanak arar.

    Birim: satır sonlarından bölünmüş paragraflar cümle sonuna kadar birleştirilerek elde edilen pasaj
    (metin değiştirilmez, yalnızca ardışık satırlar boşlukla birleştirilir). Soru kartı içeren klasörler
    (çıkmış soru / alıştırma bankaları) birim üretmez; böylece soru başka bir soruyla eşleşmez.
    Arama, simge -> birim ters diziniyle yapılır; puan = sorunun IDF ağırlığının pasajda bulunan oranı.
    """

    def __init__(self, index: dict) -> None:
        self.units: list[Passage] = []
        self.topic_info: dict[int, tuple[str, int, str, str]] = {}
        for group in index["groups"]:
            for folder in group["folders"]:
                for topic in folder["topics"]:
                    self.topic_info[topic["id"]] = (group["id"], folder["id"], folder["title"], topic["title"])
        bundles = [t for path in sorted(DATA_DIR.glob("ek-*.json")) for t in json.loads(path.read_text(encoding="utf-8"))]
        self.question_folders = {
            self.topic_info[t["id"]][1] for t in bundles if t["id"] in self.topic_info and any(b["t"] == "q" for b in t["blocks"])
        }
        for topic in bundles:
            info = self.topic_info.get(topic["id"])
            if not info or "içindekiler" in lower_tr(info[3]):
                continue
            if info[1] not in self.question_folders and not SUBJECT_FOLDER_BASE <= info[1] < SUBJECT_FOLDER_BASE + 100:
                self._add_topic(topic, info)
        total = len(self.units)
        counts: dict[str, int] = {}
        self.postings: dict[str, list[int]] = {}
        for at, unit in enumerate(self.units):
            for token in unit.bag:
                counts[token] = counts.get(token, 0) + 1
            for token in unit.bag | unit.context:
                self.postings.setdefault(token, []).append(at)
        self.max_idf = math.log(total)
        self.idf = {token: math.log(total / count) for token, count in counts.items()}
        self.chapter_home: dict[str, int] = {}  # "13" / "gyk" -> sorularının gösterileceği konu
        self.chapter_topics: dict[str, set[int]] = {}
        self.mirrors: dict[int, int] = {}
        for topic_id, (group, folder, _, title) in self.topic_info.items():
            if group != "tarife" or folder in self.question_folders or SUBJECT_FOLDER_BASE <= folder < SUBJECT_FOLDER_BASE + 100:
                continue
            chapter = re.search(r"Fasıl (\d{2})\b", title)
            key = chapter.group(1) if chapter else "gyk" if re.search(r"genel yorum kural|tarifenin yorumu", lower_tr(title)) else None
            if key:
                self.chapter_topics.setdefault(key, set()).add(topic_id)
                if folder == TARIFF_HOME_FOLDER:
                    self.chapter_home[key] = topic_id
        for key, topic_ids in self.chapter_topics.items():
            for topic_id in topic_ids:
                if key in self.chapter_home and topic_id != self.chapter_home[key]:
                    self.mirrors[topic_id] = self.chapter_home[key]
        self._cache: dict[str, tuple[dict | None, int | None]] = {}

    def _add_topic(self, topic: dict, info: tuple[str, int, str, str]) -> None:
        topic_id, folder = topic["id"], info[1]
        name = f"{info[2]} · {info[3]}"
        title_bag = passage_tokens(info[3])
        state = {"head": "", "anchor": f"konu-{topic_id}", "name": name, "context": title_bag}
        lines: list[str] = []

        def flush() -> None:
            text = " ".join(lines)
            lines.clear()
            if len(text) >= 40 and not QUESTION_LIKE_RE.search(text):
                self.units.append(Passage(topic_id, folder, state["anchor"], state["name"], text, state["context"]))

        def feed(line: str) -> None:
            lines.append(line.strip())
            size = sum(len(x) + 1 for x in lines)
            if (SENTENCE_END_RE.search(lines[-1]) and size >= 120) or size >= 600:
                flush()

        for block in topic["blocks"]:
            kind = block["t"]
            if kind in "hd":
                text = block["x"].strip()
                # Sayfa dökümünde cümlenin ortasında kalan satırlar başlık sanılabiliyor: metne katılır.
                if kind == "h" and ((lines and not LINE_OPEN_RE.search(lines[-1])) or len(text) > 70):
                    feed(text)
                else:
                    flush()
                    state["context"] = title_bag | passage_tokens(text)
            elif kind == "p":
                feed(block["x"])
            elif kind == "t":
                flush()
                saved = state["context"]
                state["context"] = saved | passage_tokens(" ".join(block["rows"][0]))
                for row in block["rows"][1:]:
                    lines.append(" · ".join(cell for cell in row if cell))
                    flush()
                state["context"] = saved
            elif kind == "a":
                flush()
                saved = dict(state)
                label = " · ".join(x for x in (block["doc"], block["label"], block["title"]) if x)
                state.update(anchor=block["id"], name=f"{info[2]} · {info[3]} · {label}"[:220],
                             context=title_bag | passage_tokens(block["title"]) | {"m" + block["no"]})
                for line in block["p"]:
                    feed(line)
                flush()
                state.update(saved)
        flush()

    def search(self, question: dict, allowed, top: int = 6) -> list[dict]:
        """En iyi pasajlar: puan (0–1), ortak simge sayısı, ortak sözcük çifti sayısı, cevap kodu var mı."""
        answer = [o for o in question["siklar"] if o.startswith(question["cevap"] + ")")] if len(question["cevap"]) == 1 else []
        text = " ".join(question["kok"] + answer)
        bag = passage_tokens(text, derive=True)
        weight = {token: self.idf.get(token, self.max_idf) for token in bag}
        total = sum(weight.values())
        if len(bag) < 3 or not total:
            return []
        answer_codes = {t for t in passage_tokens(" ".join(answer)) if t[0] in "ps" and t[1:].isdigit()}
        pool: dict[int, float] = {}
        for token in bag:
            hits = self.postings.get(token, ())
            if len(hits) > 4000:  # çok yaygın simgeler aday üretmez (puan hesabına yine girer)
                continue
            for at in hits:
                pool[at] = pool.get(at, 0.0) + weight[token]
        candidates = sorted((at for at in pool if allowed(self.units[at])), key=pool.get, reverse=True)[:40]
        pairs = word_pairs(text)
        # Şıkların köke eklediği simgeler: olumlu soruda doğru şık, olumsuz soruda ("hangisi değildir")
        # diğer şıklar pasajda geçmelidir; yalnızca mevzuatın adını tekrarlayan başlık pasajları böyle elenir.
        stem_bag = passage_tokens(" ".join(question["kok"]))
        extras = {o[:1]: passage_tokens(o[2:]) - stem_bag for o in question["siklar"]}
        stem_low = lower_tr(" ".join(question["kok"]))
        negative = bool(NEGATIVE_RE.search(lower_tr(question["kok"][-1])))
        checked = [e for letter, e in extras.items() if e and (letter != question["cevap"]) == negative]
        own = extras.get(question["cevap"]) or set()  # olumsuz soruda doğru şık çoğu kez hükmün değiştirilmiş hâlidir
        if ROMAN_RE.match(lower_tr(" ".join(answer))):
            checked, own = [], set()
        found = []
        for at in candidates:
            unit = self.units[at]
            shared = bag & unit.bag
            nearby = (bag & unit.context) - shared
            score = (sum(weight[t] for t in shared) + 0.5 * sum(weight[t] for t in nearby)) / total
            if PURPOSE_RE.search(lower_tr(unit.text[:260])) and not re.search(r"amac|kapsam|dayana", stem_low):
                score *= 0.6
            hits = sum(1 for e in checked if len(e & unit.bag) * 2 >= len(e))
            found.append({
                "unit": unit, "score": score, "shared": len(shared), "pairs": len(pairs & word_pairs(unit.text)),
                "code": bool(answer_codes & unit.bag),
                "support": None if not checked else hits >= min(2, len(checked)) or (negative and len(own) >= 4 and len(own & unit.bag) * 5 >= len(own) * 3),
            })
        found.sort(key=lambda c: c["score"] + 0.03 * min(c["pairs"], 10) + 0.08 * (c["unit"].folder in TRUSTED_FOLDERS)
                   + 0.15 * c["code"] + {None: 0.0, True: 0.1, False: -0.1}[c["support"]], reverse=True)
        return found[:top]

    def tariff_key(self, question: dict) -> str | None:
        """Soru tek bir fasla ya da genel yorum kurallarına açıkça bağlıysa o konunun anahtarı."""
        stem = lower_tr(" ".join(question["kok"]))
        answer = lower_tr(" ".join(o for o in question["siklar"] if o.startswith(question["cevap"] + ")"))) if len(question["cevap"]) == 1 else ""
        if "yorum kural" in stem:
            return "gyk"
        if MONEY_RE.search(stem):  # vergi hesaplama sorusu: pozisyon yalnızca veridir
            return None
        # Kökte fasıl yoksa doğru şıktaki pozisyona bakılır; olumsuz soruda doğru şık "aykırı" olandır, kullanılmaz.
        odd = CODE_FORMAT_RE.search(stem) or NEGATIVE_RE.search(lower_tr(question["kok"][-1]))
        for text in (stem, "" if odd else answer):
            chapters = {t[1:] for t in passage_tokens(text, derive=True) if t[0] == "f" and t[1:].isdigit()}
            if chapters:
                return chapters.pop() if len(chapters) == 1 and next(iter(chapters)) in self.chapter_home else None
        return None

    @staticmethod
    def conflicts(question: dict, anchors: list[dict], name: str) -> bool:
        """Soru kökü bir mevzuatı adıyla anıyor, fakat verilen kaynak adı o mevzuata uymuyorsa True."""
        stem = lower_tr(" ".join(question["kok"]))
        return any(a.get("konu") and re.search(a["soru"], stem) and not re.search(a["konu"], lower_tr(name)) for a in anchors)

    def link(self, question: dict, tariff: bool, anchors: list[dict]) -> tuple[dict | None, int | None]:
        """(dayanak, sorunun gösterileceği konu). Eşik altında kalan soru bağlanmaz."""
        key = squash(" ".join(question["kok"] + question["siklar"]))[:160] + question["cevap"]
        if key not in self._cache:
            self._cache[key] = self._link(question, tariff, anchors)
        return self._cache[key]

    def _link(self, question: dict, tariff: bool, anchors: list[dict]) -> tuple[dict | None, int | None]:
        if not question["siklar"] or len(question["cevap"]) != 1:
            return None, None
        stem = lower_tr(" ".join(question["kok"]))
        required = [re.compile(a["konu"]) if a.get("konu") else None for a in anchors if re.search(a["soru"], stem)]
        if None in required:
            return None, None
        chapter = self.tariff_key(question) if tariff else None
        if chapter:
            scope = self.chapter_topics[chapter]
            best = next(iter(self.search(question, lambda u: u.topic in scope)), None)
            good = best and best["support"] is not False and (
                (best["shared"] >= 3 and (best["score"] >= 0.5 or (best["score"] >= 0.4 and (best["code"] or best["pairs"] >= 3))))
                or (best["support"] and best["shared"] >= 2 and best["score"] >= 0.3)
            )
            return (self._basis(best) if good else None), self.chapter_home[chapter]

        def allowed(unit: Passage) -> bool:
            if (self.topic_info[unit.topic][0] == "tarife") != tariff:
                return False
            return all(pattern.search(lower_tr(unit.name)) for pattern in required)

        best = next(iter(self.search(question, allowed)), None)
        if not best:
            return None, None
        score, pairs, support = best["score"], best["pairs"], best["support"]
        if support is False:  # şıklar pasajda geçmiyor: ancak cümle neredeyse aynen alınmışsa kabul
            good = score >= 0.5 and pairs >= 10
        elif best["unit"].folder in TRUSTED_FOLDERS or tariff:
            # Kök mevzuatı adıyla anıyor ve pasaj o mevzuatın notunda: şıklar da pasajda geçiyorsa düşük puan yeter
            # (uzun mevzuat adı kökün ağırlığını şişirir).
            anchored = bool(required) and ((pairs >= 3 and score >= (ANCHORED_MIN if support else 0.5)) or (bool(support) and pairs >= 6 and score >= 0.18))
            good = (score >= 0.55 and pairs >= 3) or (score >= 0.5 and pairs >= 6) or anchored
        else:
            good = (score >= 0.65 and pairs >= 6) or (bool(required) and score >= 0.55 and pairs >= 5)
        if tariff and best["code"] and best["shared"] >= 3 and best["score"] >= 0.5:
            good = True
        if not good:
            return None, None
        return self._basis(best), self.mirrors.get(best["unit"].topic, best["unit"].topic)

    @staticmethod
    def _basis(candidate: dict) -> dict:
        unit = candidate["unit"]
        return {"id": unit.anchor, "ad": unit.name, "metin": trim_passage(unit.text), "puan": round(candidate["score"], 2)}


REVIEWED_FILE = Path(__file__).resolve().parent / "dayanak-secimleri.json"
OFFICIAL_DIR = Path(__file__).resolve().parent / "resmi-metinler"  # mevzuat.gov.tr'den alınmış madde metinleri
GENERAL_RE = re.compile(
    r"işleminin sonucu|kaçtır\?|olduğuna göre|yaşındadır|kümesi|cümle|sözcük|paragraf|parçada|parçaya göre|anlatım bozukluğu|yazım yanlış"
    r"|noktalama|kesme işareti|deyim|atasöz|mecaz|atatürk|mustafa kemal|kurtuluş savaşı|mill[iî] mücadele|tbmm|büyük millet meclisi"
    r"|osmanlı|kongresi|lozan|inkıl[aâ]p|dünya savaşı|muharebe|anayasa|kararname|milletvekil|siyasi parti|idari yargı|medeni kanun"
)
CUSTOMS_RE = re.compile(r"gümrü|ithal|ihra[cç]|tarife|fas[ıi]l|eşya|vergi|rejim|beyan|menşe|kaçak|antrepo|serbest bölge|döviz|kambiyo|tebliğ|yönetmeli|kdv|ötv")


def question_key(question: dict) -> str:
    """Okunarak seçilen dayanağın anahtarı: kök, şıklar ve cevabın yazım farklarından arındırılmış özeti."""
    text = squash(" ".join(question["kok"])) + "|" + "|".join(squash(o) for o in question["siklar"]) + "|" + question["cevap"]
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def is_general_knowledge(question: dict) -> bool:
    """Genel kültür / genel yetenek sorusu (Türkçe, matematik, tarih, anayasa): notlarda dayanağı aranmaz."""
    text = lower_tr(" ".join(question["kok"] + question["siklar"]))
    return bool(GENERAL_RE.search(lower_tr(" ".join(question["kok"])))) and not CUSTOMS_RE.search(text)


class ReviewedBasis:
    """Okunarak seçilmiş dayanaklar (dayanak-secimleri.json): {soru anahtarı: {id, ad, metin}}.

    Otomatik eşleştiricinin eşiğini gevşetmek yerine, dayanaksız kalan soruların adayları tek tek okunmuş ve doğru
    şıkkı doğrulayan (olumsuz soruda sınanan) hüküm seçilmiştir. Seçim yalnızca metni güncel notlarda aynen
    bulunuyorsa uygulanır: madde kimliğinde maddenin fıkraları (ardışık fıkralar boşlukla birleştirilir), "konu-<n>"
    kimliğinde o konunun pasajları (ardışık pasajlar boşlukla birleştirilebilir) aranır.

    Notlarda bulunmayan hüküm resmî metinden seçilebilir ({..., kaynak: 'resmi', url}): metin, resmi-metinler/ altındaki
    önbellek dosyalarından ilk satırında aynı url bulunanın tek bir maddesinde (maddeler boş satırla ayrılır) aynen
    aranır. id boş ya da uygulamadaki madde kimliğidir.
    """

    def __init__(self, matcher: "PassageMatcher") -> None:
        raw = json.loads(REVIEWED_FILE.read_text(encoding="utf-8")) if REVIEWED_FILE.exists() else {}
        self.picks = {key: value for key, value in raw.items() if not key.startswith("_")}
        self.official: dict[str, list[str]] = {}  # resmî metin adresi -> önbellekteki maddeler
        for path in sorted(OFFICIAL_DIR.glob("*.txt")):
            head, _, body = path.read_text(encoding="utf-8").partition("\n")
            self.official[re.search(r"https://\S+", head).group(0)] = [flat(b) for b in body.split("\n\n") if b.strip()]
        self.articles: dict[str, str] = {}
        self.passages: dict[str, list[str]] = {}
        self.topic_of: dict[str, int] = {}
        loaded = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(DATA_DIR.glob("konu-*.json"))]
        for path in sorted(DATA_DIR.glob("ek-*.json")):
            loaded += json.loads(path.read_text(encoding="utf-8"))
        for topic in loaded:
            for block in topic["blocks"]:
                if block["t"] == "a":
                    self.articles[block["id"]] = flat(" ".join(block["p"]))
                    self.topic_of[block["id"]] = topic["id"]
                elif block["t"] == "p" and topic["id"] < 1000:
                    self.passages.setdefault(f"konu-{topic['id']}", []).append(flat(block["x"]))
        for unit in matcher.units:
            if unit.anchor.startswith("konu-"):
                self.passages.setdefault(unit.anchor, []).append(flat(unit.text))
        self.used: set[str] = set()
        self.stale: set[str] = set()
        self.listed: list[tuple[str, dict]] = []  # (madde kimliği, soru): madde sayfasındaki listeye eklenecekler

    def get(self, question: dict) -> tuple[dict | None, int | None]:
        """(dayanak, pasajın konusu); seçim yoksa ya da metni artık notlarda bulunmuyorsa (None, None)."""
        key = question_key(question)
        pick = self.picks.get(key)
        if not pick or key in self.stale:
            return None, None
        ident = pick["id"]
        official = pick.get("kaynak") == "resmi"
        if key not in self.used:
            core = flat(pick["metin"].removeprefix("… ").removesuffix(" …"))
            units = self.passages.get(ident, [])
            if official:
                found = any(core in text for text in self.official.get(pick.get("url", ""), ())) and (not ident or ident in self.articles)
            else:
                found = core in self.articles.get(ident, "") or any(core in text for text in units) or core in " ".join(units)
            if not found:
                self.stale.add(key)
                return None, None
            self.used.add(key)
        topic = int(ident[5:]) if ident.startswith("konu-") else self.topic_of.get(ident)
        ground = {"id": ident, "ad": pick["ad"], "metin": pick["metin"], "kaynak": "resmi" if official else "okuma"}
        return (ground | {"url": pick["url"]} if official else ground), topic


UNKNOWN_EXAM: list[dict] = []
SUPPLEMENT_FILE = Path(__file__).resolve().parent / "ek-sinavlar.json"


def content_key(question: dict) -> str:
    """Sorunun içeriği (şıklar + kökteki öncüller), kökün soru cümlesinden bağımsız: aynı sorunun farklı
    yazılmış sürümlerini tanımak için. Ayırt edici değilse (yalnızca "I ve II" gibi şıklar) boş döner."""
    extra = [p for p in question["kok"] if not p.rstrip().endswith("?")]
    body = sorted(squash(re.sub(r"^[A-E]\)", "", o)) for o in question["siklar"]) + sorted(squash(re.sub(r"^[IVX]+\.", "", p)) for p in extra)
    key = "|".join(body)
    return key if question["siklar"] and (extra or len(key) >= 60) else ""


def merge_supplement(exams: dict[str, dict[int, dict]]) -> tuple[int, list[dict], set[tuple[str, str]]]:
    """Sınav PDF'lerinden çıkarılan tam kitapçıkları (ek-sinavlar.json) esas alır.

    Kitapçığın numarası ve metni PDF'ten gelir; aynı sorunun madde bağlantısı, kök metni
    eşleşen mevcut sorudan taşınır. PDF kitapçığında bulunmayan mevcut sorular ayrı tutulur;
    ancak böyle bir soru başka bir PDF kitapçığında aynen bulunuyorsa (kaynakta sınavı yanlış
    etiketlenmiş) ayrı tutulmaz, madde bağlantısı asıl soruya taşınır.

    Dönen değer: (yalnızca PDF'te bulunan soru sayısı, bu sorular, yanlış etiketli olduğu için
    çıkarılan soruların (sınav etiketi, kök anahtarı) kümesi).
    """
    if not SUPPLEMENT_FILE.exists():
        return 0, [], set()
    supplement = json.loads(SUPPLEMENT_FILE.read_text(encoding="utf-8"))
    twins: dict[str, tuple[str, int]] = {}
    for exam in supplement:
        for question in exam["sorular"]:
            key = content_key(question)
            if key:
                twins.setdefault(key, (exam["sinav"], question["no"]))
    pdf_only: list[dict] = []
    added = 0
    moved: list[tuple[tuple[str, int], dict]] = []
    for exam in supplement:
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
            if match is None:
                pdf_only.append(items[question["no"]])
                added += 1
        exams[exam["sinav"]] = items
        outside = []
        for stray in by_stem.values():
            twin = twins.get(content_key(stray))
            if twin:
                moved.append((twin, stray))
            else:
                outside.append(stray)
        exams.pop(exam["sinav"] + " (kitapçık dışı)", None)
        if outside:
            exams[exam["sinav"] + " (kitapçık dışı)"] = dict(enumerate(outside, 1))
    dropped: set[tuple[str, str]] = set()
    for (name, number), stray in moved:
        target = exams[name][number]
        for field in ("madde", "dayanak"):
            if stray.get(field) and not target.get(field):
                target[field] = stray[field]
                if field == "madde" and not any(target is q for q in pdf_only):
                    pdf_only.append(target)  # madde sayfasında yanlış etiketli sürümün yerine asıl soru listelenir
        if target.get("madde"):
            target.pop("ilgili", None)
        dropped.add((stray["sinav"], squash(" ".join(stray["kok"]))[:60]))
        print(f"yanlış etiketli soru çıkarıldı: {stray['sinav']} = {target['sinav']} (cevap: eski {stray['cevap']}, kitapçık {target['cevap']})")
    return added, pdf_only, dropped


def link_pdf_only(questions: list[dict], matcher: ArticleMatcher, labels: dict[str, str]) -> tuple[int, int]:
    """Yalnızca PDF kitapçığında bulunan (kaynak derlemede maddesi gösterilmeyen) soruları Kanun/Yönetmelik maddesine bağlar.

    * Kök maddeyi açıkça anıyorsa ("Gümrük Kanunu'nun 235 inci maddesi") soru o maddeye "madde" olarak bağlanır.
    * Anmıyorsa ve kök Gümrük Kanununu/Yönetmeliğini adıyla anıyorsa, ArticleMatcher.best_law güvenli bir
      eşleşme bulduğunda "ilgili" (otomatik eşleşme) olarak bağlanır. Diğer sorulara dokunulmaz.
    Dayanak hüküm, bağlanan maddenin soruyla en çok örtüşen fıkrasıdır; bulunamazsa dayanak yazılmaz.
    """
    cited = strong = 0
    for question in questions:
        if question.get("madde") or question.get("ilgili") or not question["siklar"]:
            continue
        stem = lower_tr(" ".join(question["kok"]))
        found = []
        for law, number, letter in CITED_ARTICLE_RE.findall(stem):
            ident = ("gk-" if law == "kanunu" else "gy-") + number + (f"-{letter.upper()}" if letter else "")
            if ident in labels and ident not in found:
                found.append(ident)
        if found:
            question["madde"] = [{"id": ident, "ad": labels[ident]} for ident in found]
            cited += 1
        else:
            related = matcher.best_law(question)
            if not related or related["id"] not in labels:
                continue
            question["ilgili"] = related
            found = [related["id"]]
            strong += 1
        ground = matcher.basis(question, found)
        if ground and "dayanak" not in question:
            question["dayanak"] = ground
    return cited, strong


def list_on_articles(questions: list[dict], by_article: dict[str, list[dict]], labels: dict[str, str]) -> int:
    """Maddeye bağlanan PDF sorularını o maddenin "çıkmış sınav soruları" listesine ekler (zaten varsa eklemez)."""
    listed = 0
    for question in questions:
        targets = [link["id"] for link in question.get("madde", [])]
        related = question.get("ilgili")
        if not targets and related and related["id"].startswith(("gk-", "gy-")):
            targets = [related["id"]]
        for ident in targets:
            items = by_article.setdefault(ident, []) if ident in labels else None
            if items is None or any(q["sinav"] == question["sinav"] for q in items):
                continue
            items.append({k: v for k, v in question.items() if k not in ("madde", "rol")})
            listed += 1
    return listed


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


SUBJECT_FILE = Path(__file__).resolve().parent / "soru-konulari.json"
SUBJECT_FOLDER_BASE = 900  # mevzuat derleyicisinin klasör numaralarıyla çakışmaz


TARIFF_PDF_FILE = Path(__file__).resolve().parent / "tarife-cikmis-sorular.json"
TARIFF_ALL_TITLE = "Tarife çıkmış sorular — tümü"
RAW_PDF_TOPIC_RE = re.compile(r"geçmiş yıl tarife soruları \(s\. ")
CARD_TOPIC_RE = re.compile(r"^Çıkmış sorular — (?:Fasıl (\d{2})\b|Genel Yorum Kuralları)")
PICTURE_NOTE = "(Bu sorunun görseli kaynak belgededir; burada gösterilemiyor.)"
ROLE_ORDER = ("dogru", "secenek")


def load_tariff_rule():
    """Fasıl kuralı ve tekrar ayıklama (tarife-fasil-kurali.py)."""
    spec = importlib.util.spec_from_file_location("tarife_fasil_kurali", Path(__file__).resolve().parent / "tarife-fasil-kurali.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def title_tr(text: str) -> str:
    """'2011 MESLEKİ YETERLİLİK SINAVI' -> '2011 Mesleki Yeterlilik Sınavı'"""
    return " ".join(w[:1] + lower_tr(w[1:]) for w in text.split())


def pdf_label(question: dict) -> str:
    exam = title_tr(question["sinav"]) if question["sinav"] else "Tarife geçmiş yıl soruları (sınavı belirtilmemiş)"
    return f"{exam} · derleme sorusu {question['no']}"


def load_pdf_questions() -> list[dict]:
    """Kullanıcının yüklediği tarife soru derlemesi (extract-tarife-pdf.py çıktısı)."""
    if not TARIFF_PDF_FILE.exists():
        return []
    return json.loads(TARIFF_PDF_FILE.read_text(encoding="utf-8"))


def tariff_entries(matcher: "PassageMatcher", anchors: list[dict]) -> list[dict]:
    """PDF derlemesindeki sorular ile Tarife Kitabının fasıl fasıl "çıkmış soru örneği" kartları."""
    entries = []
    for item in load_pdf_questions():
        question = {"id": f"tarife-pdf-{item['no']}", "sinav": pdf_label(item), "kok": item["kok"], "siklar": item["siklar"], "cevap": item["cevap"]}
        entries.append({"soru": question, "kaynak": "pdf", "etiket": item["sinav"], "ev": set(), "gorsel": bool(item.get("gorsel"))})
    for path in sorted(DATA_DIR.glob("ek-*.json")):
        for topic in json.loads(path.read_text(encoding="utf-8")):
            info = matcher.topic_info.get(topic["id"])
            card = CARD_TOPIC_RE.match(info[3]) if info and info[0] == "tarife" else None
            if not card:
                continue
            name = f"Fasıl {card.group(1)}" if card.group(1) else "Genel Yorum Kuralları"
            for order, block in enumerate((b for b in topic["blocks"] if b["t"] == "q"), 1):
                question = {"id": f"tarife-kitap-{topic['id']}-{order}", "sinav": f"Tarife Kitabı · {name} · çıkmış soru örneği {order}",
                            "kok": block["kok"], "siklar": block["siklar"], "cevap": block["cevap"]}
                entries.append({"soru": question, "kaynak": "kart", "etiket": "", "ev": {card.group(1) or "gyk"}, "cozum": block.get("cozum") or []})
    for entry in entries:
        ground, _ = matcher.link(entry["soru"], True, anchors)
        if ground:
            entry["soru"]["dayanak"] = {k: ground[k] for k in ("id", "ad", "metin")}
    return entries


def distribute_tariff(matcher: "PassageMatcher", pool: list[dict], spare: dict[str, dict], anchors: list[dict], outside: list[str], year) -> tuple[dict[str, list[dict]], list[dict]]:
    """Tarife sorularını (kitapçık + PDF derlemesi + kitap kartları) tekrarsız hâle getirip fasıllara dağıtır.

    Dönen değer: ({fasıl ya da "gyk": [soru (rol: dogru | secenek), ...]}, fasla bağlı olmayan genel sorular).
    """
    rule = load_tariff_rule()
    extra = tariff_entries(matcher, anchors)
    taken = {id(e["soru"]) for e in pool}
    for entry in extra:  # anahtar ifade taşımayan, ama derlemede/kitapta aynen bulunan kitapçık soruları
        twin = spare.get(rule.squash(" ".join(entry["soru"]["kok"] + entry["soru"]["siklar"])))
        if twin and id(twin["soru"]) not in taken:
            taken.add(id(twin["soru"]))
            pool.append(twin)
    pool = [e for e in pool if not MONEY_RE.search(lower_tr(" ".join(e["soru"]["kok"])))]
    merged, stats = rule.dedupe(pool + extra)
    lists: dict[str, dict[str, list[dict]]] = {key: {role: [] for role in ROLE_ORDER} for key in matcher.chapter_home}
    general: list[dict] = []
    conflicts = []
    for item in merged:
        question = dict(item["soru"])
        if item.get("gorsel") and item["kaynak"] == "pdf":
            question["kok"] = question["kok"] + [PICTURE_NOTE]
        if item.get("cozum"):
            question["cozum"] = item["cozum"]
        if item.get("celiski"):
            conflicts.append(f"{question['sinav'][:70]}: " + "; ".join(f"{m['kaynak']}={next((o for o in m['soru']['siklar'] if o.startswith(m['soru']['cevap'] + ')')), m['soru']['cevap'])[:40]}" for m in item["uyeler"]))
        right, other = rule.roles(question)
        right |= item["ev"]  # kitabın soruyu örnek verdiği fasıl
        placed = False
        for role, keys in (("dogru", right), ("secenek", other - right)):
            for key in sorted(keys & set(lists)):
                lists[key][role].append({**question, "rol": role})
                placed = True
        # Yalnızca kitapçıkta bulunan soru, maddeye bağlıysa ya da başka bir mevzuatı adıyla anıyorsa genel tarife sorusu sayılmaz.
        stem = lower_tr(" ".join(question["kok"]))
        foreign = item["kaynaklar"] == ["kitapcik"] and (question.get("madde") or any(re.search(p, stem) for p in outside))
        if not placed and not foreign:
            general.append(question)
    order = lambda q: -year(q["sinav"])  # noqa: E731 — yeni sınavlar önce; yılı olmayanlar sonda
    result = {key: sorted(groups["dogru"], key=order) + sorted(groups["secenek"], key=order) for key, groups in lists.items()}
    by_source = {name: sum(1 for e in pool + extra if e["kaynak"] == name) for name in ("kitapcik", "pdf", "kart")}
    kept = {name: sum(1 for m in merged if m["kaynak"] == name) for name in by_source}
    print(f"tarife soruları: kitapçık {by_source['kitapcik']}, PDF derlemesi {by_source['pdf']}, kitap kartı {by_source['kart']}; "
          f"tekrarsız {stats['tekil']} (tutulan sürüm: kitapçık {kept['kitapcik']}, PDF {kept['pdf']}, kart {kept['kart']}); farklı cevap veren kaynak: {stats['celiski']}")
    for line in conflicts:
        print("  cevap çelişkisi (kitapçık sürümü tutuldu):", line)
    multi = sum(1 for m in merged if len(m["kaynaklar"]) > 1)
    overlap: dict[str, int] = {}
    for m in merged:
        overlap["+".join(m["kaynaklar"])] = overlap.get("+".join(m["kaynaklar"]), 0) + 1
    print("  kaynak bileşimine göre tekil soru: " + ", ".join(f"{k} {v}" for k, v in sorted(overlap.items())))
    print(f"  birden fazla kaynakta bulunan soru: {multi}; fasla bağlı olmayan (genel) soru: {len(general)}")
    empty = sorted(k for k, v in result.items() if not v)
    print(f"  çıkmış sorusu olmayan fasıl ({len(empty)}): {', '.join(empty) or '-'}")
    return result, sorted(general, key=order)


def subject_blocks(questions: list[dict]) -> list[dict]:
    """Soruları okuyucudaki çözümlü soru bloğuna çevirir (cevap düğmeyle açılır)."""
    return [{"t": "q", "no": q["sinav"], "kok": q["kok"], "siklar": q["siklar"], "cevap": q["cevap"], "cozum": []} for q in questions]


def subject_of(question: dict, folder: dict) -> str | None:
    """Sorunun (kök + şıklar) soru-konulari.json içindeki ilk eşleşen konu başlığı."""
    text = lower_tr(" ".join(question["kok"] + question["siklar"]))
    return next((s["baslik"] for s in folder["konular"] if any(w in text for w in s["ifadeler"])), None)


def link_to_topics(exam_list: list[dict], other: list[dict], index: dict, config: dict) -> tuple[dict[str, list[dict]], ReviewedBasis]:
    """Madde dayanağı olmayan sorulara konu notlarından dayanak pasajı arar; soruları konularına dağıtır.

    Çıktı:
      * soruya "dayanak" eklenir (id: "konu-<konu>" ya da konu içindeki maddenin kimliği, metin: pasajın kendisi),
      * sorular-konu.json: {konu kimliği: [soru, ...]}; aynı faslın diğer klasörlerdeki konuları, soruların
        tutulduğu konunun kimliğini (metin olarak) taşır,
      * dönen değer: sekmeye göre hiçbir konuya bağlanamayan sorular (tek bir "eşleştirilemeyenler" konusu için)
        ve okunarak seçilmiş dayanaklar (madde sayfalarına eklenecek sorular için).

    Otomatik eşleşmeden sonra dayanağı olmayan soruya okunarak seçilmiş dayanak (ReviewedBasis) uygulanır; pasajı
    bir konu notunda (kimliği >= 1000) olan soru o konunun listesine girer ve "eşleştirilemeyenler"den çıkar.
    Tarife sorularında fasıl dağıtımı kuralla yapılmaya devam eder; yalnızca kuralın hiçbir fasla bağlayamadığı
    (genel) soru, dayanağı bir fasıl notundaysa o faslın "dogru" listesine alınır.
    """
    matcher = PassageMatcher(index)
    reviewed = ReviewedBasis(matcher)
    read_topic: dict[str, int] = {}  # soru anahtarı -> okunarak seçilen pasajın konusu
    folders = {f["sekme"]: f for f in config["klasorler"]}
    anchors = config.get("kaynak_capalari", [])
    article_topic = {a["id"]: t["id"] for g in index["groups"] for f in g["folders"] for t in f["topics"] for a in t["articles"]}
    by_topic: dict[int, list[dict]] = {}
    seen: set[tuple[int, str]] = set()
    leftovers: dict[str, list[dict]] = {tab: [] for tab in folders}
    stats = {tab: {"soru": 0, "dayanak": 0, "onceki": 0, "konu": 0} for tab in folders}
    counts = {"yeni": 0, "değişen": 0, "silinen": 0, "okuma": 0, "resmi": 0}
    home_ids = set(matcher.chapter_home.values())
    pool: list[dict] = []  # tarife soruları: fasıl sayfaları kuralla doldurulur (distribute_tariff)
    spare: dict[str, dict] = {}

    def process(question: dict, collect: bool) -> None:
        if not question["siklar"]:
            return
        tabs = [tab for tab, folder in folders.items() if subject_of(question, folder)]
        topic = None
        had = "dayanak" in question
        # "ilgili": önceki adımın madde düzeyindeki otomatik eşleşmesi; pasaj eşleşmesi daha sıkı ölçütlüdür.
        auto = question.get("ilgili") if not question.get("madde") else None
        if not question.get("madde"):
            ground, topic = matcher.link(question, "tarife" in tabs, anchors)
            if ground and (not auto or auto.get("puan", 0) < 0.6):
                question["dayanak"] = {k: ground[k] for k in ("id", "ad", "metin")}
                question.pop("ilgili", None)
                counts["yeni" if not had else "değişen"] += 1
            elif auto:
                home = article_topic.get(auto["id"])
                place = " · ".join(matcher.topic_info[home][2:]) if home else ""
                if matcher.conflicts(question, anchors, f"{place} · {auto['ad']}"):
                    del question["ilgili"]  # soru başka bir mevzuatı adıyla anıyor: eşleşme yanlış
                    question.pop("dayanak", None)
                    counts["silinen"] += 1
                elif not topic and auto.get("puan", 0) >= 0.5:
                    topic = home
        if "dayanak" not in question:  # otomatik eşleşme yok: okunarak seçilmiş dayanak
            ground, home = reviewed.get(question)
            if ground:
                question["dayanak"] = ground
                question.pop("ilgili", None)
                counts[ground["kaynak"]] += 1
                reviewed.listed.append((ground["id"], question))
                if home and home >= 1000:
                    read_topic[question_key(question)] = home
                    topic = topic or matcher.mirrors.get(home, home)
        if not collect:
            return
        entry = {"soru": question, "kaynak": "kitapcik", "etiket": question["sinav"] if " · " in question["sinav"] else "", "ev": set()}
        if "tarife" in tabs:
            pool.append(entry)
        else:
            spare.setdefault(squash(" ".join(question["kok"] + question["siklar"])), entry)
        if topic and topic not in home_ids:
            group = matcher.topic_info[topic][0]
            tabs = sorted(set(tabs) | ({group} if group in folders else set()))
            key = (topic, question["sinav"] if " · " in question["sinav"] else squash(" ".join(question["kok"]))[:80])
            if key not in seen:
                seen.add(key)
                by_topic.setdefault(topic, []).append(question)
        for tab in tabs:
            stats[tab]["soru"] += 1
            stats[tab]["dayanak"] += "dayanak" in question
            stats[tab]["onceki"] += had
            stats[tab]["konu"] += bool(topic)
            if not topic and "dayanak" not in question and not question.get("madde"):
                leftovers[tab].append(question)

    for exam in sorted(exam_list, key=lambda e: -e.get("yil", 0)):
        for question in exam["sorular"]:
            process(question, True)
    for group in other:
        for question in group["sorular"]:
            process(question, False)

    def year(name: str) -> int:
        found = re.findall(r"(?:19|20)\d\d", name)
        return int(found[-1]) if found else 0

    chapters, leftovers["tarife"] = distribute_tariff(matcher, pool, spare, anchors, [a["soru"] for a in anchors] + folders["tarife"].get("genel_disi", []), year)
    chapter_of = {topic: key for key, topics in matcher.chapter_topics.items() for topic in topics}
    general, moved = [], 0
    for question in leftovers["tarife"]:  # okunarak dayanağı bulunan genel tarife soruları yerine taşınır
        home = read_topic.get(question_key(question)) if (question.get("dayanak") or {}).get("kaynak") == "okuma" else None
        if home is None:
            general.append(question)
            continue
        moved += 1
        if chapter_of.get(home) in chapters:  # dayanak fasıl notunda: doğru cevabı o fasılda olan sorular arasına
            items = chapters[chapter_of[home]] + [{**question, "rol": "dogru"}]
            chapters[chapter_of[home]] = [q for role in ROLE_ORDER for q in sorted((q for q in items if q["rol"] == role), key=lambda q: -year(q["sinav"]))]
    leftovers["tarife"] = general
    for key, items in chapters.items():  # boş liste: "bu fasıl için çıkmış soru bulunamadı" satırı gösterilir
        by_topic[matcher.chapter_home[key]] = items
    payload: dict[str, list[dict] | str] = {str(topic): items for topic, items in sorted(by_topic.items())}
    for mirror, home in sorted(matcher.mirrors.items()):
        if home in by_topic:
            payload[str(mirror)] = str(home)
    print("fasıl tablosu (doğru/şık): " + "  ".join(
        f"{key}:{sum(q['rol'] == 'dogru' for q in items)}/{sum(q['rol'] == 'secenek' for q in items)}" for key, items in sorted(chapters.items())))
    (DATA_DIR / "sorular-konu.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    print(f"konu notlarından dayanak: yeni {counts['yeni']}, madde eşleşmesinin yerine geçen {counts['değişen']}, çelişkili olduğu için silinen eski eşleşme {counts['silinen']}")
    print(f"okunarak seçilmiş dayanak (dayanak-secimleri.json): {len(reviewed.picks)} seçim; uygulanan {len(reviewed.used)} (soru kaydı: {counts['okuma']}, resmî metinden: {counts['resmi']}); "
          f"metni artık notlarda bulunmayan (uygulanmadı): {len(reviewed.stale)}; konu sayfasına bağlanan: {len(read_topic)}; genel tarife listesinden taşınan: {moved}")
    print(f"soru bölümü olan konu: {len(by_topic)} (+{len(payload) - len(by_topic)} eş konu); konulara dağıtılan soru: {sum(len(v) for v in by_topic.values())}")
    for tab, row in stats.items():
        print(f"  {tab}: ilgili soru {row['soru']}; dayanaklı {row['dayanak']} (önceden {row['onceki']}); konusuna bağlanan {row['konu']}; eşleştirilemeyen {len(leftovers[tab])}")
    for topic, items in sorted(by_topic.items(), key=lambda pair: -len(pair[1]))[:10]:
        print(f"  {len(items):4} soru | {matcher.topic_info[topic][2][:40]} · {matcher.topic_info[topic][3][:60]}")
    return leftovers, reviewed


def write_leftover_folders(leftovers: dict[str, list[dict]], config: dict) -> None:
    """Hiçbir konuya bağlanamayan çıkmış soruları sekme başına tek bir konuda toplar (ek-90x-1.json).

    Soruların çoğu artık kendi konusunun sayfasında gösterilir (sorular-konu.json); burada yalnızca
    anahtar ifadeyle o sekmeye ait olduğu anlaşılan, fakat notlarda yeri bulunamayan sorular kalır.
    Mevzuat derleyicisi (build-mevzuat-data.py) her çalıştığında bu adım yinelenmelidir.
    """
    index_path = DATA_DIR / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    for stale in DATA_DIR.glob(f"ek-{SUBJECT_FOLDER_BASE // 100}[0-9][0-9]-*.json"):
        stale.unlink()
    for group in index["groups"]:
        group["folders"] = [f for f in group["folders"] if not SUBJECT_FOLDER_BASE <= f["id"] < SUBJECT_FOLDER_BASE + 100]
    for order, folder in enumerate(config["klasorler"], 1):
        questions = leftovers.get(folder["sekme"], [])
        if not questions:
            continue
        folder_id = SUBJECT_FOLDER_BASE + order
        note = {"t": "p", "x": folder.get("not") or "Bu sorular anahtar ifadelere göre bu sekmeyle ilgili görünmektedir; ancak notlarda dayanağı ve konusu güvenilir biçimde bulunamamıştır. Konusu bulunan sorular kendi konu sayfalarının sonunda yer alır."}
        topic = {"id": folder_id * 1000 + 1, "title": f"{folder['konu_basligi']} ({len(questions)} soru)", "blocks": [note] + subject_blocks(questions)}
        file = f"ek-{folder_id}-1.json"
        (DATA_DIR / file).write_text(json.dumps([topic], ensure_ascii=False), encoding="utf-8")
        group = next(g for g in index["groups"] if g["id"] == folder["sekme"])
        group["folders"].append({"id": folder_id, "title": folder["baslik"], "topics": [{"id": topic["id"], "title": topic["title"], "file": file, "articles": []}]})
        print(f"eşleştirilemeyenler klasörü: {folder['baslik'][:70]} | {len(questions)} soru")
    index_path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")


def write_tariff_overview() -> None:
    """PDF derlemesinin bütün sorularını özgün sırasıyla tek konuda verir; aynı belgenin ham sayfa dökümlerini kaldırır.

    Ham "geçmiş yıl tarife soruları (s. …)" konuları (iki sütunu karışmış sayfa dökümü) yalnızca içerikleri PDF
    derlemesiyle aynı çıkarsa silinir: derlemedeki soru köklerinin ilk sözcükleri dökümde aranır.
    Betik yeniden çalıştırıldığında mevcut "tümü" konusu yerinde yenilenir.
    """
    questions = load_pdf_questions()
    if not questions:
        return
    index_path = DATA_DIR / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    group = next(g for g in index["groups"] if g["id"] == "tarife")
    located = [(f, t) for f in group["folders"] for t in f["topics"] if RAW_PDF_TOPIC_RE.search(t["title"]) or t["title"].startswith(TARIFF_ALL_TITLE)]
    raw = [(f, t) for f, t in located if RAW_PDF_TOPIC_RE.search(t["title"])]
    bundles = {name: json.loads((DATA_DIR / name).read_text(encoding="utf-8")) for name in {t["file"] for _, t in located}}
    if raw:
        ids = {t["id"] for _, t in raw}
        dump = squash(" ".join(b.get("x", "") for name in bundles for topic in bundles[name] if topic["id"] in ids for b in topic["blocks"]))
        sample = questions[::3]
        hits = sum(squash(" ".join(" ".join(q["kok"]).split()[:5])) in dump for q in sample)
        print(f"ham sayfa dökümü ile PDF derlemesi karşılaştırması: {len(sample)} örnek kökten {hits} tanesi dökümde bulundu")
        if hits < 0.8 * len(sample):
            print("  ham döküm farklı bir belge görünüyor: konular yerinde bırakıldı")
            raw = []
            located = [(f, t) for f, t in located if not RAW_PDF_TOPIC_RE.search(t["title"])]
    if located:
        folder, anchor = located[0]
    else:  # ham döküm yok: kitabın fasıl fasıl çıkmış soru klasörüne eklenir
        folder = next((f for f in group["folders"] if any(CARD_TOPIC_RE.match(t["title"]) for t in f["topics"])), None)
        if folder is None:
            return
        anchor = {"id": max(t["id"] for t in folder["topics"]) + 1, "file": folder["topics"][-1]["file"]}
        bundles[anchor["file"]] = json.loads((DATA_DIR / anchor["file"]).read_text(encoding="utf-8"))
    drop = {t["id"] for _, t in located}
    title = f"{TARIFF_ALL_TITLE} ({len(questions)} soru)"
    note = ("Yüklediğiniz “Tarife ile ilgili geçmiş yıl sınav soruları” derlemesindeki bütün sorular, belgedeki sırasıyla. "
            "Cevaplar belgenin sonundaki cevap anahtarından alınmıştır. Aynı sorular, ilgili faslın sayfasının sonunda da yer alır.")
    blocks = [{"t": "p", "x": note}]
    for q in questions:
        stem = q["kok"] + ([PICTURE_NOTE] if q.get("gorsel") else [])
        blocks.append({"t": "q", "no": pdf_label(q), "kok": stem, "siklar": q["siklar"], "cevap": q["cevap"], "cozum": []})
    for name, topics in bundles.items():
        kept = [t for t in topics if t["id"] not in drop]
        if name == anchor["file"]:
            kept.append({"id": anchor["id"], "title": title, "blocks": blocks})
        (DATA_DIR / name).write_text(json.dumps(kept, ensure_ascii=False), encoding="utf-8")
    entry = {"id": anchor["id"], "title": title, "file": anchor["file"], "articles": []}
    for other in group["folders"]:
        position = next((i for i, t in enumerate(other["topics"]) if t["id"] in drop), len(other["topics"]))
        other["topics"] = [t for t in other["topics"] if t["id"] not in drop]
        if other is folder:
            other["topics"].insert(min(position, len(other["topics"])), entry)
    index_path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"tarife derlemesi konusu: {title}; kaldırılan ham sayfa dökümü konusu: {len(raw)}")


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

    added, pdf_only, dropped = merge_supplement(exams)
    for key in list(by_article):  # yanlış etiketli sürüm madde sayfasında da gösterilmez (asıl soru orada zaten var)
        by_article[key] = [q for q in by_article[key] if (q["sinav"], squash(" ".join(q["kok"]))[:60]) not in dropped]
    cited, strong = link_pdf_only(pdf_only, matcher, labels)
    exam_list = build_booklets(exams, year)
    print(f"ek kaynaktan (PDF) tamamlanan soru: {added}; kökü maddeyi açıkça anan: {cited}; güvenli otomatik madde eşleşmesi: {strong}")
    other = [{"sinav": name, "sorular": items} for name, items in groups.items()]
    leftovers: dict[str, list[dict]] = {}
    config = json.loads(SUBJECT_FILE.read_text(encoding="utf-8")) if SUBJECT_FILE.exists() else None
    read_listed = 0
    if config:
        leftovers, reviewed = link_to_topics(exam_list, other, json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8")), config)
        for ident, question in reviewed.listed:  # okunarak dayanağı bulunan soru, dayanak maddenin sayfasında da listelenir
            items = by_article.setdefault(ident, []) if ident in labels else None
            if items is not None and not any(q["sinav"] == question["sinav"] for q in items):
                items.append({k: v for k, v in question.items() if k not in ("madde", "rol")})
                read_listed += 1
    listed = list_on_articles(pdf_only, by_article, labels)
    by_article = {k: v for k, v in by_article.items() if v}
    general = 0
    for group in exam_list + other:
        for question in group["sorular"]:
            if not any(question.get(k) for k in ("dayanak", "madde", "ilgili", "dayanakYok")) and question["siklar"] and is_general_knowledge(question):
                question["dayanakYok"] = "genel"
                general += 1
    print(f"madde sayfalarına eklenen PDF sorusu: {listed}; okunarak seçilen dayanağıyla madde sayfasına eklenen soru: {read_listed}; "
          f"genel kültür / genel yetenek olarak işaretlenen dayanaksız soru kaydı: {general}")
    for file, payload in (("sorular-madde.json", by_article), ("sorular-diger.json", other), ("sorular-sinav.json", exam_list)):
        (DATA_DIR / file).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if config:
        write_leftover_folders(leftovers, config)
        write_tariff_overview()
    print(f"madde soruları: {total}; derlemede karşılığı olan: {attached}; karşılığı olmayan madde: {len(missing)}")
    print(f"diğer sorular: {sum(len(g['sorular']) for g in other)}; otomatik ilgili madde bulunan: {matched}")
    for exam in exam_list:
        gaps = exam.get("eksik", [])
        print(f"  {exam['sinav'][:60]:60} {len(exam['sorular'])}/{exam.get('toplam', '-')} eksik: {gaps if len(gaps) <= 12 else str(len(gaps)) + ' soru'}")
    if exam_files:
        verify([q for e in exam_list for q in e["sorular"]], exam_files)


if __name__ == "__main__":
    main()
