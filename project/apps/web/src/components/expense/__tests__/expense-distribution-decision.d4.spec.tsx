import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExpenseDistributionDecisionRow,
  useExpenseDistributionDecisions,
} from "@/components/expense/ExpenseDistributionDecision";
import { OperationDeck } from "@/components/case-detail/OperationDeck";
import { ACTION_ERROR_NETWORK } from "@/lib/action-error";
import {
  DISTRIBUTION_APPROVE_EXPLANATION,
  DISTRIBUTION_MESSAGES,
  DISTRIBUTION_REJECT_EXPLANATION,
  DISTRIBUTION_STATUS_LABEL,
  classifyDistributionDecisionFailure,
} from "@/lib/expense-distribution-decision";

/**
 * D4 — Masraf DAĞITIM UYGUNLUĞU kararı ekranı (dosya Finans bölümü, "Masraf Talepleri" satırları).
 *
 * Gerçek istemciler (`api.getExpenseRequestsByCase`, `financeApi.approveExpenseRequest` / `rejectExpenseRequest`)
 * kullanılır; yalnız `fetch` taklit edilir. Yanıt gövdeleri API sözleşmesinden kurulur (#3072):
 *  - nesne gövdeli Nest istisnası: `{ code, message }` (EXPENSE_APPROVER_NOT_ELIGIBLE, SELF_APPROVAL_FORBIDDEN,
 *    VIEWER_WRITE_DENIED); CPE kapısı: `{ code: 'GATE_BLOCKED', reason, blockedBy: { gateCode, severity }, … }`;
 *  - metin gövdeli Nest istisnası: `{ statusCode, message, error }` (iptal, "Yalnız PENDING_APPROVAL …", 409, gerekçe);
 *  - global filtre gövdeyi aynen geçirir (all-exceptions.filter.ts getResponse passthrough).
 * Okuma: `GET /expense-requests/by-case/:caseId` → Prisma satırı (`expenseApprovalStatus`, `status`, …).
 */

type Satir = Record<string, unknown> & { id: string };
type Yanit = { status: number; body: unknown };
type Yanitlayici = () => Yanit | Promise<Yanit>;

function satir(id: string, over: Record<string, unknown> = {}): Satir {
  return {
    id,
    tenantId: "t1",
    caseId: "case-1",
    clientId: "cl1",
    stageCode: "OPENING",
    status: "SENT",
    expenseApprovalStatus: "PENDING_APPROVAL",
    approvedAt: null,
    approvedById: null,
    createdById: "u-talep",
    totalAmount: "1500",
    paidTotal: "0",
    currency: "TRY",
    createdAt: "2026-11-01T10:00:00.000Z",
    client: { id: "cl1", name: "Müvekkil A", displayName: "Müvekkil A" },
    ...over,
  };
}

const HATA = {
  YETKISIZ: { status: 403, body: { code: "EXPENSE_APPROVER_NOT_ELIGIBLE", message: "Masraf dağıtım kararı için yetki yok (PARTNER veya yetkilendirilmiş avukat gerekir)." } },
  OZ_ONAY: { status: 400, body: { code: "SELF_APPROVAL_FORBIDDEN", message: "Kendi masraf talebinizi onaylayamaz ya da reddedemezsiniz." } },
  VIEWER: { status: 403, body: { code: "VIEWER_WRITE_DENIED", message: "Görüntüleyici (VIEWER) rolü bu alanda yazma veya yürütme işlemi yapamaz." } },
  KAPALI: { status: 403, body: { code: "GATE_BLOCKED", reason: "Case closed", blockedBy: { gateCode: "CASE_CLOSED", severity: "HARD" }, decisionId: "d1", traceId: "t1" } },
  ARSIV: { status: 403, body: { code: "GATE_BLOCKED", reason: "Case archived", blockedBy: { gateCode: "CASE_ARCHIVED", severity: "HARD" }, decisionId: "d2", traceId: "t2" } },
  IPTAL: { status: 400, body: { statusCode: 400, message: "İptal edilmiş masraf talebi için dağıtım kararı verilemez", error: "Bad Request" } },
  BEKLEMIYOR_ONAY: { status: 400, body: { statusCode: 400, message: "Yalnız PENDING_APPROVAL masraf onaylanabilir (durum: REJECTED)", error: "Bad Request" } },
  YARIS: { status: 409, body: { statusCode: 409, message: "Masraf talebi eşzamanlı değiştirildi; dağıtım kararı uygulanmadı.", error: "Conflict" } },
  GEREKCE: { status: 400, body: { statusCode: 400, message: "Reddetme gerekçesi (note) zorunludur.", error: "Bad Request" } },
  BILINMEYEN: { status: 500, body: { statusCode: 500, message: "Beklenmeyen sunucu hatası" } },
} satisfies Record<string, Yanit>;

let db: Record<string, Satir>;
let byCaseKuyrugu: Yanitlayici[];
let kararKuyrugu: Record<string, Yanitlayici[]>;
let istekler: Array<{ method: string; path: string; body: unknown }>;
let beklenmeyen: string[];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sunucuKarari(id: string, action: string): Yanit {
  const decision = action === "approve" ? "APPROVED" : "REJECTED";
  db[id] = { ...db[id], expenseApprovalStatus: decision, approvedAt: "2026-11-04T09:00:00.000Z", approvedById: "u-ortak" };
  return { status: 201, body: db[id] };
}

function ertelenmis() {
  let coz!: (y: Yanit) => void;
  const promise = new Promise<Yanit>((resolve) => {
    coz = resolve;
  });
  return { promise, coz };
}

beforeEach(() => {
  db = {};
  byCaseKuyrugu = [];
  kararKuyrugu = {};
  istekler = [];
  beklenmeyen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      istekler.push({ method, path: url.pathname, body });
      if (method === "GET" && url.pathname.endsWith("/api/expense-requests/by-case/case-1")) {
        const sonraki = byCaseKuyrugu.shift();
        const r = sonraki ? await sonraki() : { status: 200, body: Object.values(db) };
        return json(r.status, r.body);
      }
      const m = url.pathname.match(/\/api\/expense-requests\/([^/]+)\/(approve|reject)$/);
      if (method === "POST" && m) {
        const [, id, action] = m;
        const sonraki = kararKuyrugu[`${id}:${action}`]?.shift();
        const r = sonraki ? await sonraki() : sunucuKarari(id, action);
        return json(r.status, r.body);
      }
      // Bölümdeki mevcut ViewScopeBadge kendi kapsam okumasını yapar (D4 dışı); nötr yanıt, iddialara girmez.
      if (method === "GET" && url.pathname.endsWith("/api/office/view-scope")) return json(200, {});
      beklenmeyen.push(`${method} ${url.pathname}`);
      return json(404, { statusCode: 404, message: "Not Found" });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(beklenmeyen).toEqual([]);
});

function Harness({ ids }: { ids: string[] }) {
  const decisions = useExpenseDistributionDecisions("case-1", ids.join(","));
  return (
    <div>
      {ids.map((id) => (
        <ExpenseDistributionDecisionRow key={id} expenseId={id} decisions={decisions} />
      ))}
    </div>
  );
}

const masrafIstekleri = () => istekler.filter((i) => i.path.includes("/api/expense-requests/"));
const satirEl = (id: string) => within(screen.getByTestId(`expense-distribution-${id}`));
const durum = (id: string) => screen.getByTestId(`expense-distribution-status-${id}`).textContent;
const kararIstekleri = () => istekler.filter((i) => i.method === "POST");
const okumaSayisi = () => istekler.filter((i) => i.method === "GET").length;
const kararDugmesiYok = (id: string) => {
  expect(satirEl(id).queryByRole("button", { name: "Onayla" })).toBeNull();
  expect(satirEl(id).queryByRole("button", { name: "Reddet" })).toBeNull();
  expect(satirEl(id).queryByRole("button", { name: /Onayı kaydet|Reddi kaydet/ })).toBeNull();
};

async function bekleyenGorunsun(id: string) {
  await waitFor(() => expect(durum(id)).toBe(DISTRIBUTION_STATUS_LABEL.PENDING_APPROVAL));
}

function reddetFormu(id: string, gerekce: string) {
  fireEvent.click(satirEl(id).getByRole("button", { name: "Reddet" }));
  fireEvent.change(satirEl(id).getByLabelText("Ret gerekçesi (zorunlu)"), { target: { value: gerekce } });
}

describe("D4 — onay / ret başarısı", () => {
  it("onay: teyit metni gösterilir, teyitten önce istek yok; tek POST, yeniden okuma, güncel durum", async () => {
    db = { e1: satir("e1") };
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    expect(satirEl("e1").getByText(DISTRIBUTION_APPROVE_EXPLANATION)).toBeInTheDocument();
    expect(kararIstekleri()).toEqual([]);

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));
    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.APPROVED));
    expect(kararIstekleri()).toEqual([{ method: "POST", path: "/api/expense-requests/e1/approve", body: undefined }]);
    expect(okumaSayisi()).toBe(2);
    kararDugmesiYok("e1");
  });

  it("ret: gövde yalnız { note } (baş/son boşluk atılır); güncel durum Reddedildi", async () => {
    db = { e1: satir("e1") };
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    reddetFormu("e1", "  Belge eksik  ");
    expect(satirEl("e1").getByText(DISTRIBUTION_REJECT_EXPLANATION)).toBeInTheDocument();
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddi kaydet" }));

    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.REJECTED));
    expect(kararIstekleri()).toEqual([{ method: "POST", path: "/api/expense-requests/e1/reject", body: { note: "Belge eksik" } }]);
    kararDugmesiYok("e1");
  });
});

describe("D4 — gerekçe ve sunucu reddi", () => {
  it("boş ya da yalnız boşluk gerekçe: Reddi kaydet devre dışı, istek gönderilmez", async () => {
    db = { e1: satir("e1") };
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddet" }));
    const kaydet = satirEl("e1").getByRole("button", { name: "Reddi kaydet" });
    expect(kaydet).toBeDisabled();
    fireEvent.change(satirEl("e1").getByLabelText("Ret gerekçesi (zorunlu)"), { target: { value: "   \n  " } });
    expect(kaydet).toBeDisabled();
    expect(satirEl("e1").getByText("Gerekçe boş ya da yalnız boşluk olamaz.")).toBeInTheDocument();
    fireEvent.click(kaydet);
    await act(async () => {});
    expect(kararIstekleri()).toEqual([]);
  });

  it("yetkisiz aktör (403 EXPENSE_APPROVER_NOT_ELIGIBLE): Türkçe açıklama; yeniden okuma yok; teyit paneli açık kalır", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:approve"] = [() => HATA.YETKISIZ];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));

    await waitFor(() => expect(satirEl("e1").getByRole("alert").textContent).toBe(DISTRIBUTION_MESSAGES.NOT_ELIGIBLE));
    expect(okumaSayisi()).toBe(1);
    expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.PENDING_APPROVAL);
    expect(satirEl("e1").getByRole("button", { name: "Onayı kaydet" })).toBeEnabled();
    expect(kararIstekleri()).toHaveLength(1);
  });

  it("öz-onay (400 SELF_APPROVAL_FORBIDDEN): Türkçe açıklama; ret formu ve gerekçe korunur", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:reject"] = [() => HATA.OZ_ONAY];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    reddetFormu("e1", "Belge eksik");
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddi kaydet" }));

    await waitFor(() => expect(satirEl("e1").getByRole("alert").textContent).toBe(DISTRIBUTION_MESSAGES.SELF_APPROVAL));
    expect(satirEl("e1").getByLabelText("Ret gerekçesi (zorunlu)")).toHaveValue("Belge eksik");
    expect(satirEl("e1").getByRole("button", { name: "Reddi kaydet" })).toBeEnabled();
    expect(okumaSayisi()).toBe(1);
    expect(kararIstekleri()).toHaveLength(1);
  });

  it.each([
    ["VIEWER (403 VIEWER_WRITE_DENIED)", HATA.VIEWER, DISTRIBUTION_MESSAGES.VIEWER],
    ["kapalı dosya (403 GATE_BLOCKED CASE_CLOSED)", HATA.KAPALI, DISTRIBUTION_MESSAGES.CASE_CLOSED],
    ["arşivdeki dosya (403 GATE_BLOCKED CASE_ARCHIVED)", HATA.ARSIV, DISTRIBUTION_MESSAGES.CASE_ARCHIVED],
  ])("bilinen kod — %s: Türkçe açıklama, yeniden okuma yok", async (_ad, hata, mesaj) => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:approve"] = [() => hata];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));
    await waitFor(() => expect(satirEl("e1").getByRole("alert").textContent).toBe(mesaj));
    expect(okumaSayisi()).toBe(1);
  });

  it("sunucu gerekçe reddi (400 kodsuz 'Reddetme gerekçesi (note) zorunludur.'): Türkçe açıklama, gerekçe korunur", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:reject"] = [() => HATA.GEREKCE];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    reddetFormu("e1", "x");
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddi kaydet" }));
    await waitFor(() => expect(satirEl("e1").getByRole("alert").textContent).toBe(DISTRIBUTION_MESSAGES.NOTE_REQUIRED));
    expect(satirEl("e1").getByLabelText("Ret gerekçesi (zorunlu)")).toHaveValue("x");
  });
});

describe("D4 — durum değişti: yeniden okuma, karar tekrar gönderilmez", () => {
  it("iptal edilmiş talep okumada: karar düğmesi sunulmaz", async () => {
    db = { e1: satir("e1", { status: "CANCELLED" }) };
    render(<Harness ids={["e1"]} />);
    await waitFor(() => expect(durum("e1")).toContain("talep iptal edildi, karar verilemez"));
    kararDugmesiYok("e1");
  });

  it("sunucu iptal yanıtı (400 'İptal edilmiş …'): talep yeniden okunur; düğme kalkar; tek POST", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:approve"] = [
      () => {
        db.e1 = { ...db.e1, status: "CANCELLED" };
        return HATA.IPTAL;
      },
    ];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));

    await waitFor(() => expect(durum("e1")).toContain("talep iptal edildi"));
    expect(satirEl("e1").getByRole("alert").textContent).toBe(`${DISTRIBUTION_MESSAGES.CANCELLED} Güncel durum yeniden okundu.`);
    expect(okumaSayisi()).toBe(2);
    expect(kararIstekleri()).toHaveLength(1);
    kararDugmesiYok("e1");
  });

  it("ters karar (400 'Yalnız PENDING_APPROVAL …'): yeniden okunur, güncel durum Reddedildi; onay tekrar gönderilmez", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:approve"] = [
      () => {
        db.e1 = { ...db.e1, expenseApprovalStatus: "REJECTED" };
        return HATA.BEKLEMIYOR_ONAY;
      },
    ];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));

    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.REJECTED));
    expect(satirEl("e1").getByRole("alert").textContent).toBe(`${DISTRIBUTION_MESSAGES.NOT_PENDING} Güncel durum yeniden okundu.`);
    await act(async () => {});
    expect(kararIstekleri()).toHaveLength(1);
    kararDugmesiYok("e1");
  });

  it("409: yeniden okunur; talep hâlâ bekliyorsa ret formu ve gerekçe korunur, karar kendiliğinden gönderilmez; elle yeniden deneme mümkün", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:reject"] = [() => HATA.YARIS];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    reddetFormu("e1", "Belge eksik");
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddi kaydet" }));

    await waitFor(() =>
      expect(satirEl("e1").getByRole("alert").textContent).toBe(`${DISTRIBUTION_MESSAGES.CONFLICT} Güncel durum yeniden okundu.`),
    );
    expect(okumaSayisi()).toBe(2);
    expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.PENDING_APPROVAL);
    expect(satirEl("e1").getByLabelText("Ret gerekçesi (zorunlu)")).toHaveValue("Belge eksik");
    await act(async () => {});
    expect(kararIstekleri()).toHaveLength(1);

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddi kaydet" }));
    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.REJECTED));
    expect(kararIstekleri()).toHaveLength(2);
    expect(kararIstekleri()[1].body).toEqual({ note: "Belge eksik" });
  });

  it("409 sonrası yeniden okuma da düşerse: 'Güncel durum okunamadı'; düğme yok; Görünümü yenile yalnız okur", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:approve"] = [() => HATA.YARIS];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");
    byCaseKuyrugu.push(() => HATA.BILINMEYEN);

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));

    await waitFor(() => expect(durum("e1")).toBe("Güncel durum okunamadı"));
    expect(satirEl("e1").getByRole("alert").textContent).toBe(`${DISTRIBUTION_MESSAGES.CONFLICT} Güncel durum okunamadı.`);
    kararDugmesiYok("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Görünümü yenile" }));
    await bekleyenGorunsun("e1");
    expect(kararIstekleri()).toHaveLength(1);
    expect(satirEl("e1").getByRole("button", { name: "Onayı kaydet" })).toBeEnabled();
  });
});

describe("D4 — bilinmeyen hata gizlenmez", () => {
  it("500: sunucunun güvenli mesajı aynen gösterilir; yeniden okuma yok", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:approve"] = [() => HATA.BILINMEYEN];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));
    await waitFor(() => expect(satirEl("e1").getByRole("alert").textContent).toBe("Beklenmeyen sunucu hatası"));
    expect(okumaSayisi()).toBe(1);
  });

  it("ağ hatası: mevcut güvenli ağ hatası metni; karar yapılmadı", async () => {
    db = { e1: satir("e1") };
    kararKuyrugu["e1:reject"] = [
      () => {
        throw new TypeError("Failed to fetch");
      },
    ];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    reddetFormu("e1", "Belge eksik");
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Reddi kaydet" }));
    await waitFor(() => expect(satirEl("e1").getByRole("alert").textContent).toBe(ACTION_ERROR_NETWORK));
    expect(satirEl("e1").getByLabelText("Ret gerekçesi (zorunlu)")).toHaveValue("Belge eksik");
    expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.PENDING_APPROVAL);
  });

  it("sınıflandırıcı: kodsuz tanınmayan 400 ve tanınmayan kapı OTHER olarak güvenli mesajla döner", () => {
    const yuzey = { message: "Sunucu mesajı", transient: false };
    expect(classifyDistributionDecisionFailure({ status: 400, body: { statusCode: 400, message: "Başka bir kural" } }, yuzey)).toEqual({
      kind: "OTHER",
      message: "Sunucu mesajı",
      reread: false,
    });
    expect(
      classifyDistributionDecisionFailure({ status: 403, body: { code: "GATE_BLOCKED", blockedBy: { gateCode: "CASE_SUSPENDED" } } }, yuzey),
    ).toEqual({ kind: "OTHER", message: "Sunucu mesajı", reread: false });
  });
});

describe("D4 — kilit talep kimliği başına", () => {
  it("çift gönderim: aynı talep için tek POST; işlem sürerken düğme 'Kaydediliyor…' ve devre dışı", async () => {
    db = { e1: satir("e1") };
    const bekle = ertelenmis();
    kararKuyrugu["e1:approve"] = [() => bekle.promise];
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    const kaydet = satirEl("e1").getByRole("button", { name: "Onayı kaydet" });
    fireEvent.click(kaydet);
    fireEvent.click(kaydet);
    await waitFor(() => expect(satirEl("e1").getByRole("button", { name: "Kaydediliyor…" })).toBeDisabled());
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Kaydediliyor…" }));
    expect(kararIstekleri()).toHaveLength(1);

    await act(async () => bekle.coz(sunucuKarari("e1", "approve")));
    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.APPROVED));
    expect(kararIstekleri()).toHaveLength(1);
  });

  it("aynı talebin onay ve reddi ortak kilidi kullanır; karar kaydedildikten sonra yeni karar yazılmaz", async () => {
    db = { e1: satir("e1") };
    const bekle = ertelenmis();
    kararKuyrugu["e1:approve"] = [() => bekle.promise];
    const { result } = renderHook(() => useExpenseDistributionDecisions("case-1", "e1"));
    await waitFor(() => expect(result.current.loadStatus).toBe("READY"));

    let onay!: Promise<boolean>;
    let ret!: Promise<boolean>;
    act(() => {
      onay = result.current.decide("e1", "APPROVED");
      ret = result.current.decide("e1", "REJECTED", "Belge eksik");
    });
    await expect(ret).resolves.toBe(false);
    expect(kararIstekleri().map((i) => i.path)).toEqual(["/api/expense-requests/e1/approve"]);

    await act(async () => bekle.coz(sunucuKarari("e1", "approve")));
    await expect(onay).resolves.toBe(true);

    let tekrar!: Promise<boolean>;
    act(() => {
      tekrar = result.current.decide("e1", "REJECTED", "Belge eksik");
    });
    await expect(tekrar).resolves.toBe(false);
    expect(kararIstekleri()).toHaveLength(1);
  });

  it("iki farklı talep bağımsız: biri beklerken diğeri gönderilir ve tamamlanır; bekleyen satır etkilenmez", async () => {
    db = { e1: satir("e1"), e2: satir("e2") };
    const bekle = ertelenmis();
    kararKuyrugu["e1:approve"] = [() => bekle.promise];
    render(<Harness ids={["e1", "e2"]} />);
    await bekleyenGorunsun("e1");
    await bekleyenGorunsun("e2");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));
    await waitFor(() => expect(satirEl("e1").getByRole("button", { name: "Kaydediliyor…" })).toBeDisabled());

    fireEvent.click(satirEl("e2").getByRole("button", { name: "Reddet" }));
    fireEvent.change(satirEl("e2").getByLabelText("Ret gerekçesi (zorunlu)"), { target: { value: "Mükerrer" } });
    fireEvent.click(satirEl("e2").getByRole("button", { name: "Reddi kaydet" }));
    await waitFor(() => expect(durum("e2")).toBe(DISTRIBUTION_STATUS_LABEL.REJECTED));
    expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.PENDING_APPROVAL);
    expect(satirEl("e1").getByRole("button", { name: "Kaydediliyor…" })).toBeDisabled();

    await act(async () => bekle.coz(sunucuKarari("e1", "approve")));
    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.APPROVED));
    expect(kararIstekleri().map((i) => i.path).sort()).toEqual([
      "/api/expense-requests/e1/approve",
      "/api/expense-requests/e2/reject",
    ]);
  });
});

describe("D4 — karar kaydedildi, görünüm yenilenemedi", () => {
  it("yenileme düşer: ayrım gösterilir, yeni karar yazımı engellenir; Görünümü yenile yalnız okur", async () => {
    db = { e1: satir("e1") };
    render(<Harness ids={["e1"]} />);
    await bekleyenGorunsun("e1");
    byCaseKuyrugu.push(() => HATA.BILINMEYEN);

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayla" }));
    fireEvent.click(satirEl("e1").getByRole("button", { name: "Onayı kaydet" }));

    await waitFor(() =>
      expect(durum("e1")).toBe(`${DISTRIBUTION_STATUS_LABEL.APPROVED} (karar kaydedildi; görünüm yenilenemedi)`),
    );
    expect(satirEl("e1").getByRole("status").textContent).toBe(
      "Karar kaydedildi; görünüm yenilenemedi. Bu talep için yeniden karar gönderilmez.",
    );
    kararDugmesiYok("e1");
    expect(kararIstekleri()).toHaveLength(1);

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Görünümü yenile" }));
    await waitFor(() => expect(durum("e1")).toBe(DISTRIBUTION_STATUS_LABEL.APPROVED));
    expect(kararIstekleri()).toHaveLength(1);
    expect(okumaSayisi()).toBe(3);
  });
});

describe("D4 — durum tahmin edilmez", () => {
  it("alan eksik ya da tanınmaz: 'Durum bilinmiyor'; karar düğmesi yok", async () => {
    db = {
      e1: satir("e1", { expenseApprovalStatus: undefined }),
      e2: satir("e2", { status: undefined }),
      e3: satir("e3", { expenseApprovalStatus: "BEKLEMEDE" }),
    };
    render(<Harness ids={["e1", "e2", "e3", "e4"]} />);
    for (const id of ["e1", "e2", "e3", "e4"]) {
      await waitFor(() => expect(durum(id)).toBe("Durum bilinmiyor; karar sunulmaz"));
      kararDugmesiYok(id);
    }
  });

  it("ilk okuma düşer: 'Durum okunamadı'; Görünümü yenile yeniden okur, sonra karar sunulur", async () => {
    db = { e1: satir("e1") };
    byCaseKuyrugu.push(() => HATA.BILINMEYEN);
    render(<Harness ids={["e1"]} />);
    await waitFor(() => expect(durum("e1")).toBe("Durum okunamadı"));
    kararDugmesiYok("e1");

    fireEvent.click(satirEl("e1").getByRole("button", { name: "Görünümü yenile" }));
    await bekleyenGorunsun("e1");
    expect(satirEl("e1").getByRole("button", { name: "Onayla" })).toBeEnabled();
    expect(kararIstekleri()).toEqual([]);
  });
});

describe("D4 — dosya Finans bölümü (OperationDeck)", () => {
  const masrafTalebi = { id: "e1", type: "MASRAF_TALEP" as const, amount: 1500, date: "2026-11-01", description: "Takip Açılış Masrafları", status: "PENDING", paidAmount: 0 };
  const finansSekmesi = () => {
    const hits = screen.getAllByRole("button").filter((b) => /^Finans(\d+)?$/.test((b.textContent ?? "").replace(/\s+/g, "")));
    expect(hits).toHaveLength(1);
    return hits[0];
  };

  it("'Masraf Talepleri' satırında dağıtım uygunluğu durumu ve karar düğmeleri; okuma by-case ucundan, sekme açılınca", async () => {
    db = { e1: satir("e1") };
    render(<OperationDeck caseId="case-1" expenseRequestsSource="READY" financeItems={[masrafTalebi]} />);
    await act(async () => {});
    expect(masrafIstekleri()).toEqual([]);

    fireEvent.click(finansSekmesi());
    await bekleyenGorunsun("e1");
    const grup = screen.getByRole("group", { name: "Dağıtım uygunluğu kararı" });
    expect(within(grup).getByRole("button", { name: "Onayla" })).toBeEnabled();
    expect(within(grup).getByRole("button", { name: "Reddet" })).toBeEnabled();
    expect(masrafIstekleri().map((i) => `${i.method} ${i.path}`)).toEqual(["GET /api/expense-requests/by-case/case-1"]);
  });

  it("bölümde talep yoksa (sekme açık) dağıtım durumu okunmaz", async () => {
    render(<OperationDeck caseId="case-1" expenseRequestsSource="READY" financeItems={[]} />);
    fireEvent.click(finansSekmesi());
    await act(async () => {});
    expect(masrafIstekleri()).toEqual([]);
    expect(screen.queryByRole("group", { name: "Dağıtım uygunluğu kararı" })).toBeNull();
  });
});
