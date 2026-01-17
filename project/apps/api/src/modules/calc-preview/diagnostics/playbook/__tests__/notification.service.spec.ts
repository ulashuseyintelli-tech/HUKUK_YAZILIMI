/**
 * Notification Service Tests
 * 
 * Phase 7B - Sprint 3 - Task 3.1
 * 
 * Tests for:
 * - Channel delivery (console, webhook, slack)
 * - Dedupe logic
 * - Retry with exponential backoff
 * - Dead letter queue
 * - Template rendering
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
import { PlaybookMetricsService } from '../playbook-metrics.service';
import { TemplateVariables } from '../playbook.types';

describe('NotificationService', () => {
  let service: NotificationService;
  let metrics: PlaybookMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        PlaybookMetricsService,
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    metrics = module.get<PlaybookMetricsService>(PlaybookMetricsService);
    
    // Clear state
    service.clear();
    metrics.clear();
  });

  afterEach(() => {
    service.clear();
  });

  describe('Console Channel', () => {
    it('should deliver to console successfully', async () => {
      const variables: TemplateVariables = {
        serviceName: 'calc-preview',
        dependencyName: 'rate-provider',
        errorRate: '95',
        lastError: 'Connection timeout',
        recommendation: 'Check rate provider health',
      };

      const result = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.channel).toBe('console');
      expect(result.retryCount).toBe(0);
    });
  });

  describe('Dedupe Logic', () => {
    it('should dedupe same notification within 5 minute window', async () => {
      const variables: TemplateVariables = {
        serviceName: 'test',
      };

      // First send
      const result1 = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      expect(result1.success).toBe(true);
      expect(result1.deduplicated).toBeUndefined();

      // Second send (same incident + template + channel)
      const result2 = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      expect(result2.success).toBe(true);
      expect(result2.deduplicated).toBe(true);
    });

    it('should NOT dedupe different incidents', async () => {
      const variables: TemplateVariables = {
        serviceName: 'test',
      };

      const result1 = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      const result2 = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-2', // Different incident
        'playbook-1',
      );

      expect(result1.deduplicated).toBeUndefined();
      expect(result2.deduplicated).toBeUndefined();
    });

    it('should NOT dedupe different templates', async () => {
      const variables: TemplateVariables = {
        serviceName: 'test',
      };

      const result1 = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      const result2 = await service.send(
        'console',
        'error_rate_alert', // Different template
        variables,
        'incident-1',
        'playbook-1',
      );

      expect(result1.deduplicated).toBeUndefined();
      expect(result2.deduplicated).toBeUndefined();
    });

    it('should NOT dedupe different channels', async () => {
      // Configure webhook (will fail but that's ok for this test)
      service.configureChannel('webhook', {
        webhook: { url: 'http://invalid.local/webhook' },
      });

      const variables: TemplateVariables = {
        serviceName: 'test',
      };

      const result1 = await service.send(
        'console',
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      const result2 = await service.send(
        'webhook', // Different channel
        'circuit_breaker_alert',
        variables,
        'incident-1',
        'playbook-1',
      );

      expect(result1.deduplicated).toBeUndefined();
      expect(result2.deduplicated).toBeUndefined();
    });
  });

  describe('Template Rendering', () => {
    it('should render circuit_breaker_alert template', () => {
      const variables: TemplateVariables = {
        serviceName: 'calc-preview',
        dependencyName: 'rate-provider',
        errorRate: '95',
        lastError: 'Connection timeout',
        recommendation: 'Check rate provider health',
      };

      const rendered = service.renderTemplate('circuit_breaker_alert', variables);

      expect(rendered).toContain('Circuit Breaker Açıldı');
      expect(rendered).toContain('calc-preview');
      expect(rendered).toContain('rate-provider');
      expect(rendered).toContain('95');
      expect(rendered).toContain('Connection timeout');
    });

    it('should render error_rate_alert template', () => {
      const variables: TemplateVariables = {
        serviceName: 'calc-preview',
        errorRate: '15',
        threshold: '10',
        affectedOperation: 'calculatePreview',
        recommendation: 'Scale up instances',
      };

      const rendered = service.renderTemplate('error_rate_alert', variables);

      expect(rendered).toContain('Yüksek Hata Oranı');
      expect(rendered).toContain('15');
      expect(rendered).toContain('10');
      expect(rendered).toContain('calculatePreview');
    });

    it('should render slo_breach_alert template', () => {
      const variables: TemplateVariables = {
        sloName: 'P99 Latency',
        target: '99.9',
        current: '98.5',
        remainingBudget: '0.5',
        recommendation: 'Investigate slow queries',
      };

      const rendered = service.renderTemplate('slo_breach_alert', variables);

      expect(rendered).toContain('SLO İhlali');
      expect(rendered).toContain('P99 Latency');
      expect(rendered).toContain('99.9');
      expect(rendered).toContain('98.5');
    });

    it('should handle unknown template gracefully', () => {
      const variables: TemplateVariables = {
        message: 'Custom message',
      };

      const rendered = service.renderTemplate('unknown_template', variables);

      expect(rendered).toContain('[unknown_template]');
      expect(rendered).toContain('Custom message');
    });
  });

  describe('Webhook Channel', () => {
    it('should fail when webhook URL not configured', async () => {
      const result = await service.send(
        'webhook',
        'circuit_breaker_alert',
        { serviceName: 'test' },
        'incident-1',
        'playbook-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Webhook URL not configured');
    });
  });

  describe('Slack Channel', () => {
    it('should fail when Slack webhook URL not configured', async () => {
      const result = await service.send(
        'slack',
        'circuit_breaker_alert',
        { serviceName: 'test' },
        'incident-1',
        'playbook-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Slack webhook URL not configured');
    });
  });

  describe('Email Channel', () => {
    it('should return not implemented error', async () => {
      const result = await service.send(
        'email',
        'circuit_breaker_alert',
        { serviceName: 'test' },
        'incident-1',
        'playbook-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email channel not implemented');
    });
  });

  describe('Query Methods', () => {
    it('should return notification by ID', async () => {
      const result = await service.send(
        'console',
        'circuit_breaker_alert',
        { serviceName: 'test' },
        'incident-1',
        'playbook-1',
      );

      const notification = service.getNotification(result.notificationId);

      expect(notification).toBeDefined();
      expect(notification?.incidentId).toBe('incident-1');
      expect(notification?.template).toBe('circuit_breaker_alert');
    });

    it('should return delivery attempts', async () => {
      const result = await service.send(
        'console',
        'circuit_breaker_alert',
        { serviceName: 'test' },
        'incident-1',
        'playbook-1',
      );

      const attempts = service.getDeliveryAttempts(result.notificationId);

      expect(attempts.length).toBe(1);
      expect(attempts[0].success).toBe(true);
      expect(attempts[0].attemptNumber).toBe(1);
    });

    it('should return stats', async () => {
      await service.send('console', 'circuit_breaker_alert', { serviceName: 'test' }, 'incident-1', 'playbook-1');
      await service.send('console', 'error_rate_alert', { serviceName: 'test' }, 'incident-2', 'playbook-1');

      const stats = service.getStats();

      expect(stats.total).toBe(2);
      expect(stats.sent).toBe(2);
      expect(stats.pending).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('Idempotency Key', () => {
    it('should generate consistent idempotency key for same inputs', () => {
      const key1 = service.generateIdempotencyKey(
        'incident-1',
        'playbook-1',
        'circuit_breaker_alert',
        'console',
      );

      const key2 = service.generateIdempotencyKey(
        'incident-1',
        'playbook-1',
        'circuit_breaker_alert',
        'console',
      );

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = service.generateIdempotencyKey(
        'incident-1',
        'playbook-1',
        'circuit_breaker_alert',
        'console',
      );

      const key2 = service.generateIdempotencyKey(
        'incident-2', // Different incident
        'playbook-1',
        'circuit_breaker_alert',
        'console',
      );

      expect(key1).not.toBe(key2);
    });
  });

  describe('Channel Configuration', () => {
    it('should store and retrieve channel config', () => {
      service.configureChannel('webhook', {
        webhook: {
          url: 'https://example.com/webhook',
          headers: { 'X-API-Key': 'secret' },
        },
      });

      const config = service.getChannelConfig('webhook');

      expect(config?.webhook?.url).toBe('https://example.com/webhook');
      expect(config?.webhook?.headers?.['X-API-Key']).toBe('secret');
    });

    it('should store slack config', () => {
      service.configureChannel('slack', {
        slack: {
          webhookUrl: 'https://hooks.slack.com/services/xxx',
          channel: '#alerts',
          username: 'OpsBot',
        },
      });

      const config = service.getChannelConfig('slack');

      expect(config?.slack?.webhookUrl).toBe('https://hooks.slack.com/services/xxx');
      expect(config?.slack?.channel).toBe('#alerts');
    });
  });

  describe('Retry Queue', () => {
    it('should return empty retry queue initially', () => {
      const queue = service.getRetryQueue();
      expect(queue).toEqual([]);
    });
  });

  describe('Dead Letter Queue', () => {
    it('should return empty dead letter queue initially', () => {
      const queue = service.getDeadLetterQueue();
      expect(queue).toEqual([]);
    });
  });
});
