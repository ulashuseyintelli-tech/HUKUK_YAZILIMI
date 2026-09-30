/**
 * MANUAL kambiyo kabul kapısı — CaseService.create() düzeyi (fail-closed, tx ÖNCESİ).
 *
 * Kusur: web `NEXT_PUBLIC_MANUAL_CASE_INSTRUMENTS` açıkken çek/senet kalemlerini dues[]'tan çıkarıp
 * instruments[]'a `source: MANUAL` olarak taşır; API'de `MANUAL_CASE_INSTRUMENTS` kapalıyken bu
 * kayıtlar SESSİZCE atlanıyordu → çek bedeli ne CaseInstrument ne PRINCIPAL ClaimItem ne Due olarak
 * yazılıyor, dosya eksik anapara ile açılıyordu.
 *
 * Bu testin ASIL DEĞERİ "400 döndü" değil; reddin HİÇBİR sorgu/taraf yaratımı/transaction
 * başlamadan verildiğini (dosya hiç oluşmaz) ve OCR kaynağının etkilenmediğini kanıtlamaktır.
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

const instrument = (source?: CaseInstrumentSource, documentNo = 'CK-1') => ({
  type: OcrInstrumentInputType.CEK,
  amount: 20000,
  issueDate: '2026-01-10',
  documentNo,
  currency: Currency.TRY,
  ...(source ? { source } : {}),
});

const dtoWith = (instruments: any[]): any => ({
  fileNumber: '2026/1',
  type: 'GENERAL_EXECUTION',
  sorumluPersonelId: 'user-x',
  creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' }],
  lawyers: [{ name: 'Av. Mehmet', surname: 'Kaya', barNumber: '5555' }],
  instruments,
});

describe('MANUAL_CASE_INSTRUMENTS kapalı → POST /cases MANUAL kayıtla fail-closed (tx öncesi)', () => {
  const saved = process.env.MANUAL_CASE_INSTRUMENTS;
  afterEach(() => {
    if (saved === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = saved;
  });

  it.each([
    ['tanımsız', undefined],
    ['"false"', 'false'],
    ['"TRUE" (yalnız tam "true" açar)', 'TRUE'],
  ])('bayrak %s + MANUAL kayıt → 400 MANUAL_CASE_INSTRUMENTS_DISABLED; hiçbir sorgu/taraf/tx YOK', async (_label, value) => {
    if (value === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = value;
    const { svc, prisma, clientService, lawyerService, debtorService } = build();

    const err = await svc
      .create('tenant-1', dtoWith([instrument(CaseInstrumentSource.MANUAL)]), 'user-1')
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toEqual({
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      message: expect.stringContaining('takip oluşturulmadı'),
      manualInstrumentCount: 1,
    });
    // Dosya HİÇ oluşmaz: kapı tüm DB okuma/yazmalarından ve transaction'dan ÖNCE.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(clientService.create).not.toHaveBeenCalled();
    expect(lawyerService.create).not.toHaveBeenCalled();
    expect(debtorService.create).not.toHaveBeenCalled();
  });

  it('karışık OCR + MANUAL → yine reddedilir (MANUAL sayısı raporlanır)', async () => {
    delete process.env.MANUAL_CASE_INSTRUMENTS;
    const { svc, prisma } = build();
    const err = await svc
      .create(
        'tenant-1',
        dtoWith([
          instrument(),
          instrument(CaseInstrumentSource.MANUAL, 'M-1'),
          instrument(CaseInstrumentSource.MANUAL, 'M-2'),
        ]),
        'user-1',
      )
      .catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'MANUAL_CASE_INSTRUMENTS_DISABLED', manualInstrumentCount: 2 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Negatif kontroller: kapı yalnız MANUAL + kapalı bayrakta keser (aksi halde 409 ön-kontrolüne ulaşılır).
  it('bayrak "true" + MANUAL kayıt → kapı GEÇER (sonraki ön-kontrole ulaşır)', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const { svc, prisma } = build();
    await expect(
      svc.create('tenant-1', dtoWith([instrument(CaseInstrumentSource.MANUAL)]), 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.case.findFirst).toHaveBeenCalled();
  });

  it.each([
    ['source tanımsız (OCR varsayılanı)', [instrument()]],
    ['source OCR', [instrument(CaseInstrumentSource.OCR)]],
    ['instruments boş', []],
  ])('bayrak kapalı + %s → kapı GEÇER (OCR davranışı DEĞİŞMEDİ)', async (_label, instruments) => {
    delete process.env.MANUAL_CASE_INSTRUMENTS;
    const { svc, prisma } = build();
    await expect(svc.create('tenant-1', dtoWith(instruments), 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.case.findFirst).toHaveBeenCalled();
  });

  it('instruments alanı hiç yok → kapı GEÇER', async () => {
    delete process.env.MANUAL_CASE_INSTRUMENTS;
    const { svc } = build();
    const dto = dtoWith([]);
    delete dto.instruments;
    await expect(svc.create('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
