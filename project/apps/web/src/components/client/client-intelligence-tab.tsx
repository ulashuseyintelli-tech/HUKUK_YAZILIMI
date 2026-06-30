'use client';

import { useEffect, useState } from 'react';
import { IntelStatementSection } from '@/components/case/IntelStatementSection';

export interface ClientIntelligenceCase {
  id: string;
  fileNumber?: string | null;
  caseStatus?: string | null;
}

interface ClientIntelligenceTabProps {
  cases: ClientIntelligenceCase[];
}

const caseLabel = (caseItem: ClientIntelligenceCase) =>
  [caseItem.fileNumber || caseItem.id, caseItem.caseStatus].filter(Boolean).join(' · ');

export function ClientIntelligenceTab({ cases }: ClientIntelligenceTabProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id ?? null);

  useEffect(() => {
    if (cases.length === 0) {
      setSelectedCaseId(null);
      return;
    }

    setSelectedCaseId((current) => (current && cases.some((c) => c.id === current) ? current : cases[0].id));
  }, [cases]);

  if (cases.length === 0) {
    return <p className="text-center py-6 text-gray-500">Bu müvekkile bağlı dosya yok.</p>;
  }

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? cases[0];

  return (
    <div className="space-y-4">
      {cases.length > 1 ? (
        <div className="max-w-md">
          <label htmlFor="client-intelligence-case" className="block text-xs font-medium text-gray-500 mb-1">
            Dosya
          </label>
          <select
            id="client-intelligence-case"
            value={selectedCase.id}
            onChange={(event) => setSelectedCaseId(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {cases.map((caseItem) => (
              <option key={caseItem.id} value={caseItem.id}>
                {caseLabel(caseItem)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Dosya: {caseLabel(selectedCase)}</p>
      )}

      <IntelStatementSection caseId={selectedCase.id} />
    </div>
  );
}