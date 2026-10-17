import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as nodemailer from 'nodemailer';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { GreetingService } from '../greeting.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error('Greeting delivery requires TEST_DATABASE_URL in CI.');
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('Greeting durable channel outcomes — PostgreSQL, no external providers', () => {
  jest.setTimeout(60_000);
  const tenantId = 'test-greeting-' + randomUUID();
  let db: PrismaClient, other: PrismaClient;
  let clientId: string, userId: string, officeId: string;
  const sendMail = jest.fn(), sendSms = jest.fn();
  const reporter = { report: jest.fn().mockResolvedValue(undefined) };
  const office = {
    getFullSmtpSettings: jest.fn().mockResolvedValue({ smtpHost: 'isolated.example.test', smtpUser: 'test@example.test' }),
    getFullSmsSettings: jest.fn().mockResolvedValue({ smsProvider: 'NETGSM', smsApiKey: 'isolated-test' }),
  };
  const make = (client: any = db) => {
    const notification = new ClientNotificationService(client, office as any);
    jest.spyOn(notification as any, 'sendNetGsmSms').mockImplementation((...args) => sendSms(...args));
    return { notification, greeting: new GreetingService(client, notification, reporter as any) };
  };
  const scheduled = () => {
    const { greeting } = make();
    jest.spyOn(greeting as any, 'findTenantsForGreetingTick').mockImplementation(async () => db.tenant.findMany({ where: { id: tenantId }, include: { office: true } }));
    jest.spyOn(greeting, 'findTodayGreetings').mockResolvedValue({ birthdays: [{ id: clientId, greetingChannel: 'BOTH' }], foundingAnniversaries: [], poaAnniversaries: [], specialDays: [], holidayClients: [] } as any);
    return greeting;
  };
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    other = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await Promise.all([db.$connect(), other.$connect()]);
    await db.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId, lifecycle: 'ACTIVE' } });
    userId = (await db.user.create({ data: { tenantId, email: 'admin@example.test', name: 'Admin', surname: 'Test', role: 'ADMIN' } })).id;
    clientId = (await db.client.create({ data: { tenantId, type: 'COMPANY', displayName: 'A & B', companyName: 'A & B', email: 'recipient@example.test', phone: '05551112233' } })).id;
    officeId = (await db.office.create({ data: { tenantId, name: 'Isolated', autoGreetingEnabled: true, autoGreetingTime: '00:00' } })).id;
  });
  beforeEach(async () => {
    sendMail.mockReset().mockResolvedValue({ messageId: 'isolated-mail' });
    sendSms.mockReset().mockResolvedValue('isolated-sms');
    reporter.report.mockClear();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    await db.clientNotification.deleteMany({ where: { tenantId } });
    await db.office.update({ where: { id: officeId }, data: { lastGreetingRunAt: null } });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await db.clientNotification.deleteMany({ where: { tenantId } });
    await db.specialDay.deleteMany({ where: { tenantId } });
    await db.office.deleteMany({ where: { tenantId } });
    await db.client.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await Promise.all([db.$disconnect(), other.$disconnect()]);
  });

  it('normal BOTH delivery and same-day replay use one persisted row/provider call per channel', async () => {
    const { greeting } = make();
    const first = await greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'BOTH');
    expect(first).toHaveLength(2);
    expect(first.every(result => result.sent && result.success)).toBe(true);
    const replay = await greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'BOTH');
    expect(replay.every(result => result.sent && result.alreadySent)).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
    const rows = await db.clientNotification.findMany({ where: { tenantId }, orderBy: { channel: 'asc' } });
    expect(rows.map(row => [row.channel, row.status])).toEqual([['EMAIL', 'SENT'], ['SMS', 'SENT']]);
    expect(rows.find(row => row.channel === 'SMS')!.body).toContain('A & B');
  });

  it('two independent pools cannot send the same channel twice', async () => {
    const one = make(db), two = make(other);
    await Promise.all([one.greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'BOTH'), two.greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'BOTH')]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(await db.clientNotification.count({ where: { tenantId, status: 'SENT' } })).toBe(2);
  });

  it('partial result does not stamp the day or blindly resend either channel on the next tick', async () => {
    sendSms.mockRejectedValue(new Error('isolated provider timeout'));
    const greeting = scheduled();
    await greeting.greetingSchedulerTick();
    expect((await db.office.findUniqueOrThrow({ where: { id: officeId } })).lastGreetingRunAt).toBeNull();
    expect(reporter.report).toHaveBeenCalledWith(expect.objectContaining({ source: 'CRON', operation: 'greeting.greetingSchedulerTick' }));
    const rows = await db.clientNotification.findMany({ where: { tenantId }, orderBy: { channel: 'asc' } });
    expect(rows.map(row => [row.channel, row.status])).toEqual([['EMAIL', 'SENT'], ['SMS', 'PENDING']]);
    sendSms.mockResolvedValue('would-duplicate');
    await greeting.greetingSchedulerTick();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect((await db.office.findUniqueOrThrow({ where: { id: officeId } })).lastGreetingRunAt).toBeNull();
  });

  it('definitive email failure is not success and normal replay never resends FAILED', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('isolated rejection'), { responseCode: 550 }));
    const { greeting } = make();
    expect((await greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'EMAIL'))[0].sent).toBe(false);
    const replay = await greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'EMAIL');
    expect(replay[0]).toMatchObject({ sent: false, status: 'FAILED' });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('SMS accepted but failed SENT write stays PENDING and cannot duplicate on replay', async () => {
    const extended = db.$extends({ query: { clientNotification: { async update({ args, query }) {
      if (args.data.status === 'SENT' && args.data.metadata) throw new Error('isolated SMS SENT write failure');
      return query(args);
    } } } });
    const { greeting } = make(extended);
    expect((await greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'SMS'))[0].sent).toBe(false);
    expect((await greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'SMS'))[0]).toMatchObject({ sent: false, status: 'PENDING' });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(await db.clientNotification.count({ where: { tenantId, channel: 'SMS', status: 'PENDING' } })).toBe(1);
  });

  it('all confirmed channels permit one daily stamp and the next tick sends nothing', async () => {
    const greeting = scheduled();
    await greeting.greetingSchedulerTick();
    expect((await db.office.findUniqueOrThrow({ where: { id: officeId } })).lastGreetingRunAt).not.toBeNull();
    await greeting.greetingSchedulerTick();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('invalid channel/type fail before provider or notification mutation', async () => {
    const { greeting } = make();
    await expect(greeting.sendGreeting(tenantId, userId, clientId, 'BIRTHDAY', 'UNKNOWN')).rejects.toMatchObject({ status: 400 });
    await expect(greeting.sendGreeting(tenantId, userId, clientId, 'UNKNOWN', 'EMAIL')).rejects.toMatchObject({ status: 400 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(await db.clientNotification.count({ where: { tenantId } })).toBe(0);
  });

  it('claim identity cannot be rebound to another client/channel and SMS cannot reuse an email slot', async () => {
    const { notification } = make();
    const dto = { clientId, type: 'TEBRIK', subject: 'Test', body: 'Test', dedupeKey: 'isolated-bound-slot' };
    const claim = await notification.claimNotificationSlot(tenantId, userId, dto);
    await expect(notification.claimNotificationSlot(tenantId, userId, { ...dto, clientId: 'foreign-target' })).rejects.toMatchObject({ status: 400 });
    await expect(notification.claimNotificationSlot(tenantId, userId, dto, 'SMS')).rejects.toMatchObject({ status: 400 });
    await expect(notification.sendSms(tenantId, userId, { clientId, type: 'TEBRIK', body: 'Test' }, { notificationId: claim.notificationId, dedupeKey: dto.dedupeKey })).rejects.toMatchObject({ status: 400 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(await db.clientNotification.count({ where: { tenantId, status: 'PENDING' } })).toBe(1);
  });
});
