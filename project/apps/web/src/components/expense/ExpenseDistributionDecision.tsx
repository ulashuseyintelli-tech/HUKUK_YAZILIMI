"use client";

// D4 — Dosya Finans bölümündeki "Masraf Talepleri" satırlarında masraf DAĞITIM UYGUNLUĞU kararı (onay / ret).
//
// Bu işlem ödeme, müvekkile gönderim ya da finalize DEĞİLDİR (bkz. lib/expense-distribution-decision.ts).
// Durum `GET /expense-requests/by-case/:caseId` satırlarından okunur (`expenseApprovalStatus` + `status`); bölümün
// mevcut satır kaynağı (three-view) bu alanı taşımaz. Karar: `POST /expense-requests/:id/approve` ve
// `POST /expense-requests/:id/reject` (gövde `{ note }`). Yetki ve öz-onay kararı SUNUCUNUNDUR (#3072).
//
// Kurallar:
//  - Kilit TALEP KİMLİĞİ başınadır: aynı talebin onay ve reddi ortak kilidi kullanır, farklı talepler bağımsızdır.
//    Kilit, karardan sonraki yeniden okuma bitene kadar sürer.
//  - 409 ya da "artık beklemiyor / iptal edilmiş" yanıtında talep YENİDEN OKUNUR; karar kullanıcı adına tekrar
//    GÖNDERİLMEZ; gerekçe korunur.
//  - Karar kaydedildikten sonra yeniden okuma düşerse "karar kaydedildi, görünüm yenilenemedi" ayrı gösterilir ve
//    o talep için bu görünümde yeni karar yazımı ENGELLENİR.
//  - Okunmayan / tanınmayan durumda düğme sunulmaz (durum tahmin edilmez).
//
// Çağrıldığı yer: components/case-detail/OperationDeck.tsx (Finans sekmesi, "Masraf Talepleri" satırları).

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { financeApi } from "@/lib/api/finance";
import { toActionError } from "@/lib/action-error";
import {
  DISTRIBUTION_APPROVE_EXPLANATION,
  DISTRIBUTION_DECISION_FALLBACK,
  DISTRIBUTION_REJECT_EXPLANATION,
  DISTRIBUTION_STATUS_LABEL,
  canOfferDistributionDecision,
  classifyDistributionDecisionFailure,
  readDistributionState,
  type DistributionApprovalStatus,
  type ExpenseDistributionState,
} from "@/lib/expense-distribution-decision";

type LoadStatus = "IDLE" | "LOADING" | "READY" | "ERROR";

interface Entry {
  state: ExpenseDistributionState;
  /** Bu değeri üreten okumanın sıra numarası; daha eski bir okuma daha yeni değeri EZMEZ. */
  seq: number;
}

export interface ExpenseDistributionRowRuntime {
  busy: boolean;
  /** Bu görünüm oturumunda sunucuya kaydedilen karar (varsa). Doluysa yeni karar yazımı yok. */
  decided: DistributionApprovalStatus | null;
  /** Karar kaydedildi ama ardından görünüm yenilenemedi. */
  refreshFailed: boolean;
  /** Sunucu durumun değiştiğini bildirdi ve yeniden okuma düştü: elde güncel durum yok. */
  stale: boolean;
  error: string | null;
  info: string | null;
}

const IDLE_RUNTIME: ExpenseDistributionRowRuntime = {
  busy: false,
  decided: null,
  refreshFailed: false,
  stale: false,
  error: null,
  info: null,
};

export interface ExpenseDistributionDecisions {
  enabled: boolean;
  loadStatus: LoadStatus;
  stateOf: (expenseId: string) => ExpenseDistributionState | undefined;
  runtimeOf: (expenseId: string) => ExpenseDistributionRowRuntime;
  reload: () => Promise<void>;
  /** Yalnız okuma: tek talebin görünümünü yeniler (karar yazmaz). */
  refreshOne: (expenseId: string) => Promise<void>;
  /** Karar sunucuya kaydedildiyse true. */
  decide: (expenseId: string, decision: "APPROVED" | "REJECTED", note?: string) => Promise<boolean>;
}

/**
 * `caseId` yoksa ya da `expenseIdsKey` boşsa (bölümde talep yok) hiçbir okuma yapılmaz. `expenseIdsKey` değişince
 * (yeni talep geldi / liste yeniden okundu) durum yeniden okunur.
 */
export function useExpenseDistributionDecisions(
  caseId: string | undefined,
  expenseIdsKey: string,
): ExpenseDistributionDecisions {
  const enabled = Boolean(caseId) && expenseIdsKey !== "";
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("IDLE");
  const [runtime, setRuntime] = useState<Record<string, ExpenseDistributionRowRuntime>>({});
  const seqRef = useRef(0);
  const latestFullReadRef = useRef(0);
  const inFlightRef = useRef(new Set<string>());
  const decidedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const patchRuntime = useCallback((id: string, patch: Partial<ExpenseDistributionRowRuntime>) => {
    if (!mountedRef.current) return;
    setRuntime((prev) => ({ ...prev, [id]: { ...(prev[id] ?? IDLE_RUNTIME), ...patch } }));
  }, []);

  const readRows = useCallback(async (): Promise<{ seq: number; rows: unknown[] }> => {
    const seq = ++seqRef.current;
    const rows: unknown = await api.getExpenseRequestsByCase(caseId as string);
    if (!Array.isArray(rows)) throw new Error("Masraf talepleri okuma yanıtı beklenen biçimde değil.");
    return { seq, rows };
  }, [caseId]);

  /**
   * `onlyId` verilirse yalnız o talep güncellenir (diğer satırların durumuna dokunulmaz). Yanıtta bulunmayan talep
   * (`expected` ya da `onlyId`) "bilinmiyor" sayılır; durum tahmin edilmez.
   */
  const applyRows = useCallback((seq: number, rows: unknown[], scope: { onlyId: string } | { expected: string[] }) => {
    if (!mountedRef.current) return;
    const onlyId = "onlyId" in scope ? scope.onlyId : undefined;
    setEntries((prev) => {
      const next = { ...prev };
      const seen = new Set<string>();
      for (const row of rows) {
        const id = row && typeof row === "object" ? (row as { id?: unknown }).id : undefined;
        if (typeof id !== "string" || id === "") continue;
        if (onlyId !== undefined && id !== onlyId) continue;
        seen.add(id);
        if ((prev[id]?.seq ?? 0) < seq) next[id] = { state: readDistributionState(row), seq };
      }
      const absent = onlyId !== undefined ? [onlyId] : [...new Set([...Object.keys(prev), ...("expected" in scope ? scope.expected : [])])];
      for (const id of absent) {
        if (!seen.has(id) && (prev[id]?.seq ?? 0) < seq) next[id] = { state: { kind: "UNKNOWN" }, seq };
      }
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const marker = ++latestFullReadRef.current;
    const expected = expenseIdsKey.split(",").filter((id) => id !== "");
    setLoadStatus((prev) => (prev === "READY" ? prev : "LOADING"));
    try {
      const { seq, rows } = await readRows();
      applyRows(seq, rows, { expected });
      if (mountedRef.current && marker === latestFullReadRef.current) setLoadStatus("READY");
    } catch {
      if (mountedRef.current && marker === latestFullReadRef.current) setLoadStatus("ERROR");
    }
  }, [enabled, expenseIdsKey, readRows, applyRows]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshEntry = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { seq, rows } = await readRows();
      applyRows(seq, rows, { onlyId: id });
      return true;
    } catch {
      return false;
    }
  }, [readRows, applyRows]);

  const refreshOne = useCallback(async (id: string) => {
    if (!enabled || inFlightRef.current.has(id)) return;
    inFlightRef.current.add(id);
    patchRuntime(id, { busy: true });
    try {
      const ok = await refreshEntry(id);
      patchRuntime(
        id,
        ok
          ? { refreshFailed: false, stale: false, error: null, info: "Güncel durum okundu." }
          : { info: null, error: "Güncel durum okunamadı. Daha sonra yeniden deneyin." },
      );
    } finally {
      inFlightRef.current.delete(id);
      patchRuntime(id, { busy: false });
    }
  }, [enabled, refreshEntry, patchRuntime]);

  const decide = useCallback(async (id: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<boolean> => {
    if (!enabled || inFlightRef.current.has(id) || decidedRef.current.has(id)) return false;
    if (decision === "REJECTED" && (typeof note !== "string" || note.trim() === "")) return false;
    inFlightRef.current.add(id);
    patchRuntime(id, { busy: true, error: null, info: null });
    try {
      try {
        if (decision === "APPROVED") await financeApi.approveExpenseRequest(id);
        else await financeApi.rejectExpenseRequest(id, (note as string).trim());
      } catch (err) {
        const failure = classifyDistributionDecisionFailure(err, toActionError(err, DISTRIBUTION_DECISION_FALLBACK));
        if (failure.reread) {
          const ok = await refreshEntry(id);
          patchRuntime(id, {
            error: ok ? `${failure.message} Güncel durum yeniden okundu.` : `${failure.message} Güncel durum okunamadı.`,
            stale: !ok,
          });
        } else {
          patchRuntime(id, { error: failure.message });
        }
        return false;
      }
      decidedRef.current.add(id);
      const ok = await refreshEntry(id);
      patchRuntime(id, { decided: decision, refreshFailed: !ok, stale: false, error: null });
      return true;
    } finally {
      inFlightRef.current.delete(id);
      patchRuntime(id, { busy: false });
    }
  }, [enabled, refreshEntry, patchRuntime]);

  const stateOf = useCallback((id: string) => entries[id]?.state, [entries]);
  const runtimeOf = useCallback((id: string) => runtime[id] ?? IDLE_RUNTIME, [runtime]);

  return { enabled, loadStatus, stateOf, runtimeOf, reload, refreshOne, decide };
}

type Mode = "IDLE" | "CONFIRM_APPROVE" | "REJECT";

export function ExpenseDistributionDecisionRow({
  expenseId,
  decisions,
}: {
  expenseId: string;
  decisions: ExpenseDistributionDecisions;
}) {
  const [mode, setMode] = useState<Mode>("IDLE");
  const [note, setNote] = useState("");
  const state = decisions.stateOf(expenseId);
  const rt = decisions.runtimeOf(expenseId);
  const noteReady = note.trim() !== "";
  const offer = canOfferDistributionDecision(state) && rt.decided === null && !rt.stale;

  const submitApprove = async () => {
    const recorded = await decisions.decide(expenseId, "APPROVED");
    if (recorded) setMode("IDLE");
  };
  const submitReject = async () => {
    if (!noteReady) return;
    const recorded = await decisions.decide(expenseId, "REJECTED", note);
    if (recorded) {
      setMode("IDLE");
      setNote("");
    }
  };

  let statusText: string;
  if (rt.decided !== null && rt.refreshFailed) {
    statusText = `${DISTRIBUTION_STATUS_LABEL[rt.decided]} (karar kaydedildi; görünüm yenilenemedi)`;
  } else if (rt.stale) {
    statusText = "Güncel durum okunamadı";
  } else if (state === undefined) {
    statusText = decisions.loadStatus === "ERROR" ? "Durum okunamadı" : "Durum okunuyor…";
  } else if (state.kind === "UNKNOWN") {
    statusText = "Durum bilinmiyor; karar sunulmaz";
  } else if (state.cancelled) {
    statusText = `${DISTRIBUTION_STATUS_LABEL[state.approvalStatus]} · talep iptal edildi, karar verilemez`;
  } else {
    statusText = DISTRIBUTION_STATUS_LABEL[state.approvalStatus];
  }

  const needsReadRetry = rt.refreshFailed || rt.stale || (state === undefined && decisions.loadStatus === "ERROR");

  return (
    <div
      role="group"
      aria-label="Dağıtım uygunluğu kararı"
      data-testid={`expense-distribution-${expenseId}`}
      className="mt-2 pt-2 border-t border-slate-100 text-xs"
    >
      <p className="text-slate-600">
        <span className="font-medium">Dağıtım uygunluğu:</span>{" "}
        <span data-testid={`expense-distribution-status-${expenseId}`}>{statusText}</span>
      </p>

      {rt.decided !== null && rt.refreshFailed && (
        <p role="status" className="mt-1 text-amber-700">
          Karar kaydedildi; görünüm yenilenemedi. Bu talep için yeniden karar gönderilmez.
        </p>
      )}
      {rt.error && (
        <p role="alert" className="mt-1 text-red-700">
          {rt.error}
        </p>
      )}
      {rt.info && !rt.error && (
        <p role="status" className="mt-1 text-slate-500">
          {rt.info}
        </p>
      )}

      {needsReadRetry && (
        <button
          type="button"
          onClick={() => void (state === undefined && !rt.refreshFailed && !rt.stale ? decisions.reload() : decisions.refreshOne(expenseId))}
          disabled={rt.busy}
          className="mt-1 rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Görünümü yenile
        </button>
      )}

      {offer && mode === "IDLE" && (
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("CONFIRM_APPROVE")}
            disabled={rt.busy}
            className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Onayla
          </button>
          <button
            type="button"
            onClick={() => setMode("REJECT")}
            disabled={rt.busy}
            className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reddet
          </button>
        </div>
      )}

      {offer && mode === "CONFIRM_APPROVE" && (
        <div className="mt-1 rounded border border-emerald-200 bg-emerald-50/50 p-2">
          <p className="text-slate-700">{DISTRIBUTION_APPROVE_EXPLANATION}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void submitApprove()}
              disabled={rt.busy}
              className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {rt.busy ? "Kaydediliyor…" : "Onayı kaydet"}
            </button>
            <button
              type="button"
              onClick={() => setMode("IDLE")}
              disabled={rt.busy}
              className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {offer && mode === "REJECT" && (
        <div className="mt-1 rounded border border-red-200 bg-red-50/40 p-2">
          <p className="text-slate-700">{DISTRIBUTION_REJECT_EXPLANATION}</p>
          <label className="mt-2 block text-slate-700" htmlFor={`expense-distribution-note-${expenseId}`}>
            Ret gerekçesi (zorunlu)
          </label>
          <textarea
            id={`expense-distribution-note-${expenseId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={rt.busy}
            rows={2}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          {!noteReady && <p className="mt-1 text-slate-500">Gerekçe boş ya da yalnız boşluk olamaz.</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void submitReject()}
              disabled={rt.busy || !noteReady}
              className="rounded bg-red-600 px-2 py-0.5 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {rt.busy ? "Kaydediliyor…" : "Reddi kaydet"}
            </button>
            <button
              type="button"
              onClick={() => setMode("IDLE")}
              disabled={rt.busy}
              className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
