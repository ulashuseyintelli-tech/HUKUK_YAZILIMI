"use client";

// O-5b (owner 05.11.2026, A politikası): personel kişi kartında "Giriş hesabı kapalı" bloğu. Yalnız ADMIN görür ve yalnız
// kart etkin + bağlı hesap kapalı + parolası var (sunucu incelemesi "açılabilir") olduğunda görünür; aksi halde hiçbir şey
// göstermez (davet / bağlama kartları kendi durumlarını gösterir). Onay diyaloğu ayrıdır; bu blok yalnız inceleme okur.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { readStaffAccountReopenReview } from "@/lib/staff-account-reopen";
import { StaffAccountReopenDialog } from "./staff-account-reopen-dialog";

export function StaffAccountReopenCard({
  staffId,
  personUserId,
  staffName,
  formDirty,
  onChanged,
}: {
  staffId: string;
  personUserId: string | null;
  staffName: string;
  formDirty: boolean;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [reopenable, setReopenable] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin || !personUserId) {
      setReopenable(false);
      return;
    }
    try {
      const review = readStaffAccountReopenReview(await api.get(`/staff/${staffId}/account-reopen-review`));
      setReopenable(review?.reopenable === true);
    } catch {
      setReopenable(false); // okunamayan inceleme ile düğme gösterilmez
    }
  }, [isAdmin, personUserId, staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin || !personUserId || !reopenable) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="staff-account-reopen-card">
      <div className="text-sm font-semibold text-amber-900">Giriş hesabı kapalı</div>
      <p className="text-[11px] text-amber-800 mt-0.5">
        Personel kartı etkin ama bağlı giriş hesabı kapalı; personel giriş yapamaz. Hesabı açmadan önce rolü, oturum etkisini ve
        büro geneli görünüm izinlerini gözden geçirin.
      </p>
      {formDirty && <p className="mt-1 text-[11px] text-amber-700">Önce formu kaydedin.</p>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={formDirty}
        className="mt-2 px-3 py-1.5 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-50"
      >
        Giriş erişimini gözden geçir
      </button>
      {open && (
        <StaffAccountReopenDialog
          staffId={staffId}
          staffName={staffName}
          onClose={() => {
            setOpen(false);
            void load();
          }}
          onDone={onChanged}
        />
      )}
    </div>
  );
}
