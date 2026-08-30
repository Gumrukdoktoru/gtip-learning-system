import { describe, expect, it } from 'vitest';

import { parseQuizDocument } from '../src/services/quiz-import.js';

describe('parseQuizDocument', () => {
  it('reads the plain numbered format', () => {
    const [question] = parseQuizDocument(`
1. Gümrük beyannamesi ne zaman tescil edilmiş sayılır?
A) Beyan sahibi imzaladığında
B) Gümrük idaresince kabul edildiğinde
C) Eşya muayene edildiğinde
D) Vergiler ödendiğinde
Cevap: B
Açıklama: Tescil, idarenin kabulüyle gerçekleşir.
Konu: Gümrük Kanunu
Zorluk: orta
`);

    expect(question).toMatchObject({
      question: 'Gümrük beyannamesi ne zaman tescil edilmiş sayılır?',
      options: [
        'Beyan sahibi imzaladığında',
        'Gümrük idaresince kabul edildiğinde',
        'Eşya muayene edildiğinde',
        'Vergiler ödendiğinde',
      ],
      correctOptionIndex: 1,
      explanation: 'Tescil, idarenin kabulüyle gerçekleşir.',
      topic: 'Gümrük Kanunu',
      difficulty: 'orta',
      errors: [],
    });
  });

  it('accepts the many ways an option can be written', () => {
    const [question] = parseQuizDocument(`
1) Soru metni burada yer alıyor ve yeterince uzun
(A) Birinci
B. İkinci
c- Üçüncü
- D) Dördüncü
Doğru cevap: c
`);

    expect(question?.options).toEqual([
      'Birinci',
      'İkinci',
      'Üçüncü',
      'Dördüncü',
    ]);
    expect(question?.correctOptionIndex).toBe(2);
  });

  it('accepts the many ways an answer can be labelled', () => {
    for (const label of [
      'Cevap: B',
      'CEVAP: b',
      'Doğru cevap: B',
      'Doğru Cevap : B',
      'Yanıt: B',
      'Doğru şık: B',
      'Answer: B',
    ]) {
      const [question] = parseQuizDocument(
        `1. Yeterince uzun bir soru metni\nA) Bir\nB) İki\n${label}\n`,
      );

      expect(question?.correctOptionIndex, label).toBe(1);
    }
  });

  it('falls back to a bolded option when there is no answer line', () => {
    const [question] = parseQuizDocument(`
1. Tarife kontenjanı ile kota arasındaki fark nedir?
A) İkisi de aynıdır
**B) Kota miktar kısıtıdır, kontenjan indirimli vergidir**
C) Kota yalnızca ihracatta uygulanır
`);

    expect(question?.correctOptionIndex).toBe(1);
    expect(question?.options[1]).toBe(
      'Kota miktar kısıtıdır, kontenjan indirimli vergidir',
    );
    expect(question?.errors).toEqual([]);
  });

  it('accepts a tick or (doğru) marker and strips it from the text', () => {
    const [tick] = parseQuizDocument(
      '1. Yeterince uzun bir soru metni\nA) Bir\nB) İki ✓\n',
    );

    expect(tick?.correctOptionIndex).toBe(1);
    expect(tick?.options[1]).toBe('İki');

    const [marked] = parseQuizDocument(
      '1. Yeterince uzun bir soru metni\nA) Bir (doğru)\nB) İki\n',
    );

    expect(marked?.correctOptionIndex).toBe(0);
    expect(marked?.options[0]).toBe('Bir');
  });

  it('carries a heading and standalone labels to the questions below', () => {
    const questions = parseQuizDocument(`
## Tarife
Zorluk: zor

1. Birinci soru metni yeterince uzundur
A) Bir
B) İki
Cevap: A

2. İkinci soru metni de yeterince uzundur
A) Bir
B) İki
Cevap: B
Konu: Rejimler
`);

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ topic: 'Tarife', difficulty: 'zor' });
    // A per-question label wins over the document default.
    expect(questions[1]).toMatchObject({
      topic: 'Rejimler',
      difficulty: 'zor',
    });
  });

  it('applies a heading that follows a finished question', () => {
    // The previous question is still open when the heading arrives; it must
    // still switch the topic for what comes after.
    const questions = parseQuizDocument(`
## Gümrük Kanunu

1. Birinci soru metni yeterince uzundur
A) Bir
B) İki
Cevap: A

## Tarife

2. İkinci soru metni yeterince uzundur
A) Bir
B) İki
Cevap: B
`);

    expect(questions.map((item) => item.topic)).toEqual([
      'Gümrük Kanunu',
      'Tarife',
    ]);
  });

  it('joins a question that runs over several lines', () => {
    const [question] = parseQuizDocument(`
1. Aşağıdakilerden hangisi antrepo rejimine tabi eşya için
doğru bir ifadedir?
A) Bir
B) İki
Cevap: A
`);

    expect(question?.question).toBe(
      'Aşağıdakilerden hangisi antrepo rejimine tabi eşya için doğru bir ifadedir?',
    );
  });

  it('keeps a multi-line explanation together', () => {
    const [question] = parseQuizDocument(`
1. Yeterince uzun bir soru metni burada
A) Bir
B) İki
Cevap: A
Açıklama: İlk satır.
İkinci satır da açıklamaya aittir.
`);

    expect(question?.explanation).toBe(
      'İlk satır. İkinci satır da açıklamaya aittir.',
    );
  });

  it('reports a question with no answer instead of dropping it', () => {
    const [question] = parseQuizDocument(
      '1. Yeterince uzun bir soru metni\nA) Bir\nB) İki\n',
    );

    expect(question?.correctOptionIndex).toBeNull();
    expect(question?.errors[0]).toContain('Doğru cevap bulunamadı');
  });

  it('reports an answer letter that has no option', () => {
    const [question] = parseQuizDocument(
      '1. Yeterince uzun bir soru metni\nA) Bir\nB) İki\nCevap: D\n',
    );

    expect(question?.errors[0]).toContain('böyle bir şık yok');
  });

  it('reports more than one highlighted option', () => {
    const [question] = parseQuizDocument(
      '1. Yeterince uzun bir soru metni\n**A) Bir**\n**B) İki**\n',
    );

    expect(question?.errors[0]).toContain('Birden fazla şık');
  });

  it('reports a question with a single option', () => {
    const [question] = parseQuizDocument(
      '1. Yeterince uzun bir soru metni\nA) Tek şık\nCevap: A\n',
    );

    expect(question?.errors).toContain('En az iki şık gerekli.');
  });

  it('records where each question started', () => {
    const questions = parseQuizDocument(
      '\n\n1. Birinci soru metni yeterince uzun\nA) Bir\nB) İki\nCevap: A\n\n2. İkinci soru metni yeterince uzun\nA) Bir\nB) İki\nCevap: B\n',
    );

    expect(questions.map((item) => item.lineNumber)).toEqual([3, 8]);
  });

  it('returns nothing for a file with no questions', () => {
    expect(parseQuizDocument('Sadece düz bir metin.\nBaşka bir satır.')).toEqual(
      [],
    );
  });

  it('handles Windows line endings and a byte order mark', () => {
    const questions = parseQuizDocument(
      '﻿1. Yeterince uzun bir soru metni\r\nA) Bir\r\nB) İki\r\nCevap: B\r\n',
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]?.correctOptionIndex).toBe(1);
  });

  it('does not mistake a sentence for an option', () => {
    const [question] = parseQuizDocument(`
1. Yeterince uzun bir soru metni burada duruyor
Bu satır bir şık değildir.
A) Bir
B) İki
Cevap: A
`);

    expect(question?.options).toEqual(['Bir', 'İki']);
    expect(question?.question).toContain('Bu satır bir şık değildir.');
  });
});
