/**
 * Score dos conjuntos de avaliação contra o motor real.
 *
 * Uso:
 *   npx vite-node scripts/score.ts
 *   npx vite-node scripts/score.ts --dataset <caminho.json> [--out <saida.json>]
 *
 * Sem `--dataset`, mede os três conjuntos embutidos. Com `--dataset`, valida o
 * arquivo pelo `datasetSchema.ts` e mede só ele. `--out` grava todas as
 * métricas (com cobertura) em JSON. Não ajusta nada: apenas mede.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { runDataset, type SetReport, type MetricValue } from '../src/eval/runner';
import {
  DEV_DATASET,
  REGRESSION_DATASET,
  FINAL_V1_DATASET,
  COMPROMISED_LABEL
} from '../src/eval/loader';
import { validateDataset } from '../src/eval/datasetSchema';

interface Cli {
  dataset?: string;
  out?: string;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dataset') cli.dataset = argv[++i];
    else if (argv[i] === '--out') cli.out = argv[++i];
    else if (argv[i] === '--help') {
      console.log('uso: score.ts [--dataset <caminho.json>] [--out <saida.json>]');
      process.exit(0);
    } else {
      console.error(`argumento desconhecido: ${argv[i]}`);
      process.exit(2);
    }
  }
  return cli;
}

function pct(m: MetricValue): string {
  return m.value === null ? 'n/a'.padEnd(7) : `${(m.value * 100).toFixed(1)}%`.padEnd(7);
}

function coverage(m: MetricValue): string {
  return `cobertura ${m.covered}/${m.total} registros, ${m.items} itens`;
}

interface MetricLine {
  label: string;
  metric: MetricValue;
}

function metricLines(r: SetReport): MetricLine[] {
  const m = r.metrics;
  return [
    { label: 'lexical resolution accuracy', metric: m.lexicalAccuracy },
    { label: 'concept/sense accuracy', metric: m.senseAccuracy },
    { label: 'morphological accuracy', metric: m.morphologicalAccuracy },
    { label: 'entity attachment accuracy', metric: m.attachmentAccuracy },
    { label: 'property/value binding accuracy', metric: m.bindingAccuracy },
    { label: 'reference resolution accuracy', metric: m.referenceAccuracy },
    { label: 'AST exact match', metric: m.astExactMatch },
    { label: 'execution-plan exact match', metric: m.planExactMatch },
    { label: 'end-to-end command success', metric: m.endToEnd },
    { label: 'false-positive rate', metric: m.falsePositiveRate },
    { label: 'ambiguity detection rate', metric: m.ambiguityDetectionRate }
  ];
}

function printSet(r: SetReport): void {
  console.log(`\n=== ${r.name} — ${r.passed}/${r.total} casos ===`);
  for (const { label, metric } of metricLines(r)) {
    console.log(`  ${label.padEnd(32)} ${pct(metric)} (${coverage(metric)})`);
  }
  if (r.failures.length) {
    console.log(`  falhas:`);
    for (const f of r.failures.slice(0, 25)) {
      console.log(`    - ${f.id} «${f.input}»`);
      for (const reason of f.failReasons) console.log(`        ${reason}`);
    }
    if (r.failures.length > 25) console.log(`    … e ${r.failures.length - 25} outras`);
  }
}

function reportPayload(reports: SetReport[]): unknown {
  return {
    generatedAt: new Date().toISOString(),
    reports: reports.map((r) => ({
      name: r.name,
      total: r.total,
      passed: r.passed,
      failed: r.failed,
      metrics: r.metrics,
      failures: r.failures.map((f) => ({ id: f.id, input: f.input, reasons: f.failReasons }))
    }))
  };
}

function loadExternalDataset(file: string): ReturnType<typeof validateDataset> {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`arquivo não encontrado: ${resolved}`);
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  return validateDataset(raw);
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  const kb = createInitialKnowledgeBase();

  let reports: SetReport[];
  if (cli.dataset) {
    const dataset = loadExternalDataset(cli.dataset);
    reports = [runDataset(kb, dataset, `${dataset.version} (${path.basename(cli.dataset)})`)];
  } else {
    reports = [
      runDataset(kb, DEV_DATASET, 'dev'),
      runDataset(kb, REGRESSION_DATASET, 'regression'),
      runDataset(kb, FINAL_V1_DATASET, COMPROMISED_LABEL)
    ];
  }

  console.log('SCORE DO MOTOR SEMÂNTICO');
  console.log('='.repeat(62));
  for (const r of reports) printSet(r);
  console.log('\n' + '='.repeat(62));
  const totalPassed = reports.reduce((a, r) => a + r.passed, 0);
  const totalCases = reports.reduce((a, r) => a + r.total, 0);
  console.log(
    `TOTAL: ${totalPassed}/${totalCases} (${((totalPassed / totalCases) * 100).toFixed(1)}%)`
  );

  if (cli.out) {
    const outPath = path.resolve(cli.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(reportPayload(reports), null, 2) + '\n');
    console.log(`\nmétricas gravadas em ${outPath}`);
  }
}

void SemanticEngine;
main();
