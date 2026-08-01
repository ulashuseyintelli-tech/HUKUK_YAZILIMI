import { AutomationService } from '../automation.service';

describe('AutomationService.sendExpiringPoaNotifications — POA_EXPIRY_NOTIFICATION_ENABLED flag gate', () => {
  const originalEnv = process.env.POA_EXPIRY_NOTIFICATION_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.POA_EXPIRY_NOTIFICATION_ENABLED;
    else process.env.POA_EXPIRY_NOTIFICATION_ENABLED = originalEnv;
  });

  function buildService(
    poaExpiryDeliveryService: { sendExpiringPoaNotifications: jest.Mock },
    debtorCrossCaseNotificationService: { expireStaleNotifications: jest.Mock } = { expireStaleNotifications: jest.fn() }
  ) {
    return new AutomationService(
      {} as any,
      {} as any,
      poaExpiryDeliveryService as any,
      debtorCrossCaseNotificationService as any,
      {} as any
    );
  }

  it('flag tanımsızken (default-OFF) cron no-op döner, delivery service çağrılmaz', async () => {
    delete process.env.POA_EXPIRY_NOTIFICATION_ENABLED;
    const poaExpiryDeliveryService = { sendExpiringPoaNotifications: jest.fn() };
    const service = buildService(poaExpiryDeliveryService);

    await service.sendExpiringPoaNotifications();

    expect(poaExpiryDeliveryService.sendExpiringPoaNotifications).not.toHaveBeenCalled();
  });

  it("flag='false' iken cron no-op döner", async () => {
    process.env.POA_EXPIRY_NOTIFICATION_ENABLED = 'false';
    const poaExpiryDeliveryService = { sendExpiringPoaNotifications: jest.fn() };
    const service = buildService(poaExpiryDeliveryService);

    await service.sendExpiringPoaNotifications();

    expect(poaExpiryDeliveryService.sendExpiringPoaNotifications).not.toHaveBeenCalled();
  });

  it("flag='true' iken mevcut davranış değişmeden çalışır (delivery service çağrılır)", async () => {
    process.env.POA_EXPIRY_NOTIFICATION_ENABLED = 'true';
    const poaExpiryDeliveryService = {
      sendExpiringPoaNotifications: jest.fn().mockResolvedValue({
        scanned: 3,
        recipients: 2,
        sent: 2,
        failed: 0,
        skipped: 1,
      }),
    };
    const service = buildService(poaExpiryDeliveryService);

    await service.sendExpiringPoaNotifications();

    expect(poaExpiryDeliveryService.sendExpiringPoaNotifications).toHaveBeenCalledTimes(1);
  });

  it("flag='TRUE' (büyük harf) de kabul edilir (case-insensitive)", async () => {
    process.env.POA_EXPIRY_NOTIFICATION_ENABLED = 'TRUE';
    const poaExpiryDeliveryService = {
      sendExpiringPoaNotifications: jest.fn().mockResolvedValue({ scanned: 0, recipients: 0, sent: 0, failed: 0, skipped: 0 }),
    };
    const service = buildService(poaExpiryDeliveryService);

    await service.sendExpiringPoaNotifications();

    expect(poaExpiryDeliveryService.sendExpiringPoaNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('AutomationService.expireCrossCaseNotifications — DBND-D6A-2-SURFACE cron wiring', () => {
  function buildServiceWithCrossCase(debtorCrossCaseNotificationService: { expireStaleNotifications: jest.Mock }) {
    return new AutomationService(
      {} as any,
      {} as any,
      { sendExpiringPoaNotifications: jest.fn() } as any,
      debtorCrossCaseNotificationService as any,
      {} as any
    );
  }

  it('calls DebtorCrossCaseNotificationService.expireStaleNotifications() with no args (tenant-wide sweep)', async () => {
    const debtorCrossCaseNotificationService = { expireStaleNotifications: jest.fn().mockResolvedValue(3) };
    const service = buildServiceWithCrossCase(debtorCrossCaseNotificationService);

    await service.expireCrossCaseNotifications();

    expect(debtorCrossCaseNotificationService.expireStaleNotifications).toHaveBeenCalledTimes(1);
    expect(debtorCrossCaseNotificationService.expireStaleNotifications).toHaveBeenCalledWith();
  });

  it('does not throw when zero notifications expire', async () => {
    const debtorCrossCaseNotificationService = { expireStaleNotifications: jest.fn().mockResolvedValue(0) };
    const service = buildServiceWithCrossCase(debtorCrossCaseNotificationService);

    await expect(service.expireCrossCaseNotifications()).resolves.toBeUndefined();
  });
});

describe('AutomationService.expireInactiveRecipientCrossCaseNotifications — DBND-D6-INACTIVE-RECIPIENT-SWEEP cron wiring', () => {
  function buildServiceWithInactiveSweep(debtorCrossCaseNotificationService: { expireStaleNotificationsForInactiveRecipients: jest.Mock }) {
    return new AutomationService(
      {} as any,
      {} as any,
      { sendExpiringPoaNotifications: jest.fn() } as any,
      debtorCrossCaseNotificationService as any,
      {} as any
    );
  }

  it('calls DebtorCrossCaseNotificationService.expireStaleNotificationsForInactiveRecipients() with no args (tenant-wide sweep)', async () => {
    const debtorCrossCaseNotificationService = {
      expireStaleNotificationsForInactiveRecipients: jest.fn().mockResolvedValue(2),
    };
    const service = buildServiceWithInactiveSweep(debtorCrossCaseNotificationService);

    await service.expireInactiveRecipientCrossCaseNotifications();

    expect(debtorCrossCaseNotificationService.expireStaleNotificationsForInactiveRecipients).toHaveBeenCalledTimes(1);
    expect(debtorCrossCaseNotificationService.expireStaleNotificationsForInactiveRecipients).toHaveBeenCalledWith();
  });

  it('does not throw when zero inactive-recipient notifications expire', async () => {
    const debtorCrossCaseNotificationService = {
      expireStaleNotificationsForInactiveRecipients: jest.fn().mockResolvedValue(0),
    };
    const service = buildServiceWithInactiveSweep(debtorCrossCaseNotificationService);

    await expect(service.expireInactiveRecipientCrossCaseNotifications()).resolves.toBeUndefined();
  });
});
