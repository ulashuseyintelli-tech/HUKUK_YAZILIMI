/**
 * W4-ACT02A — masraf-talebi satır notu CLIENT-SAFE lokalizasyonu (owner GO).
 * Kurallar: ham "TRY" = 0; ham enum (PENDING/SENT/...) = 0; tutar açıklamada TEKRAR yazılmaz;
 * PENDING görünen metin tam olarak "Masraf talebi (onay bekliyor)"; client-level ve case-level
 * AYNI merkezi etiketi tüketir (parity); bilinmeyen status raw sızdırmaz; debit/credit/running
 * davranışı BU PATCH'te değişmez (yalnız note alanı).
 */
import { ClientStatementService } from '../client-statement.service';

const RAW_ENUMS = ['PENDING', 'SENT', 'REMINDED', 'PARTIAL', 'RECEIVED', 'PAID', 'LAWYER_PAID', 'OVERDUE'];

function svc(): any {
  // Yalnız private helper'lar sınanır — bağımlılıklar dokunulmaz.
  return new (ClientStatementService as any)({}, {}, {}, {}, {});
}

describe('W4-ACT02A expenseRequestNote — client-safe Türkçe etiket', () => {
  it('PENDING → tam olarak "Masraf talebi (onay bekliyor)" (owner kabul metni)', () => {
    expect(svc().expenseRequestNote('PENDING')).toBe('Masraf talebi (onay bekliyor)');
  });

  it.each([
    ['SENT', 'gönderildi'],
    ['REMINDED', 'hatırlatıldı'],
    ['PARTIAL', 'kısmi ödendi'],
    ['RECEIVED', 'ödeme alındı'],
    ['PAID', 'ödendi'],
    ['LAWYER_PAID', 'büro tarafından karşılandı'],
    ['OVERDUE', 'vadesi geçti'],
  ])('%s → Türkçe etiket "%s"; ham enum/`TRY` yüzeye çıkmaz', (status, label) => {
    const note = svc().expenseRequestNote(status);
    expect(note).toBe(`Masraf talebi (${label})`);
    expect(note).not.toContain('TRY');
    for (const raw of RAW_ENUMS) expect(note).not.toContain(raw);
  });

  it('bilinmeyen status → raw değer SIZDIRILMAZ (güvenli "işlemde")', () => {
    const note = svc().expenseRequestNote('SOME_FUTURE_STATUS');
    expect(note).toBe('Masraf talebi (işlemde)');
    expect(note).not.toContain('SOME_FUTURE_STATUS');
  });

  it('tutar/para birimi açıklamada YOK (Borç/Alacak sütunu tek kaynak)', () => {
    for (const s of RAW_ENUMS) {
      const note = svc().expenseRequestNote(s);
      expect(note).not.toMatch(/\d/); // hiçbir rakam yok
      expect(note).not.toContain('TL');
    }
  });

  it('client-level ve case-level AYNI merkezi üreticiyi kullanır (kaynak-kod parity kilidi)', () => {
    // İkinci bir mapping/inline şablon geri gelirse bu test kırılır.
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../client-statement.service.ts'), 'utf8');
    const calls = (src.match(/this\.expenseRequestNote\(/g) || []).length;
    expect(calls).toBe(2); // tam iki tüketici: collectClientLevel + collect
    expect(src).not.toMatch(/Masraf talebi: \$\{/);
    expect(src).not.toMatch(/Talep: \$\{/);
  });
});
