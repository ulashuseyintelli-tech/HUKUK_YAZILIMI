// P4-3 UI testleri (vitest + @testing-library/react). ClientMatchBadge 4 durum + tablo "Müvekkil" kolonu entegrasyonu.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientMatchBadge } from "../components/debtor/ClientMatchBadge";
import { InstrumentReviewTable } from "../components/debtor/InstrumentReviewTable";
import { computeClientMatch } from "../lib/client-match";
import type { ClientMatchResult, ClientMatchHit } from "../lib/client-match";
import type { Instrument, ReviewRow } from "../components/debtor/ocr-instrument";

function hit(over: Partial<ClientMatchHit> = {}): ClientMatchHit {
  return {
    client: { name: "Şükrü Akdoğan" },
    found: true,
    location: "ENDORSEMENT",
    matchType: "EXACT",
    matchedField: "endorsementNames",
    matchedValue: "Şükrü Akdoğan",
    evidence: "ENDORSEMENT/EXACT",
    ...over,
  };
}
const res = (primary: ClientMatchHit | null, all: ClientMatchHit[]): ClientMatchResult => ({
  primaryMatch: primary,
  allMatches: all,
});

describe("ClientMatchBadge — A1-c rol-sinyali durumları (güvenli mod)", () => {
  it("ENDORSEMENT → REVIEW 'Ciro' (ciroda bulundu, pozisyon belirsiz; otomatik rol yok)", () => {
    const h = hit({ location: "ENDORSEMENT" });
    render(<ClientMatchBadge result={res(h, [h])} />);
    const b = screen.getByTestId("client-match-badge");
    expect(b.getAttribute("data-state")).toBe("review");
    expect(b.textContent).toContain("Ciro");
  });

  it("FRONT_PAYEE → VERIFY 'Olası lehtar' (payee OCR güvenilmez; doğrula)", () => {
    const h = hit({ location: "FRONT_PAYEE" });
    render(<ClientMatchBadge result={res(h, [h])} />);
    const b = screen.getByTestId("client-match-badge");
    expect(b.getAttribute("data-state")).toBe("verify");
    expect(b.textContent).toContain("lehtar");
  });

  it("FRONT_DRAWER → ANOMALY 'Keşideci' (ters-yön; belge/müvekkil kontrol)", () => {
    const h = hit({ location: "FRONT_DRAWER" });
    render(<ClientMatchBadge result={res(h, [h])} />);
    const b = screen.getByTestId("client-match-badge");
    expect(b.getAttribute("data-state")).toBe("anomaly");
    expect(b.textContent).toContain("Keşideci");
  });

  it("NOT_FOUND (müvekkil var, eşleşme yok) → amber 'Yok'", () => {
    const nf = hit({ found: false, location: "NOT_FOUND", matchType: "NONE", matchedField: null, matchedValue: "" });
    render(<ClientMatchBadge result={res(null, [nf])} />);
    const b = screen.getByTestId("client-match-badge");
    expect(b.getAttribute("data-state")).toBe("not-found");
    expect(b.textContent).toContain("Yok");
  });

  it("müvekkil seçili değil (result null) → nötr —", () => {
    render(<ClientMatchBadge result={null} />);
    expect(screen.getByTestId("client-match-badge").getAttribute("data-state")).toBe("none");
  });

  it("allMatches boş → nötr —", () => {
    render(<ClientMatchBadge result={{ primaryMatch: null, allMatches: [] }} />);
    expect(screen.getByTestId("client-match-badge").getAttribute("data-state")).toBe("none");
  });
});

describe("InstrumentReviewTable — Müvekkil kolonu entegrasyonu", () => {
  const gorkaCheck: Instrument = {
    type: "CEK",
    currency: "TRY",
    confidence: 95,
    drawerName: "Gorka Kozmetik Sanayi ve Ticaret Anonim Şirketi",
    endorsementNames: ["Şükrü Akdoğan", "T.C. Ziraat Bankası A.Ş."],
    documentNo: "0265897",
    amount: 400000,
    issueDate: "2025-12-30",
    sourcePages: [1, 2],
  };

  it("Müvekkil kolon başlığı + Gorka/Şükrü satırında REVIEW 'Ciro' (gerçek computeClientMatch)", () => {
    const rows: ReviewRow[] = [{ selected: true, instrument: gorkaCheck }];
    const cm = [computeClientMatch(gorkaCheck, [{ name: "Şükrü Akdoğan" }])];
    render(<InstrumentReviewTable rows={rows} onChange={() => {}} clientMatches={cm} />);
    expect(screen.getByText("Müvekkil")).toBeTruthy(); // kolon başlığı
    const b = screen.getByTestId("client-match-badge");
    expect(b.getAttribute("data-state")).toBe("review"); // A1-c: ciroda bulundu → REVIEW (yeşil "found" değil)
    expect(b.textContent).toContain("Ciro");
  });

  it("clientMatches verilmezse badge nötr (—), tablo kırılmaz", () => {
    const rows: ReviewRow[] = [{ selected: true, instrument: gorkaCheck }];
    render(<InstrumentReviewTable rows={rows} onChange={() => {}} />);
    expect(screen.getByTestId("client-match-badge").getAttribute("data-state")).toBe("none");
  });
});
