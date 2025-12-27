import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

export interface GazetteNotification {
  id: string;
  date: string;
  title: string;
  description: string;
  url: string;
  type: 'TARIFE' | 'MEVZUAT' | 'DIGER';
  isRead: boolean;
  createdAt: Date;
}

@Injectable()
export class GazetteWatcherService {
  private readonly logger = new Logger(GazetteWatcherService.name);
  private notifications: GazetteNotification[] = [];
  private lastCheckDate: Date | null = null;

  // Anahtar kelimeler - tarife guncellemelerini tespit icin
  private readonly keywords = [
    'icra iflas',
    'harc',
    'tarife',
    'avukatlik',
    'noter',
    'tebligat',
    'posta ucret',
    'damga vergisi',
    'harcirah',
  ];

  constructor() {
    this.logger.log('Resmi Gazete izleyici baslatildi');
  }

  // Her gun saat 09:00'da kontrol et
  @Cron('0 9 * * *')
  async checkGazette(): Promise<void> {
    this.logger.log('Resmi Gazete kontrolu basliyor...');
    
    try {
      // Resmi Gazete RSS/API kontrolu
      const updates = await this.fetchGazetteUpdates();
      
      if (updates.length > 0) {
        this.logger.log(`${updates.length} yeni guncelleme bulundu`);
        this.notifications.push(...updates);
      }
      
      this.lastCheckDate = new Date();
    } catch (error) {
      this.logger.error('Resmi Gazete kontrol hatasi:', error);
    }
  }

  // Resmi Gazete'den guncellemeleri cek
  private async fetchGazetteUpdates(): Promise<GazetteNotification[]> {
    const updates: GazetteNotification[] = [];
    
    try {
      // Resmi Gazete RSS feed'i
      const response = await fetch('https://www.resmigazete.gov.tr/rss/eskiler.xml', {
        headers: { 'Accept': 'application/xml' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.logger.warn('Resmi Gazete RSS yanit vermedi');
        return updates;
      }

      const xmlText = await response.text();
      const items = this.parseRSS(xmlText);

      // Anahtar kelimelere gore filtrele
      for (const item of items) {
        const titleLower = item.title.toLowerCase();
        const descLower = (item.description || '').toLowerCase();
        
        const isRelevant = this.keywords.some(keyword => 
          titleLower.includes(keyword) || descLower.includes(keyword)
        );

        if (isRelevant) {
          // Daha once eklenmemisse ekle
          const exists = this.notifications.some(n => n.url === item.link);
          if (!exists) {
            updates.push({
              id: this.generateId(),
              date: item.pubDate,
              title: item.title,
              description: item.description || '',
              url: item.link,
              type: this.detectType(item.title),
              isRead: false,
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('RSS parse hatasi:', error);
    }

    return updates;
  }

  // RSS XML parse (basit regex tabanli)
  private parseRSS(xml: string): Array<{ title: string; link: string; pubDate: string; description?: string }> {
    const items: Array<{ title: string; link: string; pubDate: string; description?: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
      const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);

      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1] || titleMatch[2] || '',
          link: linkMatch[1] || '',
          pubDate: pubDateMatch ? pubDateMatch[1] : new Date().toISOString(),
          description: descMatch ? (descMatch[1] || descMatch[2]) : undefined,
        });
      }
    }

    return items;
  }

  // Tur tespiti
  private detectType(title: string): 'TARIFE' | 'MEVZUAT' | 'DIGER' {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('tarife') || titleLower.includes('harc') || titleLower.includes('ucret')) {
      return 'TARIFE';
    }
    if (titleLower.includes('kanun') || titleLower.includes('yonetmelik') || titleLower.includes('teblig')) {
      return 'MEVZUAT';
    }
    return 'DIGER';
  }

  // Benzersiz ID olustur
  private generateId(): string {
    return `gazette_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Tum bildirimleri getir
  getNotifications(unreadOnly = false): GazetteNotification[] {
    if (unreadOnly) {
      return this.notifications.filter(n => !n.isRead);
    }
    return [...this.notifications].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Bildirimi okundu olarak isaretle
  markAsRead(id: string): boolean {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.isRead = true;
      return true;
    }
    return false;
  }

  // Tum bildirimleri okundu olarak isaretle
  markAllAsRead(): number {
    let count = 0;
    for (const notification of this.notifications) {
      if (!notification.isRead) {
        notification.isRead = true;
        count++;
      }
    }
    return count;
  }

  // Son kontrol zamanini getir
  getLastCheckTime(): Date | null {
    return this.lastCheckDate;
  }

  // Manuel kontrol tetikle
  async manualCheck(): Promise<{ success: boolean; newCount: number; notifications: GazetteNotification[] }> {
    const beforeCount = this.notifications.length;
    await this.checkGazette();
    const newCount = this.notifications.length - beforeCount;
    
    return {
      success: true,
      newCount,
      notifications: this.getNotifications().slice(0, 10),
    };
  }

  // Okunmamis bildirim sayisi
  getUnreadCount(): number {
    return this.notifications.filter(n => !n.isRead).length;
  }
}
