/**
 * G7 (İ12) — MANUEL AYLIK TESLİM UCU: yetki + KAPSAM İZOLASYONU (izole birim testi; DB YOK).
 *
 * Ölçülen sözleşme:
 *  1. Kapsam DAİMA doğrulanmış aktörün tenant'ından türetilir — istek gövdesi/param'dan ALINMAZ.
 *  2. `runMonthlyDelivery` ASLA boş scope (`{}` → tüm aktif tenant) ile çağrılmaz.
 *  3. Yetki eşiği scheduler manuel-run ile AYNI: VIEWER DENY · elevated=`isApproverEligible`
 *     (ADMIN rolü TEK BAŞINA yetmez) · aktör/tenant yoksa DENY.
 *  4. Reddedilen her durumda teslim koşusu HİÇ çağrılmaz (yazma yok).
 */
import { ForbiddenException } from '@nestjs/common';
import { ClientStatementController } from './client-statement.controller';
import { SCHEDULER_MANUAL_RUN_REASON } from '../scheduler/scheduler-manual-run-policy';

const ACTOR_TENANT = 'tenant-actor-1';
const OTHER_TENANT = 'tenant-baskasi-2';
const ACTOR_USER = 'user-actor-1';

function makeController(opts: { eligible: boolean }) {
  const runMonthlyDelivery = jest.fn().mockResolvedValue({
    periodKey: '2026-08', scanned: 1, generated: 1, reused: 0, delivered: 1, planned: 0, skipped: 0, failed: 0,
  });
  const isApproverEligible = jest.fn().mockResolvedValue(opts.eligible);
  const controller = new ClientStatementController(
    {} as never,
    { runMonthlyDelivery } as never,
    { isApproverEligible } as never,
  );
  return { controller, runMonthlyDelivery, isApproverEligible };
}

const req = (over: Partial<{ id: string; tenantId: string; role: string }> = {}) =>
  ({ user: { id: ACTOR_USER, tenantId: ACTOR_TENANT, role: 'USER', ...over } } as never);

describe('G7 manuel aylık teslim — yetki + kapsam izolasyonu', () => {
  it('yetkili (elevated) aktör: koşu YALNIZ aktörün tenant kapsamıyla çalışır', async () => {
    const { controller, runMonthlyDelivery, isApproverEligible } = makeController({ eligible: true });

    const out = await controller.runMonthlyDeliveryNow(req());

    expect(runMonthlyDelivery).toHaveBeenCalledTimes(1);
    const [nowArg, scopeArg] = runMonthlyDelivery.mock.calls[0];
    expect(nowArg).toBeInstanceOf(Date);
    // KAPSAM TAM OLARAK aktörün tenant'ı — başka anahtar yok, boş scope yok.
    expect(scopeArg).toEqual({ tenantId: ACTOR_TENANT });
    expect(Object.keys(scopeArg)).toEqual(['tenantId']);
    // Yetki, aktörün KENDİ tenant'ında ölçülür.
    expect(isApproverEligible).toHaveBeenCalledWith(ACTOR_USER, ACTOR_TENANT);
    expect(out.tenantId).toBe(ACTOR_TENANT);
    expect(out.result.delivered).toBe(1);
  });

  it('kapsam istekten TÜRETİLEMEZ: gövdede başka tenant verilse de aktörün tenant’ı kullanılır', async () => {
    const { controller, runMonthlyDelivery } = makeController({ eligible: true });

    // Uç gövde/param kabul etmez; saldırgan alanlar req.user DIŞINDA taşınsa bile etkisizdir.
    await controller.runMonthlyDeliveryNow({
      user: { id: ACTOR_USER, tenantId: ACTOR_TENANT, role: 'USER' },
      body: { tenantId: OTHER_TENANT, clientId: 'x' },
      query: { tenantId: OTHER_TENANT },
      params: { tenantId: OTHER_TENANT },
    } as never);

    const [, scopeArg] = runMonthlyDelivery.mock.calls[0];
    expect(scopeArg).toEqual({ tenantId: ACTOR_TENANT });
    expect(JSON.stringify(scopeArg)).not.toContain(OTHER_TENANT);
  });

  it('VIEWER: 403 (VIEWER_DENIED) ve koşu HİÇ çağrılmaz', async () => {
    const { controller, runMonthlyDelivery } = makeController({ eligible: true });

    await expect(controller.runMonthlyDeliveryNow(req({ role: 'VIEWER' }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.runMonthlyDeliveryNow(req({ role: 'VIEWER' }))).rejects.toMatchObject({
      response: { reasonCode: SCHEDULER_MANUAL_RUN_REASON.VIEWER_DENIED },
    });
    expect(runMonthlyDelivery).not.toHaveBeenCalled();
  });

  it('elevated OLMAYAN aktör: 403 (ELEVATED_DENIED) — ADMIN rolü TEK BAŞINA yetmez', async () => {
    for (const role of ['USER', 'ADMIN']) {
      const { controller, runMonthlyDelivery } = makeController({ eligible: false });
      await expect(controller.runMonthlyDeliveryNow(req({ role }))).rejects.toMatchObject({
        response: { reasonCode: SCHEDULER_MANUAL_RUN_REASON.ELEVATED_DENIED },
      });
      expect(runMonthlyDelivery).not.toHaveBeenCalled();
    }
  });

  it('tenantId YOK: 403 (NO_ACTOR) — boş kapsamla TÜM tenant koşusu ASLA tetiklenmez', async () => {
    const { controller, runMonthlyDelivery, isApproverEligible } = makeController({ eligible: true });

    await expect(controller.runMonthlyDeliveryNow(req({ tenantId: '' }))).rejects.toMatchObject({
      response: { reasonCode: SCHEDULER_MANUAL_RUN_REASON.NO_ACTOR },
    });
    // Kapsam sızıntısının tek yolu buydu: hiçbir koşu ve hiçbir yetki sorgusu yapılmadı.
    expect(runMonthlyDelivery).not.toHaveBeenCalled();
    expect(isApproverEligible).not.toHaveBeenCalled();
  });

  it('userId YOK: 403 (NO_ACTOR) ve koşu HİÇ çağrılmaz', async () => {
    const { controller, runMonthlyDelivery } = makeController({ eligible: false });

    await expect(controller.runMonthlyDeliveryNow(req({ id: '' }))).rejects.toMatchObject({
      response: { reasonCode: SCHEDULER_MANUAL_RUN_REASON.NO_ACTOR },
    });
    expect(runMonthlyDelivery).not.toHaveBeenCalled();
  });
});
