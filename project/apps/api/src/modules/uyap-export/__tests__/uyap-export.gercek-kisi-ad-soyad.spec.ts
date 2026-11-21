/**
 * F02 kabul K-3 (owner 22.11.2026) — UYAP e-Takip dışa aktarımı: gerçek kişi ad / soyad kapısı.
 *
 * Kural: resmî UYAP `exchange.dtd` (apps/api/src/modules/uyap/schemas/exchange.dtd) gerçek kişiyi
 * `kisiTumBilgileri (tcKimlikNo?, ad, soyad, …)` olarak tanımlar; `ad` ve `soyad` ZORUNLUDUR. Gerçek kişi taraf
 * (müvekkil PERSON / INDIVIDUAL, borçlu INDIVIDUAL) ad ve soyadı ayrı alanlarda kayıtlı değilse dışa aktarım AÇIK ve
 * anlaşılır hatayla DURUR; tam addan (`name`) tahminle bölme YAPILMAZ. Kurum / kamu / tereke yolları DEĞİŞMEZ.
 * İndirme uçları hata metnini `message` alanında verir (web istemcisi onu gösterir); toplu indirmede seçilen dosyalardan
 * biri bile hatalıysa hiçbir dosya indirilmez (sessiz atlama yok).
 * Değerler sentetik.
 */
import { HttpStatus } from '@nestjs/common';
import { UyapExportService } from '../uyap-export.service';
import { UyapExportController } from '../uyap-export.controller';

const client = (over: Record<string, unknown> = {}) => ({
  type: 'PERSON', firstName: 'Sentetik', lastName: 'Müvekkil', displayName: 'Sentetik Müvekkil', name: 'Sentetik Müvekkil',
  tckn: '10000000000', vkn: null, ...over,
});
const debtor = (over: Record<string, unknown> = {}) => ({
  type: 'INDIVIDUAL', firstName: 'Sentetik', lastName: 'Borçlu', name: 'Sentetik Borçlu', companyName: null,
  institutionName: null, tckn: null, vkn: null, identityNo: null, ...over,
});

function serviceWith(caseRow: any) {
  const prisma = { case: { findFirst: jest.fn(async () => caseRow), findMany: jest.fn(async () => [caseRow]) } };
  const mapper = { mapCasesToETakipDosyasi: jest.fn(async () => ({ takipTalepleri: [] })) };
  const xml = { buildXml: jest.fn(() => '<xml/>') };
  const service = new UyapExportService(prisma as any, xml as any, mapper as any, {} as any);
  return { service, mapper };
}
const caseRow = (clients: any[], debtors: any[]) => ({
  id: 'case-1', fileNumber: '2026/1', uyapBirimKodu: 'SENTETIK-001',
  caseClients: clients.map((c) => ({ client: c })),
  debtors: debtors.map((d) => ({ debtor: d })),
  dues: [{ id: 'due-1' }],
});

describe('K-3 — gerçek kişi ad / soyad kapısı (validateCaseForExport)', () => {
  it('[1] adı yalnız tam ad (`name`) olarak kayıtlı gerçek kişi borçlu → açık hata; dışa aktarım geçersiz', async () => {
    const { service } = serviceWith(caseRow([client()], [debtor({ firstName: null, lastName: null, name: 'Sentetik Borçlu Bir' })]));
    const r = await service.validateCaseForExport('case-1', 'tenant-a');
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' | ')).toContain('Borçlu "Sentetik Borçlu Bir": gerçek kişi ad ve soyadı ayrı alanlarda kayıtlı değil');
    expect(r.errors.join(' | ')).toContain('tam addan bölme yapılmaz');
  });

  it('[2] soyadı eksik gerçek kişi müvekkil (PERSON) → açık hata', async () => {
    const { service } = serviceWith(caseRow([client({ lastName: '  ' })], [debtor()]));
    const r = await service.validateCaseForExport('case-1', 'tenant-a');
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' | ')).toContain('Müvekkil "Sentetik Müvekkil": gerçek kişi ad ve soyadı ayrı alanlarda kayıtlı değil');
  });

  it('[3] kurum / kamu / tereke borçlu ve kurum müvekkil ad / soyad istemez (mevcut yol değişmedi)', async () => {
    const { service } = serviceWith(caseRow(
      [client({ type: 'COMPANY', firstName: null, lastName: null, companyName: 'Sentetik A.Ş.' })],
      [
        debtor({ type: 'COMPANY', firstName: null, lastName: null, companyName: 'Sentetik Ltd.' }),
        debtor({ type: 'PUBLIC_INSTITUTION', firstName: null, lastName: null, institutionName: 'Sentetik Kurum' }),
        debtor({ type: 'ESTATE', firstName: null, lastName: null, name: 'Sentetik Tereke' }),
      ],
    ));
    const r = await service.validateCaseForExport('case-1', 'tenant-a');
    expect(r.errors).toEqual([]);
    expect(r.isValid).toBe(true);
  });

  it('[4] ad ve soyadı tam gerçek kişiler → hata yok (eski INDIVIDUAL müvekkil dahil)', async () => {
    const { service } = serviceWith(caseRow([client(), client({ type: 'INDIVIDUAL' })], [debtor()]));
    const r = await service.validateCaseForExport('case-1', 'tenant-a');
    expect(r.errors).toEqual([]);
  });

  it('[5] tek dosya dışa aktarımı hatada XML üretmez (eşleyici çağrılmaz)', async () => {
    const { service, mapper } = serviceWith(caseRow([client()], [debtor({ firstName: null, lastName: null })]));
    const r = await service.exportSingleCase('case-1', 'tenant-a');
    expect(r.success).toBe(false);
    expect(r.xml).toBeUndefined();
    expect(mapper.mapCasesToETakipDosyasi).not.toHaveBeenCalled();
  });
});

describe('K-3 — indirme uçları hatayı açıkça verir', () => {
  const res = () => {
    const r: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> };
    r.status = jest.fn((c: number) => { r.statusCode = c; return r; });
    r.json = jest.fn((b: unknown) => { r.body = b; return r; });
    r.setHeader = jest.fn((k: string, v: string) => { r.headers[k] = v; });
    r.send = jest.fn((b: unknown) => { r.body = b; return r; });
    return r;
  };
  const user = { tenantId: 'tenant-a' } as any;

  it('[6] tek dosya indirme: 400 + hata metni `message` alanında', async () => {
    const errors = ['Borçlu "Sentetik Borçlu Bir": gerçek kişi ad ve soyadı ayrı alanlarda kayıtlı değil'];
    const svc = { exportSingleCase: jest.fn(async () => ({ success: false, errors, warnings: [] })) };
    const r = res();
    await new UyapExportController(svc as any).downloadSingle('case-1', user, r);
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(r.body.errors).toEqual(errors);
    expect(String(r.body.message)).toContain('Borçlu "Sentetik Borçlu Bir"');
    expect(r.send).not.toHaveBeenCalled();
  });

  it('[7] toplu indirme: seçilen dosyalardan biri hatalıysa XML gönderilmez; 400 + hangi dosya olduğu yazılır', async () => {
    const svc = {
      exportBatchCases: jest.fn(async () => ({
        success: true, xml: '<xml/>', fileName: 'x.xml', caseCount: 1, warnings: [],
        errors: ['2026/2: Borçlu "Sentetik Borçlu Bir": gerçek kişi ad ve soyadı ayrı alanlarda kayıtlı değil'],
      })),
    };
    const r = res();
    await new UyapExportController(svc as any).downloadBatch({ caseIds: ['c-1', 'c-2'] } as any, user, r);
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(String(r.body.message)).toContain('2026/2');
    expect(String(r.body.message)).toContain('hiçbir dosya indirilmedi');
    expect(r.send).not.toHaveBeenCalled();
  });

  it('[8] toplu indirme: bütün dosyalar geçerliyse XML gönderilir (davranış korunur)', async () => {
    const svc = { exportBatchCases: jest.fn(async () => ({ success: true, xml: '<xml/>', fileName: 'x.xml', caseCount: 2, warnings: [] })) };
    const r = res();
    await new UyapExportController(svc as any).downloadBatch({ caseIds: ['c-1', 'c-2'] } as any, user, r);
    expect(r.statusCode).toBe(200);
    expect(r.send).toHaveBeenCalledWith('<xml/>');
  });
});
