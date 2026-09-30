import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectedDebtorCard } from "../SelectedDebtorCard";
import { DebtorRole, DebtorType, NotificationMode, TebligatLegalMethod, type CaseDebtor } from "@/types/debtor";

/**
 * K3-L Faz 2b — aval verenin LEHİNE aval verdiği kişi sihirbazda girilir (çek tazminatı sorumluluğu buna göre
 * sınıflanır). Seçim yalnız rol AVAL iken sunulur; rol değişince temizlenir.
 */
const caseDebtor = (over: Partial<CaseDebtor> = {}): CaseDebtor =>
  ({
    debtorId: "d-aval",
    debtor: { id: "d-aval", type: DebtorType.INDIVIDUAL, name: "Aval Veren", debtorAddresses: [] },
    role: DebtorRole.AVAL,
    notificationMode: NotificationMode.NORMAL,
    tebligatLegalMethod: TebligatLegalMethod.POSTAL,
    prepareNotification: true,
    ...over,
  }) as CaseDebtor;

const candidates = [
  { debtorId: "d-kesideci", name: "Keşideci Ali" },
  { debtorId: "d-ciranta", name: "Ciranta Ayşe" },
];

describe("SelectedDebtorCard — lehine aval (K3-L Faz 2b)", () => {
  it("rol AVAL iken diğer dosya borçluları arasından lehine aval seçilir", () => {
    const onUpdate = vi.fn();
    render(<SelectedDebtorCard caseDebtor={caseDebtor()} onUpdate={onUpdate} onRemove={vi.fn()} avalCandidates={candidates} />);
    const select = screen.getByTestId("aval-for-select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Belirtilmedi", "Keşideci Ali", "Ciranta Ayşe"]);
    fireEvent.change(select, { target: { value: "d-kesideci" } });
    expect(onUpdate).toHaveBeenCalledWith({ avalForDebtorId: "d-kesideci" });
  });

  it("rol AVAL değilken seçim sunulmaz", () => {
    render(
      <SelectedDebtorCard
        caseDebtor={caseDebtor({ role: DebtorRole.KESIDECI })}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        avalCandidates={candidates}
      />,
    );
    expect(screen.queryByTestId("aval-for-select")).toBeNull();
  });

  it("rol AVAL'dan başka role çevrilince lehine aval bilgisi temizlenir", () => {
    const onUpdate = vi.fn();
    render(
      <SelectedDebtorCard
        caseDebtor={caseDebtor({ avalForDebtorId: "d-kesideci" })}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        avalCandidates={candidates}
      />,
    );
    const roleSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: DebtorRole.CIRANTA } });
    expect(onUpdate).toHaveBeenCalledWith({ role: DebtorRole.CIRANTA, avalForDebtorId: undefined });
  });
});
