import { describe, it } from 'vitest';
import { runBenchmark } from '../src/eval/benchmark';

/**
 * Executa o benchmark e imprime o relatório (use com `--reporter=verbose`).
 * Não é uma asserção de corretude: é o instrumento de medição.
 */
describe('Relatório de benchmark', () => {
  it('imprime tempos por camada', () => {
    const r = runBenchmark();
    const lines = [
      '',
      `SurfaceForms sintéticos: ${r.surfaceForms.toLocaleString('pt-BR')}`,
      `MWEs sintéticas:         ${r.multiwords.toLocaleString('pt-BR')}`,
      '-'.repeat(62),
      ...r.timings.map((t) => `${t.label.padEnd(46)} ${t.ms.toFixed(2).padStart(10)} ms`),
      '-'.repeat(62)
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }, 120000);
});
