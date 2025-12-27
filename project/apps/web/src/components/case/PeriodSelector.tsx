"use client";

import React, { useState, useMemo } from "react";
import { Calendar, Plus, Check, X, ChevronLeft, ChevronRight } from "lucide-react";

interface Period {
  year: number;
  month: number;
  label: string;
  selected: boolean;
}

interface PeriodSelectorProps {
  type: "NAFAKA" | "KIRA";
  monthlyAmount: number;
  currency: string;
  onPeriodsSelected: (periods: { year: number; month: number; amount: number; dueDate: string; description: string }[]) => void;
  onClose: () => void;
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export function PeriodSelector({ type, monthlyAmount, currency, onPeriodsSelected, onClose }: PeriodSelectorProps) {
  const currentDate = new Date();
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [customAmount, setCustomAmount] = useState<string>(monthlyAmount.toString());
  const [paymentDay, setPaymentDay] = useState<number>(1); // Ayın kaçında ödeme yapılacak

  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
  const typeLabel = type === "NAFAKA" ? "Nafaka" : "Kira";

  // Son 24 ay + gelecek 12 ay
  const periods = useMemo(() => {
    const result: Period[] = [];
    const startDate = new Date(currentDate.getFullYear() - 2, currentDate.getMonth(), 1);
    const endDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1);
    
    let date = new Date(startDate);
    while (date <= endDate) {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      result.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
        selected: selectedPeriods.has(key),
      });
      date.setMonth(date.getMonth() + 1);
    }
    return result;
  }, [selectedPeriods]);

  // Görüntülenen yılın ayları
  const visiblePeriods = periods.filter(p => p.year === viewYear);

  const togglePeriod = (year: number, month: number) => {
    const key = `${year}-${month}`;
    const newSelected = new Set(selectedPeriods);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedPeriods(newSelected);
  };

  const selectRange = (startMonth: number, endMonth: number) => {
    const newSelected = new Set(selectedPeriods);
    for (let m = startMonth; m <= endMonth; m++) {
      newSelected.add(`${viewYear}-${m}`);
    }
    setSelectedPeriods(newSelected);
  };

  const selectAll = () => {
    const newSelected = new Set(selectedPeriods);
    visiblePeriods.forEach(p => newSelected.add(`${p.year}-${p.month}`));
    setSelectedPeriods(newSelected);
  };

  const clearAll = () => {
    const newSelected = new Set(selectedPeriods);
    visiblePeriods.forEach(p => newSelected.delete(`${p.year}-${p.month}`));
    setSelectedPeriods(newSelected);
  };

  const handleConfirm = () => {
    const amount = parseFloat(customAmount) || monthlyAmount;
    const selectedList = Array.from(selectedPeriods)
      .map(key => {
        const [year, month] = key.split("-").map(Number);
        const dueDate = new Date(year, month, paymentDay);
        return {
          year,
          month,
          amount,
          dueDate: dueDate.toISOString().split("T")[0],
          description: `${MONTH_NAMES[month]} ${year} ${typeLabel} Alacağı`,
        };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
    
    onPeriodsSelected(selectedList);
    onClose();
  };

  const totalAmount = selectedPeriods.size * (parseFloat(customAmount) || monthlyAmount);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-primary/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{typeLabel} Dönem Seçici</h2>
              <p className="text-sm text-muted-foreground">Alacak dönemlerini seçin</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Ayarlar */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Aylık Tutar ({currencySymbol})</label>
              <input
                type="number"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={monthlyAmount.toString()}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Ödeme Günü</label>
              <select
                value={paymentDay}
                onChange={e => setPaymentDay(parseInt(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                {[1, 5, 10, 15, 20, 25].map(day => (
                  <option key={day} value={day}>Ayın {day}'i</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Hızlı Seçim</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectRange(0, 5)}
                  className="flex-1 text-xs px-2 py-2 border rounded-lg hover:bg-gray-100"
                >
                  İlk 6 Ay
                </button>
                <button
                  type="button"
                  onClick={() => selectRange(6, 11)}
                  className="flex-1 text-xs px-2 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Son 6 Ay
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Yıl Navigasyonu */}
        <div className="px-6 py-3 flex items-center justify-between border-b">
          <button
            type="button"
            onClick={() => setViewYear(y => y - 1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear(y => y + 1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Ay Grid */}
        <div className="px-6 py-4">
          <div className="flex justify-between mb-3">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              Tümünü Seç
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-500 hover:underline"
            >
              Temizle
            </button>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            {visiblePeriods.map(period => {
              const key = `${period.year}-${period.month}`;
              const isSelected = selectedPeriods.has(key);
              const isPast = new Date(period.year, period.month + 1, 0) < currentDate;
              
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => togglePeriod(period.year, period.month)}
                  className={`
                    relative p-3 rounded-lg border-2 transition-all text-left
                    ${isSelected 
                      ? "border-primary bg-primary/10 text-primary" 
                      : isPast 
                        ? "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300" 
                        : "border-gray-200 hover:border-primary/50"
                    }
                  `}
                >
                  {isSelected && (
                    <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                  )}
                  <div className="font-medium text-sm">{MONTH_NAMES[period.month]}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(parseFloat(customAmount) || monthlyAmount).toLocaleString('tr-TR')} {currencySymbol}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Seçilen: </span>
            <span className="font-semibold">{selectedPeriods.size} dönem</span>
            <span className="mx-2">•</span>
            <span className="text-muted-foreground">Toplam: </span>
            <span className="font-semibold text-primary">
              {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedPeriods.size === 0}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {selectedPeriods.size} Dönem Ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
