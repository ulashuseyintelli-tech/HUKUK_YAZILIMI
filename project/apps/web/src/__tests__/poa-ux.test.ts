/**
 * PR-2a-fix: POA mükerrer-bastırma sinyali shape-agnostic okuma (tarama=manuel tutarlılığı).
 */

import { describe, it, expect } from "vitest";
import { isPoaDuplicateSuppressed, POA_DUPLICATE_MESSAGE } from "@/lib/poa-ux";

describe("isPoaDuplicateSuppressed", () => {
  it("api.post {data:{...}} şekli → yakalar", () => {
    expect(isPoaDuplicateSuppressed({ data: { id: "x", _suppressedDuplicate: true } })).toBe(true);
  });
  it("düz body şekli (data sarması yok) → yakalar", () => {
    expect(isPoaDuplicateSuppressed({ id: "x", _suppressedDuplicate: true })).toBe(true);
  });
  it("çift sarmal {data:{data:{...}}} → yakalar", () => {
    expect(isPoaDuplicateSuppressed({ data: { data: { _suppressedDuplicate: true } } })).toBe(true);
  });
  it("bayrak yoksa → false", () => {
    expect(isPoaDuplicateSuppressed({ data: { id: "x" } })).toBe(false);
    expect(isPoaDuplicateSuppressed(null)).toBe(false);
    expect(isPoaDuplicateSuppressed(undefined)).toBe(false);
  });
  it("mesaj sabiti tutarlı", () => {
    expect(POA_DUPLICATE_MESSAGE).toContain("zaten kayıtlı");
  });
});
