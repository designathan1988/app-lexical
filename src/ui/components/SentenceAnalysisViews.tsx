import React from 'react';
import type { SentenceAnalysis } from '../../engine/language/SentenceAnalysis';

export type SentenceView = 'classes' | 'syntax' | 'meaning';

const modeLabel = { declarative: 'declarativa', interrogative: 'interrogativa', imperative: 'imperativa' };
const polarityLabel = { positive: 'positiva', negative: 'negativa' };
const diagnosticLabel: Record<string, string> = { AMBIGUOUS_SENSE: 'Sentido ambíguo', UNCERTAIN_FRAME: 'Moldura genérica, análise incerta' };

interface Props {
  analysis: SentenceAnalysis;
  view: SentenceView;
}

function featureText(feats: Record<string, string>): string {
  return Object.entries(feats).map(([name, value]) => `${name}=${value}`).join(' | ') || '—';
}

function DependencyDiagram({ analysis }: { analysis: SentenceAnalysis }) {
  const step = 100;
  const width = Math.max(520, analysis.words.length * step + 80);
  const baseline = 165;
  const x = (id: number) => 40 + id * step;
  return (
    <div className="sentence-svg-scroll">
      <svg className="sentence-svg" viewBox={`0 0 ${width} 205`} role="img" aria-label="Árvore de dependências">
        <defs><marker id="syntax-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor" /></marker></defs>
        {analysis.dependencies.map((arc) => {
          const child = x(arc.id);
          const head = arc.head ? x(arc.head) : child;
          const distance = Math.abs(arc.id - arc.head);
          const peak = baseline - Math.min(125, 36 + distance * 16);
          const mid = (child + head) / 2;
          return (
            <g key={arc.id} className="syntax-arc">
              <path d={arc.head ? `M ${head} ${baseline - 17} Q ${mid} ${peak} ${child} ${baseline - 17}` : `M ${child} ${baseline - 70} L ${child} ${baseline - 18}`} fill="none" markerEnd="url(#syntax-arrow)" />
              <text x={mid} y={peak - 5} textAnchor="middle">{arc.deprel}</text>
            </g>
          );
        })}
        {analysis.words.map((word, index) => {
          const id = index + 1;
          const selected = analysis.clause.subject.includes(id) ? 'subject' : analysis.clause.predicate.includes(id) ? 'predicate' : '';
          return <g key={id} className={`syntax-token ${selected}`}>
            <circle cx={x(id)} cy={baseline} r="4" />
            <text x={x(id)} y={baseline + 22} textAnchor="middle">{word.form}</text>
            <text x={x(id)} y={baseline + 37} textAnchor="middle" className="minor">{id}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

function MeaningDiagram({ analysis }: { analysis: SentenceAnalysis }) {
  const graph = analysis.meaningGraph;
  const levels = new Map<string, number>();
  if (graph.root) levels.set(graph.root, 0);
  const queue = graph.root ? [graph.root] : [];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const edge of graph.edges.filter((item) => item.from === parent)) {
      if (levels.has(edge.to)) continue;
      levels.set(edge.to, (levels.get(parent) ?? 0) + 1);
      queue.push(edge.to);
    }
  }
  for (const node of graph.nodes) if (!levels.has(node.id)) levels.set(node.id, Math.max(0, ...levels.values()) + 1);
  const grouped = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const level = levels.get(node.id) ?? 0;
    grouped.set(level, [...(grouped.get(level) ?? []), node.id]);
  }
  const width = Math.max(850, Math.max(1, ...[...grouped.values()].map((items) => items.length)) * 260 + 100);
  const height = Math.max(190, (Math.max(0, ...grouped.keys()) + 1) * 145 + 30);
  const byId = new Map([...grouped.entries()].flatMap(([level, ids]) => ids.map((id, index) => [id, {
    x: (index + 1) * width / (ids.length + 1), y: 78 + level * 145
  }] as const)));
  const indegree = new Map(graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.to === node.id).length]));
  return (
    <div className="sentence-svg-scroll">
      <svg className="sentence-svg meaning-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafo de significado">
        <defs><marker id="meaning-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor" /></marker></defs>
        {graph.edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const sameLevel = Math.abs(from.y - to.y) < 1;
          const leftToRight = to.x > from.x;
          const start = sameLevel ? { x: from.x + (leftToRight ? 90 : -90), y: from.y } : { x: from.x, y: from.y + 25 };
          const end = sameLevel ? { x: to.x + (leftToRight ? -90 : 90), y: to.y } : { x: to.x, y: to.y - 25 };
          const mid = sameLevel ? { x: (start.x + end.x) / 2, y: start.y + 62 } : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 12 };
          const path = sameLevel
            ? `M ${start.x} ${start.y} Q ${mid.x} ${start.y + 85} ${end.x} ${end.y}`
            : `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;
          return <g key={`${edge.from}-${edge.role}-${edge.to}-${index}`} className="meaning-edge">
            <path d={path} fill="none" markerEnd="url(#meaning-arrow)" />
            <text x={mid.x} y={mid.y} textAnchor="middle">:{edge.role}</text>
          </g>;
        })}
        {graph.nodes.map((node) => {
          const p = byId.get(node.id)!;
          return <g key={node.id} className={`meaning-node ${indegree.get(node.id)! > 1 ? 'reentrant' : ''}`}>
            <rect x={p.x - 88} y={p.y - 22} width="176" height="44" rx="10" />
            <text x={p.x} y={p.y + 4} textAnchor="middle">{node.concept}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

export function SentenceAnalysisViews({ analysis, view }: Props) {
  if (view === 'classes') return (
    <div className="sentence-analysis-view">
      <h4>Classes e leituras selecionadas</h4>
      <table className="data-table">
        <thead><tr><th>Token</th><th>Lema</th><th>UPOS</th><th>Traços</th><th>Origem</th><th>Regra</th></tr></thead>
        <tbody>{analysis.words.map((word, index) => <tr key={index}>
          <td><strong>{word.form}</strong></td><td>{word.selected.lemma}</td><td><code>{word.selected.upos}</code></td>
          <td>{featureText(word.selected.feats)}</td><td>{word.selected.origin}</td><td><code>{word.selected.rule}</code></td>
        </tr>)}</tbody>
      </table>
      <h4>Desambiguação</h4>
      {analysis.trace.tagging.length ? <pre className="code-block">{analysis.trace.tagging.map((event) => `${event.index + 1}: ${event.rule} → removeu ${event.removed.map((reading) => reading.upos).join(', ')}`).join('\n')}</pre> : <p className="note">Nenhuma leitura foi eliminada por contexto.</p>}
    </div>
  );
  if (view === 'syntax') return (
    <div className="sentence-analysis-view">
      <h4>Árvore de dependências UD</h4>
      <DependencyDiagram analysis={analysis} />
      <div className="sentence-summary"><span>Sujeito: <strong>{analysis.clause.subject.map((id) => analysis.words[id - 1]?.form).join(' ') || 'oculto'}</strong></span><span>Predicado (núcleo): <strong>{analysis.clause.predicate.map((id) => analysis.words[id - 1]?.form).join(' ')}</strong></span><span>Predicado completo: <strong>{analysis.clause.completePredicate.map((id) => analysis.words[id - 1]?.form).join(' ')}</strong></span><span>Modo: {modeLabel[analysis.clause.mode]}</span><span>Polaridade: {polarityLabel[analysis.clause.polarity]}</span></div>
      <h4>CoNLL-U</h4><pre className="code-block">{analysis.conllu}</pre>
      <h4>Regras dos arcos</h4><pre className="code-block">{analysis.dependencies.map((arc) => `${arc.id} ← ${arc.head} ${arc.deprel} · ${arc.rule}`).join('\n')}</pre>
    </div>
  );
  return (
    <div className="sentence-analysis-view">
      <h4>Grafo de significado</h4>
      <MeaningDiagram analysis={analysis} />
      <h4>PENMAN</h4><pre className="code-block">{analysis.meaningGraph.penman}</pre>
      <h4>Trace semântico</h4><pre className="code-block">{analysis.meaningGraph.trace.map((event) => `${event.token ?? '—'} · ${event.rule}: ${event.detail}`).join('\n')}</pre>
      {analysis.meaningGraph.diagnostics.map((diagnostic, index) => <p key={index} className="note">{diagnosticLabel[diagnostic.code] ?? diagnostic.code}: {diagnostic.alternatives.join(', ')}</p>)}
    </div>
  );
}
