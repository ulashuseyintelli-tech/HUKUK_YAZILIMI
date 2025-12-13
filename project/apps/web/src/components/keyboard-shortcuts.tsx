'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Command } from 'lucide-react';

const SHORTCUTS = [
  { key: 'k', ctrl: true, description: 'Arama', action: 'search' },
  { key: 'n', ctrl: true, description: 'Yeni Takip', action: 'newCase' },
  { key: 'd', ctrl: true, description: 'Dashboard', action: 'dashboard' },
  { key: 't', ctrl: true, description: 'Takvim', action: 'calendar' },
  { key: 'r', ctrl: true, description: 'Raporlar', action: 'reports' },
  { key: '/', ctrl: false, description: 'Kısayolları Göster', action: 'help' },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl+K - Search
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
        searchInput?.focus();
      }

      // Ctrl+N - New Case
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        router.push('/cases/new');
      }

      // Ctrl+D - Dashboard
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        router.push('/dashboard');
      }

      // Ctrl+T - Calendar
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        router.push('/calendar');
      }

      // Ctrl+R - Reports
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        router.push('/reports');
      }

      // / - Show help
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowHelp(true);
      }

      // Escape - Close help
      if (e.key === 'Escape') {
        setShowHelp(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Command className="h-5 w-5" /> Klavye Kısayolları
          </h3>
          <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.key} className="flex items-center justify-between py-2">
              <span className="text-sm">{shortcut.description}</span>
              <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                {shortcut.ctrl ? 'Ctrl + ' : ''}{shortcut.key.toUpperCase()}
              </kbd>
            </div>
          ))}
        </div>
        <div className="p-4 border-t bg-gray-50 text-center">
          <p className="text-xs text-gray-500">ESC tuşu ile kapatın</p>
        </div>
      </div>
    </div>
  );
}
