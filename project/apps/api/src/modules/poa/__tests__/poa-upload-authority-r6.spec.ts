/**
 * OWN-13 I02-R6 — LEGACY POA UPLOAD SERVİS-GİRİŞ KAPISI (owner §13/11 eşiği; C2-B02 ile AYNI primitive).
 *
 * Kapatılan boşluk: `POST /poa/:id/upload` (PoaController.uploadFile → PoaService.uploadFile)
 * yalnız JwtAuthGuard taşıyordu; VIEWER ve elevated olmayan USER vekalet dosyasını yükleyip
 * mevcut dosyayı değiştirebiliyordu ve hiçbir AuditLog üretilmiyordu. Workspace rotası
 * (`POST /clients/:clientId/poas/:poaId/file`) C2-B02 ile zaten kapılıydı.
 *
 * Ratifiye davranış (§13/11, komut tipi POA_FILE_UPLOAD):
 *   - Kapı SERVİS girişinde (`PoaService.uploadFile`), gerçek yan etkiden ÖNCE; `actor` ZORUNLU.
 *   - Eşik: ADMIN VEYA canonical elevated (`officeApproval.isApproverEligible`); VIEWER ve
 *     tanımsız rol fail-closed (403 + stabil reasonCode); cross-tenant aktör TENANT_MISMATCH.
 *   - Yetkisiz aktörde dosya/DB yazımı ve audit OLMAZ; `isApproverEligible` yalnız gerektiğinde.
 *   - Başarılı yükleme `CLIENT_WORKSPACE_COMMAND` AuditLog üretir (commandType/actorRole/poaId/
 *     status); persist hata verirse audit ÜRETİLMEZ. Legacy response sözleşmesi DEĞİŞMEDİ.
 *   - Controller rol politikası ÜRETMEZ; yalnız JWT aktörünü servise iletir.
 *   - Workspace wrapper gated girişten DEĞİL persist adımından geçer (istek başına TEK audit) —
 *     kanıt: client/__tests__/client-poa-upload-command.spec.ts.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CLIENT_MUTATION_REASON } from '../../client/client-mutation-policy';
import { PoaController } from '../poa.controller';
import { PoaService } from '../poa.service';

type AnyRecord = Record<string, any>;

const TENANT = 'tenant-1';
const POA_ID = 'poa-1';
const CLIENT_ID = 'client-1';

function buildFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'vekalet-gizli-ad.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1234,
    buffer: Buffer.from('poa-file'),
    stream: undefined as any,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function buildHarness(opts: { poaFound?: boolean; eligible?: boolean; persistError?: Error } = {}) {
  const { poaFound = true, eligible = false, persistError } = opts;
  const prisma: AnyRecord = {
    clientPowerOfAttorney: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          poaFound
            ? { id: POA_ID, clientId: CLIENT_ID, filePath: null, client: { id: CLIENT_ID }, lawyers: [] }
            : null,
        ),
      update: jest.fn(),
    },
  };
  const audit: AnyRecord = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn() };
  const officeApproval: AnyRecord = { isApproverEligible: jest.fn().mockResolvedValue(eligible) };
  const service = new PoaService(prisma as any, audit as any, officeApproval as any);
  // Persist adiminin ic sonucu (filePath tasir); D-5: legacy YANIT bunu asla disari vermez.
  const persistResult = {
    success: true,
    filePath: 'C:/secret/storage/tenant-1/poa-1.pdf',
    fileSize: 1234,
    mimeType: 'application/pdf',
  };
  const persist = jest.spyOn(service as any, 'persistPoaFile').mockImplementation(async () => {
    if (persistError) throw persistError;
    return persistResult;
  });
  // D-5: legacy `POST /poa/:id/upload` yanit sozlesmesi — filePath YOK.
  const legacyResponse = { success: true, hasFile: true, fileSize: 1234, mimeType: 'application/pdf' };
  return { service, prisma, audit, officeApproval, persist, persistResult, legacyResponse };
}

const actor = (role: string | undefined, tenantId: string = TENANT) => ({ userId: 'user-1', tenantId, role });

function expectNoSideEffects(h: ReturnType<typeof buildHarness>) {
  expect(h.persist).not.toHaveBeenCalled();
  expect(h.prisma.clientPowerOfAttorney.update).not.toHaveBeenCalled();
  expect(h.audit.log).not.toHaveBeenCalled();
}

describe('PoaService.uploadFile — OWN-13 I02-R6 servis-giriş kapısı (legacy POST /poa/:id/upload)', () => {
  it('VIEWER -> 403 VIEWER_DENIED; persist/DB/audit YOK, eligibility sorgusu YOK', async () => {
    const h = buildHarness();
    await expect(h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('VIEWER'))).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED }),
    });
    expectNoSideEffects(h);
    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it('tanımsız rol -> 403 UNKNOWN_ROLE (fail-closed); persist/audit YOK, eligibility YOK', async () => {
    const h = buildHarness();
    await expect(h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('BILINMEYEN_ROL'))).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE }),
    });
    expectNoSideEffects(h);
    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it('aktör bağlamı yok (boş userId) -> 403 NO_ACTOR; persist/audit YOK', async () => {
    const h = buildHarness();
    await expect(
      h.service.uploadFile(POA_ID, buildFile(), TENANT, { userId: '', tenantId: TENANT, role: 'ADMIN' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR }),
    });
    expectNoSideEffects(h);
  });

  it('USER (eligible değil) -> 403 WORKSPACE_COMMAND_DENIED; eligibility BİR kez (user-1, tenant-1); persist/audit YOK', async () => {
    const h = buildHarness({ eligible: false });
    await expect(h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('USER'))).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED }),
    });
    expectNoSideEffects(h);
    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledTimes(1);
    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith('user-1', TENANT);
  });

  it('aktör tenant ≠ hedef tenant -> 403 TENANT_MISMATCH (ADMIN olsa bile); eligibility/persist/audit YOK', async () => {
    const h = buildHarness();
    await expect(h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('ADMIN', 'tenant-2'))).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH }),
    });
    expectNoSideEffects(h);
    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
  });

  it('vekalet yok / cross-tenant (tenant-scoped okuma) -> 404; ADMIN olsa bile persist/audit YOK', async () => {
    const h = buildHarness({ poaFound: false });
    await expect(h.service.uploadFile('poa-foreign', buildFile(), TENANT, actor('ADMIN'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.prisma.clientPowerOfAttorney.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'poa-foreign', client: { tenantId: TENANT } } }),
    );
    expectNoSideEffects(h);
  });

  it('ADMIN -> persist (poaId/file/tenant) çalışır, eligibility HİÇ sorgulanmaz, TEK CLIENT_WORKSPACE_COMMAND audit; legacy yanit filePath TASIMAZ (D-5)', async () => {
    const h = buildHarness();
    const file = buildFile();

    const result = await h.service.uploadFile(POA_ID, file, TENANT, actor('ADMIN'));

    expect(result).toEqual(h.legacyResponse);
    expect(JSON.stringify(result)).not.toContain('filePath');
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.persist).toHaveBeenCalledWith(POA_ID, file, TENANT);
    expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith({
      tenantId: TENANT,
      userId: 'user-1',
      action: 'CLIENT_WORKSPACE_COMMAND',
      entityType: 'Client',
      entityId: CLIENT_ID,
      metadata: { commandType: 'POA_FILE_UPLOAD', actorRole: 'ADMIN', poaId: POA_ID, status: 'uploaded' },
    });
  });

  it('elevated USER (isApproverEligible=true) -> persist + audit; eligibility (user-1, tenant-1) ile BİR kez', async () => {
    const h = buildHarness({ eligible: true });

    await h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('USER'));

    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledTimes(1);
    expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith('user-1', TENANT);
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log.mock.calls[0][0].metadata).toMatchObject({ commandType: 'POA_FILE_UPLOAD', actorRole: 'USER' });
  });

  it('sıra kanıtı: yetki (eligibility) persist\'ten ÖNCE, audit persist\'ten SONRA', async () => {
    const h = buildHarness({ eligible: true });

    await h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('USER'));

    const eligibilityOrder = h.officeApproval.isApproverEligible.mock.invocationCallOrder[0];
    const persistOrder = h.persist.mock.invocationCallOrder[0];
    const auditOrder = h.audit.log.mock.invocationCallOrder[0];
    expect(eligibilityOrder).toBeLessThan(persistOrder);
    expect(persistOrder).toBeLessThan(auditOrder);
  });

  it('persist hata verirse hata çağırana gider ve audit ÜRETİLMEZ (başarısız komut audit üretmez)', async () => {
    const h = buildHarness({ persistError: new Error('disk dolu') });

    await expect(h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('ADMIN'))).rejects.toThrow('disk dolu');

    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('audit metadata ham PII / dosya adı / depolama yolu taşımaz (yalnız commandType/actorRole/poaId/status)', async () => {
    const h = buildHarness();

    await h.service.uploadFile(POA_ID, buildFile(), TENANT, actor('ADMIN'));

    const metadata = h.audit.log.mock.calls[0][0].metadata;
    expect(Object.keys(metadata).sort()).toEqual(['actorRole', 'commandType', 'poaId', 'status']);
    const serialized = JSON.stringify(h.audit.log.mock.calls[0][0]);
    expect(serialized).not.toContain('vekalet-gizli-ad');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('storage');
  });
});

describe('PoaController.uploadFile — JWT aktörü servise iletilir (rol politikası controller\'da ÜRETİLMEZ)', () => {
  it('PoaService.uploadFile (id, file, tenantId, {userId, tenantId, role}) ile çağrılır', async () => {
    const poaService = { uploadFile: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new PoaController(poaService as any);
    const file = buildFile();
    const req = { user: { id: 'user-1', tenantId: TENANT, role: 'USER' } };

    await expect(controller.uploadFile(POA_ID, file, req)).resolves.toEqual({ success: true });

    expect(poaService.uploadFile).toHaveBeenCalledTimes(1);
    expect(poaService.uploadFile).toHaveBeenCalledWith(POA_ID, file, TENANT, {
      userId: 'user-1',
      tenantId: TENANT,
      role: 'USER',
    });
  });

  it('geçersiz dosya servis çağrılmadan 400 ile reddedilir (mevcut davranış korunur)', async () => {
    const poaService = { uploadFile: jest.fn() };
    const controller = new PoaController(poaService as any);
    const req = { user: { id: 'user-1', tenantId: TENANT, role: 'ADMIN' } };

    await expect(controller.uploadFile(POA_ID, buildFile({ mimetype: 'text/plain' }), req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(poaService.uploadFile).not.toHaveBeenCalled();
  });
});

describe('Controller → servis zinciri (DB/dosya mock; gercek HTTP/DB E2E DEGIL) — legacy rota', () => {
  it('VIEWER JWT ile POST /poa/:id/upload akışı 403 ForbiddenException üretir; yazma/audit YOK', async () => {
    const h = buildHarness();
    const controller = new PoaController(h.service);

    await expect(
      controller.uploadFile(POA_ID, buildFile(), { user: { id: 'user-1', tenantId: TENANT, role: 'VIEWER' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expectNoSideEffects(h);
  });

  it('ADMIN JWT ile akış persist + TEK audit üretir; legacy yanıt filePath taşımaz (D-5)', async () => {
    const h = buildHarness();
    const controller = new PoaController(h.service);

    const result = await controller.uploadFile(POA_ID, buildFile(), {
      user: { id: 'user-1', tenantId: TENANT, role: 'ADMIN' },
    });

    expect(result).toEqual(h.legacyResponse);
    expect(JSON.stringify(result)).not.toContain('filePath');
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
  });
});
