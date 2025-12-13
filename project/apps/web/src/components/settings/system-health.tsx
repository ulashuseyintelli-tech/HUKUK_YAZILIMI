'use client';

import { useState, useEffect } from 'react';
import { Activity, Server, Database, Wifi, Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw, HardDrive, Cpu, MemoryStick } from 'lucide-react';

interface HealthStatus {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  latency?: number;
  message: string;
  lastCheck: string;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
  requests: number;
  errors: number;
}

export function SystemHealth() {
  const [services, setServices] = useState<HealthStatus[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => { checkHealth(); }, []);

  const checkHealth = () => {
    setLoading(true);
    // Demo data
    setTimeout(() => {
      setServices([
        { name: 'API Sunucusu', status: 'healthy', latency: 45, message: 'Tüm endpoint\'ler çalışıyor', lastCheck: new Date().toISOString() },
        { name: 'Veritabanı', status: 'healthy', latency: 12, message: 'PostgreSQL bağlantısı aktif', lastCheck: new Date().toISOString() },
        { name: 'Redis Cache', status: 'healthy', latency: 3, message: 'Cache servisi çalışıyor', lastCheck: new Date().toISOString() },
        { name: 'E-posta Servisi', status: 'warning', latency: 250, message: 'Yüksek gecikme tespit edildi', lastCheck: new Date().toISOString() },
        { name: 'SMS Gateway', status: 'healthy', latency: 180, message: 'NetGSM bağlantısı aktif', lastCheck: new Date().toISOString() },
        { name: 'Dosya Depolama', status: 'healthy', latency: 35, message: 'S3 bağlantısı aktif', lastCheck: new Date().toISOString() },
      ]);
      setMetrics({
        cpu: 23, memory: 58, disk: 42, uptime: '15 gün 8 saat', requests: 12450, errors: 3
      });
      setLoading(false);
      setLastRefresh(new Date());
    }, 500);
  };

  const getStatusIcon = (status: HealthStatus['status']) => {
    if (status === 'healthy') return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (status === 'warning') return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusColor = (status: HealthStatus['status']) => {
    if (status === 'healthy') return 'bg-green-100 border-green-300';
    if (status === 'warning') return 'bg-yellow-100 border-yellow-300';
    return 'bg-red-100 border-red-300';
  };

  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const overallStatus = services.every(s => s.status === 'healthy') ? 'healthy' : services.some(s => s.status === 'error') ? 'error' : 'warning';

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Activity className="h-5 w-5" />Sistem Sağlığı</h3>
        <button onClick={checkHealth} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" />Yenile
        </button>
      </div>

      {/* Overall Status */}
      <div className={`rounded-xl p-6 border ${getStatusColor(overallStatus)}`}>
        <div className="flex items-center gap-4">
          {getStatusIcon(overallStatus)}
          <div>
            <h4 className="font-semibold text-lg">
              {overallStatus === 'healthy' ? 'Tüm Sistemler Çalışıyor' : overallStatus === 'warning' ? 'Bazı Uyarılar Var' : 'Sorun Tespit Edildi'}
            </h4>
            <p className="text-sm text-gray-600">{healthyCount} / {services.length} servis sağlıklı • Son kontrol: {lastRefresh.toLocaleTimeString('tr-TR')}</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={<Cpu className="h-5 w-5" />} label="CPU" value={`${metrics.cpu}%`} color={metrics.cpu > 80 ? 'red' : metrics.cpu > 60 ? 'yellow' : 'green'} />
          <MetricCard icon={<MemoryStick className="h-5 w-5" />} label="Bellek" value={`${metrics.memory}%`} color={metrics.memory > 80 ? 'red' : metrics.memory > 60 ? 'yellow' : 'green'} />
          <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Disk" value={`${metrics.disk}%`} color={metrics.disk > 80 ? 'red' : metrics.disk > 60 ? 'yellow' : 'green'} />
          <MetricCard icon={<Clock className="h-5 w-5" />} label="Uptime" value={metrics.uptime} color="blue" />
        </div>
      )}

      {/* Services */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b bg-gray-50"><h4 className="font-medium">Servis Durumları</h4></div>
        <div className="divide-y">
          {services.map((service, i) => (
            <div key={i} className="flex items-center gap-4 p-4 hover:bg-gray-50">
              {getStatusIcon(service.status)}
              <div className="flex-1">
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-gray-500">{service.message}</p>
              </div>
              {service.latency && (
                <div className="text-right">
                  <p className={`font-medium ${service.latency > 200 ? 'text-yellow-600' : 'text-green-600'}`}>{service.latency}ms</p>
                  <p className="text-xs text-gray-400">gecikme</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Request Stats */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-2"><Wifi className="h-4 w-4" />Bugünkü İstekler</div>
            <p className="text-3xl font-bold">{metrics.requests.toLocaleString('tr-TR')}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-2"><AlertTriangle className="h-4 w-4" />Hata Sayısı</div>
            <p className={`text-3xl font-bold ${metrics.errors > 10 ? 'text-red-600' : metrics.errors > 0 ? 'text-yellow-600' : 'text-green-600'}`}>{metrics.errors}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-600', yellow: 'bg-yellow-50 text-yellow-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600'
  };
  return (
    <div className={`rounded-xl p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2 opacity-70">{icon}<span className="text-sm">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
