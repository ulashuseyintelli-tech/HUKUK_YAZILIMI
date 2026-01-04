'use client';

import { useState, useEffect } from 'react';
import { 
  Bot, 
  Play, 
  Pause, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Activity,
  Zap,
  RefreshCw,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Card, Badge, Button, Spinner } from '@hukuk/ui';
import { icrabotApi, Dashboard, QueueStats, Recipe } from '@/lib/api/icrabot';
import { cn } from '@/lib/utils';

interface IcrabotDashboardProps {
  className?: string;
}

export function IcrabotDashboard({ className }: IcrabotDashboardProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
    loadRecipes();
  }, []);

  const loadDashboard = async () => {
    try {
      const { data } = await icrabotApi.getDashboard();
      setDashboard(data);
      setError(null);
    } catch (err) {
      setError('Dashboard yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadRecipes = async () => {
    try {
      const { data } = await icrabotApi.getRecipes();
      setRecipes(data);
    } catch (err) {
      console.error('Recipes yüklenemedi:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadDashboard}>
            Tekrar Dene
          </Button>
        </div>
      </Card>
    );
  }

  const stats = dashboard?.queueStats;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Bot className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">İcrabot Otomasyon</h2>
            <p className="text-sm text-gray-500">UYAP entegrasyonlu akıllı takip sistemi</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadDashboard}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Yenile
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Bekleyen"
          value={stats?.pending || 0}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          label="Kuyrukta"
          value={stats?.queued || 0}
          icon={Activity}
          color="blue"
        />
        <StatCard
          label="Onay Bekliyor"
          value={stats?.needsApproval || 0}
          icon={AlertTriangle}
          color="orange"
        />
        <StatCard
          label="Bugün Tamamlanan"
          value={stats?.completedToday || 0}
          icon={CheckCircle}
          color="green"
        />
      </div>

      {/* Active Cases & Today Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{dashboard?.activeCases || 0}</p>
              <p className="text-sm text-gray-500">Aktif Otomasyon Dosyası</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Zap className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{dashboard?.todayActions || 0}</p>
              <p className="text-sm text-gray-500">Bugünkü İşlem</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card className="p-4">
        <h3 className="font-medium mb-4">Son Görevler</h3>
        <div className="space-y-2">
          {dashboard?.recentTasks?.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              Henüz görev yok
            </p>
          ) : (
            dashboard?.recentTasks?.slice(0, 5).map((task) => (
              <TaskRow key={task.id} task={task} recipes={recipes} />
            ))
          )}
        </div>
      </Card>

      {/* Recipe List */}
      <Card className="p-4">
        <h3 className="font-medium mb-4">Aktif Tarifler ({recipes.filter(r => r.isActive).length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {recipes.filter(r => r.isActive).slice(0, 8).map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      </Card>
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  color 
}: { 
  label: string; 
  value: number; 
  icon: any; 
  color: 'yellow' | 'blue' | 'orange' | 'green';
}) {
  const colorClasses = {
    yellow: 'bg-yellow-100 text-yellow-600',
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    green: 'bg-green-100 text-green-600',
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </Card>
  );
}

// Task Row Component
function TaskRow({ 
  task, 
  recipes 
}: { 
  task: any; 
  recipes: Recipe[];
}) {
  const recipe = recipes.find(r => r.id === task.recipeId);
  
  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    QUEUED: 'bg-blue-100 text-blue-700',
    RUNNING: 'bg-purple-100 text-purple-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    NEEDS_APPROVAL: 'bg-orange-100 text-orange-700',
  };

  const statusLabels: Record<string, string> = {
    PENDING: 'Bekliyor',
    QUEUED: 'Kuyrukta',
    RUNNING: 'Çalışıyor',
    COMPLETED: 'Tamamlandı',
    FAILED: 'Başarısız',
    NEEDS_APPROVAL: 'Onay Bekliyor',
  };

  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
          <Bot className="w-4 h-4 text-gray-600" />
        </div>
        <div>
          <p className="text-sm font-medium">{recipe?.name || task.recipeId}</p>
          <p className="text-xs text-gray-500">
            {task.case?.fileNumber || 'Dosya'}
          </p>
        </div>
      </div>
      <Badge className={statusColors[task.status] || 'bg-gray-100'}>
        {statusLabels[task.status] || task.status}
      </Badge>
    </div>
  );
}

// Recipe Card Component
function RecipeCard({ recipe }: { recipe: Recipe }) {
  const priorityColors: Record<string, string> = {
    CRITICAL: 'text-red-600',
    HIGH: 'text-orange-600',
    MEDIUM: 'text-blue-600',
    LOW: 'text-gray-600',
  };

  return (
    <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2">
        <Zap className={cn('w-4 h-4', priorityColors[recipe.priority || 'MEDIUM'])} />
        <span className="text-sm">{recipe.name}</span>
      </div>
      <div className="flex items-center gap-2">
        {recipe.requiresApproval && (
          <Badge variant="outline" className="text-xs">Onay</Badge>
        )}
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

export default IcrabotDashboard;
