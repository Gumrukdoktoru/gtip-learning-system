import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from './helpers/test-app.js';

const BASE = '/api/v1/quiz';

interface QuestionSeed {
  question?: string;
  options?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  topic?: string;
  difficulty?: 'kolay' | 'orta' | 'zor';
  isPublished?: boolean;
}

async function addQuestion(
  ctx: TestContext,
  seed: QuestionSeed = {},
): Promise<request.Response> {
  return request(ctx.app)
    .post(`${BASE}/questions`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({
      question:
        seed.question ?? 'Gümrük Kanunu’na göre beyanname ne zaman tescil edilir?',
      options: seed.options ?? ['A şıkkı', 'B şıkkı', 'C şıkkı', 'D şıkkı'],
      correctOptionIndex: seed.correctOptionIndex ?? 2,
      explanation: seed.explanation ?? 'Madde 60 uyarınca tescil edilir.',
      topic: seed.topic ?? 'Gümrük Kanunu',
      difficulty: seed.difficulty ?? 'orta',
      isPublished: seed.isPublished ?? true,
    });
}

describe('quiz question bank', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('creates a question with its answer and explanation', async () => {
    const response = await addQuestion(ctx);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      topic: 'Gümrük Kanunu',
      difficulty: 'orta',
      correctOptionIndex: 2,
      isPublished: true,
    });
    expect(response.body.data.options).toHaveLength(4);
  });

  it('rejects an answer index outside the options', async () => {
    const response = await addQuestion(ctx, {
      options: ['A', 'B'],
      correctOptionIndex: 4,
    });

    expect(response.status).toBe(422);
  });

  it('rejects too few options', async () => {
    const response = await addQuestion(ctx, { options: ['Tek şık'] });

    expect(response.status).toBe(422);
  });

  it('refuses a non-admin', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/questions`)
      .set('Authorization', `Bearer ${ctx.studentToken}`)
      .send({
        question: 'Öğrencinin eklemeye çalıştığı soru metni',
        options: ['A', 'B'],
        correctOptionIndex: 0,
        topic: 'Deneme',
        difficulty: 'kolay',
      });

    expect(response.status).toBe(403);
  });

  it('never exposes the bank to anonymous callers', async () => {
    await addQuestion(ctx);

    const response = await request(ctx.app).get(`${BASE}/questions`);

    expect(response.status).toBe(401);
  });

  it('lists, filters and searches for the admin', async () => {
    await addQuestion(ctx, { topic: 'Gümrük Kanunu', difficulty: 'orta' });
    await addQuestion(ctx, {
      question: 'Tarife kontenjanı nasıl kullanılır sorusu metni',
      topic: 'Tarife',
      difficulty: 'zor',
    });

    const all = await request(ctx.app)
      .get(`${BASE}/questions`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(all.body.data.pagination.total).toBe(2);

    const byTopic = await request(ctx.app)
      .get(`${BASE}/questions?topic=Tarife`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(byTopic.body.data.items).toHaveLength(1);

    const byDifficulty = await request(ctx.app)
      .get(`${BASE}/questions?difficulty=zor`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(byDifficulty.body.data.items).toHaveLength(1);

    const bySearch = await request(ctx.app)
      .get(`${BASE}/questions?search=KONTENJANI`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(bySearch.body.data.items).toHaveLength(1);
  });

  it('updates and deletes', async () => {
    const created = await addQuestion(ctx);
    const id = created.body.data.id;

    const updated = await request(ctx.app)
      .patch(`${BASE}/questions/${id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ isPublished: false, difficulty: 'zor' });

    expect(updated.body.data).toMatchObject({
      isPublished: false,
      difficulty: 'zor',
    });

    const removed = await request(ctx.app)
      .delete(`${BASE}/questions/${id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(removed.status).toBe(200);
  });

  it('refuses an edit that would strand the answer', async () => {
    const created = await addQuestion(ctx, { correctOptionIndex: 3 });

    const response = await request(ctx.app)
      .patch(`${BASE}/questions/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ options: ['Sadece iki', 'şık kaldı'] });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('şık listesinin dışında');
  });
});

describe('quiz availability', () => {
  it('reports published questions grouped by topic', async () => {
    const ctx = await createTestContext();

    await addQuestion(ctx, { topic: 'Gümrük Kanunu' });
    await addQuestion(ctx, { topic: 'Gümrük Kanunu' });
    await addQuestion(ctx, { topic: 'Tarife' });
    await addQuestion(ctx, { topic: 'Taslak', isPublished: false });

    const response = await request(ctx.app).get(`${BASE}/availability`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalQuestions).toBe(3);
    expect(response.body.data.topics).toEqual([
      { topic: 'Gümrük Kanunu', questionCount: 2 },
      { topic: 'Tarife', questionCount: 1 },
    ]);
  });
});

describe('taking a practice exam', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();

    for (let index = 0; index < 6; index += 1) {
      await addQuestion(ctx, {
        question: `Soru numarası ${index} için yeterince uzun metin`,
        correctOptionIndex: index % 4,
      });
    }
  });

  async function start(body: object = {}): Promise<request.Response> {
    return request(ctx.app).post(`${BASE}/sessions`).send(body);
  }

  it('starts without signing in and hides the answers', async () => {
    const response = await start({ questionCount: 3 });

    expect(response.status).toBe(201);
    expect(response.body.data.questions).toHaveLength(3);

    const [question] = response.body.data.questions;

    // The whole point: a student must not be able to read the answer out of
    // the network tab.
    expect(question).not.toHaveProperty('correctOptionIndex');
    expect(question).not.toHaveProperty('explanation');
    expect(question.options).toHaveLength(4);
  });

  it('caps the exam at the number of questions available', async () => {
    const response = await start({ questionCount: 50 });

    expect(response.body.data.questions).toHaveLength(6);
  });

  it('grades a submission and reveals the answers', async () => {
    const session = await start({ questionCount: 4 });
    const questions = session.body.data.questions;

    // Answer the first correctly by asking the admin bank for the answer.
    const bank = await request(ctx.app)
      .get(`${BASE}/questions?pageSize=100`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
    const answerById = new Map<string, number>(
      bank.body.data.items.map(
        (item: { id: string; correctOptionIndex: number }) => [
          item.id,
          item.correctOptionIndex,
        ],
      ),
    );

    const answers = questions.map(
      (question: { id: string }, index: number) => ({
        questionId: question.id,
        selectedIndex:
          index === 0
            ? answerById.get(question.id)!
            : index === 1
              ? null
              : (answerById.get(question.id)! + 1) % 4,
      }),
    );

    const result = await request(ctx.app)
      .post(`${BASE}/sessions/${session.body.data.sessionId}/submit`)
      .send({ answers });

    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      total: 4,
      correct: 1,
      blank: 1,
      wrong: 2,
      scorePercent: 25,
    });
    expect(result.body.data.items[0]).toMatchObject({ isCorrect: true });
    expect(result.body.data.items[0].explanation).toBe(
      'Madde 60 uyarınca tescil edilir.',
    );
    expect(result.body.data.items[1].selectedIndex).toBeNull();
  });

  it('counts an unanswered question as blank', async () => {
    const session = await start({ questionCount: 2 });

    const result = await request(ctx.app)
      .post(`${BASE}/sessions/${session.body.data.sessionId}/submit`)
      .send({ answers: [] });

    expect(result.body.data).toMatchObject({
      total: 2,
      correct: 0,
      wrong: 0,
      blank: 2,
      scorePercent: 0,
    });
  });

  it('cannot be submitted twice', async () => {
    const session = await start({ questionCount: 2 });
    const submit = (): request.Test =>
      request(ctx.app)
        .post(`${BASE}/sessions/${session.body.data.sessionId}/submit`)
        .send({ answers: [] });

    expect((await submit()).status).toBe(200);
    expect((await submit()).status).toBe(404);
  });

  it('rejects an unknown session', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/sessions/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed/submit`)
      .send({ answers: [] });

    expect(response.status).toBe(404);
  });

  it('draws only published questions', async () => {
    const quiet = await createTestContext();

    await addQuestion(quiet, { isPublished: false });

    const response = await request(quiet.app)
      .post(`${BASE}/sessions`)
      .send({ questionCount: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('yayımlanmış soru');
  });

  it('filters the draw by topic and difficulty', async () => {
    await addQuestion(ctx, {
      question: 'Tarife konusuna ait zor bir soru metni burada',
      topic: 'Tarife',
      difficulty: 'zor',
    });

    const response = await start({
      topic: 'Tarife',
      difficulty: 'zor',
      questionCount: 10,
    });

    expect(response.body.data.questions).toHaveLength(1);
    expect(response.body.data.questions[0].topic).toBe('Tarife');
  });

  it('shuffles the draw', async () => {
    const firstIds = new Set<string>();

    // Six questions, three drawn: repeated draws should not always match.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const session = await start({ questionCount: 3 });

      firstIds.add(
        session.body.data.questions
          .map((question: { id: string }) => question.id)
          .join(','),
      );
    }

    expect(firstIds.size).toBeGreaterThan(1);
  });

  it('drops a question the admin deleted mid-exam', async () => {
    const session = await start({ questionCount: 3 });
    const [victim] = session.body.data.questions;

    await request(ctx.app)
      .delete(`${BASE}/questions/${victim.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    const result = await request(ctx.app)
      .post(`${BASE}/sessions/${session.body.data.sessionId}/submit`)
      .send({ answers: [] });

    expect(result.status).toBe(200);
    expect(result.body.data.total).toBe(2);
  });
});

describe('importing a question bank', () => {
  let ctx: TestContext;

  const MARKDOWN = `## Tarife

1. GTİP kodunun ilk altı hanesi neyi ifade eder?
A) Ulusal alt açılım
B) Armonize Sistem (HS) kodu
C) Kombine Nomanklatür
Cevap: B
Açıklama: İlk 6 hane uluslararası HS kodudur.

2. Kota ile tarife kontenjanı arasındaki fark nedir?
A) İkisi de aynıdır
**B) Kota miktar kısıtıdır, kontenjan indirimli vergidir**
Zorluk: zor

3. Bu soruda cevap yok ve içeri alınmamalı
A) Bir
B) İki
`;

  function importRequest(path: string, body: Record<string, string>) {
    const call = request(ctx.app)
      .post(`${BASE}/questions/${path}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    for (const [key, value] of Object.entries(body)) {
      void call.field(key, value);
    }

    return call;
  }

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('previews a Markdown file without saving anything', async () => {
    const response = await importRequest('import/preview', {})
      .attach('file', Buffer.from(MARKDOWN, 'utf8'), {
        filename: 'sorular.md',
        contentType: 'text/markdown',
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ importable: 2, skipped: 1 });

    const [first, second, third] = response.body.data.items;

    expect(first).toMatchObject({
      topic: 'Tarife',
      correctOptionIndex: 1,
      difficulty: 'orta',
      canImport: true,
    });
    expect(second).toMatchObject({ difficulty: 'zor', canImport: true });
    expect(third.canImport).toBe(false);
    expect(third.errors[0]).toContain('Doğru cevap bulunamadı');

    // Preview saves nothing.
    const bank = await request(ctx.app)
      .get(`${BASE}/questions`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(bank.body.data.pagination.total).toBe(0);
  });

  it('imports the usable questions as drafts by default', async () => {
    const response = await importRequest('import', {})
      .attach('file', Buffer.from(MARKDOWN, 'utf8'), {
        filename: 'sorular.md',
        contentType: 'text/markdown',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ created: 2, skipped: 1 });

    const bank = await request(ctx.app)
      .get(`${BASE}/questions`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(bank.body.data.pagination.total).toBe(2);
    expect(
      bank.body.data.items.every(
        (item: { isPublished: boolean }) => !item.isPublished,
      ),
    ).toBe(true);

    // Drafts stay out of exams until the admin publishes them.
    const availability = await request(ctx.app).get(`${BASE}/availability`);

    expect(availability.body.data.totalQuestions).toBe(0);
  });

  it('can publish on import', async () => {
    await importRequest('import', { isPublished: 'true' }).attach(
      'file',
      Buffer.from(MARKDOWN, 'utf8'),
      { filename: 'sorular.md', contentType: 'text/markdown' },
    );

    const availability = await request(ctx.app).get(`${BASE}/availability`);

    expect(availability.body.data.totalQuestions).toBe(2);
  });

  it('fills a missing topic from the default', async () => {
    const source = '1. Konusu belirtilmemiş bir soru metni\nA) Bir\nB) İki\nCevap: A\n';

    const withoutDefault = await importRequest('import/preview', {}).attach(
      'file',
      Buffer.from(source, 'utf8'),
      { filename: 'sorular.md', contentType: 'text/markdown' },
    );

    expect(withoutDefault.body.data.items[0].canImport).toBe(false);
    expect(withoutDefault.body.data.items[0].errors[0]).toContain('Konu');

    const withDefault = await importRequest('import/preview', {
      defaultTopic: 'Genel',
    }).attach('file', Buffer.from(source, 'utf8'), {
      filename: 'sorular.md',
      contentType: 'text/markdown',
    });

    expect(withDefault.body.data.items[0]).toMatchObject({
      topic: 'Genel',
      canImport: true,
    });
  });

  it('accepts pasted text instead of a file', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/questions/import/preview`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ source: MARKDOWN, defaultTopic: 'Genel' });

    expect(response.status).toBe(200);
    expect(response.body.data.importable).toBe(2);
  });

  it('reads a .docx, taking a bolded option as the answer', async () => {
    const { default: JSZip } = await import('jszip');
    const paragraphs = [
      ['1. Antrepoda süre aşımının sonucu nedir?', false],
      ['A) Bir şey olmaz', false],
      ['B) Tasfiye hükümleri uygulanır', true],
      ['Konu: Rejimler', false],
    ] as const;

    const body = paragraphs
      .map(
        ([text, bold]) =>
          `<w:p><w:r>${
            bold ? '<w:rPr><w:b/></w:rPr>' : ''
          }<w:t>${text}</w:t></w:r></w:p>`,
      )
      .join('');

    const zip = new JSZip();

    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`,
    );

    const docx = await zip.generateAsync({ type: 'nodebuffer' });

    const response = await importRequest('import/preview', {}).attach(
      'file',
      docx,
      {
        filename: 'sorular.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({
      question: 'Antrepoda süre aşımının sonucu nedir?',
      options: ['Bir şey olmaz', 'Tasfiye hükümleri uygulanır'],
      correctOptionIndex: 1,
      topic: 'Rejimler',
      canImport: true,
    });
  });

  it('does not import the same question twice', async () => {
    const first = await importRequest('import', {}).attach(
      'file',
      Buffer.from(MARKDOWN, 'utf8'),
      { filename: 'sorular.md', contentType: 'text/markdown' },
    );

    expect(first.body.data.created).toBe(2);

    // Re-importing a corrected file is normal; it must not double the bank.
    const second = await importRequest('import', {}).attach(
      'file',
      Buffer.from(MARKDOWN, 'utf8'),
      { filename: 'sorular.md', contentType: 'text/markdown' },
    );

    expect(second.body.data).toMatchObject({ created: 0, skipped: 3 });
    expect(
      second.body.data.items.filter((item: { errors: string[] }) =>
        item.errors.some((message) => message.includes('zaten var')),
      ),
    ).toHaveLength(2);

    const bank = await request(ctx.app)
      .get(`${BASE}/questions`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(bank.body.data.pagination.total).toBe(2);
  });

  it('flags a question repeated inside one file', async () => {
    const twice = `1. Aynı soru metni iki kez yazılmış burada\nA) Bir\nB) İki\nCevap: A\nKonu: Genel\n\n2. Aynı soru metni iki kez yazılmış burada\nA) Bir\nB) İki\nCevap: B\nKonu: Genel\n`;

    const response = await importRequest('import/preview', {}).attach(
      'file',
      Buffer.from(twice, 'utf8'),
      { filename: 'sorular.md', contentType: 'text/markdown' },
    );

    expect(response.body.data).toMatchObject({ importable: 1, skipped: 1 });
    expect(response.body.data.items[1].errors[0]).toContain('zaten var');
  });

  it('rejects a file that is not a readable .docx', async () => {
    const response = await importRequest('import/preview', {}).attach(
      'file',
      Buffer.from('bu bir zip değil'),
      {
        filename: 'sorular.docx',
        contentType: 'application/msword',
      },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Word dosyası okunamadı');
  });

  it('rejects a file with no questions in it', async () => {
    const response = await importRequest('import/preview', {}).attach(
      'file',
      Buffer.from('Sadece düz metin, hiç soru yok.', 'utf8'),
      { filename: 'sorular.md', contentType: 'text/markdown' },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('soru bulunamadı');
  });

  it('rejects an empty request', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/questions/import/preview`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it('refuses a non-admin', async () => {
    const response = await request(ctx.app)
      .post(`${BASE}/questions/import`)
      .set('Authorization', `Bearer ${ctx.studentToken}`)
      .send({ source: MARKDOWN, defaultTopic: 'Genel' });

    expect(response.status).toBe(403);
  });
});
