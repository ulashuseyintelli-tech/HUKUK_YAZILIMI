import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api/office-approval", () => ({
  officeApprovalApi: {
    getInbox: vi.fn(),
    getDetail: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    requestRevision: vi.fn(),
    approveWithChanges: vi.fn(),
    cancel: vi.fn(),
  },
}));
const authState: { user: { id: string } | null } = { user: { id: "approver-9" } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/api/client-accounting", () => ({ clientAccountingApi: { finalizePayout: vi.fn() } }));
import { officeApprovalApi } from "@/lib/api/office-approval";
import { OfficeApprovalDetailDrawer } from "@/components/office-approval/OfficeApprovalDetailDrawer";

// Sentetik değerler; gerçek dosya / kişi bilgisi YOK.
const LIABILITY_INTENT = {
  version: "CLAIM_ITEM_LIABILITY_SELECTION_V1",
  operation: "LIABILITY_SELECTION",
  caseId: "case-s1",
  appliedVia: "SINGLE",
  bulkOperationId: null,
  reason: "Sentetik gerekçe",
  selections: [
    {
      claimItemId: "item-s1",
      mode: "CAPPED",
      limitScope: "ITEM_AMOUNT",
      basis: "LAWYER_ASSESSMENT",
      basisNote: "Sentetik açıklama",
      basisDocumentId: null,
      parties: [{ caseDebtorId: "cd-s1", shareWeight: null, limitAmount: "400.00", unlimited: false, sortOrder: 0 }],
      stateDigest: "sha256:x",
      display: { kalem: "Kayıttaki kalem adı", tur: "TUTARLA_SINIRLI", taraflar: ["Sentetik Borçlu: tavan 400.00 (yalnız bu kalemin tutarı)"], dayanak: "LAWYER_ASSESSMENT" },
    },
  ],
};

const BASE = {
  id: "req-l1",
  actionCode: "CLAIM_ITEM_HIGH_IMPACT_CHANGE",
  targetType: "CLAIM_ITEM",
  targetRef: "item-s1",
  status: "PENDING_APPROVAL",
  executionStatus: "NOT_RUN",
  requesterUserId: "user-req-1",
  approverUserId: null,
  hasReplacement: false,
  reason: "Sentetik gerekçe",
  createdAt: "2026-11-16T10:00:00Z",
  decidedAt: null,
  expiresAt: null,
  savedIntent: LIABILITY_INTENT,
  payloadHash: "h1",
  replacementSavedIntent: null,
  replacementPayloadHash: null,
  decisionNote: null,
  executedAt: null,
};

const visibleContext = {
  requesterName: "Sentetik Talepçi",
  approverName: null,
  case: { status: "VISIBLE", caseId: "case-s1", fileNumber: "2026/0001", claimItemLabel: "Güncel kalem adı", intentCaseMatches: true },
};

beforeEach(() => {
  (officeApprovalApi.getDetail as any).mockReset();
  authState.user = { id: "approver-9" };
});
afterEach(() => vi.restoreAllMocks());

const open = async (detail: unknown) => {
  (officeApprovalApi.getDetail as any).mockResolvedValue(detail);
  render(<OfficeApprovalDetailDrawer requestId="req-l1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText("Onay Talebi Detayı")).toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText("Yükleniyor...")).toBeNull());
};

describe("Onay Talebi Detayı — okunur bağlam (U-1…U-4)", () => {
  it("sorumluluk talebi: Türkçe işlem / durum, kişi adı, dosya bağlantısı, kayıtlı özet; ham JSON ve kodlar KAPALI", async () => {
    await open({ ...BASE, displayContext: visibleContext });
    expect(screen.getByText("Borçlu sorumluluğu seçimi")).toBeInTheDocument();
    expect(screen.getByText("Onay Bekliyor")).toBeInTheDocument();
    expect(screen.getByText("Henüz yürütülmedi")).toBeInTheDocument();
    expect(screen.getByText("Alacak kalemi")).toBeInTheDocument();
    expect(screen.getByText("Sentetik Talepçi")).toBeInTheDocument();

    const link = screen.getByTestId("approval-case-link");
    expect(link).toHaveTextContent("2026/0001");
    expect(link.getAttribute("href")).toBe("/cases/case-s1");
    // Güncel kayıt ile talep anındaki kayıt AYRI başlıklarla.
    expect(screen.getByText("Kalem (güncel ad)")).toBeInTheDocument();
    expect(screen.getByText("Güncel kalem adı")).toBeInTheDocument();
    expect(screen.getByText("Talep edilen değişiklik (talep anındaki kayıt)")).toBeInTheDocument();
    expect(screen.getByText("Kayıttaki kalem adı")).toBeInTheDocument();
    expect(screen.getByText("Tutarla sınırlı")).toBeInTheDocument();
    expect(screen.getByText("Avukat değerlendirmesi")).toBeInTheDocument();
    expect(screen.getByTestId("approval-summary")).toBeInTheDocument();

    // Teknik kodlar ve ham JSON normal görünümde YOK; istenince açılır.
    expect(screen.queryByText("CLAIM_ITEM_HIGH_IMPACT_CHANGE")).toBeNull();
    expect(screen.queryByText("NOT_RUN")).toBeNull();
    expect(screen.queryByText("user-req-1")).toBeNull();
    expect(screen.queryByText(/"operation": "LIABILITY_SELECTION"/)).toBeNull();
    fireEvent.click(screen.getByText("Teknik ayrıntı (kodlar ve kimlikler)"));
    expect(screen.getByTestId("approval-technical-details")).toHaveTextContent("CLAIM_ITEM_HIGH_IMPACT_CHANGE");
    expect(screen.getByText("user-req-1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Teknik ayrıntı: ham veri (JSON)"));
    expect(screen.getByText(/"operation": "LIABILITY_SELECTION"/)).toBeInTheDocument();
  });

  it("onaylanmış talep: karar veren adı + 'Yürütüldü'", async () => {
    await open({
      ...BASE,
      status: "APPROVED",
      executionStatus: "SUCCEEDED",
      approverUserId: "user-appr-1",
      decidedAt: "2026-11-16T11:00:00Z",
      displayContext: { ...visibleContext, approverName: "Sentetik Onaycı" },
    });
    expect(screen.getByText("Onaylandı")).toBeInTheDocument();
    expect(screen.getByText("Yürütüldü")).toBeInTheDocument();
    expect(screen.getByText("Sentetik Onaycı")).toBeInTheDocument();
    expect(screen.queryByText("SUCCEEDED")).toBeNull();
  });

  it("dosyayı görme yetkisi yok: dosya numarası / bağlantı YOK, neden açıkça yazılır", async () => {
    await open({
      ...BASE,
      displayContext: { ...visibleContext, case: { status: "NOT_VISIBLE", caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches: true } },
    });
    expect(screen.getByText("Bu dosyayı görme yetkiniz yok; dosya bilgisi gösterilmiyor")).toBeInTheDocument();
    expect(screen.queryByTestId("approval-case-link")).toBeNull();
    expect(screen.queryByText("Kalem (güncel ad)")).toBeNull();
  });

  it("hedef bulunamadı / bağlam alınamadı / ad yok: bilgi uydurulmaz", async () => {
    await open({
      ...BASE,
      displayContext: { requesterName: null, approverName: null, case: { status: "NOT_FOUND", caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches: null } },
    });
    expect(screen.getByText("Hedef kayıt bulunamadı (silinmiş ya da erişilemiyor)")).toBeInTheDocument();
    expect(screen.getByText("Adı bulunamadı")).toBeInTheDocument();
  });

  it("eski sunucu (bağlam alanı yok): dosya ve ad bilgisi alınamadı yazılır", async () => {
    await open({ ...BASE });
    expect(screen.getByText("Dosya bilgisi alınamadı")).toBeInTheDocument();
    expect(screen.getByText("Ad bilgisi alınamadı")).toBeInTheDocument();
    expect(screen.queryByTestId("approval-case-link")).toBeNull();
  });

  it("kayıtlı niyetteki dosya güncel hedefle uyuşmazsa uyarı gösterilir", async () => {
    await open({ ...BASE, displayContext: { ...visibleContext, case: { ...visibleContext.case, intentCaseMatches: false } } });
    expect(screen.getByText(/Kayıtlı niyetteki dosya ile hedefin güncel dosyası uyuşmuyor/)).toBeInTheDocument();
  });

  it("dosya çözülmeyen hedef türünde dosya satırı gösterilmez", async () => {
    await open({
      ...BASE,
      actionCode: "COLLECTION_DISPOSITION_POST",
      targetType: "COLLECTION_DISPOSITION",
      savedIntent: { anything: "goes" },
      displayContext: { requesterName: "Sentetik Talepçi", approverName: null, case: { status: "NOT_APPLICABLE", caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches: null } },
    });
    expect(screen.getByText("Tahsilat dağıtımının kesinleştirilmesi")).toBeInTheDocument();
    expect(screen.queryByText(/^Dosya/)).toBeNull();
  });
});

describe("Onay Talebi Detayı — kalem alanı değişikliği ve kalem adı (P02 ekran eksikleri)", () => {
  // Sentetik: açıklaması boş vekâlet ücreti kalemi; faiz durumu belirlenmemiş → işler, kesinleşme dayanağı.
  const UPDATE_INTENT = {
    version: "OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1",
    operation: "UPDATE",
    caseId: "case-s1",
    claimItemId: "item-s1",
    proposedPatch: {
      attorneyFeeBasis: "JUDGMENT_AWARDED",
      interestAccrualStatus: "ACCRUES",
      interestStartDate: "2026-03-12",
      interestStartDateProvenance: "JUDGMENT_FINALIZATION_DATE",
      interestTypeCode: "LEGAL_3095",
      interestType: "YASAL",
      interestRate: null,
      noInterestReason: null,
      noInterestConfirmedById: null,
    },
    currentSnapshot: {
      itemType: "ATTORNEY_FEE",
      description: null,
      amount: "1000.00",
      currency: "TRY",
      interestAccrualStatus: "UNKNOWN",
      interestStartDate: "2025-06-16T00:00:00.000Z",
      interestStartDateProvenance: null,
      interestTypeCode: "LEGAL_3095",
      interestType: "YASAL",
      interestRate: null,
      attorneyFeeBasis: null,
      noInterestReason: null,
      noInterestConfirmedById: null,
    },
    currentSnapshotHash: "h",
    reason: "ClaimItem high-impact update requires K4 four-eyes approval.",
  };

  it("güncel kalem adı ham kod ise ('PRINCIPAL') Türkçe gösterilir; kod normal görünümde yok", async () => {
    await open({
      ...BASE,
      displayContext: { ...visibleContext, case: { ...visibleContext.case, claimItemLabel: "PRINCIPAL" } },
    });
    expect(screen.getByText("Kalem (güncel ad)")).toBeInTheDocument();
    expect(screen.getByText("Asıl Alacak")).toBeInTheDocument();
    expect(screen.queryByText("PRINCIPAL")).toBeNull();
  });

  it("faiz alanı değişikliği talebi okunur 'önce → sonra' özetiyle gösterilir; değişmeyen faiz türü yazılmaz; sabit gerekçe Türkçe", async () => {
    await open({ ...BASE, reason: UPDATE_INTENT.reason, savedIntent: UPDATE_INTENT, displayContext: visibleContext });
    expect(screen.getByText("Yüksek etkili alacak kalemi değişikliği; iki kişi onayı gerekir.")).toBeInTheDocument();
    expect(screen.queryByText("ClaimItem high-impact update requires K4 four-eyes approval.")).toBeNull();
    const summary = screen.getByTestId("approval-summary");
    expect(summary).toHaveTextContent("Vekalet Ücreti");
    expect(summary).toHaveTextContent("Türü belirtilmemiş → İlam vekâlet ücreti");
    expect(summary).toHaveTextContent("Belirlenmedi → Faiz işler");
    expect(summary).toHaveTextContent("16.06.2025 → 12.03.2026");
    expect(summary).toHaveTextContent("Boş → Kesinleşme tarihi");
    expect(summary).not.toHaveTextContent("Faiz türü");
    expect(screen.queryByText(/ACCRUES|JUDGMENT_FINALIZATION_DATE|JUDGMENT_AWARDED/)).toBeNull();
    expect(screen.getByText("Onaylanınca yalnız listelenen alanlar kaleme yazılır; tutar ve kalem türü değişmez.")).toBeInTheDocument();
  });
});
