'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Zap, Plus, FileText, Users, Calendar, 
  ClipboardList, Settings, X,
  Building2, BarChart3, Bell, Database, Loader2, GripVertical
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

  // Draggable FAB state
  const [position, setPosition] = useState({ x: 24, y: 24 }); // right: 24px, bottom: 24px
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load saved position from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fab-position');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPosition(parsed);
      } catch {}
    }
  }, []);

  // Save position to localStorage
  const savePosition = (pos: { x: number; y: number }) => {
    localStorage.setItem('fab-position', JSON.stringify(pos));
  };

  // Mouse/Touch handlers for dragging
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const deltaX = dragRef.current.startX - clientX;
      const deltaY = dragRef.current.startY - clientY;
      
      const newX = Math.max(8, Math.min(window.innerWidth - 64, dragRef.current.startPosX + deltaX));
      const newY = Math.max(8, Math.min(window.innerHeight - 64, dragRef.current.startPosY + deltaY));
      
      setPosition({ x: newX, y: newY });
    };

    const handleEnd = () => {
      setIsDragging(false);
      savePosition(position);
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, position]);

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
      {/* Floating Action Button - Draggable */}
      <div
        ref={buttonRef as any}
        className="fixed z-[9999] flex items-center gap-1"
        style={{ 
          right: `${position.x}px`, 
          bottom: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Drag Handle */}
        <button
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className={`w-6 h-14 bg-gray-400/80 hover:bg-gray-500 text-white rounded-l-full flex items-center justify-center transition-all ${isDragging ? 'bg-gray-600' : ''}`}
          title="Sürükle"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {/* Main Button */}
        <button
          onClick={() => !isDragging && setIsOpen(true)}
          className="w-14 h-14 bg-blue-600 text-white rounded-r-full shadow-xl hover:bg-blue-700 flex items-center justify-center transition-all hover:scale-105 hover:shadow-2xl"
          title="Hızlı İşlemler"
        >
          <Zap className="h-6 w-6" />
        </button>
      </div>

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
