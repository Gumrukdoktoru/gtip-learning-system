import { createContext, useContext } from 'react';

export interface ReaderContextValue {
  /** Atıf bağlantısı kurulabilen madde kimlikleri. */
  knownRefs: ReadonlySet<string>;
  /** Vurgulanacak arama terimi. */
  term: string;
}

export const ReaderContext = createContext<ReaderContextValue>({ knownRefs: new Set(), term: '' });

export function useReaderContext(): ReaderContextValue {
  return useContext(ReaderContext);
}
