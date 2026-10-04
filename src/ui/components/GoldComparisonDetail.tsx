import React from 'react';
import { parseGraph, type ParsedGraph } from '../../eval/graphMatch';
import type { DependencyArc } from '../../engine/language/DependencyParser';

interface Arc { dep: number; head: number; rel: string }
interface Props {
  sentence: { text: string; tokens: Array<{ form: string }>; dependencies: Arc[]; meaningGraph: string };
  actualArcs: DependencyArc[];
  actualGraph: string;
}

function Tree({ words, arcs, other }: { words: string[]; arcs: Arc[]; other: Arc[] }) {
  const step = 92;
  const width = Math.max(520, (words.length + 1) * step);
  const base = 164;
  const x = (id: number) => 28 + id * step;
  return <div className="sentence-svg-scroll"><svg className="comparison-tree" viewBox={`0 0 ${width} 210`} role="img" aria-label="Árvore sintática comparada">
    {arcs.map((arc) => {
      const head = arc.head ? x(arc.head) : x(arc.dep);
      const child = x(arc.dep);
      const mid = (head + child) / 2;
      const peak = base - Math.min(128, 34 + Math.abs(arc.dep - arc.head) * 16);
      const match = other.some((item) => item.dep === arc.dep && item.head === arc.head && item.rel === arc.rel);
      return <g key={arc.dep} className={match ? 'comparison-match' : 'comparison-diff'}>
        <title>{`${arc.rel}: ${arc.head} → ${arc.dep}${match ? '' : ' · divergente'}`}</title>
        <path d={arc.head ? `M ${head} ${base - 16} Q ${mid} ${peak} ${child} ${base - 16}` : `M ${child} ${base - 65} L ${child} ${base - 16}`} fill="none" />
        <text x={mid} y={peak - 7} textAnchor="middle">{arc.rel}</text>
      </g>;
    })}
    {words.map((form, index) => <g key={index}><circle cx={x(index + 1)} cy={base} r="4" /><text x={x(index + 1)} y={base + 21} textAnchor="middle">{form}</text></g>)}
  </svg></div>;
}

function edgeTriples(graph: ParsedGraph) {
  const concepts = new Map(graph.nodes.map((node) => [node.id, node.concept]));
  return graph.edges.map((edge) => JSON.stringify([concepts.get(edge.from), edge.role, concepts.get(edge.to)]));
}

function Graph({ source, other }: { source: string; other: string }) {
  const graph = parseGraph(source);
  const otherGraph = parseGraph(other);
  const otherTriples = edgeTriples(otherGraph);
  const concepts = new Map(graph.nodes.map((node) => [node.id, node.concept]));
  const positions = new Map(graph.nodes.map((node, index) => [node.id, { x: 145 + (index % 3) * 225, y: 55 + Math.floor(index / 3) * 112 }]));
  const width = 750;
  const height = Math.max(150, 120 + Math.ceil(graph.nodes.length / 3) * 112);
  return <div className="sentence-svg-scroll"><svg className="comparison-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafo semântico comparado">
    {graph.edges.map((edge, index) => {
      const from = positions.get(edge.from)!;
      const to = positions.get(edge.to)!;
      const triple = JSON.stringify([concepts.get(edge.from), edge.role, concepts.get(edge.to)]);
      const match = otherTriples.includes(triple);
      return <g key={index} className={match ? 'comparison-match' : 'comparison-diff'}><title>{`${edge.role}${match ? '' : ' · divergente'}`}</title>
        <path d={`M ${from.x} ${from.y + 19} L ${to.x} ${to.y - 19}`} fill="none" />
        <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 5} textAnchor="middle">:{edge.role}</text></g>;
    })}
    {graph.nodes.map((node) => { const p = positions.get(node.id)!; const match = otherGraph.nodes.some((item) => item.concept === node.concept);
      return <g key={node.id} className={match ? 'comparison-match' : 'comparison-diff'}><rect x={p.x - 91} y={p.y - 20} width="182" height="40" rx="9" /><text x={p.x} y={p.y + 4} textAnchor="middle">{node.concept.length > 22 ? `${node.concept.slice(0, 21)}…` : node.concept}</text></g>;
    })}
  </svg></div>;
}

export function GoldComparisonDetail({ sentence, actualArcs, actualGraph }: Props) {
  const actual = actualArcs.map((arc) => ({ dep: arc.id, head: arc.head, rel: arc.deprel }));
  const words = sentence.tokens.map((token) => token.form);
  return <section className="gold-comparison" aria-label={`Comparação da frase ${sentence.text}`}>
    <h4>{sentence.text}</h4><p className="note">Divergências aparecem em vermelho. Arraste horizontalmente os diagramas longos.</p>
    <div className="comparison-columns"><div className="ui-card"><h5>Gabarito · árvore</h5><Tree words={words} arcs={sentence.dependencies} other={actual} /></div>
      <div className="ui-card"><h5>Obtido · árvore</h5><Tree words={words} arcs={actual} other={sentence.dependencies} /></div></div>
    <div className="comparison-columns"><div className="ui-card"><h5>Gabarito · grafo</h5><Graph source={sentence.meaningGraph} other={actualGraph} /></div>
      <div className="ui-card"><h5>Obtido · grafo</h5><Graph source={actualGraph} other={sentence.meaningGraph} /></div></div>
  </section>;
}
