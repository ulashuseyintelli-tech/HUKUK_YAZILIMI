/**
 * CHARACTERIZATION TEST — payment-allocation.service.ts (TBK 100)
 *
 * Amaç: Bu servisin BUGÜNKÜ sayısal davranışını (IEEE-754 float artefaktları dahil) kilitlemek.
 * Bu testler "doğru" değeri değil, "şu an üretilen" değeri sabitler.
 *
 * Money Faz 1 (PR-1) safety-net'i: PR-2'de minor-unit/bigint refactor yapıldığında
 * bilinçli düzeltmeler bu testleri KIRACAK — bu beklenen ve faydalı sinyaldir.
 *
 * Kapsam notu: generateAllocationBreakdown test EDİLMEZ (Intl/toLocaleDateString
 * locale/timezone bağımlı). Yalnız sayısal allocatePayment / allocateMultiplePayments.
 *
 * Kurallar: snapshot yok, tam obje literal toEqual, gerçek production label'ları.
 * Değerler gerçek servis çıktısından yakalanmıştır.
 */

import { PaymentAllocationService } from '../payment-allocation.service';
import { Payment, DebtState } from '../types';

describe('PaymentAllocationService characterization (bugünkü davranış kilidi)', () => {
  const svc = new PaymentAllocationService();

  const pay = (id: string, date: string, amount: number): Payment => ({
    id,
    date,
    amount,
    currency: 'TRY',
  });

  describe('allocatePayment — TBK 100 sırası: faiz → masraf → fer\'i → anapara', () => {
    const debt: DebtState = {
      principal: 100000,
      accruedInterest: 5000,
      costs: 1000,
      ancillaries: 500,
    };

    it('PA1: exact 106500 → tüm kategoriler kapanır, kalan 0, newPrincipal 0', () => {
      expect(svc.allocatePayment(pay('p1', '2025-03-01', 106500), debt)).toEqual({
        paymentId: 'p1',
        paymentDate: '2025-03-01',
        paymentAmount: 106500,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 5000, amountAllocated: 5000, amountAfter: 0 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 1000, amountAllocated: 1000, amountAfter: 0 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 500, amountAllocated: 500, amountAfter: 0 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 100000, amountAllocated: 100000, amountAfter: 0 },
        ],
        remainingPayment: 0,
        newPrincipal: 0,
      });
    });

    it('PA2: partial 3000 → yalnız faize kısmi (kalan faiz 2000), newPrincipal 100000', () => {
      expect(svc.allocatePayment(pay('p2', '2025-03-01', 3000), debt)).toEqual({
        paymentId: 'p2',
        paymentDate: '2025-03-01',
        paymentAmount: 3000,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 5000, amountAllocated: 3000, amountAfter: 2000 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 1000, amountAllocated: 0, amountAfter: 1000 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 500, amountAllocated: 0, amountAfter: 500 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 100000, amountAllocated: 0, amountAfter: 100000 },
        ],
        remainingPayment: 0,
        newPrincipal: 100000,
      });
    });

    it('PA3: overpay 120000 → hepsi kapanır, kalan ödeme 13500, newPrincipal 0', () => {
      expect(svc.allocatePayment(pay('p3', '2025-03-01', 120000), debt)).toEqual({
        paymentId: 'p3',
        paymentDate: '2025-03-01',
        paymentAmount: 120000,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 5000, amountAllocated: 5000, amountAfter: 0 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 1000, amountAllocated: 1000, amountAfter: 0 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 500, amountAllocated: 500, amountAfter: 0 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 100000, amountAllocated: 100000, amountAfter: 0 },
        ],
        remainingPayment: 13500,
        newPrincipal: 0,
      });
    });

    it('PA4: mid 6500 → faiz+masraf+fer\'i kapanır, anaparaya 0, newPrincipal 100000', () => {
      expect(svc.allocatePayment(pay('p4', '2025-03-01', 6500), debt)).toEqual({
        paymentId: 'p4',
        paymentDate: '2025-03-01',
        paymentAmount: 6500,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 5000, amountAllocated: 5000, amountAfter: 0 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 1000, amountAllocated: 1000, amountAfter: 0 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 500, amountAllocated: 500, amountAfter: 0 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 100000, amountAllocated: 0, amountAfter: 100000 },
        ],
        remainingPayment: 0,
        newPrincipal: 100000,
      });
    });

    /**
     * PA5: yarım kuruş borç + IEEE-754 float artefaktı.
     * remainingPayment 234.54700000000003 bugünkü gerçek float davranışıdır (bilinçli kilit).
     * Ayrıca: running-remaining HAM değil YUVARLANMIŞ amountAllocated ile azalıyor
     * (faiz 0.005 → 0.01 olarak düşülüyor). PR-2 minor-unit'te bu temizlenecek → kırılması beklenen sinyal.
     */
    it('PA5: half-kuruş borç → float artefaktı remainingPayment 234.54700000000003 [bilinçli kilit]', () => {
      const halfKurusDebt: DebtState = {
        principal: 1000.005,
        accruedInterest: 0.005,
        costs: 0,
        ancillaries: 0,
      };
      expect(svc.allocatePayment(pay('p5', '2025-03-01', 1234.567), halfKurusDebt)).toEqual({
        paymentId: 'p5',
        paymentDate: '2025-03-01',
        paymentAmount: 1234.567,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 0.01, amountAllocated: 0.01, amountAfter: 0 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 0, amountAllocated: 0, amountAfter: 0 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 0, amountAllocated: 0, amountAfter: 0 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 1000.01, amountAllocated: 1000.01, amountAfter: 0 },
        ],
        remainingPayment: 234.54700000000003,
        newPrincipal: 0,
      });
    });
  });

  describe('allocateMultiplePayments — tarih sıralaması + ödemeler arası faiz', () => {
    it('MP: karışık tarih girişi p1 önce işlenir; sabit stub faiz ile state geçişi', () => {
      const initial: DebtState = {
        principal: 50000,
        accruedInterest: 1000,
        costs: 500,
        ancillaries: 0,
      };
      // Deterministik stub: her gap için sabit 1000 faiz
      const interestCalculator = (_principal: number, _from: string, _to: string): number => 1000;

      // Kasıtlı KARIŞIK sıra: p2 (Mart) önce verildi, p1 (Şubat) sonra
      const payments: Payment[] = [pay('p2', '2025-03-01', 5000), pay('p1', '2025-02-01', 2000)];

      const results = svc.allocateMultiplePayments(payments, initial, interestCalculator);

      expect(results).toHaveLength(2);

      // MP[0]: p1 önce (tarih sıralaması)
      expect(results[0]).toEqual({
        paymentId: 'p1',
        paymentDate: '2025-02-01',
        paymentAmount: 2000,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 1000, amountAllocated: 1000, amountAfter: 0 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 500, amountAllocated: 500, amountAfter: 0 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 0, amountAllocated: 0, amountAfter: 0 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 50000, amountAllocated: 500, amountAfter: 49500 },
        ],
        remainingPayment: 0,
        newPrincipal: 49500,
      });

      // MP[1]: p2, gap'te +1000 faiz eklenir
      expect(results[1]).toEqual({
        paymentId: 'p2',
        paymentDate: '2025-03-01',
        paymentAmount: 5000,
        allocations: [
          { category: 'INTEREST', label: 'İşlemiş Faiz', amountBefore: 1000, amountAllocated: 1000, amountAfter: 0 },
          { category: 'COSTS', label: 'Masraflar', amountBefore: 0, amountAllocated: 0, amountAfter: 0 },
          { category: 'ANCILLARY', label: "Fer'i Alacaklar", amountBefore: 0, amountAllocated: 0, amountAfter: 0 },
          { category: 'PRINCIPAL', label: 'Anapara', amountBefore: 49500, amountAllocated: 4000, amountAfter: 45500 },
        ],
        remainingPayment: 0,
        newPrincipal: 45500,
      });
    });
  });
});
