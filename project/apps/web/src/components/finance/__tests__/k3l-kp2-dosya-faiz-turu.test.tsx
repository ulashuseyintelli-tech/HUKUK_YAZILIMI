/**
 * K3-L KP-2 (owner kararı 2026-10-01) — Hesap Özeti panelinde dosya faiz türü uyarısı: kaynağı doğrulanamayan eski YASAL
 * varsayılanı uyarıyla gösterilir (sunucu metni; tür değiştirilmez). Açık seçimde uyarı yoktur.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useCaseCalculation = vi.fn();

vi.mock("@/hooks/useCaseCalculation", () => ({
  useCaseCalculation: (...a: unknown[]) => useCaseCalculation(...a),
  formatTL: (amount: number) => `${amount.toFixed(2)} TL`,
  formatDate: (date: string) => date,
}));

vi.mock("@/hooks/useBalanceShadowDiff", () => ({
  useBalanceShadowDiff: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}));

import { HesapOzetiPanel } from "../HesapOzetiPanel";

const hesap = {
  caseId: "case-1",
  hesapTarihi: "2026-06-24",
  takipTarihi: "2026-06-01",
  kalemTuru: "ASIL_ALACAK",
  asilAlacak: 1000,
  tazminat: 0,
  komisyon: 0,
  takipOncesiFaiz: 0,
  takipTutari: 1000,
  basvurmaHarci: 0,
  vekaletHarci: 0,
  pesinHarc: 0,
  dosyaGideri: 0,
  tebligatGideri: 0,
  vekaletPulu: 0,
  icraMasraflari: 0,
  pesinHarcDahilTahsilHarci: 0,
  pesinHarcHaricTahsilHarci: 0,
  vekaletUcreti: 0,
  takipSonrasiFaiz: 0,
  toplamBorc: 1000,
  sonBorc: 1000,
  toplamTahsilat: 0,
  kalanBorc: 1000,
  kalanAnapara: 1000,
  mahsupDetaylari: [],
  faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [],
};

const withFaizTuru = (dosyaFaizTuru: unknown) =>
  useCaseCalculation.mockReturnValue({ data: { ...hesap, dosyaFaizTuru }, loading: false, error: null, refetch: vi.fn() });

describe("K3-L KP-2: Hesap Özeti — dosya faiz türü uyarısı", () => {
  beforeEach(() => useCaseCalculation.mockReset());

  it("kaynağı doğrulanamayan eski YASAL: sunucunun uyarı metni gösterilir", () => {
    withFaizTuru({
      tur: "YASAL",
      kaynak: "DOGRULANAMADI",
      uyari: "Dosya faiz türünün (Yasal) kaynağı doğrulanamadı; eski varsayılan olabilir.",
    });
    render(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.getByTestId("hesap-dosya-faiz-turu-uyari")).toHaveTextContent("kaynağı doğrulanamadı");
  });

  it("açıkça seçilmiş tür: uyarı yok", () => {
    withFaizTuru({ tur: "YASAL", kaynak: "ACIK_SECIM", uyari: null });
    render(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.queryByTestId("hesap-dosya-faiz-turu-uyari")).toBeNull();
  });

  it("alan hiç yoksa (eski yanıt) panel aynen çalışır", () => {
    useCaseCalculation.mockReturnValue({ data: hesap, loading: false, error: null, refetch: vi.fn() });
    render(<HesapOzetiPanel caseId="case-1" />);
    expect(screen.queryByTestId("hesap-dosya-faiz-turu-uyari")).toBeNull();
  });
});
