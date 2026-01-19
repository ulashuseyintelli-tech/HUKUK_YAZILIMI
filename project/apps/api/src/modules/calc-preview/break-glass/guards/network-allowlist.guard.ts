/**
 * NetworkAllowlistGuard
 * 
 * Restricts access to internal-ops endpoints to configured CIDR ranges.
 * This enforces the network boundary requirement (INV-4).
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { BreakGlassConfigService } from '../break-glass.config';

/**
 * Parse CIDR notation into network address and mask
 */
function parseCidr(cidr: string): { network: number; mask: number } | null {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;

  const ipParts = parts[0].split('.');
  if (ipParts.length !== 4) return null;

  const maskBits = parseInt(parts[1], 10);
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return null;

  let network = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(ipParts[i], 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    network = (network << 8) | octet;
  }

  // Create mask (e.g., /24 -> 0xFFFFFF00)
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;

  return { network: network >>> 0, mask };
}

/**
 * Parse IP address to number
 */
function parseIp(ip: string): number | null {
  // Handle IPv6 localhost
  if (ip === '::1') {
    return 0x7F000001; // 127.0.0.1
  }

  // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }

  return result >>> 0;
}

/**
 * Check if IP is in CIDR range
 */
function isIpInCidr(ip: number, cidr: { network: number; mask: number }): boolean {
  return (ip & cidr.mask) === (cidr.network & cidr.mask);
}

@Injectable()
export class NetworkAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(NetworkAllowlistGuard.name);
  private readonly parsedCidrs: Array<{ network: number; mask: number; original: string }>;

  constructor(private readonly config: BreakGlassConfigService) {
    const networkConfig = this.config.getNetworkConfig();
    this.parsedCidrs = [];

    for (const cidr of networkConfig.allowedCidrs) {
      const parsed = parseCidr(cidr);
      if (parsed) {
        this.parsedCidrs.push({ ...parsed, original: cidr });
      } else {
        this.logger.warn(`Invalid CIDR in allowlist: ${cidr}`);
      }
    }

    this.logger.log(`Network allowlist initialized with ${this.parsedCidrs.length} CIDR ranges`);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Extract client IP (handle proxies)
    const clientIp = this.extractClientIp(request);
    
    if (!clientIp) {
      this.logger.warn('Could not determine client IP');
      throw new ForbiddenException({
        error: 'NETWORK_RESTRICTED',
        message: 'Access denied: could not determine client IP',
      });
    }

    const parsedIp = parseIp(clientIp);
    if (parsedIp === null) {
      this.logger.warn(`Invalid client IP format: ${clientIp}`);
      throw new ForbiddenException({
        error: 'NETWORK_RESTRICTED',
        message: 'Access denied: invalid IP format',
      });
    }

    // Check against all allowed CIDRs
    for (const cidr of this.parsedCidrs) {
      if (isIpInCidr(parsedIp, cidr)) {
        this.logger.debug(`IP ${clientIp} allowed by CIDR ${cidr.original}`);
        return true;
      }
    }

    this.logger.warn(`IP ${clientIp} not in allowed CIDR ranges`);
    throw new ForbiddenException({
      error: 'NETWORK_RESTRICTED',
      message: 'Access denied: request must originate from internal network',
    });
  }

  /**
   * Extract client IP from request, handling proxies
   */
  private extractClientIp(request: any): string | null {
    // Check X-Forwarded-For header (from load balancer/proxy)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the first IP (original client)
      const ips = Array.isArray(forwardedFor) 
        ? forwardedFor[0] 
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    // Check X-Real-IP header
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to connection remote address
    return request.ip || request.connection?.remoteAddress || null;
  }
}
