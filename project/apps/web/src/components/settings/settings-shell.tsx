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
    <div className="flex-1 min-h-0 grid grid-cols-[210px_minmax(0,1fr)] gap-3 overflow-hidden">
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
          <p className="px-2 pb-1 text-[11px] font-medium text-gray-400">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.key === active;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] border-l-2 transition-colors ${
                    isActive
                      ? "bg-blue-50 border-blue-600 text-blue-700 font-medium"
                      : "border-transparent text-gray-700 hover:bg-gray-50"
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
