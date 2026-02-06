/**
 * IP Address Normalizer
 * 
 * Phase 10.2 - Task 2.1
 * 
 * Normalizes IP addresses to canonical form for consistent hashing.
 * 
 * Rules:
 * - Trim + lowercase
 * - IPv4-mapped IPv6 (::ffff:x.x.x.x) → IPv4
 * - IPv6 canonical form (compressed, lowercase)
 */

import * as net from 'net';

/**
 * Normalize an IP address to canonical form.
 * 
 * @param ip - Raw IP address string
 * @returns Canonical IP string, or null if invalid
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) return null;
  
  // First check for IPv4-mapped IPv6 (before net.isIP which may not handle all cases)
  const mapped = extractIpv4FromMapped(trimmed);
  if (mapped) return mapped;
  
  // Check if valid IP
  const ipVersion = net.isIP(trimmed);
  if (ipVersion === 0) {
    return null;
  }
  
  if (ipVersion === 4) {
    // IPv4 - already canonical
    return trimmed;
  }
  
  // IPv6 - normalize
  return normalizeIpv6(trimmed);
}

/**
 * Extract IPv4 from IPv4-mapped IPv6 address.
 * 
 * Examples:
 * - ::ffff:192.168.1.1 → 192.168.1.1
 * - ::ffff:c0a8:0101 → 192.168.1.1
 */
function extractIpv4FromMapped(ip: string): string | null {
  // Pattern: ::ffff:x.x.x.x
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
  const matchDotted = ip.match(mappedDotted);
  if (matchDotted) {
    const ipv4 = matchDotted[1];
    return net.isIPv4(ipv4) ? ipv4 : null;
  }
  
  // Pattern: ::ffff:xxxx:xxxx (hex notation)
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
  const matchHex = ip.match(mappedHex);
  if (matchHex) {
    const high = parseInt(matchHex[1], 16);
    const low = parseInt(matchHex[2], 16);
    const a = (high >> 8) & 0xff;
    const b = high & 0xff;
    const c = (low >> 8) & 0xff;
    const d = low & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }
  
  return null;
}

/**
 * Normalize IPv6 address to canonical compressed form.
 * 
 * Examples:
 * - 0:0:0:0:0:0:0:1 → ::1
 * - 2001:0db8:0000:0000:0000:0000:0000:0001 → 2001:db8::1
 */
function normalizeIpv6(ip: string): string | null {
  // Parse IPv6 into 8 groups
  const groups = parseIpv6Groups(ip);
  if (!groups) return null;
  
  // Find longest run of zeros for compression
  let longestStart = -1;
  let longestLen = 0;
  let currentStart = -1;
  let currentLen = 0;
  
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (currentStart === -1) {
        currentStart = i;
        currentLen = 1;
      } else {
        currentLen++;
      }
    } else {
      if (currentLen > longestLen) {
        longestStart = currentStart;
        longestLen = currentLen;
      }
      currentStart = -1;
      currentLen = 0;
    }
  }
  if (currentLen > longestLen) {
    longestStart = currentStart;
    longestLen = currentLen;
  }
  
  // Build canonical string
  const parts: string[] = [];
  let i = 0;
  
  while (i < 8) {
    if (i === longestStart && longestLen > 1) {
      parts.push('');
      if (i === 0) parts.push('');
      i += longestLen;
      if (i === 8) parts.push('');
    } else {
      parts.push(groups[i].toString(16));
      i++;
    }
  }
  
  return parts.join(':');
}

/**
 * Parse IPv6 string into 8 16-bit groups.
 */
function parseIpv6Groups(ip: string): number[] | null {
  // Handle :: expansion
  const parts = ip.split('::');
  if (parts.length > 2) return null;
  
  let left: string[] = [];
  let right: string[] = [];
  
  if (parts[0]) {
    left = parts[0].split(':');
  }
  if (parts.length === 2 && parts[1]) {
    right = parts[1].split(':');
  }
  
  const totalParts = left.length + right.length;
  if (totalParts > 8) return null;
  
  const groups: number[] = [];
  
  // Add left parts
  for (const part of left) {
    const num = parseInt(part, 16);
    if (isNaN(num) || num < 0 || num > 0xffff) return null;
    groups.push(num);
  }
  
  // Add zeros for ::
  const zerosNeeded = 8 - totalParts;
  for (let i = 0; i < zerosNeeded; i++) {
    groups.push(0);
  }
  
  // Add right parts
  for (const part of right) {
    const num = parseInt(part, 16);
    if (isNaN(num) || num < 0 || num > 0xffff) return null;
    groups.push(num);
  }
  
  if (groups.length !== 8) return null;
  
  return groups;
}
