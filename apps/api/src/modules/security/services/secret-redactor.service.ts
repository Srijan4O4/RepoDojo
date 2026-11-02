/**
 * Pre-Inference Secret Redaction Engine (ADR-001 Decision 12.2)
 * Detects sensitive credentials, API keys, tokens, and connection strings
 * in untrusted candidate code and logs, replacing them with typed placeholders.
 */

export interface SecretScanResult {
  redactedText: string;
  secretsDetectedCount: number;
  typesDetected: string[];
}

export class SecretRedactorService {
  private static readonly SECRET_PATTERNS: Array<{
    type: string;
    regex: RegExp;
    placeholder: string;
  }> = [
    {
      type: 'GOOGLE_API_KEY',
      regex: /\bAIza[0-9A-Za-z-_]{30,45}\b/g,
      placeholder: '[REDACTED_GOOGLE_API_KEY]',
    },
    {
      type: 'GITHUB_TOKEN',
      regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
      placeholder: '[REDACTED_GITHUB_TOKEN]',
    },
    {
      type: 'AWS_ACCESS_KEY',
      regex: /\bAKIA[0-9A-Z]{16}\b/g,
      placeholder: '[REDACTED_AWS_KEY]',
    },
    {
      type: 'JWT_TOKEN',
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      placeholder: '[REDACTED_JWT]',
    },
    {
      type: 'PEM_PRIVATE_KEY',
      regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      placeholder: '[REDACTED_PRIVATE_KEY]',
    },
    {
      type: 'MONGODB_URI',
      regex: /mongodb(?:\+srv)?:\/\/[^\s"'`<>]+/g,
      placeholder: '[REDACTED_MONGODB_URI]',
    },
    {
      type: 'POSTGRES_OR_MYSQL_URI',
      regex: /(?:postgres|postgresql|mysql):\/\/[^\s"'`<>]+/g,
      placeholder: '[REDACTED_DB_URI]',
    },
    {
      type: 'REDIS_URI',
      regex: /redis:\/\/[^\s"'`<>]+/g,
      placeholder: '[REDACTED_REDIS_URI]',
    },
  ];

  /**
   * Scans text in-memory and scrubs all identified credentials.
   */
  public static scrub(text: string): SecretScanResult {
    if (!text) {
      return { redactedText: '', secretsDetectedCount: 0, typesDetected: [] };
    }

    let result = text;
    let count = 0;
    const typesDetected = new Set<string>();

    for (const pattern of this.SECRET_PATTERNS) {
      const matches = result.match(pattern.regex);
      if (matches && matches.length > 0) {
        count += matches.length;
        typesDetected.add(pattern.type);
        result = result.replace(pattern.regex, pattern.placeholder);
      }
    }

    return {
      redactedText: result,
      secretsDetectedCount: count,
      typesDetected: Array.from(typesDetected),
    };
  }

  /**
   * Quick check if a given string contains sensitive credentials.
   */
  public static containsSecrets(text: string): boolean {
    if (!text) return false;
    return this.SECRET_PATTERNS.some((p) => p.regex.test(text));
  }
}
