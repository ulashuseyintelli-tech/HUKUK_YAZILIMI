import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * OFFICE-AUTH-P01 — password visibility toggle: yalnız type="password"/"text" arasında
 * geçiş yapar; value/onChange kaybolmaz; toggle butonu type="button" (form submit
 * ETMEZ); aria-label/aria-pressed mevcut (klavye + screen-reader erişilebilirliği).
 */
describe("PasswordInput — OFFICE-AUTH-P01", () => {
  it("[1] başlangıçta type=password, göster butonuna basınca type=text olur, tekrar basınca geri döner", () => {
    render(<PasswordInput name="password" defaultValue="gizli-sifre" />);
    const input = screen.getByDisplayValue("gizli-sifre") as HTMLInputElement;
    expect(input.type).toBe("password");

    const toggle = screen.getByRole("button", { name: "Şifreyi göster" });
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Şifreyi gizle" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Şifreyi gizle" }));
    expect(input.type).toBe("password");
  });

  it("[2] toggle value'yu KAYBETMEZ — görünürlük değişse de girilen değer aynı kalır", () => {
    const onChange = vi.fn();
    render(<PasswordInput name="password" value="degismez-deger" onChange={onChange} />);
    const input = screen.getByDisplayValue("degismez-deger") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Şifreyi göster" }));
    expect(input.value).toBe("degismez-deger");
    // Toggle onChange'i TETİKLEMEZ (yalnız görünürlük local state'i).
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[3] toggle butonu type=\"button\" — bir <form> içinde submit'i TETİKLEMEZ", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput name="password" defaultValue="x" />
      </form>
    );
    const toggle = screen.getByRole("button", { name: "Şifreyi göster" });
    expect(toggle.getAttribute("type")).toBe("button");
    fireEvent.click(toggle);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("[4] aria-pressed toggle durumunu yansıtır (erişilebilirlik)", () => {
    render(<PasswordInput name="password" defaultValue="x" />);
    const toggle = screen.getByRole("button", { name: "Şifreyi göster" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Şifreyi gizle" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("[5] name/autoComplete/required gibi standart input prop'ları forward edilir", () => {
    render(<PasswordInput name="currentPassword" autoComplete="current-password" required defaultValue="x" />);
    const input = screen.getByDisplayValue("x") as HTMLInputElement;
    expect(input.name).toBe("currentPassword");
    expect(input.autocomplete).toBe("current-password");
    expect(input.required).toBe(true);
  });
});
