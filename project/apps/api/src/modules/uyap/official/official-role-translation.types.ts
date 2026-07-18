import type { DebtorRole } from '@prisma/client';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02A — Official Role Translation Result Model
 *
 * Domain `DebtorRole` → resmî UYAP Contract A `rolTur` (rolID 21-71) çözümlemesinin SONUÇ
 * SÖZLEŞMESİDİR. Bu discriminated union, P03'ün (OWNER/LDO-gated değer eşlemesi) gelecekte
 * dolduracağı yüzeydir.
 *
 * P02A hiçbir gerçek hedef (rolID) değeri seçmez ve production yolunda `RESOLVED` ÜRETMEZ.
 * `RESOLVED` yalnızca union'ın gelecekteki (P03) kullanımı için tanımlıdır.
 *
 * Yalnız type import (`DebtorRole`) — en dar bağımlılık; runtime/Prisma/NestJS bağımlılığı yoktur.
 */
export type OfficialRoleResolution =
  | {
      /** Domain rol resmî bir rolTur değerine çözüldü (P02A'da ÜRETİLMEZ; P03 yüzeyi). */
      kind: 'RESOLVED';
      /** Resmî rolTur rolID (ör. 21-71). P02A hiçbir değer atamaz. */
      rolID: string;
      /** Resmî rolTur Rol etiketi. */
      rol: string;
    }
  | {
      /** Rol resmî rolTur'a çözülebilir ama hedef değeri authority (OWNER/LDO) kararı bekliyor. */
      kind: 'UNRESOLVED_AUTHORITY_REQUIRED';
      debtorRole: DebtorRole;
      /** Hedef değeri kararı için gereken makam. Değer SEÇMEZ; yalnız makamı işaretler. */
      requiredAuthority: 'OWNER' | 'LDO_OWNER';
      reason: string;
    }
  | {
      /** Değer resmî rolTur sözlüğüne ait değildir (kambiyo enstrüman sıfatı). */
      kind: 'UNSUPPORTED_FOR_ROLTUR';
      debtorRole: DebtorRole;
      reason: string;
    }
  | {
      /** Girdi geçersiz/bilinmeyen (type-safe çağrıda ulaşılamaz; runtime savunması). */
      kind: 'INVALID_INPUT';
      detail: string;
    };

/** `OfficialRoleResolution` ayrımcı (discriminant) değerleri. */
export type OfficialRoleResolutionKind = OfficialRoleResolution['kind'];
