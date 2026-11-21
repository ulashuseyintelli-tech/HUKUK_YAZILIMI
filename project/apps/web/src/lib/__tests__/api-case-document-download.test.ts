import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "@/lib/api";

/**
 * F02 kabul UB-6 (21.11.2026) — dosyadan takip talebi indirme yardımcıları.
 * Adres: `GET {API}/api/template-engine/case/:id/{pdf|word|xml}?type=<belge>`; oturum anahtarı istemcinin merkezi
 * depolamasından (sessionStorage "Beni hatırla" işaretsiz / localStorage işaretli); hata yanıtında sunucunun `message`
 * metni kullanıcıya taşınır. Gerçek üretim singleton'ı, `fetch` taklitli. Değerler sentetik.
 */
describe("api — dosyadan takip talebi indirme (UB-6)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api.clearToken();
    fetchSpy = vi.fn(async () => new Response("sentetik", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    api.clearToken();
  });

  it.each([
    ["downloadPdfFromCase", "pdf"],
    ["downloadWordFromCase", "word"],
    ["downloadXmlFromCase", "xml"],
  ] as const)("%s: /api/template-engine/case/:id/%s?type=takip-talebi + sessionStorage oturum anahtarı", async (helper, segment) => {
    api.setToken("oturum-anahtari-sentetik", false);
    const blob = await (api as any)[helper]("case-1", "takip-talebi");
    // `Response.blob()` Node (undici) Blob'u döner; jsdom'un global Blob'u farklı alandandır → instanceof yerine etiket + içerik.
    expect(Object.prototype.toString.call(blob)).toBe("[object Blob]");
    expect(await blob.text()).toBe("sentetik");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(new RegExp(`/api/template-engine/case/case-1/${segment}\\?type=takip-talebi$`));
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer oturum-anahtari-sentetik" });
  });

  it.each(["downloadPdfFromCase", "downloadWordFromCase", "downloadXmlFromCase"] as const)(
    "%s: hata yanıtında sunucunun metni taşınır",
    async (helper) => {
      api.setToken("oturum-anahtari-sentetik", true);
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ statusCode: 400, message: "Operasyonel çıktı için aktif borçlu bulunmuyor" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
      await expect((api as any)[helper]("case-1", "takip-talebi")).rejects.toThrow("Operasyonel çıktı için aktif borçlu bulunmuyor");
    },
  );
});
