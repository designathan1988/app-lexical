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
    <section>
      <h3>Morfologia derivacional</h3>
      <p>
        Decomposição por regra: raiz + prefixos/sufixos, com a semântica composta e a glosa.
        "Atestada" = registrada nos dados; "hipótese" = gerada pelas regras; "bloqueada" = forma que
        a língua evita (há outra palavra para o mesmo sentido).
      </p>
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
              <th>cadeia</th>
              <th>classe</th>
              <th>semântica</th>
              <th>glosa</th>
              <th>status</th>
              <th>score</th>
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
