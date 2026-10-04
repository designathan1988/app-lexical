import React, { useMemo, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import { LexicalIndex } from '../../../engine/lexical/LexicalIndex';
import { PARADIGMS, type OrthographyRule } from '../../../knowledge/paradigms';
import { effectiveParadigm } from '../../../knowledge/knowledgeBase';
import { featureKey, parseFeatureKey } from '../../../knowledge/features';

interface Props {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
  onChange: () => void;
}

type View = 'lexemes' | 'paradigms' | 'homographs';

const ORTHOGRAPHY_RULES: OrthographyRule[] = ['C_TO_QU', 'G_TO_GU', 'CEDILLA_TO_C'];

/**
 * F2.5 — Aba de paradigmas: escolher paradigma por lexema, prévia das formas
 * geradas, desativar/sobrescrever células, editar células e regras
 * ortográficas de um paradigma e ver o antes/depois. Tudo persistido na base
 * e revalidado pelo motor a cada edição.
 */
export function ParadigmSection({ engine, store, onChange }: Props) {
  const [view, setView] = useState<View>('lexemes');
  const [selectedLexeme, setSelectedLexeme] = useState<string>('LEX_CRIAR');
  const [selectedParadigm, setSelectedParadigm] = useState<string>('V_AR');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [ruleInput, setRuleInput] = useState('');

  const kb = store.kb;
  const lexemes = Object.values(kb.lexemes);

  const index = useMemo(
    () => new LexicalIndex(kb.surfaceForms, kb.lexemes),
    [kb.surfaceForms, kb.lexemes]
  );
  const homographs = useMemo(() => index.homographs(), [index]);

  const notify = (m: string) => {
    setMessage(m);
    onChange();
  };

  const lexeme = kb.lexemes[selectedLexeme];
  const paradigm = effectiveParadigm(paradigmIdOf(lexeme), kb.paradigmOverrides);

  const lexemeForms = useMemo(
    () =>
      kb.surfaceForms.filter(
        (s) => s.lexemeId === selectedLexeme && s.generated
      ),
    [kb.surfaceForms, selectedLexeme]
  );

  const runValidation = (phrase: string) => {
    const result = engine.execute(phrase);
    const codes = result.compile.diagnostics
      .map((d) => `${d.severity}:${d.code}`)
      .join(', ');
    setMessage(
      `"${phrase}" → ${result.success ? 'executado' : 'bloqueado'}${
        codes ? ` (${codes})` : ''
      }`
    );
    onChange();
  };

  const setLexemeField = (patch: Record<string, unknown>) => {
    store.updateLexeme(selectedLexeme, patch as never);
    notify(`Lexema ${selectedLexeme} atualizado; formas geradas regeneradas.`);
  };

  return (
    <div className="admin-section">
      <header className="section-header">
        <div><div className="summary-kicker">COMO AS FORMAS SÃO CRIADAS</div><h3>Paradigmas e flexões</h3>
          <p className="note">Um paradigma é a regra que transforma uma palavra base em suas formas, como singular/plural ou tempos de um verbo.</p></div>
        <div className="entity-switch">
          {(
            [
              ['lexemes', 'Lexemas'],
              ['paradigms', 'Paradigmas'],
              ['homographs', 'Homógrafos']
            ] as Array<[View, string]>
          ).map(([id, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="concept-strip" aria-label="Como ler os paradigmas"><span><strong>Palavra base</strong> Escolha o lema que deseja examinar.</span>
        <span><strong>Paradigma</strong> Veja a regra usada para gerar formas.</span><span><strong>Prévia</strong> Confira o resultado antes de alterar dados.</span></div>

      {message && <p className="details">{message}</p>}

      {view === 'lexemes' && (
        <>
          <div className="row">
            <select aria-label="Escolher palavra base" value={selectedLexeme} onChange={(e) => setSelectedLexeme(e.target.value)}>
              {lexemes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} — {l.lemma} ({l.pos})
                </option>
              ))}
            </select>
            <span className="details">
              {lexemeForms.length} formas geradas de {kb.surfaceForms.length} no total
            </span>
          </div>

          {lexeme && (
            <>
              <table className="data-table">
                <tbody>
                  <tr>
                    <th>paradigma</th>
                    <td>
                      <select
                        aria-label="Paradigma desta palavra"
                        value={lexeme.paradigmId ?? ''}
                        onChange={(e) => setLexemeField({ paradigmId: e.target.value || undefined })}
                      >
                        <option value="">(sem paradigma)</option>
                        {Object.keys(PARADIGMS).map((id) => (
                          <option key={id} value={id}>
                            {id} — {PARADIGMS[id].pos}, raiz -{PARADIGMS[id].strip || '∅'}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <th>gênero inerente</th>
                    <td>
                      <select
                        aria-label="Gênero inerente da palavra"
                        value={lexeme.inherent?.Gender ?? ''}
                        onChange={(e) =>
                          setLexemeField({
                            inherent: e.target.value ? { Gender: e.target.value } : undefined
                          })
                        }
                      >
                        <option value="">(não se aplica)</option>
                        <option value="Masc">masculino</option>
                        <option value="Fem">feminino</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <th>diminutivos produtivos</th>
                    <td>
                      <button
                        className={lexeme.allowsDiminutive ? 'primary' : ''}
                        onClick={() => setLexemeField({ allowsDiminutive: !lexeme.allowsDiminutive })}
                      >
                        {lexeme.allowsDiminutive ? 'habilitados' : 'desabilitados'}
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <th>derivado de</th>
                    <td>
                      <select
                        aria-label="Palavra de origem da derivação"
                        value={lexeme.derivedFrom ?? ''}
                        onChange={(e) => setLexemeField({ derivedFrom: e.target.value || undefined })}
                      >
                        <option value="">(próprio)</option>
                        {lexemes
                          .filter((l) => l.id !== lexeme.id)
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.id} — {l.lemma}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>

              <h4>Prévia das formas geradas ({lexemeForms.length})</h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>forma</th>
                    <th>traços</th>
                    <th>id</th>
                    <th>célula desativada?</th>
                  </tr>
                </thead>
                <tbody>
                  {lexemeForms.map((f) => (
                    <tr key={f.id}>
                      <td>{f.rawText}</td>
                      <td><code>{f.features ?? ''}</code></td>
                      <td className="details">{f.id}</td>
                      <td>
                        <button
                          className="danger"
                          onClick={() => {
                            const disabled = new Set(lexeme.disabledForms ?? []);
                            disabled.add(f.features ?? '');
                            setLexemeField({ disabledForms: [...disabled] });
                          }}
                        >
                          desativar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(lexeme.disabledForms ?? []).length > 0 && (
                <>
                  <h4>Células desativadas</h4>
                  <ul>
                    {lexeme.disabledForms!.map((key) => (
                      <li key={key}>
                        <code>{key}</code>{' '}
                        <button
                          onClick={() =>
                            setLexemeField({
                              disabledForms: lexeme.disabledForms!.filter((k) => k !== key)
                            })
                          }
                        >
                          reativar
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h4>Validar no chat</h4>
              <div className="row">
                <input
                  aria-label="Comando para validar a flexão"
                  value={ruleInput}
                  placeholder="ex.: crie um botãozinho"
                  onChange={(e) => setRuleInput(e.target.value)}
                />
                <button onClick={() => ruleInput.trim() && runValidation(ruleInput.trim())}>
                  Validar
                </button>
              </div>
            </>
          )}
        </>
      )}

      {view === 'paradigms' && (
        <>
          <div className="row">
            <select
              aria-label="Escolher paradigma"
              value={selectedParadigm}
              onChange={(e) => setSelectedParadigm(e.target.value)}
            >
              {Object.keys(PARADIGMS).map((id) => (
                <option key={id} value={id}>
                  {id} — {PARADIGMS[id].pos}
                </option>
              ))}
            </select>
            {kb.paradigmOverrides?.[selectedParadigm] && (
              <button
                className="danger"
                onClick={() => {
                  store.resetParadigm(selectedParadigm);
                  notify(`Paradigma ${selectedParadigm} restaurado ao padrão de fábrica.`);
                }}
              >
                restaurar padrão
              </button>
            )}
          </div>

          <h4>Regras ortográficas</h4>
          <div className="row">
            {ORTHOGRAPHY_RULES.map((rule) => {
              const base = PARADIGMS[selectedParadigm];
              const current =
                kb.paradigmOverrides?.[selectedParadigm]?.orthography ?? base?.orthography ?? [];
              const active = current.includes(rule);
              return (
                <button
                  key={rule}
                  className={active ? 'primary' : ''}
                  onClick={() => {
                    const next = active
                      ? current.filter((r) => r !== rule)
                      : [...current, rule];
                    store.updateParadigm(selectedParadigm, { orthography: next });
                    notify(`Regras de ${selectedParadigm}: ${next.join(', ') || 'nenhuma'}.`);
                  }}
                >
                  {rule}
                </button>
              );
            })}
          </div>

          <h4>Células ({paradigm?.cells.length ?? 0})</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>traços</th>
                <th>chave canônica</th>
                <th>sufixo</th>
                <th>editar</th>
              </tr>
            </thead>
            <tbody>
              {(paradigm?.cells ?? []).map((cell, i) => {
                const key = featureKey(cell.feats);
                const overridden = kb.paradigmOverrides?.[selectedParadigm]?.cells;
                return (
                  <tr key={`${key}-${i}`}>
                    <td><code>{key}</code></td>
                    <td className="details">
                      {Object.entries(parseFeatureKey(key))
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' ')}
                    </td>
                    <td>{cell.suffix}</td>
                    <td>
                      <button
                        onClick={() => {
                          const input = window.prompt(
                            `Novo sufixo para ${key} (atual: "${cell.suffix}"):`,
                            cell.suffix
                          );
                          if (input === null) return;
                          const base = PARADIGMS[selectedParadigm];
                          const cells = (overridden ?? base.cells).map((c, ci) =>
                            ci === i ? { ...c, suffix: input } : { ...c }
                          );
                          if (!input.trim()) {
                            setMessage(`Sufixo vazio inválido para ${key}; nada foi alterado.`);
                            return;
                          }
                          store.updateParadigm(selectedParadigm, { cells });
                          notify(`Célula ${key} de ${selectedParadigm} → sufixo "${input}".`);
                        }}
                      >
                        editar sufixo
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          const override = kb.paradigmOverrides?.[selectedParadigm] ?? {};
                          const disabledCells = new Set(override.disabledCells ?? []);
                          const base = PARADIGMS[selectedParadigm];
                          const cells = (override.cells ?? base.cells).filter((_, ci) => ci !== i);
                          store.updateParadigm(selectedParadigm, { cells });
                          disabledCells.add(key);
                          notify(`Célula ${key} removida de ${selectedParadigm}.`);
                        }}
                      >
                        remover célula
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4>Validar no chat</h4>
          <div className="row">
            <input
              aria-label="Comando para validar o paradigma"
              value={ruleInput}
              placeholder="ex.: crie duas caixas apaguem"
              onChange={(e) => setRuleInput(e.target.value)}
            />
            <button onClick={() => ruleInput.trim() && runValidation(ruleInput.trim())}>
              Validar
            </button>
          </div>
        </>
      )}

      {view === 'homographs' && (
        <>
          <div className="row">
            <input
              aria-label="Filtrar formas com mais de uma leitura"
              value={query}
              placeholder="filtrar formas…"
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="details">
              {homographs.length} formas com mais de uma leitura
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>forma</th>
                <th>leituras (lexema, traços)</th>
              </tr>
            </thead>
            <tbody>
              {homographs
                .filter((h) => h.surface.includes(query.trim().toLowerCase()))
                .map((h) => (
                  <tr key={h.surface}>
                    <td><code>{h.surface}</code></td>
                    <td className="details">
                      {h.readings
                        .map((r) => `${r.lemma} [${r.features ?? r.formType}]`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function paradigmIdOf(lexeme?: { paradigmId?: string }): string {
  return lexeme?.paradigmId ?? '';
}
