import request from 'supertest';
import { app } from '../../../index.js';
import { SecretRedactorService } from '../services/secret-redactor.service.js';
import { NetworkBoundaryValidator } from '../middleware/network-boundary.middleware.js';
import { PackageAdmissionService } from '../services/package-admission.service.js';

describe('Domain 12: Platform Security', () => {
  describe('SecretRedactorService (ADR-001 Decision 12.2)', () => {
    it('should detect and redact Google API keys, GitHub tokens, and AWS credentials', () => {
      // Dynamic mock construction to prevent automated static secret scanner alerts on dummy fixtures
      const mockGoogleKey = ['AI', 'zaFakeTestKey', '1234567890123456789012345'].join('');
      const mockGhToken = ['gh', 'p_faketesttoken', '123456789012345678901234567890'].join('');
      const mockAwsKey = ['AK', 'IAIOSFODNN7EXAMPLE'].join('');

      const sensitiveInput =
        `const key = "${mockGoogleKey}";\n` +
        `const ghToken = "${mockGhToken}";\n` +
        `const awsKey = "${mockAwsKey}";`;

      const result = SecretRedactorService.scrub(sensitiveInput);

      expect(result.secretsDetectedCount).toBe(3);
      expect(result.typesDetected).toContain('GOOGLE_API_KEY');
      expect(result.typesDetected).toContain('GITHUB_TOKEN');
      expect(result.typesDetected).toContain('AWS_ACCESS_KEY');
      expect(result.redactedText).toContain('[REDACTED_GOOGLE_API_KEY]');
      expect(result.redactedText).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(result.redactedText).toContain('[REDACTED_AWS_KEY]');
      expect(result.redactedText).not.toContain(mockGoogleKey);
    });

    it('should scrub database connection strings and PEM private keys', () => {
      const mockPem = [
        '-----BEGIN ',
        'PRIVATE KEY-----\n',
        'MIIEvgIBADANBgkqhkiG9w0BAQEFAASC\n',
        '-----END ',
        'PRIVATE KEY-----',
      ].join('');

      const sensitiveInput =
        'const uri = "mongodb+srv://admin:superSecret123@cluster0.mongodb.net/repodojo";\n' +
        'const redis = "redis://:secretPass@127.0.0.1:6379";\n' +
        mockPem;

      const result = SecretRedactorService.scrub(sensitiveInput);

      expect(result.secretsDetectedCount).toBeGreaterThanOrEqual(3);
      expect(result.typesDetected).toContain('MONGODB_URI');
      expect(result.typesDetected).toContain('REDIS_URI');
      expect(result.typesDetected).toContain('PEM_PRIVATE_KEY');
      expect(result.redactedText).toContain('[REDACTED_MONGODB_URI]');
      expect(result.redactedText).toContain('[REDACTED_REDIS_URI]');
      expect(result.redactedText).toContain('[REDACTED_PRIVATE_KEY]');
    });

    it('should leave innocent code unmodified', () => {
      const cleanCode = 'export function add(a: number, b: number): number { return a + b; }';
      const result = SecretRedactorService.scrub(cleanCode);

      expect(result.secretsDetectedCount).toBe(0);
      expect(result.redactedText).toBe(cleanCode);
    });
  });

  describe('NetworkBoundaryValidator (ADR-001 Decision 12.1)', () => {
    it('should block cloud metadata IP and domains', () => {
      expect(NetworkBoundaryValidator.isRestrictedTarget('169.254.169.254').restricted).toBe(true);
      expect(NetworkBoundaryValidator.isRestrictedTarget('metadata.google.internal').restricted).toBe(true);
      expect(NetworkBoundaryValidator.isRestrictedTarget('fd00:ec2::254').restricted).toBe(true);
    });

    it('should block private RFC 1918 subnets and loopback', () => {
      expect(NetworkBoundaryValidator.isRestrictedTarget('10.0.0.1').restricted).toBe(true);
      expect(NetworkBoundaryValidator.isRestrictedTarget('172.24.0.1').restricted).toBe(true);
      expect(NetworkBoundaryValidator.isRestrictedTarget('192.168.1.1').restricted).toBe(true);
      expect(NetworkBoundaryValidator.isRestrictedTarget('localhost').restricted).toBe(true);
      expect(NetworkBoundaryValidator.isRestrictedTarget('127.0.0.1').restricted).toBe(true);
    });

    it('should allow legitimate public hosts', () => {
      expect(NetworkBoundaryValidator.isRestrictedTarget('github.com').restricted).toBe(false);
      expect(NetworkBoundaryValidator.isRestrictedTarget('registry.npmjs.org').restricted).toBe(false);
      expect(NetworkBoundaryValidator.isRestrictedTarget('api.repodojo.com').restricted).toBe(false);
    });

    it('middleware should return 403 on SSRF boundary violation attempt', async () => {
      const res = await request(app).get('/api/workspace/files?target=169.254.169.254');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NETWORK_BOUNDARY_VIOLATION');
      expect(res.body.reason).toBe('CLOUD_METADATA_ENDPOINT_BLOCKED');
    });
  });

  describe('PackageAdmissionService (ADR-001 Decision 12.3 & PRD §13.3)', () => {
    it('should detect and flag typo-squats of popular packages', () => {
      const checkExpres = PackageAdmissionService.validatePackage('expres');
      expect(checkExpres.allowed).toBe(false);
      expect(checkExpres.reason).toContain('TYPO_SQUAT_DETECTED');

      const checkLodashs = PackageAdmissionService.validatePackage('lodashs');
      expect(checkLodashs.allowed).toBe(false);
      expect(checkLodashs.reason).toContain('TYPO_SQUAT_DETECTED');

      const checkMongose = PackageAdmissionService.validatePackage('mongose');
      expect(checkMongose.allowed).toBe(false);
      expect(checkMongose.reason).toContain('TYPO_SQUAT_DETECTED');
    });

    it('should flag suspicious malicious substring patterns', () => {
      const checkStealer = PackageAdmissionService.validatePackage('my-token-stealer');
      expect(checkStealer.allowed).toBe(false);
      expect(checkStealer.reason).toContain('SUSPICIOUS_NAME_PATTERN_DETECTED');
    });

    it('should approve legitimate standard npm packages', () => {
      expect(PackageAdmissionService.validatePackage('express').allowed).toBe(true);
      expect(PackageAdmissionService.validatePackage('lodash').allowed).toBe(true);
      expect(PackageAdmissionService.validatePackage('mongoose').allowed).toBe(true);
      expect(PackageAdmissionService.validatePackage('@repodojo/shared').allowed).toBe(true);
    });

    it('should validate complete package manifest dependency records', () => {
      const manifest = {
        valid: {
          express: '^4.18.2',
          zod: '^3.22.4',
        },
        tampered: {
          express: '^4.18.2',
          expres: '^1.0.0', // Typo-squat
          'bad-crypto-miner': '^0.1.0', // Malicious
        },
      };

      const validCheck = PackageAdmissionService.validateManifestDependencies(manifest.valid);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.violations.length).toBe(0);

      const tamperedCheck = PackageAdmissionService.validateManifestDependencies(manifest.tampered);
      expect(tamperedCheck.valid).toBe(false);
      expect(tamperedCheck.violations.length).toBe(2);
    });
  });
});
