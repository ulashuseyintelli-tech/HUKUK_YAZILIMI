/**
 * BUG-X — Çek tip-farkındalı tarih modeli (saf helper + payload fallback).
 * Çekte vade yoktur; OCR ikinci tarihi dueDate'e koymuş olabilir.
 * Kurallar: keşide = issueDate ?? dueDate (çek); ikisi farklıysa uyarı + OTOMATİK swap YOK;
 * senet/poliçe davranışı DEĞİŞMEZ; dueDate payload'da otomatik silinmez.
 */
import { describe, it, expect } from 'vitest';
import {
  effectiveIssueDate,
  shouldWarnCekDates,
  showsVade,
  isInstrumentComplete,
  selectedInstrumentsToPayload,
  formatDateTr,
  Instrument,
} from '../components/debtor/ocr-instrument';

const inst = (over: Partial<Instrument>): Instrument =>
  ({ type: 'CEK', currency: 'TRY', confidence: 90, ...over } as Instrument);

describe('formatDateTr — ISO → TR gösterim (hotfix)', () => {
  it('YYYY-MM-DD → DD.MM.YYYY', () => {
    expect(formatDateTr('2025-12-30')).toBe('30.12.2025');
    expect(formatDateTr('2025-07-07')).toBe('07.07.2025');
  });
  it('boş/undefined → boş string', () => {
    expect(formatDateTr(undefined)).toBe('');
    expect(formatDateTr('')).toBe('');
  });
  it('tanınmayan format → olduğu gibi döner (savunmacı)', () => {
    expect(formatDateTr('30.12.2025')).toBe('30.12.2025');
  });
});

describe('effectiveIssueDate — çek keşide fallback', () => {
  it('çek: issueDate varsa KORUNUR', () => {
    expect(effectiveIssueDate(inst({ issueDate: '2025-07-07', dueDate: '2025-12-30' }))).toBe('2025-07-07');
  });
  it('çek: issueDate yok + dueDate var → dueDate (fallback)', () => {
    expect(effectiveIssueDate(inst({ dueDate: '2025-11-25' }))).toBe('2025-11-25');
  });
  it('çek: ikisi de yok → undefined', () => {
    expect(effectiveIssueDate(inst({}))).toBeUndefined();
  });
  it('senet: SADECE issueDate (dueDate fallback YOK)', () => {
    expect(effectiveIssueDate(inst({ type: 'SENET', issueDate: '2026-01-10', dueDate: '2026-03-01' }))).toBe('2026-01-10');
    expect(effectiveIssueDate(inst({ type: 'SENET', dueDate: '2026-03-01' }))).toBeUndefined();
  });
});

describe('shouldWarnCekDates — iki tarih farklı uyarısı', () => {
  it('çek: issueDate && dueDate && farklı → true', () => {
    expect(shouldWarnCekDates(inst({ issueDate: '2025-07-07', dueDate: '2025-12-30' }))).toBe(true);
  });
  it('çek: ikisi aynı → false', () => {
    expect(shouldWarnCekDates(inst({ issueDate: '2025-07-07', dueDate: '2025-07-07' }))).toBe(false);
  });
  it('çek: yalnız biri dolu → false', () => {
    expect(shouldWarnCekDates(inst({ issueDate: '2025-07-07' }))).toBe(false);
    expect(shouldWarnCekDates(inst({ dueDate: '2025-12-30' }))).toBe(false);
  });
  it('senet: iki tarih farklı olsa bile → false (yalnız çek uyarır)', () => {
    expect(shouldWarnCekDates(inst({ type: 'SENET', issueDate: '2026-01-10', dueDate: '2026-03-01' }))).toBe(false);
  });
});

describe('showsVade — vade kolonu görünürlüğü', () => {
  it('çek → false; senet/poliçe → true', () => {
    expect(showsVade(inst({ type: 'CEK' }))).toBe(false);
    expect(showsVade(inst({ type: 'SENET' }))).toBe(true);
    expect(showsVade(inst({ type: 'POLICE' }))).toBe(true);
  });
});

describe('isInstrumentComplete — çek dueDate fallback', () => {
  const base = { documentNo: 'CK-1', amount: 1000, currency: 'TRY' as const };
  it('çek: dueDate-only (issueDate yok) → TAM (fallback)', () => {
    expect(isInstrumentComplete(inst({ ...base, dueDate: '2025-11-25' }))).toBe(true);
  });
  it('çek: iki tarih de yok → eksik', () => {
    expect(isInstrumentComplete(inst({ ...base }))).toBe(false);
  });
  it('senet: dueDate-only (issueDate yok) → EKSİK (fallback yok)', () => {
    expect(isInstrumentComplete(inst({ ...base, type: 'SENET', dueDate: '2026-03-01' }))).toBe(false);
  });
});

describe('selectedInstrumentsToPayload — çek tarih fallback (swap yok, dueDate korunur)', () => {
  it('çek issueDate boş + dueDate dolu → payload.issueDate = dueDate; dueDate KORUNUR', () => {
    const out = selectedInstrumentsToPayload([
      inst({ documentNo: 'CK-1', amount: 1000, dueDate: '2025-11-25' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].issueDate).toBe('2025-11-25'); // fallback
    expect(out[0].dueDate).toBe('2025-11-25'); // otomatik silinmez
  });

  it('çek iki tarih farklı → issueDate KORUNUR (07.07), dueDate KORUNUR (30.12) — SWAP YOK', () => {
    const out = selectedInstrumentsToPayload([
      inst({ documentNo: 'CK-1', amount: 1000, issueDate: '2025-07-07', dueDate: '2025-12-30' }),
    ]);
    expect(out[0].issueDate).toBe('2025-07-07');
    expect(out[0].dueDate).toBe('2025-12-30');
  });

  it('senet issueDate boş + dueDate dolu → ELENİR (çek-dışı fallback yok)', () => {
    const out = selectedInstrumentsToPayload([
      inst({ type: 'SENET', documentNo: 'SN-1', amount: 2000, dueDate: '2026-03-01' }),
    ]);
    expect(out).toHaveLength(0);
  });
});
