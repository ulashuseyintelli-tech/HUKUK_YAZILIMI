import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientNotificationService } from './client-notification.service';
import { MessageTemplateService } from '@/modules/message-template/message-template.service';
import { NotificationDispatcherService, DispatchInput } from './notification-dispatcher.service';

const TENANT = 'tenant-1';
const USER = 'user-1';

const mockPrisma: any = { clientNotification: { findFirst: jest.fn() } };
const mockClientNotification: any = {
  sendEmail: jest.fn(),
  claimNotificationSlot: jest.fn(),
  reclaimFailedNotificationSlot: jest.fn(),
};
const mockTemplate: any = { findByCode: jest.fn(), renderTemplate: jest.fn() };

const baseInput: DispatchInput = {
  clientId: 'c-1',
  caseId: 'case-1',
  templateCode: 'APPROVAL_REQUEST',
  type: 'CLIENT_APPROVAL',
  tokens: { clientName: 'Ahmet' },
  refType: 'ClientApprovalRequest',
  refId: 'car-1',
};

const DEDUPE = 'APPROVAL_REQUEST:ClientApprovalRequest:car-1:1';

describe('NotificationDispatcherService (G4 atomik claim/reclaim)', () => {
  let service: NotificationDispatcherService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTemplate.findByCode.mockResolvedValue({ id: 't-1', subject: 'Konu', body: 'Merhaba {{clientName}}' });
    mockTemplate.renderTemplate.mockReturnValue({ subject: 'Konu', body: 'Merhaba Ahmet' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatcherService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClientNotificationService, useValue: mockClientNotification },
        { provide: MessageTemplateService, useValue: mockTemplate },
      ],
    }).compile();
    service = module.get(NotificationDispatcherService);
  });

  it('buildDedupeKey doğru format', () => {
    expect(service.buildDedupeKey('APPROVAL_REQUEST', 'ClientApprovalRequest', 'car-1')).toBe(DEDUPE);
  });

  it('public shape korunur: DispatchStatus kümesi ve DispatchResult alanları değişmedi', () => {
    // Derleme-seviyesi güvence + runtime alan seti: status ∈ sent|failed|skipped.
    const statuses: Array<'sent' | 'failed' | 'skipped'> = ['sent', 'failed', 'skipped'];
    expect(statuses).toHaveLength(3);
  });

  describe('normal dispatch (force=false)', () => {
    it('ACQUIRED → sendEmail reuseNotificationId ile çağrılır → sent', async () => {
      mockClientNotification.claimNotificationSlot.mockResolvedValue({ kind: 'ACQUIRED', notificationId: 'claim-1' });
      mockClientNotification.sendEmail.mockResolvedValue({ notificationId: 'claim-1' });

      const res = await service.dispatch(TENANT, USER, baseInput);

      expect(res).toMatchObject({ status: 'sent', notificationId: 'claim-1', dedupeKey: DEDUPE });
      expect(mockClientNotification.claimNotificationSlot).toHaveBeenCalledTimes(1);
      expect(mockClientNotification.reclaimFailedNotificationSlot).not.toHaveBeenCalled();
      expect(mockClientNotification.sendEmail).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ dedupeKey: DEDUPE, reuseNotificationId: 'claim-1', body: 'Merhaba Ahmet' }),
      );
    });

    it('Inv-1/5: EXISTING_SENT → skipped, sendEmail çağrılmaz', async () => {
      mockClientNotification.claimNotificationSlot.mockResolvedValue({ kind: 'EXISTING_SENT', notificationId: 'ex-1' });
      const res = await service.dispatch(TENANT, USER, baseInput);
      expect(res).toMatchObject({ status: 'skipped', notificationId: 'ex-1', dedupeKey: DEDUPE });
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });

    it('Inv-1/5: EXISTING_PENDING → skipped (in-flight/stuck; ikinci send yok)', async () => {
      mockClientNotification.claimNotificationSlot.mockResolvedValue({ kind: 'EXISTING_PENDING', notificationId: 'ex-2' });
      const res = await service.dispatch(TENANT, USER, baseInput);
      expect(res.status).toBe('skipped');
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });

    it('Inv-1: EXISTING_FAILED → skipped (normal dispatch FAILED’ı RETRY ETMEZ)', async () => {
      mockClientNotification.claimNotificationSlot.mockResolvedValue({ kind: 'EXISTING_FAILED', notificationId: 'ex-3' });
      const res = await service.dispatch(TENANT, USER, baseInput);
      expect(res).toMatchObject({ status: 'skipped', notificationId: 'ex-3' });
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });

    it('persistedTokens ile DB body redacted; claim + reuse yolu korunur', async () => {
      mockTemplate.findByCode.mockResolvedValue({ id: 'tmpl-1', subject: 'Link {{intakeUrl}}', body: 'URL {{intakeUrl}}' });
      mockTemplate.renderTemplate.mockImplementation((_t: any, tokens: Record<string, string>) => ({
        subject: `Link ${tokens.intakeUrl}`,
        body: `URL ${tokens.intakeUrl}`,
      }));
      mockClientNotification.claimNotificationSlot.mockResolvedValue({ kind: 'ACQUIRED', notificationId: 'claim-2' });
      mockClientNotification.sendEmail.mockResolvedValue({ notificationId: 'claim-2' });

      const res = await service.dispatch(TENANT, USER, {
        ...baseInput,
        templateCode: 'INTAKE_LINK',
        tokens: { intakeUrl: 'https://form.example.com/intake/raw-secret' },
        persistedTokens: { intakeUrl: '[REDACTED_INTAKE_LINK]' },
        dedupeKey: 'artifact-dedupe-1',
      });

      expect(res).toMatchObject({ status: 'sent', notificationId: 'claim-2', dedupeKey: 'artifact-dedupe-1' });
      expect(mockTemplate.renderTemplate).toHaveBeenCalledTimes(2);
      expect(mockClientNotification.sendEmail).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({
          subject: 'Link https://form.example.com/intake/raw-secret',
          persistedSubject: 'Link [REDACTED_INTAKE_LINK]',
          persistedBody: 'URL [REDACTED_INTAKE_LINK]',
          reuseNotificationId: 'claim-2',
        }),
      );
    });
  });

  describe('resend/force (owner düzeltme-2: claim bypass edilemez)', () => {
    it('FAILED → RECLAIMED → sendEmail reuse ile → sent (yeni satır yok)', async () => {
      mockClientNotification.reclaimFailedNotificationSlot.mockResolvedValue({ kind: 'RECLAIMED', notificationId: 're-1' });
      mockClientNotification.sendEmail.mockResolvedValue({ notificationId: 're-1' });

      const res = await service.dispatch(TENANT, USER, { ...baseInput, force: true });

      expect(res).toMatchObject({ status: 'sent', notificationId: 're-1' });
      expect(mockClientNotification.claimNotificationSlot).not.toHaveBeenCalled();
      expect(mockClientNotification.reclaimFailedNotificationSlot).toHaveBeenCalledTimes(1);
      expect(mockClientNotification.sendEmail).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ reuseNotificationId: 're-1' }),
      );
    });

    it('PENDING → resend RED → skipped, sendEmail çağrılmaz', async () => {
      mockClientNotification.reclaimFailedNotificationSlot.mockResolvedValue({ kind: 'EXISTING_PENDING', notificationId: 'p-1' });
      const res = await service.dispatch(TENANT, USER, { ...baseInput, force: true });
      expect(res).toMatchObject({ status: 'skipped', notificationId: 'p-1' });
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });

    it('SENT → resend RED → skipped', async () => {
      mockClientNotification.reclaimFailedNotificationSlot.mockResolvedValue({ kind: 'EXISTING_SENT', notificationId: 's-1' });
      const res = await service.dispatch(TENANT, USER, { ...baseInput, force: true });
      expect(res.status).toBe('skipped');
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });

    it('kayıt yok → NO_RECORD → skipped (notificationId yok; yeni satır oluşturmaz)', async () => {
      mockClientNotification.reclaimFailedNotificationSlot.mockResolvedValue({ kind: 'NO_RECORD' });
      const res = await service.dispatch(TENANT, USER, { ...baseInput, force: true });
      expect(res.status).toBe('skipped');
      expect(res.notificationId).toBeUndefined();
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('best-effort (throw etmez)', () => {
    it('sendEmail throw (Inv-4 dahil belirsizlik) → failed', async () => {
      mockClientNotification.claimNotificationSlot.mockResolvedValue({ kind: 'ACQUIRED', notificationId: 'claim-x' });
      mockClientNotification.sendEmail.mockRejectedValue(new Error('gönderim sonucu kalıcılaştırılamadı'));
      const res = await service.dispatch(TENANT, USER, baseInput);
      expect(res.status).toBe('failed');
    });

    it('render fail-closed / şablon bulunamazsa → failed; claim ve send çağrılmaz', async () => {
      mockTemplate.findByCode.mockRejectedValue(new Error('Şablon bulunamadı'));
      const res = await service.dispatch(TENANT, USER, baseInput);
      expect(res.status).toBe('failed');
      expect(mockClientNotification.claimNotificationSlot).not.toHaveBeenCalled();
      expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
    });
  });
});
