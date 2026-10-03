import { describe, it, expect } from 'vitest';
import { runBenchmark } from '../src/eval/benchmark';

describe('Benchmark de performance', () => {
  it('mede cada camada separadamente', () => {
    const report = runBenchmark();

    const labels = report.timings.map((t) => t.label);
    expect(labels.some((l) => l.includes('LexicalIndex build'))).toBe(true);
    expect(labels.some((l) => l.includes('MultiwordTrie build'))).toBe(true);
    expect(labels.some((l) => l.includes('Tokenização'))).toBe(true);
    expect(labels.some((l) => l.includes('Lookup exato'))).toBe(true);
    expect(labels.some((l) => l.includes('MWE match'))).toBe(true);
    expect(labels.some((l) => l.includes('Recuperação aproximada'))).toBe(true);
    expect(labels.some((l) => l.includes('Parsing'))).toBe(true);
    expect(labels.some((l) => l.includes('Planner+Validator'))).toBe(true);
    expect(labels.some((l) => l.includes('Compile completo'))).toBe(true);
    expect(labels.some((l) => l.includes('Execução'))).toBe(true);

    for (const t of report.timings) {
      expect(Number.isFinite(t.ms)).toBe(true);
      expect(t.ms).toBeGreaterThanOrEqual(0);
    }

    expect(report.surfaceForms).toBe(100000);
  }, 120000);
});
