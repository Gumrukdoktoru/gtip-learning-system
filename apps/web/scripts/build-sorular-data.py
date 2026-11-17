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
    ek-90x-1.json        sekme başına, hiçbir konuya bağlanamayan çıkmış sorular

Madde dayanağı olmayan sorular için dayanak, diğer not dosyalarının (ek-*.json) pasajlarında aranır
(PassageMatcher); eşiğin altında kalan soru dayanaksız bırakılır, metin üretilmez.
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


# --- Konu notlarında (ek-*.json) pasaj düzeyinde dayanak eşleştirme ---------------------------
ORDINAL = r"(?:\s*[.’'`]?\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü))?"
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


SUBJECT_FILE = Path(__file__).resolve().parent / "soru-konulari.json"
SUBJECT_FOLDER_BASE = 900  # mevzuat derleyicisinin klasör numaralarıyla çakışmaz


def subject_blocks(questions: list[dict]) -> list[dict]:
    """Soruları okuyucudaki çözümlü soru bloğuna çevirir (cevap düğmeyle açılır)."""
    return [{"t": "q", "no": q["sinav"], "kok": q["kok"], "siklar": q["siklar"], "cevap": q["cevap"], "cozum": []} for q in questions]


def subject_of(question: dict, folder: dict) -> str | None:
    """Sorunun (kök + şıklar) soru-konulari.json içindeki ilk eşleşen konu başlığı."""
    text = lower_tr(" ".join(question["kok"] + question["siklar"]))
    return next((s["baslik"] for s in folder["konular"] if any(w in text for w in s["ifadeler"])), None)


def link_to_topics(exam_list: list[dict], other: list[dict], index: dict, config: dict) -> dict[str, list[dict]]:
    """Madde dayanağı olmayan sorulara konu notlarından dayanak pasajı arar; soruları konularına dağıtır.

    Çıktı:
      * soruya "dayanak" eklenir (id: "konu-<konu>" ya da konu içindeki maddenin kimliği, metin: pasajın kendisi),
      * sorular-konu.json: {konu kimliği: [soru, ...]}; aynı faslın diğer klasörlerdeki konuları, soruların
        tutulduğu konunun kimliğini (metin olarak) taşır,
      * dönen değer: sekmeye göre hiçbir konuya bağlanamayan sorular (tek bir "eşleştirilemeyenler" konusu için).
    """
    matcher = PassageMatcher(index)
    folders = {f["sekme"]: f for f in config["klasorler"]}
    anchors = config.get("kaynak_capalari", [])
    article_topic = {a["id"]: t["id"] for g in index["groups"] for f in g["folders"] for t in f["topics"] for a in t["articles"]}
    by_topic: dict[int, list[dict]] = {}
    seen: set[tuple[int, str]] = set()
    leftovers: dict[str, list[dict]] = {tab: [] for tab in folders}
    stats = {tab: {"soru": 0, "dayanak": 0, "onceki": 0, "konu": 0} for tab in folders}
    counts = {"yeni": 0, "değişen": 0, "silinen": 0}

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
        if not collect:
            return
        if topic:
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

    payload: dict[str, list[dict] | str] = {str(topic): items for topic, items in sorted(by_topic.items())}
    for mirror, home in sorted(matcher.mirrors.items()):
        if home in by_topic:
            payload[str(mirror)] = str(home)
    (DATA_DIR / "sorular-konu.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    print(f"konu notlarından dayanak: yeni {counts['yeni']}, madde eşleşmesinin yerine geçen {counts['değişen']}, çelişkili olduğu için silinen eski eşleşme {counts['silinen']}")
    print(f"soru bölümü olan konu: {len(by_topic)} (+{len(payload) - len(by_topic)} eş konu); konulara dağıtılan soru: {sum(len(v) for v in by_topic.values())}")
    for tab, row in stats.items():
        print(f"  {tab}: ilgili soru {row['soru']}; dayanaklı {row['dayanak']} (önceden {row['onceki']}); konusuna bağlanan {row['konu']}; eşleştirilemeyen {len(leftovers[tab])}")
    for topic, items in sorted(by_topic.items(), key=lambda pair: -len(pair[1]))[:10]:
        print(f"  {len(items):4} soru | {matcher.topic_info[topic][2][:40]} · {matcher.topic_info[topic][3][:60]}")
    return leftovers


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
        note = {"t": "p", "x": "Bu sorular anahtar ifadelere göre bu sekmeyle ilgili görünmektedir; ancak notlarda dayanağı ve konusu güvenilir biçimde bulunamamıştır. Konusu bulunan sorular kendi konu sayfalarının sonunda yer alır."}
        topic = {"id": folder_id * 1000 + 1, "title": f"{folder['konu_basligi']} ({len(questions)} soru)", "blocks": [note] + subject_blocks(questions)}
        file = f"ek-{folder_id}-1.json"
        (DATA_DIR / file).write_text(json.dumps([topic], ensure_ascii=False), encoding="utf-8")
        group = next(g for g in index["groups"] if g["id"] == folder["sekme"])
        group["folders"].append({"id": folder_id, "title": folder["baslik"], "topics": [{"id": topic["id"], "title": topic["title"], "file": file, "articles": []}]})
        print(f"eşleştirilemeyenler klasörü: {folder['baslik'][:70]} | {len(questions)} soru")
    index_path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")


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
    leftovers: dict[str, list[dict]] = {}
    config = json.loads(SUBJECT_FILE.read_text(encoding="utf-8")) if SUBJECT_FILE.exists() else None
    if config:
        leftovers = link_to_topics(exam_list, other, json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8")), config)
    for file, payload in (("sorular-madde.json", by_article), ("sorular-diger.json", other), ("sorular-sinav.json", exam_list)):
        (DATA_DIR / file).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if config:
        write_leftover_folders(leftovers, config)
    print(f"madde soruları: {total}; derlemede karşılığı olan: {attached}; karşılığı olmayan madde: {len(missing)}")
    print(f"diğer sorular: {sum(len(g['sorular']) for g in other)}; otomatik ilgili madde bulunan: {matched}")
    for exam in exam_list:
        gaps = exam.get("eksik", [])
        print(f"  {exam['sinav'][:60]:60} {len(exam['sorular'])}/{exam.get('toplam', '-')} eksik: {gaps if len(gaps) <= 12 else str(len(gaps)) + ' soru'}")
    if exam_files:
        verify([q for e in exam_list for q in e["sorular"]], exam_files)


if __name__ == "__main__":
    main()
