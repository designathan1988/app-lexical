import React, { useMemo, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import type { TeachablePos } from '../../../knowledge/language/teachableRoot';
import { LANGUAGE_PARADIGMS, suggestParadigm } from '../../../engine/language/LanguageInflector';
import { generateForms } from '../../../knowledge/paradigms';
import { buildNetworkView } from '../../../engine/language/NetworkView';
import semanticTypes from '../../../knowledge/morphology/semantic-types.json';
import frameData from '../../../knowledge/morphology/frames.json';

interface Props { engine: SemanticEngine; store: KnowledgeBaseStore; onChange: () => void; onAnalyze?: (sentence: string) => void }

const classes: Array<{ id: TeachablePos; label: string }> = [
  { id: 'VERB', label: 'Verbo' }, { id: 'NOUN', label: 'Substantivo' },
  { id: 'ADJECTIVE', label: 'Adjetivo' }, { id: 'ADVERB', label: 'Advérbio' }
];
const types = (semanticTypes as { types: Array<{ id: string; definition: string }> }).types;
const frames = (frameData as { frames: Array<{ id: string }> }).frames;

function NetworkDiagram({ view, active, onToggle }: { view: ReturnType<typeof buildNetworkView>; active: string | null; onToggle: (id: string) => void }) {
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
  const paths: Record<string, string[]> = { lemma: ['lemma'], forms: ['lemma', 'forms'], derivatives: ['lemma', 'derivatives'],
    sense: ['lemma', 'sense'], frame: ['lemma', 'sense', 'frame'], type: ['lemma', 'sense', 'type'] };
  const activePath = paths[active ?? ''] ?? [];
  return <div className="sentence-svg-scroll"><svg className="sentence-svg network-svg" viewBox="0 0 990 350" role="img" aria-label="Rede da palavra ensinada">
    <defs><marker id="network-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="currentColor" /></marker></defs>
    {links.map(([a, b]) => { const from = byId.get(a)!; const to = byId.get(b)!; return <path key={`${a}-${b}`} className={activePath.includes(a) && activePath.includes(b) ? 'network-link active' : 'network-link'} d={`M ${from.x + 92} ${from.y} L ${to.x - 92} ${to.y}`} fill="none" stroke="var(--syntax)" markerEnd="url(#network-arrow)" />; })}
    {boxes.map((box) => <g key={box.id} className={`meaning-node ${activePath.includes(box.id) ? 'is-highlighted' : ''}`} role="button" tabIndex={0}
      aria-label={`${active === box.id ? 'Recolher' : 'Expandir'} ${box.id}`} onClick={() => onToggle(box.id)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(box.id); } }}>
      <rect x={box.x - 92} y={box.y - 25} width="184" height="50" rx="10" /><text x={box.x} y={box.y + 4} textAnchor="middle">{box.label}</text></g>)}
  </svg></div>;
}

export function TeachableNetworkSection({ store, onChange, onAnalyze }: Props) {
  const [view, setView] = useState<'teach' | 'network'>('teach');
  const [step, setStep] = useState(1);
  const [lemma, setLemma] = useState('');
  const [pos, setPos] = useState<TeachablePos>('VERB');
  const [paradigmId, setParadigmId] = useState('');
  const [gloss, setGloss] = useState('');
  const [semanticType, setSemanticType] = useState('ACAO');
  const [frameTemplateId, setFrameTemplateId] = useState(frames[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState(store.kb.languageRoots[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [example, setExample] = useState('');
  const [undoVersionId, setUndoVersionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const suggestion = useMemo(() => suggestParadigm(lemma.trim().toLocaleLowerCase('pt-BR'), pos), [lemma, pos]);
  const selectedParadigm = paradigmId || suggestion?.id || '';
  const root = store.kb.languageRoots.find((item) => item.id === selectedId);
  const latestVersion = store.versions[store.versions.length - 1];
  const previousVersion = store.versions[store.versions.length - 2];
  const reversibleVersionId = undoVersionId ?? (root && latestVersion?.label === `Raiz ensinada: ${root.lemma}` ? previousVersion?.id ?? null : null);
  const network = root ? buildNetworkView(root, store.kb) : null;
  const paradigms = Object.values(LANGUAGE_PARADIGMS).filter((item) => item.pos === pos);
  const preview = useMemo(() => {
    const paradigm = LANGUAGE_PARADIGMS[selectedParadigm];
    return lemma.trim() && paradigm ? generateForms('PREVIEW', lemma.trim().toLocaleLowerCase('pt-BR'), paradigm).slice(0, 12) : [];
  }, [lemma, selectedParadigm]);
  const filteredRoots = store.kb.languageRoots.filter((item) => item.lemma.includes(search.trim().toLocaleLowerCase('pt-BR')));

  const teach = async () => {
    let added = false;
    try {
      setSaving(true);
      const previous = store.versions[store.versions.length - 1]?.id ?? null;
      const taught = store.teachRoot({ lemma, pos, paradigmId: selectedParadigm, gloss, semanticType, ...(pos === 'VERB' ? { frameTemplateId } : {}) });
      added = true;
      setUndoVersionId(previous);
      setSelectedId(taught.id);
      setView('network');
      onChange();
      await store.flushPersistence();
      setMessage(`Raiz “${taught.lemma}” e histórico completo salvos na base local.`);
    } catch (error) {
      setMessage(added ? `A gravação completa falhou: ${(error as Error).message}` : (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const undoTeach = async () => {
    if (!reversibleVersionId) return;
    if (!store.restoreVersion(reversibleVersionId)) { setMessage('Não foi possível restaurar a versão anterior.'); return; }
    setUndoVersionId(null);
    setSelectedId('');
    onChange();
    await store.flushPersistence();
    setMessage('Ensino desfeito; a versão anterior foi restaurada.');
  };

  return <section className="admin-section sentence-admin">
    <div className="section-header"><h3>Rede ensinável</h3></div>
    <div className="inspector-tabs"><button className={view === 'teach' ? 'tab active' : 'tab'} onClick={() => setView('teach')}>Ensinar palavra</button><button className={view === 'network' ? 'tab active' : 'tab'} onClick={() => setView('network')}>Rede</button></div>
    {message && <p className="note" role="status">{message}</p>}
    {view === 'teach' ? <div className="teach-wizard ui-card">
      <div className="wizard-steps" aria-label="Etapas do ensino">{['Palavra e classe', 'Paradigma', 'Sentido e moldura', 'Confirmar'].map((label, index) =>
        <button key={label} className={step === index + 1 ? 'active' : ''} aria-current={step === index + 1 ? 'step' : undefined}
          onClick={() => setStep(index + 1)}>{index + 1}. {label}</button>)}</div>
      <div className="form-grid network-form">
      {step === 1 && <><h4>1. Palavra e classe</h4>
      <label>Lema<input value={lemma} onChange={(event) => { setLemma(event.target.value); setParadigmId(''); }} placeholder="ex.: surfar" /></label>
      <label>Classe<select value={pos} onChange={(event) => { setPos(event.target.value as TeachablePos); setParadigmId(''); }}>
        {classes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label></>}
      {step === 2 && <><h4>2. Paradigma e prévia</h4><label>Paradigma sugerido<select value={selectedParadigm} onChange={(event) => setParadigmId(event.target.value)}>
        <option value="">Escolha um paradigma</option>{paradigms.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
      </select><small>Regra: {suggestion?.rule ?? 'sem sugestão'}</small></label>
      <div className="mwe-chips" aria-label="Prévia das formas">{preview.map((form, index) => <span className="chip" key={`${form.surface}-${index}`}>{form.surface}<em>{form.featureKey}</em></span>)}</div>
      {!preview.length && <p className="ui-empty">Informe um lema e escolha um paradigma para ver as formas.</p>}</>}
      {step === 3 && <><h4>3. Sentido, tipo e moldura</h4><label>Glosa do sentido<input value={gloss} onChange={(event) => setGloss(event.target.value)} placeholder="descreva o significado" /></label>
      <label>Tipo semântico<select value={semanticType} onChange={(event) => setSemanticType(event.target.value)}>{types.map((item) => <option key={item.id} value={item.id}>{item.id} — {item.definition}</option>)}</select></label>
      {pos === 'VERB' && <label>Moldura verbal existente<select value={frameTemplateId} onChange={(event) => setFrameTemplateId(event.target.value)}>{frames.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>}
      <label>Frase de exemplo<input value={example} onChange={(event) => setExample(event.target.value)} placeholder="Escreva uma frase para testar depois" /></label></>}
      {step === 4 && <div className="wizard-review"><h4>4. Confirmar ensino</h4><p><strong>{lemma || '—'}</strong> · {classes.find((item) => item.id === pos)?.label} · paradigma {selectedParadigm || '—'}</p>
        <p>{gloss || 'Sem glosa'} · tipo {semanticType} · moldura {pos === 'VERB' ? frameTemplateId : 'não se aplica'}</p><p>Exemplo: {example || 'Não informado'}</p>
        <button className="primary" onClick={teach} disabled={saving || !lemma.trim() || !gloss.trim() || !selectedParadigm || !example.trim()}>{saving ? 'Salvando…' : 'Confirmar e ensinar'}</button></div>}
      </div>
      <div className="wizard-actions"><button onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1}>Voltar</button>
        <button onClick={() => setStep((value) => Math.min(4, value + 1))} disabled={step === 4 || step === 1 && !lemma.trim() || step === 2 && !selectedParadigm || step === 3 && (!gloss.trim() || !example.trim())}>Continuar</button></div>
    </div> : <div>
      <div className="network-select"><label>Buscar lema<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite um lema" /></label>
        <label>Raiz<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Escolha uma raiz</option>{filteredRoots.map((item) => <option key={item.id} value={item.id}>{item.lemma}</option>)}</select></label></div>
      {network ? <>
        <NetworkDiagram view={network} active={activeNode} onToggle={(id) => setActiveNode((current) => current === id ? null : id)} />
        {activeNode && <div className="network-node-detail ui-card" role="status"><strong>{activeNode}</strong><p>{activeNode === 'forms' ? network.forms.slice(0, 18).map((form) => form.surface).join(' · ')
          : activeNode === 'derivatives' ? network.derivatives.map((item) => item.form).join(' · ') || 'Sem derivados'
          : activeNode === 'sense' ? `${network.sense}: ${network.gloss}`
          : activeNode === 'frame' ? network.frame ?? 'Sem moldura'
          : activeNode === 'type' ? network.semanticType : network.lemma}</p></div>}
        <div className="sentence-summary"><span>Paradigma: <strong>{network.paradigm}</strong> ({network.paradigmRule})</span><span>Sentido: <strong>{network.sense}</strong> — {network.gloss}</span><span>Moldura: <strong>{network.frame ?? 'não se aplica'}</strong></span><span>Tipo: <strong>{network.semanticType}</strong></span></div>
        <div className="row"><button onClick={() => onAnalyze?.(example || network.lemma)} disabled={!onAnalyze}>Testar numa frase</button><button onClick={undoTeach} disabled={!reversibleVersionId}>Desfazer ensino</button></div>
        {example && <p className="note">Frase-exemplo: {example}</p>}
        <h4>Formas geradas ({network.forms.length})</h4><div className="mwe-chips">{network.forms.slice(0, 24).map((form, index) => <span key={`${form.surface}-${index}`} className="chip">{form.surface}<em>{form.features}</em></span>)}</div>
        <h4>Derivados</h4>{network.derivatives.length ? <table className="data-table"><thead><tr><th>Forma</th><th>Regra</th><th>Status</th></tr></thead><tbody>{network.derivatives.map((item) => <tr key={item.form}><td>{item.form}</td><td>{item.rule}</td><td>{item.status === 'ATTESTED' ? 'atestada' : 'hipótese'}</td></tr>)}</tbody></table> : <p className="note">Nenhum derivado gerado pelas regras atuais.</p>}
      </> : <p className="note">Ensine uma raiz para ver sua rede.</p>}
    </div>}
  </section>;
}
