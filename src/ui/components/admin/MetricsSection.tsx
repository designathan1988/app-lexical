import React, { useEffect, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import { SemanticEngine as EngineClass } from '../../../engine/SemanticEngine';
import { runDataset, type SetReport } from '../../../eval/runner';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_DATASET, allRecords } from '../../../eval/loader';

interface Props {
  engine: SemanticEngine;
}

interface LayerStat {
  layer: string;
  total: number;
  byCode: Record<string, number>;
}

/** Métricas por conjunto, por camada, falsos positivos e ambiguidades. */
export function MetricsSection({ engine }: Props) {
  const [reports, setReports] = useState<SetReport[] | null>(null);
  const [layers, setLayers] = useState<LayerStat[]>([]);

  useEffect(() => {
    const fresh = new EngineClass(engine.knowledgeBase);
    setReports([
      runDataset(engine.knowledgeBase, DEV_DATASET, 'dev'),
      runDataset(engine.knowledgeBase, REGRESSION_DATASET, 'regression'),
      runDataset(engine.knowledgeBase, FINAL_DATASET, 'final (held-out)')
    ]);

    const byLayer = new Map<string, LayerStat>();
    for (const record of allRecords()) {
      const r = fresh.analyze(record.input);
      for (const d of r.diagnostics) {
        const stat = byLayer.get(d.layer) ?? { layer: d.layer, total: 0, byCode: {} };
        stat.total++;
        stat.byCode[d.code] = (stat.byCode[d.code] ?? 0) + 1;
        byLayer.set(d.layer, stat);
      }
    }
    setLayers(Array.from(byLayer.values()));
  }, [engine]);

  if (!reports) return <div className="admin-section">Calculando métricas…</div>;

  const metricRows: Array<[string, (r: SetReport) => number, boolean, string]> = [
    ['Lexical resolution accuracy', (r) => r.lexicalResolutionAccuracy, false, 'tokens de conteúdo resolvidos'],
    ['Concept/sense accuracy', (r) => r.conceptSenseAccuracy, false, 'conceito correto por token'],
    ['Entity attachment accuracy', (r) => r.entityAttachmentAccuracy, false, 'pares (fonte, relação, alvo)'],
    ['Property/value binding accuracy', (r) => r.propertyValueBindingAccuracy, false, 'triplas (entidade, propriedade, valor)'],
    ['Reference resolution accuracy', (r) => r.referenceResolutionAccuracy, false, 'nós resolvidos por referência'],
    ['AST exact match', (r) => r.astExactMatch, false, 'assinatura canônica da AST'],
    ['Execution-plan exact match', (r) => r.planExactMatch, false, 'assinatura do plano com IDs normalizados'],
    ['End-to-end command success', (r) => r.endToEndSuccess, false, 'todas as asserções'],
    ['False-positive rate', (r) => r.falsePositiveRate, true, 'casos que deviam falhar e mutaram'],
    ['Ambiguity detection rate', (r) => r.ambiguityDetectionRate, false, 'casos realmente ambíguos detectados']
  ];

  return (
    <div className="admin-section">
      <header className="section-header">
        <h3>Métricas semânticas por conjunto</h3>
        <span className={reports.every((r) => r.failed === 0) ? 'ok' : 'err'}>
          {reports.map((r) => `${r.name}: ${r.passed}/${r.total}`).join(' · ')}
        </span>
      </header>

      <table className="metrics-table">
        <thead>
          <tr>
            <th>métrica</th>
            {reports.map((r) => (
              <th key={r.name}>{r.name}</th>
            ))}
            <th>descrição</th>
          </tr>
        </thead>
        <tbody>
          {metricRows.map(([label, pick, invert, desc]) => (
            <tr key={label}>
              <td>{label}</td>
              {reports.map((r) => {
                const value = pick(r);
                const pct = value * 100;
                const cls = invert
                  ? pct === 0
                    ? 'ok'
                    : 'err'
                  : pct >= 99
                    ? 'ok'
                    : pct >= 80
                      ? 'warn'
                      : 'err';
                return (
                  <td key={r.name} className={cls}>
                    {pct.toFixed(1)}%
                  </td>
                );
              })}
              <td className="details">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Onde o motor erra</h4>
      {reports.every((r) => r.failures.length === 0) ? (
        <p className="ok">Nenhuma falha nos três conjuntos.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>conjunto</th>
              <th>ID</th>
              <th>frase</th>
              <th>motivo</th>
            </tr>
          </thead>
          <tbody>
            {reports.flatMap((r) =>
              r.failures.map((f) => (
                <tr key={`${r.name}-${f.id}`} className="row-fail">
                  <td>{r.name}</td>
                  <td><code>{f.id}</code></td>
                  <td>{f.input}</td>
                  <td className="details">{f.failReasons.join(' · ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <h4>Diagnósticos por camada</h4>
      <table className="data-table">
        <thead>
          <tr>
            <th>camada</th>
            <th>total</th>
            <th>códigos</th>
          </tr>
        </thead>
        <tbody>
          {layers.map((l) => (
            <tr key={l.layer}>
              <td><code>{l.layer}</code></td>
              <td>{l.total}</td>
              <td>
                {Object.entries(l.byCode)
                  .map(([code, n]) => `${code}×${n}`)
                  .join(', ')}
              </td>
            </tr>
          ))}
          {layers.length === 0 && (
            <tr>
              <td colSpan={3}>Nenhum diagnóstico emitido.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h4>Composição dos conjuntos</h4>
      <table className="data-table">
        <thead>
          <tr>
            <th>conjunto</th>
            <th>casos</th>
            <th>negativos</th>
            <th>ambíguos</th>
          </tr>
        </thead>
        <tbody>
          {[DEV_DATASET, REGRESSION_DATASET, FINAL_DATASET].map((d) => (
            <tr key={d.version + d.description}>
              <td>{d.description?.split('.')[0] ?? 'conjunto'}</td>
              <td>{d.records.length}</td>
              <td>{d.records.filter((r) => r.expectError).length}</td>
              <td>{d.records.filter((r) => r.expected.ambiguous).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
