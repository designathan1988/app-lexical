import React, { useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import { SemanticEngine as EngineClass } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import { runDataset, type SetReport } from '../../../eval/runner';
import {
  DEV_DATASET,
  REGRESSION_DATASET,
  FINAL_DATASET
} from '../../../eval/loader';
import type { EvalDataset, EvalRecord } from '../../../eval/datasetSchema';
import { runBenchmark, type BenchmarkReport } from '../../../eval/benchmark';

interface Props {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
}

type Suite = 'regressao' | 'dev' | 'final' | 'negativos' | 'ambiguos' | 'treinamento' | 'benchmark';

/** Executa as suítes contra o motor real, com a base de conhecimento atual. */
export function TestSection({ engine, store }: Props) {
  const [suite, setSuite] = useState<Suite>('regressao');
  const [report, setReport] = useState<SetReport | null>(null);
  const [bench, setBench] = useState<BenchmarkReport | null>(null);
  const [running, setRunning] = useState(false);

  const subset = (
    base: EvalDataset,
    name: string,
    predicate: (r: EvalRecord) => boolean
  ): EvalDataset => ({
    ...base,
    version: `${base.version}-${name}`,
    description: `${base.description} (filtro: ${name})`,
    records: base.records.filter(predicate)
  });

  const datasetFor = (s: Suite): EvalDataset | null => {
    switch (s) {
      case 'regressao':
        return REGRESSION_DATASET;
      case 'dev':
        return DEV_DATASET;
      case 'final':
        return FINAL_DATASET;
      case 'negativos':
        return subset(REGRESSION_DATASET, 'negativos', (r) => r.expectError === true);
      case 'ambiguos':
        return subset(REGRESSION_DATASET, 'ambiguos', (r) => r.expected.ambiguous === true);
      case 'treinamento':
        return {
          version: 'training',
          schemaVersion: REGRESSION_DATASET.schemaVersion,
          description: 'Frases cadastradas no painel',
          records: store.training.map((t) => ({
            id: t.id,
            input: t.input,
            seed: t.seed,
            selection: t.selection,
            expected: {
              finalTree: t.expectedTree,
              diagnostics: t.expectedDiagnostics
            },
            expectError: t.expectedDiagnostics.length > 0
          }))
        };
      default:
        return null;
    }
  };

  const run = () => {
    setRunning(true);
    setBench(null);
    setTimeout(() => {
      if (suite === 'benchmark') {
        setBench(runBenchmark());
      } else {
        const ds = datasetFor(suite)!;
        const fresh = new EngineClass(store.kb, store.settings);
        setReport(runDataset(store.kb, ds, ds.description ?? suite));
      }
      setRunning(false);
    }, 10);
  };

  const suites: Array<[Suite, string]> = [
    ['regressao', `Regressão (${REGRESSION_DATASET.records.length})`],
    ['dev', `Dev (${DEV_DATASET.records.length})`],
    ['final', `Final held-out (${FINAL_DATASET.records.length})`],
    ['negativos', `Negativos (${REGRESSION_DATASET.records.filter((r) => r.expectError).length})`],
    ['ambiguos', `Ambíguos (${REGRESSION_DATASET.records.filter((r) => r.expected.ambiguous).length})`],
    ['treinamento', `Treinamento (${store.training.length})`],
    ['benchmark', 'Benchmark']
  ];

  return (
    <div className="admin-section">
      <header className="section-header">
        <h3>Execução de testes</h3>
      </header>

      <div className="entity-switch">
        {suites.map(([id, label]) => (
          <button key={id} className={suite === id ? 'active' : ''} onClick={() => setSuite(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="row">
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Executando…' : 'Executar suíte'}
        </button>
        {report && (
          <span className={report.failed === 0 ? 'ok' : 'err'}>
            {report.passed}/{report.total} aprovados
          </span>
        )}
      </div>

      {report && (
        <>
          <div className="metric-cards">
            <MetricCard label="Sucesso end-to-end" value={report.endToEndSuccess} />
            <MetricCard label="AST exata" value={report.astExactMatch} />
            <MetricCard label="Plano exato" value={report.planExactMatch} />
            <MetricCard label="Attachments" value={report.entityAttachmentAccuracy} />
            <MetricCard label="Bindings" value={report.propertyValueBindingAccuracy} />
            <MetricCard label="Referências" value={report.referenceResolutionAccuracy} />
            <MetricCard label="Falsos positivos" value={report.falsePositiveRate} invert />
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>frase</th>
                <th>ok</th>
                <th>árvore</th>
                <th>AST</th>
                <th>plano</th>
                <th>diag.</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.id} className={r.passed ? '' : 'row-fail'}>
                  <td><code>{r.id}</code></td>
                  <td>{r.input}</td>
                  <td>{r.passed ? '✓' : '✗'}</td>
                  <td>{r.finalTreeOk ? '✓' : '✗'}</td>
                  <td>{r.astOk ? '✓' : '✗'}</td>
                  <td>{r.planOk ? '✓' : '✗'}</td>
                  <td>{r.diagnosticsOk ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.failures.length > 0 && (
            <>
              <h4>Detalhe das falhas</h4>
              {report.failures.map((f) => (
                <div key={f.id} className="failure">
                  <strong>{f.id}</strong> — <code>{f.input}</code>
                  <ul>
                    {f.failReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <div className="diff">
                    <div>
                      <label>esperado</label>
                      <pre>{f.expectedTree ?? '(erro esperado)'}</pre>
                    </div>
                    <div>
                      <label>obtido</label>
                      <pre>{f.actualTree || '(vazio)'}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {bench && (
        <table className="data-table">
          <thead>
            <tr>
              <th>etapa</th>
              <th>tempo (ms)</th>
            </tr>
          </thead>
          <tbody>
            {bench.timings.map((t) => (
              <tr key={t.label}>
                <td>{t.label}</td>
                <td>{t.ms.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  invert
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  const pct = (value * 100).toFixed(1);
  const good = invert ? value === 0 : value >= 0.99;
  return (
    <div className={`metric-card ${good ? 'good' : value < 0.9 && !invert ? 'bad' : 'warn'}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{pct}%</span>
    </div>
  );
}
