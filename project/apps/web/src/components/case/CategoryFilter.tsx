'use client';

import { cn } from '@/lib/utils';
import { 
  FileText, 
  Receipt, 
  Building, 
  AlertTriangle, 
  Home,
  LayoutGrid,
} from 'lucide-react';
import { FormCategory } from '@/types/form-metadata';
import { formCategories } from '@/config/form-metadata';

interface CategoryFilterProps {
  selectedCategory: FormCategory | 'ALL';
  onCategoryChange: (category: FormCategory | 'ALL') => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Receipt,
  Building,
  AlertTriangle,
  Home,
  LayoutGrid,
};

export function CategoryFilter({ selectedCategory, onCategoryChange }: CategoryFilterProps) {
  const allCategories = [
    { code: 'ALL' as const, label: 'Tümü', icon: 'LayoutGrid' },
    ...formCategories,
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {allCategories.map((category) => {
        const Icon = iconMap[category.icon] || FileText;
        const isSelected = selectedCategory === category.code;

        return (
          <button
            key={category.code}
            type="button"
            onClick={() => onCategoryChange(category.code)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border transition-all',
              isSelected 
                ? 'bg-primary text-white border-primary shadow-md' 
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )}
          >
            <Icon className="h-4 w-4" />
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
