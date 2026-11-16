import { describe, expect, it } from 'vitest';
import { parseHash } from './route';
import { splitHits, splitRefs, trLower } from './text';

const known = new Set(['gk-5', 'gk-225', 'gy-561', 'gk-5-A']);

describe('splitRefs', () => {
  it('kaynak belirtilmeyen atfı maddenin kendi mevzuatına bağlar', () => {
    const segments = splitRefs('Bu işlem 225 inci maddeye göre yapılır.', 'GK', known);
    expect(segments.map((s) => s.target)).toEqual([undefined, 'gk-225', undefined]);
  });

  it('"Kanunun" ve "Yönetmeliğin" öneklerini çözer', () => {
    expect(splitRefs('Kanunun 5 inci maddesi', 'GY', known)[0]?.target).toBe('gk-5');
    expect(splitRefs('Gümrük Yönetmeliğinin 561 inci maddesi', 'GK', known)[1]?.target).toBe('gy-561');
  });

  it('bilinmeyen maddeyi ve kaynağı belirsiz atfı bağlamaz', () => {
    expect(splitRefs('999 uncu maddesi', 'GK', known)).toEqual([{ text: '999 uncu maddesi' }]);
    expect(splitRefs('5 inci maddesi', '', known)).toEqual([{ text: '5 inci maddesi' }]);
  });

  it('harfli maddeyi tanır', () => {
    expect(splitRefs('5/A ncı maddesi', 'GK', known)[0]?.target).toBe('gk-5-A');
  });
});

describe('splitHits', () => {
  it('Türkçe harflerde büyük/küçük ayrımı yapmadan vurgular', () => {
    expect(trLower('IŞIK')).toBe('ışık');
    const segments = splitHits('Gümrük IŞIK idaresi', 'ışık');
    expect(segments).toEqual([{ text: 'Gümrük ' }, { text: 'IŞIK', hit: true }, { text: ' idaresi' }]);
  });
});

describe('parseHash', () => {
  it('madde, konu ve kısa yol çapalarını çözer', () => {
    expect(parseHash('#gy-561')).toEqual({ kind: 'article', id: 'gy-561' });
    expect(parseHash('#konu-2')).toEqual({ kind: 'topic', id: 2 });
    expect(parseHash('#m5')).toEqual({ kind: 'article', id: 'gk-5' });
    expect(parseHash('')).toEqual({ kind: 'home' });
    expect(parseHash('#diger-sorular')).toEqual({ kind: 'questions' });
  });
});
