import * as nodemailer from 'nodemailer';
import { ClientNotificationService } from './client-notification.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const TENANT = 'tenant-1';
const USER = 'user-1';

const mockPrisma: any = {
  client: { findFirst: jest.fn() },
  clientNotification: { create: jest.fn(), update: jest.fn() },
};

const mockOffice: any = {
  getFullSmtpSettings: jest.fn(),
};

describe('ClientNotificationService secret redaction persistence', () => {
  let service: ClientNotificationService;
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'message-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    mockPrisma.client.findFirst.mockResolvedValue({
      id: 'client-1',
      email: 'fallback@example.com',
      contacts: [{ type: 'EMAIL', isPrimary: true, value: 'client@example.com' }],
    });
    mockPrisma.clientNotification.create.mockResolvedValue({ id: 'notification-1' });
    mockPrisma.clientNotification.update.mockResolvedValue({ id: 'notification-1', status: 'SENT' });
    mockOffice.getFullSmtpSettings.mockResolvedValue({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'smtp-user',
      smtpPass: 'smtp-pass',
      smtpFromName: 'Office',
      smtpFromEmail: 'office@example.com',
    });
    service = new ClientNotificationService(mockPrisma, mockOffice);
  });

  it('sends actual email body but persists redacted subject/body when provided', async () => {
    const actualUrl = 'https://form.example.com/intake/raw-secret-token';

    const res = await service.sendEmail(TENANT, USER, {
      clientId: 'client-1',
      caseId: 'case-1',
      type: 'CLIENT_INFO',
      subject: `Intake ${actualUrl}`,
      body: `Open ${actualUrl}`,
      persistedSubject: 'Intake [REDACTED_INTAKE_LINK]',
      persistedBody: 'Open [REDACTED_INTAKE_LINK]',
      dedupeKey: 'artifact-dedupe-1',
    });

    expect(res).toMatchObject({ success: true, notificationId: 'notification-1', recipient: 'client@example.com' });
    expect(mockPrisma.clientNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT,
        clientId: 'client-1',
        caseId: 'case-1',
        channel: 'EMAIL',
        type: 'CLIENT_INFO',
        subject: 'Intake [REDACTED_INTAKE_LINK]',
        body: 'Open [REDACTED_INTAKE_LINK]',
        status: 'PENDING',
        sentById: USER,
        dedupeKey: 'artifact-dedupe-1',
      }),
    });
    expect(JSON.stringify(mockPrisma.clientNotification.create.mock.calls[0][0].data)).not.toContain(actualUrl);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'client@example.com',
      subject: `Intake ${actualUrl}`,
      html: `Open ${actualUrl}`,
    }));
  });
});