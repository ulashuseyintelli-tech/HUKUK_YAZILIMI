/**
 * G6 Backfill classifier — saf çekirdek testleri (nihai kural: ulas 2026-06-23).
 */
import { classifyG6 } from "../g6-backfill-classifier";

describe("classifyG6 (G6 backfill nihai kural)", () => {
  it("R1 — tek aktif avukat → o avukat (isResponsible'dan bağımsız)", () => {
    expect(classifyG6({ activeLawyerIds: ["L1"], responsibleLawyerIds: [], founderLawyerId: null })).toEqual({
      bucket: "R1",
      chosenOwnerLawyerId: "L1",
      action: "WOULD_ASSIGN",
      reason: expect.stringContaining("R1"),
    });
    // tek avukat aynı zamanda isResponsible olsa da R1
    const d = classifyG6({ activeLawyerIds: ["L1"], responsibleLawyerIds: ["L1"], founderLawyerId: "F1" });
    expect(d.bucket).toBe("R1");
    expect(d.chosenOwnerLawyerId).toBe("L1");
  });

  it("R2 — çoklu avukat, tek isResponsible → o sorumlu", () => {
    expect(classifyG6({ activeLawyerIds: ["L1", "L2", "L3"], responsibleLawyerIds: ["L2"], founderLawyerId: "F1" })).toEqual({
      bucket: "R2",
      chosenOwnerLawyerId: "L2",
      action: "WOULD_ASSIGN",
      reason: expect.stringContaining("R2"),
    });
  });

  it("AMBIGUOUS — çoklu avukat + çoklu isResponsible → manual queue (founder DEĞİL)", () => {
    const d = classifyG6({ activeLawyerIds: ["L1", "L2"], responsibleLawyerIds: ["L1", "L2"], founderLawyerId: "F1" });
    expect(d.bucket).toBe("AMBIGUOUS");
    expect(d.chosenOwnerLawyerId).toBeNull(); // founder'a OTOMATİK atanmaz
    expect(d.action).toBe("MANUAL_QUEUE");
  });

  it("R3 + founder → founder fallback (WOULD_ASSIGN)", () => {
    expect(classifyG6({ activeLawyerIds: ["L1", "L2"], responsibleLawyerIds: [], founderLawyerId: "F1" })).toEqual({
      bucket: "R3",
      chosenOwnerLawyerId: "F1",
      action: "WOULD_ASSIGN",
      reason: expect.stringContaining("R3"),
    });
  });

  it("R3 + founder YOK → manual queue", () => {
    const d = classifyG6({ activeLawyerIds: ["L1", "L2"], responsibleLawyerIds: [], founderLawyerId: null });
    expect(d.bucket).toBe("R3");
    expect(d.chosenOwnerLawyerId).toBeNull();
    expect(d.action).toBe("MANUAL_QUEUE");
  });

  it("R4 (avukat yok) + founder → founder fallback", () => {
    expect(classifyG6({ activeLawyerIds: [], responsibleLawyerIds: [], founderLawyerId: "F1" })).toEqual({
      bucket: "R4",
      chosenOwnerLawyerId: "F1",
      action: "WOULD_ASSIGN",
      reason: expect.stringContaining("R4"),
    });
  });

  it("R4 (avukat yok) + founder YOK → manual queue", () => {
    const d = classifyG6({ activeLawyerIds: [], responsibleLawyerIds: [], founderLawyerId: null });
    expect(d.bucket).toBe("R4");
    expect(d.chosenOwnerLawyerId).toBeNull();
    expect(d.action).toBe("MANUAL_QUEUE");
  });
});
