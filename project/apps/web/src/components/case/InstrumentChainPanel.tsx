"use client";

/**
 * A1 Faz 2b-B — Manuel kambiyo zinciri-kurucu + müracaat (recourse) önizleme paneli.
 * Avukat zinciri (keşideci/lehtar/ciranta/avalist · SIRA · kaynak · güven · onay) kurar →
 * "Müracaat önizle" 2a motorunu (POST /case-instruments/chain/analyze, #384) çağırır →
 * HAMİL + ADAY müracaat borçluları gösterilir. Sıra eksik/belirsiz → NEEDS_REVIEW (borçlu üretilmez).
 *
 * SALT ADAY: CaseDebtor YARATMAZ; otomatik borçlu yok. "Kaydet" yalnız mevcut PUT ile zinciri
 * (endorsers/avals JSON) kalıcılaştırır (yeni yazma-yolu yok). collapsible + lazy (ClaimItemPanel deseni).
 *
 * Çağrıldığı yerler:
 * - InstrumentForm (case detay → Çek/Senet sekmesi; FEATURE_FLAGS.A1_INSTRUMENT_CHAIN ile gate)
 * - instrument-chain-panel.test.tsx (vitest)
 */
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  GitBranch,
  Loader2,
  Save,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { api, CaseInstrument } from "@/lib/api";
import {
  AvalRow,
  ChainAnalysis,
  ChainNodeRow,
  ChainSource,
  InstrumentPartyRole,
  InstrumentPartyType,
  ROLE_OPTIONS,
  ROLE_LABELS,
  PARTY_TYPE_OPTIONS,
  PARTY_TYPE_LABELS,
  emptyNodeRow,
  instrumentToRows,
  rowsToChain,
  chainToEndorsersJson,
} from "@/lib/instrument-chain";

interface Props {
  instrument: CaseInstrument;
  onSaved?: () => void;
}

const SOURCE_OPTIONS: ChainSource[] = ["MANUAL", "OCR"];

export function InstrumentChainPanel({ instrument, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [rows, setRows] = useState<ChainNodeRow[]>([]);
  const [avalRows, setAvalRows] = useState<AvalRow[]>([]);
  const [analysis, setAnalysis] = useState<ChainAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleToggle = () => {
    if (!open && !initialized) {
      // lazy: panel ilk açılışta kalıcı endorsers/avals JSON'dan satırları doldur (Faz 1a OCR ile aynı şekil)
      const seed = instrumentToRows(instrument.endorsers, instrument.avals);
      setRows(seed.rows);
      setAvalRows(seed.avalRows);
      setInitialized(true);
    }
    setOpen((o) => !o);
  };

  const updateRow = (i: number, patch: Partial<ChainNodeRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyNodeRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const updateAval = (i: number, patch: Partial<AvalRow>) =>
    setAvalRows((as) => as.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const addAval = () => setAvalRows((as) => [...as, { avalistPosition: 0, guaranteesPosition: 0 }]);
  const removeAval = (i: number) => setAvalRows((as) => as.filter((_, idx) => idx !== i));

  const handlePreview = async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await api.analyzeInstrumentChain(rowsToChain(rows, avalRows));
      setAnalysis(result);
    } catch (e: any) {
      setError(e?.message || "Müracaat önizleme başarısız");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const chain = rowsToChain(rows, avalRows);
      // Kalıcılık = mevcut PUT (endorsers/avals JSON). Yeni yazma-yolu/endpoint YOK.
      await api.updateInstrument(instrument.id, {
        endorsers: chainToEndorsersJson(chain) as any,
        avals: chain.avals as any,
      });
      setSaved(true);
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || "Zincir kaydı başarısız");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg" data-testid="instrument-chain-panel">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
        data-testid="chain-toggle"
      >
        <span className="flex items-center gap-2 font-medium text-gray-700">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <GitBranch className="h-4 w-4" />
          Kambiyo zinciri &amp; müracaat
        </span>
        <span className="text-xs text-gray-400">{instrument.serialNo}</span>
      </button>

      {open && (
        <div className="border-t p-3 space-y-4">
          {/* ── Zincir düğümleri ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-medium text-gray-500">
                Zincir düğümleri (sıra boş = bilinmiyor)
              </h5>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
                data-testid="add-node"
              >
                <Plus className="h-3 w-3" /> Düğüm ekle
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                Henüz düğüm yok. Zinciri kurmak için &quot;Düğüm ekle&quot;.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left font-medium px-1 py-1">Rol</th>
                      <th className="text-left font-medium px-1 py-1">Ad</th>
                      <th className="text-left font-medium px-1 py-1">TC/VKN</th>
                      <th className="text-left font-medium px-1 py-1">Tür</th>
                      <th className="text-left font-medium px-1 py-1">Sıra</th>
                      <th className="text-left font-medium px-1 py-1">Kaynak</th>
                      <th className="text-left font-medium px-1 py-1">Güven</th>
                      <th className="text-center font-medium px-1 py-1">Onay</th>
                      <th className="px-1 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} data-testid="node-row">
                        <td className="px-1 py-1">
                          <select
                            value={row.role}
                            onChange={(e) => updateRow(i, { role: e.target.value as InstrumentPartyRole })}
                            className="border rounded px-1 py-1 w-24"
                            aria-label="Rol"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateRow(i, { name: e.target.value })}
                            className="border rounded px-1 py-1 w-32"
                            aria-label="Ad"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={row.identityNo}
                            onChange={(e) => updateRow(i, { identityNo: e.target.value })}
                            className="border rounded px-1 py-1 w-28"
                            aria-label="Kimlik No"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={row.partyType}
                            onChange={(e) => updateRow(i, { partyType: e.target.value as InstrumentPartyType })}
                            className="border rounded px-1 py-1 w-20"
                            aria-label="Tür"
                          >
                            {PARTY_TYPE_OPTIONS.map((t) => (
                              <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            value={row.position ?? ""}
                            onChange={(e) =>
                              updateRow(i, { position: e.target.value === "" ? null : Number(e.target.value) })
                            }
                            className="border rounded px-1 py-1 w-14"
                            placeholder="—"
                            aria-label="Sıra"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={row.source}
                            onChange={(e) => updateRow(i, { source: e.target.value as ChainSource })}
                            className="border rounded px-1 py-1 w-20"
                            aria-label="Kaynak"
                          >
                            {SOURCE_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.1}
                            value={row.confidence}
                            onChange={(e) => updateRow(i, { confidence: Number(e.target.value) })}
                            className="border rounded px-1 py-1 w-14"
                            aria-label="Güven"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={row.verified}
                            onChange={(e) => updateRow(i, { verified: e.target.checked })}
                            aria-label="Onay"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                            title="Düğümü sil"
                            aria-label="Düğümü sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Aval kenarları ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-medium text-gray-500">
                Aval kenarları (avalist sırası → garanti edilen sıra)
              </h5>
              <button
                type="button"
                onClick={addAval}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
                data-testid="add-aval"
              >
                <Plus className="h-3 w-3" /> Aval ekle
              </button>
            </div>
            {avalRows.length > 0 && (
              <div className="space-y-1">
                {avalRows.map((aval, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" data-testid="aval-row">
                    <span className="text-gray-500">Avalist sıra</span>
                    <input
                      type="number"
                      value={aval.avalistPosition}
                      onChange={(e) => updateAval(i, { avalistPosition: Number(e.target.value) })}
                      className="border rounded px-1 py-1 w-14"
                      aria-label="Avalist sıra"
                    />
                    <span className="text-gray-500">→ garanti edilen sıra</span>
                    <input
                      type="number"
                      value={aval.guaranteesPosition}
                      onChange={(e) => updateAval(i, { guaranteesPosition: Number(e.target.value) })}
                      className="border rounded px-1 py-1 w-14"
                      aria-label="Garanti edilen sıra"
                    />
                    <button
                      type="button"
                      onClick={() => removeAval(i)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="Aval sil"
                      aria-label="Aval sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Aksiyonlar ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handlePreview}
              disabled={analyzing || rows.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              data-testid="preview-recourse"
            >
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
              Müracaat önizle
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
              data-testid="save-chain"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Zinciri kaydet
            </button>
            {saved && <span className="text-xs text-green-600">Kaydedildi.</span>}
          </div>

          {error && (
            <div className="text-xs text-red-600" data-testid="chain-error">{error}</div>
          )}

          {/* ── Sonuç: hamil + ADAY müracaat ─────────────────────────────── */}
          {analysis && (
            <div className="space-y-2 border-t pt-3" data-testid="chain-analysis">
              <div className="text-sm">
                <span className="font-medium">Hamil: </span>
                {analysis.holder.status === "RESOLVED" ? (
                  <span data-testid="holder-name">{analysis.holder.holderNode?.party.name}</span>
                ) : (
                  <span className="text-amber-700">belirlenemedi</span>
                )}
              </div>

              {analysis.recourse.status === "RESOLVED" ? (
                <div className="border rounded-lg p-3 bg-blue-50/60" data-testid="recourse-resolved">
                  <p className="text-xs font-medium text-blue-800 mb-2 flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5" />
                    ADAY müracaat borçluları — avukat onayı gerekir (otomatik borçlu oluşturulmaz)
                  </p>
                  <ul className="space-y-1" data-testid="recourse-list">
                    {analysis.recourse.parties.map((p, i) => (
                      <li key={i} className="text-sm flex items-center justify-between">
                        <span>
                          {p.name}{" "}
                          <span className="text-xs text-gray-500">
                            ({ROLE_LABELS[p.role]} · {p.basis})
                          </span>
                        </span>
                        <span className="text-xs text-gray-400">sıra {p.position ?? "—"}</span>
                      </li>
                    ))}
                    {analysis.recourse.parties.length === 0 && (
                      <li className="text-sm text-gray-500">Aday yok.</li>
                    )}
                  </ul>
                </div>
              ) : (
                <div
                  className="border rounded-lg p-3 bg-amber-50 text-amber-800 text-sm flex items-start gap-2"
                  data-testid="recourse-needs-review"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Müracaat hesaplanamadı (sıra eksik/belirsiz) — borçlu üretilmedi.{" "}
                    {analysis.recourse.reason}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
