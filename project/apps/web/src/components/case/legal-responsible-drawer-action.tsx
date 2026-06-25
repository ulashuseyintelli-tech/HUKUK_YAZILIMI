"use client";

// WP-1d-5-6: Avukat drawer'ı içindeki Hukuki Sorumlu Avukat kaydı KANONİK aksiyonu.
// Kanonik yol: bu aksiyon yalnız LegalResponsibleLawyerModal'ı açar (reason zorunlu + ADMIN hard guard +
// PATCH /cases/:id/legal-responsible-lawyer). Generic rol kaydetme (updateCaseLawyer / "Bu dosya için kaydet")
// üzerinden RESPONSIBLE YAZILMAZ — bu yüzden hukuki sorumlu kaydı yalnız buradan değiştirilir.
// Mevcut hukuki sorumlu avukat için aksiyon GÖSTERİLMEZ; salt bilgi gösterilir.

interface Props {
  isCurrentResponsible: boolean;
  onChangeRequest: () => void;
}

export function LegalResponsibleDrawerAction({ isCurrentResponsible, onChangeRequest }: Props) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-1.5">
      <span className="block text-xs font-medium text-blue-800">Hukuki Sorumlu Avukat Kaydı</span>
      {isCurrentResponsible ? (
        <p className="text-[11px] text-blue-700">Bu avukat mevcut Hukuki Sorumlu Avukat.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={onChangeRequest}
            className="w-full text-[12px] text-blue-700 border border-blue-200 bg-white hover:bg-blue-100 rounded px-2 py-1.5"
          >
            Hukuki Sorumlu Avukat Kaydını Bu Avukat Olarak Değiştir
          </button>
          <p className="text-[10px] text-gray-500">
            Değişiklik nedeni istenir. Hukuki sorumlu avukat kaydı kurallı şekilde değiştirilir.
          </p>
        </>
      )}
    </div>
  );
}

export default LegalResponsibleDrawerAction;
