'use client';

import { useState } from 'react';
import { LayoutGrid, Plus, Check, Eye, Star, Search, BarChart3, PieChart, TrendingUp, Calendar, Bell, FileText, Users, DollarSign } from 'lucide-react';

interface Widget {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  isInstalled: boolean;
  isPopular: boolean;
  preview?: string;
}

const CATEGORIES = ['Tümü', 'İstatistik', 'Grafik', 'Liste', 'Bildirim'];

export function WidgetStore() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tümü');
  const [preview, setPreview] = useState<Widget | null>(null);

  const [widgets, setWidgets] = useState<Widget[]>([
    { id: '1', name: 'İstatistik Kartları', description: 'Temel dosya ve tahsilat istatistikleri', category: 'İstatistik', icon: <BarChart3 className="h-6 w-6" />, isInstalled: true, isPopular: true },
    { id: '2', name: 'Tahsilat Grafiği', description: 'Aylık tahsilat trend grafiği', category: 'Grafik', icon: <TrendingUp className="h-6 w-6" />, isInstalled: true, isPopular: true },
    { id: '3', name: 'Durum Dağılımı', description: 'Dosya durumlarının pasta grafiği', category: 'Grafik', icon: <PieChart className="h-6 w-6" />, isInstalled: true, isPopular: false },
    { id: '4', name: 'Yaklaşan Etkinlikler', description: 'Takvimden yaklaşan etkinlikler', category: 'Liste', icon: <Calendar className="h-6 w-6" />, isInstalled: true, isPopular: true },
    { id: '5', name: 'Son Aktiviteler', description: 'Son yapılan işlemler listesi', category: 'Liste', icon: <FileText className="h-6 w-6" />, isInstalled: false, isPopular: false },
    { id: '6', name: 'Bildirim Merkezi', description: 'Okunmamış bildirimler', category: 'Bildirim', icon: <Bell className="h-6 w-6" />, isInstalled: false, isPopular: true },
    { id: '7', name: 'Tahsilat Hedefi', description: 'Aylık/yıllık hedef takibi', category: 'İstatistik', icon: <DollarSign className="h-6 w-6" />, isInstalled: false, isPopular: true },
    { id: '8', name: 'Avukat Performansı', description: 'Avukat bazlı performans özeti', category: 'İstatistik', icon: <Users className="h-6 w-6" />, isInstalled: false, isPopular: false },
    { id: '9', name: 'Risk Dağılımı', description: 'Dosya risk seviyesi dağılımı', category: 'Grafik', icon: <PieChart className="h-6 w-6" />, isInstalled: false, isPopular: false },
    { id: '10', name: 'Vekalet Uyarıları', description: 'Süresi dolacak vekaletler', category: 'Bildirim', icon: <Bell className="h-6 w-6" />, isInstalled: true, isPopular: false },
  ]);

  const toggleInstall = (id: string) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, isInstalled: !w.isInstalled } : w));
  };

  const filtered = widgets
    .filter(w => category === 'Tümü' || w.category === category)
    .filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || w.description.toLowerCase().includes(search.toLowerCase()));

  const installedCount = widgets.filter(w => w.isInstalled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><LayoutGrid className="h-5 w-5" />Widget Mağazası</h3>
        <span className="text-sm text-gray-500">{installedCount} / {widgets.length} yüklü</span>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Widget ara..." className="w-full pl-10 pr-4 py-2 border rounded-lg" />
        </div>
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)} className={`px-3 py-1.5 rounded-lg text-sm ${category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((widget) => (
          <div key={widget.id} className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow ${widget.isInstalled ? 'border-green-300' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`p-3 rounded-xl ${widget.isInstalled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                {widget.icon}
              </div>
              <div className="flex items-center gap-1">
                {widget.isPopular && <Star className="h-4 w-4 text-yellow-500 fill-current" />}
                {widget.isInstalled && <Check className="h-4 w-4 text-green-500" />}
              </div>
            </div>
            <h4 className="font-medium mb-1">{widget.name}</h4>
            <p className="text-sm text-gray-500 mb-3">{widget.description}</p>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{widget.category}</span>
              <div className="flex-1" />
              <button onClick={() => setPreview(widget)} className="p-1.5 border rounded-lg hover:bg-gray-50"><Eye className="h-4 w-4 text-gray-500" /></button>
              <button onClick={() => toggleInstall(widget.id)} className={`px-3 py-1.5 rounded-lg text-sm ${widget.isInstalled ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                {widget.isInstalled ? 'Kaldır' : 'Ekle'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-xl text-blue-600">{preview.icon}</div>
              <div>
                <h3 className="font-semibold text-lg">{preview.name}</h3>
                <p className="text-sm text-gray-500">{preview.category}</p>
              </div>
            </div>
            <p className="text-gray-600 mb-4">{preview.description}</p>
            <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center text-gray-400 mb-4">
              <span>Widget Önizleme</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Kapat</button>
              <button onClick={() => { toggleInstall(preview.id); setPreview(null); }} className={`px-4 py-2 rounded-lg ${preview.isInstalled ? 'bg-red-100 text-red-600' : 'bg-blue-600 text-white'}`}>
                {preview.isInstalled ? 'Kaldır' : 'Dashboard\'a Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
