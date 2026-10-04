import React, { useCallback, useMemo, useState } from 'react';
import { DocumentRenderer } from './components/DocumentRenderer';
import { PipelineInspector } from './components/PipelineInspector';
import { AdminPanel } from './components/AdminPanel';
import { getContext, useChat, useDocument, applyKnowledgeBase } from './useEngine';
import type { CommandResult } from '../engine/SemanticEngine';

const SUGGESTIONS = [
  'crie uma caixa azul com um botão vermelho dentro',
  'crie um botão dentro de uma caixa azul',
  'crie uma caixa e um botão ao lado dela',
  'crie dois botões dentro da caixa',
  'deixe a borda azul',
  'deixe a borda com 2px',
  'crie um botão azul sem borda',
  'não apague o botão',
  'apague o segundo botão',
  'mude o botão "Entrar" para azul',
  'mude o fundo do segundo botão para azul',
  'coloque o botão depois da caixa',
  'mova o botão de dentro da caixa para depois dela',
  'deixe todos os botões azuis menos o primeiro'
];

export function App() {
  const ctx = getContext();
  const { engine } = ctx;
  const document = useDocument(engine);
  const { entries, send, clear } = useChat(engine);
  const [input, setInput] = useState('');
  const [view, setView] = useState<'chat' | 'admin'>('chat');
  const [selected, setSelected] = useState<CommandResult | null>(null);
  const [, forceRender] = useState(0);

  const lastResult = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].result) return entries[i].result!;
    }
    return null;
  }, [entries]);

  const active = selected ?? lastResult;
  const sentenceAnalysis = useMemo(() => active ? engine.analyzeSentence(active.input) : null, [engine, active?.input]);

  const submit = useCallback(
    (mode: 'execute' | 'analyze') => {
      applyKnowledgeBase(ctx);
      send(input, mode);
      setInput('');
      setSelected(null);
    },
    [input, send, ctx]
  );

  const refresh = useCallback(() => {
    applyKnowledgeBase(ctx);
    forceRender((v) => v + 1);
  }, [ctx]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <strong>Motor Semântico</strong>
          <span>compilador de domínio PT-BR → pagebuilder</span>
        </div>
        <nav className="view-switch">
          <button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>
            Chat + Preview
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            Painel Administrativo
          </button>
        </nav>
      </header>

      {view === 'chat' ? (
        <div className="chat-layout">
          <section className="chat-pane">
            <div className="chat-log">
              {entries.length === 0 && (
                <div className="chat-hint">
                  <p>
                    Escreva um comando em português. Cada frase passa pelo pipeline
                    completo: lexer → normalização → MWE → resolução lexical → parser →
                    AST → resolução de referências → constraints → plano → runtime.
                  </p>
                  <div className="suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} className="suggestion" onClick={() => setInput(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {entries.map((e) => (
                <div key={e.id} className={`bubble ${e.role}`}>
                  <div className="bubble-text">{e.text}</div>
                  {e.result && (
                    <div className="bubble-actions">
                      <button className="link" onClick={() => setSelected(e.result!)}>
                        inspecionar pipeline
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="chat-input">
              <input
                value={input}
                placeholder="ex.: crie uma caixa azul com um botão vermelho dentro"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit('execute');
                }}
              />
              <button className="primary" onClick={() => submit('execute')}>
                Executar
              </button>
              <button onClick={() => submit('analyze')}>Apenas Analisar</button>
            </div>
          </section>

          <section className="preview-pane">
            <div className="pane-header">
              <h3>Preview</h3>
              <div className="pane-actions">
                <button
                  disabled={!engine.store.canUndo()}
                  onClick={() => {
                    engine.undo();
                    setSelected(null);
                    forceRender((v) => v + 1);
                  }}
                >
                  Desfazer
                </button>
                <button
                  disabled={!engine.store.canRedo()}
                  onClick={() => {
                    engine.redo();
                    setSelected(null);
                    forceRender((v) => v + 1);
                  }}
                >
                  Refazer
                </button>
                <button
                  onClick={() => {
                    engine.resetDocument();
                    clear();
                    setSelected(null);
                    forceRender((v) => v + 1);
                  }}
                >
                  Limpar
                </button>
              </div>
            </div>
            <div className="preview-canvas">
              <DocumentRenderer
                document={document}
                concepts={engine.knowledgeBase.concepts}
                selectionIds={document.selectionIds}
                onSelect={(id) => engine.store.setSelection([id])}
                onMeasure={(rects) => engine.store.updateRects(rects)}
              />
            </div>
          </section>
        </div>
      ) : (
        <AdminPanel engine={engine} store={ctx.store} onChange={refresh} />
      )}

      {view === 'chat' && (
        <section className="inspector-pane">
          <PipelineInspector
            compile={active?.compile ?? null}
            execution={active?.execution ?? null}
            mutations={active?.execution.mutations ?? []}
            sentenceAnalysis={sentenceAnalysis}
          />
        </section>
      )}
    </div>
  );
}
