import crypto from 'crypto';
import { load } from 'js-yaml';
import type { ChallengeManifest, DefectDefinition } from '@repodojo/shared';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: ChallengeManifest;
  manifestHash?: string;
}

export class ChallengeValidatorService {
  /**
   * Validates raw YAML content of repodojo.challenge.yml against Decision 5.2 rules.
   */
  public static validateYaml(rawYaml: string): ValidationResult {
    const errors: string[] = [];

    let parsed: any;
    try {
      parsed = load(rawYaml);
    } catch (err: any) {
      return { valid: false, errors: [`Invalid YAML syntax: ${err.message}`] };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, errors: ['Manifest YAML must parse to a root object.'] };
    }

    // Required top-level fields
    if (!parsed.id || typeof parsed.id !== 'string') errors.push('Missing or invalid "id" (string required).');
    if (!parsed.title || typeof parsed.title !== 'string') errors.push('Missing or invalid "title".');
    if (!parsed.version || typeof parsed.version !== 'string') errors.push('Missing or invalid "version".');
    if (!parsed.description || typeof parsed.description !== 'string') errors.push('Missing or invalid "description".');

    // Runtime requirements
    if (!parsed.runtime || parsed.runtime.language !== 'nodejs') {
      errors.push('Manifest "runtime.language" must be "nodejs".');
    }

    // Defect Count validation (Decision 5.2: Exactly 8 defects)
    const defects: DefectDefinition[] = parsed.defects || [];
    if (!Array.isArray(defects)) {
      errors.push('Manifest "defects" must be an array.');
    } else if (defects.length !== 8) {
      errors.push(`Manifest must contain exactly 8 defects (found ${defects.length}).`);
    } else {
      // Validate each defect definition
      const defectIds = new Set<string>();
      defects.forEach((defect, idx) => {
        if (!defect.id) errors.push(`Defect #${idx + 1} missing "id".`);
        if (!defect.title) errors.push(`Defect #${idx + 1} missing "title".`);
        if (!Array.isArray(defect.affectedFiles) || defect.affectedFiles.length === 0) {
          errors.push(`Defect "${defect.id || idx}" must specify at least one affected file.`);
        } else {
          for (const file of defect.affectedFiles) {
            if (file.includes('..') || file.startsWith('/')) {
              errors.push(`Defect "${defect.id}" affectedFile "${file}" contains invalid path traversal.`);
            }
          }
        }
        if (defectIds.has(defect.id)) {
          errors.push(`Duplicate defect id "${defect.id}".`);
        }
        defectIds.add(defect.id);
      });

      // DAG Cycle Detection in Defect Prerequisites (Decision 5.2)
      const cycleError = this.detectDagCycle(defects);
      if (cycleError) {
        errors.push(`DAG Dependency Cycle detected: ${cycleError}`);
      }
    }

    // Rubric Weight Validation
    const rubrics = parsed.rubrics || { functionalWeight: 60, codeQualityWeight: 20, trajectoryWeight: 20 };
    const totalWeight =
      (rubrics.functionalWeight || 0) +
      (rubrics.codeQualityWeight || 0) +
      (rubrics.trajectoryWeight || 0);

    if (totalWeight !== 100) {
      errors.push(`Rubric weights must sum to 100 (current sum: ${totalWeight}).`);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Deterministic SHA-256 Hash
    const manifestHash = crypto.createHash('sha256').update(rawYaml, 'utf8').digest('hex');

    const manifest: ChallengeManifest = {
      id: parsed.id,
      title: parsed.title,
      version: parsed.version,
      description: parsed.description,
      difficulty: parsed.difficulty || 'medium',
      durationMinutes: parsed.durationMinutes || 60,
      runtime: parsed.runtime,
      defects,
      rubrics,
    };

    return {
      valid: true,
      errors: [],
      manifest,
      manifestHash,
    };
  }

  /**
   * Topological cycle detection using DFS coloring.
   * White (0): unvisited, Gray (1): visiting, Black (2): visited.
   */
  private static detectDagCycle(defects: DefectDefinition[]): string | null {
    const adj = new Map<string, string[]>();
    const state = new Map<string, number>();

    defects.forEach((d) => {
      adj.set(d.id, d.prerequisites || []);
      state.set(d.id, 0);
    });

    const dfs = (nodeId: string, path: string[]): string | null => {
      state.set(nodeId, 1);
      path.push(nodeId);

      const neighbors = adj.get(nodeId) || [];
      for (const next of neighbors) {
        if (!state.has(next)) continue; // external non-defect dependency or invalid id

        if (state.get(next) === 1) {
          return [...path, next].join(' -> ');
        }
        if (state.get(next) === 0) {
          const cycle = dfs(next, path);
          if (cycle) return cycle;
        }
      }

      state.set(nodeId, 2);
      path.pop();
      return null;
    };

    for (const d of defects) {
      if (state.get(d.id) === 0) {
        const cycle = dfs(d.id, []);
        if (cycle) return cycle;
      }
    }

    return null;
  }
}
