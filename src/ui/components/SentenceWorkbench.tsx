import React from 'react';
import type { SemanticEngine } from '../../engine/SemanticEngine';
import type { SentenceAnalysis } from '../../engine/language/SentenceAnalysis';
import posRules from '../../knowledge/language/pos-rules.json';
import closedClassData from '../../knowledge/language/closed-class.json';
import { SentenceAnalysisViews } from './SentenceAnalysisViews';
import { UiTooltip } from './UiTooltip';

interface Props {
  analysis: SentenceAnalysis;
  engine: SemanticEngine;
  highlightedToken: number | null;
  selectedToken: number | null;
  onHighlight: (token: number | null) => void;
  onSelect: (token: number) => void;
}

const posNames: Record<string, string> = {
  NOUN: 'substantivo', VERB: 'verbo', AUX: 'auxiliar', ADJ: 'adjetivo', ADV: 'advérbio',
  PRON: 'pronome', DET: 'determinante', ADP: 'preposição', SCONJ: 'conjunção',
  CCONJ: 'conjunção', NUM: 'numeral', PROPN: 'nome próprio', PUNCT: 'pontuação'
};
const featureNames: Record<string, Record<string, string>> = {
  Person: { '1': '1ª pessoa', '2': '2ª pessoa', '3': '3ª pessoa' },
  Number: { Sing: 'singular', Plur: 'plural' },
  Tense: { Pres: 'presente', Past: 'passado', Imp: 'imperfeito', Fut: 'futuro' },
  Mood: { Ind: 'indicativo', Sub: 'subjuntivo', Imp: 'imperativo' },
  VerbForm: { Fin: 'forma finita', Inf: 'infinitivo', Part: 'particípio', Ger: 'gerúndio' },
  Gender: { Masc: 'masculino', Fem: 'feminino' },
  PronType: { Prs: 'pronome pessoal', Art: 'artigo', Int: 'interrogativo', Rel: 'relativo', Ind: 'indefinido' },
  Case: { Nom: 'caso reto', Acc: 'caso oblíquo', Dat: 'dativo' },
  Definite: { Def: 'definido', Ind: 'indefinido' },
  Polarity: { Neg: 'negativo' },
  Clitic: { Yes: 'clítico' }
};

export function sentenceSummary(analysis: SentenceAnalysis) {
  const nodes = new Map(analysis.meaningGraph.nodes.map((node) => [node.id, node]));
  const edges = analysis.meaningGraph.edges;
  const root = analysis.meaningGraph.root;
  const subject = analysis.clause.subject.map((id) => analysis.words[id - 1]?.form).filter(Boolean).join(' ') || 'oculto';
  const action = analysis.clause.predicate.map((id) => analysis.words[id - 1]?.form).filter(Boolean).join(' ') || nodes.get(root)?.concept || '—';
  const argument = edges.find((edge) => edge.from === root && edge.role === 'ARG1');
  const nestedArgument = argument && edges.find((edge) => edge.from === argument.to && edge.role === 'ARG1');
  const object = nodes.get(nestedArgument?.to ?? argument?.to ?? '')?.concept ?? '—';
  const time = edges.find((edge) => edge.from === root && edge.role === 'TIME');
  const timeText = nodes.get(time?.to ?? '')?.concept ?? '—';
  const type = analysis.clause.mode === 'interrogative' ? 'pergunta'
    : analysis.clause.mode === 'imperative' ? 'ordem'
      : analysis.clause.polarity === 'negative' ? 'negação' : 'afirmação';
  return { subject, action, object, time: timeText, type };
}

function TokenDetails({ analysis, engine, token }: { analysis: SentenceAnalysis; engine: SemanticEngine; token: number }) {
  const word = analysis.words[token - 1];
  if (!word) return null;
  const features = Object.entries(word.selected.feats).map(([key, value]) => featureNames[key]?.[value] ?? `${key}=${value}`);
  const discarded = analysis.trace.tagging.filter((event) => event.index === token - 1);
  const descriptions = new Map(posRules.rules.map((rule) => [rule.id, rule.note]));
  const closedNote = (closedClassData as { entries: Array<{ form: string; upos: string; note: string }> }).entries.find((entry) =>
    entry.form === word.form.toLocaleLowerCase('pt-BR') && entry.upos === word.selected.upos)?.note;
  const derivations = engine.analyzeWord(word.form).filter((item) => item.status !== 'HYPOTHESIS_BLOCKED').slice(0, 4);
  return <aside className="token-detail ui-card" aria-label={`Detalhes de ${word.form}`}>
    <div className="section-header"><h3>{word.form}</h3><span className={`ui-chip pos-${word.selected.upos.toLowerCase()}`}>{posNames[word.selected.upos] ?? word.selected.upos}</span></div>
    <dl className="detail-grid"><div><dt>Lema</dt><dd>{word.selected.lemma}</dd></div><div><dt>Traços</dt><dd>{features.join(', ') || 'sem traços anotados'}</dd></div><div><dt>Origem</dt><dd>{word.selected.origin}</dd></div></dl>
    <p><strong>Regra que decidiu:</strong> <code>{word.selected.rule}</code></p>
    <p className="note">{descriptions.get(word.selected.rule) ?? closedNote ??
      (word.selected.origin === 'INFLECTION' ? 'Forma gerada pelo paradigma de flexão registrado no léxico.' : 'Leitura selecionada pelo léxico e pelas regras de contexto.')}</p>
    <h4>Leituras descartadas</h4>
    {discarded.length ? <ul>{discarded.flatMap((event) => event.removed.map((reading, index) =>
      <li key={`${event.rule}-${index}`}>{reading.lemma} · {posNames[reading.upos] ?? reading.upos} <small>({event.rule}: {descriptions.get(event.rule) ?? 'desempate lexical'})</small></li>))}</ul>
      : <p className="ui-empty">Nenhuma leitura descartada.</p>}
    <h4>Derivação morfológica</h4>
    {derivations.length ? <ul>{derivations.map((item, index) => <li key={index}>{item.root.lemma} → {item.word} · {item.chain.map((step) => step.rule).join(' + ') || 'raiz'}</li>)}</ul>
      : <p className="ui-empty">Não há derivação registrada para esta forma.</p>}
  </aside>;
}

export function SentenceWorkbench({ analysis, engine, highlightedToken, selectedToken, onHighlight, onSelect }: Props) {
  const summary = sentenceSummary(analysis);
  return <div className="sentence-workbench">
    <section className="analysis-overview ui-card" aria-label="Resumo da frase">
      <div className="summary-kicker">LEITURA DA FRASE <UiTooltip text="Resumo produzido a partir do sujeito, predicado, dependências e papéis do grafo de significado." /></div>
      <div className="plain-summary">
        <span><small>Quem</small><strong>{summary.subject}</strong></span>
        <span><small>Ação</small><strong>{summary.action}</strong></span>
        <span><small>O quê</small><strong>{summary.object}</strong></span>
        <span><small>Quando</small><strong>{summary.time}</strong></span>
        <span><small>Tipo</small><strong>{summary.type}</strong></span>
      </div>
      <div className="word-ribbon" aria-label="Palavras por classe gramatical">
        {analysis.words.map((word, index) => <button key={index} type="button" data-token-id={index + 1}
          className={`word-token pos-${word.selected.upos.toLowerCase()} ${highlightedToken === index + 1 || selectedToken === index + 1 ? 'is-highlighted' : ''}`}
          aria-label={`${word.form}: ${posNames[word.selected.upos] ?? word.selected.upos}`}
          onMouseEnter={() => onHighlight(index + 1)} onMouseLeave={() => onHighlight(null)}
          onFocus={() => onHighlight(index + 1)} onBlur={() => onHighlight(null)} onClick={() => onSelect(index + 1)}>
          <span>{word.form}</span><small>{posNames[word.selected.upos] ?? word.selected.upos}</small>
          {analysis.clause.subject.includes(index + 1) && <i className="subject-band" title="Sujeito" />}
          {analysis.clause.predicate.includes(index + 1) && <i className="predicate-band" title="Predicado" />}
        </button>)}
      </div>
      <div className="linguistic-legend" aria-label="Legenda das cores">
        {['NOUN', 'VERB', 'ADJ', 'PRON', 'ADV', 'DET'].map((upos) => <span key={upos} className={`legend-item pos-${upos.toLowerCase()}`}>{posNames[upos]}</span>)}
        <span className="legend-item"><i className="subject-band" /> sujeito</span><span className="legend-item"><i className="predicate-band" /> predicado</span>
      </div>
    </section>
    {selectedToken && <TokenDetails analysis={analysis} engine={engine} token={selectedToken} />}
    <section id="classes" className="analysis-panel ui-card"><SentenceAnalysisViews analysis={analysis} view="classes" highlightedToken={highlightedToken ?? selectedToken} onHighlight={onHighlight} onSelectToken={onSelect} /></section>
    <section id="syntax" className="analysis-panel ui-card"><SentenceAnalysisViews analysis={analysis} view="syntax" highlightedToken={highlightedToken ?? selectedToken} onHighlight={onHighlight} onSelectToken={onSelect} /></section>
    <section id="meaning" className="analysis-panel ui-card"><SentenceAnalysisViews analysis={analysis} view="meaning" highlightedToken={highlightedToken ?? selectedToken} onHighlight={onHighlight} onSelectToken={onSelect} /></section>
  </div>;
}
