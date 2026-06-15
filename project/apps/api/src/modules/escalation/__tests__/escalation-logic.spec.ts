/**
 * PR-3b Escalation Engine — saf karar mantığı testleri.
 * En kritik: lastNotifiedLevel guard'ı (her saat aynı tier'a tekrar gönderme) + tier ilerletme.
 */

import {
  computeEscalationUpdate,
  normalizeTrPhone,
  channelsForTier,
  addDays,
  EscalationConfig,
  EscalationTaskState,
} from "../escalation-logic";

const cfg: EscalationConfig = { reminderDays: 3, founderDays: 6, repeatMonths: 3 };
const D0 = new Date(2026, 5, 1, 9, 0, 0); // 1 Haz 2026 09:00

const task = (over: Partial<EscalationTaskState>): EscalationTaskState => ({
  createdAt: D0,
  escalationLevel: "STAFF",
  lastNotifiedLevel: null,
  nextFollowUpAt: addDays(D0, 3),
  ...over,
});

describe("computeEscalationUpdate", () => {
  it("yeni görev, süre dolmadı, hiç bildirilmedi → STAFF bildir", () => {
    const r = computeEscalationUpdate(task({}), cfg, D0);
    expect(r.escalationLevel).toBe("STAFF");
    expect(r.notifyTier).toBe("STAFF");
    expect(r.lastNotifiedLevel).toBe("STAFF");
  });

  it("STAFF zaten bildirildi, süre dolmadı → TEKRAR GÖNDERME (guard)", () => {
    const r = computeEscalationUpdate(task({ lastNotifiedLevel: "STAFF" }), cfg, addDays(D0, 1));
    expect(r.notifyTier).toBeNull();
    expect(r.escalationLevel).toBe("STAFF");
  });

  it("STAFF süresi doldu (now>=next) → MANAGER'a ilerlet + MANAGER bildir, next=createdAt+founderDays", () => {
    const r = computeEscalationUpdate(task({ lastNotifiedLevel: "STAFF" }), cfg, addDays(D0, 3));
    expect(r.escalationLevel).toBe("MANAGER");
    expect(r.notifyTier).toBe("MANAGER");
    expect(r.nextFollowUpAt.getTime()).toBe(addDays(D0, 6).getTime());
  });

  it("MANAGER süresi doldu → FOUNDER'a ilerlet + FOUNDER bildir, next=now+repeatMonths", () => {
    const now = addDays(D0, 6);
    const r = computeEscalationUpdate(
      task({ escalationLevel: "MANAGER", lastNotifiedLevel: "MANAGER", nextFollowUpAt: addDays(D0, 6) }),
      cfg,
      now
    );
    expect(r.escalationLevel).toBe("FOUNDER");
    expect(r.notifyTier).toBe("FOUNDER");
    // now + 3 ay
    const exp = new Date(now); exp.setMonth(exp.getMonth() + 3);
    expect(r.nextFollowUpAt.getTime()).toBe(exp.getTime());
  });

  it("FOUNDER bildirildi, süre dolmadı → TEKRAR GÖNDERME", () => {
    const r = computeEscalationUpdate(
      task({ escalationLevel: "FOUNDER", lastNotifiedLevel: "FOUNDER", nextFollowUpAt: addDays(D0, 90) }),
      cfg,
      addDays(D0, 10)
    );
    expect(r.notifyTier).toBeNull();
    expect(r.escalationLevel).toBe("FOUNDER");
  });

  it("FOUNDER süresi doldu → PERİYODİK TEKRAR: aynı tier yeniden bildir + next=now+repeatMonths", () => {
    const now = addDays(D0, 100);
    const r = computeEscalationUpdate(
      task({ escalationLevel: "FOUNDER", lastNotifiedLevel: "FOUNDER", nextFollowUpAt: addDays(D0, 90) }),
      cfg,
      now
    );
    expect(r.escalationLevel).toBe("FOUNDER");
    expect(r.notifyTier).toBe("FOUNDER"); // re-send
    const exp = new Date(now); exp.setMonth(exp.getMonth() + 3);
    expect(r.nextFollowUpAt.getTime()).toBe(exp.getTime());
  });
});

describe("normalizeTrPhone (SMS için)", () => {
  it("0532... → 90532...", () => {
    expect(normalizeTrPhone("05321234567")).toBe("905321234567");
    expect(normalizeTrPhone("0 532 123 45 67")).toBe("905321234567");
  });
  it("+90532 / 90532 / 532 → 90532...", () => {
    expect(normalizeTrPhone("+905321234567")).toBe("905321234567");
    expect(normalizeTrPhone("905321234567")).toBe("905321234567");
    expect(normalizeTrPhone("5321234567")).toBe("905321234567");
  });
  it("sabit hat / geçersiz → null", () => {
    expect(normalizeTrPhone("02122308910")).toBeNull(); // ofis sabit hat
    expect(normalizeTrPhone("123")).toBeNull();
    expect(normalizeTrPhone(null)).toBeNull();
  });
});

describe("channelsForTier (SMS yalnız FOUNDER)", () => {
  it("STAFF/MANAGER → sms yok", () => {
    expect(channelsForTier("STAFF")).toEqual({ email: true, sms: false });
    expect(channelsForTier("MANAGER")).toEqual({ email: true, sms: false });
  });
  it("FOUNDER → email + sms", () => {
    expect(channelsForTier("FOUNDER")).toEqual({ email: true, sms: true });
  });
});
