import { api } from '@/lib/api';

export const OFFICE_CONTACT_FIELDS = ['address', 'city', 'district', 'postalCode', 'phone', 'fax', 'email', 'website'] as const;
export const STAFF_CONTACT_FIELDS = ['email', 'phone', 'mobilePhone', 'whatsappPhone'] as const;
export const CONTACT_KEYS = ['office.contact.manage', 'staff.contact.manage'] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];
export type ContactValues = Record<string, string | null>;
export type ContactStaff = { id: string; firstName: string; lastName: string; isActive?: boolean }
  & Partial<Record<(typeof STAFF_CONTACT_FIELDS)[number], string | null>>;
export interface ContactCapabilities { office: boolean; staff: boolean; writeOffice: boolean; writeStaff: boolean; managePermissions: boolean }
export interface ContactPermissionState {
  staffId: string; canReceiveGrant: boolean;
  grants: Array<{ id: string; permissionKey: ContactKey; effect: 'ALLOW' | 'DENY'; validFrom: string; validUntil: string | null }>;
}
type Page<T> = { items: T[]; nextCursor: string | null };
const base = '/office-contact';
function data<T>(response: unknown): T {
  const r = response as { data?: { data?: T } };
  if (!r?.data || r.data.data === undefined) throw new Error('İletişim yanıtı okunamadı.');
  return r.data.data;
}
export const officeContacts = {
  capabilities: async () => data<ContactCapabilities>(await api.get(`${base}/capabilities`)),
  office: async () => data<ContactValues>(await api.get(`${base}/office`)),
  staff: async (cursor?: string) => data<Page<ContactStaff>>(await api.get(`${base}/staff?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)),
  subjects: async (cursor?: string) => data<Page<ContactStaff>>(await api.get(`${base}/permissions/subjects?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)),
  saveOffice: async (values: ContactValues) => data<ContactValues>(await api.patch(`${base}/office`, values)),
  saveStaff: async (id: string, values: ContactValues) => data<ContactValues>(await api.patch(`${base}/staff/${encodeURIComponent(id)}`, values)),
  permissions: async (id: string) => data<ContactPermissionState>(await api.get(`${base}/permissions/staff/${encodeURIComponent(id)}`)),
  grant: async (id: string, body: { permissionKey: ContactKey; validFrom: string; validUntil: string; reason: string }) =>
    data(await api.post(`${base}/permissions/staff/${encodeURIComponent(id)}`, body)),
  revoke: async (id: string, permissionKey: ContactKey, reason: string) =>
    data(await api.post(`${base}/permissions/staff/${encodeURIComponent(id)}/revoke`, { permissionKey, reason })),
};
export const contactFailure = (e: unknown): string => {
  const status = (e as { status?: number })?.status;
  return status === 403 ? 'Bu iletişim işlemi için yetkiniz yok; kayıt yapılmadı.'
    : status === 404 ? 'İlgili kayıt bu kapsamda bulunamadı; kayıt yapılmadı.'
      : status === 409 ? 'Hesap veya izin durumu değişti; kayıt yapılmadı. Bilgileri yenileyin.'
        : 'İşlem doğrulanamadı. Tekrar göndermeden önce bilgileri yenileyin.';
};
