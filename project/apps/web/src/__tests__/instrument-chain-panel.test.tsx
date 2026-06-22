// A1 Faz 2b-B — kambiyo zinciri UI: saf helper'lar + InstrumentChainPanel (vitest + testing-library).
// Motor backend'de (#384); burada UI↔kontrat dönüşümü + panel akışı (önizle/RESOLVED/NEEDS_REVIEW/kaydet).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InstrumentChainPanel } from "../components/case/InstrumentChainPanel";
import { api, CaseInstrument } from "../lib/api";
import {
  rowsToChain,
  instrumentToRows,
  chainToEndorsersJson,
  emptyNodeRow,
} from "../lib/instrument-chain";
import type { ChainAnalysis } from "../lib/instrument-chain";

// ── Saf helper'lar ──────────────────────────────────────────────────────────
describe("instrument-chain helpers", () => {
  it("rowsToChain: name trim · boş identityNo atlanır · position null korunur · endorsements boş", () => {
    const chain = rowsToChain(
      [
        { role: "DRAWER", name: " Keşideci ", identityNo: "", partyType: "COMPANY", position: 0, source: "MANUAL", confidence: 1, verified: false },
        { role: "ENDORSER", name: "C1", identityNo: "11111111111", partyType: "INDIVIDUAL", position: null, source: "OCR", confidence: 0.4, verified: true },
      ],
      [{ avalistPosition: 2, guaranteesPosition: 0 }],
      "2026-06-23T00:00:00.000Z",
    );
    expect(chain.nodes[0].party.name).toBe("Keşideci");
    expect(chain.nodes[0].party.identityNo).toBeUndefined();
    expect(chain.nodes[1].position).toBeNull();
    expect(chain.nodes[1].provenance.verifiedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(chain.endorsements).toEqual([]);
    expect(chain.avals[0]).toMatchObject({ avalistPosition: 2, guaranteesPosition: 0 });
  });

  it("instrumentToRows: endorsers.nodes → satır; legacy string[] / null → boş (kırılmaz)", () => {
    const { rows } = instrumentToRows(
      { nodes: [{ role: "DRAWER", party: { name: "X", type: "COMPANY" }, position: 0, provenance: { source: "OCR", confidence: 0.9 } }] },
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("X");
    expect(rows[0].position).toBe(0);
    expect(instrumentToRows(["legacy"], null).rows).toEqual([]);
    expect(instrumentToRows(null, null).rows).toEqual([]);
  });

  it("chainToEndorsersJson: { nodes, endorsements } kalıcı şekli", () => {
    const json = chainToEndorsersJson(rowsToChain([emptyNodeRow()], []));
    expect(json).toHaveProperty("nodes");
    expect(json).toHaveProperty("endorsements");
  });
});

// ── Panel ───────────────────────────────────────────────────────────────────
const fakeInstrument = (over: Partial<CaseInstrument> = {}): CaseInstrument => ({
  id: "i1",
  caseId: "c1",
  instrumentType: "CEK",
  serialNo: "ABC123",
  issueDate: "2025-01-01",
  maturityDate: "2025-06-01",
  amount: 1000,
  currency: "TRY",
  createdAt: "2025-01-01",
  ...over,
});

const seededInstrument = () =>
  fakeInstrument({
    endorsers: {
      nodes: [
        { role: "DRAWER", party: { name: "Keşideci A", type: "COMPANY" }, position: 0, provenance: { source: "OCR", confidence: 0.9 } },
      ],
    },
  });

describe("InstrumentChainPanel (2b-B)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("kapalı başlar; toggle ile açılır (lazy: editor sonradan mount)", () => {
    render(<InstrumentChainPanel instrument={fakeInstrument()} />);
    expect(screen.getByTestId("chain-toggle")).toBeTruthy();
    expect(screen.queryByTestId("preview-recourse")).toBeNull();
    fireEvent.click(screen.getByTestId("chain-toggle"));
    expect(screen.getByTestId("preview-recourse")).toBeTruthy();
  });

  it("açılışta kalıcı endorsers.nodes satırlara ön-doldurulur", () => {
    render(<InstrumentChainPanel instrument={seededInstrument()} />);
    fireEvent.click(screen.getByTestId("chain-toggle"));
    expect(screen.getAllByTestId("node-row")).toHaveLength(1);
    expect((screen.getByLabelText("Ad") as HTMLInputElement).value).toBe("Keşideci A");
  });

  it("Müracaat önizle → RESOLVED: hamil + ADAY müracaat listesi (avukat onayı etiketi)", async () => {
    const analysis: ChainAnalysis = {
      holder: {
        status: "RESOLVED",
        holderPosition: 2,
        holderNode: { role: "ENDORSER", party: { name: "Hamil X", type: "INDIVIDUAL" }, position: 2, provenance: { source: "MANUAL", confidence: 1 } },
        reason: "",
      },
      recourse: {
        status: "RESOLVED",
        parties: [{ name: "Keşideci A", type: "COMPANY", role: "DRAWER", position: 0, basis: "keşideci" }],
        reason: "",
      },
    };
    const spy = vi.spyOn(api, "analyzeInstrumentChain").mockResolvedValue(analysis);
    render(<InstrumentChainPanel instrument={seededInstrument()} />);
    fireEvent.click(screen.getByTestId("chain-toggle"));
    fireEvent.click(screen.getByTestId("preview-recourse"));
    await waitFor(() => expect(screen.getByTestId("recourse-resolved")).toBeTruthy());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("holder-name").textContent).toBe("Hamil X");
    expect(screen.getByTestId("recourse-list").textContent).toContain("Keşideci A");
    expect(screen.getByTestId("recourse-resolved").textContent).toContain("avukat onayı gerekir");
  });

  it("Müracaat önizle → NEEDS_REVIEW: sarı kutu 'borçlu üretilmedi', RESOLVED yok", async () => {
    const analysis: ChainAnalysis = {
      holder: { status: "NEEDS_REVIEW", reason: "sıra yok" },
      recourse: { status: "NEEDS_REVIEW", parties: [], reason: "sırasız girdi" },
    };
    vi.spyOn(api, "analyzeInstrumentChain").mockResolvedValue(analysis);
    render(<InstrumentChainPanel instrument={fakeInstrument()} />);
    fireEvent.click(screen.getByTestId("chain-toggle"));
    fireEvent.click(screen.getByTestId("add-node")); // önizle butonu rows>0 ister
    fireEvent.click(screen.getByTestId("preview-recourse"));
    await waitFor(() => expect(screen.getByTestId("recourse-needs-review")).toBeTruthy());
    expect(screen.queryByTestId("recourse-resolved")).toBeNull();
    expect(screen.getByTestId("recourse-needs-review").textContent).toContain("borçlu üretilmedi");
  });

  it("Zinciri kaydet → updateInstrument(endorsers/avals) ile kalıcılaştırır (mevcut PUT; yeni uç yok)", async () => {
    const spy = vi.spyOn(api, "updateInstrument").mockResolvedValue({} as any);
    render(<InstrumentChainPanel instrument={seededInstrument()} />);
    fireEvent.click(screen.getByTestId("chain-toggle"));
    fireEvent.click(screen.getByTestId("save-chain"));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [id, payload] = spy.mock.calls[0] as [string, any];
    expect(id).toBe("i1");
    expect(payload).toHaveProperty("endorsers");
    expect(payload).toHaveProperty("avals");
  });
});
