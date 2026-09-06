/**
 * D-4 (owner GO 2026-09-06) — POA ENTITY YAZMA YETKISI (C2 frozen primitive, additive POA_* komutlari).
 *
 * Kapatilan boşluk: `POST /poa`, `PUT /poa/:id`, `POST /poa/:id/lawyers`,
 * `DELETE /poa/:id/lawyers/:lawyerId`, `DELETE /poa/:id/file` yalniz `JwtAuthGuard` tasiyordu →
 * VIEWER bile vekalet olusturabiliyor/degistirebiliyordu. `status` varsayilani ACTIVE oldugundan
 * ve K9 (§13/9) capability bagi `isActive + status ACTIVE + validUntil` okudugundan, yetkisiz
 * olusturulan vekalet `canCollect/canSettle/canWaive/canRelease` yetkilerini ETKIN KILIYORDU.
 *
 * Ratifiye davranis:
 *   - Kapi SERVIS girisinde, gercek yan etkiden ONCE; `actor` ZORUNLU (actor'suz uretim cagrisi derlenmez).
 *   - Esik C2-B02 ile AYNI: ADMIN VEYA canonical elevated (`officeApproval.isApproverEligible`);
 *     VIEWER ve tanimsiz rol fail-closed; cross-tenant TENANT_MISMATCH; eligibility yalniz gerektiginde.
 *   - Revoke (`delete()`) elevated-only KALIR — ADMIN tek basina YETMEZ (P1A semantigi degismedi).
 *   - Genel `update()` ile `status`/`isActive` YAZILAMAZ (400 `POA_FIELD_NOT_WRITABLE`) → daha siki
 *     lifecycle kurali yan kapidan asilamaz. `clientId` ve dosya alanlari da update'te reddedilir.
 *   - Istek basina TEK yetki karari + TEK audit: create/update icindeki avukat baglama (`linkLawyers`)
 *     ve dedup/suppress dali ayri karar/audit URETMEZ.
 *   - Basarisiz (throw eden) mutasyon audit URETMEZ; audit metadata ham PII tasimaz.
 *
 * Kanit sinifi: controller–servis birim testleri; Prisma ve dosya sistemi mock'lanir
 * (gercek HTTP/DB E2E DEGILDIR).
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CLIENT_MUTATION_REASON } from '../../client/client-mutation-policy';
import { CLIENT_WORKSPACE_COMMAND } from '../../client/client-workspace-command-authority';
import { PoaController } from '../poa.controller';
import {
  POA_UPDATE_WRITABLE_FIELDS,
  PoaService,
  projectPoaWritableInput,
} from '../poa.service';

type AnyRecord = Record<string, any>;

const TENANT = 'tenant-1';
const POA_ID = 'poa-1';
const CLIENT_ID = 'client-1';

const actor = (role: string | undefined, tenantId: string = TENANT) => ({ userId: 'user-1', tenantId, role });

function buildHarness(opts: { eligible?: boolean; poaFound?: boolean } = {}) {
  const { eligible = false, poaFound = true } = opts;
  const poaRow = {
    id: POA_ID,
    clientId: CLIENT_ID,
    filePath: '/data/poa/poa-1.pdf',
    validUntil: null,
    client: { id: CLIENT_ID },
    lawyers: [],
  };
  const prisma: AnyRecord = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: CLIENT_ID, displayName: 'Muvekkil' }) },
    clientPowerOfAttorney: {
      // findOne(id) tenant-scoped okuma: istenen id ile doner (create sonrasi yeni kayit da okunur).
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => (poaFound ? { ...poaRow, id: where?.id ?? POA_ID } : null)),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (a: any) => ({ id: 'poa-new', ...a.data })),
      update: jest.fn().mockResolvedValue({ id: POA_ID }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    poaLawyer: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    lawyer: { findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id }))) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
  };
  const audit: AnyRecord = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: AnyRecord = { isApproverEligible: jest.fn().mockResolvedValue(eligible) };
  const storage: AnyRecord = {
    filePath: () => '/data/poa/poa-1.pdf',
    assertContained: (_b: string, p: string) => p,
  };
  const service = new PoaService(prisma as any, audit as any, officeApproval as any, storage as any);
  return { service, prisma, audit, officeApproval, poaRow };
}

type Harness = ReturnType<typeof buildHarness>;

/** Yetkisiz aktorde HICBIR yazma ve audit olmamali. */
function expectNoWrite(h: Harness) {
  expect(h.prisma.clientPowerOfAttorney.create).not.toHaveBeenCalled();
  expect(h.prisma.clientPowerOfAttorney.update).not.toHaveBeenCalled();
  expect(h.prisma.clientPowerOfAttorney.updateMany).not.toHaveBeenCalled();
  expect(h.prisma.poaLawyer.createMany).not.toHaveBeenCalled();
  expect(h.prisma.poaLawyer.deleteMany).not.toHaveBeenCalled();
  expect(h.audit.log).not.toHaveBeenCalled();
  expect(h.audit.logInTransaction).not.toHaveBeenCalled();
}

type OpCase = {
  name: string;
  commandType: string;
  invoke: (h: Harness, role: string | undefined, tenantId?: string) => Promise<unknown>;
};

const OPS: OpCase[] = [
  {
    name: 'create (POST /poa)',
    commandType: CLIENT_WORKSPACE_COMMAND.POA_CREATE,
    invoke: (h, role, tenantId) => h.service.create({ clientId: CLIENT_ID, notaryName: 'NOTER' } as any, TENANT, actor(role, tenantId)),
  },
  {
    name: 'update (PUT /poa/:id)',
    commandType: CLIENT_WORKSPACE_COMMAND.POA_UPDATE,
    invoke: (h, role, tenantId) => h.service.update(POA_ID, { notaryCity: 'ANKARA' } as any, TENANT, actor(role, tenantId)),
  },
  {
    name: 'addLawyers (POST /poa/:id/lawyers)',
    commandType: CLIENT_WORKSPACE_COMMAND.POA_LAWYERS_ADD,
    invoke: (h, role, tenantId) => h.service.addLawyers(POA_ID, ['law-1'], TENANT, actor(role, tenantId)),
  },
  {
    name: 'removeLawyer (DELETE /poa/:id/lawyers/:lawyerId)',
    commandType: CLIENT_WORKSPACE_COMMAND.POA_LAWYER_REMOVE,
    invoke: (h, role, tenantId) => h.service.removeLawyer(POA_ID, 'law-1', TENANT, actor(role, tenantId)),
  },
  {
    name: 'deleteFile (DELETE /poa/:id/file)',
    commandType: CLIENT_WORKSPACE_COMMAND.POA_FILE_DELETE,
    invoke: (h, role, tenantId) => h.service.deleteFile(POA_ID, TENANT, actor(role, tenantId)),
  },
];

describe('D-4 — POA yazma yuzeyi rol matrisi (bes islem)', () => {
  for (const op of OPS) {
    describe(op.name, () => {
      it('VIEWER -> 403 VIEWER_DENIED; yazma ve audit YOK, eligibility sorgulanmaz', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'VIEWER')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED }),
        });
        expectNoWrite(h);
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
      });

      it('tanimsiz rol -> 403 UNKNOWN_ROLE (fail-closed); yazma ve audit YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'BILINMEYEN_ROL')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE }),
        });
        expectNoWrite(h);
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
      });

      it('USER (elevated degil) -> 403 WORKSPACE_COMMAND_DENIED; eligibility BIR kez, yazma/audit YOK', async () => {
        const h = buildHarness({ eligible: false });
        await expect(op.invoke(h, 'USER')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED }),
        });
        expectNoWrite(h);
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledTimes(1);
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith('user-1', TENANT);
      });

      it('cross-tenant aktor -> 403 TENANT_MISMATCH (ADMIN olsa bile); eligibility/yazma/audit YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'ADMIN', 'tenant-2')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH }),
        });
        expectNoWrite(h);
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
      });

      it('ADMIN -> islem calisir, eligibility HIC sorgulanmaz, TEK CLIENT_WORKSPACE_COMMAND audit', async () => {
        const h = buildHarness();
        await op.invoke(h, 'ADMIN');
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
        expect(h.audit.log).toHaveBeenCalledTimes(1);
        expect(h.audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TENANT,
            userId: 'user-1',
            action: 'CLIENT_WORKSPACE_COMMAND',
            entityType: 'Client',
            entityId: CLIENT_ID,
            metadata: expect.objectContaining({ commandType: op.commandType }),
          }),
        );
      });

      it('elevated USER (isApproverEligible=true) -> islem calisir + TEK audit', async () => {
        const h = buildHarness({ eligible: true });
        await op.invoke(h, 'USER');
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledTimes(1);
        expect(h.audit.log).toHaveBeenCalledTimes(1);
        expect(h.audit.log.mock.calls[0][0].metadata).toMatchObject({ commandType: op.commandType, actorRole: 'USER' });
      });
    });
  }
});

describe('D-4 — K9 baglantisi: yetkisiz aktor ACTIVE vekalet URETEMEZ', () => {
  it('VIEWER create denemesi: clientPowerOfAttorney.create HIC cagrilmaz (capability etkinlesmez)', async () => {
    const h = buildHarness();
    await expect(
      h.service.create({ clientId: CLIENT_ID, canCollect: true, canSettle: true } as any, TENANT, actor('VIEWER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.clientPowerOfAttorney.create).not.toHaveBeenCalled();
  });

  it('ADMIN create: kayit status ACTIVE ile acilir (mevcut davranis korunur) + audit poaId tasir', async () => {
    const h = buildHarness();
    await h.service.create({ clientId: CLIENT_ID } as any, TENANT, actor('ADMIN'));
    expect(h.prisma.clientPowerOfAttorney.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.clientPowerOfAttorney.create.mock.calls[0][0].data.status).toBe('ACTIVE');
    expect(h.audit.log.mock.calls[0][0].metadata).toMatchObject({ status: 'created', poaId: 'poa-new' });
  });
});

describe('D-4 — update alan allowlist: lifecycle ve sahiplik yan kapidan gecemez', () => {
  it('status gonderimi -> 400 POA_FIELD_NOT_WRITABLE; yetki sorgusu ve yazma YOK', async () => {
    const h = buildHarness({ eligible: true });
    await expect(h.service.update(POA_ID, { status: 'REVOKED' } as any, TENANT, actor('ADMIN'))).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: 'POA_FIELD_NOT_WRITABLE', offendingFields: ['status'] }),
    });
    expectNoWrite(h);
    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it('isActive gonderimi -> 400; revoke yolu (elevated-only) tek lifecycle kapisi olarak kalir', async () => {
    const h = buildHarness();
    await expect(h.service.update(POA_ID, { isActive: true } as any, TENANT, actor('ADMIN'))).rejects.toMatchObject({
      response: expect.objectContaining({ offendingFields: ['isActive'] }),
    });
    expectNoWrite(h);
  });

  it('clientId ve dosya alanlari update ile yazilamaz (sahiplik/dosya ayri yollardan)', async () => {
    const h = buildHarness();
    await expect(
      h.service.update(POA_ID, { clientId: 'other', filePath: '/x', fileSize: 1, mimeType: 'application/pdf' } as any, TENANT, actor('ADMIN')),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        offendingFields: expect.arrayContaining(['clientId', 'filePath', 'fileSize', 'mimeType']),
      }),
    });
    expectNoWrite(h);
  });

  it('izin verilen alanlar yazilir; allowlist disi bilinmeyen alan sessizce DUSER (yazilmaz)', async () => {
    const h = buildHarness();
    await h.service.update(POA_ID, { notaryCity: 'ANKARA', bilinmeyenAlan: 'x' } as any, TENANT, actor('ADMIN'));
    const data = h.prisma.clientPowerOfAttorney.update.mock.calls[0][0].data;
    expect(data).toEqual({ notaryCity: 'ANKARA' });
    expect(data).not.toHaveProperty('bilinmeyenAlan');
  });

  it('projectPoaWritableInput sozlesmesi: UPDATE allowlist lifecycle/sahiplik/dosya alani ICERMEZ', () => {
    for (const forbidden of ['status', 'isActive', 'clientId', 'filePath', 'fileSize', 'mimeType', 'tenantId']) {
      expect(POA_UPDATE_WRITABLE_FIELDS).not.toContain(forbidden);
    }
    expect(projectPoaWritableInput({ notaryName: 'X', status: undefined }, 'UPDATE')).toEqual({ notaryName: 'X' });
    expect(() => projectPoaWritableInput({ status: 'ACTIVE' }, 'CREATE')).toThrow(BadRequestException);
  });
});

describe('D-4 — istek basina TEK karar + TEK audit (ic cagrilar ayri karar uretmez)', () => {
  it('create + lawyerIds: linkLawyers ic yoldan calisir, ikinci yetki karari/audit URETMEZ', async () => {
    const h = buildHarness();
    await h.service.create({ clientId: CLIENT_ID, lawyerIds: ['law-1', 'law-2'] } as any, TENANT, actor('ADMIN'));
    expect(h.prisma.poaLawyer.createMany).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log.mock.calls[0][0].metadata).toMatchObject({ commandType: 'POA_CREATE', lawyerCount: 2 });
  });

  it('update + lawyerIds: avukat degisimi ayni istegin parcasi, audit yine TEK', async () => {
    const h = buildHarness();
    await h.service.update(POA_ID, { lawyerIds: ['law-1'] } as any, TENANT, actor('ADMIN'));
    expect(h.prisma.poaLawyer.deleteMany).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log.mock.calls[0][0].metadata).toMatchObject({ commandType: 'POA_UPDATE', lawyersReplaced: true });
  });

  it('dedup/suppress dali: yeni kayit ACILMAZ, audit TEK ve status duplicate_suppressed', async () => {
    const h = buildHarness();
    const issued = new Date('2026-01-12');
    h.prisma.clientPowerOfAttorney.findMany.mockResolvedValue([
      { id: 'poa-existing', notaryName: 'NOTER', dateIssued: issued },
    ]);
    const res: any = await h.service.create({ clientId: CLIENT_ID, notaryName: 'NOTER', dateIssued: issued } as any, TENANT, actor('ADMIN'));
    expect(h.prisma.clientPowerOfAttorney.create).not.toHaveBeenCalled();
    expect(res._suppressedDuplicate).toBe(true);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log.mock.calls[0][0].metadata).toMatchObject({ status: 'duplicate_suppressed' });
  });

  it('yurutme hata verirse audit URETILMEZ (basarisiz mutasyon audit uretmez)', async () => {
    const h = buildHarness();
    h.prisma.clientPowerOfAttorney.create.mockRejectedValue(new Error('db down'));
    await expect(h.service.create({ clientId: CLIENT_ID } as any, TENANT, actor('ADMIN'))).rejects.toThrow('db down');
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('audit metadata ham PII tasimaz (yalniz komut/rol/durum sinifi alanlar)', async () => {
    const h = buildHarness();
    await h.service.create({ clientId: CLIENT_ID, notaryName: 'BÜLENT ÖVEN', scopeDescription: 'gizli kapsam' } as any, TENANT, actor('ADMIN'));
    const serialized = JSON.stringify(h.audit.log.mock.calls[0][0]);
    expect(serialized).not.toContain('BÜLENT');
    expect(serialized).not.toContain('gizli kapsam');
    expect(Object.keys(h.audit.log.mock.calls[0][0].metadata).sort()).toEqual(['actorRole', 'commandType', 'lawyerCount', 'poaId', 'status']);
  });
});

describe('D-4 — revoke (delete) elevated-only KALIR: ADMIN tek basina YETMEZ', () => {
  it('ADMIN ama eligible degil -> 403 (P1A mesaji) ve revoke yazimi YOK', async () => {
    const h = buildHarness({ eligible: false });
    await expect(h.service.delete(POA_ID, TENANT, { userId: 'user-1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.clientPowerOfAttorney.updateMany).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('elevated aktor -> revoke calisir (mevcut POA_REVOKE audit; workspace komutu DEGIL)', async () => {
    const h = buildHarness({ eligible: true });
    await h.service.delete(POA_ID, TENANT, { userId: 'user-1' });
    expect(h.prisma.clientPowerOfAttorney.updateMany).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTransaction.mock.calls[0][1]).toMatchObject({ action: 'POA_REVOKE' });
    expect(h.audit.log).not.toHaveBeenCalled();
  });
});

describe('D-4 — tenant-scoped okuma: bulunamayan/cross-tenant POA yazma URETMEZ', () => {
  it('update/addLawyers/removeLawyer/deleteFile: POA yoksa 404, yetki sorgusu ve yazma YOK', async () => {
    for (const invoke of [
      (h: Harness) => h.service.update(POA_ID, { notaryCity: 'X' } as any, TENANT, actor('ADMIN')),
      (h: Harness) => h.service.addLawyers(POA_ID, ['law-1'], TENANT, actor('ADMIN')),
      (h: Harness) => h.service.removeLawyer(POA_ID, 'law-1', TENANT, actor('ADMIN')),
      (h: Harness) => h.service.deleteFile(POA_ID, TENANT, actor('ADMIN')),
    ]) {
      const h = buildHarness({ poaFound: false });
      await expect(invoke(h)).rejects.toBeInstanceOf(NotFoundException);
      expectNoWrite(h);
    }
  });
});

describe('D-4 — controller aktoru YALNIZ sunucu tarafi JWT\'den alir', () => {
  const req = (role: string | undefined) => ({ user: { id: 'user-1', tenantId: TENANT, role } });

  it('bes rota da servise {userId, tenantId, role} iletir; govdeden aktor/tenant OKUNMAZ', async () => {
    const poaService: AnyRecord = {
      create: jest.fn().mockResolvedValue({ id: 'x' }),
      update: jest.fn().mockResolvedValue({ id: 'x' }),
      addLawyers: jest.fn().mockResolvedValue({ success: true }),
      removeLawyer: jest.fn().mockResolvedValue({ success: true }),
      deleteFile: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new PoaController(poaService as any);
    const expectedActor = { userId: 'user-1', tenantId: TENANT, role: 'ADMIN' };

    // Govdede sahte aktor/tenant alanlari: yok sayilmali.
    await controller.create({ clientId: CLIENT_ID, tenantId: 'tenant-2', userId: 'attacker' } as any, req('ADMIN'));
    await controller.update(POA_ID, { notaryCity: 'X' } as any, req('ADMIN'));
    await controller.addLawyers(POA_ID, { lawyerIds: ['law-1'] }, req('ADMIN'));
    await controller.removeLawyer(POA_ID, 'law-1', req('ADMIN'));
    await controller.deleteFile(POA_ID, req('ADMIN'));

    expect(poaService.create.mock.calls[0][1]).toBe(TENANT);
    expect(poaService.create.mock.calls[0][2]).toEqual(expectedActor);
    expect(poaService.update.mock.calls[0][3]).toEqual(expectedActor);
    expect(poaService.addLawyers.mock.calls[0][3]).toEqual(expectedActor);
    expect(poaService.removeLawyer.mock.calls[0][3]).toEqual(expectedActor);
    expect(poaService.deleteFile.mock.calls[0][2]).toEqual(expectedActor);
  });

  it('uctan uca (controller -> servis): VIEWER JWT ile create 403, yazma YOK', async () => {
    const h = buildHarness();
    const controller = new PoaController(h.service);
    await expect(controller.create({ clientId: CLIENT_ID } as any, req('VIEWER'))).rejects.toBeInstanceOf(ForbiddenException);
    expectNoWrite(h);
  });
});
