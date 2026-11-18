/**
 * Sihirbaz alacak kalemi formu — "Hesap Özeti" faiz hükmü, sunucunun dosya açılışındaki kayıt / onay durumuyla hizalıdır
 * (owner talimatı 2026-11-18): onay bekleyen ya da faiz durumu belirlenmemiş yan kalem faizi kesinleşmiş hesaba KATILMAZ.
 *
 * Ölçülen ayrışma (main 584d3dc0b): panel, kalemin türüne ve kaydına bakmadan vade → takip ve takip → hesap tarihi faizini
 * sunucudan isteyip TAKİP TUTARI / TOPLAM BORÇ / SON BORÇ'a ekliyordu. Oysa dosya açıldığında yan kalemde (vekâlet ücreti,
 * yargılama gideri, masraf) faiz durumu "belirlenmedi" yazılır ve hesaplanmaz; "faiz işler" beyanı varsa beyan onaya gider
 * ve kaleme faiz başlangıcı yazılmaz (asıl alacak dahil).
 *
 * Sözleşme (yalnız açılış bağlamında — `openingDeclarations` verildiğinde):
 *  1. Yan kalem, beyan yok   → faiz ucu ÇAĞRILMAZ; satır "faiz durumu belirlenmedi — hesaba katılmadı"; toplamlara girmez.
 *  2. "Faiz işler" beyanı var → faiz ucu ÇAĞRILMAZ; satır "onay bekleyecek — hesaba katılmadı" (asıl alacakta da).
 *  3. Asıl alacak, beyan yok → bugünkü gibi hesaplanır ve toplamlara girer.
 *  4. Açılış bağlamı dışında (prop yok) davranış değişmez.
 * Form ve önizleme istemcileri GERÇEKTİR; yalnız ağ katmanı taklit edilir. Değerler SENTETİKTİR.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProfessionalClaimItemForm } from "../ProfessionalClaimItemForm";
import { apiClient } from "@/lib/api/client";
import { emptyOpeningClaimDeclaration } from "@/lib/case-opening-claims";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    previewCekFormation: vi.fn(),
    getToken: vi.fn(() => "jeton"),
    downloadTakipTalebiWord: vi.fn(),
    downloadTakipTalebiPdf: vi.fn(),
    downloadTakipTalebiXml: vi.fn(),
  },
}));

const apiPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const FAIZ = 400; // her faiz isteğine dönen sentetik tutar
let faizIstekleri: Array<Record<string, unknown>>;

function agiKur() {
  apiPost.mockImplementation(async (url: string, body: Record<string, unknown>) => {
    if (url === "/fee-engine/preview") {
      return {
        data: {
          success: true,
          data: {
            estimatedFees: 0,
            estimatedAttorneyFee: 0,
            tariffYear: 2026,
            breakdown: { basvurmaHarci: 0, vekaletHarci: 0, pesinHarc: 0, dosyaGideri: 0, tebligatGideri: 0, vekaletPulu: 0 },
          },
          cached: false,
        },
      };
    }
    if (url === "/interest-engine/preview") {
      faizIstekleri.push(body);
      return { data: { success: true, data: { estimatedInterest: FAIZ, currentRate: 24, days: 30, interestType: body.interestType }, cached: false } };
    }
    throw new Error(`beklenmeyen istek: ${url}`);
  });
}

function satirlar(container: HTMLElement): Record<string, string> {
  const baslik = Array.from(container.querySelectorAll("h3")).find((h) => (h.textContent ?? "").includes("Hesap Özeti"));
  const panel = baslik?.closest("div.w-72");
  if (!panel) throw new Error("Hesap Özeti paneli bulunamadı");
  const map: Record<string, string> = {};
  for (const row of Array.from(panel.querySelectorAll("div.flex.justify-between"))) {
    const cells = Array.from(row.children).map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim());
    if (cells.length === 2) map[cells[0]] = cells[1];
  }
  return map;
}

const KALEM = (kalemTuru: string, extra: Record<string, unknown> = {}) => ({
  id: "kalem-1",
  kalemTuru,
  toplamTutar: 10000,
  bakiyeTutar: 10000,
  currency: "TRY",
  vadeTarihi: "2026-08-01",
  takipOncesiFaiz: "YASAL",
  takipSonrasiFaiz: "YASAL",
  faizOrani: null,
  faizsizGerekce: "",
  hesaplanmisFaiz: false,
  aciklama: "",
  ...extra,
});

const FAIZ_ISLER = { ...emptyOpeningClaimDeclaration(), faizIsler: true, faizBaslangic: "2026-08-01", faizDayanak: "JUDGMENT_FINALIZATION_DATE" };
const ACILIS = { debtors: [] as Array<{ id: string; name: string }> };
const SABIT_BORCLULAR: never[] = [];

async function goster(kalem: Record<string, unknown>, acilis: boolean) {
  const view = render(
    <ProfessionalClaimItemForm
      caseType="GENEL_ICRA"
      currency="TRY"
      takipTuruCode="ILAMLI_PARA"
      takipTarihi="2026-10-01"
      hesapTarihi="2026-11-01"
      borcluSayisi={1}
      caseDebtors={SABIT_BORCLULAR}
      initialItems={[kalem]}
      {...(acilis ? { openingDeclarations: ACILIS } : {})}
    />,
  );
  await screen.findByText("SON BORÇ", {}, { timeout: 4000 });
  const rows = satirlar(view.container);
  const row = (basi: string) => Object.entries(rows).find(([etiket]) => etiket.startsWith(basi))?.[1];
  return { ...view, rows, row };
}

describe("ProfessionalClaimItemForm — açılışta Hesap Özeti faiz hükmü sunucu kaydıyla hizalı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    faizIstekleri = [];
    agiKur();
  });
  afterEach(() => cleanup());

  it("yan kalem (vekâlet ücreti), beyan yok: faiz istenmez; satırlar 'faiz durumu belirlenmedi — hesaba katılmadı'; toplamlar faizsiz", async () => {
    const { row } = await goster(KALEM("VEKALET_UCRETI"), true);
    expect(faizIstekleri).toHaveLength(0);
    expect(row("Takip Öncesi Faiz")).toBe("faiz durumu belirlenmedi — hesaba katılmadı");
    expect(row("Takip Sonrası Faiz")).toBe("faiz durumu belirlenmedi — hesaba katılmadı");
    expect(row("TAKİP TUTARI")).toContain("10.000,00");
    expect(row("TOPLAM BORÇ")).toContain("10.000,00");
  });

  it("yan kalem + 'faiz işler' beyanı: faiz istenmez; satırlar 'onay bekleyecek — hesaba katılmadı'", async () => {
    const { row } = await goster(KALEM("YARGILAMA_GIDERI", { acilisBeyani: FAIZ_ISLER }), true);
    expect(faizIstekleri).toHaveLength(0);
    expect(row("Takip Öncesi Faiz")).toBe("onay bekleyecek — hesaba katılmadı");
    expect(row("Takip Sonrası Faiz")).toBe("onay bekleyecek — hesaba katılmadı");
    expect(row("TOPLAM BORÇ")).toContain("10.000,00");
  });

  it("asıl alacak, beyan yok: faiz bugünkü gibi hesaplanır ve toplamlara girer", async () => {
    // İlamsız asıl alacakta formun kendi varsayılanı "faizi takip tarihinden başlat"tır: yalnız takip sonrası faiz istenir.
    const { row } = await goster(KALEM("ASIL_ALACAK"), true);
    expect(faizIstekleri).toHaveLength(1);
    expect(row("Takip Sonrası Faiz")).toContain("400,00");
    expect(row("TOPLAM BORÇ")).toContain("10.400,00");
  });

  it("asıl alacak + 'faiz işler' beyanı: beyan onaya gider, kaleme başlangıç yazılmaz → faiz hesaba katılmaz", async () => {
    const { row } = await goster(KALEM("ASIL_ALACAK", { acilisBeyani: FAIZ_ISLER }), true);
    expect(faizIstekleri).toHaveLength(0);
    expect(row("Takip Sonrası Faiz")).toBe("onay bekleyecek — hesaba katılmadı");
    expect(row("TOPLAM BORÇ")).toContain("10.000,00");
  });

  it("açılış bağlamı dışında (prop yok) davranış değişmez: yan kalemde de faiz istenir", async () => {
    const { row } = await goster(KALEM("VEKALET_UCRETI"), false);
    expect(faizIstekleri).toHaveLength(2);
    expect(row("Takip Öncesi Faiz")).toContain("400,00");
    expect(row("Takip Sonrası Faiz")).toContain("400,00");
    expect(row("TOPLAM BORÇ")).toContain("10.800,00");
  });
});
