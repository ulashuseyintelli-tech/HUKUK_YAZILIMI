/**
 * C3-B04 — §13/7 K7.1-K7.5 özel nitelikli veri yönetimi (model B).
 *
 * Kanıtlanan ratifiye kurallar:
 * - K7.1: kapsam md.6 kapalı listesi; liste dışı kategori RED; gender/nationality bu blokta
 *   yeniden SINIFLANDIRILMADI (policy characterization).
 * - K7.2/K7.3: içerik yalnız şifreli saklanır (düz metin yok); erişim elevated; liste
 *   MASKELİ; her detay erişimi AYRI audit; audit metadata'sında içerik ASLA yok.
 * - Anahtar yoksa fail-closed RED (düz metin fallback yok).
 * - Silme yüzeyi YOK (POL-E/B03 kapısına tabi — serviste delete çağrısı yoktur, statik).
 */
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { buildClientMutationActor } from '../client.service';
import {
  CLIENT_SPECIAL_CATEGORY_KEY_ENV,
  CLIENT_SPECIAL_DATA_CATEGORIES,
  ClientSpecialCategoryService,
  decryptSpecialContent,
  encryptSpecialContent,
} from '../client-special-category.service';
import { CLIENT_SENSITIVE_FIELDS } from '../client-mutation-policy';

const TEST_KEY = randomBytes(32).toString('base64');

const actorOf = (role: 'ADMIN' | 'USER' | 'VIEWER', userId = 'u1') =>
  buildClientMutationActor({ userId, tenantId: 't1', role });

const buildDeps = (opts: { record?: any } = {}) => {
  const tx = {
    clientSpecialCategoryRecord: {
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'sp-1', createdAt: new Date(), ...data }),
      ),
    },
  };
  const prisma: any = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1' }) },
    clientSpecialCategoryRecord: {
      findFirst: jest.fn().mockResolvedValue(opts.record ?? null),
      findMany: jest.fn().mockResolvedValue(opts.record ? [opts.record] : []),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(false) };
  const svc = new ClientSpecialCategoryService(prisma, audit as any, office as any);
  return { svc, prisma, tx, audit, office };
};

beforeEach(() => {
  process.env[CLIENT_SPECIAL_CATEGORY_KEY_ENV] = TEST_KEY;
});
afterAll(() => {
  delete process.env[CLIENT_SPECIAL_CATEGORY_KEY_ENV];
});

describe('Kripto paketleme (K7.3)', () => {
  it('round-trip çalışır ve paket düz metni İÇERMEZ', () => {
    const packed = encryptSpecialContent(TEST_KEY, 'hassas sağlık notu');
    expect(packed.startsWith('v1:')).toBe(true);
    expect(packed).not.toContain('sağlık');
    expect(decryptSpecialContent(TEST_KEY, packed)).toBe('hassas sağlık notu');
  });

  it('tamper edilen paket çözülmez (GCM auth)', () => {
    const packed = encryptSpecialContent(TEST_KEY, 'veri');
    const parts = packed.split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] = ct[0] ^ 0xff;
    parts[3] = ct.toString('base64');
    expect(() => decryptSpecialContent(TEST_KEY, parts.join(':'))).toThrow();
  });

  it('yanlış uzunlukta anahtar RED', () => {
    expect(() => encryptSpecialContent(Buffer.from('kisa').toString('base64'), 'x')).toThrow(
      'SPECIAL_DATA_KEY_INVALID',
    );
  });
});

describe('K7.1 — kapalı liste ve sınıflandırma sınırı', () => {
  it('md.6 kapalı listesi 11 kategoridir', () => {
    expect(CLIENT_SPECIAL_DATA_CATEGORIES).toHaveLength(11);
  });

  it('liste dışı kategori fail-closed RED', async () => {
    const { svc } = buildDeps();
    await expect(
      svc.createRecord({ tenantId: 't1', clientId: 'c1', category: 'NATIONALITY', content: 'x', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gender/nationality bu blokta özel-nitelik olarak YENİDEN SINIFLANDIRILMADI (K7.1)', () => {
    // Charakterization: alanlar mevcut policy'de SENSITIVE sınıfında KALIR; md.6 kapalı
    // listesine dahil DEĞİLLER (tek başına özel nitelikli sayılmazlar — owner kararı).
    expect(CLIENT_SENSITIVE_FIELDS).toContain('gender');
    expect(CLIENT_SENSITIVE_FIELDS).toContain('nationality');
    expect(CLIENT_SPECIAL_DATA_CATEGORIES as readonly string[]).not.toContain('gender');
    expect(CLIENT_SPECIAL_DATA_CATEGORIES as readonly string[]).not.toContain('nationality');
  });
});

describe('Erişim kapısı + audit (K7.3)', () => {
  it('staff (USER, eligible değil) kayıt oluşturamaz; hiçbir yazma olmaz', async () => {
    const { svc, prisma } = buildDeps();
    await expect(
      svc.createRecord({ tenantId: 't1', clientId: 'c1', category: 'HEALTH', content: 'x', actor: actorOf('USER') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ADMIN kayıt oluşturur → DB değeri şifreli, audit metadata içerik TAŞIMAZ', async () => {
    const { svc, tx, audit } = buildDeps();
    const res = await svc.createRecord({
      tenantId: 't1',
      clientId: 'c1',
      category: 'HEALTH',
      content: 'kronik hastalık bilgisi',
      actor: actorOf('ADMIN'),
    });
    expect(res).not.toHaveProperty('content');
    const stored = (tx.clientSpecialCategoryRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(stored.contentEncrypted).not.toContain('kronik');
    expect(stored.contentEncrypted.startsWith('v1:')).toBe(true);
    const auditArg = (audit.logInTransaction as jest.Mock).mock.calls[0][1];
    expect(auditArg.action).toBe('CLIENT_SPECIAL_DATA_CREATE');
    expect(JSON.stringify(auditArg.metadata)).not.toContain('kronik');
  });

  it('liste MASKELİDİR — içerik alanı dönmez', async () => {
    const record = {
      id: 'sp-1',
      category: 'HEALTH',
      contentEncrypted: encryptSpecialContent(TEST_KEY, 'gizli'),
      createdByUserId: 'admin-1',
      createdAt: new Date(),
      clientId: 'c1',
    };
    const { svc } = buildDeps({ record });
    const rows = await svc.listRecords({ tenantId: 't1', clientId: 'c1', actor: actorOf('ADMIN') });
    expect(rows[0]).not.toHaveProperty('content');
    expect(rows[0]).not.toHaveProperty('contentEncrypted');
  });

  it('detay okuma çözer ve HER erişim CLIENT_SPECIAL_DATA_ACCESS audit üretir', async () => {
    const record = {
      id: 'sp-1',
      clientId: 'c1',
      category: 'HEALTH',
      contentEncrypted: encryptSpecialContent(TEST_KEY, 'gizli içerik'),
      createdByUserId: 'admin-1',
      createdAt: new Date(),
    };
    const { svc, audit } = buildDeps({ record });
    const res = await svc.readRecord({ tenantId: 't1', recordId: 'sp-1', actor: actorOf('ADMIN') });
    expect(res.content).toBe('gizli içerik');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_SPECIAL_DATA_ACCESS', entityId: 'sp-1' }),
    );
    expect(JSON.stringify((audit.log as jest.Mock).mock.calls[0][0].metadata)).not.toContain('gizli');
  });

  it('eligible USER erişebilir (mevcut elevated primitive tüketildi)', async () => {
    const record = {
      id: 'sp-1',
      clientId: 'c1',
      category: 'HEALTH',
      contentEncrypted: encryptSpecialContent(TEST_KEY, 'x'),
      createdByUserId: 'a',
      createdAt: new Date(),
    };
    const { svc, office } = buildDeps({ record });
    office.isApproverEligible.mockResolvedValue(true);
    await expect(
      svc.readRecord({ tenantId: 't1', recordId: 'sp-1', actor: actorOf('USER') }),
    ).resolves.toMatchObject({ content: 'x' });
  });
});

describe('Fail-closed anahtar (K7.3 — düz metin fallback YOK)', () => {
  it('anahtar yokken yazma RED', async () => {
    delete process.env[CLIENT_SPECIAL_CATEGORY_KEY_ENV];
    const { svc } = buildDeps();
    await expect(
      svc.createRecord({ tenantId: 't1', clientId: 'c1', category: 'HEALTH', content: 'x', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('anahtar yokken okuma RED', async () => {
    const record = {
      id: 'sp-1',
      clientId: 'c1',
      category: 'HEALTH',
      contentEncrypted: encryptSpecialContent(TEST_KEY, 'x'),
      createdByUserId: 'a',
      createdAt: new Date(),
    };
    delete process.env[CLIENT_SPECIAL_CATEGORY_KEY_ENV];
    const { svc } = buildDeps({ record });
    await expect(
      svc.readRecord({ tenantId: 't1', recordId: 'sp-1', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Silme yüzeyi yok (B03 kapısına tabi) — statik kanıt', () => {
  it('servis kaynağı delete/deleteMany ve scheduler içermez', () => {
    const src = readFileSync(join(__dirname, '..', 'client-special-category.service.ts'), 'utf8');
    expect(src).not.toMatch(/\.delete\(|\.deleteMany\(/);
    expect(src).not.toMatch(/@Cron|setInterval|scheduleJob/);
  });
});
