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
import { OcrInstrumentInputType, Currency, CaseInstrumentInputDto } from '../dto/case.dto';

describe('CaseService.createInstrumentsAndClaims (N3-wire)', () => {
  const stub = {} as any;
  // RFA-016: constructor 10 dep (prisma + 9 servis).
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

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

  const call = (tx: any, instruments: CaseInstrumentInputDto[], enabled: boolean) =>
    (service as any).createInstrumentsAndClaims(tx, 'tenant-1', 'case-1', instruments, enabled);

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
});
