'use client';

import { Clock, History } from 'lucide-react';
import { FormUsageHistory } from '@/types/form-metadata';
import { getFormByCode } from '@/config/form-metadata';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

interface RecentFormsProps {
  recentForms: FormUsageHistory[];
  onSelectForm: (formCode: string) => void;
  selectedFormCode?: string;
}

export function RecentForms({ recentForms, onSelectForm, selectedFormCode }: RecentFormsProps) {
  if (recentForms.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4 text-blue-500" />
          Son Kullanılanlar
        </h3>
      </div>
      <div className="p-3 space-y-2">
        {recentForms.map((item) => {
          const form = getFormByCode(item.formCode);
          if (!form) return null;

          const isSelected = selectedFormCode === item.formCode;
          const timeAgo = formatDistanceToNow(new Date(item.lastUsedAt), {
            addSuffix: true,
            locale: tr,
          });

          return (
            <button
              key={item.formCode}
              type="button"
              onClick={() => onSelectForm(item.formCode)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all',
                'hover:border-primary/50 hover:bg-primary/5',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-200 bg-white'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{form.title}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo}
                </div>
              </div>
              <span className="ml-2 shrink-0 px-2 py-0.5 text-xs font-medium rounded-full border bg-gray-50 text-gray-600">
                {item.usageCount}x
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
