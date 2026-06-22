/**
 * G6 Backfill — SAF (DB'siz) bucket sınıflandırıcı. Test edilebilir çekirdek.
 * Tasarım: project/docs/g6-backfill-script-design.md (§3 Nihai Kural).
 *
 * Karar mantığı burada izole + saf tutulur (fix-case-lawyer-responsible-drift.core deseni);
 * dry-run script yalnız Prisma'yı bağlar, kuralı bu modülden çağırır. Apply fazı (PR-2) de
 * AYNI bu çekirdeği kullanır → tek-kaynak.
 *
 * al = aktif avukat (CaseLawyer ⋈ Lawyer.isActive) · rl = bunlardan isResponsible=true olanlar.
 */

export type G6Bucket = "R1" | "R2" | "R3" | "R4" | "AMBIGUOUS";
export type G6Action = "WOULD_ASSIGN" | "MANUAL_QUEUE";

export interface G6CaseInput {
  /** aktif (Lawyer.isActive) CaseLawyer lawyerId'leri */
  activeLawyerIds: string[];
  /** activeLawyerIds içinden isResponsible=true olanlar */
  responsibleLawyerIds: string[];
  /** tenant founder (resolve edilmiş, aktif) ya da null */
  founderLawyerId: string | null;
}

export interface G6Decision {
  bucket: G6Bucket;
  /** WOULD_ASSIGN ise yazılacak responsibleLawyerId; MANUAL_QUEUE ise null */
  chosenOwnerLawyerId: string | null;
  action: G6Action;
  reason: string;
}

/**
 * Nihai kural (ulas 2026-06-23):
 *   R1  al==1                 → o avukat               [WOULD_ASSIGN, Faz-1]
 *   R2  al>1 & rl==1          → o sorumlu avukat       [WOULD_ASSIGN, Faz-1]
 *   AMBIGUOUS al>1 & rl>1     → veri çelişkisi         [MANUAL_QUEUE]  (founder DEĞİL)
 *   R3  al>1 & rl==0          → founder fallback        [Faz-2]; founder yoksa MANUAL_QUEUE
 *   R4  al==0                 → founder fallback        [Faz-2]; founder yoksa MANUAL_QUEUE
 */
export function classifyG6(input: G6CaseInput): G6Decision {
  const al = input.activeLawyerIds.length;
  const rl = input.responsibleLawyerIds.length;

  // R1 — tek aktif avukat (isResponsible'dan bağımsız)
  if (al === 1) {
    return { bucket: "R1", chosenOwnerLawyerId: input.activeLawyerIds[0], action: "WOULD_ASSIGN", reason: "R1: tek aktif avukat" };
  }

  if (al > 1) {
    // R2 — çoklu avukat, tek isResponsible
    if (rl === 1) {
      return { bucket: "R2", chosenOwnerLawyerId: input.responsibleLawyerIds[0], action: "WOULD_ASSIGN", reason: "R2: tek sorumlu avukat" };
    }
    // AMBIGUOUS — çoklu avukat, birden çok isResponsible → veri çelişkisi → manuel
    if (rl > 1) {
      return { bucket: "AMBIGUOUS", chosenOwnerLawyerId: null, action: "MANUAL_QUEUE", reason: `AMBIGUOUS: ${rl} isResponsible avukat (veri çelişkisi) → manuel kuyruk` };
    }
    // R3 — çoklu avukat, sorumlu yok → founder fallback
    if (input.founderLawyerId) {
      return { bucket: "R3", chosenOwnerLawyerId: input.founderLawyerId, action: "WOULD_ASSIGN", reason: "R3: çoklu avukat, sorumlu yok → founder fallback" };
    }
    return { bucket: "R3", chosenOwnerLawyerId: null, action: "MANUAL_QUEUE", reason: "R3: çoklu avukat, sorumlu yok ama founder yok → manuel kuyruk" };
  }

  // R4 — al == 0, avukat yok → founder fallback
  if (input.founderLawyerId) {
    return { bucket: "R4", chosenOwnerLawyerId: input.founderLawyerId, action: "WOULD_ASSIGN", reason: "R4: avukat yok → founder fallback" };
  }
  return { bucket: "R4", chosenOwnerLawyerId: null, action: "MANUAL_QUEUE", reason: "R4: avukat yok ve founder yok → manuel kuyruk" };
}
