"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Network, RefreshCw, Trash2, ArrowUpCircle } from "lucide-react";

/**
 * ReportingLine Population Core yönetim yüzeyi (CAP-02 object-scope enablement).
 * Yalnız tenant ADMIN. Backend AdminGuard birincil kapı; 403'te yetki-yok paneli.
 * Bu yüzey object-scope FİLTRELEME aktive ETMEZ; yalnız manager–personel
 * raporlama ilişkilerini yönetir.
 */

interface Eligible {
  userId: string;
  name: string;
  email: string;
  profileType: string | null;
}

interface Relationship {
  id: string;
  actorUserId: string;
  managerUserId: string | null;
  disposition: "MANAGED" | "TOP_LEVEL";
  validFrom: string;
}

export default function ReportingLinesPage() {
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [recon, setRecon] = useState<Record<string, number> | null>(null);
  const [actorUserId, setActorUserId] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rel, elig, rec] = await Promise.all([
        api.get<{ relationships: Relationship[] }>("/reporting-lines"),
        api.get<{ eligible: Eligible[] }>("/reporting-lines/eligible"),
        api.get<Record<string, number>>("/reporting-lines/reconciliation"),
      ]);
      setRelationships(rel.data?.relationships || []);
      setEligible(elig.data?.eligible || []);
      setRecon(rec.data || null);
      setForbidden(false);
    } catch (e: any) {
      if (e?.status === 403) {
        setForbidden(true);
      } else {
        setError(e?.body?.message || "Yükleme başarısız");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = (userId: string) =>
    eligible.find((u) => u.userId === userId)?.name || userId;

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e?.body?.message || "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  const assign = () => {
    if (!actorUserId || !managerUserId) return;
    run(() => api.post("/reporting-lines/assign", { actorUserId, managerUserId }));
  };
  const end = (uid: string) =>
    run(() => api.post("/reporting-lines/end", { actorUserId: uid }));
  const topLevel = (uid: string) =>
    run(() => api.post("/reporting-lines/top-level", { actorUserId: uid }));

  if (forbidden) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Raporlama Hiyerarşisi</h1>
        <div className="p-6 bg-white rounded-lg border text-center text-gray-600">
          Bu sayfayı görüntüleme yetkiniz yok.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Network className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Raporlama Hiyerarşisi</h1>
            <p className="text-xs text-muted-foreground">
              Manager–personel raporlama ilişkileri (yalnız ADMIN)
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading || saving}
          className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg"
        >
          <RefreshCw className="h-4 w-4" /> Yenile
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {recon && (
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <ReconCard label="Managed" value={recon.managedActors} />
          <ReconCard label="Top-level (açık)" value={recon.explicitTopLevelActors} />
          <ReconCard label="Unclassified" value={recon.unclassifiedActors} />
          <ReconCard
            label="Sınıflandırılamayan atanan"
            value={recon.unclassifiableTaskAssignees}
            warn
          />
          <ReconCard label="Döngü" value={recon.cycles} warn />
          <ReconCard
            label="Mükerrer aktif"
            value={recon.duplicateActiveDispositions}
            warn
          />
          <ReconCard label="Self-manager" value={recon.selfManagerRelationships} warn />
          <ReconCard
            label="Geçersiz MANAGED (amirsiz)"
            value={recon.invalidManagedWithoutManager}
            warn
          />
          <ReconCard
            label="Geçersiz TOP_LEVEL (amirli)"
            value={recon.invalidTopLevelWithManager}
            warn
          />
          <ReconCard
            label="Geçersiz tarih aralığı"
            value={recon.invalidDateRangeRelationships}
            warn
          />
        </div>
      )}

      <div className="mb-4 p-4 bg-white rounded-lg border">
        <div className="text-sm font-semibold mb-2">Amir Ata / Değiştir</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Personel seç…</option>
            {eligible.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name} ({u.profileType})
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">→ amir</span>
          <select
            value={managerUserId}
            onChange={(e) => setManagerUserId(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Amir seç…</option>
            {eligible.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name} ({u.profileType})
              </option>
            ))}
          </select>
          <button
            onClick={assign}
            disabled={saving || !actorUserId || !managerUserId}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50"
          >
            Ata
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">Personel</th>
              <th className="px-4 py-2">Durum</th>
              <th className="px-4 py-2">Amir</th>
              <th className="px-4 py-2 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {relationships.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{nameOf(r.actorUserId)}</td>
                <td className="px-4 py-2">
                  {r.disposition === "TOP_LEVEL" ? (
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">
                      Top-level
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
                      Managed
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.managerUserId ? nameOf(r.managerUserId) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => topLevel(r.actorUserId)}
                    disabled={saving}
                    title="Top-level işaretle"
                    className="inline-flex items-center gap-1 px-2 py-1 mr-2 text-xs border rounded"
                  >
                    <ArrowUpCircle className="h-3 w-3" /> Top-level
                  </button>
                  <button
                    onClick={() => end(r.actorUserId)}
                    disabled={saving}
                    title="İlişkiyi bitir"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded text-red-600"
                  >
                    <Trash2 className="h-3 w-3" /> Bitir
                  </button>
                </td>
              </tr>
            ))}
            {relationships.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Aktif raporlama ilişkisi yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReconCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: number | undefined;
  warn?: boolean;
}) {
  const v = value ?? 0;
  return (
    <div
      className={`p-3 rounded-lg border ${
        warn && v > 0 ? "bg-amber-50 border-amber-200" : "bg-white"
      }`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold">{v}</div>
    </div>
  );
}
