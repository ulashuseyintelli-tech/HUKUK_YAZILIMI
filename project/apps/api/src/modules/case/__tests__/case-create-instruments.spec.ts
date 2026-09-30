/**
 * PR-N3-wire — CaseService.createInstrumentsAndClaims davranış testi.
 *
 * createCase tx içinde OCR kambiyo enstrümanı → CaseInstrument (hukuki evrak) + bağlı
 * PRINCIPAL ClaimItem (parasal yansıma, instrumentId BAĞ). Kararlar:
 * docs/case-instrument-canonical-design.md
 *   AS1 flag gate · K1 (PRINCIPAL tek kaynak=instrument; çift-sayım yok) ·
 *   INVARIANT (FATURA/DIGER/eksik → sessiz create yok) · principalAmount toplamı.
 *   Fail-closed kabul: kaynağı kapalı (MANUAL/OCR) ya da işlenemeyen TEK kayıt → tüm istek 400,
 *   hiçbir kayıt yazılmaz (sessiz atlama = eksik anapara).
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

  /** Red + HİÇBİR kayıt yazılmadı (kapı döngüden ÖNCE). */
  const expectRejectedNothingWritten = async (
    m: ReturnType<typeof mockTx>,
    promise: Promise<unknown>,
    response: Record<string, unknown>,
  ) => {
    await expect(promise).rejects.toMatchObject({ status: 400, response });
    expect(m.instruments).toHaveLength(0);
    expect(m.claims).toHaveLength(0);
    expect(m.tx.caseInstrument.create).not.toHaveBeenCalled();
    expect(m.tx.claimItem.create).not.toHaveBeenCalled();
  };

  // Fail-closed (MANUAL + OCR): web evrak kaydını dues[]'a koymaz → sessiz atlama = eksik anapara.
  it('OCR flag KAPALI + kaynak tanımsız (OCR) → REDDEDİLİR OCR_CASE_INSTRUMENTS_DISABLED; hiçbir kayıt yok', async () => {
    const m = mockTx();
    await expectRejectedNothingWritten(m, call(m.tx, [cek()], false), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['OCR'],
      ocrInstrumentCount: 1,
      manualInstrumentCount: 0,
    });
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

  it('INVARIANT: FATURA/DIGER VEYA eksik instrument → sessiz create YOK ve sessiz ATLAMA da YOK: tüm istek reddedilir (geçerli olan da yazılmaz)', async () => {
    const m = mockTx();
    await expectRejectedNothingWritten(
      m,
      call(
        m.tx,
        [
          cek({ type: OcrInstrumentInputType.FATURA }), // kambiyo değil
          cek({ type: OcrInstrumentInputType.DIGER, source: CaseInstrumentSource.MANUAL }), // kambiyo değil
          cek({ documentNo: '' }), // serialNo yok
          cek({ amount: 0 }), // amount yok
          cek({ currency: undefined }), // currency yok
          cek({ documentNo: 'CK-OK', amount: 500 }), // GEÇERLİ — tek başına yazılmaz (kısmi açılış yok)
        ],
        true,
        true,
      ),
      {
        code: 'CASE_INSTRUMENT_UNPROCESSABLE',
        items: [
          { index: 0, source: 'OCR', type: 'FATURA', reason: 'NOT_KAMBIYO' },
          { index: 1, source: 'MANUAL', type: 'DIGER', reason: 'NOT_KAMBIYO' },
          { index: 2, source: 'OCR', type: 'CEK', reason: 'DOCUMENT_NO_MISSING' },
          { index: 3, source: 'OCR', type: 'CEK', reason: 'AMOUNT_NOT_POSITIVE' },
          { index: 4, source: 'OCR', type: 'CEK', reason: 'CURRENCY_MISSING' },
        ],
      },
    );
  });

  it('currency korunur (USD evrak → USD ClaimItem; sessiz TRY yok)', async () => {
    const { tx, instruments, claims } = mockTx();
    await call(tx, [cek({ currency: Currency.USD, documentNo: 'CK-USD', amount: 100 })], true);
    expect(instruments[0].currency).toBe('USD');
    expect(claims[0].currency).toBe('USD');
  });

  // ── PR-2b-1: per-source gate (OCR_MULTI_INSTRUMENT vs MANUAL_CASE_INSTRUMENTS, bağımsız) ──

  it('source TANIMSIZ → OCR/default: ocrEnabled=true üretir; false → REDDEDİLİR (manual açık olsa da; kaynak değiştirilmez)', async () => {
    const a = mockTx();
    await call(a.tx, [cek({ documentNo: 'CK-A' })], true, false);
    expect(a.instruments).toHaveLength(1); // source yok → OCR → ocrEnabled=true

    const b = mockTx();
    await expectRejectedNothingWritten(b, call(b.tx, [cek({ documentNo: 'CK-B' })], false, true), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      ocrInstrumentCount: 1,
    });
  });

  it('source=OCR + OCR_MULTI_INSTRUMENT kapalı → REDDEDİLİR (manual açık olsa bile)', async () => {
    const m = mockTx();
    await expectRejectedNothingWritten(m, call(m.tx, [cek({ source: CaseInstrumentSource.OCR })], false, true), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['OCR'],
      ocrInstrumentCount: 1,
      manualInstrumentCount: 0,
    });
  });

  it('source=MANUAL + MANUAL_CASE_INSTRUMENTS kapalı → REDDEDİLİR (kararlı kod), hiçbir kayıt yazılmaz (ocr açık olsa bile)', async () => {
    const m = mockTx();
    await expectRejectedNothingWritten(m, call(m.tx, [cek({ source: CaseInstrumentSource.MANUAL })], true, false), {
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['MANUAL'],
      manualInstrumentCount: 1,
      ocrInstrumentCount: 0,
    });
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

  it('karışık OCR+MANUAL: kapalı kaynaktaki TEK kayıt TÜM isteği reddeder (açık kaynaktaki kayıt da yazılmaz)', async () => {
    const mixed = () => [
      cek({ source: CaseInstrumentSource.OCR, documentNo: 'O-1', amount: 100 }),
      cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-1', amount: 200 }),
    ];
    const a = mockTx(); // ocr açık, manual kapalı
    await expectRejectedNothingWritten(a, call(a.tx, mixed(), true, false), {
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      manualInstrumentCount: 1,
      ocrInstrumentCount: 0,
    });
    const b = mockTx(); // ocr kapalı, manual açık
    await expectRejectedNothingWritten(b, call(b.tx, mixed(), false, true), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      manualInstrumentCount: 0,
      ocrInstrumentCount: 1,
    });
  });

  it('karışık OCR+MANUAL + her iki bayrak açık → ikisi de üretilir; PRINCIPAL toplamı doğru', async () => {
    const { tx, instruments, claims } = mockTx();
    const total = await call(
      tx,
      [
        cek({ source: CaseInstrumentSource.OCR, documentNo: 'O-3', amount: 100 }),
        cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-3', amount: 200 }),
      ],
      true, true,
    );
    expect(instruments.map((i) => i.serialNo)).toEqual(['O-3', 'M-3']);
    expect(claims.map((c) => [c.itemType, c.instrumentId])).toEqual([
      [ClaimItemType.PRINCIPAL, 'inst-1'],
      [ClaimItemType.PRINCIPAL, 'inst-2'],
    ]);
    expect(total).toBe(300);
  });

  it('her iki bayrak kapalı + karışık payload → CASE_INSTRUMENT_SOURCES_DISABLED (iki sayı da raporlanır)', async () => {
    const m = mockTx();
    await expectRejectedNothingWritten(
      m,
      call(
        m.tx,
        [
          cek({ source: CaseInstrumentSource.OCR }),
          cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-1' }),
          cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'M-2' }),
          cek(),
        ],
        false, false,
      ),
      {
        code: 'CASE_INSTRUMENT_SOURCES_DISABLED',
        disabledSources: ['MANUAL', 'OCR'],
        manualInstrumentCount: 2,
        ocrInstrumentCount: 2,
      },
    );
  });

  it('kaynak reddi, tür reddinden ÖNCE gelir (kapalı kaynakta FATURA → kaynak kodu)', async () => {
    const m = mockTx();
    await expectRejectedNothingWritten(
      m,
      call(m.tx, [cek({ type: OcrInstrumentInputType.FATURA })], false, true),
      { code: 'OCR_CASE_INSTRUMENTS_DISABLED' },
    );
  });

  it('çift-sayım yok: MANUAL instrument başına TAM 1 CaseInstrument + 1 PRINCIPAL ClaimItem (Due dokunulmaz)', async () => {
    const { tx, instruments, claims } = mockTx();
    await call(tx, [cek({ source: CaseInstrumentSource.MANUAL, documentNo: 'CK-K1', amount: 999 })], false, true);
    expect(instruments).toHaveLength(1);
    expect(claims).toHaveLength(1); // yalnız instrument PRINCIPAL; dues yolu bu metoda dahil DEĞİL
    expect(claims[0].instrumentId).toBe('inst-1');
  });
});
