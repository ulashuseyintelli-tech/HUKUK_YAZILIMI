/**
 * PR-N3-wire — CaseService.createInstrumentsAndClaims davranış testi.
 *
 * createCase tx içinde OCR kambiyo enstrümanı → CaseInstrument (hukuki evrak) + bağlı
 * PRINCIPAL ClaimItem (parasal yansıma, instrumentId BAĞ). Kararlar:
 * docs/case-instrument-canonical-design.md
 *   AS1 flag gate · K1 (PRINCIPAL tek kaynak=instrument; çift-sayım yok) ·
 *   INVARIANT (FATURA/DIGER/eksik → sessiz create yok) · principalAmount toplamı.
 *
 * Helper saf olarak tx üzerinde çalışır (mapper + tx.caseInstrument/claimItem.create);
 * diğer dependency'lere dokunmaz → stub yeterli (case-create-claim-items.spec deseni).
 */

import { InstrumentType, ClaimItemType } from '@prisma/client';
import { CaseService } from '../case.service';
import { OcrInstrumentInputType, Currency, CaseInstrumentInputDto, CaseInstrumentSource } from '../dto/case.dto';

describe('CaseService.createInstrumentsAndClaims (N3-wire)', () => {
  const stub = {} as any;
  const writerRouter = {
    createSystemClaimItem: jest.fn(async ({ data }: any, tx: any) => tx.claimItem.create({ data })),
  } as any;
  // RFA-016: constructor 10 dep (prisma + 9 servis).
  const service = new CaseService(
    stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, undefined, writerRouter,
  );

  function mockTx() {
    const instruments: any[] = [];
    const claims: any[] = [];
    let seq = 0;
    const tx = {
      caseInstrument: {
        create: jest.fn(async ({ data }: any) => {
          const row = { ...data, id: `inst-${++seq}` };
          instruments.push(row);
          return row;
        }),
      },
      claimItem: {
        create: jest.fn(async ({ data }: any) => {
          claims.push(data);
          return data;
        }),
      },
    } as any;
    return { tx, instruments, claims };
  }

  const cek = (over: Partial<CaseInstrumentInputDto> = {}): CaseInstrumentInputDto =>
    ({
      type: OcrInstrumentInputType.CEK,
      amount: 1000,
      issueDate: '2026-01-10',
      documentNo: 'CK-1',
      currency: Currency.TRY,
      ...over,
    } as CaseInstrumentInputDto);

  // P03: originating human (6. arg) provenance; manualEnabled (7. arg, default false).
  const call = (tx: any, instruments: CaseInstrumentInputDto[], ocrEnabled: boolean, manualEnabled = false) =>
    (service as any).createInstrumentsAndClaims(
      tx, 'tenant-1', 'case-1', instruments, ocrEnabled, 'requester-1', manualEnabled,
    );

  it('flag KAPALI → hiçbir şey üretmez (legacy); 0 döner', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(tx, [cek()], false);
    expect(total).toBe(0);
    expect(instruments).toHaveLength(0);
    expect(claims).toHaveLength(0);
    expect(tx.caseInstrument.create).not.toHaveBeenCalled();
  });

  it('boş instruments[] → 0 (flag açık olsa da)', async () => {
    const { tx } = mockTx();
    expect(await call(tx, [], true)).toBe(0);
  });

  it('flag AÇIK + kambiyo → CaseInstrument + bağlı PRINCIPAL ClaimItem (instrumentId BAĞ)', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(
      tx,
      [cek({ documentNo: 'CK-1', amount: 1000 }), cek({ type: OcrInstrumentInputType.SENET, documentNo: 'SN-2', amount: 2000 })],
      true,
    );
    expect(instruments).toHaveLength(2);
    expect(instruments[0].instrumentType).toBe(InstrumentType.CEK);
    expect(instruments[1].instrumentType).toBe(InstrumentType.SENET);
    expect(claims).toHaveLength(2);
    expect(claims.every((c) => c.itemType === ClaimItemType.PRINCIPAL)).toBe(true);
    expect(claims[0].instrumentId).toBe('inst-1'); // K1 bağ: 1. ClaimItem → 1. CaseInstrument
    expect(claims[1].instrumentId).toBe('inst-2');
    expect(claims.every((c) => c.tenantId === 'tenant-1' && c.caseId === 'case-1')).toBe(true);
    expect(claims.every((c) => c.metadata?.dueSync === undefined)).toBe(true);
    expect(total).toBe(3000); // principalAmount'a eklenecek
  });

  it('INVARIANT: FATURA/DIGER VEYA eksik instrument → SESSİZ CREATE YOK (atlanır)', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(
      tx,
      [
        cek({ type: OcrInstrumentInputType.FATURA }), // kambiyo değil
        cek({ type: OcrInstrumentInputType.DIGER }), // kambiyo değil
        cek({ documentNo: '' }), // serialNo yok
        cek({ amount: 0 }), // amount yok
        cek({ currency: undefined }), // currency yok
        cek({ documentNo: 'CK-OK', amount: 500 }), // GEÇERLİ
      ],
      true,
    );
    expect(instruments).toHaveLength(1);
    expect(claims).toHaveLength(1);
    expect(instruments[0].serialNo).toBe('CK-OK');
    expect(claims[0].instrumentId).toBe('inst-1');
    expect(total).toBe(500); // yalnız geçerli olan
  });

  it('currency korunur (USD evrak → USD ClaimItem; sessiz TRY yok)', async () => {
    const { tx, instruments, claims } = mockTx();
    await call(tx, [cek({ currency: Currency.USD, documentNo: 'CK-USD', amount: 100 })], true);
    expect(instruments[0].currency).toBe('USD');
    expect(claims[0].currency).toBe('USD');
  });

  // ── PR-2b-1: per-source gate (OCR_MULTI_INSTRUMENT vs MANUAL_CASE_INSTRUMENTS, bağımsız) ──

  it('source TANIMSIZ → OCR/default: ocrEnabled=true üretir, false atlar (manual flag etkisiz)', async () => {
    const a = mockTx();
    await call(a.tx, [cek({ documentNo: 'CK-A' })], true, false);
    expect(a.instruments).toHaveLength(1); // source yok → OCR → ocrEnabled=true

    const b = mockTx();
    await call(b.tx, [cek({ documentNo: 'CK-B' })], false, true);
    expect(b.instruments).toHaveLength(0); // source yok → OCR → ocrEnabled=false (manual açık olsa da)
  });

  it('source=OCR + OCR_MULTI_INSTRUMENT kapalı → ATLANIR (manual açık olsa bile)', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(tx, [cek({ source: CaseInstrumentSource.OCR })], false, true);
    expect(instruments).toHaveLength(0);
    expect(claims).toHaveLength(0);
    expect(total).toBe(0);
  });

  // Fail-closed: MANUAL kalem web'de dues[]'tan çıkarıldığı için sessiz atlama = eksik anapara.
  it('source=MANUAL + MANUAL_CASE_INSTRUMENTS kapalı → REDDEDİLİR (kararlı kod), hiçbir kayıt yazılmaz (ocr açık olsa bile)', async () => {
    const { tx, instruments, claims } = mockTx();
    await expect(call(tx, [cek({ source: CaseInstrumentSource.MANUAL })], true, false)).rejects.toMatchObject({
      status: 400,
      response: { code: 'MANUAL_CASE_INSTRUMENTS_DISABLED', manualInstrumentCount: 1 },
    });
    expect(instruments).toHaveLength(0);
    expect(claims).toHaveLength(0);
    expect(tx.caseInstrument.create).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('source=MANUAL + MANUAL_CASE_INSTRUMENTS açık → ÜRETİLİR (OCR flag KAPALI olsa bile = O-1)', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(
      tx,
      [cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'CK-M', amount: 750 })],
      false, // OCR KAPALI
      true, // MANUAL AÇIK
    );
    expect(instruments).toHaveLength(1);
    expect(instruments[0].instrumentType).toBe(InstrumentType.CEK);
    expect(claims).toHaveLength(1);
    expect(claims[0].itemType).toBe(ClaimItemType.PRINCIPAL);
    expect(claims[0].instrumentId).toBe('inst-1'); // K1 bağ
    expect(total).toBe(750);
  });

  it('karışık OCR+MANUAL: manual kapalı → TÜM istek reddedilir (önce yazılan OCR da YOK); ocr kapalı → yalnız MANUAL', async () => {
    const a = mockTx(); // ocr açık, manual kapalı → MANUAL kalem sessizce düşmez; hiçbir kayıt yazılmaz
    await expect(
      call(
        a.tx,
        [
          cek({ source: CaseInstrumentSource.OCR, documentNo: 'O-1', amount: 100 }),
          cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-1', amount: 200 }),
        ],
        true, false,
      ),
    ).rejects.toMatchObject({ response: { code: 'MANUAL_CASE_INSTRUMENTS_DISABLED', manualInstrumentCount: 1 } });
    expect(a.instruments).toHaveLength(0); // kapı döngüden ÖNCE: OCR kaydı da yazılmadı
    expect(a.claims).toHaveLength(0);

    const b = mockTx(); // ocr kapalı, manual açık → yalnız MANUAL (OCR atlaması = mevcut davranış)
    const totalB = await call(
      b.tx,
      [
        cek({ source: CaseInstrumentSource.OCR, documentNo: 'O-2', amount: 100 }),
        cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-2', amount: 200 }),
      ],
      false, true,
    );
    expect(b.instruments).toHaveLength(1);
    expect(b.instruments[0].serialNo).toBe('M-2');
    expect(totalB).toBe(200);
  });

  it('her iki flag kapalı + yalnız OCR/tanımsız kaynak → hiçbir şey (legacy OCR atlaması KORUNUR)', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(tx, [cek({ source: CaseInstrumentSource.OCR }), cek()], false, false);
    expect(instruments).toHaveLength(0);
    expect(claims).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('her iki flag kapalı + karışık payload içinde MANUAL → REDDEDİLİR (MANUAL sayısı raporlanır)', async () => {
    const { tx, instruments, claims } = mockTx();
    await expect(
      call(
        tx,
        [
          cek({ source: CaseInstrumentSource.OCR }),
          cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-1' }),
          cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-2' }),
          cek(),
        ],
        false, false,
      ),
    ).rejects.toMatchObject({ response: { code: 'MANUAL_CASE_INSTRUMENTS_DISABLED', manualInstrumentCount: 2 } });
    expect(instruments).toHaveLength(0);
    expect(claims).toHaveLength(0);
  });

  it('çift-sayım yok: MANUAL instrument başına TAM 1 CaseInstrument + 1 PRINCIPAL ClaimItem (Due dokunulmaz)', async () => {
    const { tx, instruments, claims } = mockTx();
    await call(tx, [cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'CK-K1', amount: 999 })], false, true);
    expect(instruments).toHaveLength(1);
    expect(claims).toHaveLength(1); // yalnız instrument PRINCIPAL; dues yolu bu metoda dahil DEĞİL
    expect(claims[0].instrumentId).toBe('inst-1');
  });
});
