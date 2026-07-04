// WP-1d-5-6 — Avukat drawer'ı içindeki Hukuki Sorumlu Avukat kanonik aksiyonu (component testi).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LegalResponsibleDrawerAction } from "@/components/case/legal-responsible-drawer-action";

describe("LegalResponsibleDrawerAction (WP-1d-5-6)", () => {
  it("current değilse: kanonik 'Bu Avukat Olarak Değiştir' butonu görünür + tıklayınca onChangeRequest", () => {
    const onChangeRequest = vi.fn();
    render(<LegalResponsibleDrawerAction isCurrentResponsible={false} onChangeRequest={onChangeRequest} />);
    const btn = screen.getByText("Hukuki Sorumlu Avukat Kaydını Bu Avukat Olarak Değiştir");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onChangeRequest).toHaveBeenCalledTimes(1);
  });

  it("mevcut hukuki sorumlu ise: 'mevcut' bilgisi gösterilir + DEĞİŞTİR butonu YOK (aksiyon gizli)", () => {
    const onChangeRequest = vi.fn();
    render(<LegalResponsibleDrawerAction isCurrentResponsible={true} onChangeRequest={onChangeRequest} />);
    expect(screen.getByText("Bu avukat mevcut Hukuki Sorumlu Avukat.")).toBeTruthy();
    expect(
      screen.queryByText("Hukuki Sorumlu Avukat Kaydını Bu Avukat Olarak Değiştir"),
    ).toBeNull();
    expect(onChangeRequest).not.toHaveBeenCalled();
  });
});
