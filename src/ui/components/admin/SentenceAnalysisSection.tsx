import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import type { SentenceAnalysis } from '../../../engine/language/SentenceAnalysis';
import { LanguageTagger } from '../../../engine/language/Tagger';
import { LexicalAnalyzer } from '../../../engine/language/LexicalAnalyzer';
import { DependencyParser } from '../../../engine/language/DependencyParser';
import { ClauseAnalyzer } from '../../../engine/language/ClauseAnalyzer';
import { smatchF1 } from '../../../eval/graphMatch';
import gold from '../../../../research/morfologia/tests-sentences.json';
import type { SentenceView } from '../SentenceAnalysisViews';
import { SentenceWorkbench } from '../SentenceWorkbench';
import { GoldComparisonDetail } from '../GoldComparisonDetail';

interface Props { engine: SemanticEngine; initialShowGold?: boolean }
type GoldSentence = {
  id: string; text: string; meaningGraph: string;
  tokens: Array<{ form: string; lemma: string; pos: string; feats?: string }>;
  dependencies: Array<{ dep: number; head: number; rel: string }>;
  subject: number[]; predicate: number[];
};

const goldSentences = (gold as { sentences: GoldSentence[] }).sentences;
const uposMap: Record<string, string[]> = {
  ADJECTIVE: ['ADJ'], ADVERB: ['ADV'], CONJUNCTION: ['CCONJ', 'SCONJ'],
  DETERMINER: ['DET'], NOUN: ['NOUN'], NUMERAL: ['NUM'], PREPOSITION: ['ADP'],
  PRONOUN: ['PRON'], PUNCT: ['PUNCT'], VERB: ['VERB']
};
const phenomenon = (sentence: GoldSentence) => sentence.dependencies.some((arc) => arc.rel === 'acl:relcl') ? 'relativa'
  : sentence.text.trim().endsWith('?') ? 'pergunta'
    : sentence.meaningGraph.includes(':polarity -') ? 'negação'
      : sentence.dependencies.some((arc) => arc.rel === 'cop') ? 'cópula'
        : sentence.dependencies.some((arc) => arc.rel === 'conj') ? 'coordenação' : 'outra';

function compareGold(engine: SemanticEngine) {
  const lexical = new LexicalAnalyzer(engine.knowledgeBase.lexemes, engine.knowledgeBase.languageRoots);
  const tagger = new LanguageTagger(lexical);
  const parser = new DependencyParser(engine.knowledgeBase.languageRoots);
  const clauses = new ClauseAnalyzer();
  return goldSentences.map((sentence) => {
    const tagged = tagger.tagForms(sentence.tokens.map((token) => token.form));
    const arcs = parser.parse(tagged.words);
    const clause = clauses.analyze(tagged.words, arcs);
    const meaning = engine.analyzeSentence(sentence.text).meaningGraph;
    const lexicalCandidates = sentence.tokens.map((token) => lexical.analyzeSurface(token.form));
    const lexicalTokens = sentence.tokens.map((token, index) => ({ token, readings: lexicalCandidates[index] }))
      .filter(({ token }) => token.pos !== 'PUNCT');
    const lemma = lexicalTokens.filter(({ token, readings }) => readings.some((reading) => reading.lemma === token.lemma)).length / lexicalTokens.length;
    const annotated = lexicalTokens.filter(({ token }) => token.feats);
    const features = annotated.length ? annotated.filter(({ token, readings }) => readings.some((reading) =>
      Object.entries(Object.fromEntries(token.feats!.split('|').map((feature) => feature.split('='))))
        .every(([key, value]) => reading.feats[key] === value))).length / annotated.length : 1;
    const expectedSense = sentence.meaningGraph.match(/[\p{L}]+\.[A-Z_]+/u)?.[0];
    const sense = !expectedSense || meaning.nodes.some((node) => node.concept === expectedSense);
    const upos = tagged.words.reduce((sum, word, index) => sum + Number((uposMap[sentence.tokens[index].pos] ?? [sentence.tokens[index].pos]).includes(word.selected.upos)), 0) / sentence.tokens.length;
    const uas = sentence.dependencies.reduce((sum, arc) => sum + Number(arcs[arc.dep - 1]?.head === arc.head), 0) / sentence.dependencies.length;
    const las = sentence.dependencies.reduce((sum, arc) => sum + Number(arcs[arc.dep - 1]?.head === arc.head && arcs[arc.dep - 1]?.deprel === arc.rel), 0) / sentence.dependencies.length;
    const subject = JSON.stringify(clause.subject) === JSON.stringify(sentence.subject);
    const predicate = JSON.stringify(clause.predicate) === JSON.stringify(sentence.predicate);
    const smatch = smatchF1(meaning.penman, sentence.meaningGraph);
    return { sentence, tagged, arcs, clause, meaning, lexicalCandidates, lemma, features, expectedSense, sense,
      upos, uas, las, subject, predicate, smatch };
  });
}

export function SentenceAnalysisSection({ engine, initialShowGold = false, initialText = 'Eu quero tomar café.' }: Props & { initialText?: string }) {
  const [text, setText] = useState(initialText);
  const [analysis, setAnalysis] = useState<SentenceAnalysis>(() => engine.analyzeSentence(initialText));
  const [view, setView] = useState<SentenceView>('classes');
  const [highlightedToken, setHighlightedToken] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const firstRender = useRef(true);
  const [showGold, setShowGold] = useState(initialShowGold);
  const [metricFilter, setMetricFilter] = useState('todas');
  const [phenomenonFilter, setPhenomenonFilter] = useState('todos');
  const [sortBy, setSortBy] = useState('id');
  const [selectedGoldId, setSelectedGoldId] = useState<string | null>(null);
  const comparisons = useMemo(() => showGold ? compareGold(engine) : [], [showGold, engine]);
  const filteredComparisons = useMemo(() => {
    const filtered = comparisons.filter((item) => {
      if (phenomenonFilter !== 'todos' && phenomenon(item.sentence) !== phenomenonFilter) return false;
      const scores: Record<string, number> = { lema: item.lemma, traços: item.features, upos: item.upos, uas: item.uas,
        las: item.las, sujeito: Number(item.subject), predicado: Number(item.predicate), smatch: item.smatch, sentido: Number(item.sense) };
      return metricFilter === 'todas' || scores[metricFilter] < 1;
    });
    return filtered.sort((a, b) => sortBy === 'smatch' ? a.smatch - b.smatch : sortBy === 'falhas'
      ? (a.lemma + a.features + a.upos + a.uas + a.las + Number(a.subject) + Number(a.predicate) + a.smatch + Number(a.sense))
        - (b.lemma + b.features + b.upos + b.uas + b.las + Number(b.subject) + Number(b.predicate) + b.smatch + Number(b.sense))
      : a.sentence.id.localeCompare(b.sentence.id));
  }, [comparisons, metricFilter, phenomenonFilter, sortBy]);
  const selectedGold = filteredComparisons.find((item) => item.sentence.id === selectedGoldId) ?? filteredComparisons[0];
  const views: Array<{ id: SentenceView; label: string }> = [
    { id: 'classes', label: 'Classes' }, { id: 'syntax', label: 'Sintaxe' }, { id: 'meaning', label: 'Significado' }
  ];
  const examples = ['Eu quero tomar café.', 'A senhora que tropeçou está bem.', 'Ele perguntou quem chegou.'];
  const analyze = (sentence: string) => {
    try {
      setAnalysis(engine.analyzeSentence(sentence));
      setSelectedToken(null);
      setError('');
    } catch (cause) {
      setError(`Não foi possível analisar a frase: ${(cause as Error).message}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (!text.trim()) return;
    setLoading(true);
    const timer = window.setTimeout(() => analyze(text), 240);
    return () => window.clearTimeout(timer);
  }, [text, engine]);

  return <section className="admin-section sentence-admin">
    <div className="section-header"><div><div className="summary-kicker">LABORATÓRIO DE LINGUAGEM</div><h3>Análise de frase</h3></div></div>
    <p className="note">Escreva em português para explorar classes, sintaxe e significado. A análise é somente leitura.</p>
    <div className="sentence-input-row">
      <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="Frase para analisar" rows={2} />
      <button className="primary" onClick={() => analyze(text)} disabled={!text.trim()}>Analisar frase</button>
    </div>
    <div className="analysis-examples"><span>Experimente:</span>{examples.map((example) => <button key={example} className="suggestion" onClick={() => { setText(example); analyze(example); }}>{example}</button>)}</div>
    {loading && <p className="ui-loading" role="status">Analisando frase…</p>}
    {error && <p className="ui-error" role="alert">{error}</p>}
    <div className="inspector-tabs">
      {views.map((item) => <button key={item.id} className={view === item.id ? 'tab active' : 'tab'} onClick={() => {
        setView(item.id);
        window.document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }}>{item.label}</button>)}
    </div>
    <SentenceWorkbench analysis={analysis} engine={engine} highlightedToken={highlightedToken} selectedToken={selectedToken}
      onHighlight={setHighlightedToken} onSelect={setSelectedToken} />

    <div className="sentence-gold-header">
      <h3>Gabarito das 80 frases</h3>
      <button onClick={() => setShowGold((current) => !current)}>{showGold ? 'Ocultar gabarito' : 'Comparar gabarito'}</button>
    </div>
    {showGold && <div className="sentence-gold-list">
      <div className="gold-filters ui-card"><label>Métrica<select aria-label="Filtrar por métrica" value={metricFilter} onChange={(event) => setMetricFilter(event.target.value)}>
        {['todas', 'lema', 'traços', 'upos', 'uas', 'las', 'sujeito', 'predicado', 'smatch', 'sentido'].map((item) => <option key={item} value={item}>{item === 'todas' ? 'Todas' : `Falha em ${item}`}</option>)}
      </select></label><label>Fenômeno<select aria-label="Filtrar por fenômeno" value={phenomenonFilter} onChange={(event) => setPhenomenonFilter(event.target.value)}>
        {['todos', 'pergunta', 'negação', 'relativa', 'cópula', 'coordenação', 'outra'].map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label><label>Ordenar<select aria-label="Ordenar comparação" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
        <option value="id">ID</option><option value="smatch">Menor Smatch</option><option value="falhas">Mais divergências</option>
      </select></label><span className="note">{filteredComparisons.length} de {comparisons.length} frases</span></div>
      <table className="data-table">
        <thead><tr><th>Frase</th><th>Lema</th><th>Traços</th><th>UPOS</th><th>UAS</th><th>LAS</th><th>Sujeito</th><th>Predicado</th><th>Smatch</th><th>Sentido</th></tr></thead>
        <tbody>{filteredComparisons.map((item) => <tr key={item.sentence.id} className={item.lemma === 1 && item.features === 1 && item.upos === 1 && item.uas === 1 && item.las === 1 && item.subject && item.predicate && item.smatch === 1 && item.sense ? 'row-selected' : 'row-fail'}>
          <td><button className="gold-row-link" onClick={() => setSelectedGoldId(item.sentence.id)}>{item.sentence.id}: {item.sentence.text}</button></td>
          <td>{(item.lemma * 100).toFixed(0)}%</td><td>{(item.features * 100).toFixed(0)}%</td>
          <td>{(item.upos * 100).toFixed(0)}%</td><td>{(item.uas * 100).toFixed(0)}%</td><td>{(item.las * 100).toFixed(0)}%</td>
          <td>{item.subject ? '✓' : '✗'}</td><td>{item.predicate ? '✓' : '✗'}</td><td>{item.smatch.toFixed(3)}</td><td>{item.sense ? '✓' : '✗'}</td>
        </tr>)}</tbody>
      </table>
      {selectedGold && <GoldComparisonDetail sentence={selectedGold.sentence} actualArcs={selectedGold.arcs} actualGraph={selectedGold.meaning.penman} />}
      {filteredComparisons.filter((item) => item.lemma < 1 || item.features < 1 || item.upos < 1 || item.uas < 1 || item.las < 1 || !item.subject || !item.predicate || item.smatch < 1 || !item.sense).map((item) => <details key={item.sentence.id} className="failure">
        <summary>{item.sentence.id} — {item.sentence.text}</summary>
        <div className="diff"><div><label>Gabarito</label><pre>{`Lema esperado: ${item.sentence.tokens.map((token) => `${token.form}/${token.lemma}`).join(' ')}\nTraços esperados: ${item.sentence.tokens.filter((token) => token.feats).map((token) => `${token.form}/${token.feats}`).join(' ')}\nUPOS esperado: ${item.sentence.tokens.map((token) => `${token.form}/${token.pos}`).join(' ')}\nDependências esperadas: ${item.sentence.dependencies.map((arc) => `${arc.dep}←${arc.head}:${arc.rel}`).join(' ')}\nSujeito esperado: [${item.sentence.subject.join(', ')}]\nPredicado esperado: [${item.sentence.predicate.join(', ')}]\nSentido esperado: ${item.expectedSense ?? '—'}\nGrafo esperado: ${item.sentence.meaningGraph}`}</pre></div>
          <div><label>Saída</label><pre>{`Lemas candidatos: ${item.sentence.tokens.map((token, index) => `${token.form}/${item.lexicalCandidates[index].map((reading) => reading.lemma).join('|')}`).join(' ')}\nTraços candidatos: ${item.sentence.tokens.map((token, index) => `${token.form}/${item.lexicalCandidates[index].map((reading) => Object.entries(reading.feats).map(([key, value]) => `${key}=${value}`).join('|')).join(';')}`).join(' ')}\nUPOS selecionado: ${item.tagged.words.map((word) => `${word.form}/${word.selected.upos}`).join(' ')}\nDependências obtidas: ${item.arcs.map((arc) => `${arc.id}←${arc.head}:${arc.deprel}`).join(' ')}\nSujeito obtido: [${item.clause.subject.join(', ')}]\nPredicado obtido: [${item.clause.predicate.join(', ')}]\nSentido obtido: ${item.meaning.nodes.find((node) => node.id === item.meaning.root)?.concept ?? '—'}\nGrafo obtido: ${item.meaning.penman}`}</pre></div></div>
      </details>)}
    </div>}
  </section>;
}
