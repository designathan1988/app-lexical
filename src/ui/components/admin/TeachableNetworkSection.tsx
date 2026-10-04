import React, { useMemo, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import type { TeachablePos } from '../../../knowledge/language/teachableRoot';
import { LANGUAGE_PARADIGMS, suggestParadigm } from '../../../engine/language/LanguageInflector';
import { buildNetworkView } from '../../../engine/language/NetworkView';
import semanticTypes from '../../../knowledge/morphology/semantic-types.json';
import frameData from '../../../knowledge/morphology/frames.json';

interface Props { engine: SemanticEngine; store: KnowledgeBaseStore; onChange: () => void }

const classes: Array<{ id: TeachablePos; label: string }> = [
  { id: 'VERB', label: 'Verbo' }, { id: 'NOUN', label: 'Substantivo' },
  { id: 'ADJECTIVE', label: 'Adjetivo' }, { id: 'ADVERB', label: 'Advérbio' }
];
const types = (semanticTypes as { types: Array<{ id: string; definition: string }> }).types;
const frames = (frameData as { frames: Array<{ id: string }> }).frames;

function NetworkDiagram({ view }: { view: ReturnType<typeof buildNetworkView> }) {
  const boxes = [
    { id: 'lemma', x: 95, y: 165, label: view.lemma },
    { id: 'forms', x: 330, y: 55, label: `${view.forms.length} formas` },
    { id: 'derivatives', x: 330, y: 275, label: `${view.derivatives.length} derivados` },
    { id: 'sense', x: 560, y: 165, label: view.sense },
    { id: 'frame', x: 785, y: 55, label: view.frame ?? 'sem moldura' },
    { id: 'type', x: 785, y: 275, label: view.semanticType }
  ];
  const links = [['lemma', 'forms'], ['lemma', 'derivatives'], ['lemma', 'sense'], ['sense', 'frame'], ['sense', 'type']];
  const byId = new Map(boxes.map((box) => [box.id, box]));
  return <div className="sentence-svg-scroll"><svg className="sentence-svg network-svg" viewBox="0 0 990 350" role="img" aria-label="Rede da palavra ensinada">
    <defs><marker id="network-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor" /></marker></defs>
    {links.map(([a, b]) => { const from = byId.get(a)!; const to = byId.get(b)!; return <path key={`${a}-${b}`} d={`M ${from.x + 92} ${from.y} L ${to.x - 92} ${to.y}`} fill="none" stroke="#8b9cc7" markerEnd="url(#network-arrow)" />; })}
    {boxes.map((box) => <g key={box.id} className="meaning-node"><rect x={box.x - 92} y={box.y - 25} width="184" height="50" rx="10" /><text x={box.x} y={box.y + 4} textAnchor="middle">{box.label}</text></g>)}
  </svg></div>;
}

export function TeachableNetworkSection({ store, onChange }: Props) {
  const [view, setView] = useState<'teach' | 'network'>('teach');
  const [lemma, setLemma] = useState('');
  const [pos, setPos] = useState<TeachablePos>('VERB');
  const [paradigmId, setParadigmId] = useState('');
  const [gloss, setGloss] = useState('');
  const [semanticType, setSemanticType] = useState('ACAO');
  const [frameTemplateId, setFrameTemplateId] = useState(frames[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState(store.kb.languageRoots[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const suggestion = useMemo(() => suggestParadigm(lemma.trim().toLocaleLowerCase('pt-BR'), pos), [lemma, pos]);
  const selectedParadigm = paradigmId || suggestion?.id || '';
  const root = store.kb.languageRoots.find((item) => item.id === selectedId);
  const network = root ? buildNetworkView(root, store.kb) : null;
  const paradigms = Object.values(LANGUAGE_PARADIGMS).filter((item) => item.pos === pos);

  const teach = () => {
    try {
      const taught = store.teachRoot({ lemma, pos, paradigmId: selectedParadigm, gloss, semanticType, ...(pos === 'VERB' ? { frameTemplateId } : {}) });
      setSelectedId(taught.id);
      setMessage(store.lastPersistError
        ? `Raiz “${taught.lemma}” salva separadamente. O histórico completo excedeu a cota local.`
        : `Raiz “${taught.lemma}” ensinada e salva na base.`);
      setView('network');
      onChange();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return <section className="admin-section sentence-admin">
    <div className="section-header"><h3>Rede ensinável</h3></div>
    <div className="inspector-tabs"><button className={view === 'teach' ? 'tab active' : 'tab'} onClick={() => setView('teach')}>Ensinar palavra</button><button className={view === 'network' ? 'tab active' : 'tab'} onClick={() => setView('network')}>Rede</button></div>
    {message && <p className="note" role="status">{message}</p>}
    {view === 'teach' ? <div className="form-grid network-form">
      <label>Lema<input value={lemma} onChange={(event) => { setLemma(event.target.value); setParadigmId(''); }} placeholder="ex.: surfar" /></label>
      <label>Classe<select value={pos} onChange={(event) => { setPos(event.target.value as TeachablePos); setParadigmId(''); }}>
        {classes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>Paradigma sugerido<select value={selectedParadigm} onChange={(event) => setParadigmId(event.target.value)}>
        <option value="">Escolha um paradigma</option>{paradigms.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
      </select><small>Regra: {suggestion?.rule ?? 'sem sugestão'}</small></label>
      <label>Glosa do sentido<input value={gloss} onChange={(event) => setGloss(event.target.value)} placeholder="descreva o significado" /></label>
      <label>Tipo semântico<select value={semanticType} onChange={(event) => setSemanticType(event.target.value)}>{types.map((item) => <option key={item.id} value={item.id}>{item.id} — {item.definition}</option>)}</select></label>
      {pos === 'VERB' && <label>Moldura verbal existente<select value={frameTemplateId} onChange={(event) => setFrameTemplateId(event.target.value)}>{frames.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>}
      <button className="primary" onClick={teach}>Ensinar palavra</button>
    </div> : <div>
      <label className="network-select">Raiz<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Escolha uma raiz</option>{store.kb.languageRoots.map((item) => <option key={item.id} value={item.id}>{item.lemma}</option>)}</select></label>
      {network ? <>
        <NetworkDiagram view={network} />
        <div className="sentence-summary"><span>Paradigma: <strong>{network.paradigm}</strong> ({network.paradigmRule})</span><span>Sentido: <strong>{network.sense}</strong> — {network.gloss}</span><span>Moldura: <strong>{network.frame ?? 'não se aplica'}</strong></span><span>Tipo: <strong>{network.semanticType}</strong></span></div>
        <h4>Formas geradas ({network.forms.length})</h4><div className="mwe-chips">{network.forms.slice(0, 24).map((form, index) => <span key={`${form.surface}-${index}`} className="chip">{form.surface}<em>{form.features}</em></span>)}</div>
        <h4>Derivados</h4>{network.derivatives.length ? <table className="data-table"><thead><tr><th>Forma</th><th>Regra</th><th>Status</th></tr></thead><tbody>{network.derivatives.map((item) => <tr key={item.form}><td>{item.form}</td><td>{item.rule}</td><td>{item.status === 'ATTESTED' ? 'atestada' : 'hipótese'}</td></tr>)}</tbody></table> : <p className="note">Nenhum derivado gerado pelas regras atuais.</p>}
      </> : <p className="note">Ensine uma raiz para ver sua rede.</p>}
    </div>}
  </section>;
}
