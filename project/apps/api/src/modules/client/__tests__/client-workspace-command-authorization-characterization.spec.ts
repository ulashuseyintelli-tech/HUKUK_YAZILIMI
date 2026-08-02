/**
 * C2-B02 (R4 / FIND-C2) — WORKSPACE KOMUT YETKİLENDİRMESİ: CHARACTERIZATION ONLY.
 *
 * Bu spec MEVCUT davranışı SABİTLER (pin), düzeltmez. Owner §13/11 "iletişim/workspace
 * gönderim rol politikası" kararı HENÜZ RATİFİYE DEĞİL; karar gelmeden rol eşiği koda
 * yazılamaz (implementation-layer policy invention YASAK). Karar ratifiye edilip B02
 * implementation'ı geldiğinde bu testlerin bir kısmı BİLİNÇLİ olarak güncellenecektir
 * (yetkisiz dispatch → 403 + reasonCode + audit).
 *
 * Sabitlenen mevcut davranış (FIND-C2):
 *   1. Beş workspace komut endpoint'i rol KONTROLSÜZ — VIEWER dahil, hatta tanınmayan
 *      rol dahil, her authenticated tenant kullanıcısı dispatch edebiliyor.
 *   2. Controller aktör ROLÜNÜ servise İLETMİYOR (sendPoaReminder aktörü HİÇ almıyor;
 *      diğerleri yalnız attribution amaçlı userId taşıyor) → servis sınırında yetki
 *      kararı MEVCUT İMZALARLA verilemez.
 *   3. send komutları officeApproval.isApproverEligible'a ve client-mutation-policy'ye
 *      HİÇ danışmıyor; AuditLog ÜRETMİYOR (yalnız artefakt satırı / createdById).
 */
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';

type AnyRecord = Record<string, any>;

function buildControllerHarness() {
  const clientService: AnyRecord = {
    sendPoaReminder: jest.fn().mockResolvedValue({ clientId: 'client-1', status: 'sent' }),
    sendTemplateNotification: jest.fn().mockResolvedValue({ status: 'sent' }),
    sendDocumentRequest: jest.fn().mockResolvedValue({ status: 'sent' }),
  };
  const intakeLinkService: AnyRecord = {
    createForClientWorkspace: jest.fn().mockResolvedValue({ id: 'intake-1' }),
    createAndDeliverForClientWorkspace: jest.fn().mockResolvedValue({ id: 'intake-1', delivery: 'sent' }),
  };
  const poaService: AnyRecord = {
    uploadFileForClientWorkspace: jest.fn().mockResolvedValue({ poaId: 'poa-1', status: 'uploaded' }),
  };
  const controller = new ClientController(
    clientService as any,
    intakeLinkService as any,
    poaService as any,
  );
  // DTO doğrulaması bu spec'in konusu DEĞİL (yetki karakterizasyonu). Pipe'lar
  // pass-through spy'lanır; DTO kuralları kendi command spec'lerinde test ediliyor.
  for (const pipeName of ['templateNotificationBodyPipe', 'documentRequestBodyPipe', 'intakeLinkBodyPipe']) {
    const pipe = (controller as AnyRecord)[pipeName];
    if (pipe && typeof pipe.transform === 'function') {
      jest.spyOn(pipe, 'transform').mockImplementation(async (value: any) => value);
    }
  }
  return { controller, clientService, intakeLinkService, poaService };
}

function reqAs(role: string | undefined) {
  return { user: { id: 'user-1', tenantId: 'tenant-1', role } } as any;
}

const pdfFile = {
  fieldname: 'file',
  originalname: 'poa.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('pdf'),
} as any;

describe('C2-B02 characterization — workspace komutları rol KONTROLSÜZ dispatch ediyor (FIND-C2)', () => {
  const roles: Array<string | undefined> = ['VIEWER', 'STAJYER_BILINMEYEN_ROL'];

  for (const role of roles) {
    describe(`aktör rolü=${String(role)} (yetki reddi BEKLENMİYOR — mevcut davranış)`, () => {
      it('POST :clientId/poa-reminders/send → servise ulaşır; aktör kimliği HİÇ iletilmez', async () => {
        const { controller, clientService } = buildControllerHarness();

        const result = await controller.sendPoaReminder(reqAs(role), 'client-1');

        // Rol ne olursa olsun dispatch servise ULAŞIR (rol kapısı YOK).
        expect(clientService.sendPoaReminder).toHaveBeenCalledTimes(1);
        // İmza aktör TAŞIMAZ: yalnız clientId + tenantId → servis yetki kararı VEREMEZ.
        expect(clientService.sendPoaReminder).toHaveBeenCalledWith('client-1', 'tenant-1');
        expect(result).toEqual({ data: { clientId: 'client-1', status: 'sent' } });
      });

      it('POST :clientId/template-notifications/send → servise ulaşır; rol iletilmez, yalnız userId', async () => {
        const { controller, clientService } = buildControllerHarness();

        await controller.sendTemplateNotification(
          reqAs(role), 'client-1', 'idem-1',
          { templateCode: 'DOSYA_DURUMU', caseId: 'case-1' },
        );

        expect(clientService.sendTemplateNotification).toHaveBeenCalledTimes(1);
        expect(clientService.sendTemplateNotification).toHaveBeenCalledWith(
          'client-1', 'tenant-1', 'user-1', 'idem-1',
          expect.objectContaining({ templateCode: 'DOSYA_DURUMU' }),
        );
      });

      it('POST :clientId/document-requests/send → servise ulaşır; rol iletilmez, yalnız userId', async () => {
        const { controller, clientService } = buildControllerHarness();

        await controller.sendDocumentRequest(
          reqAs(role), 'client-1', 'idem-1',
          { requestedDocuments: ['KIMLIK'] },
        );

        expect(clientService.sendDocumentRequest).toHaveBeenCalledTimes(1);
        expect(clientService.sendDocumentRequest).toHaveBeenCalledWith(
          'client-1', 'tenant-1', 'user-1', 'idem-1',
          expect.objectContaining({ requestedDocuments: ['KIMLIK'] }),
        );
      });

      it('POST :clientId/cases/:caseId/intake-links → servise ulaşır (create-only)', async () => {
        const { controller, intakeLinkService } = buildControllerHarness();

        await controller.createIntakeLink(reqAs(role), 'client-1', 'case-1', { channel: 'EMAIL' });

        expect(intakeLinkService.createForClientWorkspace).toHaveBeenCalledTimes(1);
        expect(intakeLinkService.createForClientWorkspace).toHaveBeenCalledWith(
          'tenant-1', 'client-1', 'case-1', 'user-1',
          expect.objectContaining({ channel: 'EMAIL' }),
        );
      });

      it('POST :clientId/cases/:caseId/intake-links/create-and-deliver → servise ulaşır', async () => {
        const { controller, intakeLinkService } = buildControllerHarness();

        await controller.createAndDeliverIntakeLink(reqAs(role), 'client-1', 'case-1', 'idem-1', { channel: 'EMAIL' });

        expect(intakeLinkService.createAndDeliverForClientWorkspace).toHaveBeenCalledTimes(1);
        expect(intakeLinkService.createAndDeliverForClientWorkspace).toHaveBeenCalledWith(
          'tenant-1', 'client-1', 'case-1', 'user-1', 'idem-1',
          expect.objectContaining({ channel: 'EMAIL' }),
        );
      });

      it('POST :clientId/poas/:poaId/file → servise ulaşır; aktör kimliği HİÇ iletilmez', async () => {
        const { controller, poaService } = buildControllerHarness();

        await controller.uploadPoaFile(reqAs(role), 'client-1', 'poa-1', pdfFile);

        expect(poaService.uploadFileForClientWorkspace).toHaveBeenCalledTimes(1);
        // İmza aktör TAŞIMAZ: clientId + poaId + file + tenantId.
        expect(poaService.uploadFileForClientWorkspace).toHaveBeenCalledWith(
          'client-1', 'poa-1', pdfFile, 'tenant-1',
        );
      });
    });
  }
});

describe('C2-B02 characterization — send komutları servis sınırında yetkiye DANIŞMIYOR ve audit ÜRETMİYOR', () => {
  function buildServiceHarness() {
    const prisma: AnyRecord = {
      client: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'validated-client',
          name: 'Acme',
          firstName: null,
          lastName: null,
          email: 'client@example.com',
        }),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-1',
          fileNumber: 'F-2026-1',
          executionFileNumber: '2026/10',
          executionOffice: { name: 'Istanbul 1. Icra' },
        }),
      },
      auditLog: { create: jest.fn() },
      messageTemplate: { count: jest.fn().mockResolvedValue(1) },
      clientDocumentRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'doc-req-1' }),
        update: jest.fn().mockResolvedValue({ id: 'doc-req-1' }),
      },
    };
    const audit = { log: jest.fn(), logInTransaction: jest.fn() };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(false) };
    const poaDelivery = {
      sendExpiringPoaNotificationsForClient: jest.fn().mockResolvedValue({
        scanned: 1, recipients: 1, sent: 1, failed: 0, skipped: 0,
      }),
    };
    const dispatcher = {
      dispatch: jest.fn().mockResolvedValue({ status: 'sent', notificationId: 'n-1', dedupeKey: 'dk' }),
    };
    const svc = new ClientService(
      prisma as any, audit as any, officeApproval as any, poaDelivery as any, dispatcher as any,
    );
    return { svc, prisma, audit, officeApproval, poaDelivery, dispatcher };
  }

  it('sendPoaReminder: isApproverEligible HİÇ sorgulanmaz; AuditLog üretilmez', async () => {
    const { svc, officeApproval, audit, prisma } = buildServiceHarness();

    await svc.sendPoaReminder('client-1', 'tenant-1');

    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('sendTemplateNotification: isApproverEligible HİÇ sorgulanmaz; AuditLog üretilmez; dispatch olur', async () => {
    const { svc, officeApproval, audit, prisma, dispatcher } = buildServiceHarness();

    await svc.sendTemplateNotification(
      'client-1', 'tenant-1', 'user-1', 'idem-1',
      { templateCode: 'DOSYA_DURUMU', caseId: 'case-1' } as any,
    );

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('sendDocumentRequest: isApproverEligible HİÇ sorgulanmaz; AuditLog üretilmez; dispatch olur', async () => {
    const { svc, officeApproval, audit, prisma, dispatcher } = buildServiceHarness();

    await svc.sendDocumentRequest(
      'client-1', 'tenant-1', 'user-1', 'idem-1',
      { documentCodes: ['GENEL_BELGE'], caseId: 'case-1' } as any,
    );

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
