import { Alert } from '../alert';
import { useQuiz } from '../../hooks/use-quiz';
import { QuizResultView } from './quiz-result';
import { QuizRunner } from './quiz-runner';
import { QuizStart } from './quiz-start';

/** The whole exam flow: pick a filter, answer, see the review. */
export function QuizPanel(): JSX.Element {
  const {
    phase,
    availability,
    session,
    result,
    answers,
    isBusy,
    error,
    begin,
    answer,
    finish,
    restart,
  } = useQuiz();

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {phase === 'idle' ? (
        <QuizStart
          availability={availability}
          isBusy={isBusy}
          onStart={(input) => void begin(input)}
        />
      ) : null}

      {phase === 'running' && session ? (
        <QuizRunner
          session={session}
          answers={answers}
          isBusy={isBusy}
          onAnswer={answer}
          onFinish={() => void finish()}
        />
      ) : null}

      {phase === 'done' && result ? (
        <QuizResultView result={result} onRestart={restart} />
      ) : null}
    </div>
  );
}
