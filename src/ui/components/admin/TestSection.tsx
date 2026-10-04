import React, { useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import { SemanticEngine as EngineClass } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import { runDataset, type SetReport, type MetricValue } from '../../../eval/runner';
import {
  DEV_DATASET,
  REGRESSION_DATASET,
  FINAL_V1_DATASET
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
        return FINAL_V1_DATASET;
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
    ['dev', `Desenvolvimento (${DEV_DATASET.records.length})`],
    ['final', `Final v1 · histórico (${FINAL_V1_DATASET.records.length})`],
    ['negativos', `Comandos inválidos (${REGRESSION_DATASET.records.filter((r) => r.expectError).length})`],
    ['ambiguos', `Frases ambíguas (${REGRESSION_DATASET.records.filter((r) => r.expected.ambiguous).length})`],
    ['treinamento', `Meus exemplos (${store.training.length})`],
    ['benchmark', 'Velocidade']
  ];
  const suiteInfo: Record<Suite, string> = {
    regressao: 'Confere se comportamentos que já funcionavam continuam corretos após mudanças.',
    dev: 'Exemplos de desenvolvimento usados para verificar o comportamento esperado.',
    final: 'Conjunto histórico conhecido; útil para comparação, não é uma avaliação oculta.',
    negativos: 'Frases que devem ser bloqueadas sem alterar o documento.',
    ambiguos: 'Frases em que o motor precisa identificar mais de uma interpretação possível.',
    treinamento: 'Exemplos que você salvou na tela Treinamento.',
    benchmark: 'Mede o tempo das etapas do motor; não mede acerto linguístico.'
  };

  return (
    <div className="admin-section">
      <header className="section-header">
        <div><div className="summary-kicker">VERIFIQUE O MOTOR</div><h3>Testar e entender os resultados</h3>
          <p className="note">Escolha um grupo de frases, execute e veja o que passou ou precisa de atenção. Nada nesta tela altera a página.</p></div>
      </header>

      <div className="entity-switch">
        {suites.map(([id, label]) => (
          <button key={id} className={suite === id ? 'active' : ''} onClick={() => { setSuite(id); setReport(null); setBench(null); }}>
            {label}
          </button>
        ))}
      </div>

      <div className="test-suite-intro ui-card"><strong>{suites.find(([id]) => id === suite)?.[1]}</strong>
        <p>{suiteInfo[suite]}</p><small>Passo 1: escolha o grupo · Passo 2: execute · Passo 3: abra as divergências, se houver.</small></div>

      <div className="row">
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Comparando frases…' : 'Executar este grupo'}
        </button>
        {report && (
          <span className={report.failed === 0 ? 'ok' : 'err'}>
            {report.passed}/{report.total} aprovados
          </span>
        )}
      </div>

      {!report && !bench && <p className="ui-empty">O resultado aparecerá aqui depois da execução.</p>}

      {report && (
        <>
          <div className={`test-result-summary ui-card ${report.failed ? 'has-failures' : 'all-pass'}`} role="status">
            <strong>{report.passed} de {report.total} frases aprovadas</strong>
            <p>{report.failed ? `${report.failed} divergência(s) abaixo precisam de inspeção.` : 'O motor correspondeu às expectativas anotadas neste grupo.'}</p>
          </div>
          <details className="results-advanced"><summary>Ver pontuações por etapa</summary>
          <div className="metric-cards">
            <MetricCard label="Resultado completo" metric={report.metrics.endToEnd} />
            <MetricCard label="Palavras" metric={report.metrics.lexicalAccuracy} />
            <MetricCard label="Sentido" metric={report.metrics.senseAccuracy} />
            <MetricCard label="Forma e flexão" metric={report.metrics.morphologicalAccuracy} />
            <MetricCard label="Estrutura do comando" metric={report.metrics.astExactMatch} />
            <MetricCard label="Plano de ações" metric={report.metrics.planExactMatch} />
            <MetricCard label="Ligações" metric={report.metrics.attachmentAccuracy} />
            <MetricCard label="Propriedades" metric={report.metrics.bindingAccuracy} />
            <MetricCard label="Referências" metric={report.metrics.referenceAccuracy} />
            <MetricCard label="Falsos positivos" metric={report.metrics.falsePositiveRate} invert />
          </div>
          </details>

          <details className="results-advanced"><summary>Ver resultado de cada frase</summary>
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
          </details>

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
  metric,
  invert
}: {
  label: string;
  metric: MetricValue;
  invert?: boolean;
}) {
  if (metric.value === null) {
    return (
      <div className="metric-card warn">
        <span className="metric-label">{label}</span>
        <span className="metric-value">n/a</span>
        <span className="metric-label">
          {metric.covered}/{metric.total}
        </span>
      </div>
    );
  }
  const value = metric.value;
  const pct = (value * 100).toFixed(1);
  const good = invert ? value === 0 : value >= 0.99;
  return (
    <div className={`metric-card ${good ? 'good' : value < 0.9 && !invert ? 'bad' : 'warn'}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{pct}%</span>
      <span className="metric-label">
        {metric.covered}/{metric.total}
      </span>
    </div>
  );
}
