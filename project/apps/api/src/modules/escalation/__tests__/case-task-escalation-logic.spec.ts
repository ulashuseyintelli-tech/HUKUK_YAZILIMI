/**
 * D-G2 — Dosya görevi eskalasyon SAF state-machine testleri (DB yok, runtime yok).
 * Politika kilidi: RESPONSIBLE → TEAM_LEAD → MANAGER → FOUNDER; hasTeamLead=false → TEAM_LEAD atlanır;
 * FOUNDER SMS + periyodik tekrar; retry guard yalnız SENT'te ilerler; çift bildirim engeli.
 */

import {
  computeCaseTaskEscalationUpdate,
  channelsForCaseTaskTier,
  CaseTaskEscalationConfig,
  CaseTaskEscalationState,
} from "../case-task-escalation-logic";
import { addDays, addMonths } from "../escalation-logic";

const D0 = new Date(2026, 5, 1, 9, 0, 0);

const cfg = (over: Partial<CaseTaskEscalationConfig> = {}): CaseTaskEscalationConfig => ({
  ownerDays: 2,
  teamLeadDays: 2,
  managerDays: 3,
  repeatMonths: 3,
  hasTeamLead: true,
  ...over,
});

const state = (over: Partial<CaseTaskEscalationState> = {}): CaseTaskEscalationState => ({
  createdAt: D0,
  caseEscalationLevel: null,
  caseLastNotifiedLevel: null,
  caseNextFollowUpAt: null,
  ...over,
});

describe("computeCaseTaskEscalationUpdate", () => {
  it("ilk tick (level=null) süre dolmadan → RESPONSIBLE (owner-first) bildirilir; next=createdAt+ownerDays", () => {
    const u = computeCaseTaskEscalationUpdate(state(), cfg(), D0);
    expect(u.caseEscalationLevel).toBe("RESPONSIBLE");
    expect(u.notifyTier).toBe("RESPONSIBLE");
    expect(u.caseLastNotifiedLevel).toBe("RESPONSIBLE");
    expect(u.caseLastNotifiedLevelOnFailure).toBeNull(); // baseline null → FAILED'da retry
    expect(u.caseNextFollowUpAt).toEqual(addDays(D0, 2));
  });

  it("RESPONSIBLE süresi doldu + hasTeamLead → TEAM_LEAD'e ilerler ve bildirilir; next=now+teamLeadDays", () => {
    const now = addDays(D0, 2);
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "RESPONSIBLE", caseLastNotifiedLevel: "RESPONSIBLE", caseNextFollowUpAt: now }),
      cfg({ hasTeamLead: true }),
      now
    );
    expect(u.caseEscalationLevel).toBe("TEAM_LEAD");
    expect(u.notifyTier).toBe("TEAM_LEAD");
    expect(u.caseNextFollowUpAt).toEqual(addDays(now, 2));
  });

  it("K-D2: RESPONSIBLE doldu + hasTeamLead=false → TEAM_LEAD ATLANIR, doğrudan MANAGER; next=now+managerDays", () => {
    const now = addDays(D0, 2);
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "RESPONSIBLE", caseLastNotifiedLevel: "RESPONSIBLE", caseNextFollowUpAt: now }),
      cfg({ hasTeamLead: false }),
      now
    );
    expect(u.caseEscalationLevel).toBe("MANAGER");
    expect(u.notifyTier).toBe("MANAGER");
    expect(u.caseNextFollowUpAt).toEqual(addDays(now, 3));
  });

  it("TEAM_LEAD süresi doldu → MANAGER", () => {
    const now = addDays(D0, 4);
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "TEAM_LEAD", caseLastNotifiedLevel: "TEAM_LEAD", caseNextFollowUpAt: now }),
      cfg(),
      now
    );
    expect(u.caseEscalationLevel).toBe("MANAGER");
    expect(u.notifyTier).toBe("MANAGER");
  });

  it("MANAGER süresi doldu → FOUNDER; next=now+repeatMonths (ay)", () => {
    const now = addDays(D0, 7);
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "MANAGER", caseLastNotifiedLevel: "MANAGER", caseNextFollowUpAt: now }),
      cfg(),
      now
    );
    expect(u.caseEscalationLevel).toBe("FOUNDER");
    expect(u.notifyTier).toBe("FOUNDER");
    expect(u.caseNextFollowUpAt).toEqual(addMonths(now, 3));
  });

  it("FOUNDER süresi doldu → periyodik TEKRAR (aynı tier, yeniden bildirilir); next+=repeatMonths", () => {
    const now = addMonths(D0, 4);
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "FOUNDER", caseLastNotifiedLevel: "FOUNDER", caseNextFollowUpAt: now }),
      cfg(),
      now
    );
    expect(u.caseEscalationLevel).toBe("FOUNDER");
    expect(u.notifyTier).toBe("FOUNDER"); // re-send
    expect(u.caseNextFollowUpAt).toEqual(addMonths(now, 3));
  });

  it("çift bildirim engeli: aynı tier zaten bildirildi + süre dolmadı → notifyTier null", () => {
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "MANAGER", caseLastNotifiedLevel: "MANAGER", caseNextFollowUpAt: addDays(D0, 10) }),
      cfg(),
      addDays(D0, 5) // süre dolmadı
    );
    expect(u.caseEscalationLevel).toBe("MANAGER");
    expect(u.notifyTier).toBeNull(); // zaten bildirilmiş → tekrar göndermez
    expect(u.caseLastNotifiedLevel).toBe("MANAGER");
  });

  it("retry guard: ilerle+bildir → onFailure=baseline (FAILED'da yeni tier retry edilir)", () => {
    const now = addDays(D0, 2);
    const u = computeCaseTaskEscalationUpdate(
      state({ caseEscalationLevel: "RESPONSIBLE", caseLastNotifiedLevel: "RESPONSIBLE", caseNextFollowUpAt: now }),
      cfg(),
      now
    );
    expect(u.notifyTier).toBe("TEAM_LEAD");
    expect(u.caseLastNotifiedLevel).toBe("TEAM_LEAD"); // SENT → guard ilerler
    expect(u.caseLastNotifiedLevelOnFailure).toBe("RESPONSIBLE"); // FAILED → baseline → TEAM_LEAD retry
  });
});

describe("channelsForCaseTaskTier", () => {
  it("SMS yalnız FOUNDER; e-posta her tier", () => {
    expect(channelsForCaseTaskTier("RESPONSIBLE")).toEqual({ email: true, sms: false });
    expect(channelsForCaseTaskTier("TEAM_LEAD")).toEqual({ email: true, sms: false });
    expect(channelsForCaseTaskTier("MANAGER")).toEqual({ email: true, sms: false });
    expect(channelsForCaseTaskTier("FOUNDER")).toEqual({ email: true, sms: true });
  });
});
