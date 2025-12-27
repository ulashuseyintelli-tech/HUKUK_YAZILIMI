"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Users,
  Mail,
  Building2,
  CreditCard,
  PenTool,
  Calculator,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileCheck,
  Banknote,
  Home,
  Gavel,
  Shield,
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
    { id: "overview", label: "Genel Bakis", icon: FileText, always: true },
    { id: "debtors", label: "Borcular", icon: Users, always: true },
    { id: "validation", label: "Validasyon", icon: CheckCircle, always: true },
    { id: "instruments", label: "Cek/Senet", icon: CreditCard, show: isKambiyo },
    { id: "lease", label: "Kira", icon: Home, show: isKira },
    { id: "judgment", label: "Ilam", icon: Gavel, show: isIlamli },
    { id: "collateral", label: "Teminat", icon: Shield, show: isRehin },
    { id: "tebligat", label: "Tebligat", icon: Mail, always: true },
    { id: "uyap", label: "UYAP", icon: Building2, always: true },
    { id: "esign", label: "E-Imza", icon: PenTool, always: true },
    { id: "bank", label: "Banka", icon: Banknote, always: true },
    { id: "interest", label: "Faiz", icon: Calculator, always: true },
    { id: "timeline", label: "Zaman Cizelgesi", icon: Clock, always: true },
    { id: "notes", label: "Notlar", icon: FileCheck, always: true },
    { id: "attachments", label: "Ekler", icon: FileText, always: true },
  ];

  const visibleTabs = tabs.filter(tab => tab.always || tab.show);

  return (
    <div className="space-y-4">
      {/* Case Header */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">
                {caseData?.fileNumber || "Dosya"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {caseData?.executionFileNumber && `Icra No: ${caseData.executionFileNumber}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={caseData?.caseStatus === "ACTIVE" ? "default" : "secondary"}>
                {caseData?.caseStatus === "ACTIVE" ? "Aktif" : caseData?.caseStatus}
              </Badge>
              {caseData?.asama && (
                <Badge variant="outline">{caseData.asama}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Muvekkil:</span>
              <p className="font-medium">{caseData?.client?.name || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Avukat:</span>
              <p className="font-medium">{caseData?.lawyer?.name || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Takip Turu:</span>
              <p className="font-medium">{takipTuru || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Anapara:</span>
              <p className="font-medium">
                {caseData?.principalAmount?.toLocaleString("tr-TR")} {caseData?.currency || "TRY"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dosya Bilgileri</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dosya No:</span>
                  <span>{caseData?.fileNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Icra Dosya No:</span>
                  <span>{caseData?.executionFileNumber || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acilis Tarihi:</span>
                  <span>{caseData?.openDate ? new Date(caseData.openDate).toLocaleDateString("tr-TR") : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Icra Dairesi:</span>
                  <span>{caseData?.executionOffice || "-"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alacak Ozeti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Debtors Tab */}
        <TabsContent value="debtors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Borcular</CardTitle>
            </CardHeader>
            <CardContent>
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
                      <Badge variant="outline">{cd.role || "BORCLU"}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">Borclu bulunamadi</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation" className="mt-4">
          <ValidationPanel caseId={caseId} caseData={caseData} />
        </TabsContent>

        {/* Instruments Tab (Kambiyo) */}
        {isKambiyo && (
          <TabsContent value="instruments" className="mt-4">
            <InstrumentForm caseId={caseId} onSave={onRefresh} />
          </TabsContent>
        )}

        {/* Lease Tab (Kira) */}
        {isKira && (
          <TabsContent value="lease" className="mt-4">
            <LeaseForm caseId={caseId} onSave={onRefresh} />
          </TabsContent>
        )}

        {/* Judgment Tab (Ilamli) */}
        {isIlamli && (
          <TabsContent value="judgment" className="mt-4">
            <JudgmentForm caseId={caseId} onSave={onRefresh} />
          </TabsContent>
        )}

        {/* Collateral Tab (Rehin/Ipotek) */}
        {isRehin && (
          <TabsContent value="collateral" className="mt-4">
            <CollateralForm caseId={caseId} onSave={onRefresh} />
          </TabsContent>
        )}

        {/* Tebligat Tab */}
        <TabsContent value="tebligat" className="mt-4">
          <TebligatPanel caseId={caseId} />
        </TabsContent>

        {/* UYAP Tab */}
        <TabsContent value="uyap" className="mt-4">
          <UyapPanel caseId={caseId} />
        </TabsContent>

        {/* E-Sign Tab */}
        <TabsContent value="esign" className="mt-4">
          <ESignPanel caseId={caseId} />
        </TabsContent>

        {/* Bank Tab */}
        <TabsContent value="bank" className="mt-4">
          <BankPanel caseId={caseId} />
        </TabsContent>

        {/* Interest Calculator Tab */}
        <TabsContent value="interest" className="mt-4">
          <InterestCalculator />
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <CaseTimeline caseId={caseId} />
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-4">
          <CaseNotes caseId={caseId} />
        </TabsContent>

        {/* Attachments Tab */}
        <TabsContent value="attachments" className="mt-4">
          <CaseAttachments caseId={caseId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
