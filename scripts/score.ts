/**
 * Score dos conjuntos de avaliação contra o motor real.
 *
 * Uso: npx vite-node scripts/score.ts [--json]
 *
 * Não ajusta nada: apenas mede. Serve para registrar o estado antes e depois
 * das correções.
 */
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { runDataset, type SetReport } from '../src/eval/runner';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_DATASET } from '../src/eval/loader';

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function printSet(r: SetReport): void {
  console.log(`\n=== ${r.name} — ${r.passed}/${r.total} casos ===`);
  console.log(`  lexical resolution accuracy      ${pct(r.lexicalResolutionAccuracy)}  (${r.annotatedTokenCases} casos anotados)`);
  console.log(`  concept/sense accuracy          ${pct(r.conceptSenseAccuracy)}`);
  console.log(`  entity attachment accuracy      ${pct(r.entityAttachmentAccuracy)}`);
  console.log(`  property/value binding accuracy ${pct(r.propertyValueBindingAccuracy)}`);
  console.log(`  reference resolution accuracy   ${pct(r.referenceResolutionAccuracy)}`);
  console.log(`  AST exact match                 ${pct(r.astExactMatch)}`);
  console.log(`  execution-plan exact match      ${pct(r.planExactMatch)}`);
  console.log(`  end-to-end command success      ${pct(r.endToEndSuccess)}`);
  console.log(`  false-positive rate             ${pct(r.falsePositiveRate)}`);
  console.log(`  ambiguity detection rate        ${pct(r.ambiguityDetectionRate)}  (${r.ambiguityCaseCount} casos ambíguos)`);
  if (r.failures.length) {
    console.log(`  falhas:`);
    for (const f of r.failures.slice(0, 25)) {
      console.log(`    - ${f.id} «${f.input}»`);
      for (const reason of f.failReasons) console.log(`        ${reason}`);
    }
    if (r.failures.length > 25) console.log(`    … e ${r.failures.length - 25} outras`);
  }
}

function main(): void {
  const kb = createInitialKnowledgeBase();
  const reports = [
    runDataset(kb, DEV_DATASET, 'dev'),
    runDataset(kb, REGRESSION_DATASET, 'regression'),
    runDataset(kb, FINAL_DATASET, 'final (held-out)')
  ];

  if (process.argv.includes('--json')) {
    const payload = reports.map((r) => ({
      name: r.name,
      total: r.total,
      passed: r.passed,
      failed: r.failed,
      lexicalResolutionAccuracy: r.lexicalResolutionAccuracy,
      entityAttachmentAccuracy: r.entityAttachmentAccuracy,
      propertyValueBindingAccuracy: r.propertyValueBindingAccuracy,
      referenceResolutionAccuracy: r.referenceResolutionAccuracy,
      astExactMatch: r.astExactMatch,
      planExactMatch: r.planExactMatch,
      endToEndSuccess: r.endToEndSuccess,
      falsePositiveRate: r.falsePositiveRate,
      ambiguityDetectionRate: r.ambiguityDetectionRate,
      failures: r.failures.map((f) => ({ id: f.id, input: f.input, reasons: f.failReasons }))
    }));
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('SCORE DO MOTOR SEMÂNTICO');
  console.log('='.repeat(62));
  for (const r of reports) printSet(r);
  console.log('\n' + '='.repeat(62));
  const totalPassed = reports.reduce((a, r) => a + r.passed, 0);
  const totalCases = reports.reduce((a, r) => a + r.total, 0);
  console.log(`TOTAL: ${totalPassed}/${totalCases} (${pct(totalPassed / totalCases)})`);
}

void SemanticEngine;
main();
