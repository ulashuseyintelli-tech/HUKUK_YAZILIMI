"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, IntakeReviewPermissionState, IntakeReviewPermissionSubject } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toActionErrorMessage } from "@/lib/action-error";

export default function IntakeReviewPermissionsPage() {
  const { user, loading } = useAuth();
  const admin = user?.role === "ADMIN";
  const actorKey = user ? `${user.tenantId}:${user.id}` : "";
  const currentActor = useRef(actorKey);
  currentActor.current = actorKey;
  const [dataActor, setDataActor] = useState(actorKey);
  const [subjects, setSubjects] = useState<IntakeReviewPermissionSubject[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [state, setState] = useState<IntakeReviewPermissionState | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");

  const loadSubjects = useCallback(async (next?: string) => {
    const requestedActor = actorKey;
    setListBusy(true);
    setError("");
    try {
      const page = await api.listIntakeReviewPermissionSubjects(next);
      if (currentActor.current !== requestedActor) return;
      setSubjects(previous => next ? [...previous, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (e) {
      if (currentActor.current === requestedActor) setError(toActionErrorMessage(e, "Kişi listesi yüklenemedi."));
    } finally {
      if (currentActor.current === requestedActor) setListBusy(false);
    }
  }, [actorKey]);

  useEffect(() => {
    setSubjects([]); setCursor(null); setSubjectId(""); setState(null);
    setError(""); setMessage(""); setBusy(false); setStateBusy(false); setDataActor(actorKey);
    if (admin) void loadSubjects();
  }, [admin, actorKey, loadSubjects]);
  useEffect(() => {
    setState(null);
    setError("");
    setMessage("");
    setStateBusy(false);
    if (!admin || !subjectId) return;
    let current = true;
    setStateBusy(true);
    api.getIntakeReviewPermission(subjectId).then(value => {
      if (current) setState(value);
    }).catch(e => {
      if (current) setError(toActionErrorMessage(e, "İzin durumu yüklenemedi."));
    }).finally(() => { if (current) setStateBusy(false); });
    return () => { current = false; };
  }, [admin, actorKey, subjectId]);

  const changePermission = async (command: "grant" | "revoke") => {
    if (!state || state.subject.id !== subjectId || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    let written = false;
    const requestedActor = actorKey;
    try {
      if (command === "grant") {
        await api.grantIntakeReviewPermission(subjectId, {
          validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
          reason: reason || undefined,
        });
      } else {
        await api.revokeIntakeReviewPermission(subjectId, reason || undefined);
      }
      written = true;
      if (currentActor.current !== requestedActor) return;
      setState(await api.getIntakeReviewPermission(subjectId));
      setMessage(command === "grant" ? "ALLOW kaydı oluşturuldu; güncel yetki durumu aşağıdadır." : "Bitmemiş ALLOW kayıtları sona erdirildi; güncel durum aşağıdadır.");
    } catch (e) {
      if (currentActor.current !== requestedActor) return;
      if (written) setState(null);
      setError(written ? "İşlem kaydedildi; güncel izin durumu okunamadı. Durumu yeniden yükleyin." : toActionErrorMessage(e, "İzin işlemi başarısız."));
    } finally {
      if (currentActor.current === requestedActor) setBusy(false);
    }
  };

  if (loading) return <p>Yükleniyor…</p>;
  if (!admin) return <p role="alert">İnceleme izinlerini yalnız ADMIN yönetebilir.</p>;
  if (dataActor !== actorKey) return <p>Yükleniyor…</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href="/client-intake" className="text-sm text-blue-600 underline">← Bilgi formlarına dön</Link>
      <h1 className="text-xl font-semibold">Intake inceleme izinleri</h1>
      <p className="text-sm text-slate-600">
        Yalnız client.intake.review izni yönetilir. Kapsam GLOBAL’dir: mevcut inceleme yetki anahtarının tenant içindeki kapsamıdır;
        dosya erişimi veya kanoniğe aktarım yetkisi vermez. Etkin DENY önceliklidir; VIEWER yazamaz.
      </p>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {message && <p role="status">{message}</p>}
      <label className="block text-sm">Kişi
        <select aria-label="Kişi" value={subjectId} disabled={busy} onChange={e => setSubjectId(e.target.value)} className="block w-full border rounded p-2">
          <option value="">Kişi seçin</option>
          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.displayName}{!subject.isActive ? " (pasif)" : ""}</option>)}
        </select>
      </label>
      <button type="button" disabled={listBusy || busy} onClick={() => loadSubjects(cursor ?? undefined)} className="text-sm text-blue-600 underline">
        {listBusy ? "Yükleniyor…" : cursor ? "Diğer kişileri yükle" : "Kişi listesini yenile"}
      </button>
      {stateBusy && <p>İzin durumu yükleniyor…</p>}
      {subjectId && !state && !stateBusy && <button type="button" onClick={async () => {
        setStateBusy(true); setError("");
        try { setState(await api.getIntakeReviewPermission(subjectId)); }
        catch (e) { setError(toActionErrorMessage(e, "İzin durumu yüklenemedi.")); }
        finally { setStateBusy(false); }
      }} className="text-sm underline">İzin durumunu yeniden yükle</button>}
      {state && state.subject.id === subjectId && (
        <section className="border rounded p-4 space-y-3" aria-label="İzin durumu">
          <p>Etkin kayıt: <strong>{state.effectiveEffect}</strong> · İnceleme işlemi: <strong>{state.canReview ? "Yetkili" : "Yetkisiz"}</strong></p>
          <p className="text-sm">Bitmemiş ALLOW: {state.revocableAllowCount} · İleri başlangıçlı ALLOW: {state.scheduledAllowCount}</p>
          {state.effectiveEffect === "DENY" && <p>DENY devam ediyor; yeni ALLOW bunu geçersiz kılmaz. Bu ekranda DENY değiştirilemez.</p>}
          {!state.subject.canReceiveGrant && <p>Hesap/aktif profil/rol uygun değil; yeni izin verilemez. Mevcut ALLOW kayıtları geri alınabilir.</p>}
          <label className="block text-sm">Başlangıç (boşsa şimdi)
            <input aria-label="Başlangıç" type="datetime-local" value={validFrom} disabled={busy} onChange={e => setValidFrom(e.target.value)} className="block border rounded p-2" />
          </label>
          <label className="block text-sm">Bitiş (boşsa süresiz)
            <input aria-label="Bitiş" type="datetime-local" value={validUntil} disabled={busy} onChange={e => setValidUntil(e.target.value)} className="block border rounded p-2" />
          </label>
          <label className="block text-sm">Gerekçe
            <textarea aria-label="Gerekçe" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} className="block w-full border rounded p-2" />
          </label>
          <div className="flex gap-3">
            <button type="button" disabled={busy || !state.subject.canReceiveGrant} onClick={() => changePermission("grant")} className="rounded border px-3 py-2 disabled:opacity-50">İnceleme izni ver</button>
            <button type="button" disabled={busy || state.revocableAllowCount === 0} onClick={() => changePermission("revoke")} className="rounded border px-3 py-2 disabled:opacity-50">ALLOW izinlerini geri al</button>
          </div>
        </section>
      )}
    </div>
  );
}
