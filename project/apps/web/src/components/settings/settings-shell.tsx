"use client";

import { ReactNode } from "react";

// A-1: Settings Shell — layout-only primitifler (master-detail kabuğu).
// Hiçbir iş mantığı taşımaz; yalnız yerleşim + iç scroll disiplini.
// Genel page scroll YOK: scroll yalnız nav / detail-body / table-body içinde.

type IconType = React.ElementType;

export interface SettingsNavItem {
  key: string;
  label: string;
  icon?: IconType;
  badge?: number;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export function SettingsShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-[264px_minmax(0,1fr)] gap-3 overflow-hidden">
      <aside className="min-h-0 overflow-hidden rounded-lg border bg-white flex flex-col">{nav}</aside>
      <section className="min-h-0 overflow-hidden flex flex-col">{children}</section>
    </div>
  );
}

export function SettingsNav({
  groups,
  active,
  onSelect,
}: {
  groups: SettingsNavGroup[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="min-h-0 overflow-auto p-2 space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold tracking-wide text-slate-400">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.key === active;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] border-l-[3px] transition-colors ${
                    isActive
                      ? "bg-blue-50 border-blue-600 text-blue-700 font-semibold"
                      : "border-transparent text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {Icon && <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-gray-500"}`} />}
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-1.5">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function SettingsSectionHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex-none flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-gray-50">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

export function SettingsDetailBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-auto">{children}</div>;
}

export function SettingsScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`min-h-0 overflow-auto ${className ?? ""}`}>{children}</div>;
}

// A-3a: sağdan açılan işlem paneli (drawer). Dashboard üstünde overlay; içerik = ilgili bölüm.
export function SettingsDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[680px] max-w-[94vw] bg-white shadow-2xl flex flex-col">
        <div className="flex-none flex items-center gap-3 px-4 py-2.5 border-b bg-gray-50">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none" aria-label="Kapat">×</button>
          <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

// A-2: Workbench detail primitifleri.
// Section = "form kartı" değil, "belge bölümü": başlık + ince ayraç + content-width satırlar.
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-3 border-b border-gray-100 pb-1.5">
        <h3 className="text-[10.5px] font-semibold tracking-wide text-slate-600">{title}</h3>
        {description && <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

// Aktif detayın üstünde sticky kalan kontrol çubuğu (global header değil).
export function WorkbenchHeader({
  title,
  description,
  dirty,
  saving,
  onSave,
  onReset,
  status,
}: {
  title: string;
  description?: string;
  dirty?: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset?: () => void;
  status?: { ok: boolean; msg: string } | null;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-800 leading-tight truncate">{title}</h2>
        {description && <p className="text-[11px] text-gray-500 truncate">{description}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {status && (
          <span className={`text-[11px] inline-flex items-center gap-1 whitespace-nowrap ${status.ok ? "text-green-600" : "text-red-600"}`}>
            {status.ok ? "Kaydedildi" : `Hata: ${status.msg}`}
          </span>
        )}
        {dirty && <span className="text-[11px] text-amber-700 whitespace-nowrap">Kaydedilmemiş değişiklikler</span>}
        {onReset && (
          <button
            onClick={onReset}
            disabled={!dirty || saving}
            className="text-[12px] px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
          >
            Vazgeç
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className="text-[12px] px-3.5 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? "..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
