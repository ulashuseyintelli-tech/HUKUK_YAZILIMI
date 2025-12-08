import { FileText, Users, CheckSquare, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Hoş geldiniz, bugünkü özet</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Aktif Takipler"
          value="124"
          change="+12%"
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Borçlular"
          value="89"
          change="+3%"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Bekleyen Görevler"
          value="23"
          change="-5%"
          icon={<CheckSquare className="h-5 w-5" />}
        />
        <StatCard
          title="Bu Ay Tahsilat"
          value="₺45,231"
          change="+18%"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Son Takipler</h2>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">2024/1234{i}</p>
                  <p className="text-sm text-muted-foreground">Genel Haciz Yolu</p>
                </div>
                <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                  Aktif
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Yaklaşan Görevler</h2>
          <div className="space-y-4">
            {[
              { title: "Ödeme emri tebliği", date: "Bugün", urgent: true },
              { title: "Haciz işlemi", date: "Yarın", urgent: false },
              { title: "Duruşma", date: "3 gün sonra", urgent: false },
              { title: "İtiraz süresi", date: "5 gün sonra", urgent: true },
            ].map((task, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-muted-foreground">{task.date}</p>
                </div>
                {task.urgent && (
                  <span className="text-sm bg-destructive/10 text-destructive px-2 py-1 rounded">
                    Acil
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  change,
  icon,
}: {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
}) {
  const isPositive = change.startsWith("+");
  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{title}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold">{value}</span>
        <span className={`ml-2 text-sm ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {change}
        </span>
      </div>
    </div>
  );
}
