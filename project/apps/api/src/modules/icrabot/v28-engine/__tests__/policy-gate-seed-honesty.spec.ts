/**
 * PolicyGate seed honesty — DB-free unit
 *
 * Bağlam: `IcrabotPolicyRule` modeli Prisma şemasında YOK (Django v28_ops_bundle
 * seed_policy_rules.py'den yarım port). Bu yüzden `prisma.icrabotPolicyRule` runtime'da
 * undefined'dır. Eski kod optional-chaining ile sessizce no-op yapıp sayaçları artırarak
 * her boot/endpoint çağrısında yanıltıcı "Policy rules seeded: created=5" üretiyordu.
 *
 * Bu test kilitler:
 *  1. seedDefaultRules() delegate yokken DÜRÜSTçe {created:0, updated:0} döner (fantom yok).
 *  2. Yanıltıcı "Policy rules seeded" log'u BASILMAZ.
 *  3. loadRules() delegate yokken in-memory 5 varsayılan kurala düşer (fonksiyon korunur).
 *
 * NOT: onModuleInit ARTIK seedDefaultRules çağırmaz (boot saflığı) — bu da fantom log'un
 * boot'ta hiç oluşmamasını sağlar.
 */
import { PolicyGateService } from '../policy-gate.service';

describe('PolicyGateService — seed honesty (IcrabotPolicyRule modeli yok)', () => {
  // Gerçek şemayı yansıtır: prisma.icrabotPolicyRule delegate'i YOK.
  const make = () => {
    const prisma = {} as any;
    const factStore = {} as any;
    return new PolicyGateService(prisma, factStore);
  };

  it('seedDefaultRules: delegate yokken DÜRÜSTçe {created:0, updated:0} döner', async () => {
    const svc = make();
    await expect(svc.seedDefaultRules()).resolves.toEqual({ created: 0, updated: 0 });
  });

  it('seedDefaultRules: yanıltıcı "Policy rules seeded" log\'u BASMAZ', async () => {
    const svc = make();
    const logSpy = jest
      .spyOn((svc as any).logger, 'log')
      .mockImplementation(() => undefined);
    await svc.seedDefaultRules();
    const seeded = logSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Policy rules seeded'),
    );
    expect(seeded).toHaveLength(0);
  });

  it('loadRules: delegate yokken in-memory 5 varsayılan kurala düşer (fonksiyon korunur)', async () => {
    const svc = make();
    await svc.loadRules();
    expect(svc.getRules()).toHaveLength(5);
  });
});
