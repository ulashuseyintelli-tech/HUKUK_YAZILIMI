import { maskEmail, maskIdentity, maskPhone } from '../../common/pii-mask.util';
import { resolveClientAddress } from '../client/client-address-resolver';

/**
 * Callers: ExportImportService.exportClientsToExcel / exportClientsToPdf.
 * Generic-list export only; this projection grants no object access and must not
 * be applied to persistence or purpose-authorized legal document generation.
 */
export function presentGeneralClientExport(client: Record<string, any>) {
  const address = resolveClientAddress(client);
  const mask = (value: unknown, formatter: (value: string) => string) =>
    typeof value === 'string' && value.length > 0 ? formatter(value) : value;
  return {
    type: client.type,
    name: client.name,
    displayName: client.displayName,
    companyName: client.companyName,
    firstName: client.firstName,
    lastName: client.lastName,
    tckn: mask(client.tckn, maskIdentity),
    vkn: mask(client.vkn, maskIdentity),
    identityNo: mask(client.identityNo, maskIdentity),
    phone: mask(client.phone, maskPhone),
    email: mask(client.email, maskEmail),
    city: address.city,
    district: address.district,
    createdAt: client.createdAt,
  };
}

/** Callers: ExportImportService.exportClientsToPdf; never echo raw search input. */
export function generalClientExportFilterSubtitle(filters?: { type?: string; search?: string }): string {
  const labels: Record<string, string> = { PERSON: 'Sahis', COMPANY: 'Kurum', PUBLIC: 'Kamu' };
  const parts: string[] = [];
  if (filters?.type && filters.type !== 'ALL') {
    parts.push(labels[filters.type] ? `Tur: ${labels[filters.type]}` : 'Tur filtresi uygulandi');
  }
  if (filters?.search?.trim()) parts.push('Arama filtresi uygulandi');
  return parts.length ? `Filtre - ${parts.join('  |  ')}` : '';
}
