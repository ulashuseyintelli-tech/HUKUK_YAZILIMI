import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationDeck } from "@/components/case-detail/OperationDeck";

/**
 * OperationDeck — Yapılacaklar sekmesi: masraf görevinde yanlış adrese giden ✓ kaldırılır; adres görevi ✓ adlıdır.
 *
 * Kusur (gerçek tarayıcıda ölçüldü, main 6681b1d5 / 88cd328d): masraf talebinden türetilen görevin satırında adsız bir onay
 * (✓) simgesi vardı; basılınca `onTaskAction(taskId, "complete")` masraf talebi kimliğiyle çağrılıyor, sayfa bunu adres görevi
 * ucuna gönderip 404 alıyordu ve ekranda hiçbir şey olmuyordu.
 *
 * Owner kararı (2026-10-05): pasif simge + somut, nötr açıklama; yanlış adrese giden tıklama kaldırılır, çalışmayan eylem
 * çalışıyormuş gibi gösterilmez. Bu bileşen yalnız satırı çizer; hata bandı sayfadadır (`case-detail-task-actions.spec.tsx`).
 */

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

type DeckProps = React.ComponentProps<typeof OperationDeck>;
type Tasks = NonNullable<DeckProps["tasks"]>;

const PASSIVE_REASON = "Masraf talebinden türetildi; buradan kapatılamaz";

const expenseTask = (id: string, over: Partial<Tasks[number]> = {}): Tasks[number] => ({
  id,
  title: "Müvekkilden Takip açılış masrafları talep edildi",
  source: "SISTEM",
  basis: "MASRAF_TALEBI",
  taskType: "EXPENSE_REQUEST",
  status: "BEKLIYOR",
  priority: "HIGH",
  category: "SURE_BAGLI",
  ...over,
});

const addressTask = (id: string, taskType: string, title: string): Tasks[number] => ({
  id,
  title,
  source: "SISTEM",
  basis: taskType,
  taskType,
  status: "BEKLIYOR",
  priority: "MEDIUM",
  category: "SURE_BAGLI",
});

function openTasks(tasks: Tasks, onTaskAction = vi.fn(), onConfirmReceived = vi.fn()) {
  render(<OperationDeck caseId="case-1" tasks={tasks} onTaskAction={onTaskAction} onConfirmReceived={onConfirmReceived} />);
  const tab = screen.getAllByRole("button").find((b) => /^Yapılacaklar(\d+)?$/.test(norm(b.textContent)));
  if (!tab) throw new Error("Yapılacaklar sekmesi bulunamadı");
  fireEvent.click(tab);
  return { onTaskAction, onConfirmReceived };
}

const rowOf = (title: string) => screen.getByText(title).closest("div.flex.items-center.justify-between") as HTMLElement;

describe("Yapılacaklar — masraf görevi satırı", () => {
  it("✓ düğmesi çizilmez; pasif açıklama (görünür metin + title) çizilir; tıklama onTaskAction çağırmaz", () => {
    const { onTaskAction } = openTasks([expenseTask("exp-1")]);
    const row = rowOf("Müvekkilden Takip açılış masrafları talep edildi");

    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    const passive = within(row).getByText(PASSIVE_REASON);
    expect(passive.getAttribute("title")).toBe(PASSIVE_REASON);
    expect(passive.getAttribute("data-testid")).toBe("task-passive-action");
    fireEvent.click(passive);
    expect(onTaskAction).not.toHaveBeenCalled();
  });

  it("öncelik rozeti ve tarih satırda aynen kalır (yalnız eylem öğesi değişir)", () => {
    openTasks([expenseTask("exp-1", { dueDate: "2026-10-09T00:00:00.000Z" })]);
    const row = rowOf("Müvekkilden Takip açılış masrafları talep edildi");
    expect(norm(row.textContent)).toContain("Acil");
    expect(norm(row.textContent)).toContain("09.10.2026");
  });

  it("masraf görevinin her görünür durumunda pasif kalır (PENDING / SENT / OVERDUE … aynı satır çizimi)", () => {
    openTasks([
      expenseTask("exp-1", { title: "Masraf A", priority: "HIGH" }),
      expenseTask("exp-2", { title: "Masraf B", priority: "MEDIUM" }),
      expenseTask("exp-3", { title: "Masraf C", priority: "LOW" }),
    ]);
    for (const title of ["Masraf A", "Masraf B", "Masraf C"]) {
      expect(within(rowOf(title)).queryAllByRole("button")).toHaveLength(0);
      expect(within(rowOf(title)).getByText(PASSIVE_REASON)).toBeTruthy();
    }
  });
});

describe("Yapılacaklar — adres görevi satırı", () => {
  it("✓ düğmesi görev başlığını taşıyan erişilebilir ad alır ve onTaskAction(id, complete) çağırır", () => {
    const { onTaskAction } = openTasks([addressTask("at-1", "CLIENT_CONTACT_VALIDATE", "Müvekkil iletişim bilgilerini doğrula")]);
    const row = rowOf("Müvekkil iletişim bilgilerini doğrula");

    const button = within(row).getByRole("button", { name: "Görevi tamamla: Müvekkil iletişim bilgilerini doğrula" });
    // Simge ekran okuyucudan gizlenir: ad yalnız aria-label'dan gelir.
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(row).queryByText(PASSIVE_REASON)).toBeNull();
    fireEvent.click(button);
    expect(onTaskAction).toHaveBeenCalledTimes(1);
    expect(onTaskAction).toHaveBeenCalledWith("at-1", "complete");
  });

  it('adres talebi görevinde "Zaten aldık" aynen çalışır; ✓ yanında adlıdır', () => {
    const { onConfirmReceived, onTaskAction } = openTasks([addressTask("at-2", "CLIENT_REQUEST_DEBTOR_ADDRESSES", "Müvekkile adres talebi gönder")]);
    const row = rowOf("Müvekkile adres talebi gönder");

    fireEvent.click(within(row).getByRole("button", { name: "Zaten aldık" }));
    expect(onConfirmReceived).toHaveBeenCalledWith("at-2");
    expect(onTaskAction).not.toHaveBeenCalled();
    expect(within(row).getByRole("button", { name: "Görevi tamamla: Müvekkile adres talebi gönder" })).toBeTruthy();
  });

  it("aynı listede masraf ve adres görevi: yalnız adres görevinin ✓ düğmesi vardır", () => {
    openTasks([addressTask("at-1", "MANUAL_CLIENT_FOLLOWUP", "Müvekkil takibi"), expenseTask("exp-1")]);
    expect(within(rowOf("Müvekkil takibi")).getAllByRole("button")).toHaveLength(1);
    expect(within(rowOf("Müvekkilden Takip açılış masrafları talep edildi")).queryAllByRole("button")).toHaveLength(0);
  });
});
