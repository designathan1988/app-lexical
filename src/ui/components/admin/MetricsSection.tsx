import React, { useEffect, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import { SemanticEngine as EngineClass } from '../../../engine/SemanticEngine';
import { runDataset, type SetReport, type MetricValue } from '../../../eval/runner';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_V1_DATASET, COMPROMISED_LABEL, allRecords } from '../../../eval/loader';
import { VALID_LAYERS } from '../../../engine/diagnostics';

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
      runDataset(engine.knowledgeBase, FINAL_V1_DATASET, COMPROMISED_LABEL)
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

  if (!reports) return <div className="admin-section ui-loading" role="status">Calculando os resultados dos conjuntos de avaliação…</div>;

  const metricRows: Array<[string, (r: SetReport) => MetricValue, boolean, string]> = [
    ['Palavra reconhecida', (r) => r.metrics.lexicalAccuracy, false, 'quantas palavras de conteúdo foram identificadas'],
    ['Sentido escolhido', (r) => r.metrics.senseAccuracy, false, 'quantas palavras receberam o conceito esperado'],
    ['Forma e flexão', (r) => r.metrics.morphologicalAccuracy, false, 'lema e traços morfológicos após a desambiguação'],
    ['Ligação entre elementos', (r) => r.metrics.attachmentAccuracy, false, 'relações entre fonte, tipo e alvo'],
    ['Propriedade e valor', (r) => r.metrics.bindingAccuracy, false, 'associação da propriedade ao valor correto'],
    ['Referência resolvida', (r) => r.metrics.referenceAccuracy, false, 'qual elemento do documento a frase mencionou'],
    ['Estrutura do comando (AST)', (r) => r.metrics.astExactMatch, false, 'comando interpretado exatamente como esperado'],
    ['Plano de ações', (r) => r.metrics.planExactMatch, false, 'sequência de ações planejada corretamente'],
    ['Resultado completo', (r) => r.metrics.endToEnd, false, 'todos os critérios da frase passaram'],
    ['Falso positivo', (r) => r.metrics.falsePositiveRate, true, 'frases que deveriam falhar mas causaram alteração; aqui 0% é bom'],
    ['Ambiguidade percebida', (r) => r.metrics.ambiguityDetectionRate, false, 'casos realmente ambíguos identificados']
  ];
  const datasetNames: Record<string, string> = { dev: 'Desenvolvimento', regression: 'Regressão', [COMPROMISED_LABEL]: 'Final v1 · histórico' };
  const datasetDescriptions: Record<string, string> = {
    dev: 'Exemplos usados ao construir as regras.',
    regression: 'Casos conhecidos que não podem voltar a falhar.',
    [COMPROMISED_LABEL]: 'Conjunto antigo e já conhecido; não é uma avaliação oculta.'
  };

  return (
    <div className="admin-section">
      <header className="section-header">
        <div><div className="summary-kicker">ENTENDA OS RESULTADOS</div><h3>O que o motor acertou?</h3>
          <p className="note">Cada conjunto compara o resultado real com exemplos que têm uma resposta esperada.</p></div>
      </header>

      <div className="results-overview">{reports.map((report) => <div className="results-set-card ui-card" key={report.name}>
        <span className="summary-kicker">{datasetNames[report.name] ?? report.name}</span>
        <strong>{report.passed} de {report.total}</strong><span>frases aprovadas</span>
        <p>{report.failed === 0 ? 'Nenhuma divergência neste conjunto.' : `${report.failed} frase(s) precisam de inspeção abaixo.`}</p>
        <small>{datasetDescriptions[report.name] ?? 'Conjunto de avaliação salvo.'}</small>
      </div>)}</div>
      <div className="results-explainer ui-card"><h4>Como ler esta tela</h4>
        <p><strong>Frases aprovadas</strong> mostra o resultado completo. As métricas detalhadas explicam <em>em qual etapa</em> ocorreu uma diferença.</p>
        <p><strong>n/a</strong> significa que não há expectativas anotadas para aquela métrica naquele conjunto — não significa 100%.</p>
        <p><strong>Falso positivo:</strong> quanto mais perto de 0%, melhor; é uma frase que deveria ser bloqueada mas causou alteração.</p>
      </div>

      <details className="results-advanced"><summary>Ver métricas detalhadas por etapa</summary>
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
                const metric = pick(r);
                const value = metric.value;
                const cls =
                  value === null
                    ? 'details'
                    : invert
                      ? value === 0
                        ? 'ok'
                        : 'err'
                      : value >= 0.99
                        ? 'ok'
                        : value >= 0.8
                          ? 'warn'
                          : 'err';
                return (
                  <td key={r.name} className={cls}>
                    {value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`}
                    <span className="details">
                      {' '}
                      ({metric.covered}/{metric.total})
                    </span>
                  </td>
                );
              })}
              <td className="details">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </details>

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

      <details className="results-advanced"><summary>Ver diagnósticos por camada</summary>
      <h4>Diagnósticos por camada</h4>
      <p className="details">
        Camadas válidas do pipeline: {VALID_LAYERS.join(', ')}. Camada fora dessa lista é
        defeito de arquitetura.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>camada</th>
            <th>total</th>
            <th>códigos</th>
          </tr>
        </thead>
        <tbody>
          {[...layers]
            .sort((a, b) => a.layer.localeCompare(b.layer))
            .map((l) => {
              const valid = (VALID_LAYERS as readonly string[]).includes(l.layer);
              return (
                <tr key={l.layer} className={valid ? undefined : 'row-fail'}>
                  <td>
                    <code>{l.layer}</code>
                    {!valid && <span className="err"> — inválida</span>}
                  </td>
                  <td>{l.total}</td>
                  <td>
                    {Object.entries(l.byCode)
                      .map(([code, n]) => `${code}×${n}`)
                      .join(', ')}
                  </td>
                </tr>
              );
            })}
          {layers.length === 0 && (
            <tr>
              <td colSpan={3}>Nenhum diagnóstico emitido.</td>
            </tr>
          )}
        </tbody>
      </table>
      </details>

      <details className="results-advanced"><summary>Ver composição dos conjuntos</summary>
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
          {([
            [DEV_DATASET, 'dev'],
            [REGRESSION_DATASET, 'regression'],
            [FINAL_V1_DATASET, COMPROMISED_LABEL]
          ] as const).map(([d, label]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{d.records.length}</td>
              <td>{d.records.filter((r) => r.expectError).length}</td>
              <td>{d.records.filter((r) => r.expected.ambiguous).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </details>
    </div>
  );
}
