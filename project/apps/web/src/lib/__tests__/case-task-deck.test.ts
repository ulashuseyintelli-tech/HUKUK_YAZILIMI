import { describe, it, expect } from 'vitest';
import { CASE_TASK_AWAITING_REVIEW_TEXT, CASE_TASK_DECK_TYPE, taskRowToDeckTask, taskRowsFromListResponse } from '../case-task-deck';

/**
 * F03-B2 — dosyaya bağlı Task satırı → "Yapılacaklar" görevi (saf dönüştürücü).
 * stable key: lib/case-task-deck.ts
 */
describe('taskRowToDeckTask', () => {
  it('açık durumlar "BEKLIYOR", tamamlanan "YAPILDI", iptal "IPTAL"; tür TASK; kategori süreye bağlı', () => {
    const base = { id: 't1', title: 'Sentetik görev', createdById: 'u1' };
    expect(taskRowToDeckTask({ ...base, status: 'PENDING' })).toMatchObject({ id: 't1', status: 'BEKLIYOR', taskType: CASE_TASK_DECK_TYPE, category: 'SURE_BAGLI', source: 'MANUEL' });
    expect(taskRowToDeckTask({ ...base, status: 'IN_PROGRESS' })?.status).toBe('BEKLIYOR');
    expect(taskRowToDeckTask({ ...base, status: 'COMPLETED' })?.status).toBe('YAPILDI');
    expect(taskRowToDeckTask({ ...base, status: 'CANCELLED' })?.status).toBe('IPTAL');
  });

  it('bilinmeyen durum bekleyen iş SAYILMAZ: satır listeye girmez', () => {
    expect(taskRowToDeckTask({ id: 't1', title: 'x', status: 'REVIEW' })).toBeNull();
    expect(taskRowToDeckTask({ id: '', title: 'x', status: 'PENDING' })).toBeNull();
  });

  it('öncelik: ACİL ve YÜKSEK → HIGH; bilinmeyen / boş → MEDIUM; oluşturanı olmayan satır sistem kaynağıdır', () => {
    const row = { id: 't1', title: 'x', status: 'PENDING' };
    expect(taskRowToDeckTask({ ...row, priority: 'URGENT' })?.priority).toBe('HIGH');
    expect(taskRowToDeckTask({ ...row, priority: 'HIGH' })?.priority).toBe('HIGH');
    expect(taskRowToDeckTask({ ...row, priority: 'LOW' })?.priority).toBe('LOW');
    expect(taskRowToDeckTask({ ...row, priority: null })?.priority).toBe('MEDIUM');
    expect(taskRowToDeckTask(row)?.source).toBe('SISTEM');
  });

  it('öncelik ETİKETİ indirgenmez: Yüksek görev "Acil" diye adlandırılmaz (Görevler ekranındaki adlar)', () => {
    const row = { id: 't1', title: 'x', status: 'PENDING' };
    expect(taskRowToDeckTask({ ...row, priority: 'URGENT' })?.priorityLabel).toBe('Acil');
    expect(taskRowToDeckTask({ ...row, priority: 'HIGH' })?.priorityLabel).toBe('Yüksek');
    expect(taskRowToDeckTask({ ...row, priority: 'MEDIUM' })?.priorityLabel).toBe('Orta');
    expect(taskRowToDeckTask({ ...row, priority: 'LOW' })?.priorityLabel).toBe('Düşük');
    expect(taskRowToDeckTask({ ...row, priority: undefined })?.priorityLabel).toBe('Orta');
  });

  it('son tarih ve açıklama aynen taşınır; null alan tanımsız olur', () => {
    const t = taskRowToDeckTask({ id: 't1', title: 'x', status: 'PENDING', dueDate: '2026-12-01T00:00:00.000Z', description: null });
    expect(t?.dueDate).toBe('2026-12-01T00:00:00.000Z');
    expect(t?.description).toBeUndefined();
  });
});

describe('taskRowsFromListResponse', () => {
  it('zarf { data, meta.totalPages } okunur', () => {
    expect(taskRowsFromListResponse({ data: [{ id: 'a' }], meta: { totalPages: 3 } })).toEqual({ rows: [{ id: 'a' }], totalPages: 3 });
  });

  it('beklenmeyen biçim (dizi, null, eksik meta) satırsız tek sayfadır', () => {
    expect(taskRowsFromListResponse([])).toEqual({ rows: [], totalPages: 1 });
    expect(taskRowsFromListResponse(null)).toEqual({ rows: [], totalPages: 1 });
    expect(taskRowsFromListResponse({ data: [{ id: 'a' }] })).toEqual({ rows: [{ id: 'a' }], totalPages: 1 });
    expect(taskRowsFromListResponse({ data: 'x', meta: { totalPages: 0 } })).toEqual({ rows: [], totalPages: 1 });
  });
});

// F03-C: "kontrolde" ayri bir sunucu durumu degildir (IN_PROGRESS + reviewStatus AWAITING).
describe('taskRowToDeckTask — F03-C kontrol', () => {
  const base = { id: 't1', title: 'Sentetik görev', priority: 'MEDIUM', createdById: 'u1' };

  it('kontrolde bekleyen görev açık iştir ama pasiftir: tamamlama eylemi yerine neden yazılır', () => {
    const task = taskRowToDeckTask({ ...base, status: 'IN_PROGRESS', reviewRequired: true, reviewStatus: 'AWAITING' });
    expect(task?.status).toBe('BEKLIYOR');
    expect(task?.passiveText).toBe(CASE_TASK_AWAITING_REVIEW_TEXT);
    expect(task?.reviewRequired).toBe(true);
  });

  it('kontrolde olmayan görev pasif değildir (işaretli, revizyon istenmiş ya da bayat AWAITING)', () => {
    expect(taskRowToDeckTask({ ...base, status: 'PENDING', reviewRequired: true, reviewStatus: null })).toMatchObject({ reviewRequired: true });
    expect(taskRowToDeckTask({ ...base, status: 'PENDING', reviewRequired: true, reviewStatus: null })?.passiveText).toBeUndefined();
    expect(taskRowToDeckTask({ ...base, status: 'IN_PROGRESS', reviewRequired: true, reviewStatus: 'REVISION_REQUESTED' })?.passiveText).toBeUndefined();
    expect(taskRowToDeckTask({ ...base, status: 'PENDING', reviewStatus: 'AWAITING' })?.passiveText).toBeUndefined();
    expect(taskRowToDeckTask({ ...base, status: 'PENDING' })).not.toHaveProperty('reviewRequired');
  });
});
