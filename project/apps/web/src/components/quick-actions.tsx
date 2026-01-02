'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Zap, Plus, FileText, Users, Calendar, 
  ClipboardList, Search, Settings, X,
  Building2, BarChart3, Bell, Database, Loader2
} from 'lucide-react';

const QUICK_ACTIONS = [
  { id: 'newCase', label: 'Yeni Takip', icon: Plus, href: '/cases/new?new=true', color: 'bg-blue-500' },
  { id: 'cases', label: 'Takipler', icon: FileText, href: '/cases', color: 'bg-indigo-500' },
  { id: 'clients', label: 'Müvekkiller', icon: Building2, href: '/settings/clients', color: 'bg-green-500' },
  { id: 'debtors', label: 'Borçlular', icon: Users, href: '/debtors', color: 'bg-orange-500' },
  { id: 'calendar', label: 'Takvim', icon: Calendar, href: '/calendar', color: 'bg-purple-500' },
  { id: 'tasks', label: 'Görevler', icon: ClipboardList, href: '/tasks', color: 'bg-yellow-500' },
  { id: 'reports', label: 'Raporlar', icon: BarChart3, href: '/reports', color: 'bg-pink-500' },
  { id: 'notifications', label: 'Bildirimler', icon: Bell, href: '/notifications', color: 'bg-red-500' },
  { id: 'settings', label: 'Ayarlar', icon: Settings, href: '/settings/office', color: 'bg-gray-500' },
  { id: 'seed', label: 'Örnek Veri', icon: Database, href: '#seed', color: 'bg-emerald-500', isAction: true },
];

export function QuickActions() {
  const [isOpen, setIsOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<any>(null);
  const router = useRouter();

  const handleSeedData = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      
      // Önce seed işlemi
      const res = await fetch('http://localhost:8080/api/seed/all', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      
      // Sonra mevcut verileri düzelt
      await fetch('http://localhost:8080/api/seed/fix-clients', { method: 'POST', headers });
      await fetch('http://localhost:8080/api/seed/fix-lawyers', { method: 'POST', headers });
      
      setSeedResult(data);
      setTimeout(() => {
        setSeedResult(null);
        setIsOpen(false);
        window.location.reload();
      }, 2000);
    } catch (e) {
      setSeedResult({ success: false, message: 'Hata oluştu' });
    } finally {
      setSeeding(false);
    }
  };

  const handleAction = (action: any) => {
    if (action.isAction && action.id === 'seed') {
      handleSeedData();
      return;
    }
    setIsOpen(false);
    router.push(action.href);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center transition-transform hover:scale-110"
        title="Hızlı İşlemler"
      >
        <Zap className="h-6 w-6" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-600" /> Hızlı İşlemler
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-3">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleAction(action)}
                  disabled={seeding && action.id === 'seed'}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center text-white`}>
                    {seeding && action.id === 'seed' ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <action.icon className="h-6 w-6" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
            {seedResult && (
              <div className={`mx-4 mb-4 p-3 rounded-lg text-sm ${seedResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {seedResult.success ? '✅ Örnek veriler oluşturuldu!' : '❌ ' + seedResult.message}
              </div>
            )}
            <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
              <p className="text-xs text-center text-gray-500">
                Klavye kısayolları için <kbd className="px-1 bg-gray-200 rounded">/</kbd> tuşuna basın
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
