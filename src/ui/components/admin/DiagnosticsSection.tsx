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
        <div><div className="summary-kicker">ENTENDA UMA FALHA</div><h3>Por que a frase não funcionou?</h3>
          <p className="note">Analise um comando do construtor sem executá-lo. Comece pelas mensagens em português; abra o rastreio técnico só se precisar investigar.</p></div>
      </header>

      <div className="row">
        <input
          aria-label="Comando para diagnosticar"
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
          <div className={`diagnostic-summary ui-card ${result.diagnostics.some((item) => item.severity === 'ERROR') ? 'has-failures' : 'all-pass'}`} role="status">
            <strong>{result.diagnostics.length ? `${result.diagnostics.length} mensagem(ns) encontrada(s)` : 'Nenhum problema identificado'}</strong>
            <p>{result.diagnostics.some((item) => item.severity === 'ERROR') ? 'O comando precisa de ajuste. Leia a mensagem e a posição indicadas abaixo.' : 'Não há erro bloqueante nesta análise.'}</p>
          </div>
          <h4>Mensagens para corrigir</h4>
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

          <details className="results-advanced"><summary>Ver rastreio técnico: palavras, candidatos e plano</summary>
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
          </details>
        </>
      )}
    </div>
  );
}
