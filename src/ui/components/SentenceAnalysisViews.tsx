import React, { useEffect, useRef, useState } from 'react';
import type { SentenceAnalysis } from '../../engine/language/SentenceAnalysis';

export type SentenceView = 'classes' | 'syntax' | 'meaning';

const modeLabel = { declarative: 'declarativa', interrogative: 'interrogativa', imperative: 'imperativa' };
const polarityLabel = { positive: 'positiva', negative: 'negativa' };
const diagnosticLabel: Record<string, string> = { AMBIGUOUS_SENSE: 'Sentido ambíguo', UNCERTAIN_FRAME: 'Moldura genérica, análise incerta' };

interface Props {
  analysis: SentenceAnalysis;
  view: SentenceView;
  highlightedToken?: number | null;
  onHighlight?: (token: number | null) => void;
  onSelectToken?: (token: number) => void;
}

const relationNames: Record<string, string> = {
  nsubj: 'sujeito', obj: 'objeto direto', obl: 'complemento ou adjunto oblíquo',
  det: 'determinante', cop: 'verbo de ligação', advmod: 'modificador adverbial',
  advcl: 'oração adverbial', ccomp: 'oração complemento', conj: 'termo coordenado',
  amod: 'adjetivo modificador', nmod: 'modificador nominal', case: 'marcador de caso',
  root: 'raiz da frase', punct: 'pontuação'
};
const roleNames: Record<string, string> = {
  ARG0: 'quem faz', ARG1: 'o que sofre ou é desejado', ARG2: 'destinatário',
  LOC: 'onde', TIME: 'quando', MANNER: 'como', cause: 'causa', condition: 'condição',
  poss: 'posse', mod: 'modificador', degree: 'grau'
};

function downloadSvg(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return;
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function featureText(feats: Record<string, string>): string {
  return Object.entries(feats).map(([name, value]) => `${name}=${value}`).join(' | ') || '—';
}

function DependencyDiagram({ analysis, highlightedToken, onHighlight, onSelectToken, compact, selectedArc, onSelectArc, svgRef }: {
  analysis: SentenceAnalysis; highlightedToken?: number | null; onHighlight?: (token: number | null) => void;
  onSelectToken?: (token: number) => void; compact: boolean; selectedArc: number | null;
  onSelectArc: (arc: number | null) => void; svgRef: React.RefObject<SVGSVGElement>;
}) {
  const step = compact ? 78 : 112;
  const width = Math.max(520, analysis.words.length * step + 80);
  const x = (id: number) => 40 + id * step;
  const laneGap = compact ? 20 : 27;
  const lanes: Array<Array<{ left: number; right: number }>> = [];
  const laneByArc = new Map<number, number>();
  for (const arc of [...analysis.dependencies].sort((a, b) => Math.abs(b.id - b.head) - Math.abs(a.id - a.head))) {
    const midpoint = arc.head ? (x(arc.id) + x(arc.head)) / 2 : x(arc.id);
    const halfWidth = Math.max(28, arc.deprel.length * 3.8 + 10);
    const interval = { left: midpoint - halfWidth, right: midpoint + halfWidth };
    let lane = 0;
    while (lanes[lane]?.some((used) => interval.left < used.right && interval.right > used.left)) lane++;
    (lanes[lane] ??= []).push(interval);
    laneByArc.set(arc.id, lane);
  }
  const baseline = Math.max(compact ? 145 : 190, 98 + lanes.length * laneGap);
  return (
    <div className="sentence-svg-scroll">
      <svg ref={svgRef} className="sentence-svg" viewBox={`0 0 ${width} ${baseline + 48}`} role="img" aria-label="Árvore de dependências">
        <defs><marker id="syntax-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor" /></marker></defs>
        {analysis.dependencies.map((arc) => {
          const child = x(arc.id);
          const head = arc.head ? x(arc.head) : child;
          const peak = baseline - 46 - (laneByArc.get(arc.id) ?? 0) * laneGap;
          const mid = (child + head) / 2;
          return (
            <g key={arc.id} className={`syntax-arc rel-${arc.deprel.split(':')[0]} ${selectedArc === arc.id || highlightedToken === arc.id || highlightedToken === arc.head ? 'is-highlighted' : ''}`}
              role="button" tabIndex={0} aria-label={`${arc.deprel}: ${relationNames[arc.deprel] ?? relationNames[arc.deprel.split(':')[0]] ?? 'relação sintática'}`}
              onMouseEnter={() => onHighlight?.(arc.id)} onMouseLeave={() => onHighlight?.(null)}
              onClick={() => { onSelectArc(arc.id); onSelectToken?.(arc.id); }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectArc(arc.id); onSelectToken?.(arc.id); } }}>
              <title>{arc.deprel} = {relationNames[arc.deprel] ?? relationNames[arc.deprel.split(':')[0]] ?? 'relação sintática'}</title>
              <path d={arc.head ? `M ${head} ${baseline - 17} Q ${mid} ${peak} ${child} ${baseline - 17}` : `M ${child} ${baseline - 70} L ${child} ${baseline - 18}`} fill="none" markerEnd="url(#syntax-arrow)" />
              <text x={mid} y={peak - 7} textAnchor="middle">{arc.deprel}</text>
            </g>
          );
        })}
        {analysis.words.map((word, index) => {
          const id = index + 1;
          const selected = analysis.clause.subject.includes(id) ? 'subject' : analysis.clause.predicate.includes(id) ? 'predicate' : '';
          return <g key={id} data-token-id={id} className={`syntax-token ${selected} ${highlightedToken === id ? 'is-highlighted' : ''}`}
            role="button" tabIndex={0} aria-label={`Palavra ${word.form}`}
            onMouseEnter={() => onHighlight?.(id)} onMouseLeave={() => onHighlight?.(null)}
            onClick={() => onSelectToken?.(id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectToken?.(id); } }}>
            <circle cx={x(id)} cy={baseline} r="4" />
            <text x={x(id)} y={baseline + 22} textAnchor="middle">{word.form}</text>
            <text x={x(id)} y={baseline + 37} textAnchor="middle" className="minor">{id}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

function MeaningDiagram({ analysis, highlightedToken, onHighlight, onSelectToken, svgRef }: {
  analysis: SentenceAnalysis; highlightedToken?: number | null; onHighlight?: (token: number | null) => void;
  onSelectToken?: (token: number) => void; svgRef: React.RefObject<SVGSVGElement>;
}) {
  const graph = analysis.meaningGraph;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setOverrides({}); setSelectedNode(null); }, [analysis]);
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
  const position = (id: string) => overrides[id] ?? byId.get(id);
  const resetLayout = () => { setZoom(1); setPan({ x: 0, y: 0 }); setOverrides({}); };
  const selected = graph.nodes.find((node) => node.id === selectedNode);
  const semanticTrace = graph.trace.filter((event) => selected?.token === event.token &&
    (event.rule === 'SENSE_FRAME_PREF' || event.rule === 'SENSE_PREFERENCE'));
  return (
    <div>
      <div className="diagram-toolbar" aria-label="Controles do grafo">
        <button aria-label="Aproximar grafo" onClick={() => setZoom((value) => Math.min(2.5, value + .2))}>＋ Aproximar</button>
        <button aria-label="Afastar grafo" onClick={() => setZoom((value) => Math.max(.5, value - .2))}>− Afastar</button>
        <button onClick={resetLayout}>Reiniciar posições</button>
        <span className="note">Arraste o fundo para mover; arraste um nó para reposicionar. Teclas: setas, +, − e 0.</span>
      </div>
    <div className="sentence-svg-scroll graph-viewport">
      <svg ref={svgRef} className="sentence-svg meaning-svg" viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0}
        aria-label="Grafo de significado interativo" onWheel={(event) => {
          setZoom((value) => Math.min(2.5, Math.max(.5, value + (event.deltaY < 0 ? .1 : -.1))));
        }}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
          if (directions[event.key]) { event.preventDefault(); setPan((value) => ({ x: value.x + directions[event.key][0], y: value.y + directions[event.key][1] })); }
          if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((value) => Math.min(2.5, value + .2)); }
          if (event.key === '-') { event.preventDefault(); setZoom((value) => Math.max(.5, value - .2)); }
          if (event.key === '0') { event.preventDefault(); resetLayout(); }
        }}>
        <defs><marker id="meaning-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor" /></marker></defs>
        <rect className="graph-hit" x="0" y="0" width={width} height={height} fill="transparent"
          onPointerDown={(event) => { setPanning({ x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y }); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (panning) setPan({ x: panning.startX + event.clientX - panning.x, y: panning.startY + event.clientY - panning.y }); }}
          onPointerUp={() => setPanning(null)} />
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {graph.edges.map((edge, index) => {
          const from = position(edge.from);
          const to = position(edge.to);
          if (!from || !to) return null;
          const sameLevel = Math.abs(from.y - to.y) < 1;
          const leftToRight = to.x > from.x;
          const start = sameLevel ? { x: from.x + (leftToRight ? 90 : -90), y: from.y } : { x: from.x, y: from.y + 25 };
          const end = sameLevel ? { x: to.x + (leftToRight ? -90 : 90), y: to.y } : { x: to.x, y: to.y - 25 };
          const mid = sameLevel ? { x: (start.x + end.x) / 2, y: start.y + 62 + (index % 3) * 11 } : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 12 + (index % 3) * 10 };
          const path = sameLevel
            ? `M ${start.x} ${start.y} Q ${mid.x} ${start.y + 85} ${end.x} ${end.y}`
            : `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;
          return <g key={`${edge.from}-${edge.role}-${edge.to}-${index}`} className={`meaning-edge role-${edge.role.toLowerCase()}`}>
            <title>{edge.role} = {roleNames[edge.role] ?? 'papel semântico'}</title>
            <path d={path} fill="none" markerEnd="url(#meaning-arrow)" />
            <text x={mid.x} y={mid.y} textAnchor="middle">:{edge.role}</text>
          </g>;
        })}
        {graph.nodes.map((node) => {
          const p = position(node.id)!;
          return <g key={node.id} data-token-id={node.token} className={`meaning-node ${indegree.get(node.id)! > 1 ? 'reentrant' : ''} ${highlightedToken === node.token ? 'is-highlighted' : ''}`}
            role="button" tabIndex={0} aria-label={`Conceito ${node.concept}${indegree.get(node.id)! > 1 ? ', reentrância' : ''}`}
            onMouseEnter={() => onHighlight?.(node.token ?? null)} onMouseLeave={() => onHighlight?.(null)}
            onClick={() => { setSelectedNode(node.id); if (node.token) onSelectToken?.(node.token); }}
            onPointerDown={(event) => { event.stopPropagation(); setDrag({ id: node.id, x: event.clientX, y: event.clientY, startX: p.x, startY: p.y }); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (drag?.id === node.id) setOverrides((current) => ({ ...current, [node.id]: {
              x: drag.startX + (event.clientX - drag.x) / zoom, y: drag.startY + (event.clientY - drag.y) / zoom
            } })); }}
            onPointerUp={() => setDrag(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedNode(node.id); if (node.token) onSelectToken?.(node.token); }
              const delta: Record<string, [number, number]> = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
              if (delta[event.key]) { event.preventDefault(); event.stopPropagation(); setOverrides((current) => ({ ...current, [node.id]: { x: p.x + delta[event.key][0], y: p.y + delta[event.key][1] } })); }
            }}>
            <title>{node.concept}{indegree.get(node.id)! > 1 ? ' · usado por mais de um predicado' : ''}</title>
            <rect x={p.x - 88} y={p.y - 22} width="176" height="44" rx="10" />
            <text x={p.x} y={p.y + 4} textAnchor="middle">{node.concept.length > 24 ? `${node.concept.slice(0, 23)}…` : node.concept}</text>
          </g>;
        })}
        </g>
      </svg>
    </div>
    {selected && <div className="graph-node-detail ui-card" role="status"><strong>{selected.concept}</strong>
      <span>Sentido: {selected.concept}</span><span>Moldura e preferência: {semanticTrace.map((event) => `${event.rule} · ${event.detail}`).join(' | ') || 'sem moldura específica'}</span>
      {indegree.get(selected.id)! > 1 && <span>Reentrância: este mesmo conceito participa de mais de uma relação.</span>}
    </div>}
    </div>
  );
}

export function SentenceAnalysisViews({ analysis, view, highlightedToken, onHighlight, onSelectToken }: Props) {
  const syntaxSvg = useRef<SVGSVGElement>(null);
  const meaningSvg = useRef<SVGSVGElement>(null);
  const [compact, setCompact] = useState(false);
  const [selectedArc, setSelectedArc] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setFeedback('Copiado.'); }
    catch (error) { setFeedback(`Não foi possível copiar: ${(error as Error).message}`); }
  };
  if (view === 'classes') return (
    <div className="sentence-analysis-view">
      <h4>Classes e leituras selecionadas</h4>
      <table className="data-table">
        <thead><tr><th>Token</th><th>Lema</th><th>UPOS</th><th>Traços</th><th>Origem</th><th>Regra</th></tr></thead>
        <tbody>{analysis.words.map((word, index) => <tr key={index} data-token-id={index + 1}
          className={highlightedToken === index + 1 ? 'is-highlighted' : ''}
          onMouseEnter={() => onHighlight?.(index + 1)} onMouseLeave={() => onHighlight?.(null)}>
          <td><button className="token-cell-button" onFocus={() => onHighlight?.(index + 1)} onBlur={() => onHighlight?.(null)}
            onClick={() => onSelectToken?.(index + 1)}>{word.form}</button></td><td>{word.selected.lemma}</td><td><code>{word.selected.upos}</code></td>
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
      <div className="diagram-legend"><span className="rel-core">Sujeito e objeto</span><span className="rel-clause">Orações</span><span className="rel-mod">Modificadores</span></div>
      <div className="diagram-toolbar"><button onClick={() => setCompact((value) => !value)} aria-pressed={compact}>{compact ? 'Modo expandido' : 'Modo compacto'}</button><button onClick={() => downloadSvg(syntaxSvg.current, 'sintaxe.svg')}>Baixar SVG</button><button onClick={() => copy(analysis.conllu)}>Copiar CoNLL-U</button></div>
      {feedback && <p role="status" className="note">{feedback}</p>}
      <DependencyDiagram analysis={analysis} highlightedToken={highlightedToken} onHighlight={onHighlight} onSelectToken={onSelectToken} compact={compact} selectedArc={selectedArc} onSelectArc={setSelectedArc} svgRef={syntaxSvg} />
      {selectedArc && <p className="note">Relação selecionada: {analysis.dependencies[selectedArc - 1]?.deprel} — núcleo {analysis.words[(analysis.dependencies[selectedArc - 1]?.head ?? 0) - 1]?.form ?? 'raiz'}, dependente {analysis.words[selectedArc - 1]?.form}.</p>}
      <div className="sentence-summary"><span>Sujeito: <strong>{analysis.clause.subject.map((id) => analysis.words[id - 1]?.form).join(' ') || 'oculto'}</strong></span><span>Predicado (núcleo): <strong>{analysis.clause.predicate.map((id) => analysis.words[id - 1]?.form).join(' ')}</strong></span><span>Predicado completo: <strong>{analysis.clause.completePredicate.map((id) => analysis.words[id - 1]?.form).join(' ')}</strong></span><span>Modo: {modeLabel[analysis.clause.mode]}</span><span>Polaridade: {polarityLabel[analysis.clause.polarity]}</span></div>
      <h4>CoNLL-U</h4><pre className="code-block">{analysis.conllu}</pre>
      <h4>Regras dos arcos</h4><pre className="code-block">{analysis.dependencies.map((arc) => `${arc.id} ← ${arc.head} ${arc.deprel} · ${arc.rule}`).join('\n')}</pre>
    </div>
  );
  return (
    <div className="sentence-analysis-view">
      <h4>Grafo de significado</h4>
      <div className="diagram-legend"><span className="role-arg0">ARG0 · quem faz</span><span className="role-arg1">ARG1 · o quê</span><span className="role-loc">LOC · onde</span><span className="role-time">TIME · quando</span></div>
      <div className="diagram-toolbar"><button onClick={() => downloadSvg(meaningSvg.current, 'significado.svg')}>Baixar SVG</button><button onClick={() => copy(analysis.meaningGraph.penman)}>Copiar PENMAN</button></div>
      {feedback && <p role="status" className="note">{feedback}</p>}
      <MeaningDiagram analysis={analysis} highlightedToken={highlightedToken} onHighlight={onHighlight} onSelectToken={onSelectToken} svgRef={meaningSvg} />
      <h4>PENMAN</h4><pre className="code-block">{analysis.meaningGraph.penman}</pre>
      <h4>Trace semântico</h4><pre className="code-block">{analysis.meaningGraph.trace.map((event) => `${event.token ?? '—'} · ${event.rule}: ${event.detail}`).join('\n')}</pre>
      {analysis.meaningGraph.diagnostics.map((diagnostic, index) => <p key={index} className="note">{diagnosticLabel[diagnostic.code] ?? diagnostic.code}: {diagnostic.alternatives.join(', ')}</p>)}
    </div>
  );
}
