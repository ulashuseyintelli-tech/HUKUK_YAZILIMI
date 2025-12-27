"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  Building2,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface BulkCase {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  clientName?: string;
  principalAmount?: number;
  currency?: string;
  caseStatus: string;
  debtorCount?: number;
}

interface BulkOperationsPanelProps {
  cases: BulkCase[];
  onComplete?: () => void;
}

type OperationType = "tebligat" | "uyap" | "document" | "status";

interface OperationResult {
  caseId: string;
  fileNumber: string;
  success: boolean;
  message: string;
}

export function BulkOperationsPanel({ cases, onComplete }: BulkOperationsPanelProps) {
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [operationType, setOperationType] = useState<OperationType | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<OperationResult[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);

  // Tebligat options
  const [tebligatType, setTebligatType] = useState("ODEME_EMRI");
  const [tebligatChannel, setTebligatChannel] = useState("PTT");

  // UYAP options
  const [uyapDocType, setUyapDocType] = useState("TAKIP_TALEBI");

  // Status options
  const [newStatus, setNewStatus] = useState("");

  const toggleCase = (caseId: string) => {
    setSelectedCases(prev =>
      prev.includes(caseId)
        ? prev.filter(id => id !== caseId)
        : [...prev, caseId]
    );
  };

  const toggleAll = () => {
    if (selectedCases.length === cases.length) {
      setSelectedCases([]);
    } else {
      setSelectedCases(cases.map(c => c.id));
    }
  };

  const runBulkOperation = async () => {
    if (selectedCases.length === 0) {
      toast.error("Lutfen en az bir dosya secin");
      return;
    }

    if (!operationType) {
      toast.error("Lutfen islem turu secin");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults([]);

    const operationResults: OperationResult[] = [];
    const total = selectedCases.length;

    for (let i = 0; i < selectedCases.length; i++) {
      const caseId = selectedCases[i];
      const caseData = cases.find(c => c.id === caseId);

      try {
        let result: any;

        switch (operationType) {
          case "tebligat":
            // Toplu tebligat olusturma
            result = await api.post(`/tebligat/bulk`, {
              caseIds: [caseId],
              tebligatType,
              channel: tebligatChannel,
            });
            operationResults.push({
              caseId,
              fileNumber: caseData?.fileNumber || caseId,
              success: true,
              message: "Tebligat olusturuldu",
            });
            break;

          case "uyap":
            // Toplu UYAP gonderimi
            result = await api.post(`/uyap/document/submit`, {
              caseId,
              documentType: uyapDocType,
              documentContent: "Toplu islem",
              documentName: `${uyapDocType}_${caseData?.fileNumber}`,
            });
            operationResults.push({
              caseId,
              fileNumber: caseData?.fileNumber || caseId,
              success: result.data?.success || false,
              message: result.data?.success ? "UYAP'a gonderildi" : (result.data?.errorMessage || "Hata"),
            });
            break;

          case "document":
            // Toplu belge uretimi
            result = await api.post(`/template-engine/takip-talebi`, { caseId });
            operationResults.push({
              caseId,
              fileNumber: caseData?.fileNumber || caseId,
              success: true,
              message: "Belge uretildi",
            });
            break;

          case "status":
            // Toplu durum degisikligi
            if (newStatus) {
              result = await api.changeCaseStatus(caseId, newStatus, "Toplu islem");
              operationResults.push({
                caseId,
                fileNumber: caseData?.fileNumber || caseId,
                success: true,
                message: `Durum ${newStatus} olarak guncellendi`,
              });
            }
            break;
        }
      } catch (error: any) {
        operationResults.push({
          caseId,
          fileNumber: caseData?.fileNumber || caseId,
          success: false,
          message: error.message || "Islem basarisiz",
        });
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResults(operationResults);
    setIsProcessing(false);
    setShowResultsDialog(true);

    const successCount = operationResults.filter(r => r.success).length;
    toast.success(`${successCount}/${total} islem basarili`);

    if (onComplete) {
      onComplete();
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Toplu Islemler
          </CardTitle>
          <CardDescription>
            Birden fazla dosya icin toplu islem yapin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Operation Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Islem Turu</label>
              <Select value={operationType} onValueChange={(v) => setOperationType(v as OperationType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Islem secin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tebligat">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Toplu Tebligat
                    </div>
                  </SelectItem>
                  <SelectItem value="uyap">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Toplu UYAP Gonderimi
                    </div>
                  </SelectItem>
                  <SelectItem value="document">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Toplu Belge Uretimi
                    </div>
                  </SelectItem>
                  <SelectItem value="status">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Toplu Durum Degisikligi
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Operation-specific options */}
            {operationType === "tebligat" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Tebligat Turu</label>
                  <Select value={tebligatType} onValueChange={setTebligatType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ODEME_EMRI">Odeme Emri</SelectItem>
                      <SelectItem value="ICRA_EMRI">Icra Emri</SelectItem>
                      <SelectItem value="HACIZ_IHBARNAMESI_89_1">89/1 Ihbarnamesi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Kanal</label>
                  <Select value={tebligatChannel} onValueChange={setTebligatChannel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PTT">PTT</SelectItem>
                      <SelectItem value="UETS">UETS</SelectItem>
                      <SelectItem value="KEP">KEP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {operationType === "uyap" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Belge Turu</label>
                <Select value={uyapDocType} onValueChange={setUyapDocType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TAKIP_TALEBI">Takip Talebi</SelectItem>
                    <SelectItem value="HACIZ_TALEBI">Haciz Talebi</SelectItem>
                    <SelectItem value="DILEKCE">Dilekce</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {operationType === "status" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Yeni Durum</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Durum secin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Aktif</SelectItem>
                    <SelectItem value="PENDING">Beklemede</SelectItem>
                    <SelectItem value="CLOSED">Kapali</SelectItem>
                    <SelectItem value="ARCHIVED">Arsivlendi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Case Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Dosyalar ({selectedCases.length}/{cases.length} secili)
              </label>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selectedCases.length === cases.length ? "Hicbirini Secme" : "Tumunu Sec"}
              </Button>
            </div>
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedCases.includes(c.id)}
                    onCheckedChange={() => toggleCase(c.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.fileNumber}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {c.clientName} - {c.principalAmount?.toLocaleString("tr-TR")} {c.currency}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {c.debtorCount || 0} borclu
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Islem devam ediyor...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Action Button */}
          <Button
            onClick={runBulkOperation}
            disabled={isProcessing || selectedCases.length === 0 || !operationType}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Isleniyor...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {selectedCases.length} Dosya Icin Islemi Baslat
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Islem Sonuclari</DialogTitle>
            <DialogDescription>
              {successCount} basarili, {failCount} basarisiz
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 p-2 rounded-lg ${
                  result.success ? "bg-green-50" : "bg-red-50"
                }`}
              >
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{result.fileNumber}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.message}</p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowResultsDialog(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
