import type { OfficeDisclosureStatus } from '@/lib/api/client-financial-disclosure';

const STATUS_PRESENTATION: Record<OfficeDisclosureStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Taslak', className: 'bg-gray-100 text-gray-700' },
  OFFICE_APPROVAL_PENDING: { label: 'Büro onayı bekliyor', className: 'bg-amber-100 text-amber-800' },
  OFFICE_APPROVED: { label: 'Büro onaylı', className: 'bg-blue-100 text-blue-800' },
  CONTENT_APPROVAL_PENDING: { label: 'İçerik onayı bekliyor', className: 'bg-amber-100 text-amber-800' },
  CONTENT_APPROVED: { label: 'İçerik onaylı', className: 'bg-blue-100 text-blue-800' },
  SEND_PENDING: { label: 'Gönderim bekliyor', className: 'bg-violet-100 text-violet-800' },
  SEND_FAILED: { label: 'Gönderim başarısız', className: 'bg-red-100 text-red-800' },
  PUBLISHED: { label: 'Yayımlandı', className: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'İptal edildi', className: 'bg-gray-100 text-gray-700' },
  SUPERSEDED: { label: 'Yerine yenisi oluşturuldu', className: 'bg-slate-100 text-slate-700' },
  REVERSED: { label: 'Ters kayıt', className: 'bg-orange-100 text-orange-800' },
};

export function getOfficeDisclosureStatusLabel(status: OfficeDisclosureStatus): string {
  return STATUS_PRESENTATION[status].label;
}

export function DisclosureStatusBadge({ status }: { status: OfficeDisclosureStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${presentation.className}`}
      aria-label={`Durum: ${presentation.label}`}
    >
      {presentation.label}
    </span>
  );
}
