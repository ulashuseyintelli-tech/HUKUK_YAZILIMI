"use client";

import { useState } from "react";
import { Users, Building2, User, Shield, ChevronRight, Phone, Mail, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

// Types
interface Lawyer {
  id: string;
  canSign: boolean;
  role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
  lawyer: {
    id: string;
    name: string;
    surname: string;
    lawyerRank?: 'PARTNER' | 'MANAGER' | 'AUTHORIZED' | 'LAWYER' | 'INTERN';
  };
}

interface Staff {
  id: string;
  roleOnCase?: string;
  staffMember: {
    id: string;
    firstName: string;
    lastName: string;
    staffType?: string;
  };
}

interface Client {
  id: string;
  role?: string;
  client: {
    id: string;
    name: string;
    displayName?: string;
    type?: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC';
  };
}

interface Debtor {
  caseDebtorId: string;
  id: string;
  displayName: string;
  role: string;
  serviceStatus: string;
  hasAlert: boolean;
  alertCount: number;
}

interface CasePartiesSectionProps {
  lawyers?: Lawyer[];
  staff?: Staff[];
  clients?: Client[];
  debtors?: Debtor[];
  onLawyerClick?: (lawyer: Lawyer) => void;
  onStaffClick?: (staff: Staff) => void;
  onClientClick?: (client: Client) => void;
  onDebtorClick?: (debtor: Debtor) => void;
  onAddTeamMember?: () => void;
}

// Rank labels
const rankLabels: Record<string, string> = {
  PARTNER: "Ortak",
  MANAGER: "Yönetici",
  AUTHORIZED: "Yetkili",
  LAWYER: "Avukat",
  INTERN: "Stajyer",
};

const roleLabels: Record<string, string> = {
  RESPONSIBLE: "Sorumlu",
  ASSIGNED: "Atanan",
  ASSISTANT: "Yardımcı",
  INTERN: "Stajyer",
};

// Service status colors
const serviceStatusColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  FINALIZED: { bg: "bg-emerald-100", text: "text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  NOTIFIED: { bg: "bg-blue-100", text: "text-blue-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  PENDING: { bg: "bg-amber-100", text: "text-amber-700", icon: <Clock className="w-3 h-3" /> },
  NOT_STARTED: { bg: "bg-slate-100", text: "text-slate-600", icon: <Clock className="w-3 h-3" /> },
};

export function CasePartiesSection({
  lawyers = [],
  staff = [],
  clients = [],
  debtors = [],
  onLawyerClick,
  onStaffClick,
  onClientClick,
  onDebtorClick,
  onAddTeamMember,
}: CasePartiesSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      {/* Dosya Ekibi */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-medium text-slate-700">Dosya Ekibi</h3>
          </div>
          {onAddTeamMember && (
            <button
              onClick={onAddTeamMember}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              + Ekle
            </button>
          )}
        </div>
        <div className="space-y-2">
          {lawyers.map((l) => (
            <button
              key={l.id}
              onClick={() => onLawyerClick?.(l)}
              className="w-full text-left p-2 rounded hover:bg-slate-50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-3 h-3 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    Av. {l.lawyer.name} {l.lawyer.surname}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {rankLabels[l.lawyer.lawyerRank || "LAWYER"]}
                    {l.canSign && " • İmza Yetkili"}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
            </button>
          ))}
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => onStaffClick?.(s)}
              className="w-full text-left p-2 rounded hover:bg-slate-50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-3 h-3 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {s.staffMember.firstName} {s.staffMember.lastName}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {s.roleOnCase || s.staffMember.staffType || "Personel"}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
            </button>
          ))}
          {lawyers.length === 0 && staff.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Ekip üyesi yok</p>
          )}
        </div>
      </div>

      {/* Müvekkiller */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-medium text-slate-700">Müvekkiller</h3>
        </div>
        <div className="space-y-2">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => onClientClick?.(c)}
              className="w-full text-left p-2 rounded hover:bg-slate-50 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  {c.client.type === 'COMPANY' ? (
                    <Building2 className="w-3 h-3 text-purple-600" />
                  ) : (
                    <User className="w-3 h-3 text-purple-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {c.client.displayName || c.client.name}
                  </p>
                  {c.role && (
                    <p className="text-[10px] text-slate-500">{c.role}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
            </button>
          ))}
          {clients.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Müvekkil yok</p>
          )}
        </div>
      </div>

      {/* Borçlular */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-medium text-slate-700">Borçlular</h3>
          </div>
          <span className="text-xs text-slate-500">
            {debtors.length} Borçlu
            {debtors.filter(d => d.hasAlert).length > 0 && (
              <span className="ml-1 text-amber-600">
                • {debtors.filter(d => d.hasAlert).length} Uyarı
              </span>
            )}
          </span>
        </div>
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {debtors.map((d) => {
            const status = serviceStatusColors[d.serviceStatus] || serviceStatusColors.NOT_STARTED;
            return (
              <button
                key={d.caseDebtorId}
                onClick={() => onDebtorClick?.(d)}
                className="w-full text-left p-2 rounded hover:bg-slate-50 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-6 h-6 rounded-full ${status.bg} flex items-center justify-center flex-shrink-0`}>
                    <span className={status.text}>{status.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {d.displayName}
                    </p>
                    <p className="text-[10px] text-slate-500">{d.role}</p>
                  </div>
                  {d.hasAlert && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 rounded text-amber-700">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="text-[10px] font-medium">{d.alertCount}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 ml-2" />
              </button>
            );
          })}
          {debtors.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Borçlu yok</p>
          )}
        </div>
      </div>
    </div>
  );
}
