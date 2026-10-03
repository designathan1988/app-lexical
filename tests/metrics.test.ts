import { describe, it, expect } from 'vitest';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { runDataset } from '../src/eval/runner';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_V1_DATASET } from '../src/eval/loader';

/**
 * As métricas são MEDIDAS, não afirmadas. Estes testes verificam que cada
 * métrica é calculada e que os conjuntos atingem os patamares exigidos.
 */
describe('Métricas por conjunto', () => {
  const kb = createInitialKnowledgeBase();

  it('dev: métricas calculadas e sucesso end-to-end', () => {
    const r = runDataset(kb, DEV_DATASET, 'dev');
    expect(r.total).toBe(DEV_DATASET.records.length);
    expect(r.failures.map((f) => `${f.id}: ${f.failReasons.join(' | ')}`)).toEqual([]);
    expect(r.endToEndSuccess).toBe(1);
  });

  it('regression: métricas calculadas e sucesso end-to-end', () => {
    const r = runDataset(kb, REGRESSION_DATASET, 'regression');
    expect(r.failures.map((f) => `${f.id}: ${f.failReasons.join(' | ')}`)).toEqual([]);
    expect(r.endToEndSuccess).toBe(1);
  });

  it('final-v1 (comprometido): métricas calculadas', () => {
    const r = runDataset(kb, FINAL_V1_DATASET, 'final');
    // O conjunto final NÃO é ajustado: reportamos e exigimos o patamar.
    expect(r.endToEndSuccess).toBeGreaterThanOrEqual(0.95);
    expect(r.falsePositiveRate).toBe(0);
    expect(r.failures.map((f) => `${f.id}: ${f.failReasons.join(' | ')}`)).toEqual([]);
  });

  it('todas as métricas do §27 são produzidas', () => {
    const r = runDataset(kb, REGRESSION_DATASET, 'regression');
    for (const value of [
      r.lexicalResolutionAccuracy,
      r.conceptSenseAccuracy,
      r.entityAttachmentAccuracy,
      r.propertyValueBindingAccuracy,
      r.referenceResolutionAccuracy,
      r.astExactMatch,
      r.planExactMatch,
      r.endToEndSuccess,
      r.falsePositiveRate,
      r.ambiguityDetectionRate
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('a taxa de detecção de ambiguidade mede casos realmente ambíguos', () => {
    const r = runDataset(kb, REGRESSION_DATASET, 'regression');
    expect(r.ambiguityCaseCount).toBeGreaterThan(0);
    expect(r.ambiguityDetectionRate).toBe(1);
  });
});

describe('O conjunto final não é usado para ajustar regras', () => {
  it('nenhum módulo de regras importa o dataset final', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const roots = ['src/engine', 'src/knowledge', 'src/builder'];
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/data\/final[^/]*\.json|FINAL_V1_DATASET|FINAL_DATASET/.test(text)) offenders.push(full);
      }
    };

    for (const root of roots) walk(root);
    expect(offenders).toEqual([]);
  });

  it('o runner e o loader não são importados pelas camadas de regras', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/from '\.\.?\/.*eval\/(loader|runner)/.test(text)) offenders.push(full);
      }
    };

    for (const root of ['src/engine', 'src/knowledge', 'src/builder']) walk(root);
    expect(offenders).toEqual([]);
  });
});
