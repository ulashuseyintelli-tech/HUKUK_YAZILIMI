'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Gavel, FileText, Bell, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  type: 'hearing' | 'task' | 'reminder' | 'meeting';
  date: string;
  time?: string;
  caseId?: string;
  caseNumber?: string;
  location?: string;
  completed: boolean;
}

interface LawyerCalendarProps {
  lawyerId?: string;
}

export function LawyerCalendar({ lawyerId }: LawyerCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'list'>('week');

  useEffect(() => { loadEvents(); }, [currentDate, lawyerId]);

  const loadEvents = () => {
    const today = new Date();
    setEvents([
      { id: '1', title: 'Duruşma - Dosya 2024/1001', type: 'hearing', date: today.toISOString().split('T')[0], time: '10:00', caseNumber: '2024/1001', location: 'İstanbul 5. İcra Mahkemesi', completed: false },
      { id: '2', title: 'Haciz talebi hazırla', type: 'task', date: today.toISOString().split('T')[0], caseNumber: '2024/1002', completed: false },
      { id: '3', title: 'Müvekkil toplantısı', type: 'meeting', date: new Date(today.getTime() + 86400000).toISOString().split('T')[0], time: '14:00', completed: false },
      { id: '4', title: 'Vekalet yenileme hatırlatması', type: 'reminder', date: new Date(today.getTime() + 172800000).toISOString().split('T')[0], completed: false },
      { id: '5', title: 'Duruşma - Dosya 2024/1005', type: 'hearing', date: new Date(today.getTime() + 259200000).toISOString().split('T')[0], time: '11:30', caseNumber: '2024/1005', location: 'Ankara 3. İcra Mahkemesi', completed: false },
    ]);
  };

  const getTypeIcon = (type: CalendarEvent['type']) => {
    if (type === 'hearing') return <Gavel className="h-4 w-4" />;
    if (type === 'task') return <FileText className="h-4 w-4" />;
    if (type === 'reminder') return <Bell className="h-4 w-4" />;
    return <Calendar className="h-4 w-4" />;
  };

  const getTypeColor = (type: CalendarEvent['type']) => {
    if (type === 'hearing') return 'bg-red-100 text-red-700 border-red-300';
    if (type === 'task') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (type === 'reminder') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-purple-100 text-purple-700 border-purple-300';
  };

  const toggleComplete = (id: string) => setEvents(events.map(e => e.id === id ? { ...e, completed: !e.completed } : e));

  const navigateWeek = (dir: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (dir * 7));
    setCurrentDate(newDate);
  };

  const getWeekDays = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay() + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const weekDays = getWeekDays();
  const todayStr = new Date().toISOString().split('T')[0];

  const upcomingEvents = events.filter(e => !e.completed && new Date(e.date) >= new Date(todayStr)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Calendar className="h-5 w-5" />Avukat Takvimi</h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['week', 'list'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                {v === 'week' ? 'Hafta' : 'Liste'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'week' && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => navigateWeek(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="h-5 w-5" /></button>
            <span className="font-medium">{weekDays[0].toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => navigateWeek(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="h-5 w-5" /></button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
              <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>
            ))}
            {weekDays.map((day) => {
              const dateStr = day.toISOString().split('T')[0];
              const dayEvents = events.filter(e => e.date === dateStr);
              const isToday = dateStr === todayStr;
              return (
                <div key={dateStr} className={`min-h-[100px] border rounded-lg p-1 ${isToday ? 'bg-blue-50 border-blue-300' : ''}`}>
                  <div className={`text-center text-sm mb-1 ${isToday ? 'font-bold text-blue-600' : ''}`}>{day.getDate()}</div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div key={e.id} className={`text-xs p-1 rounded truncate border ${getTypeColor(e.type)} ${e.completed ? 'opacity-50 line-through' : ''}`} title={e.title}>
                        {e.time && <span className="font-medium">{e.time} </span>}
                        {e.title.substring(0, 15)}
                      </div>
                    ))}
                    {dayEvents.length > 3 && <div className="text-xs text-gray-400 text-center">+{dayEvents.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === 'list' && (
        <div className="space-y-2">
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Yaklaşan etkinlik yok</div>
          ) : (
            upcomingEvents.map((event) => (
              <div key={event.id} className={`flex items-center gap-3 p-3 border rounded-lg ${event.completed ? 'opacity-50' : ''}`}>
                <button onClick={() => toggleComplete(event.id)} className={`p-2 rounded-full ${getTypeColor(event.type)}`}>{getTypeIcon(event.type)}</button>
                <div className="flex-1">
                  <p className={`font-medium ${event.completed ? 'line-through' : ''}`}>{event.title}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span><Calendar className="h-3 w-3 inline mr-1" />{new Date(event.date).toLocaleDateString('tr-TR')}</span>
                    {event.time && <span><Clock className="h-3 w-3 inline mr-1" />{event.time}</span>}
                    {event.location && <span>{event.location}</span>}
                  </div>
                </div>
                {event.caseNumber && <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{event.caseNumber}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-red-50 rounded-lg p-2"><p className="text-lg font-bold text-red-600">{events.filter(e => e.type === 'hearing' && !e.completed).length}</p><p className="text-xs text-gray-500">Duruşma</p></div>
        <div className="bg-blue-50 rounded-lg p-2"><p className="text-lg font-bold text-blue-600">{events.filter(e => e.type === 'task' && !e.completed).length}</p><p className="text-xs text-gray-500">Görev</p></div>
        <div className="bg-yellow-50 rounded-lg p-2"><p className="text-lg font-bold text-yellow-600">{events.filter(e => e.type === 'reminder' && !e.completed).length}</p><p className="text-xs text-gray-500">Hatırlatıcı</p></div>
        <div className="bg-green-50 rounded-lg p-2"><p className="text-lg font-bold text-green-600">{events.filter(e => e.completed).length}</p><p className="text-xs text-gray-500">Tamamlanan</p></div>
      </div>
    </div>
  );
}
