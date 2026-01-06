"use client";

import { AlertTriangle, FileText, Shield, Info, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useState } from "react";

interface BankClaimWarning {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  suggestion?: string;
}

interface BankClaimRisk {
  code: string;
  description: string;
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  impact: string;
}

interface RequiredDocument {
  code: string;
  name: string;
  description: string;
  isPresent: boolean;
  isMandatory: boolean;
}

interface IIK68Status {
  hasValidDocuments: boolean;
  documentTypes: string[];
  canRequestRemoval: boolean;
  removalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface BankClaimValidation {
  isBankClaim: boolean;
  warnings: BankClaimWarning[];
  risks: BankClaimRisk[];
  requiredDocuments: RequiredDocument[];
  iik68Status: IIK68Status;
}

interface BankClaimWarningPanelProps {
  validation: BankClaimValidation;
  onDocumentUpload?: (documentCode: string) => void;
  className?: string;
}

const BANK_CLAIM_MAHIYET_CODES = ['BANKA', 'KREDI', 'KREDI_KARTI'];

export function isBankClaimMahiyet(mahiyetCode: string | null | undefined): boolean {
  if (!mahiyetCode) return false;
  return BANK_CLAIM_MAHIYET_CODES.includes(mahiyetCode);
}

export function BankClaimWarningPanel({ validation, onDocumentUpload, className = "" }: BankClaimWarningPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (!validation.isBankClaim) return null;

  const criticalWarnings = validation.warnings.filter(w => w.severity === 'CRITICAL');
  const regularWarnings = validation.warnings.filter(w => w.severity === 'WARNING');
  const infoWarnings = validation.warnings.filter(w => w.severity === 'INFO');

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'WARNING': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getRiskColor = (probability: string) => {
    switch (probability) {
      case 'HIGH': return 'text-red-600 bg-red-50 border-red-200';
      case 'MEDIUM': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-green-600 bg-green-50 border-green-200';
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-blue-900">Banka Alacağı - İİK 68 Kontrolleri</span>
          {criticalWarnings.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {criticalWarnings.length} Kritik
            </span>
          )}
        </div>
        <span className="text-sm text-blue-600">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* İİK 68 Durumu */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              İİK 68 Belge Durumu
            </h4>
            <div className="flex items-center gap-4 text-sm">
              <div className={`flex items-center gap-1 ${validation.iik68Status.hasValidDocuments ? 'text-green-600' : 'text-red-600'}`}>
                {validation.iik68Status.hasValidDocuments ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <span>Geçerli Belgeler: {validation.iik68Status.hasValidDocuments ? 'Var' : 'Eksik'}</span>
              </div>
              <div className={`flex items-center gap-1 ${validation.iik68Status.canRequestRemoval ? 'text-green-600' : 'text-amber-600'}`}>
                {validation.iik68Status.canRequestRemoval ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <span>İtirazın Kaldırılması: {validation.iik68Status.canRequestRemoval ? 'İstenebilir' : 'Riskli'}</span>
              </div>
            </div>
          </div>

          {/* Zorunlu Belgeler */}
          <div>
            <h4 className="text-sm font-medium mb-2">Gerekli Belgeler</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {validation.requiredDocuments.map((doc) => (
                <div
                  key={doc.code}
                  className={`p-2 rounded border ${doc.isPresent ? 'bg-green-50 border-green-200' : doc.isMandatory ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {doc.isPresent ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : doc.isMandatory ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium">{doc.name}</span>
                      {doc.isMandatory && !doc.isPresent && (
                        <span className="text-xs text-red-600">(Zorunlu)</span>
                      )}
                    </div>
                    {!doc.isPresent && onDocumentUpload && (
                      <button
                        onClick={() => onDocumentUpload(doc.code)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Ekle
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Uyarılar */}
          {validation.warnings.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Uyarılar</h4>
              <div className="space-y-2">
                {[...criticalWarnings, ...regularWarnings, ...infoWarnings].map((warning, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border ${
                      warning.severity === 'CRITICAL' ? 'bg-red-50 border-red-200' :
                      warning.severity === 'WARNING' ? 'bg-amber-50 border-amber-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {getSeverityIcon(warning.severity)}
                      <div>
                        <p className="text-sm font-medium">{warning.message}</p>
                        {warning.suggestion && (
                          <p className="text-xs text-muted-foreground mt-1">{warning.suggestion}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Riskler */}
          {validation.risks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Risk Analizi</h4>
              <div className="space-y-2">
                {validation.risks.map((risk, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border ${getRiskColor(risk.probability)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{risk.description}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        risk.probability === 'HIGH' ? 'bg-red-100 text-red-700' :
                        risk.probability === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {risk.probability === 'HIGH' ? 'Yüksek' : risk.probability === 'MEDIUM' ? 'Orta' : 'Düşük'}
                      </span>
                    </div>
                    <p className="text-xs">{risk.impact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* İcra İnkâr Tazminatı Bilgisi */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-amber-800">%20 İcra İnkâr Tazminatı</h4>
                <p className="text-xs text-amber-700 mt-1">
                  Banka alacaklarında borçlu haksız yere itiraz ederse, alacağın %20'si oranında icra inkâr tazminatı ödemek zorunda kalabilir. 
                  Bu durum borçlu için ciddi bir risk oluşturur ve genellikle itirazdan caydırıcı etki yapar.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Basit banka alacağı uyarı badge'i
 */
export function BankClaimBadge({ mahiyetCode }: { mahiyetCode: string | null | undefined }) {
  if (!isBankClaimMahiyet(mahiyetCode)) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
      <Shield className="h-3 w-3" />
      İİK 68
    </span>
  );
}
