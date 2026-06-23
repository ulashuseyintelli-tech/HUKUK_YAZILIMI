"use client";

import { X } from "lucide-react";

interface QuickFilterChipProps {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
  onRemove?: () => void;
  color?: "default" | "warning" | "danger" | "success" | "info" | "purple";
  title?: string; // opsiyonel tooltip (hover açıklaması)
}

const colorClasses = {
  default: {
    active: "bg-primary text-white border-primary",
    inactive: "bg-white text-foreground border-gray-200 hover:border-primary/50 hover:bg-primary/5",
  },
  warning: {
    active: "bg-yellow-500 text-white border-yellow-500",
    inactive: "bg-white text-yellow-700 border-yellow-200 hover:border-yellow-400 hover:bg-yellow-50",
  },
  danger: {
    active: "bg-red-500 text-white border-red-500",
    inactive: "bg-white text-red-700 border-red-200 hover:border-red-400 hover:bg-red-50",
  },
  success: {
    active: "bg-green-500 text-white border-green-500",
    inactive: "bg-white text-green-700 border-green-200 hover:border-green-400 hover:bg-green-50",
  },
  info: {
    active: "bg-blue-500 text-white border-blue-500",
    inactive: "bg-white text-blue-700 border-blue-200 hover:border-blue-400 hover:bg-blue-50",
  },
  purple: {
    active: "bg-purple-500 text-white border-purple-500",
    inactive: "bg-white text-purple-700 border-purple-200 hover:border-purple-400 hover:bg-purple-50",
  },
};

export function QuickFilterChip({
  label,
  count,
  isActive,
  onClick,
  onRemove,
  color = "default",
  title,
}: QuickFilterChipProps) {
  const classes = colorClasses[color];

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
        border rounded-full transition-all duration-150
        ${isActive ? classes.active : classes.inactive}
      `}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`
          px-1.5 py-0.5 text-xs rounded-full min-w-[20px] text-center
          ${isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}
        `}>
          {count}
        </span>
      )}
      {isActive && onRemove && (
        <X
          className="h-3.5 w-3.5 ml-0.5 hover:bg-white/20 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </button>
  );
}

// Active Filter Pills - üstte gösterilen aktif filtreler
interface ActiveFilterPillProps {
  label: string;
  value: string;
  onRemove: () => void;
}

export function ActiveFilterPill({ label, value, onRemove }: ActiveFilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 hover:bg-primary/20 rounded-full"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
