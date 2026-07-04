import { ReactNode } from 'react';

/**
 * TM3 Muhasebe UX-v2a (DASH-8) — paylaşılan finans tablosu KABUĞU.
 *
 * Amaç: tüm muhasebe tabloları AYNI görünsün (6 ay sonra 7 tablo da). Tek noktada standart:
 *  - sticky thead (bg-gray-50, üstte z-10)
 *  - tabular-nums (rakam hizası)
 *  - divide-y satırlar + tutarlı hücre padding (px-2.5 py-2.5)
 *  - sağ-hizalı para hücreleri otomatik font-semibold + whitespace-nowrap
 * KABUK standartlaşır; KOLONLAR / SATIRLAR / özel satır-rengi (needsReview, isContext, REVERSAL vb.) caller'da kalır
 * → `head` (thead içindeki <tr><th>…) + `children` (tbody <tr> satırları). Davranış/veri DEĞİŞMEZ; yalnız sunum.
 */
export interface AccountingTableProps {
  /** Sticky başlık satırı: <tr> içinde <th> hücreleri. */
  head: ReactNode;
  /** Gövde satırları: <tr> (caller kendi className + <td>'lerini verir). */
  children: ReactNode;
  /** Tabloya ek sınıf (ör. metin boyutu override). */
  className?: string;
  /** thead <tr> için ek sınıf (varsayılan: border-b text-left). */
  headRowClassName?: string;
}

export function AccountingTable({ head, children, className, headRowClassName }: AccountingTableProps) {
  return (
    <table
      // UX-v2b (DASH-3 tablo standardı): 14px (text-sm) · sağ-para font-semibold (600) · tabular-nums · ortak ritim py-2.5.
      className={`w-full text-sm tabular-nums [&_td]:px-2.5 [&_td]:py-2.5 [&_th]:px-2.5 [&_th]:py-2.5 [&_td.text-right]:whitespace-nowrap [&_td.text-right]:font-semibold ${className ?? ''}`}
    >
      {/* UX-v2c (DASH-2 korunur — yeni sticky sistemi YOK): mevcut sticky thead + scroll'da kalıcı 1px ayraç.
          border-b row-sticky'de bazı tarayıcılarda kaybolabildiği için th hücresine inset gölge (kayma sırasında durur). */}
      <thead className="sticky top-0 z-10 bg-gray-50 [&_th]:font-semibold [&_th]:shadow-[inset_0_-1px_0_0_#e5e7eb]">
        <tr className={`text-left ${headRowClassName ?? ''}`}>{head}</tr>
      </thead>
      <tbody className="divide-y">{children}</tbody>
    </table>
  );
}

export default AccountingTable;
