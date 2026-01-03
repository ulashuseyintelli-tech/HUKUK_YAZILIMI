'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import { 
  History, 
  Mail, 
  Database, 
  Building2, 
  FolderSync,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { api, ResearchTimelineItem } from '@/lib/api';

interface ResearchTimelineProps {
  caseDebtorId: string;
}

const TYPE_CONFIG: Record<string, {
  icon: React.ReactNode;
  color: string;
}> = {
  CLIENT_INFO: {
    icon: <Mail className="w-4 h-4" />,
    color: 'bg-purple-100 text-purple-700',
  },
  UYAP_QUERY: {
    icon: <Database className="w-4 h-4" />,
    color: 'bg-blue-100 text-blue-700',
  },
  INSTITUTION_LETTER: {
    icon: <Building2 className="w-4 h-4" />,
    color: 'bg-orange-100 text-orange-700',
  },
  CROSS_FILE: {
    icon: <FolderSync className="w-4 h-4" />,
    color: 'bg-cyan-100 text-cyan-700',
  },
  ADDRESS_ADDED: {
    icon: <MapPin className="w-4 h-4" />,
    color: 'bg-green-100 text-green-700',
  },
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircle2 className="w-3 h-3 text-green-500" />,
  PENDING: <Clock className="w-3 h-3 text-yellow-500" />,
  FAILED: <XCircle className="w-3 h-3 text-red-500" />,
  SENT: <Mail className="w-3 h-3 text-blue-500" />,
  RESPONDED: <CheckCircle2 className="w-3 h-3 text-green-500" />,
};

export function ResearchTimeline({ caseDebtorId }: ResearchTimelineProps) {
  const [items, setItems] = useState<ResearchTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [caseDebtorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.getResearchTimeline(caseDebtorId);
      setItems(data);
    } catch (error) {
      console.error('Timeline yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Bugün ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1) {
      return `Dün ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays < 7) {
      return `${diffDays} gün önce`;
    }
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          Araştırma Geçmişi
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Henüz araştırma geçmişi yok
          </p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4">
              {items.map((item, index) => {
                const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.ADDRESS_ADDED;
                const statusIcon = STATUS_ICONS[item.status];

                return (
                  <div key={item.id} className="relative flex gap-4">
                    {/* Icon */}
                    <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
                      {config.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            {item.title}
                            {statusIcon}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {formatDate(item.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
