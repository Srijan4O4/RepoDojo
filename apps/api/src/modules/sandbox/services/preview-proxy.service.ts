export interface PreviewRouteConfig {
  sessionId: string;
  subdomain: string;
  frontendTarget: string;
  backendTarget: string;
  caddySnippet: string;
}

export class PreviewProxyService {
  /**
   * Generates dynamic Caddy reverse proxy routing rule for a sandbox session (Decision 6.3).
   */
  public static generateRouteConfig(sessionId: string, bridgeIp: string): PreviewRouteConfig {
    const subdomain = `${sessionId}.preview.repodojo-preview.net`;
    const frontendTarget = `http://${bridgeIp}:5173`;
    const backendTarget = `http://${bridgeIp}:5000`;

    const caddySnippet = `
${subdomain} {
  # Reverse proxy API requests to backend
  handle /api/* {
    reverse_proxy ${backendTarget}
  }

  # Reverse proxy all other paths to Vite frontend
  handle {
    reverse_proxy ${frontendTarget}
  }

  # Security headers
  header {
    X-Frame-Options "SAMEORIGIN"
    X-Content-Type-Options "nosniff"
    Content-Security-Policy "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;"
  }
}
`.trim();

    return {
      sessionId,
      subdomain,
      frontendTarget,
      backendTarget,
      caddySnippet,
    };
  }
}
