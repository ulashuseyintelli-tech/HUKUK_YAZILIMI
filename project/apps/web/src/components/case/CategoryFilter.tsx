"use client";

import { FileText, Receipt, Building, AlertTriangle, Home, LayoutGrid } from "lucide-react";
import { FormCategory } from "@/types/form-metadata";
import { formCategories } from "@/config/form-metadata";

interface CategoryFilterProps {
  selectedCategory: FormCategory | "ALL";
  onCategoryChange: (category: FormCategory | "ALL") => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  GENEL_ICRA: <FileText className="h-4 w-4" />,
  KAMBIYO: <Receipt className="h-4 w-4" />,
  IPOTEK_REHIN: <Building className="h-4 w-4" />,
  IFLAS: <AlertTriangle className="h-4 w-4" />,
  KIRA: <Home className="h-4 w-4" />,
};

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onCategoryChange("ALL")}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          selectedCategory === "ALL"
            ? "bg-primary text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
        Tümü
      </button>
      {formCategories.map((category) => (
        <button
          key={category.code}
          onClick={() => onCategoryChange(category.code)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === category.code
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {categoryIcons[category.code]}
          {category.label}
        </button>
      ))}
    </div>
  );
}
