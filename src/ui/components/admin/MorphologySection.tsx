import React, { useMemo, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';

interface Props {
  engine: SemanticEngine;
}

const EXAMPLES = ['retomável', 'envelhecimento', 'jardineiros', 'infelizmente', 'reorganização', 'botãozinho', 'jardimeiro'];

const STATUS_LABEL: Record<string, string> = {
  ATTESTED: 'atestada',
  HYPOTHESIS: 'hipótese',
  HYPOTHESIS_BLOCKED: 'bloqueada'
};

/**
 * Rede gerativa: digite qualquer palavra e veja como ela se decompõe em raiz
 * do léxico-semente + regras de formação (research/morfologia). Nenhuma
 * palavra derivada é listada nos dados: tudo sai das regras.
 */
export function MorphologySection({ engine }: Props) {
  const [word, setWord] = useState('retomável');
  const analyses = useMemo(() => (word.trim() ? engine.analyzeWord(word.trim()) : []), [engine, word]);

  return (
    <section className="admin-section">
      <div className="summary-kicker">DE ONDE VEM A PALAVRA</div><h3>Formação das palavras</h3>
      <p className="note">Digite uma forma para ver a raiz e as regras de formação. Uma hipótese é uma possibilidade gerada, não uma palavra confirmada.</p>
      <div className="concept-strip"><span><strong>Raiz</strong> Palavra de partida.</span><span><strong>Formação</strong> Prefixos, sufixos e flexões aplicados.</span>
        <span><strong>Status</strong> Atestada = registrada; hipótese = prevista; bloqueada = evitada pela regra.</span></div>
      <input
        value={word}
        onChange={(e) => setWord(e.target.value)}
        placeholder="digite uma palavra"
        aria-label="palavra para analisar"
      />
      <div className="mwe-chips">
        {EXAMPLES.map((w) => (
          <button key={w} className="chip" onClick={() => setWord(w)}>
            {w}
          </button>
        ))}
      </div>
      {analyses.length === 0 ? (
        <p className="err">Nenhuma decomposição: a palavra não se reduz a uma raiz conhecida por nenhuma regra.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>raiz</th>
              <th>formação</th>
              <th>classe</th>
              <th>significado formal</th>
              <th>explicação</th>
              <th>status</th>
              <th title="Pontuação interna usada para ordenar análises, não uma probabilidade">prioridade</th>
            </tr>
          </thead>
          <tbody>
            {analyses.slice(0, 8).map((a, i) => (
              <tr key={i} className={a.status === 'HYPOTHESIS_BLOCKED' ? 'sev-warning' : ''}>
                <td>
                  {a.root.lemma} <code>{a.root.id}</code>
                  {a.root.domain ? ' (domínio)' : ''}
                </td>
                <td>
                  {a.chain.map((s) => `${s.from} →${s.rule}→ ${s.to}`).join(' ; ')}
                  {a.inflection ? ` ; flexão ${a.inflection}` : ''}
                </td>
                <td>{a.pos}</td>
                <td><code>{a.semantics}</code></td>
                <td>{a.gloss}</td>
                <td>{STATUS_LABEL[a.status]}</td>
                <td>{a.score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
