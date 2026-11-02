/**
 * Package Admission & "Slopsquatting" Hallucination Defense Service
 * ADR-001 Decision 12.3 / PRD §13.3, §18.14
 * Protects monorepo & candidate sandboxes against AI-hallucinated or typo-squatted dependencies.
 */

export interface PackageValidationResult {
  packageName: string;
  allowed: boolean;
  reason?: string;
}

export class PackageAdmissionService {
  // Known popular packages and common malicious typo-squat variations
  private static readonly KNOWN_PACKAGES: Record<string, string[]> = {
    express: ['expres', 'expresss', 'express-js', 'expressjs'],
    lodash: ['lodashs', 'loadsh', 'lodash-js'],
    mongoose: ['mongose', 'mongoos', 'mongoose-js'],
    axios: ['axio', 'axioss', 'axios-http'],
    react: ['reac', 'reactjs', 'react-core'],
    vitest: ['vitestt', 'vitetest'],
    jest: ['jestt', 'jest-test'],
  };

  private static readonly SUSPICIOUS_SUBSTRINGS = [
    'stealer',
    'discord-token',
    'token-logger',
    'reverse-shell',
    'crypto-miner',
    'backdoor',
    'keylogger',
  ];

  private static readonly VALID_NPM_NAME_REGEX =
    /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

  /**
   * Validates a candidate dependency name against hallucination and typo-squat rules.
   */
  public static validatePackage(packageName: string): PackageValidationResult {
    const trimmed = packageName.trim().toLowerCase();

    // 1. Syntax & Naming Specification Check
    if (!trimmed || !this.VALID_NPM_NAME_REGEX.test(trimmed)) {
      return {
        packageName: trimmed,
        allowed: false,
        reason: 'INVALID_PACKAGE_NAME_SYNTAX',
      };
    }

    // 2. Suspicious Malicious Substrings
    for (const sub of this.SUSPICIOUS_SUBSTRINGS) {
      if (trimmed.includes(sub)) {
        return {
          packageName: trimmed,
          allowed: false,
          reason: `SUSPICIOUS_NAME_PATTERN_DETECTED: "${sub}"`,
        };
      }
    }

    // 3. Typo-Squat Heuristic Check
    for (const [legit, squattedList] of Object.entries(this.KNOWN_PACKAGES)) {
      if (squattedList.includes(trimmed)) {
        return {
          packageName: trimmed,
          allowed: false,
          reason: `TYPO_SQUAT_DETECTED: Likely intended "${legit}" instead of "${trimmed}"`,
        };
      }
    }

    return {
      packageName: trimmed,
      allowed: true,
    };
  }

  /**
   * Validates an entire dependencies block from a candidate's package.json.
   */
  public static validateManifestDependencies(
    dependencies: Record<string, string>
  ): {
    valid: boolean;
    violations: PackageValidationResult[];
  } {
    const violations: PackageValidationResult[] = [];

    for (const pkg of Object.keys(dependencies)) {
      const result = this.validatePackage(pkg);
      if (!result.allowed) {
        violations.push(result);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}
