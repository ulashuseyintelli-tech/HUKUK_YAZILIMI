'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Zap, Plus, FileText, Users, Calendar, 
  ClipboardList, Search, Settings, X,
  Building2, BarChart3, Bell
} from 'lucide-react';

const QUICK_ACTIONS = [
  { id: 'newCase', label: 'Yeni Takip', icon: Plus, href: '/cases/new', color: 'bg-blue-500' },
  { id: 'cases', label: 'Takipler', icon: FileText, href: '/cases', color: 'bg-indigo-500' },
  { id: 'clients', label: 'Müvekkiller', icon: Building2, href: '/settings/clients', color: 'bg-green-500' },
  { id: 'debtors', label: 'Borçlular', icon: Users, href: '/debtors', color: 'bg-orange-500' },
  { id: 'calendar', label: 'Takvim', icon: Calendar, href: '/calendar', color: 'bg-purple-500' },
  { id: 'tasks', label: 'Görevler', icon: ClipboardList, href: '/tasks', color: 'bg-yellow-500' },
  { id: 'reports', label: 'Raporlar', icon: BarChart3, href: '/reports', color: 'bg-pink-500' },
  { id: 'notifications', label: 'Bildirimler', icon: Bell, href: '/notifications', color: 'bg-red-500' },
  { id: 'settings', label: 'Ayarlar', icon: Settings, href: '/settings/office', color: 'bg-gray-500' },
];

export function QuickActions() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleAction = (href: string) => {
    setIsOpen(false);
    router.push(href);
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
                  onClick={() => handleAction(action.href)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center text-white`}>
                    <action.icon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
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
