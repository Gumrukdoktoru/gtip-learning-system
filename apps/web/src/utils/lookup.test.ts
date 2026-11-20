import { describe, expect, it } from 'vitest';
import type { MevzuatIndex } from '../types/mevzuat';
import { buildLookup, modeForArticle, searchScope } from './lookup';
import { parseHash } from './route';

const index: MevzuatIndex = {
  topics: [
    { id: 1, title: 'Tanımlar', articles: [{ id: 'gk-4', label: 'GK Madde 4', title: '' }] },
    {
      id: 3,
      title: 'YYS — Gümrük İşlemlerinin Kolaylaştırılması Yönetmeliği',
      articles: [
        { id: 'yys-4-a', label: 'YYS Madde 4/A', title: 'YYS-I ve YYS-II Statüleri' },
        { id: 'yys-16', label: 'YYS Madde 16', title: 'Sertifikanın Geçerlilik Süresi' },
        { id: 'yys-17', label: 'YYS Madde 17', title: 'Sertifikada Kayıtlı Bilgilerde Değişiklik Olması' },
      ],
    },
  ],
  gk: [{ id: 'gk-4', no: '4', title: '', topic: 1 }],
  gy: [],
  yys: [
    { id: 'yys-4-a', no: '4/A', title: 'YYS-I ve YYS-II Statüleri', topic: 3 },
    { id: 'yys-16', no: '16', title: 'Sertifikanın Geçerlilik Süresi', topic: 3 },
    { id: 'yys-17', no: '17', title: 'Sertifikada Kayıtlı Bilgilerde Değişiklik Olması', topic: 3 },
  ],
  groups: [],
};

describe('YYS Yönetmeliği adresleri', () => {
  it('#yys-16 çapası YYS maddesini açar ve YYS sekmesine geçer', () => {
    const route = parseHash('#yys-16');
    expect(route).toEqual({ kind: 'article', id: 'yys-16' });
    const lookup = buildLookup(index);
    expect(lookup.topicOf.get('yys-16')).toBe(3);
    expect(modeForArticle('yys-16', 'sinav', lookup.topicOf.get('yys-16'))).toBe('yys');
    expect(modeForArticle('yys-16', 'konu', 3)).toBe('konu');
  });

  it('harfli madde çapası küçük harfli kimliğe çözülür', () => {
    expect(parseHash('#YYS-4-A')).toEqual({ kind: 'article', id: 'yys-4-a' });
  });

  it('önceki/sonraki madde sırası ve atıf listesi YYS maddelerini içerir; GK sırası değişmez', () => {
    const lookup = buildLookup(index);
    expect(lookup.order.yys).toEqual(['yys-4-a', 'yys-16', 'yys-17']);
    expect(lookup.order.gk).toEqual(['gk-4']);
    expect(lookup.knownRefs.has('yys-16')).toBe(true);
  });

  it('YYS sekmesinde arama yalnızca YYS maddelerinin konusunu tarar', () => {
    expect(searchScope(index, 'yys', undefined)).toEqual({ topics: [3], key: 'yys' });
    expect(searchScope(index, 'gk', undefined)).toEqual({ topics: [1, 3], key: 'core' });
  });
});
