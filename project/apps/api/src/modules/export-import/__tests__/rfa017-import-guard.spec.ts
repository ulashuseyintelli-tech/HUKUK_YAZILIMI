/**
 * RFA-017 — Excel client import duplicate-guard bypass kapanışı.
 *
 * Eskiden importClientsFromExcel düz `prisma.client.create` çağırıyordu → ClientService.create
 * duplicate-guard'ı (tckn/vkn dedup + soft-delete reactivate) BYPASS ediliyordu → re-import'ta
 * sessiz duplicate (Client'ta tckn/vkn UNIQUE yok). Fix: import artık guard'lı ClientService.create'e
 * delege eder (guard tek-kaynak, replike YOK).
 *
 * Bu test importun:
 *  - prisma.client.create DEĞİL, clientService.create çağırdığını (delegasyon),
 *  - tenantId'yi doğru geçtiğini (tenant izolasyonu ClientService'in tenant-scoped guard'ında),
 *  - genişletilen mevcut Client kolonlarını (isForeigner/nationality/companyType/mersisNo/
 *    ticaretSicilNo/postalCode) data'da taşıdığını
 * doğrular. Gerçek DB-count (re-import→tek client, reactivate, alan persist) ayrıca canlı e2e ile.
 */

import * as ExcelJS from 'exceljs';
import { ExportImportService } from '../export-import.service';

async function buildExcelBuffer(rows: (string | undefined)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Müvekkiller');
  // Satır 1 = başlık (import i=2'den başlar)
  ws.addRow(['Tip', 'Ad', 'Soyad', 'TCKN', 'Cinsiyet', 'Doğum', 'Yabancı', 'Uyruk', 'Kurum', 'VKN', 'Vergi D.', 'Şirket Tipi', 'MERSİS', 'Tic.Sicil', 'Kuruluş', 'Telefon', 'E-posta', 'Adres', 'İl', 'İlçe', 'Posta', 'Tahsil', 'Feragat', 'Sulh', 'Serbest', 'Not']);
  for (const r of rows) ws.addRow(r);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

describe('RFA-017 importClientsFromExcel — guard delegasyonu', () => {
  it('geçerli satır → prisma DEĞİL clientService.create çağrılır; tenantId + genişletilen alanlar geçer', async () => {
    const prisma = { client: { create: jest.fn() } } as any; // çağrılmamalı
    const clientService = { create: jest.fn(async (_t: string, _d: any) => ({ id: 'c1' })) } as any;
    const svc = new ExportImportService(prisma, clientService);

    // PERSON satırı: col7 Yabancı=EVET, col8 Uyruk=Alman, col12 ŞirketTipi (boş), col13 MERSİS, col21 Posta=34000
    const buf = await buildExcelBuffer([
      ['PERSON', 'Ahmet', 'Yılmaz', '11111111111', 'E', undefined, 'EVET', 'Alman', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, '34000'],
    ]);

    const result = await svc.importClientsFromExcel('tenant-1', buf);

    expect(result.success).toBe(1);
    expect(prisma.client.create).not.toHaveBeenCalled(); // bypass kapandı
    expect(clientService.create).toHaveBeenCalledTimes(1);
    const [tenantArg, dataArg] = clientService.create.mock.calls[0];
    expect(tenantArg).toBe('tenant-1'); // tenant izolasyonu guard'a doğru tenantId ile gider
    expect(dataArg.tckn).toBe('11111111111');
    expect(dataArg.firstName).toBe('Ahmet');
    expect(dataArg.lastName).toBe('Yılmaz');
    expect(dataArg.isForeigner).toBe(true);      // parseBoolean(EVET)
    expect(dataArg.nationality).toBe('Alman');
    expect(dataArg.postalCode).toBe('34000');
  });

  it('COMPANY satırı → vkn + companyType/mersisNo/ticaretSicilNo data\'da taşınır', async () => {
    const clientService = { create: jest.fn(async (_t: string, _d: any) => ({ id: 'c2' })) } as any;
    const svc = new ExportImportService({} as any, clientService);

    const buf = await buildExcelBuffer([
      ['COMPANY', undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'ACME A.Ş.', '1234567890', 'Büyük VD', 'Anonim', 'MERSIS-1', 'TS-1', undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    ]);

    const result = await svc.importClientsFromExcel('tenant-1', buf);

    expect(result.success).toBe(1);
    const dataArg = clientService.create.mock.calls[0][1];
    expect(dataArg.vkn).toBe('1234567890');
    expect(dataArg.companyName).toBe('ACME A.Ş.');
    expect(dataArg.companyType).toBe('Anonim');
    expect(dataArg.mersisNo).toBe('MERSIS-1');
    expect(dataArg.ticaretSicilNo).toBe('TS-1');
  });

  it('zorunlu alan eksik (PERSON ad/soyad yok) → clientService.create çağrılmaz, errors\'a düşer', async () => {
    const clientService = { create: jest.fn() } as any;
    const svc = new ExportImportService({} as any, clientService);

    const buf = await buildExcelBuffer([['PERSON', undefined, undefined, '22222222222']]);

    const result = await svc.importClientsFromExcel('tenant-1', buf);

    expect(result.success).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(clientService.create).not.toHaveBeenCalled();
  });

  // P0.6 — import actor attribution: AuditLog.userId null kalmasın diye actor create'e threadlenir.
  it('P0.6: actorUserId verilince clientService.create 3. argümanda {userId} ile çağrılır', async () => {
    const clientService = { create: jest.fn(async () => ({ id: 'c1' })) } as any;
    const svc = new ExportImportService({} as any, clientService);
    const buf = await buildExcelBuffer([['PERSON', 'Ahmet', 'Yılmaz', '11111111111']]);
    await svc.importClientsFromExcel('tenant-1', buf, 'user-42');
    expect(clientService.create.mock.calls[0][2]).toEqual({ userId: 'user-42' });
  });

  it('P0.6: actorUserId yoksa create 3. argüman undefined (regresyon yok)', async () => {
    const clientService = { create: jest.fn(async () => ({ id: 'c1' })) } as any;
    const svc = new ExportImportService({} as any, clientService);
    const buf = await buildExcelBuffer([['PERSON', 'Ahmet', 'Yılmaz', '11111111111']]);
    await svc.importClientsFromExcel('tenant-1', buf);
    expect(clientService.create.mock.calls[0][2]).toBeUndefined();
  });
});
