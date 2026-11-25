import { describe, it, expect } from 'vitest';
import { describeTaskHistoryActor, describeTaskHistoryEvent, taskHistoryCoverageNotes, type TaskHistoryItem } from '../task-history';

/**
 * F03-A2 — görev geçmişi satırının ekran metni (saf dönüştürücü).
 * stable key: lib/task-history.ts
 */
const item = (over: Partial<TaskHistoryItem>): TaskHistoryItem => ({
  id: 'e1',
  kind: 'HISTORY',
  eventType: 'CREATED',
  actorType: 'USER',
  actorUserId: 'u1',
  actorName: 'Sentetik Kullanıcı',
  actorRole: 'USER',
  authoritySource: 'CREATOR',
  fromValue: null,
  toValue: null,
  fromLabel: null,
  toLabel: null,
  reason: null,
  correlationId: 'c1',
  createdAt: '2026-11-25T08:00:00.000Z',
  ...over,
});

describe('describeTaskHistoryEvent', () => {
  it('oluşturma, durum, yeniden açma ve öncelik değişikliği Türkçe adlarla yazılır', () => {
    expect(describeTaskHistoryEvent(item({ eventType: 'CREATED' }))).toBe('Görev oluşturuldu');
    expect(describeTaskHistoryEvent(item({ eventType: 'STATUS_CHANGED', fromValue: 'PENDING', toValue: 'IN_PROGRESS' }))).toBe('Durum: Bekliyor → Devam Ediyor');
    expect(describeTaskHistoryEvent(item({ eventType: 'REOPENED', fromValue: 'COMPLETED', toValue: 'PENDING' }))).toBe('Yeniden açıldı: Tamamlandı → Bekliyor');
    expect(describeTaskHistoryEvent(item({ eventType: 'PRIORITY_CHANGED', fromValue: 'MEDIUM', toValue: 'URGENT' }))).toBe('Öncelik: Orta → Acil');
  });

  it('atama: adı çözülen kişi adıyla, boş değer "atanmamış", adı çözülemeyen kişi için ad UYDURULMAZ', () => {
    expect(describeTaskHistoryEvent(item({ eventType: 'ASSIGNEE_CHANGED', fromValue: null, toValue: 'u2', toLabel: 'Sentetik Atanan' }))).toBe('Atanan: atanmamış → Sentetik Atanan');
    expect(describeTaskHistoryEvent(item({ eventType: 'ASSIGNEE_CHANGED', fromValue: 'u2', fromLabel: null, toValue: null }))).toBe(
      'Atanan: adı görüntülenemeyen kullanıcı → atanmamış',
    );
  });

  it('dosya bağı: numarası verilen dosya numarasıyla; numarası verilmeyen (aktöre görünmeyen) dosya için numara UYDURULMAZ', () => {
    expect(describeTaskHistoryEvent(item({ eventType: 'CASE_LINK_CHANGED', fromValue: null, toValue: 'c1', toLabel: '2026/7' }))).toBe('Dosya: dosyasız → 2026/7');
    expect(describeTaskHistoryEvent(item({ eventType: 'CASE_LINK_CHANGED', fromValue: 'c1', fromLabel: null, toValue: null }))).toBe(
      'Dosya: görüntüleme yetkiniz olmayan dosya → dosyasız',
    );
  });

  it('bitiş tarihi yerel biçimde; kaldırılan tarih tire', () => {
    const text = describeTaskHistoryEvent(item({ eventType: 'DUE_DATE_CHANGED', fromValue: null, toValue: '2026-12-01T00:00:00.000Z' }));
    expect(text).toBe(`Bitiş tarihi: — → ${new Date('2026-12-01T00:00:00.000Z').toLocaleDateString('tr-TR')}`);
  });

  it('iptal (ayrı iptal kaydından) ve bilinmeyen olay türü', () => {
    expect(describeTaskHistoryEvent(item({ kind: 'CANCELLATION', eventType: 'CANCELLED', fromValue: 'IN_PROGRESS', toValue: 'CANCELLED' }))).toBe(
      'İptal edildi: Devam Ediyor → İptal edildi',
    );
    expect(describeTaskHistoryEvent(item({ eventType: 'GELECEK_BIR_TUR' }))).toBe('GELECEK_BIR_TUR');
  });
});

describe('describeTaskHistoryActor', () => {
  it('kullanıcı adı + hangi sıfatla; adı yoksa kimliği; sistem üreticisi "Sistem"', () => {
    expect(describeTaskHistoryActor(item({}))).toBe('Sentetik Kullanıcı (görevi oluşturan)');
    expect(describeTaskHistoryActor(item({ actorName: null, authoritySource: 'ADMIN' }))).toBe('u1 (yönetici)');
    expect(describeTaskHistoryActor(item({ authoritySource: 'BILINMEYEN' }))).toBe('Sentetik Kullanıcı');
    expect(describeTaskHistoryActor(item({ actorType: 'SYSTEM', actorUserId: null, actorName: null, authoritySource: 'SYSTEM_PRODUCER' }))).toBe('Sistem');
  });
});

describe('taskHistoryCoverageNotes', () => {
  it('kapsam bilgisi yoksa not yok; oluşturma kayıtlı değilse ve sistem yazımları kapsam dışıysa ayrı ayrı söylenir', () => {
    expect(taskHistoryCoverageNotes(null)).toEqual([]);
    expect(taskHistoryCoverageNotes({ creationRecorded: true, systemWritersRecorded: true })).toEqual([]);
    const notes = taskHistoryCoverageNotes({ creationRecorded: false, systemWritersRecorded: false });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('geçmiş kaydı sonradan başladı');
    expect(notes[1]).toContain('bu geçmişte yer almaz');
  });
});

// F03-C: gorev ici bagimsiz ilk kontrol olaylari.
describe('describeTaskHistoryEvent / describeTaskHistoryActor — F03-C kontrol olayları', () => {
  it('kontrol olayları ne olduğunu söyler; "kontrolde" ham durum koduyla yazılmaz', () => {
    const text = (eventType: string) => describeTaskHistoryEvent(item({ eventType, fromValue: 'IN_PROGRESS', toValue: 'COMPLETED' }));
    expect(text('REVIEW_REQUIREMENT_SET')).toBe('Kontrol gerekli olarak işaretlendi');
    expect(text('REVIEW_REQUIREMENT_REMOVED')).toBe('Kontrol işareti kaldırıldı');
    expect(text('REVIEW_SUBMITTED')).toBe('Tamamlandı bildirildi; kontrole gönderildi');
    expect(text('REVIEW_APPROVED')).toBe('Kontrol: onaylandı — görev tamamlandı');
    expect(text('REVIEW_REVISION_REQUESTED')).toBe('Kontrol: revizyon istendi — görev işi yapana döndü');
    expect(text('REVIEW_REJECTED')).toBe('Kontrol: reddedildi — görev havuza döndü (bekliyor, atanmamış)');
  });

  it('karar verenin sıfatı yazılır: kontrol eden yönetici / kontrol eden, görevi oluşturan', () => {
    expect(describeTaskHistoryActor(item({ authoritySource: 'REVIEWER_ADMIN', actorName: 'Sentetik Yönetici' }))).toBe('Sentetik Yönetici (kontrol eden yönetici)');
    expect(describeTaskHistoryActor(item({ authoritySource: 'REVIEWER_CREATOR', actorName: 'Sentetik Oluşturan' }))).toBe('Sentetik Oluşturan (kontrol eden, görevi oluşturan)');
  });
});
