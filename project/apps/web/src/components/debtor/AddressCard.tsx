"use client";

import { useState } from "react";
import {
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MoreVertical,
  Trash2,
  Edit,
  Star,
  History,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import {
  AddressDTO,
  AddressTypeLabels,
  AddressTypeIcons,
  AddressSourceLabels,
  AddressRiskFlagLabels,
  LegalPriorityLabels,
  VerificationStatus,
} from "@/lib/api";
import { ConfidenceScoreBadge } from "../address-discovery/ConfidenceScoreBadge";

interface AddressCardProps {
  address: AddressDTO;
  isActive?: boolean;
  onSetActive?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewHistory?: () => void;
  onVerify?: () => void;
  isVerifying?: boolean;
}

export function AddressCard({
  address,
  isActive,
  onSetActive,
  onEdit,
  onDelete,
  onViewHistory,
  onVerify,
  isVerifying,
}: AddressCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const hasRiskFlags = address.riskFlags.length > 0;
  const icon = AddressTypeIcons[address.type] || "📍";
  
  // Verification status helpers
  const canVerify = address.type === "MERNIS" || address.type === "LEGAL_CENTER";
  const isOutdated = address.verificationStatus === "OUTDATED";
  const isNotVerified = address.verificationStatus === "NOT_VERIFIED";

  return (
    <div
      className={`relative border rounded-lg p-3 transition-all ${
        isActive
          ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-200"
          : hasRiskFlags
          ? "border-amber-300 bg-amber-50/30"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Active Badge */}
      {isActive && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
          Aktif Tebligat
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="font-medium text-sm text-gray-900">
              {AddressTypeLabels[address.type]}
            </div>
            <div className="text-xs text-gray-500">
              {AddressSourceLabels[address.source]}
            </div>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-20 min-w-[140px]">
                {!isActive && onSetActive && (
                  <button
                    onClick={() => {
                      onSetActive();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Star className="w-4 h-4" />
                    Aktif Yap
                  </button>
                )}
                {onViewHistory && (
                  <button
                    onClick={() => {
                      onViewHistory();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <History className="w-4 h-4" />
                    Geçmiş
                  </button>
                )}
                {canVerify && onVerify && (
                  <button
                    onClick={() => {
                      onVerify();
                      setShowMenu(false);
                    }}
                    disabled={isVerifying}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600 disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    {isVerifying ? "Doğrulanıyor..." : isOutdated ? "Yeniden Doğrula" : "Doğrula"}
                  </button>
                )}
                {onEdit && (
                  <button
                    onClick={() => {
                      onEdit();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Düzenle
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => {
                      onDelete();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Address Text */}
      <div className="mt-2 flex items-start gap-2">
        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 leading-snug">{address.fullText}</p>
      </div>

      {/* Badges Row */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {/* Confidence Score Badge */}
        {address.confidenceScore !== undefined && (
          <ConfidenceScoreBadge score={address.confidenceScore} />
        )}

        {/* Priority Badge with Order */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            address.legalPriority === "HIGH"
              ? "bg-green-100 text-green-700"
              : address.legalPriority === "MEDIUM"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600"
          }`}
          title={
            address.legalPriority === "HIGH"
              ? "Tebligat Kanunu'na göre birincil adres"
              : address.legalPriority === "MEDIUM"
              ? "Tebligat Kanunu'na göre ikincil adres"
              : "Tebligat Kanunu'na göre düşük öncelikli"
          }
        >
          {address.legalPriority === "HIGH" && "1️⃣ "}
          {address.legalPriority === "MEDIUM" && "2️⃣ "}
          {address.legalPriority === "LOW" && "3️⃣ "}
          {LegalPriorityLabels[address.legalPriority]}
        </span>

        {/* Verified Badge */}
        {address.verified && (
          <span 
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
              isOutdated 
                ? "bg-amber-100 text-amber-700" 
                : "bg-emerald-100 text-emerald-700"
            }`}
            title={address.verificationMessage}
          >
            {isOutdated ? (
              <ShieldAlert className="w-3 h-3" />
            ) : (
              <ShieldCheck className="w-3 h-3" />
            )}
            {isOutdated ? "Güncelleme Gerekli" : "Doğrulanmış"}
            {address.daysSinceVerification !== undefined && (
              <span className="text-[10px] opacity-75">
                ({address.daysSinceVerification}g)
              </span>
            )}
          </span>
        )}
        
        {/* Not Verified Badge */}
        {!address.verified && canVerify && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
            <ShieldAlert className="w-3 h-3" />
            Doğrulanmamış
          </span>
        )}

        {/* TK 21/2 Badge */}
        {address.canApply21_2 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
            TK 21/2
          </span>
        )}

        {address.tk21_2Applied && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500 text-white">
            21/2 Uygulandı
          </span>
        )}
      </div>

      {/* Risk Flags */}
      {hasRiskFlags && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {address.riskFlags.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700"
            >
              <AlertTriangle className="w-3 h-3" />
              {AddressRiskFlagLabels[flag]}
            </span>
          ))}
        </div>
      )}

      {/* Last Notification */}
      {address.lastNotificationResult && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>
            Son tebligat:{" "}
            {new Date(address.lastNotificationResult.date).toLocaleDateString("tr-TR")} -{" "}
            {address.lastNotificationResult.status}
          </span>
        </div>
      )}
    </div>
  );
}
