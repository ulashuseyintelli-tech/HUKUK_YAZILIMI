"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, FileText, Plus, X } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  type: string; // DURUSMA, HATIRLATICI, GOREV, DIGER
  caseId?: string;
  caseFileNumber?: string;
  location?: string;
  isCompleted?: boolean;
}

const EVENT_TYPES = [
  { value: "DURUSMA", label: "Duruşma", color: "bg-red-500" },
  { value: "HATIRLATICI", label: "Hatırlatıcı", color: "bg-yellow-500" },
  { value: "GOREV", label: "Görev", color: "bg-blue-500" },
  { value: "DIGER", label: "Diğer", color: "bg-gray-500" },
];

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", date: "", time: "", type: "HATIRLATICI", location: "" });
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const res = await api.get(`/calendar/events?year=${year}&month=${month}`);
      setEvents(res.data || res || []);
    } catch (e) {
      console.error(e);
      // Mock data for demo
      setEvents([
        { id: "1", title: "Duruşma - 2024/1234", date: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-15`, time: "10:00", type: "DURUSMA", location: "İstanbul 5. İcra Mahkemesi" },
        { id: "2", title: "Vekalet yenileme hatırlatıcısı", date: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-20`, type: "HATIRLATICI" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = (firstDay.getDay() + 6) % 7; // Monday = 0
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentDate);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getEventsForDay = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter(e => e.date === dateStr);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth() && today.getDate() === day;
  };

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.date) return;
    try {
      await api.post("/calendar/events", newEvent);
      setShowAddModal(false);
      setNewEvent({ title: "", description: "", date: "", time: "", type: "HATIRLATICI", location: "" });
      fetchEvents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Bu etkinliği silmek istediğinize emin misiniz?")) return;
    try {
      await api.delete(`/calendar/events/${id}`);
      fetchEvents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setNewEvent({
      title: event.title,
      description: event.description || "",
      date: event.date,
      time: event.time || "",
      type: event.type,
      location: event.location || "",
    });
    setShowAddModal(true);
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent || !newEvent.title || !newEvent.date) return;
    try {
      await api.put(`/calendar/events/${editingEvent.id}`, newEvent);
      setShowAddModal(false);
      setEditingEvent(null);
      setNewEvent({ title: "", description: "", date: "", time: "", type: "HATIRLATICI", location: "" });
      fetchEvents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleComplete = async (event: CalendarEvent) => {
    try {
      await api.put(`/calendar/events/${event.id}`, { ...event, isCompleted: !event.isCompleted });
      fetchEvents();
    } catch (e) {
      console.error(e);
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingEvent(null);
    setNewEvent({ title: "", description: "", date: "", time: "", type: "HATIRLATICI", location: "" });
  };

  const selectedDateEvents = selectedDate ? getEventsForDay(selectedDate.getDate()) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-blue-600" />
          <h1 className="text-xl font-semibold">Takvim</h1>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Etkinlik Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Takvim */}
        <div className="lg:col-span-2 bg-white rounded-lg border p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="h-5 w-5" /></button>
              <h2 className="text-lg font-semibold">{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <button onClick={goToToday} className="text-sm text-blue-600 hover:underline">Bugün</button>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map(day => <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">{day}</div>)}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startingDay }).map((_, i) => <div key={`empty-${i}`} className="h-24" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDay(day);
              const isSelected = selectedDate?.getDate() === day && selectedDate?.getMonth() === currentDate.getMonth();
              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                  className={`h-24 border rounded-lg p-1 cursor-pointer hover:bg-gray-50 ${isToday(day) ? "bg-blue-50 border-blue-300" : ""} ${isSelected ? "ring-2 ring-blue-500" : ""}`}
                >
                  <div className={`text-sm font-medium ${isToday(day) ? "text-blue-600" : ""}`}>{day}</div>
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map(event => (
                      <div key={event.id} className={`text-xs px-1 py-0.5 rounded truncate text-white ${EVENT_TYPES.find(t => t.value === event.type)?.color || "bg-gray-500"}`}>
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && <div className="text-xs text-gray-500">+{dayEvents.length - 2} daha</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Seçili Gün Detayları */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4">
            {selectedDate ? `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}` : "Bir gün seçin"}
          </h3>
          {selectedDate ? (
            selectedDateEvents.length === 0 ? (
              <p className="text-gray-500 text-sm">Bu günde etkinlik yok</p>
            ) : (
              <div className="space-y-3">
                {selectedDateEvents.map(event => (
                  <div key={event.id} className={`border rounded-lg p-3 ${event.isCompleted ? "bg-gray-50 opacity-60" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleComplete(event)} className={`w-4 h-4 rounded border-2 flex items-center justify-center ${event.isCompleted ? "bg-green-500 border-green-500 text-white" : "border-gray-300"}`}>
                          {event.isCompleted && "✓"}
                        </button>
                        <div className={`w-3 h-3 rounded-full ${EVENT_TYPES.find(t => t.value === event.type)?.color}`} />
                        <span className={`font-medium text-sm ${event.isCompleted ? "line-through text-gray-500" : ""}`}>{event.title}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEditEvent(event)} className="text-gray-400 hover:text-blue-500 p-1">✎</button>
                        <button onClick={() => handleDeleteEvent(event.id)} className="text-gray-400 hover:text-red-500 p-1"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {event.time && <div className="flex items-center gap-1 text-xs text-gray-500 mt-2 ml-6"><Clock className="h-3 w-3" /> {event.time}</div>}
                    {event.location && <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 ml-6"><MapPin className="h-3 w-3" /> {event.location}</div>}
                    {event.caseFileNumber && <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 ml-6"><FileText className="h-3 w-3" /> {event.caseFileNumber}</div>}
                    {event.description && <p className="text-xs text-gray-600 mt-2 ml-6">{event.description}</p>}
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-gray-500 text-sm">Detayları görmek için takvimden bir gün seçin</p>
          )}
        </div>
      </div>

      {/* Yaklaşan Etkinlikler */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-4">Yaklaşan Etkinlikler</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {events.filter(e => new Date(e.date) >= new Date()).slice(0, 6).map(event => (
            <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg">
              <div className={`w-2 h-full min-h-[40px] rounded-full ${EVENT_TYPES.find(t => t.value === event.type)?.color}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{event.title}</p>
                <p className="text-xs text-gray-500">{new Date(event.date).toLocaleDateString("tr-TR")} {event.time && `- ${event.time}`}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Etkinlik Ekleme/Düzenleme Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editingEvent ? "Etkinliği Düzenle" : "Yeni Etkinlik"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Başlık *</label>
                <input type="text" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tarih *</label>
                  <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Saat</label>
                  <input type="time" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tür</label>
                <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Konum</label>
                <input type="text" value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Mahkeme, adres vb." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <textarea value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">İptal</button>
              <button 
                onClick={editingEvent ? handleUpdateEvent : handleAddEvent} 
                disabled={!newEvent.title || !newEvent.date} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editingEvent ? "Güncelle" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
