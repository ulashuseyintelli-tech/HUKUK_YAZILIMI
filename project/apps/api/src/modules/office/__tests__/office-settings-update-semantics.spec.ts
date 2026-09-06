// F-B01-03 — settings PUT semantiği (servis düzeyi; DB YOK): alan gönderilmezse mevcut değer KORUNUR (undefined = UNCHANGED);
// açıkça [] gönderilmesi AYRI bir yazma işlemidir (F01 guard'a tabi; HTTP spec'te ölçülür). S2 listelerinin GET'ten omit
// edilmesi PUT'un davranışını DEĞİŞTİRMEZ — UI görünmeyen alanı göndermediği sürece hiçbir alıcı silinmez.
// Kanıt sınıfı: TEST (sahte prisma + sahte havuz mutation primitive'i). Production verisiyle yazma YOK.
import { OfficeService } from '../office.service';

const OFFICE_ROW = {
  id: 'office-A',
  tenantId: 'tenant-A',
  name: 'Büro',
  escalationManagerLawyerIds: ['m1'],
  escalationFounderLawyerIds: ['f1'],
  escalationTeamLeadLawyerIds: ['t1'],
  poaExpiryRecipientLawyerIds: ['p1'],
  poaExpiryNotificationEnabled: true,
  poaExpiryThresholdDays: 30,
  opReminderDays: 3,
  opStaffTypes: ['SEKRETER'],
  smtpPass: null,
  smsApiKey: null,
  smsApiSecret: null,
  bankAccounts: [],
  lawyers: [],
};

function make() {
  const prisma = {
    office: {
      findUnique: jest.fn().mockResolvedValue(OFFICE_ROW),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...OFFICE_ROW, ...data })),
    },
  };
  const audit = { log: jest.fn() };
  const service = new OfficeService(prisma as any, audit as any, undefined);
  const applyTargetState = jest.fn(async (params: { legacyPassthrough?: Record<string, unknown> }) => ({
    office: { ...OFFICE_ROW, ...(params.legacyPassthrough ?? {}) },
  }));
  (service as unknown as { workPoolMutation: unknown }).workPoolMutation = { applyTargetState };
  return { service, prisma, applyTargetState };
}

const S2 = ['escalationManagerLawyerIds', 'escalationFounderLawyerIds', 'escalationTeamLeadLawyerIds', 'poaExpiryRecipientLawyerIds'];

describe('F-B01-03 — updateEscalationSettings: gönderilmeyen alan korunur, açık [] ayrı işlem', () => {
  it('yalnız skaler alan gönderildi → havuz hedefi YOK (targetStates {}), legacyPassthrough S2 anahtarı taşımaz', async () => {
    const { service, applyTargetState } = make();
    await service.updateEscalationSettings('tenant-A', { opReminderDays: 5 }, 'u1', { userId: 'u1', role: 'ADMIN' });
    expect(applyTargetState).toHaveBeenCalledTimes(1);
    const params = applyTargetState.mock.calls[0][0] as { source: { mode: string; targetStates: Record<string, unknown> }; legacyPassthrough: Record<string, unknown> };
    expect(params.source.mode).toBe('EXPLICIT');
    expect(Object.keys(params.source.targetStates)).toEqual([]);
    expect(params.legacyPassthrough).toEqual({ opReminderDays: 5 });
    for (const k of S2) expect(Object.prototype.hasOwnProperty.call(params.legacyPassthrough, k)).toBe(false);
  });

  it('açıkça escalationManagerLawyerIds: [] → hedef durum ESCALATION_MANAGER = [] (bilinçli boşaltma); diğer havuzlar dokunulmaz', async () => {
    const { service, applyTargetState } = make();
    await service.updateEscalationSettings('tenant-A', { escalationManagerLawyerIds: [] }, 'u1', { userId: 'u1', role: 'ADMIN' });
    const params = applyTargetState.mock.calls[0][0] as { source: { targetStates: Record<string, unknown> }; legacyPassthrough: Record<string, unknown> };
    expect(params.source.targetStates).toEqual({ ESCALATION_MANAGER: [] });
    expect(params.legacyPassthrough).toEqual({});
  });

  it('escalationTeamLeadLawyerIds (havuz dışı S2): gönderilmezse passthrough anahtarı yok; açık [] ise [] geçer', async () => {
    const { service, applyTargetState } = make();
    await service.updateEscalationSettings('tenant-A', { caseTaskOwnerDays: 4 }, 'u1');
    const p1 = applyTargetState.mock.calls[0][0] as { legacyPassthrough: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(p1.legacyPassthrough, 'escalationTeamLeadLawyerIds')).toBe(false);
    await service.updateEscalationSettings('tenant-A', { escalationTeamLeadLawyerIds: [] }, 'u1');
    const p2 = applyTargetState.mock.calls[1][0] as { legacyPassthrough: Record<string, unknown> };
    expect(p2.legacyPassthrough).toEqual({ escalationTeamLeadLawyerIds: [] });
  });

  it('opStaffTypes (S1 havuz) gönderilmezse hedef YOK; gönderilirse OP_STAFF_TYPE hedefi', async () => {
    const { service, applyTargetState } = make();
    await service.updateEscalationSettings('tenant-A', { opEmailEnabled: false }, 'u1');
    expect((applyTargetState.mock.calls[0][0] as { source: { targetStates: Record<string, unknown> } }).source.targetStates).toEqual({});
    await service.updateEscalationSettings('tenant-A', { opStaffTypes: ['MUHASEBE'] as never }, 'u1');
    expect((applyTargetState.mock.calls[1][0] as { source: { targetStates: Record<string, unknown> } }).source.targetStates).toEqual({ OP_STAFF_TYPE: ['MUHASEBE'] });
  });

  it('yanıt F01 projeksiyonundan geçer: S2 listeleri PUT yanıtında da yer almaz (actor verildiğinde)', async () => {
    const { service } = make();
    const approval = { isF01ActorAuthorized: jest.fn().mockResolvedValue(true) };
    (service as unknown as { officeApproval: unknown }).officeApproval = approval;
    const res = (await service.updateEscalationSettings('tenant-A', { opReminderDays: 7 }, 'u1', { userId: 'u1', role: 'ADMIN' })) as Record<string, unknown>;
    for (const k of S2) expect(Object.prototype.hasOwnProperty.call(res, k)).toBe(false);
    expect(res.opReminderDays).toBe(7);
  });
});

describe('F-B01-03 — updatePoaExpirySettings: prisma update verisi gönderilen alanlarla sınırlı', () => {
  it('yalnız eşik gönderildi → data içinde poaExpiryRecipientLawyerIds anahtarı YOK (mevcut liste korunur)', async () => {
    const { service, prisma } = make();
    await service.updatePoaExpirySettings('tenant-A', { poaExpiryThresholdDays: 10 }, 'u1');
    const call = prisma.office.update.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> };
    expect(call.where).toEqual({ id: 'office-A' });
    expect(call.data).toEqual({ poaExpiryThresholdDays: 10 });
    expect(Object.prototype.hasOwnProperty.call(call.data, 'poaExpiryRecipientLawyerIds')).toBe(false);
  });

  it('açıkça poaExpiryRecipientLawyerIds: [] → data.poaExpiryRecipientLawyerIds = [] (bilinçli boşaltma)', async () => {
    const { service, prisma } = make();
    await service.updatePoaExpirySettings('tenant-A', { poaExpiryRecipientLawyerIds: [] }, 'u1');
    const call = prisma.office.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ poaExpiryRecipientLawyerIds: [] });
  });
});
