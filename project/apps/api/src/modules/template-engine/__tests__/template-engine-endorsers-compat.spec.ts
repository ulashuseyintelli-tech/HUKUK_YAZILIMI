/**
 * Faz 1 (A1 Kambiyo İlişki Motoru) — extractEndorserNames geriye-uyum birim testi.
 * Yeni InstrumentChain {nodes} şekli → ENDORSER isimleri; eski string[] / [{name}] → isimler;
 * null/boş/tanınmayan → []. Davranış-nötr: kolon boşsa eskisi gibi [] (şablon kırılmaz).
 */
import { extractEndorserNames } from '../template-engine.service';

describe('extractEndorserNames (Faz 1 — endorsers geri uyum)', () => {
  it('null/undefined/boş nesne → []', () => {
    expect(extractEndorserNames(null)).toEqual([]);
    expect(extractEndorserNames(undefined)).toEqual([]);
    expect(extractEndorserNames({})).toEqual([]);
  });

  it('yeni InstrumentChain {nodes} → yalnız ENDORSER isimleri (DRAWER hariç)', () => {
    const chain = {
      nodes: [
        { role: 'DRAWER', party: { name: 'Keşideci A.Ş.' }, position: 0 },
        { role: 'ENDORSER', party: { name: 'Ciranta 1' }, position: null },
        { role: 'ENDORSER', party: { name: 'Ciranta 2' }, position: null },
      ],
      endorsements: [],
    };
    expect(extractEndorserNames(chain)).toEqual(['Ciranta 1', 'Ciranta 2']);
  });

  it('legacy string[] → aynen', () => {
    expect(extractEndorserNames(['A', 'B'])).toEqual(['A', 'B']);
  });

  it('legacy [{name}] → isimler', () => {
    expect(extractEndorserNames([{ name: 'A' }, { name: 'B' }])).toEqual(['A', 'B']);
  });

  it('boş nodes → []', () => {
    expect(extractEndorserNames({ nodes: [], endorsements: [] })).toEqual([]);
  });
});
