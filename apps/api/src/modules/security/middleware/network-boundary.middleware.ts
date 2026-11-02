import type { Request, Response, NextFunction } from 'express';

export class NetworkBoundaryValidator {
  private static readonly METADATA_HOSTS = [
    '169.254.169.254',
    'metadata.google.internal',
    'fd00:ec2::254',
    'instance-data',
  ];

  /**
   * Evaluates an IP address or hostname to determine if it targets
   * restricted cloud metadata, loopback, or private RFC 1918 networks (Decision 12.1).
   */
  public static isRestrictedTarget(target: string): { restricted: boolean; reason?: string } {
    if (!target) {
      return { restricted: false };
    }

    const normalized = target.trim().toLowerCase();

    // 1. Cloud Metadata Service (SSRF Protection including IPv6 metadata)
    if (this.METADATA_HOSTS.some((m) => normalized === m || normalized.includes(m))) {
      return {
        restricted: true,
        reason: 'CLOUD_METADATA_ENDPOINT_BLOCKED',
      };
    }

    // Strip port for IPv4 or hostname
    const host = normalized.includes(':') && !normalized.includes('::')
      ? normalized.split(':')[0]
      : normalized;

    // 2. Loopback validation
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return {
        restricted: true,
        reason: 'LOOPBACK_TARGET_RESTRICTED',
      };
    }

    // 3. RFC 1918 Private IPv4 Subnets
    // 10.0.0.0/8
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return { restricted: true, reason: 'RFC1918_10_NET_RESTRICTED' };
    }

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    const match172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (match172) {
      const secondOctet = parseInt(match172[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return { restricted: true, reason: 'RFC1918_172_NET_RESTRICTED' };
      }
    }

    // 192.168.0.0/16
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return { restricted: true, reason: 'RFC1918_192_168_NET_RESTRICTED' };
    }

    return { restricted: false };
  }
}

/**
 * Express middleware protecting against SSRF attacks targeting
 * private platform subnets, databases, and cloud metadata services.
 */
export function enforceNetworkBoundary(req: Request, res: Response, next: NextFunction): void {
  const target =
    (req.query.target as string) ||
    (req.query.url as string) ||
    req.body?.targetUrl ||
    req.body?.proxyTarget ||
    req.headers['x-forwarded-host'];

  if (target && typeof target === 'string') {
    const { restricted, reason } = NetworkBoundaryValidator.isRestrictedTarget(target);
    if (restricted) {
      res.status(403).json({
        error: 'NETWORK_BOUNDARY_VIOLATION',
        message: `Target "${target}" violates platform network trust boundary isolation policy.`,
        reason,
      });
      return;
    }
  }

  next();
}
