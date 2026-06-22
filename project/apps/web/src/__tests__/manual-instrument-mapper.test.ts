import { describe, it, expect } from 'vitest';
import {
  claimDraftItemToManualInstrumentPayload,
  routeClaimRawsForManualInstruments,
  isKambiyoRaw,
} from '../components/debtor/ocr-instrument';

// PR-2b-2: wizard claim item raw (ProfessionalClaimItemForm onItemsChange çıktısı alt kümesi).
const cekRaw = (over: any = {}) => ({
  kalemTuru: 'CEK',
  bakiyeTutar: 1000,
  currency: 'TRY',
  vadeTarihi: '2026-01-10',
  cekBilgileri: { cekSeriNo: 'CK-1', ibrazTarihi: '2026-02-01', bankaVeSube: 'Türkiye İş Bankası - Buca/İzmir Şubesi' },
  ...over,
});
const senetRaw = (over: any = {}) => ({
  kalemTuru: 'SENET',
  bakiyeTutar: 2000,
  currency: 'TRY',
  vadeTarihi: '2026-03-15',
  senetBilgileri: { senetNo: 'SN-1', duzenlemeYeri: 'Ankara', duzenlemeTarihi: '2026-01-05' },
  ...over,
});
const asilAlacakRaw = (over: any = {}) => ({
  kalemTuru: 'ASIL_ALACAK',
  bakiyeTutar: 500,
  currency: 'TRY',
  vadeTarihi: '2026-01-01',
  ...over,
});

describe('claimDraftItemToManualInstrumentPayload (PR-2b-2 mapper)', () => {
  it('CEK → payload (documentNo=cekSeriNo · issueDate=keşide · dueDate=ibrazTarihi · source=MANUAL)', () => {
    const p = claimDraftItemToManualInstrumentPayload(cekRaw());
    expect(p).not.toBeNull();
    expect(p!.type).toBe('CEK');
    expect(p!.documentNo).toBe('CK-1');
    expect(p!.amount).toBe(1000);
    expect(p!.currency).toBe('TRY');
    expect(p!.issueDate).toBe('2026-01-10'); // vadeTarihi = keşide
    expect(p!.dueDate).toBe('2026-02-01');   // ibrazTarihi → backend presentmentDate
    expect(p!.bankName).toBe('Türkiye İş Bankası');
    expect(p!.branchName).toBe('Buca/İzmir Şubesi');
    expect(p!.source).toBe('MANUAL');
  });

  it('SENET → payload (documentNo=senetNo · issueDate=duzenlemeTarihi · dueDate=vadeTarihi · source=MANUAL)', () => {
    const p = claimDraftItemToManualInstrumentPayload(senetRaw());
    expect(p).not.toBeNull();
    expect(p!.type).toBe('SENET');
    expect(p!.documentNo).toBe('SN-1');
    expect(p!.amount).toBe(2000);
    expect(p!.issueDate).toBe('2026-01-05'); // duzenlemeTarihi
    expect(p!.dueDate).toBe('2026-03-15');   // vadeTarihi → backend maturityDate
    expect(p!.source).toBe('MANUAL');
  });

  it('eksik cekSeriNo → null (gönderilmez)', () => {
    expect(claimDraftItemToManualInstrumentPayload(cekRaw({ cekBilgileri: { cekSeriNo: '', ibrazTarihi: '2026-02-01' } }))).toBeNull();
  });

  it('eksik senetNo → null (gönderilmez)', () => {
    expect(claimDraftItemToManualInstrumentPayload(senetRaw({ senetBilgileri: { senetNo: '', duzenlemeTarihi: '2026-01-05' } }))).toBeNull();
  });

  it('amount 0 → null', () => {
    expect(claimDraftItemToManualInstrumentPayload(cekRaw({ bakiyeTutar: 0 }))).toBeNull();
  });

  it('POLICE / kambiyo-dışı → null (manuel desteklenmez)', () => {
    expect(claimDraftItemToManualInstrumentPayload({ kalemTuru: 'POLICE', bakiyeTutar: 100, currency: 'TRY' })).toBeNull();
    expect(claimDraftItemToManualInstrumentPayload(asilAlacakRaw())).toBeNull();
  });

  it('deterministik (aynı raw → eşit payload; draft restore türetimi tutarlı)', () => {
    expect(claimDraftItemToManualInstrumentPayload(cekRaw())).toEqual(claimDraftItemToManualInstrumentPayload(cekRaw()));
  });
});

describe('routeClaimRawsForManualInstruments (PR-2b-2 routing)', () => {
  it('flag OFF → hepsi dues fallback (CEK dahil); manualInstruments boş (PR-2a)', () => {
    const r = routeClaimRawsForManualInstruments([cekRaw(), asilAlacakRaw()], false);
    expect(r.manualInstruments).toHaveLength(0);
    expect(r.remainingForDues).toHaveLength(2);
  });

  it('flag ON: TAM CEK → yalnız instruments, dues YOK (K1 çift-sayım yok)', () => {
    const r = routeClaimRawsForManualInstruments([cekRaw()], true);
    expect(r.manualInstruments).toHaveLength(1);
    expect(r.manualInstruments[0].source).toBe('MANUAL');
    expect(r.manualInstruments[0].documentNo).toBe('CK-1');
    expect(r.remainingForDues).toHaveLength(0);
  });

  it('flag ON: TAM SENET → yalnız instruments', () => {
    const r = routeClaimRawsForManualInstruments([senetRaw()], true);
    expect(r.manualInstruments).toHaveLength(1);
    expect(r.manualInstruments[0].type).toBe('SENET');
    expect(r.remainingForDues).toHaveLength(0);
  });

  it('flag ON: kambiyo-dışı dues\'ta kalır (etkilenmez); kambiyo instruments\'a', () => {
    const r = routeClaimRawsForManualInstruments([cekRaw(), asilAlacakRaw(), senetRaw()], true);
    expect(r.manualInstruments).toHaveLength(2);
    expect(r.remainingForDues).toHaveLength(1);
    expect(r.remainingForDues[0].kalemTuru).toBe('ASIL_ALACAK');
  });

  it('flag ON: EKSİK kambiyo → dues fallback (kayıp yok; instruments\'a girmez)', () => {
    const incompleteCek = cekRaw({ cekBilgileri: { cekSeriNo: '', ibrazTarihi: '2026-02-01' } });
    const r = routeClaimRawsForManualInstruments([incompleteCek], true);
    expect(r.manualInstruments).toHaveLength(0);
    expect(r.remainingForDues).toHaveLength(1);
  });

  it('isKambiyoRaw: CEK/SENET true, diğer false', () => {
    expect(isKambiyoRaw(cekRaw())).toBe(true);
    expect(isKambiyoRaw(senetRaw())).toBe(true);
    expect(isKambiyoRaw(asilAlacakRaw())).toBe(false);
    expect(isKambiyoRaw({ kalemTuru: 'POLICE' })).toBe(false);
  });
});
