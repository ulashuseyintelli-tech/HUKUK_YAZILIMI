import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CaseTaskCreateModal } from '../CaseTaskCreateModal';
import { api } from '@/lib/api';
import { buildApiHttpError } from '@/lib/api-error';

/**
 * F03-B2 — dosyadan görev oluşturma penceresi.
 * stable key: components/case-detail/CaseTaskCreateModal.tsx
 *
 * Sözleşme: mevcut `POST /tasks` (api.createTask) çağrılır; dosya kimliği pencereden SEÇİLMEZ, açık dosyanınki gider;
 * başarısız kayıtta pencere açık kalır, değerler korunur, hata görünür ve başarı yan etkisi (onCreated / onClose) ÇALIŞMAZ.
 */
vi.mock('@/lib/api', () => ({ api: { createTask: vi.fn() } }));
const createTask = (api as unknown as { createTask: ReturnType<typeof vi.fn> }).createTask;

const mount = () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<CaseTaskCreateModal caseId="case-1" caseLabel="2026/1" onClose={onClose} onCreated={onCreated} />);
  return { onClose, onCreated };
};
const saveButton = () => screen.getByRole('button', { name: 'Görevi Oluştur' }) as HTMLButtonElement;

beforeEach(() => { createTask.mockReset(); });
afterEach(() => { cleanup(); });

describe('CaseTaskCreateModal', () => {
  it('başlık boşken kayıt kapalıdır ve istek çıkmaz', () => {
    mount();
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Başlık *'), { target: { value: '   ' } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(createTask).not.toHaveBeenCalled();
  });

  it('açık dosyanın kimliğiyle tek istek gönderir; başarıda önce listeyi yeniletir, sonra kapanır', async () => {
    createTask.mockResolvedValue({ id: 'task-1' });
    const { onClose, onCreated } = mount();
    fireEvent.change(screen.getByLabelText('Başlık *'), { target: { value: '  Sentetik dosya görevi  ' } });
    fireEvent.change(screen.getByLabelText('Açıklama'), { target: { value: 'Sentetik açıklama' } });
    fireEvent.change(screen.getByLabelText('Öncelik'), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByLabelText('Bitiş Tarihi'), { target: { value: '2026-12-01' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith({
      title: 'Sentetik dosya görevi',
      description: 'Sentetik açıklama',
      priority: 'HIGH',
      dueDate: '2026-12-01',
      caseId: 'case-1',
    });
  });

  it('boş açıklama ve tarih gönderilmez (tanımsız); varsayılan öncelik ORTA', async () => {
    createTask.mockResolvedValue({ id: 'task-1' });
    mount();
    fireEvent.change(screen.getByLabelText('Başlık *'), { target: { value: 'Yalnız başlık' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0][0]).toEqual({ title: 'Yalnız başlık', description: undefined, priority: 'MEDIUM', dueDate: undefined, caseId: 'case-1' });
  });

  it.each([403, 400, 500])('%s → pencere açık, değerler duruyor, hata görünür; başarı yan etkisi yok', async (status) => {
    createTask.mockRejectedValue(buildApiHttpError({ statusCode: status, message: 'Sunucu reddetti' }, status));
    const { onClose, onCreated } = mount();
    fireEvent.change(screen.getByLabelText('Başlık *'), { target: { value: 'Reddedilecek görev' } });
    fireEvent.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Görev oluşturulmadı.');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Başlık *') as HTMLInputElement).value).toBe('Reddedilecek görev');
    expect(saveButton().disabled).toBe(false);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('pencere atamanın nerede yapıldığını söyler ve dosya etiketini taşır', () => {
    mount();
    expect(screen.getByRole('dialog').textContent).toContain('Manuel Görev Ekle — 2026/1');
    expect(screen.getByRole('dialog').textContent).toContain('Atama ve durum değişikliği Görevler ekranından yapılır.');
  });
});
