import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClientForm } from '@/components/client/client-form';
import { emptyClientFormValues } from '@/lib/client-write';

describe('ClientForm', () => {
  it('create mode: telefon/e-posta düzenlenebilir input olarak render edilir', () => {
    render(
      <ClientForm mode="create" saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText('05XX XXX XX XX')).toBeTruthy();
    expect(screen.getByPlaceholderText('ornek@email.com')).toBeTruthy();
  });

  it('edit mode: telefon/e-posta salt-okuma gösterilir, input YOK', () => {
    render(
      <ClientForm
        mode="edit"
        initialValues={{ ...emptyClientFormValues(), firstName: 'Ali', lastName: 'Veli', tckn: '10000000146' }}
        readOnlyContact={{ phone: '0532', email: 'a@b.com', address: null }}
        saving={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Telefon: 0532')).toBeTruthy();
    expect(screen.getByText('E-posta: a@b.com')).toBeTruthy();
    expect(screen.queryByPlaceholderText('05XX XXX XX XX')).toBeNull();
    expect(screen.queryByPlaceholderText('ornek@email.com')).toBeNull();
  });

  it('eksik zorunlu alanla submit → onSubmit ÇAĞRILMAZ, hata gösterilir', () => {
    const onSubmit = vi.fn();
    render(<ClientForm mode="create" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Kaydet'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Ad zorunludur')).toBeTruthy();
    expect(screen.getByText('Soyad zorunludur')).toBeTruthy();
  });

  it('geçerli PERSON formu submit edilince onSubmit doğru değerlerle çağrılır', () => {
    const onSubmit = vi.fn();
    render(<ClientForm mode="create" saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByLabelText(/^Soyad/), { target: { value: 'Veli' } });
    fireEvent.change(screen.getByLabelText(/^TCKN/), { target: { value: '10000000146' } });
    fireEvent.click(screen.getByText('Kaydet'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0];
    expect(values.firstName).toBe('Ali');
    expect(values.lastName).toBe('Veli');
    expect(values.tckn).toBe('10000000146');
  });

  it('COMPANY seçilince kurum alanları görünür, şahıs alanları kaybolur', () => {
    render(<ClientForm mode="create" saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Kurum'));
    expect(screen.getByLabelText(/^Kurum Adı/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Ad\b/)).toBeNull();
  });

  it('submitError verilince gösterilir', () => {
    render(
      <ClientForm mode="create" saving={false} submitError="Sunucu hatası" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Sunucu hatası')).toBeTruthy();
  });

  it('iptal butonu onCancel çağırır', () => {
    const onCancel = vi.fn();
    render(<ClientForm mode="create" saving={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('İptal'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
