/**
 * PR-2a-fix: POA mükerrer-bastırma sinyali shape-agnostic okuma (tarama=manuel tutarlılığı).
 */

import { describe, it, expect } from "vitest";
import {
  isPoaDuplicateSuppressed,
  POA_DUPLICATE_MESSAGE,
  hasPoaInput,
  stripPoaFields,
  buildPoaCreatePayload,
} from "@/lib/poa-ux";

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

describe("hasPoaInput", () => {
  it("yevmiye no varsa → true", () => {
    expect(hasPoaInput({ poaNumber: "12345" })).toBe(true);
  });
  it("vekalet tarihi varsa → true", () => {
    expect(hasPoaInput({ poaDate: "2026-01-02" })).toBe(true);
  });
  it("noter adı varsa → true", () => {
    expect(hasPoaInput({ notaryName: "1. Noter" })).toBe(true);
  });
  it("hiçbiri yoksa / yalnız notaryCity → false", () => {
    expect(hasPoaInput({})).toBe(false);
    expect(hasPoaInput({ notaryCity: "İstanbul" })).toBe(false);
    expect(hasPoaInput(null)).toBe(false);
    expect(hasPoaInput(undefined)).toBe(false);
  });
});

describe("stripPoaFields", () => {
  it("vekaletname alanlarını /clients gövdesinden ayıklar, diğerlerini korur", () => {
    const payload = {
      firstName: "Ada",
      tckn: "11111111111",
      poaNumber: "12345",
      poaDate: "2026-01-02",
      notaryName: "1. Noter",
      notaryCity: "İstanbul",
    };
    const out = stripPoaFields(payload);
    expect(out).toEqual({ firstName: "Ada", tckn: "11111111111" });
    expect(out).not.toHaveProperty("poaNumber");
    expect(out).not.toHaveProperty("poaDate");
    expect(out).not.toHaveProperty("notaryName");
    expect(out).not.toHaveProperty("notaryCity");
  });
  it("kaynağı mutasyona uğratmaz (yeni nesne döner)", () => {
    const payload = { firstName: "Ada", poaNumber: "12345" };
    const out = stripPoaFields(payload);
    expect(payload).toHaveProperty("poaNumber", "12345");
    expect(out).not.toBe(payload);
  });
});

describe("buildPoaCreatePayload", () => {
  it("müvekkil/tarama alanlarını PoaService.create DTO şekline çevirir", () => {
    const out = buildPoaCreatePayload("client-1", {
      poaNumber: "12345",
      poaDate: "2026-01-02",
      notaryName: "1. Noter",
      notaryCity: "İstanbul",
      canCollect: true,
      canWaive: true,
    });
    expect(out.clientId).toBe("client-1");
    expect(out.journalNo).toBe("12345");
    expect(out.poaNumber).toBe("12345");
    expect(out.dateIssued).toBeInstanceOf(Date);
    expect(out.notaryName).toBe("1. Noter");
    expect(out.notaryCity).toBe("İstanbul");
    expect(out.scopeType).toBe("GENEL");
    expect(out.isLimited).toBe(false);
    expect(out.canCollect).toBe(true);
    expect(out.canWaive).toBe(true);
    expect(out.canSettle).toBe(false);
    expect(out.canRelease).toBe(false);
  });
  it("tarih yoksa dateIssued undefined; yetki varsayılanları uygulanır", () => {
    const out = buildPoaCreatePayload("client-2", { poaNumber: "999" });
    expect(out.dateIssued).toBeUndefined();
    expect(out.validUntil).toBeUndefined();
    expect(out.canCollect).toBe(true);
    expect(out.canWaive).toBe(false);
  });
});
