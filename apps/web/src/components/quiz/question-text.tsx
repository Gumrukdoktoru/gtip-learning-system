export interface QuestionTextProps {
  text: string;
  /** Rendered as a heading in the exam, as plain text in the review. */
  as?: 'h2' | 'p';
}

/**
 * Renders a question stem.
 *
 * Imported banks often open with a short caption on its own line followed by
 * the actual stem — and roman-numeral items below that. Only the first line is
 * emphasised, so a long question does not arrive as a wall of bold text.
 */
export function QuestionText({
  text,
  as = 'h2',
}: QuestionTextProps): JSX.Element {
  const [first = '', ...rest] = text.split('\n');
  const Heading = as;

  return (
    <div className="flex flex-col gap-1">
      <Heading className="text-base font-semibold leading-relaxed text-slate-900">
        {first}
      </Heading>
      {rest.length > 0 ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {rest.join('\n')}
        </p>
      ) : null}
    </div>
  );
}
