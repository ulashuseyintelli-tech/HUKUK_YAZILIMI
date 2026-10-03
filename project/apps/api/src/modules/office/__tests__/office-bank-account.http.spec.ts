/**
 * OFFICE-BANK-ACCOUNT — banka hesabı uçları için GERÇEK Nest HTTP zinciri (DB YOK).
 *
 * Zincir: gerçek `OfficeF01AuthorizationGuard` + gerçek `OfficeApprovalService` yüklemi + main.ts'in AYNI global
 * `ValidationPipe`ı (whitelist + forbidNonWhitelisted + transform) + gerçek `OfficeController` + gerçek `OfficeService`
 * (yalnız prisma / denetim sahte). Ölçülen şey, persist katmanına GERÇEKTEN ne ulaştığıdır — yalnız DTO metadata'sı değil.
 *
 * Owner kararı 2026-10-03 (madde 6): gövde sınırı · okuma yüzeyi B (kimlik + varsayılan + MASKELİ IBAN) · Düzenle mevcut
 * hesabı günceller (değişmeyen alanlar korunur) · maskeli / boş IBAN gerçek IBAN diye kaydedilmez · varsayılan hesabı yazan
 * bütün yollar büro satırı kilidi altında tek işlemde çalışır · ilk hesabın otomatik varsayılan olması gibi YENİ politika yok.
 *
 * Kanıt sınıfı: TEST. Eşzamanlılığın gerçek veritabanında kapandığı ayrıca DB-gated testle
 * (office-bank-default-race.db-gated.integration.spec.ts) kanıtlanır.
 */
import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { OfficeController } from '../office.controller';
import { OfficeService } from '../office.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';

const OFFICE = 'office-A';
const REAL_IBAN = 'TR330006100519786457841326';
const MASKED_IBAN = 'TR33****1326';

type ActorRow = {
  id: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  lawyer: { lawyerRank: string; canApproveOfficeActions: boolean } | null;
};
const ACTORS: Record<string, ActorRow> = {
  admin: { id: 'u-admin', role: 'ADMIN', lawyer: null },
  partner: { id: 'u-p', role: 'USER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  'plain-lawyer': { id: 'u-l', role: 'USER', lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } },
  'viewer-partner': { id: 'u-vp', role: 'VIEWER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
};

/** TEST-ONLY JWT yerine geçen guard: `x-test-actor` başlığı → `request.user`. */
@Injectable()
class TestActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-test-actor'] as string | undefined;
    if (!key || !ACTORS[key]) throw new UnauthorizedException();
    const a = ACTORS[key];
    req.user = { id: a.id, tenantId: 'tenant-A', role: a.role };
    return true;
  }
}

const OWN_ACCOUNT = {
  id: 'acc-1', officeId: OFFICE, bankName: 'Ziraat', branchName: 'Merkez', iban: REAL_IBAN, accountName: 'Büro Hesabı', isDefault: false,
};
const OFFICE_ROW = {
  id: OFFICE, tenantId: 'tenant-A', name: 'Büro', smtpPass: null, smsApiKey: null, smsApiSecret: null,
  escalationManagerLawyerIds: [], escalationFounderLawyerIds: [], opStaffTypes: [], bankAccounts: [OWN_ACCOUNT], lawyers: [],
};

describe('OFFICE banka hesabı uçları — gerçek HTTP zincirinde sözleşme', () => {
  let app: INestApplication;
  /** Sıralı olay günlüğü: kilit İLK ifade mi, varsayılan temizliği yazmadan önce mi? */
  const events: string[] = [];

  const tx = {
    $queryRaw: jest.fn(async () => { events.push('lock'); return [{ id: OFFICE }]; }),
    officeBankAccount: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; officeId: string } }) => {
        events.push('tx.findFirst');
        return where.id === OWN_ACCOUNT.id && where.officeId === OFFICE ? { ...OWN_ACCOUNT } : null;
      }),
      updateMany: jest.fn(async () => { events.push('tx.updateMany'); return { count: 1 }; }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { events.push('tx.create'); return { id: 'acc-new', isDefault: false, ...data }; }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { events.push('tx.update'); return { ...OWN_ACCOUNT, ...data, id: where.id }; }),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const a = Object.values(ACTORS).find((x) => x.id === where.id);
        if (!a) return null;
        return { role: a.role, isActive: true, tenantId: 'tenant-A', staffMember: null, lawyer: a.lawyer ? { officeId: OFFICE, ...a.lawyer } : null };
      }),
    },
    office: { findUnique: jest.fn(async () => OFFICE_ROW) },
    officeBankAccount: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; officeId: string } }) =>
        where.id === OWN_ACCOUNT.id && where.officeId === OFFICE ? { ...OWN_ACCOUNT } : null),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => ({ ...OWN_ACCOUNT, id: where.id })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => { events.push('begin'); return fn(tx); }),
  };
  const audit = { log: jest.fn() };

  const txWrites = () =>
    tx.officeBankAccount.create.mock.calls.length + tx.officeBankAccount.update.mock.calls.length + tx.officeBankAccount.updateMany.mock.calls.length;
  const anyWrites = () => txWrites() + prisma.officeBankAccount.delete.mock.calls.length;

  beforeAll(async () => {
    const approval = new OfficeApprovalService(prisma as any, { log: jest.fn() } as any);
    const service = new OfficeService(prisma as any, audit as any, approval);
    const moduleRef = await Test.createTestingModule({
      controllers: [OfficeController],
      providers: [
        { provide: OfficeService, useValue: service },
        { provide: OfficeApprovalService, useValue: approval },
        { provide: GuidedOpenObserveService, useValue: { observe: jest.fn() } },
        OfficeF01AuthorizationGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestActorGuard)
      .compile();
    app = moduleRef.createNestApplication();
    // main.ts ile AYNI global pipe.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    events.length = 0;
    for (const m of [tx.$queryRaw, ...Object.values(tx.officeBankAccount), prisma.officeBankAccount.findFirst, prisma.officeBankAccount.delete, prisma.$transaction, audit.log]) {
      (m as jest.Mock).mockClear();
    }
  });

  const post = (body: unknown, actor = 'partner') => request(app.getHttpServer()).post('/office/bank-accounts').set('x-test-actor', actor).send(body as object);
  const put = (id: string, body: unknown, actor = 'partner') => request(app.getHttpServer()).put(`/office/bank-accounts/${id}`).set('x-test-actor', actor).send(body as object);
  const del = (id: string, actor = 'partner') => request(app.getHttpServer()).delete(`/office/bank-accounts/${id}`).set('x-test-actor', actor);

  describe('POST /office/bank-accounts', () => {
    const valid = { bankName: 'Yeni Banka', branchName: 'Şube', iban: REAL_IBAN, accountName: 'Sahip', isDefault: true };

    it('geçerli istek → 201; persist katmanına YALNIZ beş alan + sunucudan officeId ulaşır', async () => {
      const res = await post(valid);
      expect(res.status).toBe(201);
      expect(tx.officeBankAccount.create).toHaveBeenCalledTimes(1);
      expect(tx.officeBankAccount.create.mock.calls[0][0]).toEqual({
        data: { officeId: OFFICE, bankName: 'Yeni Banka', branchName: 'Şube', iban: REAL_IBAN, accountName: 'Sahip', isDefault: true },
      });
    });

    it('yanıt = kimlik + varsayılan + MASKELİ IBAN (+ officeId); banka adı / şube / hesap sahibi / tam IBAN yok', async () => {
      const res = await post(valid);
      expect(res.body).toEqual({ officeId: OFFICE, id: 'acc-new', isDefault: true, iban: MASKED_IBAN });
      expect(JSON.stringify(res.body)).not.toContain(REAL_IBAN);
    });

    it('varsayılan yazan yol kilitli işlemde çalışır: işlemin İLK ifadesi büro satırı kilidi, temizlik yazmadan ÖNCE', async () => {
      await post(valid);
      expect(events).toEqual(['begin', 'lock', 'tx.updateMany', 'tx.create']);
    });

    it('isDefault gönderilmezse varsayılan temizliği YOK ve ilk hesap otomatik varsayılan OLMAZ (yeni politika yok)', async () => {
      const res = await post({ bankName: 'B', iban: REAL_IBAN });
      expect(res.status).toBe(201);
      expect(tx.officeBankAccount.updateMany).not.toHaveBeenCalled();
      expect(tx.officeBankAccount.create.mock.calls[0][0].data).toEqual({ officeId: OFFICE, bankName: 'B', iban: REAL_IBAN });
      expect(res.body.isDefault).toBe(false);
    });

    it('IBAN kenar boşlukları kırpılır', async () => {
      await post({ bankName: 'B', iban: `  ${REAL_IBAN}  ` });
      expect(tx.officeBankAccount.create.mock.calls[0][0].data.iban).toBe(REAL_IBAN);
    });

    it.each([
      ['officeId (başka büro)', { ...valid, officeId: 'office-VICTIM' }],
      ['id', { ...valid, id: 'x' }],
      ['tenantId', { ...valid, tenantId: 'tenant-VICTIM' }],
      ['createdAt', { ...valid, createdAt: '2099-01-01T00:00:00.000Z' }],
      ['ilişki nesnesi', { ...valid, office: { connect: { id: 'office-VICTIM' } } }],
      ['bilinmeyen alan', { ...valid, unknownField: 1 }],
    ])('yasak anahtar: %s → 400; HİÇ işlem, HİÇ yazma', async (_ad, body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(anyWrites()).toBe(0);
    });

    it.each([
      ['IBAN yok', { bankName: 'B' }],
      ['IBAN boş', { bankName: 'B', iban: '' }],
      ['IBAN yalnız boşluk', { bankName: 'B', iban: '   ' }],
      ['IBAN maskeli (*)', { bankName: 'B', iban: MASKED_IBAN }],
      ['IBAN maskeli (•)', { bankName: 'B', iban: 'TR33••••••1326' }],
      ['IBAN null', { bankName: 'B', iban: null }],
      ['IBAN metin değil', { bankName: 'B', iban: 123 }],
      ['banka adı yok', { iban: REAL_IBAN }],
      ['isDefault metin', { bankName: 'B', iban: REAL_IBAN, isDefault: 'evet' }],
      ['isDefault null', { bankName: 'B', iban: REAL_IBAN, isDefault: null }],
    ])('geçersiz gövde: %s → 400 (önceden 201 / 500); HİÇ yazma', async (_ad, body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(anyWrites()).toBe(0);
    });

    it('VIEWER (PARTNER avukatlı) → 403; F01 yetkisiz avukat → 403; HİÇ yazma', async () => {
      expect((await post(valid, 'viewer-partner')).status).toBe(403);
      expect((await post(valid, 'plain-lawyer')).status).toBe(403);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(anyWrites()).toBe(0);
    });
  });

  describe('PUT /office/bank-accounts/:id', () => {
    it('Düzenle MEVCUT hesabı günceller; gönderilmeyen alan (şube, hesap sahibi, IBAN) YAZILMAZ', async () => {
      const res = await put('acc-1', { isDefault: true });
      expect(res.status).toBe(200);
      expect(tx.officeBankAccount.create).not.toHaveBeenCalled();
      expect(tx.officeBankAccount.update.mock.calls[0][0]).toEqual({ where: { id: 'acc-1' }, data: { isDefault: true } });
      expect(res.body).toEqual({ officeId: OFFICE, id: 'acc-1', isDefault: true, iban: MASKED_IBAN });
    });

    it('varsayılan yapma: kilit İLK ifade, sahiplik kilit altında, diğerlerinin varsayılanı yazmadan ÖNCE kalkar', async () => {
      await put('acc-1', { isDefault: true });
      expect(events).toEqual(['begin', 'lock', 'tx.findFirst', 'tx.updateMany', 'tx.update']);
      expect(tx.officeBankAccount.updateMany.mock.calls[0][0]).toEqual({ where: { officeId: OFFICE, id: { not: 'acc-1' } }, data: { isDefault: false } });
    });

    it('yalnız banka adı → data yalnız { bankName }', async () => {
      await put('acc-1', { bankName: 'Yeni Ad' });
      expect(tx.officeBankAccount.update.mock.calls[0][0].data).toEqual({ bankName: 'Yeni Ad' });
      expect(tx.officeBankAccount.updateMany).not.toHaveBeenCalled();
    });

    it('geçerli tam IBAN yazılır (kırpılmış)', async () => {
      await put('acc-1', { iban: ` ${REAL_IBAN} ` });
      expect(tx.officeBankAccount.update.mock.calls[0][0].data).toEqual({ iban: REAL_IBAN });
    });

    it('isDefault:false varsayılan temizliği tetiklemez', async () => {
      await put('acc-1', { isDefault: false });
      expect(tx.officeBankAccount.updateMany).not.toHaveBeenCalled();
      expect(tx.officeBankAccount.update.mock.calls[0][0].data).toEqual({ isDefault: false });
    });

    it.each([
      ['IBAN boş', { iban: '' }],
      ['IBAN boşluk', { iban: '   ' }],
      ['IBAN maskeli (okuma değeri geri gönderildi)', { iban: MASKED_IBAN }],
      ['IBAN null', { iban: null }],
      ['IBAN metin değil', { iban: 5 }],
      ['banka adı null', { bankName: null }],
      ['isDefault metin', { isDefault: 'evet' }],
      ['officeId', { officeId: 'office-VICTIM' }],
      ['id', { id: 'baska' }],
      ['tenantId', { tenantId: 'tenant-VICTIM' }],
      ['ilişki nesnesi', { office: { connect: { id: 'office-VICTIM' } } }],
    ])('geçersiz / yasak gövde: %s → 400; HİÇ işlem, HİÇ yazma', async (_ad, body) => {
      const res = await put('acc-1', body);
      expect(res.status).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(anyWrites()).toBe(0);
    });

    it('başka büronun / olmayan hesap → 404; varsayılan temizliği dahil HİÇ yazma', async () => {
      const res = await put('acc-VICTIM', { isDefault: true });
      expect(res.status).toBe(404);
      expect(txWrites()).toBe(0);
    });

    it('VIEWER → 403; F01 yetkisiz avukat → 403; HİÇ yazma', async () => {
      expect((await put('acc-1', { isDefault: true }, 'viewer-partner')).status).toBe(403);
      expect((await put('acc-1', { isDefault: true }, 'plain-lawyer')).status).toBe(403);
      expect(anyWrites()).toBe(0);
    });
  });

  describe('DELETE /office/bank-accounts/:id', () => {
    it('doğru kimlikle siler; yanıt maskeli ve kimlikli', async () => {
      const res = await del('acc-1');
      expect(res.status).toBe(200);
      expect(prisma.officeBankAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
      expect(res.body).toEqual({ officeId: OFFICE, id: 'acc-1', isDefault: false, iban: MASKED_IBAN });
    });

    it('başka büronun hesabı → 404; HİÇ silme', async () => {
      const res = await del('acc-VICTIM');
      expect(res.status).toBe(404);
      expect(prisma.officeBankAccount.delete).not.toHaveBeenCalled();
    });

    it('"undefined" kimliği → 404 (eski ekran kusuru artık kimliksiz satır üretmez ama sunucu da korunur)', async () => {
      const res = await del('undefined');
      expect(res.status).toBe(404);
      expect(prisma.officeBankAccount.delete).not.toHaveBeenCalled();
    });

    it('VIEWER → 403; HİÇ silme', async () => {
      expect((await del('acc-1', 'viewer-partner')).status).toBe(403);
      expect(prisma.officeBankAccount.delete).not.toHaveBeenCalled();
    });
  });

  describe('servis ikinci savunması (ValidationPipe ATLANAN doğrudan çağrı)', () => {
    let direct: OfficeService;
    beforeAll(() => {
      const approval = new OfficeApprovalService(prisma as any, { log: jest.fn() } as any);
      direct = new OfficeService(prisma as any, audit as any, approval);
    });

    it('add: gövdedeki tanımsız / yabancı anahtarlar (officeId, id, tenantId, createdAt) persist katmanına ULAŞMAZ', async () => {
      await direct.addBankAccount('tenant-A', {
        bankName: 'B', iban: REAL_IBAN, officeId: 'office-VICTIM', id: 'zorla', tenantId: 'tenant-VICTIM', createdAt: new Date(0),
      } as any);
      expect(tx.officeBankAccount.create.mock.calls[0][0]).toEqual({ data: { officeId: OFFICE, bankName: 'B', iban: REAL_IBAN } });
    });

    it('update: yabancı anahtarlar ULAŞMAZ; yalnız beş alan haritası', async () => {
      await direct.updateBankAccount('tenant-A', 'acc-1', { isDefault: true, officeId: 'office-VICTIM', id: 'baska', tenantId: 'tenant-VICTIM' } as any);
      expect(tx.officeBankAccount.update.mock.calls[0][0]).toEqual({ where: { id: 'acc-1' }, data: { isDefault: true } });
    });

    it.each([[''], ['   '], [MASKED_IBAN], [null], [7]])('add: IBAN %p → BadRequest; HİÇ işlem', async (bad) => {
      await expect(direct.addBankAccount('tenant-A', { bankName: 'B', iban: bad } as any)).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([[''], ['   '], [MASKED_IBAN], [null], [7]])('update: IBAN %p → BadRequest; HİÇ işlem', async (bad) => {
      await expect(direct.updateBankAccount('tenant-A', 'acc-1', { iban: bad } as any)).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('GET /office — okuma yüzeyi B', () => {
    it('yetkili aktör: bankAccounts[] = officeId + id + isDefault + MASKELİ IBAN; banka adı / şube / hesap sahibi / tam IBAN yok', async () => {
      const res = await request(app.getHttpServer()).get('/office').set('x-test-actor', 'partner');
      expect(res.status).toBe(200);
      expect(res.body.bankAccounts).toEqual([{ officeId: OFFICE, id: 'acc-1', isDefault: false, iban: MASKED_IBAN }]);
      const text = JSON.stringify(res.body);
      for (const sizinti of [REAL_IBAN, 'Ziraat', 'Merkez', 'Büro Hesabı']) expect(text).not.toContain(sizinti);
    });

    it('yetkisiz aktör (F01 okuma yetkisi yok) → 403; banka hesabı alanı HİÇ dönmez', async () => {
      const res = await request(app.getHttpServer()).get('/office').set('x-test-actor', 'plain-lawyer');
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('iban');
    });
  });
});
