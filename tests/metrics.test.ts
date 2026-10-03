import { describe, it, expect } from 'vitest';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { runDataset, type MetricValue } from '../src/eval/runner';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_V1_DATASET } from '../src/eval/loader';
import type { EvalDataset } from '../src/eval/datasetSchema';

/**
 * Falhas conhecidas do conjunto morfossintático (F1.5) contra o front-end
 * legado, na data de escrita (ver data/CHANGES.md). O oráculo só encolhe:
 * caso que passe precisa sair da lista, caso novo que falhe precisa entrar —
 * nunca se ajusta o esperado do dataset para "fazer passar".
 */
const KNOWN_MORPH_FAILURES = new Set([
  'morph-02', 'morph-03', 'morph-05', 'morph-06', 'morph-07', 'morph-08',
  'morph-09', 'morph-11', 'morph-12', 'morph-13', 'morph-14', 'morph-15',
  'morph-16', 'morph-17', 'morph-20', 'morph-21', 'morph-22', 'morph-23',
  'morph-24', 'morph-25', 'morph-26', 'morph-27', 'morph-31', 'morph-33',
  'morph-34', 'morph-35', 'morph-36', 'morph-40'
]);

function unexpectedFailures(ids: string[]): string[] {
  return ids.filter((id) => !KNOWN_MORPH_FAILURES.has(id));
}

function fixedKnownFailures(ids: string[]): string[] {
  return [...KNOWN_MORPH_FAILURES].filter((id) => !ids.includes(id));
}

/**
 * As métricas são MEDIDAS, não afirmadas. Estes testes verificam que cada
 * métrica é calculada apenas sobre os registros que declaram a expectativa,
 * que a cobertura é exposta e que denominador zero produz `n/a` — nunca 100%.
 */
describe('Métricas por conjunto', () => {
  const kb = createInitialKnowledgeBase();

  it('dev: métricas calculadas e sucesso end-to-end', () => {
    const r = runDataset(kb, DEV_DATASET, 'dev');
    expect(r.total).toBe(DEV_DATASET.records.length);
    expect(r.failures.map((f) => `${f.id}: ${f.failReasons.join(' | ')}`)).toEqual([]);
    expect(r.metrics.endToEnd.value).toBe(1);
    expect(r.metrics.endToEnd.covered).toBe(r.total);
  });

  it('regression: sem falhas fora das falhas conhecidas do conjunto morph', () => {
    const r = runDataset(kb, REGRESSION_DATASET, 'regression');
    const failingIds = r.failures.map((f) => f.id);
    expect(
      unexpectedFailures(failingIds).map(
        (id) => `${id}: ${r.failures.find((f) => f.id === id)!.failReasons.join(' | ')}`
      )
    ).toEqual([]);
    expect(fixedKnownFailures(failingIds)).toEqual([]);
    expect(r.metrics.endToEnd.value).toBe(
      (r.total - KNOWN_MORPH_FAILURES.size) / r.total
    );
  });

  it('final-v1 (comprometido): métricas calculadas', () => {
    const r = runDataset(kb, FINAL_V1_DATASET, 'final-v1 (comprometido)');
    expect(r.metrics.endToEnd.value).toBeGreaterThanOrEqual(0.95);
    expect(r.metrics.falsePositiveRate.value).toBe(0);
    expect(r.failures.map((f) => `${f.id}: ${f.failReasons.join(' | ')}`)).toEqual([]);
  });

  it('todas as métricas da F1 são produzidas com cobertura válida', () => {
    const r = runDataset(kb, REGRESSION_DATASET, 'regression');
    const metrics: MetricValue[] = Object.values(r.metrics);
    expect(metrics.length).toBe(11);
    for (const m of metrics) {
      expect(m.value === null || (Number.isFinite(m.value) && m.value >= 0 && m.value <= 1)).toBe(true);
      expect(m.covered).toBeGreaterThanOrEqual(0);
      expect(m.covered).toBeLessThanOrEqual(m.total);
      expect(m.items).toBeGreaterThanOrEqual(0);
      if (m.value !== null) expect(m.items).toBeGreaterThan(0);
    }
  });

  it('denominador zero produz n/a — nunca 100%', () => {
    const empty: EvalDataset = {
      version: 'test-empty',
      schemaVersion: '1.0.0',
      records: [
        {
          id: 'no-expectations',
          input: 'crie um botão',
          expected: { finalTree: 'C_ENT_BUTTON{}' }
        }
      ]
    };
    const r = runDataset(kb, empty, 'sem-expectativas');
    expect(r.metrics.astExactMatch.value).toBeNull();
    expect(r.metrics.astExactMatch.covered).toBe(0);
    expect(r.metrics.planExactMatch.value).toBeNull();
    expect(r.metrics.lexicalAccuracy.value).toBeNull();
    expect(r.metrics.senseAccuracy.value).toBeNull();
    expect(r.metrics.morphologicalAccuracy.value).toBeNull();
    expect(r.metrics.attachmentAccuracy.value).toBeNull();
    expect(r.metrics.bindingAccuracy.value).toBeNull();
    expect(r.metrics.referenceAccuracy.value).toBeNull();
    expect(r.metrics.falsePositiveRate.value).toBeNull();
    expect(r.metrics.ambiguityDetectionRate.value).toBeNull();
    // end-to-end sempre tem denominador: o número de registros.
    expect(r.metrics.endToEnd.value).toBe(1);
  });

  it('métrica por tokens ignora registros sem anotação de token', () => {
    const mixed: EvalDataset = {
      version: 'test-mixed',
      schemaVersion: '1.0.0',
      records: [
        {
          id: 'annotated',
          input: 'crie um botão',
          expected: {
            tokens: [{ surface: 'botão', lexemeId: 'L_BUTTON', conceptId: 'C_ENT_BUTTON' }]
          }
        },
        { id: 'unannotated', input: 'crie uma caixa', expected: {} }
      ]
    };
    const r = runDataset(kb, mixed, 'misto');
    expect(r.metrics.lexicalAccuracy.covered).toBe(1);
    expect(r.metrics.lexicalAccuracy.total).toBe(2);
    expect(r.metrics.lexicalAccuracy.items).toBe(1);
  });

  it('a taxa de detecção de ambiguidade mede casos realmente ambíguos', () => {
    const r = runDataset(kb, REGRESSION_DATASET, 'regression');
    expect(r.metrics.ambiguityDetectionRate.covered).toBeGreaterThan(0);
    expect(r.metrics.ambiguityDetectionRate.value).toBe(1);
  });
});

describe('O conjunto final não é usado para ajustar regras', () => {
  it('nenhum módulo de regras importa o dataset comprometido', async () => {
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
