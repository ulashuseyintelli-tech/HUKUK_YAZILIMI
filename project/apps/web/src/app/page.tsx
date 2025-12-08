import Link from "next/link";
import { Scale, Shield, Zap, Users } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Hukuk Platform</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-muted-foreground hover:text-foreground">
              Özellikler
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground">
              Fiyatlandırma
            </Link>
            <Link href="/auth/login" className="text-muted-foreground hover:text-foreground">
              Giriş Yap
            </Link>
            <Link
              href="/auth/register"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
            >
              Ücretsiz Başla
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          İcra Takip Süreçlerinizi
          <span className="text-primary block">Dijitalleştirin</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Hukuk büronuz için tasarlanmış modern, güvenli ve kullanımı kolay icra takip yazılımı.
          Tüm dosyalarınızı tek platformda yönetin.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/register"
            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90"
          >
            Ücretsiz Deneyin
          </Link>
          <Link
            href="#demo"
            className="border border-input px-8 py-3 rounded-lg text-lg font-medium hover:bg-accent"
          >
            Demo İzle
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Neden Hukuk Platform?</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={<Zap className="h-10 w-10 text-primary" />}
            title="Hızlı ve Modern"
            description="Son teknoloji ile geliştirilmiş, hızlı ve responsive arayüz"
          />
          <FeatureCard
            icon={<Shield className="h-10 w-10 text-primary" />}
            title="Güvenli"
            description="Verileriniz şifreli ve güvende. KVKK uyumlu altyapı"
          />
          <FeatureCard
            icon={<Users className="h-10 w-10 text-primary" />}
            title="Ekip Çalışması"
            description="Avukatlar ve personel için rol bazlı yetkilendirme"
          />
          <FeatureCard
            icon={<Scale className="h-10 w-10 text-primary" />}
            title="Hukuka Özel"
            description="İcra takip süreçlerine özel tasarlanmış modüller"
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-slate-50 py-12">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 Hukuk Platform. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
