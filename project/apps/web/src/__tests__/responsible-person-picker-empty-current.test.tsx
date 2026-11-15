// Dosya Sorumlusu seçici — GERÇEK API istemcisiyle (yalnız `fetch` taklit edilir).
//
// Sorumlusu olmayan dosyada `GET /cases/:id/responsible-person` 200 + BOŞ gövde döner (sunucu `null` döndürür).
// İstemci bunu eskiden JSON çözüm hatası sayıyordu; seçici aday listesini de boşaltıp "Kaydedilemedi" uyarısı
// gösteriyor, ilk sorumlu bu ekrandan atanamıyordu. Mevcut seçici testi `@/lib/api`'yi taklit ettiği için
// (`{ data: null }` döndürerek) bu yolu ölçmüyordu; bu dosya istemciyi TAKLİT ETMEZ.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ResponsiblePersonPicker } from "@/components/case/responsible-person-picker";

const candidates = [
  { type: "LAWYER", id: "L1", displayName: "Av. Sentetik Avukat", subtitle: "Ortak Avukat" },
  { type: "STAFF", id: "S1", displayName: "Sentetik Personel", subtitle: "Sekreter" },
];

function stubApi(currentResponse: () => Response) {
  const fetchMock = vi.fn(async (url: unknown) => {
    const target = String(url);
    if (target.endsWith("/api/cases/responsible-candidates")) {
      return new Response(JSON.stringify({ data: candidates }), { status: 200 });
    }
    if (target.endsWith("/responsible-person")) return currentResponse();
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock as any);
  return fetchMock;
}

const select = () => screen.getByRole("combobox") as HTMLSelectElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResponsiblePersonPicker — gerçek istemci, sorumlusu olmayan dosya", () => {
  it("200 + BOŞ gövde: adaylar listelenir, 'Atanmamış' yazar, uyarı GÖSTERİLMEZ", async () => {
    const fetchMock = stubApi(() => new Response(null, { status: 200 }));
    render(<ResponsiblePersonPicker caseId="c1" />);

    await waitFor(() => expect(select().disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Atanmamış")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Av\. Sentetik Avukat/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Sentetik Personel/ })).toBeTruthy();
    expect(select().getAttribute("aria-invalid")).toBe("false");
    // İki okuma da gerçekten yapıldı (ölçüm boş değil).
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.endsWith("/api/cases/responsible-candidates"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/api/cases/c1/responsible-person"))).toBe(true);
  });

  it("mevcut sorumlu DOLU gövdeyle gelirse eskisi gibi gösterilir", async () => {
    stubApi(
      () =>
        new Response(
          JSON.stringify({ type: "LAWYER", id: "L1", displayName: "Av. Sentetik Avukat", subtitle: "Ortak Avukat", isLegacy: false }),
          { status: 200 },
        ),
    );
    render(<ResponsiblePersonPicker caseId="c1" />);

    await waitFor(() => expect(select().disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(select().value).toBe("LAWYER:L1");
    expect(screen.queryByText("Atanmamış")).toBeNull();
  });

  it("okuma GERÇEKTEN başarısızsa (500) uyarı gösterilmeye devam eder", async () => {
    stubApi(() => new Response(JSON.stringify({ message: "Sunucu hatası" }), { status: 500 }));
    render(<ResponsiblePersonPicker caseId="c1" />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(select().getAttribute("aria-invalid")).toBe("true");
  });
});
