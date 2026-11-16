import { Fragment } from 'react';
import type { SourceCode } from '../types/mevzuat';
import { splitHits, splitRefs } from '../utils/text';
import { useReaderContext } from './reader-context';
import { RefLink } from './ref-link';

interface RichTextProps {
  text: string;
  source?: SourceCode;
}

function Hits({ text, term }: { text: string; term: string }): JSX.Element {
  return (
    <>
      {splitHits(text, term).map((part, i) =>
        part.hit ? <mark key={i}>{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>,
      )}
    </>
  );
}

/** Paragraf metni: madde atıflarını bağlantıya çevirir, arama terimini vurgular. */
export function RichText({ text, source = '' }: RichTextProps): JSX.Element {
  const { knownRefs, term } = useReaderContext();
  return (
    <>
      {splitRefs(text, source, knownRefs).map((part, i) =>
        part.target ? (
          <RefLink key={i} target={part.target} text={part.text} />
        ) : (
          <Hits key={i} text={part.text} term={term} />
        ),
      )}
    </>
  );
}
