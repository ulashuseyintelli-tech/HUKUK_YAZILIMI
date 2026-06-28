import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/relative-time";

const NOW = new Date("2026-06-28T12:00:00Z").getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("relativeTime", () => {
  it("<45s → 'az önce'", () => {
    expect(relativeTime(iso(10_000), NOW)).toBe("az önce");
  });
  it("dakika → 'N dk önce'", () => {
    expect(relativeTime(iso(5 * 60_000), NOW)).toBe("5 dk önce");
  });
  it("saat → 'N saat önce'", () => {
    expect(relativeTime(iso(2 * 3_600_000), NOW)).toBe("2 saat önce");
  });
  it("gün → 'N gün önce'", () => {
    expect(relativeTime(iso(3 * 86_400_000), NOW)).toBe("3 gün önce");
  });
  it("gelecek → 'N dk sonra'", () => {
    expect(relativeTime(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe("5 dk sonra");
  });
  it("null/undefined → '-'", () => {
    expect(relativeTime(null, NOW)).toBe("-");
    expect(relativeTime(undefined, NOW)).toBe("-");
  });
  it("geçersiz tarih → ham string döner", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("not-a-date");
  });
});
