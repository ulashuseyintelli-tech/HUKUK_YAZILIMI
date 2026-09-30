import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { FormCard } from "@/components/case/FormCard";
import type { FormMetadata } from "@/types/form-metadata";

/**
 * FormCard — "Detaylı bilgi" düğmesi seçim düğmesinin İÇİNDE değil kardeşidir (iç içe <button> geçersiz HTML ve
 * hydration uyarısıydı). Görünüm (yer tutucu) ve sekme sırası (önce kart, sonra bilgi) korunur.
 */
const base = {
  title: "İlamsız Takip",
  name: "Örnek 7",
  iikMaddesi: "İİK 58",
  uyapCode: "TEST",
  usageScenario: "Senaryo",
} as unknown as FormMetadata;

const withSubForms = {
  ...base,
  code: "KAMBIYO",
  subForms: [{ code: "CEK", title: "Çek", name: "Örnek 10", uyapCode: "C", usageScenario: "Çek" }],
} as unknown as FormMetadata;

afterEach(cleanup);

describe("FormCard — iç içe düğme yok", () => {
  it.each([
    ["alt kategorisiz", { ...base, code: "ILAMSIZ" } as unknown as FormMetadata],
    ["alt kategorili", withSubForms],
  ])("%s kartta hiçbir düğme başka bir düğmenin içinde değil", (_label, form) => {
    const { container } = render(<FormCard form={form} isSelected={false} onSelect={vi.fn()} onInfoClick={vi.fn()} />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(button.parentElement?.closest("button")).toBeNull();
    }
  });

  it("bilgi düğmesi yalnız bilgi açar; kart seçimi / alt kategori açılışı tetiklenmez", () => {
    const onSelect = vi.fn();
    const onInfoClick = vi.fn();
    const { getByTestId, queryByText } = render(
      <FormCard form={withSubForms} isSelected={false} onSelect={onSelect} onInfoClick={onInfoClick} />,
    );
    fireEvent.click(getByTestId("form-card-info"));
    expect(onInfoClick).toHaveBeenCalledWith(withSubForms);
    expect(onSelect).not.toHaveBeenCalled();
    // alt kategori listesi açılmadı
    expect(queryByText("Örnek 10 • UYAP: C")).toBeNull();
  });

  it("kart tıklaması eskisi gibi: alt kategorisizde seçer, alt kategorilide listeyi açar", () => {
    const plain = { ...base, code: "ILAMSIZ" } as unknown as FormMetadata;
    const onSelect = vi.fn();
    const first = render(<FormCard form={plain} isSelected={false} onSelect={onSelect} onInfoClick={vi.fn()} />);
    fireEvent.click(first.container.querySelector("button")!);
    expect(onSelect).toHaveBeenCalledWith(plain);
    cleanup();

    const second = render(<FormCard form={withSubForms} isSelected={false} onSelect={vi.fn()} onInfoClick={vi.fn()} />);
    const card = second.container.querySelector("button")!;
    expect(card.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(card);
    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(second.getByText("Örnek 10 • UYAP: C")).toBeTruthy();
  });

  it("sekme sırası korunur (önce kart, sonra bilgi); yerleşim için aynı boyutlu yer tutucu kartın içinde", () => {
    const { container, getByTestId } = render(
      <FormCard form={withSubForms} isSelected={false} onSelect={vi.fn()} onInfoClick={vi.fn()} />,
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[0].contains(getByTestId("form-card-info-slot"))).toBe(true);
    expect(buttons[1]).toBe(getByTestId("form-card-info"));
    expect(getByTestId("form-card-info-slot").getAttribute("aria-hidden")).toBe("true");
    expect(getByTestId("form-card-info").getAttribute("title")).toBe("Detaylı bilgi");
    expect(buttons[0].getAttribute("type")).toBe("button");
  });
});
