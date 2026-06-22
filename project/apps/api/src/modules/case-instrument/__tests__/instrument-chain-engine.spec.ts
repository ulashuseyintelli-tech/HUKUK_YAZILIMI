/**
 * A1 Faz 2a — instrument-chain-engine SAF motor birim testi.
 * V3 (ulas onayı 2026-06-23): hamil → keşideci + önceki cirantalar + avalistleri (müteselsil).
 * Güvenlik: sırasız (position yok) → NEEDS_REVIEW (borçlu üretilmez). CaseDebtor YARATILMAZ (saf veri).
 */
import {
  computeHolder,
  computeRecourse,
  analyzeChain,
} from '../instrument-chain-engine';
import { InstrumentChain, InstrumentPartyNode, AvalEdge } from '../instrument-chain.contract';

const prov = { source: 'MANUAL' as const, confidence: 1 };

const node = (over: Partial<InstrumentPartyNode>): InstrumentPartyNode => ({
  role: 'ENDORSER',
  party: { name: 'X', type: 'INDIVIDUAL' },
  position: 0,
  provenance: prov,
  ...over,
});

const chain = (nodes: InstrumentPartyNode[], avals: AvalEdge[] = []): InstrumentChain => ({
  nodes,
  endorsements: [],
  avals,
});

describe('computeHolder', () => {
  it('tam sıralı zincir → hamil = en yüksek position', () => {
    const c = chain([
      node({ role: 'DRAWER', position: 0, party: { name: 'Keşideci', type: 'COMPANY' } }),
      node({ role: 'ENDORSER', position: 1, party: { name: 'C1', type: 'INDIVIDUAL' } }),
      node({ role: 'ENDORSER', position: 2, party: { name: 'Hamil', type: 'INDIVIDUAL' } }),
    ]);
    const h = computeHolder(c);
    expect(h.status).toBe('RESOLVED');
    expect(h.holderPosition).toBe(2);
    expect(h.holderNode?.party.name).toBe('Hamil');
  });

  it('position null varsa → NEEDS_REVIEW (sırasız OCR; borçlu üretme)', () => {
    const c = chain([
      node({ role: 'DRAWER', position: 0 }),
      node({ role: 'ENDORSER', position: null }),
    ]);
    expect(computeHolder(c).status).toBe('NEEDS_REVIEW');
  });

  it('boş zincir → NEEDS_REVIEW', () => {
    expect(computeHolder(chain([])).status).toBe('NEEDS_REVIEW');
  });

  it('aynı en-yüksek position çoklu → NEEDS_REVIEW (belirsiz hamil)', () => {
    const c = chain([node({ position: 1 }), node({ position: 1 })]);
    expect(computeHolder(c).status).toBe('NEEDS_REVIEW');
  });
});

describe('computeRecourse (V3)', () => {
  const c = chain([
    node({ role: 'DRAWER', position: 0, party: { name: 'Keşideci', type: 'COMPANY' } }),
    node({ role: 'ENDORSER', position: 1, party: { name: 'C1', type: 'INDIVIDUAL' } }),
    node({ role: 'ENDORSER', position: 2, party: { name: 'C2', type: 'INDIVIDUAL' } }),
    node({ role: 'ENDORSER', position: 3, party: { name: 'Hamil', type: 'INDIVIDUAL' } }),
  ]);

  it('keşideci + önceki cirantalar dahil; hamil + sonraki HARİÇ', () => {
    const r = computeRecourse(c, 3);
    expect(r.status).toBe('RESOLVED');
    expect(r.parties.map((p) => p.name)).toEqual(['Keşideci', 'C1', 'C2']);
    expect(r.parties.some((p) => p.name === 'Hamil')).toBe(false);
  });

  it('orta hamil: yalnız öncekiler (sonraki cirantalar hariç)', () => {
    const r = computeRecourse(c, 2); // hamil = C2 (pos 2)
    expect(r.parties.map((p) => p.name)).toEqual(['Keşideci', 'C1']);
  });

  it('holderPosition yok → NEEDS_REVIEW (boş)', () => {
    expect(computeRecourse(c, null).status).toBe('NEEDS_REVIEW');
    expect(computeRecourse(c, undefined).parties).toEqual([]);
  });

  it('basis: keşideci = "keşideci"; ciranta = "önceki ciranta"', () => {
    const r = computeRecourse(c, 3);
    expect(r.parties.find((p) => p.name === 'Keşideci')?.basis).toBe('keşideci');
    expect(r.parties.find((p) => p.name === 'C1')?.basis).toBe('önceki ciranta');
  });

  it('aval: garanti edilen taraf recourse\'taysa avalist DAHİL (aval keşideci için)', () => {
    const c2 = chain(
      [
        node({ role: 'DRAWER', position: 0, party: { name: 'Keşideci', type: 'COMPANY' } }),
        node({ role: 'ENDORSER', position: 1, party: { name: 'C1', type: 'INDIVIDUAL' } }),
        node({ role: 'ENDORSER', position: 2, party: { name: 'Hamil', type: 'INDIVIDUAL' } }),
        node({ role: 'AVALIST', position: 3, party: { name: 'Avalist', type: 'INDIVIDUAL' } }),
      ],
      [{ avalistPosition: 3, guaranteesPosition: 0, provenance: prov }], // keşideci için aval
    );
    const r = computeRecourse(c2, 2); // hamil pos 2
    const avalist = r.parties.find((p) => p.role === 'AVALIST');
    expect(avalist?.name).toBe('Avalist');
    expect(avalist?.basis).toContain('aval');
  });

  it('aval: garanti edilen taraf hamil/sonraki ise avalist HARİÇ', () => {
    const c3 = chain(
      [
        node({ role: 'DRAWER', position: 0, party: { name: 'Keşideci', type: 'COMPANY' } }),
        node({ role: 'ENDORSER', position: 1, party: { name: 'Hamil', type: 'INDIVIDUAL' } }),
        node({ role: 'AVALIST', position: 2, party: { name: 'Avalist', type: 'INDIVIDUAL' } }),
      ],
      [{ avalistPosition: 2, guaranteesPosition: 1, provenance: prov }], // hamil için aval
    );
    const r = computeRecourse(c3, 1); // guarantees pos1 = hamil = recourse-dışı
    expect(r.parties.some((p) => p.role === 'AVALIST')).toBe(false);
  });

  it('AVALIST node position<holder ama aval-edge yoksa → doğrudan EKLENMEZ (yalnız aval ilişkisiyle)', () => {
    const c4 = chain([
      node({ role: 'DRAWER', position: 0, party: { name: 'Keşideci', type: 'COMPANY' } }),
      node({ role: 'AVALIST', position: 1, party: { name: 'AvalistEdgesiz', type: 'INDIVIDUAL' } }),
      node({ role: 'ENDORSER', position: 2, party: { name: 'Hamil', type: 'INDIVIDUAL' } }),
    ]); // avals = []
    const r = computeRecourse(c4, 2);
    expect(r.parties.map((p) => p.name)).toEqual(['Keşideci']); // avalist node hariç (edge yok)
  });
});

describe('analyzeChain (uçtan uca)', () => {
  it('sırasız (OCR-benzeri: position null) → holder + recourse NEEDS_REVIEW; borçlu YOK', () => {
    const c = chain([
      node({ role: 'DRAWER', position: null, party: { name: 'Keşideci', type: 'COMPANY' } }),
      node({ role: 'ENDORSER', position: null, party: { name: 'C1', type: 'INDIVIDUAL' } }),
    ]);
    const a = analyzeChain(c);
    expect(a.holder.status).toBe('NEEDS_REVIEW');
    expect(a.recourse.status).toBe('NEEDS_REVIEW');
    expect(a.recourse.parties).toEqual([]); // sahte borçlu üretilmez
  });

  it('tam sıralı → RESOLVED + doğru müracaat kümesi (keşideci + önceki)', () => {
    const c = chain([
      node({ role: 'DRAWER', position: 0, party: { name: 'Keşideci', type: 'COMPANY' } }),
      node({ role: 'ENDORSER', position: 1, party: { name: 'C1', type: 'INDIVIDUAL' } }),
      node({ role: 'ENDORSER', position: 2, party: { name: 'Hamil', type: 'INDIVIDUAL' } }),
    ]);
    const a = analyzeChain(c);
    expect(a.holder.status).toBe('RESOLVED');
    expect(a.holder.holderNode?.party.name).toBe('Hamil');
    expect(a.recourse.status).toBe('RESOLVED');
    expect(a.recourse.parties.map((p) => p.name)).toEqual(['Keşideci', 'C1']);
  });
});
