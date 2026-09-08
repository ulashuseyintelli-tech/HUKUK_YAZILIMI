/**
 * OFFICE-F01-ROLE-TENANT-MATRIX-R01 — F01 aktor kapisinin OLCULMEMIS hucreleri.
 *
 * NEDEN: `OFFICE-DELIVERY-MANIFEST.md` §15.8 "RESIDUAL / ACIK KAPILAR" satiri F01 icin
 * "olculmemis roller (duz USER, MANAGER/VIEWER, cross-office PUBLIC_S0_ONLY) -> owner karari"
 * diyor. Owner karari ancak MEVCUT davranis olculdukten sonra verilebilir.
 *
 * BU SPEC KARAKTERIZASYONDUR: `isF01ActorAuthorized` davranisini DEGISTIRMEZ, yalnizca
 * bugunku sonucu sabitler. Mevcut `office-f01-authorization.spec.ts` ADMIN, PARTNER/MANAGER,
 * staff reddi ve targetOfficeId'li cross-office reddini zaten kapsiyor; burada YALNIZ
 * kapsanmayan hucreler var.
 *
 * OLCUMUN ORTAYA CIKARDIGI UC DIKKAT CEKICI DAVRANIS (kusur IDDIASI DEGIL — owner kararina
 * girdi):
 *   (1) `UserRole` yalniz ADMIN icin kisa-yol olarak okunur. VIEWER rolundeki bir kullanici
 *       MANAGER avukata baglisa F01 kapisindan GECER — rol dizesi geri kalanda ELENMEZ.
 *   (2) `targetOfficeId` VERILMEZSE cross-office kontrolu HIC calismaz; baska ofise bagli
 *       PARTNER avukat, ofis belirtmeyen cagrilarda yetkili SAYILIR.
 *   (3) Cross-office kontrolu ADMIN kisa-yolundan ONCE gelir: baska ofise bagli bir ADMIN,
 *       hedef ofis verildiginde REDDEDILIR.
 */
import { OfficeApprovalService } from '../../office-approval/office-approval.service';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const OFFICE = 'office-1';
const OTHER_OFFICE = 'office-2';
const audit: any = { log: jest.fn() };

const svc = (user: unknown) =>
  new OfficeApprovalService(
    { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any,
    audit,
  );

const actor = (over: Record<string, unknown> = {}) => ({
  role: 'USER',
  isActive: true,
  tenantId: TENANT,
  staffMember: null,
  lawyer: null,
  ...over,
});

const lawyer = (over: Record<string, unknown> = {}) => ({
  officeId: OFFICE,
  lawyerRank: 'LAWYER',
  canApproveOfficeActions: false,
  ...over,
});

describe('F01 matris — avukat bagi OLMAYAN roller REDDEDILIR', () => {
  it.each(['USER', 'VIEWER'])('%s rolu, avukat bagi yok -> REDDEDILIR', async (role) => {
    await expect(svc(actor({ role })).isF01ActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(
      false,
    );
  });

  it('kullanici bulunamazsa REDDEDILIR (fail-closed)', async () => {
    await expect(svc(null).isF01ActorAuthorized('u', TENANT, OFFICE)).resolves.toBe(false);
  });
});

describe('F01 matris — avukat RUTBESI belirleyicidir', () => {
  it.each(['LAWYER', 'INTERN'])(
    'ayricalikli olmayan rutbe %s, delegasyon yok -> REDDEDILIR',
    async (lawyerRank) => {
      await expect(
        svc(actor({ lawyer: lawyer({ lawyerRank }) })).isF01ActorAuthorized('u', TENANT, OFFICE),
      ).resolves.toBe(false);
    },
  );

  it('ayricalikli olmayan rutbe + canApproveOfficeActions=true (delege) -> KABUL EDILIR', async () => {
    await expect(
      svc(
        actor({ lawyer: lawyer({ lawyerRank: 'LAWYER', canApproveOfficeActions: true }) }),
      ).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(true);
  });

  it('PARTNER avukat ama officeId YOK -> REDDEDILIR (ofis bagi zorunlu)', async () => {
    await expect(
      svc(
        actor({ lawyer: lawyer({ officeId: null, lawyerRank: 'PARTNER' }) }),
      ).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(false);
  });
});

describe('F01 matris — rol dizesi ADMIN disinda ELEYICI DEGILDIR (owner kararina girdi)', () => {
  it('VIEWER rolu + MANAGER avukat -> KABUL EDILIR (rol dizesi bakilmaz)', async () => {
    await expect(
      svc(
        actor({ role: 'VIEWER', lawyer: lawyer({ lawyerRank: 'MANAGER' }) }),
      ).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(true);
  });

  it('VIEWER rolu + delege avukat -> KABUL EDILIR', async () => {
    await expect(
      svc(
        actor({ role: 'VIEWER', lawyer: lawyer({ canApproveOfficeActions: true }) }),
      ).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(true);
  });
});

describe('F01 matris — cross-office kontrolu YALNIZ targetOfficeId verilince calisir', () => {
  it('baska ofise bagli PARTNER + hedef ofis VERILMEZ -> KABUL EDILIR (kontrol calismaz)', async () => {
    await expect(
      svc(
        actor({ lawyer: lawyer({ officeId: OTHER_OFFICE, lawyerRank: 'PARTNER' }) }),
      ).isF01ActorAuthorized('u', TENANT),
    ).resolves.toBe(true);
  });

  it('baska ofise bagli ADMIN + hedef ofis VERILIR -> REDDEDILIR (ofis kontrolu ADMIN kisa-yolundan ONCE)', async () => {
    await expect(
      svc(
        actor({ role: 'ADMIN', lawyer: lawyer({ officeId: OTHER_OFFICE, lawyerRank: 'PARTNER' }) }),
      ).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(false);
  });

  it('avukat bagi OLMAYAN ADMIN + hedef ofis VERILIR -> KABUL EDILIR (linkedOfficeId yok, kontrol atlanir)', async () => {
    await expect(
      svc(actor({ role: 'ADMIN' })).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(true);
  });
});

describe('F01 matris — tenant ve yasam donguSU sinirlari', () => {
  it('baska tenant kullanicisi -> REDDEDILIR (ADMIN olsa bile)', async () => {
    await expect(
      svc(actor({ role: 'ADMIN', tenantId: OTHER_TENANT })).isF01ActorAuthorized(
        'u',
        TENANT,
        OFFICE,
      ),
    ).resolves.toBe(false);
  });

  it('pasif kullanici -> REDDEDILIR (ADMIN olsa bile)', async () => {
    await expect(
      svc(actor({ role: 'ADMIN', isActive: false })).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(false);
  });

  it('staff kimligi, MANAGER avukat bagi olsa da REDDEDILIR (kimlik sinifi onceliklidir)', async () => {
    await expect(
      svc(
        actor({
          staffMember: { id: 's1', officeId: OFFICE },
          lawyer: lawyer({ lawyerRank: 'MANAGER' }),
        }),
      ).isF01ActorAuthorized('u', TENANT, OFFICE),
    ).resolves.toBe(false);
  });
});
