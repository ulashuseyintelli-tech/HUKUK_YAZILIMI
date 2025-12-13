"use client";

import { useState, useEffect } from "react";
import { Activity, Server, Database, Clock, Zap, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  status: "good" | "warning" | "critical";
  trend?: number;
}

interface ServiceMetric {
  service: string;
  avgResponseTime: number;
  requestCount: number;
  errorRate: number;
  status: "healthy" | "degraded" | "down";
}

const mockMetrics: PerformanceMetric[] = [
  { name: "API Yanıt Süresi", value: 145, unit: "ms", status: "good", trend: -5 },
  { name: "Veritabanı Sorgu", value: 32, unit: "ms", status: "good", trend: 2 },
  { name: "Bellek Kullanımı", value: 68, unit: "%", status: "warning", trend: 8 },
  { name: "CPU Kullanımı", value: 42, unit: "%", status: "good", trend: -3 },
  { name: "Disk I/O", value: 25, unit: "MB/s", status: "good", trend: 0 },
  { name: "Aktif Bağlantı", value: 156, unit: "", status: "good", trend: 12 },
];

const mockServices: ServiceMetric[] = [
  { service: "Auth API", avgResponseTime: 85, requestCount: 12500, errorRate: 0.1, status: "healthy" },
  { service: "Case API", avgResponseTime: 165, requestCount: 45000, errorRate: 0.3, status: "healthy" },
  { service: "Document API", avgResponseTime: 320, requestCount: 8500, errorRate: 1.2, status: "degraded" },
  { service: "Notification API", avgResponseTime: 95, requestCount: 5200, errorRate: 0.2, status: "healthy" },
  { service: "Report API", avgResponseTime: 450, requestCount: 2100, errorRate: 0.5, status: "healthy" },
];

export function SystemPerformanceReport() {
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "good":
      case "healthy":
        return "text-green-600 bg-green-100";
      case "warning":
      case "degraded":
        return "text-yellow-600 bg-yellow-100";
      case "critical":
      case "down":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "good":
      case "healthy":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "warning":
      case "degraded":
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
    }
  };

  const overallHealth = mockServices.every((s) => s.status === "healthy") ? "healthy" : "degraded";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5" /> Sistem Performans Raporu
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Otomatik Yenile
          </label>
          <button
            onClick={() => setLastUpdate(new Date())}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" /> Yenile
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${getStatusColor(overallHealth)}`}>
        {getStatusIcon(overallHealth)}
        <span className="font-medium">
          Genel Durum: {overallHealth === "healthy" ? "Sağlıklı" : "Dikkat Gerektiriyor"}
        </span>
        <span className="ml-auto text-xs">
          Son güncelleme: {lastUpdate.toLocaleTimeString("tr-TR")}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {mockMetrics.map((metric, idx) => (
          <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">{metric.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(metric.status)}`}>
                {metric.status === "good" ? "İyi" : metric.status === "warning" ? "Uyarı" : "Kritik"}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{metric.value}</span>
              <span className="text-sm text-gray-500">{metric.unit}</span>
              {metric.trend !== undefined && metric.trend !== 0 && (
                <span className={`text-xs ml-auto ${metric.trend > 0 ? "text-red-500" : "text-green-500"}`}>
                  {metric.trend > 0 ? "+" : ""}{metric.trend}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Server className="w-4 h-4" /> Servis Performansı
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Servis</th>
                <th className="py-2 text-right">Yanıt Süresi</th>
                <th className="py-2 text-right">İstek Sayısı</th>
                <th className="py-2 text-right">Hata Oranı</th>
                <th className="py-2 text-center">Durum</th>
              </tr>
            </thead>
            <tbody>
              {mockServices.map((service, idx) => (
                <tr key={idx} className="border-b">
                  <td className="py-2 font-medium">{service.service}</td>
                  <td className="py-2 text-right">{service.avgResponseTime} ms</td>
                  <td className="py-2 text-right">{service.requestCount.toLocaleString()}</td>
                  <td className="py-2 text-right">%{service.errorRate}</td>
                  <td className="py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(service.status)}`}>
                      {service.status === "healthy" ? "Sağlıklı" : service.status === "degraded" ? "Yavaş" : "Çalışmıyor"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-blue-600">99.8%</div>
          <div className="text-xs text-gray-500">Uptime (30 gün)</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">73.5K</div>
          <div className="text-xs text-gray-500">Günlük İstek</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-600">0.4%</div>
          <div className="text-xs text-gray-500">Ort. Hata Oranı</div>
        </div>
      </div>
    </div>
  );
}
