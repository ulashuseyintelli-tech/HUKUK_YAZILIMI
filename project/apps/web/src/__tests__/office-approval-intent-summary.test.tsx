import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApprovalIntentSummary } from "@/components/office-approval/ApprovalIntentSummary";

const DISPOSITION_PAYLOAD = {
  caseId: "case-1",
  collectionId: "col-1",
  totalAmount: "50000.00",
  currency: "TRY",
  lines: [{ id: "l1", type: "CLIENT_PAYABLE", amount: "50000.00", caseClientId: "cc-1", note: null }],
  risk: { decision: "ALLOW_DIRECT", priorityRank: 0, reasons: [] },
};

const MASKED_PAYLOAD = {
  totalAmount: "50000.00",
  currency: "TRY",
  lineCount: 3,
  risk: { decision: "REQUIRE_APPROVAL", priorityRank: 1, reasons: [] },
};

describe("ApprovalIntentSummary", () => {
  it("özetlenebilir payload (COLLECTION_DISPOSITION_POST) -> özet + 'Onaylanırsa ne değişir?' render edilir; JSON varsayılan kapalı", () => {
    render(
      <ApprovalIntentSummary
        title="Kayıtlı Niyet (savedIntent)"
        actionCode="COLLECTION_DISPOSITION_POST"
        savedIntent={DISPOSITION_PAYLOAD}
        context={{}}
        copyAriaLabel="savedIntent kopyala"
      />,
    );
    expect(screen.getByTestId("approval-summary")).toBeInTheDocument();
    expect(screen.getByText("Onaylanırsa ne değişir?")).toBeInTheDocument();
    expect(screen.getByText("Tahsilat dağıtımı onaylanır.")).toBeInTheDocument();
    expect(screen.queryByText(/"caseId"/)).toBeNull(); // JSON kapalı
    expect(screen.getByText("Advanced / Ham JSON")).toBeInTheDocument();
  });

  it("Advanced / Ham JSON tıklanınca ham veri açılır ve kopyalama butonu görünür", () => {
    render(
      <ApprovalIntentSummary
        title="Kayıtlı Niyet (savedIntent)"
        actionCode="COLLECTION_DISPOSITION_POST"
        savedIntent={DISPOSITION_PAYLOAD}
        context={{}}
        copyAriaLabel="savedIntent kopyala"
      />,
    );
    fireEvent.click(screen.getByText("Advanced / Ham JSON"));
    expect(screen.getByText(/"caseId": "case-1"/)).toBeInTheDocument();
    expect(screen.getByLabelText("savedIntent kopyala")).toBeInTheDocument();
    expect(screen.getByText("Ham JSON'ı gizle")).toBeInTheDocument();
  });

  it("MASKED payload -> satır detayı gösterilmez, toplam/kalem sayısı/risk güvenle gösterilir", () => {
    render(
      <ApprovalIntentSummary
        title="Kayıtlı Niyet (savedIntent)"
        actionCode="COLLECTION_DISPOSITION_POST"
        savedIntent={MASKED_PAYLOAD}
        context={{ financeVisibility: { applied: true, level: "MASKED", contractVersion: "v1", maskedFields: [] } }}
        copyAriaLabel="savedIntent kopyala"
      />,
    );
    expect(screen.getByTestId("approval-summary")).toBeInTheDocument();
    expect(screen.getByText("3 (detay gizli)")).toBeInTheDocument();
    expect(screen.getByText("REQUIRE_APPROVAL")).toBeInTheDocument();
    expect(screen.queryByText("Müvekkile Ödenecek")).toBeNull();
  });

  it("BİRİNCİL SİNYAL uçtan uca: satırları DOLU bir payload ama context financeVisibility.level='MASKED' -> UI satır detayını YİNE gizler", () => {
    render(
      <ApprovalIntentSummary
        title="Kayıtlı Niyet (savedIntent)"
        actionCode="COLLECTION_DISPOSITION_POST"
        savedIntent={DISPOSITION_PAYLOAD}
        context={{ financeVisibility: { applied: true, level: "MASKED", contractVersion: "v1", maskedFields: [] } }}
        copyAriaLabel="savedIntent kopyala"
      />,
    );
    expect(screen.queryByText("Müvekkile Ödenecek")).toBeNull();
    expect(screen.getByText("1 (detay gizli)")).toBeInTheDocument();
  });

  it("bilinmeyen actionCode -> unsafe fallback mesajı gösterilir; JSON varsayılan AÇIK (özet yok)", () => {
    render(
      <ApprovalIntentSummary
        title="Kayıtlı Niyet (savedIntent)"
        actionCode="CLIENT_OFFSET_APPLY"
        savedIntent={{ anything: "goes" }}
        context={{}}
        copyAriaLabel="savedIntent kopyala"
      />,
    );
    expect(screen.getByTestId("approval-summary-unsafe")).toBeInTheDocument();
    expect(screen.getByText(/güvenli özet üretilemiyor/)).toBeInTheDocument();
    // Gösterilecek özet olmadığı için ham JSON zaten açık.
    expect(screen.getByText(/"anything": "goes"/)).toBeInTheDocument();
    expect(screen.getByText("Ham JSON'ı gizle")).toBeInTheDocument();
  });

  it("CHANGE_STATUS minimal özet render edilir", () => {
    render(
      <ApprovalIntentSummary
        title="Kayıtlı Niyet (savedIntent)"
        actionCode="CHANGE_STATUS"
        savedIntent={{ status: "HITAM", reason: "Dosya kapandı" }}
        context={{}}
        copyAriaLabel="savedIntent kopyala"
      />,
    );
    expect(screen.getByText("HITAM")).toBeInTheDocument();
    expect(screen.getByText("Dosya kapandı")).toBeInTheDocument();
    // CHANGE_STATUS için action-behavior-catalog girdisi yok -> impact notes bölümü render edilmez.
    expect(screen.queryByText("Onaylanırsa ne değişir?")).toBeNull();
  });
});
