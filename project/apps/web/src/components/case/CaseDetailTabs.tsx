"use client";

import { useState } from "react";
import {
  FileText,
  Users,
  Mail,
  Building2,
  CreditCard,
  PenTool,
  Calculator,
  Clock,
  CheckCircle,
  FileCheck,
  Banknote,
  Home,
  Gavel,
  Shield,
  History,
} from "lucide-react";

// Panel imports
import { TebligatPanel } from "./TebligatPanel";
import { UyapPanel } from "./UyapPanel";
import { ESignPanel } from "./ESignPanel";
import { BankPanel } from "./BankPanel";
import { ValidationPanel } from "./ValidationPanel";
import { InstrumentForm } from "./InstrumentForm";
import { LeaseForm } from "./LeaseForm";
import { JudgmentForm } from "./JudgmentForm";
import { CollateralForm } from "./CollateralForm";
import { CaseTimeline } from "./CaseTimeline";
import { CaseNotes } from "./case-notes";
import { CaseAttachments } from "./case-attachments";
import { InterestCalculator } from "./interest-calculator";
import { CaseHistoryPanel } from "./CaseHistoryPanel";

interface CaseDetailTabsProps {
  caseId: string;
  caseData: any;
  takipTuru?: string;
  onRefresh?: () => void;
}

export function CaseDetailTabs({ caseId, caseData, takipTuru, onRefresh }: CaseDetailTabsProps) {
  const [activeTab, setActiveTab] = useState("overview");

  // Takip turune gore hangi tab'larin gorunecegini belirle
  const isKambiyo = takipTuru?.startsWith("KAMBIYO");
  const isKira = takipTuru === "KIRA_ALACAGI" || takipTuru === "TAHLIYE";
  const isIlamli = takipTuru?.startsWith("ILAMLI");
  const isRehin = takipTuru === "REHIN_IPOTEK";

  const tabs = [
    { id: "overview", label: "Genel Bakış", icon: FileText, always: true },
    { id: "debtors", label: "Borçlular", icon: Users, always: true },
    { id: "validation", label: "Validasyon", icon: CheckCircle, always: true },
    { id: "instruments", label: "Çek/Senet", icon: CreditCard, show: isKambiyo },
    { id: "lease", label: "Kira", icon: Home, show: isKira },
    { id: "judgment", label: "İlam", icon: Gavel, show: isIlamli },
    { id: "collateral", label: "Teminat", icon: Shield, show: isRehin },
    { id: "tebligat", label: "Tebligat", icon: Mail, always: true },
    { id: "uyap", label: "UYAP", icon: Building2, always: true },
    { id: "esign", label: "E-İmza", icon: PenTool, always: true },
    { id: "bank", label: "Banka", icon: Banknote, always: true },
    { id: "interest", label: "Faiz", icon: Calculator, always: true },
    { id: "timeline", label: "Zaman Çizelgesi", icon: Clock, always: true },
    { id: "history", label: "İşlem Geçmişi", icon: History, always: true },
    { id: "notes", label: "Notlar", icon: FileCheck, always: true },
    { id: "attachments", label: "Ekler", icon: FileText, always: true },
  ];

  const visibleTabs = tabs.filter(tab => tab.always || tab.show);

  return (
    <div className="space-y-4">
      {/* Case Header */}
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold">{caseData?.fileNumber || "Dosya"}</h2>
            {caseData?.executionFileNumber && (
              <p className="text-sm text-muted-foreground mt-1">
                İcra No: {caseData.executionFileNumber}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              caseData?.caseStatus === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
            }`}>
              {caseData?.caseStatus === "ACTIVE" ? "Aktif" : caseData?.caseStatus}
            </span>
            {caseData?.asama && (
              <span className="px-2 py-1 rounded text-xs border">{caseData.asama}</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Müvekkil:</span>
            <p className="font-medium">{caseData?.client?.name || "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Avukat:</span>
            <p className="font-medium">{caseData?.lawyer?.name || "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Takip Türü:</span>
            <p className="font-medium">{takipTuru || "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Anapara:</span>
            <p className="font-medium">
              {caseData?.principalAmount?.toLocaleString("tr-TR")} {caseData?.currency || "TRY"}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {/* Tab List */}
        <div className="flex flex-wrap gap-1 p-2 bg-gray-50 border-b">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-white"
                  : "hover:bg-gray-200 text-gray-700"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">Dosya Bilgileri</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dosya No:</span>
                    <span>{caseData?.fileNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">İcra Dosya No:</span>
                    <span>{caseData?.executionFileNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Açılış Tarihi:</span>
                    <span>{caseData?.openDate ? new Date(caseData.openDate).toLocaleDateString("tr-TR") : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">İcra Dairesi:</span>
                    <span>{caseData?.executionOffice || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">Alacak Özeti</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Anapara:</span>
                    <span className="font-medium">
                      {caseData?.principalAmount?.toLocaleString("tr-TR")} {caseData?.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faiz:</span>
                    <span>{caseData?.interestAmount?.toLocaleString("tr-TR") || "0"} {caseData?.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Masraf:</span>
                    <span>{caseData?.expenseAmount?.toLocaleString("tr-TR") || "0"} {caseData?.currency}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium">Toplam:</span>
                    <span className="font-bold text-primary">
                      {((caseData?.principalAmount || 0) + (caseData?.interestAmount || 0) + (caseData?.expenseAmount || 0)).toLocaleString("tr-TR")} {caseData?.currency}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Debtors Tab */}
          {activeTab === "debtors" && (
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-3">Borçlular</h3>
              {caseData?.debtors?.length > 0 ? (
                <div className="space-y-3">
                  {caseData.debtors.map((cd: any, idx: number) => (
                    <div key={cd.id || idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{cd.debtor?.name || cd.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {cd.debtor?.identityNo || cd.identityNo} - {cd.role || "BORCLU"}
                        </p>
                      </div>
                      <span className="px-2 py-1 text-xs border rounded">{cd.role || "BORCLU"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">Borçlu bulunamadı</p>
              )}
            </div>
          )}

          {/* Validation Tab */}
          {activeTab === "validation" && <ValidationPanel caseId={caseId} />}

          {/* Instruments Tab (Kambiyo) */}
          {activeTab === "instruments" && isKambiyo && <InstrumentForm caseId={caseId} />}

          {/* Lease Tab (Kira) */}
          {activeTab === "lease" && isKira && <LeaseForm caseId={caseId} />}

          {/* Judgment Tab (Ilamli) */}
          {activeTab === "judgment" && isIlamli && <JudgmentForm caseId={caseId} />}

          {/* Collateral Tab (Rehin/Ipotek) */}
          {activeTab === "collateral" && isRehin && <CollateralForm caseId={caseId} />}

          {/* Tebligat Tab */}
          {activeTab === "tebligat" && <TebligatPanel caseId={caseId} />}

          {/* UYAP Tab */}
          {activeTab === "uyap" && <UyapPanel caseId={caseId} />}

          {activeTab === "history" && <CaseHistoryPanel caseId={caseId} />}

          {/* E-Sign Tab */}
          {activeTab === "esign" && <ESignPanel caseId={caseId} />}

          {/* Bank Tab */}
          {activeTab === "bank" && <BankPanel caseId={caseId} />}

          {/* Interest Calculator Tab */}
          {activeTab === "interest" && <InterestCalculator />}

          {/* Timeline Tab */}
          {activeTab === "timeline" && (
            <CaseTimeline 
              currentStage={caseData?.workflowStage || "INITIAL"} 
              events={caseData?.lifecycleEvents || []} 
              caseCreatedAt={caseData?.createdAt || new Date().toISOString()} 
            />
          )}

          {/* Notes Tab */}
          {activeTab === "notes" && <CaseNotes caseId={caseId} />}

          {/* Attachments Tab */}
          {activeTab === "attachments" && <CaseAttachments caseId={caseId} />}
        </div>
      </div>
    </div>
  );
}
