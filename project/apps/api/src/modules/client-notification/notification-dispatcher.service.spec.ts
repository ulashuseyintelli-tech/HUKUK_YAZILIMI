import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientNotificationService } from './client-notification.service';
import { MessageTemplateService } from '@/modules/message-template/message-template.service';
import { NotificationDispatcherService, DispatchInput } from './notification-dispatcher.service';

const TENANT = 'tenant-1';
const USER = 'user-1';

const mockPrisma: any = {
  clientNotification: { findFirst: jest.fn() },
};
const mockClientNotification: any = { sendEmail: jest.fn() };
const mockTemplate: any = {
  findByCode: jest.fn(),
  renderTemplate: jest.fn(),
};

const baseInput: DispatchInput = {
  clientId: 'c-1',
  caseId: 'case-1',
  templateCode: 'APPROVAL_REQUEST',
  type: 'CLIENT_APPROVAL',
  tokens: { clientName: 'Ahmet' },
  refType: 'ClientApprovalRequest',
  refId: 'car-1',
};

describe('NotificationDispatcherService', () => {
  let service: NotificationDispatcherService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
    expect(service.buildDedupeKey('APPROVAL_REQUEST', 'ClientApprovalRequest', 'car-1')).toBe(
      'APPROVAL_REQUEST:ClientApprovalRequest:car-1:1',
    );
  });

  it('SENT yoksa gönderir (dedupeKey ile sendEmail çağrılır)', async () => {
    mockPrisma.clientNotification.findFirst.mockResolvedValue(null);
    mockTemplate.findByCode.mockResolvedValue({ id: 't-1', subject: 'Konu', body: 'Merhaba {{clientName}}' });
    mockTemplate.renderTemplate.mockReturnValue({ subject: 'Konu', body: 'Merhaba Ahmet' });
    mockClientNotification.sendEmail.mockResolvedValue({ notificationId: 'n-1' });

    const res = await service.dispatch(TENANT, USER, baseInput);

    expect(res.status).toBe('sent');
    expect(res.dedupeKey).toBe('APPROVAL_REQUEST:ClientApprovalRequest:car-1:1');
    expect(mockClientNotification.sendEmail).toHaveBeenCalledWith(
      TENANT,
      USER,
      expect.objectContaining({ dedupeKey: 'APPROVAL_REQUEST:ClientApprovalRequest:car-1:1', body: 'Merhaba Ahmet' }),
    );
  });

  it('aynı dedupeKey SENT varsa GÖNDERMEZ (idempotent skip)', async () => {
    mockPrisma.clientNotification.findFirst.mockResolvedValue({ id: 'existing-1' });
    const res = await service.dispatch(TENANT, USER, baseInput);
    expect(res.status).toBe('skipped');
    expect(res.notificationId).toBe('existing-1');
    expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
  });

  it('force=true → SENT olsa bile gönderir (idempotency atlanır)', async () => {
    mockTemplate.findByCode.mockResolvedValue({ id: 't-1', subject: 'Konu', body: 'x' });
    mockTemplate.renderTemplate.mockReturnValue({ subject: 'Konu', body: 'x' });
    mockClientNotification.sendEmail.mockResolvedValue({ notificationId: 'n-2' });

    const res = await service.dispatch(TENANT, USER, { ...baseInput, force: true });
    expect(res.status).toBe('sent');
    expect(mockPrisma.clientNotification.findFirst).not.toHaveBeenCalled();
    expect(mockClientNotification.sendEmail).toHaveBeenCalled();
  });

  it('sendEmail throw ederse YUTULUR (throw etmez, failed döner)', async () => {
    mockPrisma.clientNotification.findFirst.mockResolvedValue(null);
    mockTemplate.findByCode.mockResolvedValue({ id: 't-1', subject: 'K', body: 'x' });
    mockTemplate.renderTemplate.mockReturnValue({ subject: 'K', body: 'x' });
    mockClientNotification.sendEmail.mockRejectedValue(new Error('SMTP yok'));

    const res = await service.dispatch(TENANT, USER, baseInput);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('SMTP yok');
    // throw ETMEDİ → buraya gelindi
  });

  it('şablon bulunamazsa da throw etmez (failed)', async () => {
    mockPrisma.clientNotification.findFirst.mockResolvedValue(null);
    mockTemplate.findByCode.mockRejectedValue(new Error('Şablon bulunamadı'));
    const res = await service.dispatch(TENANT, USER, baseInput);
    expect(res.status).toBe('failed');
    expect(mockClientNotification.sendEmail).not.toHaveBeenCalled();
  });
});
