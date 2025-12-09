"use client";

import { useState } from "react";
import { Clock, CheckCircle, Circle, AlertCircle, Info, X } from "lucide-react";

interface TimelineEvent {
  id: string;
  stage: string;
  action: string;
  description?: string;
  triggeredBy: string;
  createdAt: string;
  metadata?: any;
}

interface CaseTimelineProps {
  currentStage: string;
  events: TimelineEvent[];
  caseCreatedAt: string;
}

const WORKFLOW_STAGES = [
  { stage: "INITIAL", label: "Dosya Açıldı" },
  { stage: "PAYMENT_ORDER", label: "Ödeme Emri Gönderildi" },
  { stage: "WAITING_RESPONSE", label: "10 Gün Bekleme Süresi" },
  { stage: "OBJECTION", label: "İtiraz Süreci" },
  { stage: "ENFORCEMENT", label: "Haciz Aşaması" },
  { stage: "SEIZURE", label: "Haciz Yapıldı" },
  { stage: "SALE_REQUEST", label: "Satış Talebi" },
  { stage: "AUCTION", label: "İhale Aşaması" },
  { stage: "COLLECTION", label: "Tahsilat" },
  { stage: "CLOSED", label: "Dosya Kapatıldı" },
];

export function CaseTimeline({ currentStage, events, caseCreatedAt }: CaseTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const currentStageIndex = WORKFLOW_STAGES.findIndex((s) => s.stage === currentStage);

  const getStageStatus = (index: number): "done" | "current" | "pending" => {
    if (index < currentStageIndex) return "done";
    if (index === currentStageIndex) return "current";
    return "pending";
  };

  const getEventForStage = (stage: string) => {
    return events.find((e) => e.stage === stage);
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-semibold flex items-center gap-2 mb-6">
        <Clock className="h-5 w-5 text-primary" />
        İcra Süreci Zaman Çizelgesi
      </h3>

      {/* Timeline (J.44-45) */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        {WORKFLOW_STAGES.map((stage, index) => {
          const status = getStageStatus(index);
          const event = getEventForStage(stage.stage);

          return (
            <div key={stage.stage} className="relative pl-10 pb-6 last:pb-0">
              {/* Status Icon */}
              <div
                className={`absolute left-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  status === "done"
                    ? "bg-green-500 border-green-500"
                    : status === "current"
                    ? "bg-blue-500 border-blue-500"
                    : "bg-white border-gray-300"
                }`}
              >
                {status === "done" && <CheckCircle className="h-4 w-4 text-white" />}
                {status === "current" && <Circle className="h-3 w-3 text-white animate-pulse" />}
              </div>

              {/* Content */}
              <div
                className={`${status === "current" ? "bg-blue-50 p-3 rounded-lg -ml-2" : ""} ${
                  event ? "cursor-pointer hover:bg-gray-50 rounded-lg p-2 -ml-2" : ""
                }`}
                onClick={() => event && setSelectedEvent(event)}
              >
                <div className="flex items-center justify-between">
                  <p
                    className={`font-medium ${
                      status === "done"
                        ? "text-green-700"
                        : status === "current"
                        ? "text-blue-700"
                        : "text-gray-400"
                    }`}
                  >
                    {stage.label}
                  </p>
                  {event && (
                    <Info className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Date */}
                {status === "done" && event && (
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString("tr-TR")}
                  </p>
                )}
                {status === "current" && (
                  <p className="text-sm text-blue-600">Devam ediyor</p>
                )}
                {index === 0 && !event && (
                  <p className="text-sm text-muted-foreground">
                    {new Date(caseCreatedAt).toLocaleDateString("tr-TR")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Son İşlemler */}
      {events.length > 0 && (
        <div className="mt-6 pt-4 border-t">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Son İşlemler</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {events.slice(0, 10).map((event) => (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
              >
                <div>
                  <p className="text-sm font-medium">{event.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.triggeredBy === "AUTO" ? "Otomatik" : "Manuel"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleDateString("tr-TR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Detail Modal (J.46) */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">İşlem Detayı</h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">İşlem</p>
                <p className="font-medium">{selectedEvent.action}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aşama</p>
                <p className="font-medium">
                  {WORKFLOW_STAGES.find((s) => s.stage === selectedEvent.stage)?.label ||
                    selectedEvent.stage}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tetikleyen</p>
                <p className="font-medium">
                  {selectedEvent.triggeredBy === "AUTO"
                    ? "Otomatik Sistem"
                    : selectedEvent.triggeredBy === "AI"
                    ? "AI Önerisi"
                    : "Manuel"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tarih</p>
                <p className="font-medium">
                  {new Date(selectedEvent.createdAt).toLocaleString("tr-TR")}
                </p>
              </div>
              {selectedEvent.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Açıklama</p>
                  <p className="font-medium">{selectedEvent.description}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedEvent(null)}
              className="w-full mt-6 py-2 border rounded-lg hover:bg-gray-50"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
