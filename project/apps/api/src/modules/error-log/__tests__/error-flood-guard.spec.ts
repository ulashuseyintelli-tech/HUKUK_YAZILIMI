import { ErrorFloodGuard } from "../internal/error-flood-guard";

describe("ErrorFloodGuard", () => {
  it("aynı fingerprint pencere içinde tekrar → 2. çağrı bastırılır", () => {
    const g = new ErrorFloodGuard();
    let now = 1000;
    g.setClockForTest(() => now);
    expect(g.shouldPersist("fp1")).toBe(true);
    now += 500; // pencere içinde (10s)
    expect(g.shouldPersist("fp1")).toBe(false);
  });

  it("farklı fingerprint → bastırılmaz", () => {
    const g = new ErrorFloodGuard();
    g.setClockForTest(() => 1000);
    expect(g.shouldPersist("fp1")).toBe(true);
    expect(g.shouldPersist("fp2")).toBe(true);
  });

  it("pencere geçince aynı fingerprint tekrar yazılabilir", () => {
    const g = new ErrorFloodGuard();
    let now = 1000;
    g.setClockForTest(() => now);
    expect(g.shouldPersist("fp1")).toBe(true);
    now += 10_001; // pencere (10s) doldu
    expect(g.shouldPersist("fp1")).toBe(true);
  });
});
