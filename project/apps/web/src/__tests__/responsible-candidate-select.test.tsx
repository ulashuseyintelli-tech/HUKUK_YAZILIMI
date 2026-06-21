// M2-G3c: wizard create-mode seçici + buildAssignBody (create-then-PATCH gövdesi).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ResponsibleCandidateSelect,
  buildAssignBody,
} from "@/components/case/responsible-candidate-select";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
const get = api.get as unknown as ReturnType<typeof vi.fn>;

const candidates = [
  { type: "LAWYER", id: "L1", displayName: "Av. Ulaş Hüseyin Telli", subtitle: "Ortak Avukat" },
  { type: "STAFF", id: "S1", displayName: "Büşra Atmaca", subtitle: "Sekreter" },
];

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { data: candidates } });
});

describe("buildAssignBody (M2-G3c create-then-PATCH gövdesi)", () => {
  it("LAWYER → { responsibleLawyerId }", () => {
    expect(buildAssignBody({ type: "LAWYER", id: "L1" })).toEqual({ responsibleLawyerId: "L1" });
  });
  it("STAFF → { responsibleStaffId }", () => {
    expect(buildAssignBody({ type: "STAFF", id: "S1" })).toEqual({ responsibleStaffId: "S1" });
  });
});

describe("ResponsibleCandidateSelect (M2-G3c create-mode)", () => {
  const select = () => screen.getByRole("combobox") as HTMLSelectElement;
  const ready = () => waitFor(() => expect(select().disabled).toBe(false));

  it("adayları (avukat/personel) optgroup ile listeler", async () => {
    render(<ResponsibleCandidateSelect value={null} onChange={() => {}} />);
    await ready();
    expect(screen.getByRole("option", { name: /Av. Ulaş Hüseyin Telli · Ortak Avukat/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Büşra Atmaca · Sekreter/ })).toBeTruthy();
  });

  it("LAWYER seçimi → onChange({type:'LAWYER', id})", async () => {
    const onChange = vi.fn();
    render(<ResponsibleCandidateSelect value={null} onChange={onChange} />);
    await ready();
    fireEvent.change(select(), { target: { value: "LAWYER:L1" } });
    expect(onChange).toHaveBeenCalledWith({ type: "LAWYER", id: "L1" });
  });

  it("STAFF seçimi → onChange({type:'STAFF', id})", async () => {
    const onChange = vi.fn();
    render(<ResponsibleCandidateSelect value={null} onChange={onChange} />);
    await ready();
    fireEvent.change(select(), { target: { value: "STAFF:S1" } });
    expect(onChange).toHaveBeenCalledWith({ type: "STAFF", id: "S1" });
  });

  it("boş seçim → onChange(null)", async () => {
    const onChange = vi.fn();
    render(<ResponsibleCandidateSelect value={{ type: "LAWYER", id: "L1" }} onChange={onChange} />);
    await ready();
    fireEvent.change(select(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("value verilince ilgili aday seçili gösterilir", async () => {
    render(<ResponsibleCandidateSelect value={{ type: "STAFF", id: "S1" }} onChange={() => {}} />);
    await ready();
    expect(select().value).toBe("STAFF:S1");
  });
});
