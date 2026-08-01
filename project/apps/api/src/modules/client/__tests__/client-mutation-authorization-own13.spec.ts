/**
 * CLIENT-OWN-13-MUTATION-AUTHORIZATION-I01 — owner test matrisi (17 senaryo).
 *
 * Owner kararları (D01/D02/D03, RATIFIED):
 * - D01 CREATE: VIEWER DENY / USER ALLOW / ADMIN ALLOW; lawyer profili ŞART DEĞİL.
 * - D02 UPDATE: coarse gate (VIEWER hiç, USER yalnız standart, ADMIN hepsi); hassas alan için
 *   eşik `ADMIN OR officeApproval.isApproverEligible(actor)`. Tek request hem standart hem
 *   hassas alan içeriyorsa TAMAMI hassas — partial update UYGULANMAZ. Bilinmeyen alan
 *   fail-closed HASSAS.
 * - D03 AUTHORITY SOURCE: ikinci bir rol/capability altyapısı YOK; mevcut `UserRole` +
 *   mevcut `officeApproval.isApproverEligible` primitive'leri yeniden kullanılır.
 *
 * PII: bu dosyadaki TCKN/VKN değerleri sentetiktir; assertion'lar hata gövdesinde ham kimlik
 * numarası BULUNMADIĞINI de doğrular.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { ClientService } from '../client.service';
import { ClientController } from '../client.controller';
import {
  CLIENT_MUTATION_REASON,
  CLIENT_LIFECYCLE_FIELDS,
  CLIENT_SENSITIVE_FIELDS,
  CLIENT_STANDARD_FIELDS,
  classifyClientField,
} from '../client-mutation-policy';
import { CreateClientDto, UpdateClientDto } from '../dto/create-client.dto';

// --- Sentetik sabitler (gerçek kişiye ait DEĞİL) ------------------------------------------
const SYNTHETIC_TCKN = '40294995552';
const SYNTHETIC_VKN = '1234567890';

type ActorRole = 'ADMIN' | 'USER' | 'VIEWER';

const actorOf = (role: ActorRole, userId = 'u1') => ({ userId, role });

/**
 * Mutasyon yüzeylerinin TAMAMINI sayan prisma sahtesi. "Reddedilen istek hiçbir şey yazmaz"
 * iddiası yalnız `update` çağrılmamasıyla değil, `$transaction`ın hiç AÇILMAMASIYLA da
 * kanıtlanır (yazma yalnız transaction içinde olur).
 */
const buildPrisma = (
  existing: any = { id: 'c1', tenantId: 't1', isActive: true, tckn: SYNTHETIC_TCKN, contacts: [] },
) => {
  const tx = {
    client: {
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      // P0.5 tenant-scoped write: update() gerçekte updateMany({id,tenantId}) kullanır.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    clientContact: {
      createMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    clientAddress: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        // findOne(id, tenantId) → mevcut kayıt; duplicate taraması (OR) → eşleşme yok.
        where?.OR ? Promise.resolve(null) : Promise.resolve(existing),
      ),
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    clientAddress: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(tx) : [])),
  };
  return { prisma, tx };
};

const buildAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
  logInTransaction: jest.fn().mockResolvedValue(undefined),
});

const buildOfficeApproval = (eligible: boolean) => ({
  isApproverEligible: jest.fn().mockResolvedValue(eligible),
});

/**
 * UYGULAMA NOKTASI: yetki kapısı owner I01 scope'una (POST /clients + PUT /clients/:id) birebir
 * oturması için ROUTE sınırında, `ClientController` içindedir — `ClientService.create/update`
 * ayrıca servis-içi güvenilen çağıranlara (case.service, export-import) hizmet eder ve onların
 * actor threading'i I01 DIŞIDIR. Bu yüzden testler GERÇEK uygulama noktasını, yani controller'ı
 * sürer; servis ve prisma sahtesi altta gerçek kalır (kapı geçilirse yazma GERÇEKTEN denenir).
 */
const buildService = (opts: { eligible?: boolean; existing?: any } = {}) => {
  const { prisma, tx } = buildPrisma(opts.existing);
  const audit = buildAudit();
  const office = buildOfficeApproval(opts.eligible ?? false);
  const svc = new ClientService(prisma as any, audit as any, office as any);
  const controller = new ClientController(svc, {} as any);

  const reqOf = (actor: { userId: string; role: string }, tenantId = 't1') =>
    ({ user: { id: actor.userId, role: actor.role, tenantId } }) as any;

  /** POST /clients — route imzasıyla birebir. */
  const routeCreate = (tenantId: string, body: any, actor?: { userId: string; role: string }) =>
    controller.create(actor ? reqOf(actor, tenantId) : ({ user: { tenantId } } as any), body);

  /** PUT /clients/:id — route imzasıyla birebir. */
  const routeUpdate = (
    id: string,
    tenantId: string,
    body: any,
    actor?: { userId: string; role: string },
  ) => controller.update(actor ? reqOf(actor, tenantId) : ({ user: { tenantId } } as any), id, body);

  return { svc, controller, routeCreate, routeUpdate, prisma, tx, audit, office };
};

/** ForbiddenException gövdesini (obje formunda) döndürür. */
const forbiddenBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as any;
  }
  throw new Error('ForbiddenException bekleniyordu, atılmadı');
};

// =========================================================================================
// 1-3. CREATE yetkisi (owner D01)
// =========================================================================================
describe('OWN-13 D01 — create yetkisi', () => {
  it('1. VIEWER create → 403 (VIEWER_DENIED) ve hiçbir yazma yapılmaz', async () => {
    const { routeCreate, prisma, tx } = buildService();

    const body = await forbiddenBody(() =>
      routeCreate('t1', { type: 'PERSON', firstName: 'A', lastName: 'B', tckn: SYNTHETIC_TCKN }, actorOf('VIEWER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
    // Reddedilen istek OKUMA bile yapmaz — kapı her şeyden önce çalışır.
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('2. USER create → başarılı (lawyer profili ŞART DEĞİL, isApproverEligible sorgulanmaz)', async () => {
    const { routeCreate, prisma, office } = buildService({ existing: null });

    await routeCreate('t1', { type: 'PERSON', firstName: 'A', lastName: 'B', tckn: SYNTHETIC_TCKN }, actorOf('USER'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('3. ADMIN create → başarılı', async () => {
    const { routeCreate, prisma } = buildService({ existing: null });

    await routeCreate('t1', { type: 'COMPANY', companyName: 'X A.Ş.', vkn: SYNTHETIC_VKN }, actorOf('ADMIN'));

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('3b. actor yoksa create → 403 NO_ACTOR (fail-closed)', async () => {
    const { routeCreate, prisma } = buildService();

    const body = await forbiddenBody(() => routeCreate('t1', { type: 'PERSON' }));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.NO_ACTOR);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('3c. tanınmayan rol → 403 UNKNOWN_ROLE (yeni rol adı sessizce ALLOW olmaz)', async () => {
    const { routeCreate, prisma } = buildService();

    const body = await forbiddenBody(() =>
      routeCreate('t1', { type: 'PERSON' }, { userId: 'u1', role: 'SUPERUSER' } as any),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.UNKNOWN_ROLE);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 4-9. UPDATE yetkisi (owner D02 + D03)
// =========================================================================================
describe('OWN-13 D02 — update yetkisi', () => {
  it('4. VIEWER standart update → 403 ve hiçbir yazma yapılmaz', async () => {
    const { routeUpdate, prisma, tx } = buildService();

    const body = await forbiddenBody(() => routeUpdate('c1', 't1', { notes: 'not' }, actorOf('VIEWER')));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
  });

  it('5. USER standart update → başarılı (isApproverEligible sorgulanmaz)', async () => {
    const { routeUpdate, prisma, office } = buildService();

    await routeUpdate('c1', 't1', { notes: 'yeni not', phone: '05551112233' }, actorOf('USER'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('6. USER hassas update → 403 SENSITIVE_DENIED (yalnız alan ADLARI raporlanır)', async () => {
    const { routeUpdate, prisma } = buildService({ eligible: false });

    const body = await forbiddenBody(() => routeUpdate('c1', 't1', { tckn: SYNTHETIC_TCKN }, actorOf('USER')));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.SENSITIVE_DENIED);
    expect(body.fields).toEqual(['tckn']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('7. ADMIN hassas update → başarılı (isApproverEligible sorgusuna GEREK YOK)', async () => {
    const { routeUpdate, prisma, office } = buildService({ eligible: false });

    await routeUpdate('c1', 't1', { tckn: '10000000146', firstName: 'Yeni' }, actorOf('ADMIN'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('8. yetkili (eligible) avukat hassas update → başarılı, eşik isApproverEligible ile çözülür', async () => {
    const { routeUpdate, prisma, office } = buildService({ eligible: true });

    await routeUpdate('c1', 't1', { firstName: 'Yeni' }, actorOf('USER', 'lawyer-1'));

    expect(office.isApproverEligible).toHaveBeenCalledWith('lawyer-1', 't1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('9. sıradan (ineligible) avukat hassas update → 403', async () => {
    const { routeUpdate, prisma, office } = buildService({ eligible: false });

    const body = await forbiddenBody(() => routeUpdate('c1', 't1', { canCollect: true }, actorOf('USER', 'lawyer-2')));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.SENSITIVE_DENIED);
    expect(office.isApproverEligible).toHaveBeenCalledWith('lawyer-2', 't1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 10. Karma (standart + hassas) istek — partial update YASAK
// =========================================================================================
describe('OWN-13 D02 — karma istek partial yazmaz', () => {
  it('10. USER karma (notes + tckn) → 403 ve standart alan da YAZILMAZ', async () => {
    const { routeUpdate, prisma, tx } = buildService({ eligible: false });

    const body = await forbiddenBody(() =>
      routeUpdate('c1', 't1', { notes: 'güvenli not', tckn: SYNTHETIC_TCKN }, actorOf('USER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.SENSITIVE_DENIED);
    expect(body.fields).toEqual(['tckn']);
    // Partial write YOK: standart alan (notes) da kaydedilmez.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('10b. karma istekte offendingFields YALNIZ hassas alanları listeler', async () => {
    const { routeUpdate } = buildService({ eligible: false });

    const body = await forbiddenBody(() =>
      routeUpdate('c1', 't1', { notes: 'x', email: 'ali@ornek.com', firstName: 'Y', taxOffice: 'Z' }, actorOf('USER')),
    );

    expect(body.fields).toEqual(expect.arrayContaining(['firstName', 'taxOffice']));
    expect(body.fields).not.toContain('notes');
    expect(body.fields).not.toContain('email');
  });
});

// =========================================================================================
// 11. DTO sınıflandırma kapsamı — unclassified alan kalırsa test DÜŞER
// =========================================================================================
describe('OWN-13 — DTO alan kapsamı (fail-closed)', () => {
  /**
   * Owner kuralı: "Update DTO'nun BÜTÜN alanlarını exact inventory ile sınıflandır.
   * Unclassified alan kalırsa implementasyonu durdur." Bu yüzden envanter elle YAZILMAZ —
   * DTO kaynağından okunur. DTO'ya yarın yeni bir alan eklenirse bu test onu görür.
   *
   * `Object.keys(new CreateClientDto())` KULLANILAMAZ: class-validator ile dekore edilmiş
   * initializer'sız opsiyonel alanlar instance'ta own-property yaratmaz (boş dizi döner) →
   * test sessizce hollow olurdu.
   */
  const dtoSource = readFileSync(join(__dirname, '..', 'dto', 'create-client.dto.ts'), 'utf8');

  /** Yalnız Create/Update DTO gövdelerini al (nested ClientContact/ClientAddress DTO'ları hariç). */
  const extractClassBody = (name: string): string => {
    const start = dtoSource.indexOf(`export class ${name}`);
    expect(start).toBeGreaterThan(-1);
    const open = dtoSource.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < dtoSource.length; i++) {
      if (dtoSource[i] === '{') depth++;
      else if (dtoSource[i] === '}' && --depth === 0) return dtoSource.slice(open + 1, i);
    }
    throw new Error(`${name} gövdesi ayrıştırılamadı`);
  };

  const fieldsOf = (name: string): string[] => {
    const body = extractClassBody(name);
    const found = new Set<string>();
    // DTO'daki alanların TAMAMI opsiyoneldir (@IsOptional) → `foo?: tip;`. Dekoratörler alanla
    // AYNI satırda olabildiği için satır-başı çapası KULLANILAMAZ; `?:` imzası aranır.
    for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*\?\s*:/g)) found.add(m[1]);
    return [...found];
  };

  const DTO_FIELDS = [...new Set([...fieldsOf('CreateClientDto'), ...fieldsOf('UpdateClientDto')])];

  it('11. DTO kaynağındaki her alan STANDARD | SENSITIVE | LIFECYCLE olarak sınıflandırılmıştır', () => {
    // Ayrıştırma gerçekten alan buldu mu (regex bozulursa test hollow kalmasın)?
    expect(DTO_FIELDS.length).toBeGreaterThanOrEqual(35);
    expect(DTO_FIELDS).toEqual(expect.arrayContaining(['type', 'tckn', 'vkn', 'notes', 'phones', 'addresses']));
    expect(fieldsOf('UpdateClientDto')).toContain('isActive');

    const unclassified = DTO_FIELDS.filter((f) => {
      const c = classifyClientField(f);
      return c !== 'STANDARD' && c !== 'SENSITIVE' && c !== 'LIFECYCLE';
    });
    expect(unclassified).toEqual([]);
  });

  it('11a. DTO tipleri import edilebilir durumda (kaynak-parse ile aynı dosyayı hedefler)', () => {
    expect(typeof CreateClientDto).toBe('function');
    expect(Object.getPrototypeOf(UpdateClientDto)).toBe(CreateClientDto);
  });

  it('11b. allowlist dışındaki BİLİNMEYEN alan fail-closed HASSAS sayılır', () => {
    expect(classifyClientField('brandNewFieldAddedTomorrow')).toBe('SENSITIVE');
    expect(classifyClientField('__proto__')).toBe('SENSITIVE');
  });

  it('11c. STANDARD ve SENSITIVE listeleri ÖRTÜŞMEZ; lifecycle ayrıdır', () => {
    const overlap = CLIENT_STANDARD_FIELDS.filter((f) => CLIENT_SENSITIVE_FIELDS.includes(f));
    expect(overlap).toEqual([]);
    expect(CLIENT_LIFECYCLE_FIELDS).toEqual(['isActive']);
    for (const f of CLIENT_LIFECYCLE_FIELDS) {
      expect(CLIENT_STANDARD_FIELDS).not.toContain(f);
      expect(CLIENT_SENSITIVE_FIELDS).not.toContain(f);
    }
  });

  it('11d. DTO-de olup standart allowlist-te OLMAYAN alan USER update-inde 403 verir', async () => {
    const { routeUpdate, prisma } = buildService({ eligible: false });

    // `detsisNo` DTO'da vardır (pipe düşürmez) ama standart allowlist'te YOKTUR →
    // fail-closed HASSAS. "Yeni bir DTO alanı sessizce serbest kalmaz" iddiasının
    // route seviyesindeki kanıtı budur.
    const body = await forbiddenBody(() => routeUpdate('c1', 't1', { detsisNo: '123456' }, actorOf('USER')));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.SENSITIVE_DENIED);
    expect(body.fields).toEqual(['detsisNo']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('11e. DTO-de HİÇ OLMAYAN alan route seviyesinde whitelist ile DÜŞÜRÜLÜR (yazılamaz)', async () => {
    const { routeUpdate, prisma, tx } = buildService({ eligible: false });

    // İkinci savunma katmanı: `ValidationPipe({ whitelist: true })` DTO'da tanımsız anahtarı
    // servise HİÇ ULAŞTIRMAZ. İstek reddedilmez ama bilinmeyen alan da ASLA kaydedilmez.
    await routeUpdate('c1', 't1', { someFutureField: 'x', notes: 'güvenli' } as any, actorOf('USER'));

    const written = tx.client.updateMany.mock.calls[0]?.[0]?.data ?? {};
    expect(Object.keys(written)).not.toContain('someFutureField');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// =========================================================================================
// 12. Tenant isolation DEĞİŞMEDİ
// =========================================================================================
describe('OWN-13 — tenant isolation korunur', () => {
  it('12. update yetki kapısından geçtikten sonra HER client okuması tenantId ile daraltılır', async () => {
    const { routeUpdate, prisma } = buildService();

    await routeUpdate('c1', 't1', { notes: 'x' }, actorOf('ADMIN'));

    // "En az bir çağrı tenantId taşıyor" YETMEZ — tek bir tenant-siz okuma cross-tenant
    // sızıntısıdır. Bu yüzden İSTİSNASIZ tüm çağrılar denetlenir.
    const reads = prisma.client.findFirst.mock.calls;
    expect(reads.length).toBeGreaterThan(0);
    for (const [arg] of reads) {
      expect(arg?.where?.tenantId).toBe('t1');
    }
  });

  it('12b. isApproverEligible çağrısı istekteki tenantId ile yapılır (cross-tenant yükselme yok)', async () => {
    const { routeUpdate, office } = buildService({ eligible: true });

    await routeUpdate('c1', 'tenant-A', { firstName: 'Y' }, actorOf('USER', 'u9'));

    expect(office.isApproverEligible).toHaveBeenCalledWith('u9', 'tenant-A');
    expect(office.isApproverEligible).not.toHaveBeenCalledWith('u9', 't1');
  });
});

// =========================================================================================
// 13. Lifecycle davranışı DEĞİŞMEDİ (deactivate/reactivate)
// =========================================================================================
describe('OWN-13 — lifecycle semantiği korunur', () => {
  it('13. ADMIN olsa bile isActive değişimi HÂLÂ isApproverEligible ister (gevşetme YOK)', async () => {
    const { routeUpdate, office, prisma } = buildService({
      eligible: false,
      existing: { id: 'c1', tenantId: 't1', isActive: true, contacts: [] },
    });

    await expect(routeUpdate('c1', 't1', { isActive: false }, actorOf('ADMIN'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(office.isApproverEligible).toHaveBeenCalledWith('u1', 't1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('13b. eligible aktör reaktivasyon yapabilir (false→true akışı bozulmadı)', async () => {
    const { routeUpdate, prisma } = buildService({
      eligible: true,
      existing: { id: 'c1', tenantId: 't1', isActive: false, contacts: [] },
    });

    await routeUpdate('c1', 't1', { isActive: true }, actorOf('ADMIN'));

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('13c. isActive AYNI değerle gönderilirse lifecycle kapısı çalışmaz (no-op korunur)', async () => {
    const { routeUpdate, office } = buildService({
      eligible: false,
      existing: { id: 'c1', tenantId: 't1', isActive: true, contacts: [] },
    });

    await routeUpdate('c1', 't1', { isActive: true, notes: 'x' }, actorOf('ADMIN'));

    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('13d. isActive TEK BAŞINA hassas-alan kapısını tetiklemez (sınıf ayrımı korunur)', async () => {
    const { routeUpdate, prisma } = buildService({
      eligible: true,
      existing: { id: 'c1', tenantId: 't1', isActive: true, contacts: [] },
    });

    await routeUpdate('c1', 't1', { isActive: false }, actorOf('USER'));

    // USER hassas yapamaz; ama isActive LIFECYCLE'dır → SENSITIVE_DENIED ile reddedilmez,
    // lifecycle kapısına (eligible=true) düşer ve geçer.
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// =========================================================================================
// 14-15. Reddedilen istek: kalıcılık yok + PII sızıntısı yok
// =========================================================================================
describe('OWN-13 — reddedilen istek kalıcı değildir ve PII sızdırmaz', () => {
  it('14. reddedilen update hiçbir yazma yüzeyine dokunmaz ve audit yazmaz', async () => {
    const { routeUpdate, prisma, tx, audit } = buildService({ eligible: false });

    await forbiddenBody(() => routeUpdate('c1', 't1', { tckn: SYNTHETIC_TCKN }, actorOf('USER')));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
    expect(tx.clientContact.createMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('15. 403 gövdesinde ham TCKN/VKN veya başka alan DEĞERİ bulunmaz', async () => {
    const { routeUpdate } = buildService({ eligible: false });

    const body = await forbiddenBody(() =>
      routeUpdate(
        'c1',
        't1',
        { tckn: SYNTHETIC_TCKN, vkn: SYNTHETIC_VKN, firstName: 'GİZLİAD', notes: 'gizli not' },
        actorOf('USER'),
      ),
    );

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(SYNTHETIC_TCKN);
    expect(serialized).not.toContain(SYNTHETIC_VKN);
    expect(serialized).not.toContain('GİZLİAD');
    expect(serialized).not.toContain('gizli not');
    // Alan ADLARI ise raporlanır (kullanıcı hangi alanın kilitli olduğunu bilmeli).
    expect(body.fields).toEqual(expect.arrayContaining(['tckn', 'vkn', 'firstName']));
  });

  it('15b. create reddi de değer sızdırmaz', async () => {
    const { routeCreate } = buildService();

    const body = await forbiddenBody(() =>
      routeCreate('t1', { tckn: SYNTHETIC_TCKN, firstName: 'GİZLİAD' }, actorOf('VIEWER')),
    );

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(SYNTHETIC_TCKN);
    expect(serialized).not.toContain('GİZLİAD');
  });
});

// =========================================================================================
// 16-17. FE sinyali backend-derived + doğrudan API çağrısı UI'yı BYPASS EDEMEZ
// =========================================================================================
describe('OWN-13 — capability sinyali ve bypass direnci', () => {
  it('16. getMutationCapabilities rol + eligibility kaynağından türer (VIEWER hepsi false)', async () => {
    const { svc } = buildService({ eligible: false });

    const caps = await svc.getMutationCapabilities('u1', 't1', 'VIEWER');

    expect(caps).toEqual({
      canCreate: false,
      canUpdateStandard: false,
      canUpdateSensitive: false,
      canManageLifecycle: false,
    });
  });

  it('16b. USER: create + standart açık, hassas + lifecycle kapalı', async () => {
    const { svc } = buildService({ eligible: false });

    const caps = await svc.getMutationCapabilities('u1', 't1', 'USER');

    expect(caps).toEqual({
      canCreate: true,
      canUpdateStandard: true,
      canUpdateSensitive: false,
      canManageLifecycle: false,
    });
  });

  it('16c. eligible USER (yetkili avukat): hassas + lifecycle açılır', async () => {
    const { svc } = buildService({ eligible: true });

    const caps = await svc.getMutationCapabilities('u1', 't1', 'USER');

    expect(caps.canUpdateSensitive).toBe(true);
    expect(caps.canManageLifecycle).toBe(true);
  });

  it('16d. ADMIN: hassas açık; lifecycle HÂLÂ eligibility kaynağına bağlı (mevcut semantik korunur)', async () => {
    const { svc } = buildService({ eligible: false });

    const caps = await svc.getMutationCapabilities('u1', 't1', 'ADMIN');

    expect(caps.canUpdateSensitive).toBe(true);
    expect(caps.canManageLifecycle).toBe(false);
  });

  it('17. UI atlanıp servis doğrudan çağrılsa bile VIEWER yazamaz (API authority)', async () => {
    const { routeCreate, routeUpdate, prisma } = buildService({ eligible: true });

    // FE'nin capabilities'i hiç okumadığı/manipüle edildiği senaryo: servis yine reddeder.
    await forbiddenBody(() => routeCreate('t1', { type: 'PERSON' }, actorOf('VIEWER')));
    await forbiddenBody(() => routeUpdate('c1', 't1', { notes: 'x' }, actorOf('VIEWER')));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('17b. capability sinyali ALLOW dese bile eşik servis içinde yeniden değerlendirilir', async () => {
    // eligible=false → capabilities.canUpdateSensitive=false; istemci yine de hassas alan yollar.
    const { svc, routeUpdate, prisma } = buildService({ eligible: false });

    const caps = await svc.getMutationCapabilities('u1', 't1', 'USER');
    expect(caps.canUpdateSensitive).toBe(false);

    await forbiddenBody(() => routeUpdate('c1', 't1', { vkn: SYNTHETIC_VKN }, actorOf('USER')));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
