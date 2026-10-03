import React, { useState } from 'react';
import { SemanticEngine } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import { astSignature, planSignature, treeSignature } from '../../../eval/signatures';
import type { EvalRecord, SeedNodeJson } from '../../../eval/datasetSchema';

interface Props {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
  onChange: () => void;
}

function seedFromCase(c: EvalRecord): string {
  return JSON.stringify(c.seed ?? [], null, 2);
}

/**
 * Cadastro de frases de treino/avaliação e correção manual de interpretações.
 * A frase informada é compilada pelo MOTOR REAL: AST, plano e árvore resultante
 * são capturados como dados de regressão.
 */
export function TrainingSection({ engine, store, onChange }: Props) {
  const [input, setInput] = useState('');
  const [seedText, setSeedText] = useState('[]');
  const [selection, setSelection] = useState<string>('');
  const [capture, setCapture] = useState<{
    ast: string;
    plan: string;
    tree: string;
    diagnostics: string[];
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const captureNow = () => {
    setError('');
    setMessage('');
    try {
      const seed = JSON.parse(seedText) as SeedNodeJson[];
      const e = new SemanticEngine(store.kb);
      const ids: string[] = [];
      const build = (
        sn: NonNullable<SeedNodeJson[]>[number],
        parentId: string | null
      ): void => {
        const id = e.store.createNode(sn.entityConceptId, sn.text);
        ids.push(id);
        for (const [k, v] of Object.entries(sn.properties ?? {})) {
          e.store.setProperty(id, k, v);
        }
        if (parentId) e.store.place(id, 'CHILD_OF', parentId);
        for (const c of sn.children ?? []) build(c, id);
      };
      for (const s of seed ?? []) build(s, null);

      if (selection === 'all') e.store.setSelection(ids);
      else if (selection !== '') {
        const idx = Number(selection);
        if (ids[idx]) e.store.setSelection([ids[idx]]);
      }

      const result = e.execute(input);
      setCapture({
        ast: astSignature(result.compile.ast),
        plan: planSignature(result.compile.plan),
        tree: treeSignature(e.store.document, store.kb.concepts),
        diagnostics: result.compile.diagnostics.map((d) => d.code)
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveTraining = () => {
    if (!capture) return;
    let seed: SeedNodeJson[];
    try {
      seed = JSON.parse(seedText) as SeedNodeJson[];
    } catch {
      setError('seed JSON inválido');
      return;
    }

    store.addTrainingRecord({
      input,
      seed,
      selection: selection === 'all' ? 'all' : selection === '' ? undefined : Number(selection),
      expectedAst: capture.ast,
      expectedPlan: capture.plan,
      expectedTree: capture.tree,
      expectedDiagnostics: capture.diagnostics,
      source: 'manual'
    });
    onChange();
    setMessage('Frase cadastrada como dado de treino/regressão.');
  };

  const saveCorrection = () => {
    if (!capture) return;
    store.addTrainingRecord({
      input,
      selection: selection === 'all' ? 'all' : selection === '' ? undefined : Number(selection),
      expectedAst: capture.ast,
      expectedPlan: capture.plan,
      expectedTree: capture.tree,
      expectedDiagnostics: capture.diagnostics,
      source: 'correction',
      correctedFrom: input
    });
    onChange();
    setMessage('Correção salva como novo dado de regressão.');
  };

  const exportTraining = () => {
    const blob = new Blob([store.exportTrainingJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'training-dataset.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-section">
      <header className="section-header">
        <h3>Treinamento e correções</h3>
        <button onClick={exportTraining}>Exportar dataset ({store.training.length})</button>
      </header>

      <div className="form-grid">
        <label>
          Frase
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="crie uma caixa azul com um botão vermelho dentro"
          />
        </label>
        <label>
          Documento inicial (JSON de seed)
          <textarea
            rows={4}
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder='[{"entityConceptId":"C_ENT_BUTTON"}]'
          />
        </label>
        <label>
          Seleção (índice do nó semeado, ou "all")
          <input
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      <div className="row">
        <button className="primary" onClick={captureNow} disabled={!input.trim()}>
          Capturar interpretação real
        </button>
        <button onClick={saveTraining} disabled={!capture}>
          Salvar como treino/regressão
        </button>
        <button onClick={saveCorrection} disabled={!capture}>
          Salvar correção manual
        </button>
      </div>

      {error && <p className="err">{error}</p>}
      {message && <p className="ok">{message}</p>}

      {capture && (
        <div className="capture">
          <h4>Interpretação capturada do motor real</h4>
          <label>AST</label>
          <pre className="code-block">{capture.ast}</pre>
          <label>ExecutionPlan</label>
          <pre className="code-block">{capture.plan}</pre>
          <label>Árvore resultante</label>
          <pre className="code-block">{capture.tree || '(vazia)'}</pre>
          <label>Diagnósticos</label>
          <pre className="code-block">{capture.diagnostics.join('\n') || '(nenhum)'}</pre>
        </div>
      )}

      <h4>Frases cadastradas</h4>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>frase</th>
            <th>origem</th>
            <th>árvore esperada</th>
            <th>ações</th>
          </tr>
        </thead>
        <tbody>
          {store.training.map((t) => (
            <tr key={t.id}>
              <td><code>{t.id}</code></td>
              <td>{t.input}</td>
              <td>{t.source}</td>
              <td className="details">
                <pre>{t.expectedTree || '(vazia)'}</pre>
              </td>
              <td>
                <button className="danger" onClick={() => { store.removeTrainingRecord(t.id); onChange(); }}>
                  remover
                </button>
              </td>
            </tr>
          ))}
          {store.training.length === 0 && (
            <tr>
              <td colSpan={5}>Nenhuma frase cadastrada ainda.</td>
            </tr>
          )}
        </tbody>
      </table>

      <details className="import-box">
        <summary>Importar dataset de treino (JSON)</summary>
        <textarea
          rows={5}
          id="training-import"
          placeholder='[ { "id": "train_1", "input": "crie um botão", ... } ]'
        />
        <button
          onClick={() => {
            const el = document.getElementById('training-import') as HTMLTextAreaElement | null;
            if (!el?.value) return;
            try {
              store.importTrainingJSON(el.value);
              onChange();
              setMessage('Dataset importado.');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Importar
        </button>
      </details>
    </div>
  );
}
