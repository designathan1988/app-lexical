import React, { useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import type { CompileResult } from '../../../engine/SemanticCompiler';
import { planSignature, astSignature } from '../../../eval/signatures';

interface Props {
  engine: SemanticEngine;
}

/**
 * Área de Erros/Diagnósticos: permite rodar uma frase qualquer e inspecionar
 * tokens, candidatos, sentidos, AST, referências resolvidas, constraints,
 * plano e resultado — tudo do mesmo motor da aplicação.
 */
export function DiagnosticsSection({ engine }: Props) {
  const [input, setInput] = useState('deixe a borda com banana');
  const [result, setResult] = useState<CompileResult | null>(null);

  const run = () => {
    setResult(engine.analyze(input));
  };

  const constraints = result?.plan.diagnostics.filter((d) => d.layer === 'validator') ?? [];

  return (
    <div className="admin-section">
      <header className="section-header">
        <h3>Erros e diagnósticos</h3>
      </header>

      <div className="row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="frase para diagnosticar"
        />
        <button className="primary" onClick={run}>
          Analisar
        </button>
      </div>

      {result && (
        <>
          <h4>Diagnósticos</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>severidade</th>
                <th>código</th>
                <th>mensagem</th>
                <th>posição</th>
                <th>camada</th>
                <th>candidatos</th>
              </tr>
            </thead>
            <tbody>
              {result.diagnostics.map((d, i) => (
                <tr key={i} className={`sev-${d.severity.toLowerCase()}`}>
                  <td>{d.severity}</td>
                  <td><code>{d.code}</code></td>
                  <td>{d.message}</td>
                  <td>{d.start !== undefined ? `${d.start}–${d.end ?? d.start}` : '—'}</td>
                  <td>{d.layer}</td>
                  <td>{d.candidates?.join(', ') ?? '—'}</td>
                </tr>
              ))}
              {result.diagnostics.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum diagnóstico — a frase foi compreendida integralmente.</td>
                </tr>
              )}
            </tbody>
          </table>

          <h4>Tokens e candidatos</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>token</th>
                <th>literal</th>
                <th>candidatos</th>
              </tr>
            </thead>
            <tbody>
              {result.trace.semanticTokens.map((t, i) => (
                <tr key={i}>
                  <td><code>{t.rawTokens.map((x) => x.raw).join(' ')}</code></td>
                  <td>{t.literal ? `${t.literal.kind}:${String(t.literal.value)}` : '—'}</td>
                  <td>
                    {t.candidates.map((c) => `${c.conceptId}(${c.score.toFixed(2)},${c.source})`).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>AST</h4>
          <pre className="code-block">{astSignature(result.ast)}</pre>

          <h4>Constraints</h4>
          <pre className="code-block">
            {constraints.length === 0
              ? '(nenhuma constraint violada)'
              : constraints.map((c) => `${c.severity} ${c.code}: ${c.message}`).join('\n')}
          </pre>

          <h4>ExecutionPlan</h4>
          <pre className="code-block">{planSignature(result.plan) || '(vazio)'}</pre>
        </>
      )}
    </div>
  );
}
