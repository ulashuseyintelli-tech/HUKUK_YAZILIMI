/**
 * Meşe (UYAP) ile Faiz Hesaplama Karşılaştırması
 * 
 * Test Case 1 (Meşe karşılaştırma):
 * - Çek tutarı: 100.000 TL
 * - İbraz tarihi: 05.10.2025
 * - Hesap tarihi: 05.01.2026
 * - Gün sayısı: 92 gün
 * 
 * Test Case 2 (ASMMMO doğrulamalı):
 * - Anapara: 100.000 TL
 * - Başlangıç: 05.10.2025
 * - Bitiş: 06.01.2026
 * - Beklenen: ~10.647,26 TL
 * 
 * TCMB Avans Oranları (2025 Q4 - ASMMMO doğrulamalı):
 * - 17.09.2025 → 19.12.2025: %42,25
 * - 20.12.2025 → devam: %39,75
 */

describe('Meşe Karşılaştırma Testi', () => {
  const principal = 100_000;
  const ibrazTarihi = '2025-10-05';
  const hesapTarihi = '2026-01-05';

  // Meşe'nin kullandığı oranlar (ekran görüntüsünden çıkarılan)
  const meseRates = [
    { validFrom: '2025-10-05', rate: 0.4425 }, // %44,25 (01.01.2026'ya kadar)
    { validFrom: '2026-01-01', rate: 0.3975 }, // %39,75 (01.01.2026'dan itibaren)
  ];

  // TCMB resmi oranları (VergiNet/ASMMMO doğrulamalı - 2025)
  // Kritik tarihler: 28.12.2024, 08.03.2025, 17.09.2025, 20.12.2025
  const tcmbRates = [
    { validFrom: '2024-12-28', rate: 0.4925 }, // %49,25 (28.12.2024'ten itibaren)
    { validFrom: '2025-03-08', rate: 0.4425 }, // %44,25 (08.03.2025'ten itibaren)
    { validFrom: '2025-09-17', rate: 0.4225 }, // %42,25 (17.09.2025'ten itibaren)
    { validFrom: '2025-12-20', rate: 0.3975 }, // %39,75 (20.12.2025'ten itibaren)
  ];

  function calculateDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Segmentli faiz hesaplama
   * Aralık semantiği: [start, end) - başlangıç dahil, bitiş hariç
   */
  function calculateSegmentedInterest(
    rates: { validFrom: string; rate: number }[],
    startDate: string,
    endDate: string
  ): { segments: any[]; total: number } {
    const segments: any[] = [];
    let totalInterest = 0;

    // Oranları tarihe göre sırala
    const sortedRates = [...rates].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    
    for (let i = 0; i < sortedRates.length; i++) {
      const currentRate = sortedRates[i];
      const nextRate = sortedRates[i + 1];
      
      const rateStart = currentRate.validFrom;
      const rateEnd = nextRate ? nextRate.validFrom : '2099-12-31';
      
      // Bu oran dönemi hesaplama aralığıyla kesişiyor mu?
      if (endDate <= rateStart || startDate >= rateEnd) continue;
      
      // Kesişim aralığını bul [segmentStart, segmentEnd)
      const segmentStart = startDate > rateStart ? startDate : rateStart;
      const segmentEnd = endDate < rateEnd ? endDate : rateEnd;
      
      const days = calculateDays(segmentStart, segmentEnd);
      if (days <= 0) continue;
      
      const interest = (principal * currentRate.rate * days) / 365;
      
      segments.push({
        periodStart: segmentStart,
        periodEnd: segmentEnd,
        days,
        rate: currentRate.rate,
        interest: Math.round(interest * 100) / 100,
      });
      
      console.log(
        `${segmentStart} → ${segmentEnd}: ${days} gün × %${(currentRate.rate * 100).toFixed(2)} = ${interest.toFixed(2)} TL`
      );
      
      totalInterest += interest;
    }

    return { segments, total: Math.round(totalInterest * 100) / 100 };
  }

  it('should match Meşe calculation with Meşe rates', () => {
    console.log('\n=== MEŞE HESAPLAMASI (Meşe oranları ile) ===');
    const result = calculateSegmentedInterest(meseRates, ibrazTarihi, hesapTarihi);
    console.log(`Toplam: ${result.total.toFixed(2)} TL`);
    console.log(`Segment sayısı: ${result.segments.length}`);
    
    const meseResult = 11_104.11;
    console.log(`Meşe ekran: ${meseResult} TL`);
    console.log(`Fark: ${Math.abs(meseResult - result.total).toFixed(2)} TL`);
    
    // Meşe'nin hesabı ile yaklaşık uyuşmalı
    expect(result.segments.length).toBe(2); // 2 segment olmalı
    expect(Math.abs(meseResult - result.total)).toBeLessThan(10); // 10 TL tolerans
  });

  it('should calculate with TCMB official rates (VergiNet verified)', () => {
    console.log('\n=== BİZİM HESAPLAMAMIZ (TCMB resmi oranları ile) ===');
    const result = calculateSegmentedInterest(tcmbRates, ibrazTarihi, hesapTarihi);
    console.log(`Toplam: ${result.total.toFixed(2)} TL`);
    console.log(`Segment sayısı: ${result.segments.length}`);
    
    // 05.10.2025 → 05.01.2026 aralığında:
    // 05.10.2025'te geçerli oran: %42,25 (17.09.2025'ten beri)
    // 20.12.2025'te değişim: %39,75
    // Yani 2 segment olmalı: %42,25 → %39,75
    expect(result.segments.length).toBe(2);
    
    // TCMB oranları ile hesaplama ~10.500 TL civarı
    expect(result.total).toBeGreaterThan(10_000);
    expect(result.total).toBeLessThan(11_000);
  });

  /**
   * ASMMMO doğrulamalı test case
   * 05.10.2025 → 06.01.2026 = 93 gün
   * Segment 1: 05.10.2025 → 20.12.2025 (76 gün) @ %42,25 = 8.795,89 TL
   * Segment 2: 20.12.2025 → 06.01.2026 (17 gün) @ %39,75 = 1.851,37 TL
   * Toplam: 10.647,26 TL
   */
  it('should calculate ASMMMO verified test case: 05.10.2025 → 06.01.2026', () => {
    console.log('\n=== ASMMMO DOĞRULAMALI TEST ===');
    const testStart = '2025-10-05';
    const testEnd = '2026-01-06';
    
    const result = calculateSegmentedInterest(tcmbRates, testStart, testEnd);
    console.log(`Toplam: ${result.total.toFixed(2)} TL`);
    
    // Beklenen değerler
    const expectedSegment1 = 100_000 * 0.4225 * 76 / 365; // 8795.89
    const expectedSegment2 = 100_000 * 0.3975 * 17 / 365; // 1851.37
    const expectedTotal = expectedSegment1 + expectedSegment2; // 10647.26
    
    console.log(`Beklenen Segment 1 (76 gün @ %42,25): ${expectedSegment1.toFixed(2)} TL`);
    console.log(`Beklenen Segment 2 (17 gün @ %39,75): ${expectedSegment2.toFixed(2)} TL`);
    console.log(`Beklenen Toplam: ${expectedTotal.toFixed(2)} TL`);
    console.log(`Fark: ${Math.abs(expectedTotal - result.total).toFixed(2)} TL`);
    
    // 2 segment olmalı
    expect(result.segments.length).toBe(2);
    
    // Segment 1: 76 gün @ %42,25
    expect(result.segments[0].days).toBe(76);
    expect(result.segments[0].rate).toBe(0.4225);
    expect(Math.abs(result.segments[0].interest - 8797.26)).toBeLessThan(1); // 100000 * 0.4225 * 76 / 365
    
    // Segment 2: 17 gün @ %39,75
    expect(result.segments[1].days).toBe(17);
    expect(result.segments[1].rate).toBe(0.3975);
    expect(Math.abs(result.segments[1].interest - 1851.37)).toBeLessThan(1); // 100000 * 0.3975 * 17 / 365
    
    // Toplam: ~10.648,63 TL (2 TL tolerans - yuvarlama farkları)
    expect(Math.abs(result.total - 10648.63)).toBeLessThan(2);
  });

  it('should show difference between Meşe and TCMB rates', () => {
    const meseCalc = calculateSegmentedInterest(meseRates, ibrazTarihi, hesapTarihi);
    const tcmbCalc = calculateSegmentedInterest(tcmbRates, ibrazTarihi, hesapTarihi);
    const meseResult = 11_104.11;
    
    console.log('\n=== KARŞILAŞTIRMA ===');
    console.log(`Meşe (UYAP ekran): ${meseResult.toFixed(2)} TL`);
    console.log(`Meşe oranları ile hesap: ${meseCalc.total.toFixed(2)} TL (${meseCalc.segments.length} segment)`);
    console.log(`TCMB resmi oranları ile: ${tcmbCalc.total.toFixed(2)} TL (${tcmbCalc.segments.length} segment)`);
    console.log(`\nFark (Meşe - TCMB): ${(meseCalc.total - tcmbCalc.total).toFixed(2)} TL`);
    console.log(`\nNOT: Meşe'nin oran tablosu TCMB'den farklı.`);
    console.log(`Meşe: 05.10.2025'te %44,25 kullanıyor`);
    console.log(`TCMB: 05.10.2025'te %42,25 (2025-09-17 tarihli oran)`);
  });
});
