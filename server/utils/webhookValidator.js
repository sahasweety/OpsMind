const dns = require('node:dns').promises;
const net = require('node:net');

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;

  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // Multicast & reserved (224.0.0.0/4)
  return false;
}

/**
 * Checks if an IPv6 address is private, loopback, or local.
 */
function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true; // Link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6
    const ipv4 = normalized.substring(7);
    if (net.isIPv4(ipv4)) return isPrivateIPv4(ipv4);
  }
  return false;
}

/**
 * Validates a webhook URL for syntax and SSRF safety.
 * Returns { valid: boolean, error?: string, parsedUrl?: URL }
 */
async function validateWebhookUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Webhook URL is required' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // 1. Only allow http: and https: protocols (https strongly encouraged)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are supported' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // In test / development mode, allow host.docker.internal for automated test receivers
  const isDevOrTest = process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOCAL_WEBHOOKS === 'true';

  // 2. Reject localhost and raw loopback identifiers
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return { valid: false, error: 'Localhost and local network addresses are not permitted' };
  }

  if (hostname === 'host.docker.internal' && isDevOrTest) {
    return { valid: true, parsedUrl: parsed };
  }

  // 3. If hostname is a literal IP, check private ranges immediately
  const ipFamily = net.isIP(hostname);
  if (ipFamily === 4) {
    if (isPrivateIPv4(hostname)) {
      return { valid: false, error: 'Private and internal IP addresses are not permitted' };
    }
  } else if (ipFamily === 6) {
    if (isPrivateIPv6(hostname)) {
      return { valid: false, error: 'Private and internal IP addresses are not permitted' };
    }
  } else {
    // 4. Resolve hostname via DNS to prevent DNS rebinding to private IPs
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { valid: false, error: 'Could not resolve hostname' };
      }

      for (const addr of addresses) {
        if (addr.family === 4 && isPrivateIPv4(addr.address)) {
          return { valid: false, error: 'Hostname resolves to a private or internal IP address' };
        }
        if (addr.family === 6 && isPrivateIPv6(addr.address)) {
          return { valid: false, error: 'Hostname resolves to a private or internal IP address' };
        }
      }
    } catch (dnsErr) {
      // In testing environments, unresolvable fake hostnames should return DNS error
      return { valid: false, error: `DNS resolution failed for hostname "${hostname}": ${dnsErr.message}` };
    }
  }

  return { valid: true, parsedUrl: parsed };
}

module.exports = {
  validateWebhookUrl,
  isPrivateIPv4,
  isPrivateIPv6
};
