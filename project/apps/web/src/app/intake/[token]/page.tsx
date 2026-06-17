"use client";

import { useEffect, useState } from "react";
import { getIntakeForm, submitIntake, IntakeFormSchema } from "@/lib/intake-api";

// Kategori → görünen etiket (statik; backend enum'ları). PII içermez.
const CATEGORY_LABELS: Record<string, string> = {
  INCOME_SOURCE: "Gelir Kaynağı",
  COMMERCIAL_RELATION: "Ticari İlişki",
  FAMILY_CIRCLE: "Aile / Yakın Çevre",
  DIGITAL_FOOTPRINT: "Dijital İz (sosyal medya, web)",
  PAYMENT_HISTORY: "Tahsilat Geçmişi",
  STRATEGY: "Dosya Stratejisi",
  ADDRESS: "Adres",
  ASSET: "Varlık (araç, gayrimenkul vb.)",
  CONTACT: "İletişim (telefon, e-posta)",
};

type Phase = "loading" | "ready" | "invalid" | "submitting" | "done";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border border-slate-200 p-6">{children}</div>
    </div>
  );
}

export default function IntakeFormPage({ params }: { params: { token: string } }) {
  const [schema, setSchema] = useState<IntakeFormSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [hp, setHp] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getIntakeForm(params.token)
      .then((s) => { if (active) { setSchema(s); setPhase("ready"); } })
      .catch(() => { if (active) setPhase("invalid"); });
    return () => { active = false; };
  }, [params.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields = Object.entries(values)
      .filter(([, v]) => v.trim().length > 0)
      .map(([category, value]) => ({ category, value: value.trim() }));
    if (fields.length === 0) {
      setError("Lütfen en az bir alan doldurun.");
      return;
    }
    setError("");
    setPhase("submitting");
    try {
      await submitIntake(params.token, fields, hp);
      setPhase("done");
    } catch {
      // Generic — link var/yok / süre / limit ayrımı sızdırılmaz.
      setError("Form gönderilemedi. Bağlantı geçersiz veya süresi dolmuş olabilir.");
      setPhase("ready");
    }
  };

  if (phase === "loading") return <Shell><p className="text-slate-500 text-center">Yükleniyor…</p></Shell>;
  if (phase === "invalid") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-slate-800 mb-2">Bağlantı geçersiz</h1>
        <p className="text-slate-600">Bu bilgi formu bağlantısı geçersiz veya süresi dolmuş. Lütfen büronuzla iletişime geçin.</p>
      </Shell>
    );
  }
  if (phase === "done") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-slate-800 mb-2">Teşekkürler</h1>
        <p className="text-slate-600">Bilgileriniz tarafımıza ulaştı. İlginiz için teşekkür ederiz.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-slate-800 mb-1">{schema?.title ?? "Bilgi Formu"}</h1>
      <p className="text-sm text-slate-500 mb-4">Aşağıdaki bilgilerden bildiklerinizi paylaşabilirsiniz. Boş bıraktığınız alanlar gönderilmez.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(schema?.scope ?? []).map((cat) => (
          <div key={cat}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{CATEGORY_LABELS[cat] ?? cat}</label>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              rows={2}
              value={values[cat] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [cat]: e.target.value }))}
              maxLength={4000}
            />
          </div>
        ))}

        {/* Honeypot — gerçek kullanıcı görmez/doldurmaz; bot doldurursa backend sessizce yok sayar. */}
        <input
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={phase === "submitting"}
          className="w-full bg-slate-800 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-60"
        >
          {phase === "submitting" ? "Gönderiliyor…" : "Gönder"}
        </button>
      </form>
    </Shell>
  );
}
