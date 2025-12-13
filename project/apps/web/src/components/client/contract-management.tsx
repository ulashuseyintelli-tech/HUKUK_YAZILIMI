"use client";

import { useState } from "react";
import { FileText, Calendar, AlertTriangle, Plus, Edit2, Trash2, Bell, CheckCircle } from "lucide-react";

interface Contract {
  id: string;
  title: string;
  type: "VEKALET" | "HIZMET" | "DIGER";
  startDate: string;
  endDate?: string;
  status: "ACTIVE" | "EXPIRING" | "EXPIRED";
  reminderDays?: number;
  notes?: string;
}

const typeLabels: Record<string, string> = {
  VEKALET: "Vekaletname",
  HIZMET: "Hizmet Sözleşmesi",
  DIGER: "Diğer",
};

const mockContracts: Contract[] = [
  { id: "1", title: "Genel Vekaletname", type: "VEKALET", startDate: "2024-01-15", endDate: "2025-01-15", status: "EXPIRING", reminderDays: 30 },
  { id: "2", title: "Hukuki Danışmanlık Sözleşmesi", type: "HIZMET", startDate: "2024-06-01", endDate: "2025-06-01", status: "ACTIVE", reminderDays: 60 },
  { id: "3", title: "İcra Takip Vekaletnamesi", type: "VEKALET", startDate: "2023-03-10", endDate: "2024-03-10", status: "EXPIRED" },
];

interface ContractManagementProps {
  clientId?: string;
}

export function ContractManagement({ clientId }: ContractManagementProps) {
  const [contracts, setContracts] = useState<Contract[]>(mockContracts);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", type: "VEKALET", startDate: "", endDate: "", reminderDays: 30, notes: "" });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE": return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Aktif</span>;
      case "EXPIRING": return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Süresi Dolacak</span>;
      case "EXPIRED": return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Süresi Dolmuş</span>;
      default: return null;
    }
  };

  const getDaysRemaining = (endDate?: string) => {
    if (!endDate) return null;
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const handleSave = () => {
    if (!form.title || !form.startDate) return;
    
    const newContract: Contract = {
      id: editingId || Date.now().toString(),
      title: form.title,
      type: form.type as Contract["type"],
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      status: "ACTIVE",
      reminderDays: form.reminderDays,
      notes: form.notes || undefined,
    };

    if (editingId) {
      setContracts(contracts.map((c) => (c.id === editingId ? newContract : c)));
    } else {
      setContracts([...contracts, newContract]);
    }
    
    setShowForm(false);
    setEditingId(null);
    setForm({ title: "", type: "VEKALET", startDate: "", endDate: "", reminderDays: 30, notes: "" });
  };

  const handleEdit = (contract: Contract) => {
    setForm({
      title: contract.title,
      type: contract.type,
      startDate: contract.startDate,
      endDate: contract.endDate || "",
      reminderDays: contract.reminderDays || 30,
      notes: contract.notes || "",
    });
    setEditingId(contract.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Sözleşmeyi silmek istediğinize emin misiniz?")) {
      setContracts(contracts.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Sözleşme Yönetimi</h3>
        <button
          onClick={() => setShowForm(true)}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Sözleşme Ekle
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3">
          <input
            type="text"
            placeholder="Sözleşme Adı"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Hatırlatma (gün)"
              value={form.reminderDays}
              onChange={(e) => setForm({ ...form, reminderDays: parseInt(e.target.value) })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <textarea
            placeholder="Notlar"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
              {editingId ? "Güncelle" : "Kaydet"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 border rounded-lg text-sm">
              İptal
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {contracts.map((contract) => {
          const daysRemaining = getDaysRemaining(contract.endDate);
          return (
            <div key={contract.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {contract.title}
                    {getStatusBadge(contract.status)}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <span>{typeLabels[contract.type]}</span>
                    <span>•</span>
                    <Calendar className="w-3 h-3" />
                    {new Date(contract.startDate).toLocaleDateString("tr-TR")}
                    {contract.endDate && ` - ${new Date(contract.endDate).toLocaleDateString("tr-TR")}`}
                  </div>
                  {daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 60 && (
                    <div className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                      <Bell className="w-3 h-3" /> {daysRemaining} gün kaldı
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleEdit(contract)} className="p-1.5 hover:bg-gray-100 rounded">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => handleDelete(contract.id)} className="p-1.5 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
