import * as nodemailer from 'nodemailer';
import { ClientNotificationService } from './client-notification.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('ClientNotificationService bulk email security', () => {
  const sendMail = jest.fn();
  const prisma: any = {
    client: { findMany: jest.fn() },
    debtor: { findMany: jest.fn() },
    clientNotification: { create: jest.fn() },
  };
  const office: any = { getFullSmtpSettings: jest.fn() };
  let service: ClientNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'message-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        email: 'client@example.com',
        displayName: '<img src=x onerror=alert(1)>',
      },
    ]);
    prisma.clientNotification.create.mockResolvedValue({ id: 'notification-1' });
    office.getFullSmtpSettings.mockResolvedValue({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'smtp-user',
      smtpPass: 'smtp-pass',
      smtpFromEmail: 'office@example.com',
    });
    service = new ClientNotificationService(prisma, office);
  });

  it('sends user-controlled bulk content as plain text instead of executable HTML', async () => {
    const message = 'First line\n<script>alert(1)</script>';

    await service.sendBulkEmail('tenant-1', 'user-1', {
      recipients: ['client-1'],
      subject: 'Subject',
      message,
      type: 'clients',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'office@example.com',
      to: 'client@example.com',
      subject: 'Subject',
      text: `Sayın <img src=x onerror=alert(1)>,\n\n${message}`,
    });
    expect(sendMail.mock.calls[0][0]).not.toHaveProperty('html');
  });
});
