/**
 * D5-DIAG-R01 — portal e-posta eşleşmesi (biçim farkı) + sessiz dalların teşhis edilebilirliği (birim).
 *
 * Kusur (kaynaktan doğrulandı): `createResetToken` ve `login` hesabı adresin birebir yazımıyla arıyordu. Adres yalnız
 * büyük/küçük harf ya da baştaki/sondaki boşlukla farklı yazılınca hesap bulunamıyor; sıfırlama talebi dışarıya aynı
 * başarı cevabını dönüyor, token üretilmiyor, e-posta gönderilmiyor ve HİÇBİR iç günlük satırı yazılmıyordu.
 *
 * Kural: birebir eşleşme önceliklidir (eski davranış). Yoksa adres baş/son boşluk ve ASCII harf büyüklüğü farkıyla
 * TEK aktif hesaba çözülüyorsa o hesap kullanılır; birden çok hesap = belirsiz = eşleşme yok (kapalı yön).
 * Karşılaştırma veritabanının yerel ayarından bağımsızdır ve hesap açma çakışma kapısı AYNI karşılaştırmayı kullanır.
 *
 *  [1]-[3]   harf / boşluk farkı; birebir eşleşmede biçim araması çalışmaz
 *  [4]       birden çok hesap → eşleşme yok + AYRI teşhis satırı; pasif hesap sayılmaz; aday sınırı dolarsa belirsiz
 *  [5]       hesap yok → teşhis satırı
 *  [6]       metin olmayan / boş e-posta alanı → eşleşme yok, dış cevap aynı
 *  [6c]-[6i] desen karakterleri düz metindir ([6c], [6d]) · uygulama tarafı eşitliği · yalnız ASCII katlama · kayıtlı
 *            adresteki boşluk · kırpma kümesi `trim()` ile aynı · hesap bulunduktan sonra kapanan hesap
 *  [7]-[9]   tenant erişime kapalı · talep sırasında kapanan hesap · teşhis satırlarında adres/token/bağlantı yok
 *  [10]-[12] login: aynı kurallar
 *  [13]-[15] createPortalUser: çakışma kapısı aynı karşılaştırmayla; kayıtlı adres biçimi değiştirilmez; girdi doğrulaması
 *  [16]      createPortalUser: yazımdan önce transaction içinde adres kilidi + çakışmanın yeniden ölçümü (eşzamanlı istekler)
 *  [17]-[24] KR-4: adres birebir yazımla birden çok AKTİF hesapla eşleşirse eşleşme yok sayılır (biçim farkı belirsiz
 *            dalıyla aynı kapalı yön): giriş bilinmeyen adresle aynı ret, parola denenmez, giriş kaydı / oturum yok;
 *            sıfırlamada token ve e-posta yok, dış cevap aynı, ayırt edici iç günlük satırı. Birebir okuma en çok iki
 *            kayıt; tek aktif + aynı adresli pasif → aktif hesap. (Tek aday: [3], [10c]; aday yok → biçim farkı yolu: [1],
 *            [2], [10]; yalnız biçim farkıyla iki hesap: [4], [12]; eşleşmeyen adres: [5].)
 */
import { BadRequestException, ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { foldPortalEmail, PORTAL_EMAIL_CANDIDATE_LIMIT, PORTAL_EMAIL_TRIM_CHARS, PortalService } from '../portal.service';

type FakeUser = {
  id: string;
  email: string;
  isActive: boolean;
  passwordHash?: string;
  lifecycle?: string;
  tokenVersion?: number;
  clientId?: string;
};

const clientIdOf = (u: FakeUser) => u.clientId ?? 'C-' + u.id;

/** Sorgunun veritabanında yaptığı karşılaştırmanın bağımsız taklidi: verilen kümeyle kırp + yalnız ASCII küçült. */
function dbFold(stored: string, trimChars: string): string {
  let a = 0;
  let b = stored.length;
  while (a < b && trimChars.includes(stored[a])) a++;
  while (b > a && trimChars.includes(stored[b - 1])) b--;
  let out = '';
  for (const ch of stored.slice(a, b)) out += ch >= 'A' && ch <= 'Z' ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch;
  return out;
}

/** Bellek içi sahte depo: birebir aramayı (harf duyarlı) ve biçim farkı sorgusunu taklit eder. */
function buildService(users: FakeUser[], over: any = {}) {
  const shape = (u: FakeUser) => ({
    id: u.id,
    email: u.email,
    isActive: u.isActive,
    passwordHash: u.passwordHash ?? 'x',
    tokenVersion: u.tokenVersion ?? 0,
    clientId: clientIdOf(u),
    client: { id: clientIdOf(u), displayName: 'Sentetik', tenantId: 'T1', type: 'PERSON', tenant: { lifecycle: u.lifecycle ?? 'ACTIVE' } },
  });
  const match = (where: any): FakeUser[] =>
    users.filter((u) => {
      if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
      if (where.clientId && where.clientId.not !== undefined && clientIdOf(u) === where.clientId.not) return false;
      if (where.id !== undefined) return u.id === where.id;
      if (typeof where.email === 'string') return u.email === where.email;
      throw new Error('sahte depo yalnız metin e-posta koşulunu tanır: ' + JSON.stringify(where));
    });
  let rawCalls = 0;
  const queryRaw = jest.fn(async (query: any) => {
    rawCalls++;
    if (over.rawRowsByCall) return over.rawRowsByCall[rawCalls - 1] ?? [];
    if (over.rawRows) return over.rawRows;
    const values = query.values as unknown[];
    const trimChars = values[0] as string;
    const folded = values[1] as string;
    const limit = values[values.length - 1] as number;
    const exclude = values.length === 4 ? (values[2] as string) : undefined;
    return users
      .filter((u) => u.isActive && (exclude === undefined || clientIdOf(u) !== exclude) && dbFold(u.email, trimChars) === folded)
      .slice(0, limit)
      .map((u) => ({ id: u.id, email: u.email }));
  });
  const prisma: any = {
    $queryRaw: queryRaw,
    $executeRaw: jest.fn().mockResolvedValue(0),
    client: {
      findFirst: jest.fn(async ({ where }: any) => ({ id: where.id, tenantId: where.tenantId })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'C-NEW', hasPortalAccess: false, portalUserId: null })),
      update: jest.fn(async () => ({ id: 'C-NEW', hasPortalAccess: true, portalUserId: 'PU-NEW' })),
    },
    clientPortalUser: {
      findFirst: jest.fn(async ({ where }: any) => {
        const m = match(where)[0];
        return m ? shape(m) : null;
      }),
      // KR-4: birebir eşleşme okuması; `take` sahte depoda da uygulanır (dizi sırası = satır sırası).
      findMany: jest.fn(async ({ where, take }: any) => {
        const m = match(where);
        return (take === undefined ? m : m.slice(0, take)).map(shape);
      }),
      findUnique: jest.fn(async () => over.existingForClient ?? null),
      create: jest.fn(async ({ data }: any) => ({ id: 'PU-NEW', ...data })),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue(over.updateManyResult ?? { count: 1 }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: any, _options?: any) => fn(prisma));
  const audit = { log: jest.fn(), logInTransaction: jest.fn() };
  const officeApproval = {
    isApproverEligible: jest.fn().mockResolvedValue(true),
    isApproverEligibleInTx: jest.fn().mockResolvedValue(true),
  };
  const emailProvider = { send: jest.fn().mockResolvedValue({ success: true, provider: 'mock' }) };
  const config = { get: jest.fn((k: string) => (k === 'WEB_BASE_URL' ? 'https://portal.example.com' : undefined)) };
  const jwt = { sign: jest.fn(() => 'jwt-token') };
  const svc = new PortalService(prisma, jwt as any, audit as any, officeApproval as any, config as any, emailProvider as any);
  return { svc, prisma, emailProvider, jwt, audit, officeApproval };
}

const STORED = 'Ali.Veli@Example.com';
const NON_TEXT: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['sayı', 42],
  ['dizi', ['a@example.com']],
  ['nesne', {}],
];
const DOTTED_CAPITAL_I = String.fromCharCode(0x130);
const KELVIN_SIGN = String.fromCharCode(0x212a);
const BS = String.fromCharCode(92);

let spies: jest.SpyInstance[];
const logged = () => spies.flatMap((s) => s.mock.calls).map((c) => c.map(String).join(' '));
beforeEach(() => {
  spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((m) =>
    jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
  );
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe('D5-DIAG-R01 createResetToken — e-posta biçim farkı', () => {
  it('[1] harf farkı: token KAYITLI hesaba yazılır ve e-posta KAYITLI adrese gider', async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await expect(svc.createResetToken('ali.veli@example.com')).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientPortalUser.updateMany.mock.calls[0][0].where).toEqual({ id: 'PU1', isActive: true });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    expect(emailProvider.send.mock.calls[0][0].to).toBe(STORED); // yazılan metne değil
  });

  it('[2] baştaki/sondaki boşluk + harf farkı: kırpılmış ve küçültülmüş değerle, yalnız AKTİF hesaplar arasında aranır', async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await svc.createResetToken('  ALI.VELI@EXAMPLE.COM \t');
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toEqual([PORTAL_EMAIL_TRIM_CHARS, 'ali.veli@example.com', PORTAL_EMAIL_CANDIDATE_LIMIT]);
    const sql = String(query.strings.join('?')).replace(/\s+/g, ' ');
    expect(sql).toContain('FROM "ClientPortalUser" WHERE "isActive" = true AND lower(btrim("email", ?) COLLATE "C") = ? LIMIT ?');
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    expect(emailProvider.send.mock.calls[0][0].to).toBe(STORED);
  });

  it('[3] birebir eşleşme varken biçim araması çalışmaz (eski davranış aynen)', async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await svc.createResetToken(STORED);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    // KR-4: birebir okuma findMany ile (en çok iki kayıt); tek kayıtta yeniden okuma yok.
    expect(prisma.clientPortalUser.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.findMany.mock.calls[0][0].where).toEqual({ email: STORED, isActive: true });
    expect(emailProvider.send.mock.calls[0][0].to).toBe(STORED);
  });

  it('[4] yalnız harf farkıyla ayrışan İKİ aktif hesap → eşleşme YOK (kapalı yön) + AYRI teşhis satırı', async () => {
    const { svc, prisma, emailProvider } = buildService([
      { id: 'PU1', email: 'Ali.Veli@Example.com', isActive: true },
      { id: 'PU2', email: 'ali.veli@EXAMPLE.com', isActive: true },
    ]);
    await expect(svc.createResetToken('ALI.VELI@example.com')).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes('birden çok aktif portal hesabıyla'))).toBe(true);
    expect(logged().some((l) => l.includes('eşleşen aktif portal hesabı yok'))).toBe(false);
  });

  it('[4b] iki hesaptan biri PASİF → tek aktif hesap kullanılır', async () => {
    const { svc, prisma } = buildService([
      { id: 'PU1', email: 'Ali.Veli@Example.com', isActive: false },
      { id: 'PU2', email: 'ali.veli@EXAMPLE.com', isActive: true },
    ]);
    await svc.createResetToken('ALI.VELI@example.com');
    expect(prisma.clientPortalUser.updateMany.mock.calls[0][0].where).toEqual({ id: 'PU2', isActive: true });
  });

  it('[4c] birebir yazılan hesap PASİF, harf farkıyla tek AKTİF hesap var → aktif hesaba çözülür (bilinçli davranış)', async () => {
    const { svc, prisma, emailProvider } = buildService([
      { id: 'PU1', email: 'ali.veli@example.com', isActive: false },
      { id: 'PU2', email: STORED, isActive: true },
    ]);
    await svc.createResetToken('ali.veli@example.com');
    expect(prisma.clientPortalUser.findMany.mock.calls[0][0].where).toEqual({ email: 'ali.veli@example.com', isActive: true });
    expect(prisma.clientPortalUser.updateMany.mock.calls[0][0].where).toEqual({ id: 'PU2', isActive: true });
    expect(emailProvider.send.mock.calls[0][0].to).toBe(STORED);
  });

  it('[4d] aday sınırı dolarsa (veritabanı sınır kadar satır döndürdü) belirsiz sayılır → eşleşme YOK', async () => {
    const rows = Array.from({ length: PORTAL_EMAIL_CANDIDATE_LIMIT }, (_, n) => ({
      id: 'X' + n,
      email: n === 0 ? STORED : 'baska' + n + '@example.com',
    }));
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }], { rawRows: rows });
    await svc.createResetToken('ali.veli@example.com');
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes('birden çok aktif portal hesabıyla'))).toBe(true);
  });

  it('[5] hesap yok → token/e-posta yok + teşhis satırı', async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await expect(svc.createResetToken('baska@example.com')).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes('eşleşen aktif portal hesabı yok'))).toBe(true);
  });

  it.each(NON_TEXT)('[6] metin olmayan e-posta alanı (%s) → eşleşme yok; dış cevap aynı; ayrı teşhis satırı', async (_d, bad) => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await expect(svc.createResetToken(bad as any)).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes('metin değil'))).toBe(true);
    expect(logged().some((l) => l.includes('eşleşen aktif portal hesabı yok'))).toBe(false);
  });

  it('[6b] yalnız boşluktan oluşan e-posta → biçim araması yapılmaz, eşleşme yok', async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await expect(svc.createResetToken(' \t ')).resolves.toEqual({ success: true });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it.each([
    ['boş metin', ''],
    ['yalnız boşluk', ' \t '],
  ])('[6c] boş e-posta (%s) → dış cevap aynı; AYRI teşhis satırı (yanlış yazılmış adresten ayırt edilir)', async (_d, typed) => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await expect(svc.createResetToken(typed)).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes('e-posta alanı boş'))).toBe(true);
    expect(logged().some((l) => l.includes('eşleşen aktif portal hesabı yok'))).toBe(false);
  });

  it('[6d] boş OLMAYAN, eşleşmeyen adres "boş" satırı yazmaz', async () => {
    const { svc } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await svc.createResetToken('baska@example.com');
    expect(logged().some((l) => l.includes('e-posta alanı boş'))).toBe(false);
    expect(logged().some((l) => l.includes('eşleşen aktif portal hesabı yok'))).toBe(true);
  });

  it.each([
    ['tek yüzde', '%'],
    ['yüzde + alan adı', '%@example.com'],
    ['alt çizgi', 'ali_veli@example.com'],
    ['yüzde sonek', 'ali.veli@%'],
    ['ters bölü', 'ali' + BS + '.veli@example.com'],
    ['birden çok', 'a%i_veli@%'],
  ])('[6c] desen karakterli girdi (%s) düz metindir: hesabı SEÇEMEZ', async (_d, typed) => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: true }]);
    await expect(svc.createResetToken(typed)).resolves.toEqual({ success: true });
    expect(prisma.$queryRaw.mock.calls[0][0].values[1]).toBe(typed.toLowerCase()); // değiştirilmeden, parametre olarak
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('[6d] kayıtlı adreste alt çizgi / yüzde / ters bölü varsa harf farkıyla yazım yine eşleşir', async () => {
    for (const stored of ['Ali_Veli@Example.com', 'Ali%Veli@Example.com', 'Ali' + BS + 'Veli@Example.com']) {
      const { svc, emailProvider } = buildService([{ id: 'PU1', email: stored, isActive: true }]);
      await svc.createResetToken(stored.toLowerCase());
      expect(emailProvider.send).toHaveBeenCalledTimes(1);
      expect(emailProvider.send.mock.calls[0][0].to).toBe(stored);
    }
  });

  it.each([
    ['yerel kısım farklı', 'baska.biri@example.com'],
    ['alan adı farklı', 'ali.veli@baska-alan.example'],
  ])('[6e] uygulama tarafı eşitliği: veritabanı yazılandan FARKLI adres döndürürse (%s) eşleşme YOK', async (_d, returned) => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: returned, isActive: true }], {
      rawRows: [{ id: 'PU1', email: returned }],
    });
    await expect(svc.createResetToken('ALI.VELI@example.com')).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('[6f] yalnız ASCII harf büyüklüğü katlanır: ASCII dışı benzer harfle yazım eşleşmez (kapalı yön)', async () => {
    expect(foldPortalEmail('  ILKER@Example.COM ')).toBe('ilker@example.com');
    const a = buildService([{ id: 'PU1', email: 'ilker@example.com', isActive: true }], { rawRows: [{ id: 'PU1', email: 'ilker@example.com' }] });
    await a.svc.createResetToken(DOTTED_CAPITAL_I + 'LKER@EXAMPLE.COM');
    expect(a.emailProvider.send).not.toHaveBeenCalled();
    const k = buildService([{ id: 'PU1', email: 'kemal@example.com', isActive: true }], { rawRows: [{ id: 'PU1', email: 'kemal@example.com' }] });
    await k.svc.createResetToken(KELVIN_SIGN + 'emal@example.com'); // genel küçültme ASCII k verir, ASCII katlama vermez
    expect(k.emailProvider.send).not.toHaveBeenCalled();
  });

  it('[6g] KAYITLI adresin başında/sonunda boşluk varsa da hesap bulunur; e-posta kayıtlı adrese olduğu gibi gider', async () => {
    const stored = ' Ali.Veli@Example.com\t';
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: stored, isActive: true }]);
    await svc.createResetToken('ali.veli@example.com');
    expect(prisma.clientPortalUser.updateMany.mock.calls[0][0].where).toEqual({ id: 'PU1', isActive: true });
    expect(emailProvider.send.mock.calls[0][0].to).toBe(stored);
  });

  it('[6h] kırpma kümesi `trim()` ile birebir aynıdır (veritabanı ve uygulama aynı karakterleri atar)', () => {
    const trimmed: number[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) if (String.fromCharCode(cp).trim() === '') trimmed.push(cp);
    expect([...PORTAL_EMAIL_TRIM_CHARS].map((ch) => ch.charCodeAt(0)).sort((x, y) => x - y)).toEqual(trimmed);
  });

  it('[6i] hesap bulunduktan sonra kapandıysa (yeniden okuma yalnız AKTİF hesabı alır) token/e-posta yok', async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: STORED, isActive: false }], {
      rawRows: [{ id: 'PU1', email: STORED }],
    });
    await svc.createResetToken('ali.veli@example.com');
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes('eşleşen aktif portal hesabı yok'))).toBe(true);
  });

  it("[7] biçim farkıyla bulunan hesabın tenant'ı erişime kapalı → token/e-posta yok + ayrı teşhis satırı (adres yok)", async () => {
    const { svc, prisma, emailProvider } = buildService([{ id: 'PU1', email: 'Kapali.Tenant@Example.com', isActive: true, lifecycle: 'SUSPENDED' }]);
    await expect(svc.createResetToken('kapali.tenant@example.com')).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
    const all = logged().join('|').toLowerCase();
    expect(all).toContain('erişime kapalı');
    expect(all).not.toContain('eşleşen aktif portal hesabı yok');
    expect(all).not.toContain('kapali.tenant');
  });

  it('[8] hesap talep sırasında kapandı (koşullu yazım 0 satır) → e-posta yok + ayrı teşhis satırı (adres yok)', async () => {
    const { svc, emailProvider } = buildService([{ id: 'PU1', email: 'Yaris.Hesap@Example.com', isActive: true }], {
      updateManyResult: { count: 0 },
    });
    await expect(svc.createResetToken('yaris.hesap@example.com')).resolves.toEqual({ success: true });
    expect(emailProvider.send).not.toHaveBeenCalled();
    const all = logged().join('|').toLowerCase();
    expect(all).toContain('talep sırasında kapandı');
    expect(all).not.toContain('yaris.hesap');
  });

  it("[9] sessiz dalların satırları adres içermez; başarı satırı yalnız KAYITLI adresin maskeli biçimini yazar; token ve bağlantı yok", async () => {
    const typed = 'gizli.kisi@ornek-alan.example';
    const a = buildService([
      { id: 'PU1', email: 'Basari.Hesap@Example.com', isActive: true },
      { id: 'PU2', email: 'Cift@Example.com', isActive: true },
      { id: 'PU3', email: 'cift@EXAMPLE.com', isActive: true },
    ]);
    await a.svc.createResetToken(typed); // hesap yok
    await a.svc.createResetToken({ isaret: 'govde-9731' } as any); // metin değil
    await a.svc.createResetToken('CIFT@example.com'); // belirsiz
    await a.svc.createResetToken('basari.hesap@example.com'); // biçim farkıyla bulundu → token + e-posta
    expect(logged().length).toBe(4);
    const all = logged().join('|');
    expect(all).not.toContain('gizli.kisi');
    expect(all).not.toContain('govde-9731');
    expect(all.toLowerCase()).not.toContain('cift@');
    expect(all.toLowerCase()).not.toContain('basari.hesap');
    expect(all).toContain('@Example.com'); // başarı satırı: KAYITLI adresin maskeli biçimi
    expect(all).not.toContain('@example.com'); // yazılan biçim günlüğe girmez
    expect(all).not.toMatch(/https?:\/\//);
    expect(all).not.toMatch(/#token=/);
    const raw = decodeURIComponent(String(a.emailProvider.send.mock.calls[0][0].text).match(/#token=([^\s]+)/)![1]);
    expect(all).not.toContain(raw);
    expect(all).not.toContain(createHash('sha256').update(raw).digest('hex'));
    expect(all).not.toContain(a.prisma.clientPortalUser.updateMany.mock.calls[0][0].data.resetToken);
  });
});

describe('D5-DIAG-R01 login — e-posta biçim farkı', () => {
  const pw = 'Dogru12345';
  const hash = bcrypt.hashSync(pw, 4);

  it('[10] harf/boşluk farkıyla yazılan adres + doğru parola → giriş; oturum KAYITLI hesaba verilir; günlük adresi maskeler', async () => {
    const { svc, prisma, jwt } = buildService([{ id: 'PU1', email: 'Giris.Hesap@Example.com', isActive: true, passwordHash: hash }]);
    const res: any = await svc.login(' giris.hesap@EXAMPLE.com ', pw);
    expect(res.token).toBe('jwt-token');
    expect((jwt.sign.mock.calls[0] as any[])[0]).toEqual(expect.objectContaining({ sub: 'PU1', type: 'portal' }));
    expect(prisma.clientPortalUser.update.mock.calls[0][0].where).toEqual({ id: 'PU1' });
    const all = logged().join('|');
    expect(all).toContain('Portal girişi');
    expect(all).toContain('@Example.com'); // KAYITLI adresin maskeli biçimi
    expect(all).not.toContain('@EXAMPLE.com'); // yazılan biçim günlüğe girmez
    expect(all.toLowerCase()).not.toContain('giris.hesap');
  });

  it('[10b] harf farkı + YANLIŞ parola → aynı ret mesajı (giriş yok)', async () => {
    const { svc, jwt } = buildService([{ id: 'PU1', email: STORED, isActive: true, passwordHash: hash }]);
    const e = await svc.login('ali.veli@example.com', 'Yanlis12345').catch((x) => x);
    expect(e).toBeInstanceOf(UnauthorizedException);
    expect(e.message).toBe('Geçersiz e-posta veya şifre');
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('[10c] birebir eşleşmede biçim araması çalışmaz; birebir sorgu yalnız AKTİF hesabı arar (eski davranış aynen)', async () => {
    const { svc, prisma } = buildService([{ id: 'PU1', email: STORED, isActive: true, passwordHash: hash }]);
    await svc.login(STORED, pw);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    // KR-4: birebir okuma findMany ile (en çok iki kayıt); tek kayıtta yeniden okuma yok.
    expect(prisma.clientPortalUser.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.findMany.mock.calls[0][0].where).toEqual({ email: STORED, isActive: true });
  });

  it('[10d] PASİF hesap: birebir ya da harf farkıyla yazım + doğru parola → ret', async () => {
    const { svc, jwt } = buildService([{ id: 'PU1', email: STORED, isActive: false, passwordHash: hash }]);
    await expect(svc.login(STORED, pw)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.login(STORED.toLowerCase(), pw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('[10e] hesap bulunduktan sonra kapandıysa (yeniden okuma yalnız AKTİF hesabı alır) giriş YOK', async () => {
    const { svc, jwt } = buildService([{ id: 'PU1', email: STORED, isActive: false, passwordHash: hash }], {
      rawRows: [{ id: 'PU1', email: STORED }],
    });
    await expect(svc.login('ali.veli@example.com', pw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it.each([
    ...NON_TEXT.map(([d, v]) => [d + ' e-posta', v, pw] as [string, unknown, unknown]),
    ['undefined parola', STORED, undefined],
    ['sayı parola', STORED, 12345678],
    ['nesne parola', STORED, {}],
  ])('[11] metin olmayan alan (%s) → eşleşme yok; aynı ret', async (_d, em, pass) => {
    const { svc, prisma, jwt } = buildService([{ id: 'PU1', email: STORED, isActive: true, passwordHash: hash }]);
    const e = await svc.login(em as any, pass as any).catch((x) => x);
    expect(e).toBeInstanceOf(UnauthorizedException);
    expect(e.message).toBe('Geçersiz e-posta veya şifre');
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it.each([
    ['tek yüzde', '%'],
    ['yüzde + alan adı', '%@example.com'],
    ['alt çizgi', 'ali_veli@example.com'],
  ])('[11b] desen karakterli e-posta (%s) + DOĞRU parola → ret', async (_d, typed) => {
    const { svc, jwt } = buildService([{ id: 'PU1', email: STORED, isActive: true, passwordHash: hash }]);
    await expect(svc.login(typed, pw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('[12] yalnız harf farkıyla ayrışan iki aktif hesap + üçüncü yazım → ret (hangi hesap olduğu belirsiz)', async () => {
    const { svc, jwt } = buildService([
      { id: 'PU1', email: 'Ali.Veli@Example.com', isActive: true, passwordHash: hash },
      { id: 'PU2', email: 'ali.veli@EXAMPLE.com', isActive: true, passwordHash: hash },
    ]);
    await expect(svc.login('ALI.VELI@example.com', pw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('[12b] iki hesaptan birine BİREBİR yazım → o hesap (birebir eşleşme önceliklidir)', async () => {
    const { svc, jwt } = buildService([
      { id: 'PU1', email: 'Ali.Veli@Example.com', isActive: true, passwordHash: hash },
      { id: 'PU2', email: 'ali.veli@EXAMPLE.com', isActive: true, passwordHash: hash },
    ]);
    await svc.login('ali.veli@EXAMPLE.com', pw);
    expect((jwt.sign.mock.calls[0] as any[])[0]).toEqual(expect.objectContaining({ sub: 'PU2' }));
  });
});

describe('D5-DIAG-R01 createPortalUser — çakışma kapısı giriş/sıfırlama ile AYNI karşılaştırmayı kullanır', () => {
  const actor = { userId: 'U1' } as any;
  const CONFLICT = 'Bu e-posta başka bir aktif portal kullanıcısında kayıtlı';

  it.each([
    ['harf farkı', STORED, 'ali.veli@example.com'],
    ['boşluk + harf farkı', STORED, '  ALI.VELI@EXAMPLE.COM '],
    ['birebir', STORED, STORED],
    ['kayıtlı adres boşluklu, yeni adres temiz', ' ' + STORED + ' ', 'ali.veli@example.com'],
    ['kayıtlı adres boşluklu, aynı boşluklu yazım', ' ' + STORED + ' ', ' ' + STORED + ' '],
  ])('[13] başka müvekkilin AKTİF hesabıyla %s → 409; hesap açılmaz', async (_d, stored, email) => {
    const { svc, prisma } = buildService([{ id: 'PU1', email: stored, isActive: true, clientId: 'C-OTHER' }]);
    const e = await svc.createPortalUser('C-NEW', email, 'Parola12345', 'T1', actor).catch((x) => x);
    expect(e).toBeInstanceOf(ConflictException);
    expect(e.message).toBe(CONFLICT);
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[13b] aynı adres yalnız PASİF hesapta ya da AYNI müvekkilde → çakışma sayılmaz', async () => {
    const a = buildService([{ id: 'PU1', email: STORED, isActive: false, clientId: 'C-OTHER' }]);
    await expect(a.svc.createPortalUser('C-NEW', 'ali.veli@example.com', 'Parola12345', 'T1', actor)).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    const b = buildService([{ id: 'PU1', email: STORED, isActive: true, clientId: 'C-NEW' }], {
      existingForClient: { id: 'PU1', isActive: true },
    });
    await expect(b.svc.createPortalUser('C-NEW', 'ali.veli@example.com', 'Parola12345', 'T1', actor)).rejects.toThrow(
      'Bu müvekkil için portal hesabı zaten mevcut',
    );
  });

  it.each([
    ['desen karakteri düz metin', 'aliXveli@example.com', 'ali_veli@example.com'],
    ['ASCII dışı benzer harf (giriş/sıfırlama da farklı sayar)', 'ilker@example.com', DOTTED_CAPITAL_I + 'lker@example.com'],
    ['genel küçültmenin ASCII harfe çevirdiği işaret', 'kemal@example.com', KELVIN_SIGN + 'emal@example.com'],
  ])('[13c] benzer ama FARKLI adres çakışma değildir (%s)', async (_d, stored, email) => {
    const { svc, prisma } = buildService([{ id: 'PU1', email: stored, isActive: true, clientId: 'C-OTHER' }]);
    await expect(svc.createPortalUser('C-NEW', email, 'Parola12345', 'T1', actor)).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(prisma.clientPortalUser.create).toHaveBeenCalledTimes(1);
  });

  it('[13d] aday sınırı dolarsa çakışma sayılır (kapalı yön)', async () => {
    const rows = Array.from({ length: PORTAL_EMAIL_CANDIDATE_LIMIT }, (_, n) => ({ id: 'X' + n, email: 'baska' + n + '@example.com' }));
    const { svc, prisma } = buildService([], { rawRows: rows });
    await expect(svc.createPortalUser('C-NEW', 'yeni@example.com', 'Parola12345', 'T1', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
  });

  it('[13e] kapıda da uygulama tarafı eşitliği: veritabanı FARKLI adres döndürürse çakışma sayılmaz', async () => {
    const { svc, prisma } = buildService([], { rawRows: [{ id: 'X1', email: 'baska.biri@example.com' }] });
    await expect(svc.createPortalUser('C-NEW', 'yeni@example.com', 'Parola12345', 'T1', actor)).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(prisma.clientPortalUser.create).toHaveBeenCalledTimes(1);
  });

  it('[14] çakışma yoksa hesap açılır; birebir çakışma sorgusu ve kayıtlı adres biçimi DEĞİŞMEDİ; kapı başka müvekkillere bakar', async () => {
    const { svc, prisma } = buildService([{ id: 'PU1', email: 'baska@example.com', isActive: true, clientId: 'C-OTHER' }]);
    await svc.createPortalUser('C-NEW', ' Yeni.Kisi@Example.com', 'Parola12345', 'T1', actor);
    expect(prisma.clientPortalUser.findFirst.mock.calls[0][0].where).toEqual({
      email: ' Yeni.Kisi@Example.com',
      isActive: true,
      clientId: { not: 'C-NEW' },
    });
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toEqual([PORTAL_EMAIL_TRIM_CHARS, 'yeni.kisi@example.com', 'C-NEW', PORTAL_EMAIL_CANDIDATE_LIMIT]);
    expect(String(query.strings.join('?')).replace(/\s+/g, ' ')).toContain('COLLATE "C") = ? AND "clientId" <> ? LIMIT ?');
    expect(prisma.clientPortalUser.create.mock.calls[0][0].data.email).toBe(' Yeni.Kisi@Example.com');
  });

  it('[14b] yeniden aktifleştirme yolunda da adres girildiği biçimde saklanır', async () => {
    const { svc, prisma } = buildService([], { existingForClient: { id: 'PU-OLD', isActive: false } });
    await svc.createPortalUser('C-NEW', ' Yeni.Kisi@Example.com ', 'Parola12345', 'T1', actor);
    expect(prisma.clientPortalUser.update.mock.calls[0][0].data.email).toBe(' Yeni.Kisi@Example.com ');
  });

  it.each([
    ...NON_TEXT.map(([d, v]) => [d + ' e-posta', v, 'Parola12345'] as [string, unknown, unknown]),
    ['boş e-posta', ' \t ', 'Parola12345'],
    ['undefined parola', 'a@example.com', undefined],
    ['nesne parola', 'a@example.com', {}],
  ])('[15] metin olmayan / boş alan (%s) → 400; hesap açılmaz', async (_d, em, pass) => {
    const { svc, prisma } = buildService([]);
    const e = await svc.createPortalUser('C-NEW', em as any, pass as any, 'T1', actor).catch((x) => x);
    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.message).toBe('Müvekkil, e-posta ve şifre alanları gerekli');
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
  });

  it('[15b] metin olmayan müvekkil kimliği → 400', async () => {
    const { svc, prisma } = buildService([]);
    await expect(svc.createPortalUser({} as any, 'a@example.com', 'Parola12345', 'T1', actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('[16] yazımdan önce transaction içinde: yetki → adres kilidi → çakışmanın yeniden ölçümü → yazım (yeni hesap ve yeniden açma)', async () => {
    for (const existingForClient of [null, { id: 'PU-OLD', isActive: false }]) {
      const { svc, prisma, officeApproval } = buildService([], { existingForClient });
      await svc.createPortalUser('C-NEW', ' Yeni.Kisi@Example.com', 'Parola12345', 'T1', actor);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const lock = prisma.$executeRaw.mock.calls[0];
      expect(String(lock[0].join('?')).replace(/\s+/g, ' ')).toContain('pg_advisory_xact_lock(hashtextextended(?, 0))');
      expect(lock[1]).toBe('portal-email:yeni.kisi@example.com'); // kilit anahtarı = adresin karşılaştırma biçimi
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // erken ölçüm + transaction içi ölçüm
      expect(prisma.$queryRaw.mock.calls[1][0].values).toEqual([
        PORTAL_EMAIL_TRIM_CHARS,
        'yeni.kisi@example.com',
        'C-NEW',
        PORTAL_EMAIL_CANDIDATE_LIMIT,
      ]);
      const order = (m: jest.Mock, i = 0) => m.mock.invocationCallOrder[i];
      const write = existingForClient ? prisma.clientPortalUser.update : prisma.clientPortalUser.create;
      expect(order(officeApproval.isApproverEligibleInTx)).toBeLessThan(order(prisma.$executeRaw));
      expect(order(prisma.$executeRaw)).toBeLessThan(order(prisma.$queryRaw, 1));
      expect(order(prisma.$queryRaw, 1)).toBeLessThan(order(write));
      // kilitten sonraki ölçüm önceki isteğin commit'ini görmeli: yalıtım düzeyi sabit
      expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted' });
    }
  });

  it('[16b] erken ölçümden SONRA aynı adres başka müvekkilde açıldıysa transaction içi ölçüm görür → 409; hiçbir yazım yok', async () => {
    for (const existingForClient of [null, { id: 'PU-OLD', isActive: false }]) {
      const { svc, prisma, audit } = buildService([], {
        existingForClient,
        rawRowsByCall: [[], [{ id: 'PU-X', email: 'YENI.kisi@example.com' }]],
      });
      const e = await svc.createPortalUser('C-NEW', 'yeni.kisi@example.com', 'Parola12345', 'T1', actor).catch((x) => x);
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.message).toBe(CONFLICT);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
      expect(prisma.client.update).not.toHaveBeenCalled();
      expect(audit.logInTransaction).not.toHaveBeenCalled();
    }
  });

  it('[16c] transaction içi ölçümde aday sınırı dolarsa da çakışma sayılır (kapalı yön)', async () => {
    const rows = Array.from({ length: PORTAL_EMAIL_CANDIDATE_LIMIT }, (_, n) => ({ id: 'X' + n, email: 'baska' + n + '@example.com' }));
    const { svc, prisma } = buildService([], { rawRowsByCall: [[], rows] });
    await expect(svc.createPortalUser('C-NEW', 'yeni@example.com', 'Parola12345', 'T1', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
  });

  it('[16d] kilit ve yeniden ölçüm TRANSACTION istemcisinde koşar (dış istemcide alınan kilit hemen bırakılırdı)', async () => {
    const { svc, prisma } = buildService([]);
    const outerQueryRaw = prisma.$queryRaw;
    const tx: any = {
      ...prisma,
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn(async (q: any) => outerQueryRaw(q)),
    };
    prisma.$transaction = jest.fn(async (fn: any, _options?: any) => fn(tx));
    const before = outerQueryRaw.mock.calls.length;
    await svc.createPortalUser('C-NEW', 'yeni@example.com', 'Parola12345', 'T1', actor);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // kilit transaction bağlantısında
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1); // yeniden ölçüm transaction bağlantısında
    // dış istemci: yalnız işlem öncesi kapı (1) + tx sarmalayıcısının iletimi (1)
    expect(outerQueryRaw.mock.calls.length - before).toBe(2);
    expect(prisma.clientPortalUser.create).toHaveBeenCalledTimes(1);
  });
});

describe('KR-4 birebir aynı adresli birden çok AKTİF hesap — eşleşme yok sayılır (kapalı yön)', () => {
  const pwA = 'ParolaA12345';
  const pwB = 'ParolaB12345';
  const pwC = 'ParolaC12345';
  const hashA = bcrypt.hashSync(pwA, 4);
  const hashB = bcrypt.hashSync(pwB, 4);
  const hashC = bcrypt.hashSync(pwC, 4);
  const SAME = 'Ortak.Adres@Example.com';
  const UNKNOWN = 'yok.boyle.biri@example.com';
  const LOGIN_REJECT = 'Geçersiz e-posta veya şifre';
  const AMBIG_EXACT = 'belirsiz (birebir)';
  const twoActive = (): FakeUser[] => [
    { id: 'PU1', email: SAME, isActive: true, passwordHash: hashA },
    { id: 'PU2', email: SAME, isActive: true, passwordHash: hashB },
  ];
  /** Sahte depo + posta + oturum çağrılarının sırası (çağrı sırasına göre adlar). */
  const callSequence = (b: ReturnType<typeof buildService>) =>
    (
      [
        ['findMany', b.prisma.clientPortalUser.findMany],
        ['findFirst', b.prisma.clientPortalUser.findFirst],
        ['$queryRaw', b.prisma.$queryRaw],
        ['update', b.prisma.clientPortalUser.update],
        ['updateMany', b.prisma.clientPortalUser.updateMany],
        ['send', b.emailProvider.send],
        ['sign', b.jwt.sign],
      ] as Array<[string, jest.Mock]>
    )
      .flatMap(([name, fn]) => fn.mock.invocationCallOrder.map((order) => [order, name] as [number, string]))
      .sort((x, y) => x[0] - y[0])
      .map(([, name]) => name);

  let compareSpy: jest.SpyInstance;
  beforeEach(() => {
    compareSpy = jest.spyOn(bcrypt, 'compare');
  });
  afterEach(() => compareSpy.mockRestore());

  it('[17] sıfırlama: İKİ aktif hesap → hiçbir satıra token yok, e-posta yok, dış cevap bilinmeyen adresle aynı; ayırt edici günlük satırı (adres yok)', async () => {
    const amb = buildService(twoActive());
    const ambRes = await amb.svc.createResetToken(SAME);
    const ambLog = logged();
    expect(ambRes).toEqual(await buildService(twoActive()).svc.createResetToken(UNKNOWN));
    expect(ambRes).toEqual({ success: true });
    expect(amb.prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(amb.prisma.clientPortalUser.update).not.toHaveBeenCalled();
    expect(amb.emailProvider.send).not.toHaveBeenCalled();
    expect(ambLog).toHaveLength(1);
    expect(ambLog[0]).toContain(AMBIG_EXACT);
    expect(ambLog[0]).toContain('token üretilmedi, e-posta gönderilmedi');
    expect(ambLog[0]).not.toContain('biçim farkıyla');
    expect(ambLog[0]).not.toContain('eşleşen aktif portal hesabı yok');
    expect(ambLog[0]).not.toContain('@');
    expect(ambLog[0].toLowerCase()).not.toContain('ortak.adres');
  });

  it.each([
    ['ilk hesabın parolası', pwA],
    ['ikinci hesabın parolası', pwB],
  ])('[18] giriş: İKİ aktif hesap + %s → bilinmeyen adresle AYNI 401; parola denenmez, giriş kaydı / oturum yok', async (_d, pw) => {
    const { svc, prisma, jwt } = buildService(twoActive());
    const e = await svc.login(SAME, pw).catch((x) => x);
    const unknown = await buildService(twoActive()).svc.login(UNKNOWN, pw).catch((x) => x);
    expect(e).toBeInstanceOf(UnauthorizedException);
    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(e.message).toBe(LOGIN_REJECT);
    expect(e.message).toBe(unknown.message);
    expect(e.getStatus()).toBe(unknown.getStatus());
    expect(e.getResponse()).toEqual(unknown.getResponse());
    expect(compareSpy).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('[19] işlem sırası bilinmeyen adres dalıyla aynı: birebir okuma → biçim farkı ölçümü → ret (parola denemesi, yazım, gönderim yok)', async () => {
    for (const op of ['login', 'reset'] as const) {
      const amb = buildService(twoActive());
      const unk = buildService(twoActive());
      const run = (b: ReturnType<typeof buildService>, email: string) =>
        op === 'login' ? b.svc.login(email, pwA).catch(() => undefined) : b.svc.createResetToken(email);
      await run(amb, SAME);
      await run(unk, UNKNOWN);
      expect(callSequence(amb)).toEqual(['findMany', '$queryRaw']);
      expect(callSequence(unk)).toEqual(callSequence(amb));
    }
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('[20] ikiden FAZLA (3) birebir aktif eşleşme → okuma en çok iki kayıt; üç parolayla da giriş ve sıfırlama kapalı', async () => {
    const users: FakeUser[] = [...twoActive(), { id: 'PU3', email: SAME, isActive: true, passwordHash: hashC }];
    for (const pw of [pwA, pwB, pwC]) {
      const { svc, prisma, jwt } = buildService(users);
      await expect(svc.login(SAME, pw)).rejects.toThrow(LOGIN_REJECT);
      expect(await prisma.clientPortalUser.findMany.mock.results[0].value).toHaveLength(2);
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    }
    const r = buildService(users);
    await expect(r.svc.createResetToken(SAME)).resolves.toEqual({ success: true });
    expect(r.prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(r.emailProvider.send).not.toHaveBeenCalled();
    expect(logged().some((l) => l.includes(AMBIG_EXACT))).toBe(true);
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('[21] birebir okuma biçimi: yalnız aktif hesaplar, en çok İKİ kayıt, sıralama yok; hesap bilgisi tek okumada (giriş ve sıfırlama)', async () => {
    const one: FakeUser[] = [{ id: 'PU1', email: SAME, isActive: true, passwordHash: hashA }];
    const l = buildService(one);
    await expect(l.svc.login(SAME, pwA)).resolves.toEqual(expect.objectContaining({ token: 'jwt-token' }));
    const r = buildService(one);
    await r.svc.createResetToken(SAME);
    expect(r.emailProvider.send).toHaveBeenCalledTimes(1);
    for (const b of [l, r]) {
      const args = b.prisma.clientPortalUser.findMany.mock.calls[0][0];
      expect(Object.keys(args).sort()).toEqual(['include', 'take', 'where']);
      expect(args.where).toEqual({ email: SAME, isActive: true });
      expect(args.take).toBe(2);
    }
    expect(l.prisma.clientPortalUser.findMany.mock.calls[0][0].include).toEqual({
      client: { select: { id: true, displayName: true, tenantId: true, type: true, tenant: { select: { lifecycle: true } } } },
    });
    expect(r.prisma.clientPortalUser.findMany.mock.calls[0][0].include).toEqual({
      client: { select: { tenant: { select: { lifecycle: true } } } },
    });
  });

  it.each([
    ['pasif kayıt önce', true],
    ['aktif kayıt önce', false],
  ])('[22] tek AKTİF + aynı adresli PASİF kayıt (%s) → yalnız aktif hesap kullanılır', async (_d, passiveFirst) => {
    const passive: FakeUser = { id: 'PU-P', email: SAME, isActive: false, passwordHash: hashB };
    const active: FakeUser = { id: 'PU-A', email: SAME, isActive: true, passwordHash: hashA };
    const users = passiveFirst ? [passive, active] : [active, passive];
    const ok = buildService(users);
    const res: any = await ok.svc.login(SAME, pwA);
    expect(res.user.id).toBe('PU-A');
    expect((ok.jwt.sign.mock.calls[0] as any[])[0]).toEqual(expect.objectContaining({ sub: 'PU-A' }));
    expect(ok.prisma.clientPortalUser.update.mock.calls[0][0].where).toEqual({ id: 'PU-A' });
    await expect(buildService(users).svc.login(SAME, pwB)).rejects.toThrow(LOGIN_REJECT); // pasif hesabın parolası
    const r = buildService(users);
    await r.svc.createResetToken(SAME);
    expect(r.prisma.clientPortalUser.updateMany.mock.calls[0][0].where).toEqual({ id: 'PU-A', isActive: true });
    expect(r.emailProvider.send).toHaveBeenCalledTimes(1);
    expect(logged().some((l) => l.includes(AMBIG_EXACT))).toBe(false);
  });

  it('[23] birebir okuma belirsizse biçim farkı ölçümü TEK hesap döndürse de (arada durum değişimi) eşleşme yok sayılır', async () => {
    const l = buildService(twoActive(), { rawRows: [{ id: 'PU1', email: SAME }] });
    await expect(l.svc.login(SAME, pwA)).rejects.toThrow(LOGIN_REJECT);
    expect(l.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(l.prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(l.jwt.sign).not.toHaveBeenCalled();
    const r = buildService(twoActive(), { rawRows: [{ id: 'PU2', email: SAME }] });
    await expect(r.svc.createResetToken(SAME)).resolves.toEqual({ success: true });
    expect(r.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(r.prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(r.prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    expect(r.emailProvider.send).not.toHaveBeenCalled();
    expect(logged().filter((x) => x.includes(AMBIG_EXACT))).toHaveLength(1);
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('[24] günlük satırları ayrışır: biçim farkı belirsizliği "birebir" satırını yazmaz', async () => {
    const folded = buildService([
      { id: 'PU1', email: 'Ali.Veli@Example.com', isActive: true },
      { id: 'PU2', email: 'ali.veli@EXAMPLE.com', isActive: true },
    ]);
    await folded.svc.createResetToken('ALI.VELI@example.com');
    const lines = logged();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('biçim farkıyla birden çok aktif portal hesabıyla eşleşiyor (belirsiz)');
    expect(lines[0]).not.toContain(AMBIG_EXACT);
  });
});
