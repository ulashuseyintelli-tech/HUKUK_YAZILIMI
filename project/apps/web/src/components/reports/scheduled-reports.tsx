'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Clock, Plus, Trash2, Mail, Calendar, Play, Pause, Edit, X, Check, Bell } from 'lucide-react';

interface ScheduledReport {
  id: string;
  name: string;
  reportType: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  recipients: string[];
  isActive: boolean;
  lastRun?: string;
  nextRun?: string;
}

const REPORT_TYPES = [
  { id: 'case-summary', name: 'Dosya Özet Raporu' },
  { id: 'collection', name: 'Tahsilat Raporu' },
  { id: 'client', name: 'Müvekkil Raporu' },
  { id: 'risk', name: 'Risk Analiz Raporu' },
  { id: 'performance', name: 'Performans Raporu' },
  { id: 'expiring-poa', name: 'Vekalet Uyarı Raporu' },
];

const DAYS_OF_WEEK = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function ScheduledReports() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    reportType: string;
    schedule: 'daily' | 'weekly' | 'monthly';
    dayOfWeek: number;
    dayOfMonth: number;
    time: string;
    recipients: string;
  }>({
    name: '',
    reportType: '',
    schedule: 'weekly',
    dayOfWeek: 1,
    dayOfMonth: 1,
    time: '09:00',
    recipients: '',
  });

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const res = await api.get('/reports/scheduled');
      setReports(res.data?.data || []);
    } catch (e) {
      // Demo data
      setReports([
        {
          id: '1',
          name: 'Haftalık Tahsilat Raporu',
          reportType: 'collection',
          schedule: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: ['admin@example.com'],
          isActive: true,
          lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          name: 'Aylık Performans Raporu',
          reportType: 'performance',
          schedule: 'monthly',
          dayOfMonth: 1,
          time: '08:00',
          recipients: ['admin@example.com', 'manager@example.com'],
          isActive: true,
          lastRun: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          nextRun: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const saveReport = async () => {
    if (!formData.name || !formData.reportType || !formData.recipients) return;

    const newReport: ScheduledReport = {
      id: editingReport?.id || Date.now().toString(),
      name: formData.name,
      reportType: formData.reportType,
      schedule: formData.schedule,
      dayOfWeek: formData.schedule === 'weekly' ? formData.dayOfWeek : undefined,
      dayOfMonth: formData.schedule === 'monthly' ? formData.dayOfMonth : undefined,
      time: formData.time,
      recipients: formData.recipients.split(',').map(e => e.trim()).filter(Boolean),
      isActive: true,
      nextRun: calculateNextRun(formData),
    };

    try {
      if (editingReport) {
        await api.put(`/reports/scheduled/${editingReport.id}`, newReport);
      } else {
        await api.post('/reports/scheduled', newReport);
      }
      loadReports();
    } catch (e) {
      // Local update
      if (editingReport) {
        setReports(prev => prev.map(r => r.id === editingReport.id ? newReport : r));
      } else {
        setReports(prev => [...prev, newReport]);
      }
    }

    resetForm();
  };

  const calculateNextRun = (data: typeof formData): string => {
    const now = new Date();
    const [hours, minutes] = data.time.split(':').map(Number);
    
    if (data.schedule === 'daily') {
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    
    if (data.schedule === 'weekly') {
      const next = new Date(now);
      const daysUntil = (data.dayOfWeek - now.getDay() + 7) % 7 || 7;
      next.setDate(now.getDate() + daysUntil);
      next.setHours(hours, minutes, 0, 0);
      return next.toISOString();
    }
    
    // monthly
    const next = new Date(now.getFullYear(), now.getMonth(), data.dayOfMonth, hours, minutes);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toISOString();
  };

  const toggleActive = async (id: string) => {
    const report = reports.find(r => r.id === id);
    if (!report) return;

    try {
      await api.patch(`/reports/scheduled/${id}`, { isActive: !report.isActive });
    } catch (e) {
      // Local update
    }
    setReports(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Bu zamanlanmış raporu silmek istediğinize emin misiniz?')) return;

    try {
      await api.delete(`/reports/scheduled/${id}`);
    } catch (e) {
      // Local update
    }
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const editReport = (report: ScheduledReport) => {
    setEditingReport(report);
    setFormData({
      name: report.name,
      reportType: report.reportType,
      schedule: report.schedule,
      dayOfWeek: report.dayOfWeek || 1,
      dayOfMonth: report.dayOfMonth || 1,
      time: report.time,
      recipients: report.recipients.join(', '),
    });
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      reportType: '',
      schedule: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: 1,
      time: '09:00',
      recipients: '',
    });
    setEditingReport(null);
    setShowAddModal(false);
  };

  const getScheduleText = (report: ScheduledReport) => {
    if (report.schedule === 'daily') return `Her gün ${report.time}`;
    if (report.schedule === 'weekly') return `Her ${DAYS_OF_WEEK[report.dayOfWeek || 0]} ${report.time}`;
    return `Her ayın ${report.dayOfMonth}. günü ${report.time}`;
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-purple-600" />
          Zamanlanmış Raporlar
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          Yeni Zamanlama
        </button>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Henüz zamanlanmış rapor yok</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-purple-600 hover:underline text-sm"
          >
            İlk zamanlamayı oluştur
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className={`bg-white rounded-xl border p-4 ${!report.isActive ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{report.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      report.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {report.isActive ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {REPORT_TYPES.find(t => t.id === report.reportType)?.name}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(report.id)}
                    className={`p-2 rounded-lg ${report.isActive ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                    title={report.isActive ? 'Duraklat' : 'Etkinleştir'}
                  >
                    {report.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => editReport(report)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteReport(report.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Zamanlama
                  </span>
                  <p className="font-medium">{getScheduleText(report)}</p>
                </div>
                <div>
                  <span className="text-gray-500 flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Alıcılar
                  </span>
                  <p className="font-medium">{report.recipients.length} kişi</p>
                </div>
                <div>
                  <span className="text-gray-500">Sonraki Çalışma</span>
                  <p className="font-medium">{formatDate(report.nextRun)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">
                {editingReport ? 'Zamanlamayı Düzenle' : 'Yeni Zamanlama'}
              </h3>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Zamanlama Adı</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ör: Haftalık Tahsilat Raporu"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Rapor Türü</label>
                <select
                  value={formData.reportType}
                  onChange={(e) => setFormData({ ...formData, reportType: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Seçiniz...</option>
                  {REPORT_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Periyot</label>
                <select
                  value={formData.schedule}
                  onChange={(e) => setFormData({ ...formData, schedule: e.target.value as any })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="daily">Günlük</option>
                  <option value="weekly">Haftalık</option>
                  <option value="monthly">Aylık</option>
                </select>
              </div>

              {formData.schedule === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Gün</label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => setFormData({ ...formData, dayOfWeek: Number(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <option key={idx} value={idx}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              {formData.schedule === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Ayın Günü</label>
                  <select
                    value={formData.dayOfMonth}
                    onChange={(e) => setFormData({ ...formData, dayOfMonth: Number(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Saat</label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Alıcılar (virgülle ayırın)</label>
                <input
                  type="text"
                  value={formData.recipients}
                  onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                  placeholder="email1@example.com, email2@example.com"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={saveReport}
                disabled={!formData.name || !formData.reportType || !formData.recipients}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Check className="h-4 w-4" />
                {editingReport ? 'Güncelle' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
