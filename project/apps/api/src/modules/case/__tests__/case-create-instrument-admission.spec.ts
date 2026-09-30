/**
 * Evrak kabul kapısı — CaseService.create() düzeyi (fail-closed, tx ÖNCESİ), MANUAL + OCR.
 *
 * Kusur: web evrak kaydını dues[]'a koymadan instruments[]'a taşır (manuel çek/senet: `source: MANUAL`;
 * çoklu OCR evrakı: source yok/OCR). API ilgili bayrak (`MANUAL_CASE_INSTRUMENTS` / `OCR_MULTI_INSTRUMENT`)
 * kapalıyken ya da kayıt CaseInstrument'a dönüştürülemiyorken (FATURA/DIGER, zorunlu alan eksik) kaydı
 * SESSİZCE atlıyordu → bedel ne CaseInstrument ne PRINCIPAL ClaimItem ne Due olarak yazılıyor, dosya
 * eksik anapara ile açılıyordu.
 *
 * Bu testin ASIL DEĞERİ "400 döndü" değil; reddin HİÇBİR sorgu / taraf yaratımı / transaction başlamadan
 * verildiğini (dosya hiç oluşmaz) ve evraksız ya da bayrağı açık isteklerin etkilenmediğini kanıtlamaktır.
 */

import { BadRequestException, ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';
import { CaseInstrumentSource, Currency, OcrInstrumentInputType } from '../dto/case.dto';

const stub = {} as any;

function build() {
  // fileNumber ön-kontrolü mükerrer döndürür → kapıyı GEÇEN istek 409 ile durur (tx'e girmez).
  const prisma = {
    case: { findFirst: jest.fn(async () => ({ id: 'existing-case' })) },
    // sorumlu personel tx-öncesi doğrulaması (ilk DB okuması) — geçerli kullanıcı döner.
    user: { findFirst: jest.fn(async () => ({ id: 'user-x' })) },
    $transaction: jest.fn(),
  };
  const clientService = { create: jest.fn() };
  const lawyerService = { create: jest.fn() };
  const debtorService = { create: jest.fn() };
  const svc = new CaseService(
    prisma as any,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    clientService as any,
    lawyerService as any,
    debtorService as any,
  );
  return { svc, prisma, clientService, lawyerService, debtorService };
}

const instrument = (source?: CaseInstrumentSource, over: Record<string, unknown> = {}) => ({
  type: OcrInstrumentInputType.CEK,
  amount: 20000,
  issueDate: '2026-01-10',
  documentNo: 'CK-1',
  currency: Currency.TRY,
  ...(source ? { source } : {}),
  ...over,
});

const dtoWith = (instruments: any[]): any => ({
  fileNumber: '2026/1',
  type: 'GENERAL_EXECUTION',
  sorumluPersonelId: 'user-x',
  creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' }],
  lawyers: [{ name: 'Av. Mehmet', surname: 'Kaya', barNumber: '5555' }],
  instruments,
});

const FLAGS = ['MANUAL_CASE_INSTRUMENTS', 'OCR_MULTI_INSTRUMENT'] as const;

function setFlags(flags: { manual?: string; ocr?: string }) {
  const apply = (key: string, value?: string) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  apply('MANUAL_CASE_INSTRUMENTS', flags.manual);
  apply('OCR_MULTI_INSTRUMENT', flags.ocr);
}

async function expectRejectedBeforeAnyQuery(dto: any, response: Record<string, unknown>) {
  const { svc, prisma, clientService, lawyerService, debtorService } = build();
  const err = await svc.create('tenant-1', dto, 'user-1').catch((e) => e);
  expect(err).toBeInstanceOf(BadRequestException);
  expect(err.getStatus()).toBe(400);
  expect(err.getResponse()).toMatchObject(response);
  expect(err.getResponse().message).toEqual(expect.stringContaining('takip oluşturulmadı'));
  // Dosya HİÇ oluşmaz: kapı tüm DB okuma/yazmalarından ve transaction'dan ÖNCE.
  expect(prisma.user.findFirst).not.toHaveBeenCalled();
  expect(prisma.case.findFirst).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(clientService.create).not.toHaveBeenCalled();
  expect(lawyerService.create).not.toHaveBeenCalled();
  expect(debtorService.create).not.toHaveBeenCalled();
}

async function expectPassesGate(dto: any) {
  const { svc, prisma } = build();
  await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  expect(prisma.case.findFirst).toHaveBeenCalled(); // kapıdan geçti, sonraki ön-kontrole ulaştı
}

describe('Evrak kabul kapısı — POST /cases MANUAL + OCR fail-closed (tx öncesi)', () => {
  const saved = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of FLAGS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it.each([
    ['tanımsız', undefined],
    ['"false"', 'false'],
    ['"TRUE" (yalnız tam "true" açar)', 'TRUE'],
  ])('MANUAL bayrağı %s + MANUAL kayıt → 400 MANUAL_CASE_INSTRUMENTS_DISABLED; hiçbir sorgu/taraf/tx YOK', async (_l, value) => {
    setFlags({ manual: value, ocr: 'true' });
    await expectRejectedBeforeAnyQuery(dtoWith([instrument(CaseInstrumentSource.MANUAL)]), {
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['MANUAL'],
      manualInstrumentCount: 1,
      ocrInstrumentCount: 0,
    });
  });

  it.each([
    ['source tanımsız (OCR varsayılanı)', undefined],
    ['source OCR', CaseInstrumentSource.OCR],
  ])('OCR bayrağı kapalı + %s → 400 OCR_CASE_INSTRUMENTS_DISABLED; hiçbir sorgu/taraf/tx YOK (doğrudan API / bayrak kapandıktan sonra gönderilen taslak)', async (_l, source) => {
    setFlags({ manual: 'true', ocr: undefined });
    await expectRejectedBeforeAnyQuery(dtoWith([instrument(source as any)]), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['OCR'],
      manualInstrumentCount: 0,
      ocrInstrumentCount: 1,
    });
  });

  it('karışık OCR + MANUAL, iki bayrak kapalı → CASE_INSTRUMENT_SOURCES_DISABLED (iki sayı da)', async () => {
    setFlags({});
    await expectRejectedBeforeAnyQuery(
      dtoWith([
        instrument(),
        instrument(CaseInstrumentSource.MANUAL, { documentNo: 'M-1' }),
        instrument(CaseInstrumentSource.MANUAL, { documentNo: 'M-2' }),
      ]),
      { code: 'CASE_INSTRUMENT_SOURCES_DISABLED', disabledSources: ['MANUAL', 'OCR'], manualInstrumentCount: 2, ocrInstrumentCount: 1 },
    );
  });

  it('karışık OCR + MANUAL, yalnız biri kapalı → yine TÜM istek reddedilir', async () => {
    setFlags({ manual: 'true' });
    await expectRejectedBeforeAnyQuery(
      dtoWith([instrument(CaseInstrumentSource.MANUAL), instrument(CaseInstrumentSource.OCR, { documentNo: 'O-1' })]),
      { code: 'OCR_CASE_INSTRUMENTS_DISABLED', ocrInstrumentCount: 1, manualInstrumentCount: 0 },
    );
  });

  it('bayraklar açık + işlenemeyen kayıt (FATURA) → 400 CASE_INSTRUMENT_UNPROCESSABLE; geçerli çek de yazılmaz', async () => {
    setFlags({ manual: 'true', ocr: 'true' });
    await expectRejectedBeforeAnyQuery(
      dtoWith([instrument(CaseInstrumentSource.OCR), instrument(CaseInstrumentSource.OCR, { type: OcrInstrumentInputType.FATURA, documentNo: 'FT-1' })]),
      { code: 'CASE_INSTRUMENT_UNPROCESSABLE', items: [{ index: 1, source: 'OCR', type: 'FATURA', reason: 'NOT_KAMBIYO' }] },
    );
  });

  // Negatif kontroller: kapı yalnız kapalı kaynak / işlenemeyen kayıtta keser.
  it.each([
    ['MANUAL, bayrak "true"', { manual: 'true' }, [instrument(CaseInstrumentSource.MANUAL)]],
    ['OCR (tanımsız), bayrak "true"', { ocr: 'true' }, [instrument()]],
    ['karışık, iki bayrak "true"', { manual: 'true', ocr: 'true' }, [instrument(), instrument(CaseInstrumentSource.MANUAL, { documentNo: 'M-9' })]],
    ['evraksız (instruments boş), iki bayrak kapalı', {}, []],
  ])('%s → kapı GEÇER', async (_l, flags, instruments) => {
    setFlags(flags as any);
    await expectPassesGate(dtoWith(instruments as any[]));
  });

  it('evraksız (instruments alanı hiç yok), iki bayrak kapalı → kapı GEÇER (mevcut açılış etkilenmez)', async () => {
    setFlags({});
    const dto = dtoWith([]);
    delete dto.instruments;
    await expectPassesGate(dto);
  });
});
