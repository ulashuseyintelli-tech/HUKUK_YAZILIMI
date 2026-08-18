import { Injectable, Logger } from '@nestjs/common';
import {
  OfficeWorkPoolEpochProvenance,
  OfficeWorkPoolKind,
  OfficeWorkPoolMembershipProvenance,
  Prisma,
  StaffType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  OfficeLawyerPoolKind,
  OfficeStaffTypePoolKind,
  OFFICE_WORK_POOL_MEMBER_CARRIER,
} from './office-work-pool.contract';
import {
  evaluateOfficeLawyerPool,
  evaluateOfficeStaffTypePool,
  isOfficeWorkPoolMembershipActiveAt,
  OfficeWorkPoolMembershipRow,
} from './office-work-pool.evaluator';
import {
  classifyOfficeWorkPoolMutationError,
  extractOfficeWorkPoolErrorCode,
  isRetryableOfficeWorkPoolMutationError,
  OfficeWorkPoolActorRequiredError,
  OfficeWorkPoolApplyTargetStateResult,
  OfficeWorkPoolAnchorPolicy,
  OfficeWorkPoolLegacyPassthroughViolationError,
  OfficeWorkPoolOfficeMissingError,
  OfficeWorkPoolPoolChange,
  OfficeWorkPoolTargetStateSource,
  OfficeWorkPoolUnknownMemberError,
  OfficeWorkPoolUnknownStateError,
  OFFICE_WORK_POOL_KINDS,
  OFFICE_WORK_POOL_LEGACY_COLUMN,
  OFFICE_WORK_POOL_LEGACY_COLUMNS,
  OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS,
} from './office-work-pool.mutation-contract';

/**
 * OFFICE-WR01-B02 AŞAMA 4 — TEK MUTATION PRIMITIVE'İ (`applyTargetState`).
 *
 * ═══ LOCK INVARIANT (§11.5.7, BAĞLAYICI) ═══════════════════════════════════════════════
 *   `OfficeWorkPoolMembership` satırı INSERT/UPDATE eden HER yol, aynı transaction içinde ve
 *   YAZMADAN ÖNCE ilgili `Office` satırında `FOR UPDATE` kilidini almış olmak ZORUNDADIR.
 * Bu dosya o kilidin TEK sahibidir; `office-work-pool-writer.static-guard.spec.ts` kaynak
 * ağacında primitive DIŞINDA membership yazan dosya kalmadığını mekanik olarak kilitler.
 *
 * ═══ NEDEN TEK SAHİP ═══════════════════════════════════════════════════════════════════
 * Effective-dated model, legacy'nin kör `UPDATE`'ini **oku → farkı hesapla → N satır yaz**
 * hâline getirir. Serialize edilmeyen iki eşzamanlı replace-all isteği, hiçbir isteğin hedefi
 * OLMAYAN bir sonuç (`{A,B,C}`) üretebilir — partial unique index bunu ENGELLEMEZ, çünkü
 * satırlar farklı üyelere aittir (§11.5, `CF-B02-02`). Yani lost-update yükümlülüğü BU
 * tasarımla doğar ve karşılanmazsa sonuç bugünkü davranıştan DAHA KÖTÜDÜR.
 *
 * ═══ TRANSACTION İÇİ BAĞLAYICI SIRA (§11.5.2, §11.5.9) ═════════════════════════════════
 *   1) `SELECT "id" FROM "Office" WHERE "tenantId" = $1 FOR UPDATE`   ← transaction'ın İLK DB ifadesi
 *   2) `SELECT clock_timestamp()`                                     ← kilit sonrası, TEK KEZ
 *   3) anchor + aktif membership okuması (aynı tx client)
 *   4) hedef-durum farkı
 *   5) revoke  (`revokedAt = effectiveAt`)
 *   6) insert  (`validFrom = effectiveAt`)
 *   7) legacy projeksiyon (aynı tx → partial commit YAPISAL OLARAK İMKÂNSIZ)
 *
 * `now()` / `CURRENT_TIMESTAMP` transaction BAŞLANGIÇ anını temsil eder ve kilit beklerken
 * İLERLEMEZ; kullanılsaydı sonra serialize edilen mutation daha ERKEN bir `effectiveAt`
 * taşırdı ve "kim ne zaman havuzdaydı" sorusu yanlış cevaplanırdı (`CF-B02-03`). Aynı sebeple
 * servis başında `new Date()` ile üretmek de yasaktır — bu, `now()` hatasının uygulama
 * katmanındaki eşdeğeridir.
 *
 * ═══ AŞAMA 4'ÜN YÖNÜ ═══════════════════════════════════════════════════════════════════
 * Legacy düz diziler AUTHORITATIVE kalır; üyelik tablosu MIRROR'dır (§9.1/§9.4). Okuma
 * cutover'ı (AŞAMA 6 / G8) bu PR'ın DIŞINDADIR: hiçbir tüketici resolver'a bağlanmamıştır.
 *
 * @see office-work-pool.mutation-contract.ts (tipler, hata sınıfları, retry sınıflandırması)
 * @see office-work-pool.evaluator.ts (predikat — burada KOPYASI YOKTUR)
 */
@Injectable()
export class OfficeWorkPoolMutationService {
  private readonly logger = new Logger(OfficeWorkPoolMutationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Havuz hedef durumunu effective-dated mutasyona çevirir ve legacy projeksiyonu AYNI
   * transaction'da yazar.
   *
   * BOUNDED + SINIFLANDIRILMIŞ RETRY (§9.4a/4): yalnız `SERIALIZATION` ve `INDETERMINATE`
   * sınıfları yeniden denenir, en fazla `OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS` kez.
   * Yeniden deneme KÖR DEĞİLDİR: her deneme YENİ bir transaction açar, kilidi yeniden alır,
   * durumu TAZE okur ve farkı yeniden hesaplar — iki yüzey de hedefle eşitse fark boş çıkar
   * ve hiçbir satır yazılmaz (§9.4a/5 "oku-doğrula, farklıysa uygula").
   */
  async applyTargetState(params: {
    readonly tenantId: string;
    readonly source: OfficeWorkPoolTargetStateSource;
    readonly actorUserId?: string;
    readonly legacyPassthrough?: Record<string, unknown>;
    readonly anchorPolicy?: OfficeWorkPoolAnchorPolicy;
    readonly membershipProvenance?: OfficeWorkPoolMembershipProvenance;
    readonly anchorProvenance?: OfficeWorkPoolEpochProvenance;
  }): Promise<OfficeWorkPoolApplyTargetStateResult> {
    // SAF NORMALIZASYON — transaction'dan ÖNCE (§2.1): DB'ye hiç gitmeden reddedilebilecek
    // sözleşme ihlali, kilit tutarak reddedilmez.
    this.assertLegacyPassthroughIsPoolFree(params.legacyPassthrough);

    let lastError: unknown;
    for (let attempt = 1; attempt <= OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS; attempt++) {
      try {
        const outcome = await this.prisma.$transaction(
          async (tx) => this.runAttempt(tx, params),
          // Kilit bekleme payı: bu transaction bir satır kilidi tutar ve ikinci istek onu
          // bekler. Prisma varsayılanları (maxWait 2s / timeout 5s) bekleyen isteği yapay
          // olarak düşürürdü. Repo emsali: external-case-status-transition.service.ts:313.
          { maxWait: 15_000, timeout: 20_000 },
        );
        return { ...outcome, attempts: attempt };
      } catch (error) {
        lastError = error;
        if (
          !isRetryableOfficeWorkPoolMutationError(error) ||
          attempt === OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(
          JSON.stringify({
            event: 'office_work_pool_mutation_retry',
            tenantId: params.tenantId,
            attempt,
            maxAttempts: OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS,
            errorClass: classifyOfficeWorkPoolMutationError(error),
            errorCode: extractOfficeWorkPoolErrorCode(error) ?? null,
          }),
        );
      }
    }
    // Döngü `attempt === MAX` dalında zaten fırlatır; bu satır yalnız tip bütünlüğü içindir
    // (emsal: password-reset.service.ts sonundaki `throw lastError`).
    throw lastError;
  }

  /**
   * PROVISIONING SNAPSHOT — YALNIZ `OfficeService.getOrCreate`'in Office YARATIM
   * transaction'ından çağrılır (§6.7 + §5.2 ilkesi).
   *
   * ═══ NEDEN GEREKLİ (ölçülmüş olgu) ═════════════════════════════════════════════════════
   * `Office.opStaffTypes` şema varsayılanı BOŞ DEĞİLDİR
   * (`@default([MUHASEBE, ADLI_KATIP, SEKRETER])`, `schema.prisma`). Yeni bir büroya YALNIZ
   * anchor yazılırsa legacy dizi DOLU, üyelik tablosu BOŞ olur; resolver o havuzu
   * `RESOLVED / EMPTY` okur — yani "havuz gerçekten boştu" diye YANLIŞ bir iddia üretir. Bu,
   * §5.2'nin gap Office için açıkça yasakladığı durumun BİREBİR aynısıdır ve dual-write'ın
   * mirror'ını doğduğu anda bozardı (AŞAMA 5'in DRIFT = 0 çıkış koşulu asla sağlanamazdı).
   *
   * ═══ NEDEN KİLİT ALINMIYOR ═════════════════════════════════════════════════════════════
   * `applyTargetState`'in kilidi, MEVCUT bir satır üzerinde read-modify-write yarışını
   * serialize etmek içindir. Burada Office satırı BU transaction tarafından YARATILMAKTADIR:
   * commit'e kadar başka hiçbir transaction onu göremez, `Office.tenantId @unique` eşzamanlı
   * ikinci yaratıcıyı DB düzeyinde eler ve okunacak bir "önceki durum" YOKTUR — fark hesabı
   * tanım gereği ∅ → hedef'tir. Yani serialize edilecek bir yarış YOKTUR; kilit eklemek
   * (henüz görünmeyen satır üzerinde) yanlış bir güvenlik hissi verirdi.
   *
   * ═══ NEDEN BURADA ══════════════════════════════════════════════════════════════════════
   * Yazma primitive dosyasının İÇİNDE kalır: `getOrCreate` doğrudan membership yazsaydı
   * §11.5.7'nin tek-writer garantisi delinir ve iki ayrı "üyelik nasıl yazılır" tanımı
   * doğardı. Metot `applyTargetState`'in yerine geçmez; yalnız YARATIM anına özgüdür.
   *
   * PROVENANCE: `LEGACY_CUTOVER_IMPORT`. Yeni enum değeri İCAT EDİLMEZ (§13). `ADMIN_DECLARED`
   * YANLIŞ olurdu — hiçbir admin bu üyeleri beyan etmemiştir, değer şema varsayılanından
   * gelir. `LEGACY_CUTOVER_IMPORT`'un taşıdığı iddia ise "bu satır düz diziden materyalize
   * edildi ve `validFrom` bir İTHAL tarihidir, politikanın kanıtlanmış başlangıcı değildir" —
   * burada gerçekte `validFrom` başlangıcın ta kendisidir, yani sözleşme gerçekten olduğundan
   * DAHA AZINI iddia eder. Eksik iddia güvenlidir; fazla iddia olmazdı.
   *
   * @returns yazılan üyelik satırı sayısı
   */
  async materializeProvisioningSnapshot(
    tx: Prisma.TransactionClient,
    params: {
      readonly tenantId: string;
      /** Yaratım anı — anchor'ların `knownFrom` değeriyle AYNI kaynaktan gelmelidir. */
      readonly at: Date;
      readonly legacyPools: Record<string, unknown>;
    },
  ): Promise<number> {
    const data: Prisma.OfficeWorkPoolMembershipCreateManyInput[] = [];
    for (const poolKind of OFFICE_WORK_POOL_KINDS) {
      const carrier = OFFICE_WORK_POOL_MEMBER_CARRIER[poolKind];
      const raw = params.legacyPools[OFFICE_WORK_POOL_LEGACY_COLUMN[poolKind]];
      if (!Array.isArray(raw)) continue;
      for (const key of [...new Set(raw.map((m) => String(m)))]) {
        data.push({
          tenantId: params.tenantId,
          poolKind,
          memberLawyerId: carrier === 'LAWYER' ? key : null,
          memberStaffType: carrier === 'STAFF_TYPE' ? (key as StaffType) : null,
          validFrom: params.at,
          provenance: 'LEGACY_CUTOVER_IMPORT',
          // Yaratımdan doğan satırlarda aktör YOKTUR (§6.2 `createdByUserId` şerhi).
          createdByUserId: null,
        });
      }
    }
    if (data.length === 0) return 0;
    await tx.officeWorkPoolMembership.createMany({ data });
    return data.length;
  }

  /**
   * Havuz kolonları YALNIZ hedef-durum farkından yazılır. Passthrough üzerinden yazılmaları
   * primitive'in tek-writer garantisini delerdi: legacy dizi hedefe eşitlenirken membership
   * tarafı sessizce geride kalırdı (drift).
   */
  private assertLegacyPassthroughIsPoolFree(passthrough?: Record<string, unknown>): void {
    if (!passthrough) return;
    for (const column of OFFICE_WORK_POOL_LEGACY_COLUMNS) {
      if (Object.prototype.hasOwnProperty.call(passthrough, column)) {
        throw new OfficeWorkPoolLegacyPassthroughViolationError(column);
      }
    }
  }

  /** Tek denemenin gövdesi — sıra §11.5.2/§11.5.9 ile bağlıdır. */
  private async runAttempt(
    tx: Prisma.TransactionClient,
    params: {
      readonly tenantId: string;
      readonly source: OfficeWorkPoolTargetStateSource;
      readonly actorUserId?: string;
      readonly legacyPassthrough?: Record<string, unknown>;
      readonly anchorPolicy?: OfficeWorkPoolAnchorPolicy;
      readonly membershipProvenance?: OfficeWorkPoolMembershipProvenance;
      readonly anchorProvenance?: OfficeWorkPoolEpochProvenance;
    },
  ): Promise<Omit<OfficeWorkPoolApplyTargetStateResult, 'attempts'>> {
    const { tenantId, source, actorUserId } = params;
    const anchorPolicy: OfficeWorkPoolAnchorPolicy = params.anchorPolicy ?? 'REQUIRE_EXISTING';
    const membershipProvenance: OfficeWorkPoolMembershipProvenance =
      params.membershipProvenance ?? 'ADMIN_DECLARED';
    const anchorProvenance: OfficeWorkPoolEpochProvenance =
      params.anchorProvenance ?? 'LEGACY_CUTOVER_IMPORT';

    // ── 1) SERIALIZATION NOKTASI — transaction'ın İLK DB ifadesi ──────────────────────────
    // Office.tenantId @unique olduğu için tenant başına TAM OLARAK bir satır vardır: doğal ve
    // tekil serialization anchor'ı. Ayrı lock tablosu / advisory lock İCAT EDİLMEZ (§11.5.2).
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Office" WHERE "tenantId" = ${tenantId} FOR UPDATE
    `;
    if (locked.length === 0) {
      // Fail-closed: kilitlenecek satır yokken Office YARATILMAZ. Yaratım `getOrCreate`'in
      // işidir ve anchor'ları da o atomik olarak yazar (§6.7).
      throw new OfficeWorkPoolOfficeMissingError(tenantId);
    }

    // ── 2) EFFECTIVE-AT — kilit ALINDIKTAN SONRA, TEK KEZ (CF-B02-03) ─────────────────────
    // `AT TIME ZONE 'UTC'` + `::timestamp(3)` migration ADIM 4 ile AYNI dönüşümdür: kolonlar
    // TIMESTAMP(3) (timezone'suz) ve Prisma onları UTC instant olarak okur/yazar. `(3)` ayrıca
    // JS Date ile saklanan değeri BİREBİR eşitler (ms altı yuvarlama farkı kalmaz).
    const effectiveAt = await this.readEffectiveAt(tx);

    // ── 3) Aynı transaction görünümünde okuma ─────────────────────────────────────────────
    const officeRow = (await tx.office.findUnique({ where: { tenantId } })) as Record<
      string,
      unknown
    > | null;
    if (officeRow === null) throw new OfficeWorkPoolOfficeMissingError(tenantId);

    const rawTargets = this.resolveRawTargets(source, officeRow);
    const requestedKinds = OFFICE_WORK_POOL_KINDS.filter(
      (kind) => rawTargets[kind] !== undefined,
    );
    if (requestedKinds.length === 0) {
      // Havuz alanı gönderilmemiş: yalnız havuz-dışı legacy alanlar yazılır. Hiçbir havuz
      // "boş hedef" sayılmaz (§3.2 UNCHANGED).
      const office = await this.writeLegacyProjection(tx, tenantId, params.legacyPassthrough, {});
      return {
        effectiveAt,
        office: office ?? officeRow,
        changes: [],
        provisionedAnchorKinds: [],
      };
    }

    const anchorByKind = new Map<OfficeWorkPoolKind, { knownFrom: Date }>();
    for (const row of await tx.officeWorkPoolEpoch.findMany({
      where: { tenantId, poolKind: { in: [...requestedKinds] } },
      select: { poolKind: true, knownFrom: true },
    })) {
      anchorByKind.set(row.poolKind, { knownFrom: row.knownFrom });
    }

    // Catch-up yolu: eksik anchor'lar AYNI transaction'da, AYNI effectiveAt ile yazılır —
    // yani anchor ile membership TEK snapshot'tır (§5.2). Admin yolu buraya asla girmez.
    const provisionedAnchorKinds: OfficeWorkPoolKind[] = [];
    if (anchorPolicy === 'PROVISION_MISSING') {
      const missing = requestedKinds.filter((kind) => !anchorByKind.has(kind));
      if (missing.length > 0) {
        await tx.officeWorkPoolEpoch.createMany({
          data: missing.map((poolKind) => ({
            tenantId,
            poolKind,
            knownFrom: effectiveAt,
            provenance: anchorProvenance,
          })),
          // @@unique([tenantId, poolKind]) üzerinde ON CONFLICT DO NOTHING (§6.7 madde 3).
          skipDuplicates: true,
        });
        for (const poolKind of missing) {
          anchorByKind.set(poolKind, { knownFrom: effectiveAt });
          provisionedAnchorKinds.push(poolKind);
        }
      }
    }

    const membershipRows = (await tx.officeWorkPoolMembership.findMany({
      where: { tenantId, poolKind: { in: [...requestedKinds] } },
      select: {
        id: true,
        tenantId: true,
        poolKind: true,
        memberLawyerId: true,
        memberStaffType: true,
        validFrom: true,
        validUntil: true,
        revokedAt: true,
      },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    })) as OfficeWorkPoolMembershipRow[];

    // ── 4) Fark hesabı ────────────────────────────────────────────────────────────────────
    const revokeRowIds: string[] = [];
    const inserts: Prisma.OfficeWorkPoolMembershipCreateManyInput[] = [];
    const changes: OfficeWorkPoolPoolChange[] = [];

    for (const poolKind of requestedKinds) {
      const carrier = OFFICE_WORK_POOL_MEMBER_CARRIER[poolKind];
      const rowsOfKind = membershipRows.filter((row) => row.poolKind === poolKind);
      const snapshot = { anchor: anchorByKind.get(poolKind) ?? null, memberships: rowsOfKind };

      // Karar AŞAMA 3'ün SAF evaluator'ından gelir; ikinci bir tarih predikatı İCAT EDİLMEZ.
      // Public resolver SERVICE'i çağrılmaz: farklı Prisma client/snapshot'ı ve okuma-yolu
      // logging semantiği bu transaction'a ait değildir (handoff §3.3).
      const evaluation =
        carrier === 'LAWYER'
          ? evaluateOfficeLawyerPool(
              poolKind as OfficeLawyerPoolKind,
              effectiveAt,
              tenantId,
              snapshot,
            )
          : evaluateOfficeStaffTypePool(
              poolKind as OfficeStaffTypePoolKind,
              effectiveAt,
              tenantId,
              snapshot,
            );

      if (evaluation.resolution.status !== 'RESOLVED') {
        // UNKNOWN üzerinde fark hesaplamak, "bilmiyorum"u "boştu" saymak demektir ve mevcut
        // üyelikleri sessizce revoke ederdi (§6.7 madde 4).
        throw new OfficeWorkPoolUnknownStateError(poolKind, evaluation.resolution.reason);
      }

      const currentKeys = new Set(evaluation.resolution.members.map((m) => String(m)));
      // Küme semantiği: aynı üyenin payload'da iki kez geçmesi TEK satır üretir; partial unique
      // index zaten ikinci açık satırı reddederdi.
      const targetKeys = [...new Set((rawTargets[poolKind] ?? []).map((m) => String(m)))];
      const targetSet = new Set(targetKeys);

      const activeRows = rowsOfKind.filter((row) =>
        isOfficeWorkPoolMembershipActiveAt(row, effectiveAt, tenantId),
      );
      const revokedKeys: string[] = [];
      for (const row of activeRows) {
        const key = carrier === 'LAWYER' ? row.memberLawyerId : row.memberStaffType;
        if (key === null) continue; // taşıyıcı uyumsuzluğu: evaluator tanı üretti, satır sonuca girmez
        if (!targetSet.has(String(key))) {
          revokeRowIds.push(row.id);
          revokedKeys.push(String(key));
        }
      }

      const addedKeys = targetKeys.filter((key) => !currentKeys.has(key));
      for (const key of addedKeys) {
        inserts.push({
          tenantId,
          poolKind,
          memberLawyerId: carrier === 'LAWYER' ? key : null,
          memberStaffType: carrier === 'STAFF_TYPE' ? (key as StaffType) : null,
          validFrom: effectiveAt,
          provenance: membershipProvenance,
          createdByUserId: actorUserId ?? null,
        });
      }

      if (revokedKeys.length > 0 && !actorUserId) {
        // DB CHECK 5 bunu `23514` ile reddeder; burada okunur biçimde ve YAZMADAN durdurulur.
        throw new OfficeWorkPoolActorRequiredError(poolKind);
      }

      changes.push({
        poolKind,
        addedMemberKeys: addedKeys,
        revokedMemberKeys: [...new Set(revokedKeys)].sort(),
        // "Değişmeyene DOKUNMA" (§11.2): kesişimdeki satırlara UPDATE/DELETE/INSERT YOK.
        // Naif "hepsini kapat, hepsini yeniden aç" her kaydetmede geçmişi parçalar ve
        // validFrom'u anlamsızlaştırır — açıkça yasaktır.
        unchangedMemberKeys: targetKeys.filter((key) => currentKeys.has(key)),
      });
    }

    // ── 5) REVOKE — irade beyanı; validUntil DEĞİŞTİRİLMEZ (§11.3) ────────────────────────
    if (revokeRowIds.length > 0) {
      await tx.officeWorkPoolMembership.updateMany({
        where: { id: { in: revokeRowIds } },
        data: { revokedAt: effectiveAt, revokedByUserId: actorUserId ?? null },
      });
    }

    // ── 6) INSERT — validFrom = effectiveAt (§11.4) ───────────────────────────────────────
    if (inserts.length > 0) {
      try {
        await tx.officeWorkPoolMembership.createMany({ data: inserts });
      } catch (error) {
        // Composite FK Lawyer(id, tenantId) cross-tenant/olmayan üyeyi DB düzeyinde reddeder
        // (§6.2). Ham 23503'ü okunur bir domain hatasına çeviririz; sınıf FATAL kalır ve
        // ASLA retry edilmez.
        const code = extractOfficeWorkPoolErrorCode(error);
        if (code === '23503' || code === 'P2003') {
          throw new OfficeWorkPoolUnknownMemberError(
            'Havuz uyesi bu tenant icin mevcut bir Lawyer kaydina isaret etmiyor.',
          );
        }
        throw error;
      }
    }

    // ── 7) LEGACY PROJEKSİYON — aynı transaction (§9.4 partial commit imkânsız) ───────────
    const legacyPoolData: Record<string, unknown> = {};
    if (source.mode === 'EXPLICIT') {
      for (const poolKind of requestedKinds) {
        // Payload BİREBİR yazılır (bugünkü replace-all davranışı korunur). Membership tarafı
        // küme semantiği uygular; parite ölçümü de sırasız KÜME eşitliğidir, dolayısıyla
        // payload'daki tekrar bir parite ihlali üretmez.
        legacyPoolData[OFFICE_WORK_POOL_LEGACY_COLUMN[poolKind]] = [...(rawTargets[poolKind] ?? [])];
      }
    }
    // ADOPT_LEGACY_SNAPSHOT (catch-up): legacy alanlara HİÇBİR yazma yapılmaz (§5.3 madde 6).
    const updatedOffice = await this.writeLegacyProjection(
      tx,
      tenantId,
      params.legacyPassthrough,
      legacyPoolData,
    );

    return {
      effectiveAt,
      office: updatedOffice ?? officeRow,
      changes,
      provisionedAnchorKinds,
    };
  }

  /**
   * Kilit sonrası TEK `effectiveAt` üretimi.
   *
   * `clock_timestamp()` `now()`'un aksine ÇAĞRI ANINI döner; kilit sonrası ilk ifade olarak
   * çağrıldığında serialization anını temsil eder (§11.5.9 madde 4).
   */
  private async readEffectiveAt(tx: Prisma.TransactionClient): Promise<Date> {
    const rows = await tx.$queryRaw<{ effective_at: unknown }[]>`
      SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS effective_at
    `;
    const value = rows[0]?.effective_at;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      // Fail-closed: geçersiz bir zaman damgasıyla tarihsel satır YAZILMAZ.
      // Mesajda saat fonksiyonunun adı BİLEREK geçmez: yapısal guard "tek saat çağrısı"
      // sayımını kaynak metinden yapar ve bir hata mesajı o sayımı kirletmemelidir.
      throw new Error('effectiveAt uretilemedi: kilit sonrasi saat sorgusu Date dondurmedi.');
    }
    return value;
  }

  /** `EXPLICIT` modda payload hedefleri; `ADOPT_LEGACY_SNAPSHOT` modda kilit altındaki legacy diziler. */
  private resolveRawTargets(
    source: OfficeWorkPoolTargetStateSource,
    officeRow: Record<string, unknown>,
  ): Partial<Record<OfficeWorkPoolKind, readonly unknown[]>> {
    const targets: Partial<Record<OfficeWorkPoolKind, readonly unknown[]>> = {};
    if (source.mode === 'ADOPT_LEGACY_SNAPSHOT') {
      for (const poolKind of OFFICE_WORK_POOL_KINDS) {
        const value = officeRow[OFFICE_WORK_POOL_LEGACY_COLUMN[poolKind]];
        targets[poolKind] = Array.isArray(value) ? (value as readonly unknown[]) : [];
      }
      return targets;
    }
    for (const poolKind of OFFICE_WORK_POOL_KINDS) {
      const value = (source.targetStates as Record<string, readonly unknown[] | undefined>)[
        poolKind
      ];
      // `undefined` = UNCHANGED. Alanı hiç göndermemek ile boş dizi göndermek AYRI hâllerdir.
      if (value !== undefined) targets[poolKind] = value;
    }
    return targets;
  }

  /** Legacy `Office` yazımı — havuz-dışı passthrough + havuz projeksiyonu TEK update'te. */
  private async writeLegacyProjection(
    tx: Prisma.TransactionClient,
    tenantId: string,
    passthrough: Record<string, unknown> | undefined,
    poolData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const data: Record<string, unknown> = { ...(passthrough ?? {}), ...poolData };
    if (Object.keys(data).length === 0) return null;
    return (await tx.office.update({
      where: { tenantId },
      data: data as Prisma.OfficeUncheckedUpdateInput,
    })) as unknown as Record<string, unknown>;
  }
}
