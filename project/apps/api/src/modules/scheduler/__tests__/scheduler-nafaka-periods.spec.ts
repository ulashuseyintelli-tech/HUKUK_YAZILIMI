jest.mock(
  '@nestjs/schedule',
  () => ({
    Cron: () => () => undefined,
    CronExpression: {
      EVERY_DAY_AT_9AM: '0 9 * * *',
      EVERY_DAY_AT_10AM: '0 10 * * *',
      EVERY_DAY_AT_11AM: '0 11 * * *',
      EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
      EVERY_6_HOURS: '0 */6 * * *',
      EVERY_HOUR: '0 * * * *',
    },
  }),
  { virtual: true },
);

jest.mock(
  '@prisma/client',
  () => ({
    DueType: {
      PRINCIPAL: 'PRINCIPAL',
      NAFAKA: 'NAFAKA',
    },
  }),
  { virtual: true },
);

jest.mock('../../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../../tebligat/tebligat.service', () => ({
  TebligatService: class TebligatService {},
}));

import { SchedulerService } from '../scheduler.service';
import { DueType } from '@prisma/client';

describe('SchedulerService nafaka dönem üretimi', () => {
  const period = 'Haziran 2026';
  const periodDescription = `${period} Nafaka`;

  const build = () => {
    const prisma: any = {
      case: { findMany: jest.fn() },
      due: { create: jest.fn().mockResolvedValue({}) },
      decisionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const metrics: any = { record: jest.fn() };
    const tebligatService: any = {};
    const service = new SchedulerService(prisma, metrics, tebligatService);

    jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    return { service, prisma };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('yeni nafaka dönemini PRINCIPAL değil NAFAKA Due olarak üretir', async () => {
    const { service, prisma } = build();

    await (service as any).addNafakaPeriod(
      {
        id: 'case-nafaka-1',
        fileNumber: '2026/1',
        metadata: { monthlyNafaka: 1500 },
        dues: [],
      },
      period,
    );

    expect(prisma.due.create).toHaveBeenCalledTimes(1);
    expect(prisma.due.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-nafaka-1',
        type: DueType.NAFAKA,
        description: periodDescription,
        amount: 1500,
      }),
    });
    expect(prisma.due.create.mock.calls[0][0].data.type).not.toBe(DueType.PRINCIPAL);
    expect(prisma.decisionLog.create).toHaveBeenCalledTimes(1);
  });

  it('aynı NAFAKA dönemi mevcutsa scheduler tekrarında duplicate üretmez', async () => {
    const { service, prisma } = build();

    await (service as any).addNafakaPeriod(
      {
        id: 'case-nafaka-2',
        fileNumber: '2026/2',
        metadata: { monthlyNafaka: 1500 },
        dues: [{ id: 'due-nafaka', type: DueType.NAFAKA, description: periodDescription, amount: 1500 }],
      },
      period,
    );

    expect(prisma.due.create).not.toHaveBeenCalled();
    expect(prisma.decisionLog.create).not.toHaveBeenCalled();
  });

  it('scheduler aynı case ve aynı period için ikinci kez çalışınca duplicate Due üretmez', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T08:00:00.000Z'));
    const { service, prisma } = build();

    prisma.case.findMany
      .mockResolvedValueOnce([
        {
          id: 'case-nafaka-4',
          fileNumber: '2026/4',
          metadata: { monthlyNafaka: 1500 },
          dues: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'case-nafaka-4',
          fileNumber: '2026/4',
          metadata: { monthlyNafaka: 1500 },
          dues: [{ id: 'due-nafaka', type: DueType.NAFAKA, description: periodDescription, amount: 1500 }],
        },
      ]);

    await service.processNafakaPeriods();
    await service.processNafakaPeriods();

    expect(prisma.due.create).toHaveBeenCalledTimes(1);
    expect(prisma.due.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-nafaka-4',
        type: DueType.NAFAKA,
        description: periodDescription,
        amount: 1500,
      }),
    });
  });

  it('aynı period eski hatalı PRINCIPAL satırı olarak mevcutsa yeni NAFAKA satırıyla çift sayım yaratmaz', async () => {
    const { service, prisma } = build();

    await (service as any).addNafakaPeriod(
      {
        id: 'case-nafaka-3',
        fileNumber: '2026/3',
        metadata: { monthlyNafaka: 1500 },
        dues: [{ id: 'due-principal', type: DueType.PRINCIPAL, description: periodDescription, amount: 1500 }],
      },
      period,
    );

    expect(prisma.due.create).not.toHaveBeenCalled();
    expect(prisma.decisionLog.create).not.toHaveBeenCalled();
  });
});
