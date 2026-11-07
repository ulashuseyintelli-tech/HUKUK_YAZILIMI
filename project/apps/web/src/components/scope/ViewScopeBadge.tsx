"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * F02-B görünürlük (owner ek talimatı 30.10.2026, madde 4): masraf / görev ekranlarında UYGULANAN liste kapsamını yazar.
 * Kaynak: GET /office/view-scope — sunucu, liste servisleriyle AYNI bayrak + izin çözümünü döner; rozet hiçbir şeyi
 * hesaplamaz, yalnız sunucunun uyguladığını yazar. Yanıt yoksa / bozuksa kapsam UYDURMAZ ("alınamadı").
 * Bu izinler müvekkil okuma ya da dosyaya bağlama yetkisi ÜRETMEZ; rozet yalnız görev/masraf liste kapsamını anlatır.
 * F02 P3-D1 (owner 07.11.2026): `cases` alanı dosya listesi + detayı kapsamını anlatır (office.cases.view_all). Alan yanıtta
 * yoksa yalnız dosya rozeti "alınamadı" yazar; görev / masraf rozetleri etkilenmez.
 */
export type ViewScopeArea = "tasks" | "expenses" | "cases";
export type ViewScopeMode = "OFF" | "TENANT" | "BOUND";
interface AreaView {
  flagEnabled: boolean;
  resolution: "ALLOW" | "DENY" | "NONE";
  mode: ViewScopeMode;
}
interface ViewScopeState {
  expenses: AreaView;
  tasks: AreaView;
  cases?: AreaView;
}

export const VIEW_SCOPE_TEXT: Record<ViewScopeArea, Record<ViewScopeMode, string>> = {
  tasks: {
    OFF: "Kapsam: büro geneli (görünüm kapsamı sınırı etkin değil)",
    TENANT: "Kapsam: büro geneli (büro geneli görünüm izni)",
    BOUND: "Kapsam: yalnız size atanan, sizin oluşturduğunuz veya dosya bağınız olan görevler",
  },
  expenses: {
    OFF: "Kapsam: büro geneli (görünüm kapsamı sınırı etkin değil)",
    TENANT: "Kapsam: büro geneli (büro geneli görünüm izni)",
    BOUND: "Kapsam: yalnız dosya bağınız olan, sizin oluşturduğunuz veya onayladığınız masraf talepleri",
  },
  cases: {
    OFF: "Kapsam: büro geneli (görünüm kapsamı sınırı etkin değil)",
    TENANT: "Kapsam: büro geneli (büro geneli görünüm izni)",
    BOUND: "Kapsam: yalnız Dosya Sorumlusu olduğunuz, sizin oluşturduğunuz veya görevli olduğunuz dosyalar",
  },
};
export const VIEW_SCOPE_UNAVAILABLE = "Kapsam bilgisi alınamadı";

const MODES: readonly string[] = ["OFF", "TENANT", "BOUND"];

const isArea = (a: unknown): a is AreaView =>
  !!a && typeof a === "object" && MODES.includes(String((a as AreaView).mode));

function parseViewScope(raw: unknown): ViewScopeState | null {
  const r = raw as Partial<ViewScopeState> | null | undefined;
  return r && isArea(r.expenses) && isArea(r.tasks) ? (r as ViewScopeState) : null;
}

export function ViewScopeBadge({ area, className = "" }: { area: ViewScopeArea; className?: string }) {
  const [state, setState] = useState<ViewScopeState | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/office/view-scope");
        const parsed = parseViewScope((res as { data?: unknown })?.data);
        if (!cancelled) setState(parsed ?? "error");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) return null; // yükleniyor: yanlış kapsam yazmamak için boş
  const view = state === "error" ? null : state[area];
  if (!isArea(view)) {
    // Yanıt yok / bozuk ya da bu alan (ör. eski sunucuda `cases`) yanıtta yok → kapsam UYDURULMAZ.
    return (
      <span data-testid="view-scope-badge" data-scope-mode="UNAVAILABLE" className={`text-xs text-muted-foreground ${className}`}>
        {VIEW_SCOPE_UNAVAILABLE}
      </span>
    );
  }
  const tone = view.mode === "BOUND" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span
      data-testid="view-scope-badge"
      data-scope-mode={view.mode}
      title={`Görünüm kapsamı bayrağı: ${view.flagEnabled ? "açık" : "kapalı"} · büro geneli izni: ${view.resolution}`}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${tone} ${className}`}
    >
      {VIEW_SCOPE_TEXT[area][view.mode]}
    </span>
  );
}
