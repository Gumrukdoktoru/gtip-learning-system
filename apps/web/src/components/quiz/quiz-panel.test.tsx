import type { QuizAvailability, QuizResult, QuizSession } from '@gtip/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuizPanel } from './quiz-panel';

const { fetchQuizAvailability, startQuiz, submitQuiz } = vi.hoisted(() => ({
  fetchQuizAvailability: vi.fn(),
  startQuiz: vi.fn(),
  submitQuiz: vi.fn(),
}));

vi.mock('../../services/quiz-service', () => ({
  fetchQuizAvailability,
  startQuiz,
  submitQuiz,
}));

const AVAILABILITY: QuizAvailability = {
  totalQuestions: 12,
  topics: [
    { topic: 'Gümrük Kanunu', questionCount: 8 },
    { topic: 'Tarife', questionCount: 4 },
  ],
};

const SESSION: QuizSession = {
  sessionId: '2b1c0f3a-0000-4000-8000-000000000001',
  expiresAt: '2026-09-01T00:00:00.000Z',
  questions: [
    {
      id: 'q1',
      question: 'Beyanname ne zaman tescil edilir?',
      options: ['Birinci şık', 'İkinci şık', 'Üçüncü şık'],
      topic: 'Gümrük Kanunu',
      difficulty: 'orta',
    },
    {
      id: 'q2',
      question: 'Tarife kontenjanı nedir?',
      options: ['A seçeneği', 'B seçeneği'],
      topic: 'Tarife',
      difficulty: 'zor',
    },
  ],
};

const RESULT: QuizResult = {
  total: 2,
  correct: 1,
  wrong: 1,
  blank: 0,
  scorePercent: 50,
  items: [
    {
      questionId: 'q1',
      question: 'Beyanname ne zaman tescil edilir?',
      options: ['Birinci şık', 'İkinci şık', 'Üçüncü şık'],
      selectedIndex: 1,
      correctOptionIndex: 1,
      isCorrect: true,
      explanation: 'Madde 60 uyarınca.',
      topic: 'Gümrük Kanunu',
    },
    {
      questionId: 'q2',
      question: 'Tarife kontenjanı nedir?',
      options: ['A seçeneği', 'B seçeneği'],
      selectedIndex: 0,
      correctOptionIndex: 1,
      isCorrect: false,
      explanation: 'Kota ile karıştırmayın.',
      topic: 'Tarife',
    },
  ],
};

describe('QuizPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchQuizAvailability.mockResolvedValue(AVAILABILITY);
    startQuiz.mockResolvedValue(SESSION);
    submitQuiz.mockResolvedValue(RESULT);
  });

  it('offers the topics with their question counts', async () => {
    render(<QuizPanel />);

    expect(
      await screen.findByRole('option', { name: 'Gümrük Kanunu (8 soru)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Tüm konular (12 soru)' }),
    ).toBeInTheDocument();
  });

  it('starts an exam with the chosen filters', async () => {
    const user = userEvent.setup();

    render(<QuizPanel />);
    await screen.findByRole('option', { name: 'Tarife (4 soru)' });

    await user.selectOptions(screen.getByLabelText('Konu'), 'Tarife');
    await user.selectOptions(screen.getByLabelText('Zorluk'), 'zor');
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'Testi başlat' }));

    await waitFor(() => {
      expect(startQuiz).toHaveBeenCalledWith({
        topic: 'Tarife',
        difficulty: 'zor',
        questionCount: 5,
      });
    });
  });

  it('walks through the questions and submits the answers', async () => {
    const user = userEvent.setup();

    render(<QuizPanel />);
    await screen.findByRole('button', { name: 'Testi başlat' });
    await user.click(screen.getByRole('button', { name: 'Testi başlat' }));

    expect(await screen.findByText('Soru 1 / 2')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /İkinci şık/ }));
    await user.click(screen.getByRole('button', { name: 'Sonraki' }));

    expect(screen.getByText('Soru 2 / 2')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /A seçeneği/ }));
    await user.click(screen.getByRole('button', { name: 'Testi bitir' }));

    await waitFor(() => {
      expect(submitQuiz).toHaveBeenCalledWith(SESSION.sessionId, [
        { questionId: 'q1', selectedIndex: 1 },
        { questionId: 'q2', selectedIndex: 0 },
      ]);
    });
  });

  it('sends an untouched question as blank', async () => {
    const user = userEvent.setup();

    render(<QuizPanel />);
    await screen.findByRole('button', { name: 'Testi başlat' });
    await user.click(screen.getByRole('button', { name: 'Testi başlat' }));
    await screen.findByText('Soru 1 / 2');

    await user.click(screen.getByRole('button', { name: 'Testi bitir' }));

    await waitFor(() => {
      expect(submitQuiz).toHaveBeenCalledWith(SESSION.sessionId, [
        { questionId: 'q1', selectedIndex: null },
        { questionId: 'q2', selectedIndex: null },
      ]);
    });
  });

  it('shows the score with the correct answer and explanation', async () => {
    const user = userEvent.setup();

    render(<QuizPanel />);
    await screen.findByRole('button', { name: 'Testi başlat' });
    await user.click(screen.getByRole('button', { name: 'Testi başlat' }));
    await screen.findByText('Soru 1 / 2');
    await user.click(screen.getByRole('button', { name: 'Testi bitir' }));

    expect(await screen.findByText('%50')).toBeInTheDocument();
    expect(
      screen.getByText('2 soruda 1 doğru, 1 yanlış, 0 boş.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Kota ile karıştırmayın.')).toBeInTheDocument();

    // Both questions mark the right answer; only the wrong one also marks
    // what the student picked.
    const correctLabels = screen.getAllByText('doğru cevap');

    expect(correctLabels).toHaveLength(2);
    expect(correctLabels[1]!.closest('li')).toHaveTextContent('B seçeneği');
    expect(
      screen.getByText('sizin cevabınız').closest('li'),
    ).toHaveTextContent('A seçeneği');
  });

  it('lets the student start over', async () => {
    const user = userEvent.setup();

    render(<QuizPanel />);
    await screen.findByRole('button', { name: 'Testi başlat' });
    await user.click(screen.getByRole('button', { name: 'Testi başlat' }));
    await screen.findByText('Soru 1 / 2');
    await user.click(screen.getByRole('button', { name: 'Testi bitir' }));
    await screen.findByText('%50');

    await user.click(
      screen.getAllByRole('button', { name: 'Yeni test başlat' })[0]!,
    );

    expect(
      await screen.findByRole('button', { name: 'Testi başlat' }),
    ).toBeInTheDocument();
  });

  it('surfaces a failure to start', async () => {
    const user = userEvent.setup();

    startQuiz.mockRejectedValue(new Error('boom'));

    render(<QuizPanel />);
    await screen.findByRole('button', { name: 'Testi başlat' });
    await user.click(screen.getByRole('button', { name: 'Testi başlat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Test başlatılamadı.',
    );
  });

  it('says so when the bank is empty', async () => {
    fetchQuizAvailability.mockResolvedValue({ topics: [], totalQuestions: 0 });

    render(<QuizPanel />);

    expect(await screen.findByText('Henüz soru eklenmedi')).toBeInTheDocument();
  });
});
