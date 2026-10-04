import React, { useEffect, useState } from 'react';
import type { CompileResult } from '../../engine/SemanticCompiler';
import type { ExecutionResult } from '../../engine/runtime/ExecutionEngine';
import { planSignature, astSignature } from '../../eval/signatures';
import type { SentenceAnalysis } from '../../engine/language/SentenceAnalysis';
import { SentenceAnalysisViews } from './SentenceAnalysisViews';

interface Props {
  compile: CompileResult | null;
  execution: ExecutionResult | null;
  mutations: string[];
  sentenceAnalysis: SentenceAnalysis | null;
}

type Tab =
  | 'tokens'
  | 'mwe'
  | 'candidates'
  | 'ast'
  | 'plan'
  | 'diagnostics'
  | 'result'
  | 'classes'
  | 'syntax'
  | 'meaning';

/**
 * Observabilidade completa do pipeline:
 * entrada → raw tokens → tokens normalizados → MWEs → candidatos lexicais →
 * conceitos candidatos → AST → ExecutionPlan → validação → mutações executadas.
 */
export function PipelineInspector({ compile, execution, mutations, sentenceAnalysis }: Props) {
  const [tab, setTab] = useState<Tab>('ast');
  useEffect(() => {
    if (compile && !compile.plan.steps.length && sentenceAnalysis) setTab('classes');
  }, [compile, sentenceAnalysis]);

  if (!compile) {
    return <div className="inspector-empty">Envie um comando para inspecionar o pipeline.</div>;
  }

  const trace = compile.trace;

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'tokens', label: 'Tokens', badge: trace.rawTokens.length },
    { id: 'classes', label: 'Classes', badge: sentenceAnalysis?.words.length },
    { id: 'syntax', label: 'Sintaxe' },
    { id: 'meaning', label: 'Significado' },
    { id: 'mwe', label: 'MWEs' },
    { id: 'candidates', label: 'Candidatos', badge: trace.semanticTokens.length },
    { id: 'ast', label: 'AST' },
    { id: 'plan', label: 'ExecutionPlan', badge: compile.plan.steps.length },
    {
      id: 'diagnostics',
      label: 'Diagnósticos',
      badge: compile.diagnostics.length
    },
    { id: 'result', label: 'Execução', badge: mutations.length }
  ];

  return (
    <div className="inspector">
      <div className="inspector-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === 'classes' && sentenceAnalysis && <SentenceAnalysisViews analysis={sentenceAnalysis} view="classes" />}
        {tab === 'syntax' && sentenceAnalysis && <SentenceAnalysisViews analysis={sentenceAnalysis} view="syntax" />}
        {tab === 'meaning' && sentenceAnalysis && <SentenceAnalysisViews analysis={sentenceAnalysis} view="meaning" />}
        {tab === 'tokens' && (
          <>
            <h4>Tokens brutos (não destrutivos)</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>tipo</th>
                  <th>raw</th>
                  <th>normalizado</th>
                  <th>valor</th>
                  <th>offset</th>
                </tr>
              </thead>
              <tbody>
                {trace.rawTokens.map((t, i) => (
                  <tr key={i}>
                    <td>{i}</td>
                    <td><code>{t.type}</code></td>
                    <td><code>{t.raw}</code></td>
                    <td>{t.normalized ?? '—'}</td>
                    <td>{t.value !== undefined ? String(t.value) + (t.unit ? t.unit : '') : '—'}</td>
                    <td>{t.start}–{t.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4>Tokens após normalização gramatical (contrações expandidas)</h4>
            <div className="mwe-chips">
              {trace.grammaticalTokens.map((t, i) => (
                <span key={i} className="chip">
                  {t.raw}
                  <em>{t.normalized}</em>
                </span>
              ))}
            </div>
          </>
        )}

        {tab === 'mwe' && (
          <>
            <h4>Expressões multiword reconhecidas (longest-match)</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ocorrência</th>
                  <th>conceito</th>
                </tr>
              </thead>
              <tbody>
                {trace.semanticTokens
                  .map((tok, i) => ({ tok, i }))
                  .filter(({ tok }) => tok.candidates.some((c) => c.source === 'MULTIWORD'))
                  .map(({ tok, i }) => (
                    <tr key={i}>
                      <td>
                        <code>{tok.rawTokens.map((t) => t.raw).join(' ')}</code>
                      </td>
                      <td>{tok.candidates.find((c) => c.source === 'MULTIWORD')?.conceptId}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'candidates' && (
          <>
            <h4>Candidatos lexicais e conceitos por token</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>tokens</th>
                  <th>literal</th>
                  <th>candidatos (conceito · lexema · score · origem)</th>
                </tr>
              </thead>
              <tbody>
                {trace.semanticTokens.map((tok, i) => (
                  <tr key={i}>
                    <td>
                      <code>{tok.rawTokens.map((t) => t.raw).join(' ')}</code>
                    </td>
                    <td>
                      {tok.literal
                        ? `${tok.literal.kind}:${String(tok.literal.value)}${
                            tok.literal.kind === 'SIZE' ? tok.literal.unit : ''
                          }`
                        : '—'}
                    </td>
                    <td>
                      {tok.candidates.length === 0
                        ? '—'
                        : tok.candidates.map((c, j) => (
                            <div key={j} className="candidate">
                              <code>{c.conceptId}</code>
                              <span>{c.lexemeId ?? ''}</span>
                              <span>{c.score.toFixed(2)}</span>
                              <span className="src">{c.source}</span>
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'ast' && (
          <>
            <h4>Semantic AST (significado, não DOM)</h4>
            <pre className="code-block">{astSignature(trace.ast ?? { commands: [] })}</pre>
            <h4>AST serializada</h4>
            <pre className="code-block">{JSON.stringify(trace.ast, null, 2)}</pre>
          </>
        )}

        {tab === 'plan' && (
          <>
            <h4>ExecutionPlan (determinístico)</h4>
            <pre className="code-block">{planSignature(compile.plan)}</pre>
            <h4>Passos serializados</h4>
            <pre className="code-block">{JSON.stringify(compile.plan.steps, null, 2)}</pre>
          </>
        )}

        {tab === 'diagnostics' && (
          <>
            <h4>Diagnósticos estruturados</h4>
            {compile.diagnostics.length === 0 ? (
              <p className="ok">Nenhum diagnóstico.</p>
            ) : (
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
                  {compile.diagnostics.map((d, i) => (
                    <tr key={i} className={`sev-${d.severity.toLowerCase()}`}>
                      <td>{d.severity}</td>
                      <td><code>{d.code}</code></td>
                      <td>
                        {d.message}
                        {d.morphology?.length ? (
                          <ul className="morph-notes">
                            {d.morphology.map((m, j) => (
                              <li key={j}>
                                <code>{m.semantics}</code> — {m.gloss} ({m.pos},{' '}
                                {m.status === 'ATTESTED' ? 'atestada' : 'hipótese'})
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                      <td>{d.start !== undefined ? `${d.start}–${d.end ?? d.start}` : '—'}</td>
                      <td>{d.layer}</td>
                      <td>{d.candidates?.join(', ') ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'result' && (
          <>
            <h4>Mutações executadas no runtime real</h4>
            {!execution ? (
              <p>Sem execução (modo apenas analisar).</p>
            ) : execution.success ? (
              <p className="ok">Execução bem-sucedida.</p>
            ) : (
              <p className="err">Execução bloqueada — o documento não foi alterado.</p>
            )}
            <pre className="code-block">{mutations.join('\n') || '(nenhuma mutação)'}</pre>
            {execution && Object.keys(execution.createdNodes).length > 0 && (
              <>
                <h4>Nós temporários materializados</h4>
                <pre className="code-block">
                  {JSON.stringify(execution.createdNodes, null, 2)}
                </pre>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
