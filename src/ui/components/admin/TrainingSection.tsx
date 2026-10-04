import React, { useState } from 'react';
import { SemanticEngine } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import { astSignature, planSignature, treeSignature } from '../../../eval/signatures';
import type { EvalRecord, SeedNodeJson } from '../../../eval/datasetSchema';

interface Props {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
  onChange: () => void;
  onTeachWord?: () => void;
}

function seedFromCase(c: EvalRecord): string {
  return JSON.stringify(c.seed ?? [], null, 2);
}

/**
 * Cadastro de frases de treino/avaliação e correção manual de interpretações.
 * A frase informada é compilada pelo MOTOR REAL: AST, plano e árvore resultante
 * são capturados como dados de regressão.
 */
export function TrainingSection({ engine, store, onChange, onTeachWord }: Props) {
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
        <div><div className="summary-kicker">ENSINAR E VERIFICAR</div><h3>Como ensinar o motor</h3>
          <p className="note">Há dois caminhos diferentes. Escolha o que você quer acrescentar à base.</p></div>
        <button onClick={exportTraining}>Baixar exemplos ({store.training.length})</button>
      </header>

      <div className="training-paths">
        <div className="training-path ui-card"><span className="summary-kicker">CAMINHO 1 · VOCABULÁRIO</span><h4>Ensinar uma palavra</h4>
          <p>Inclui lema, classe, formas e significado. Depois você testa essa palavra na Análise de frase.</p>
          <button className="primary" onClick={onTeachWord} disabled={!onTeachWord}>Abrir assistente de palavras</button></div>
        <div className="training-path ui-card"><span className="summary-kicker">CAMINHO 2 · EXEMPLOS</span><h4>Guardar uma frase de treino</h4>
          <p>Registra o resultado atual de um <strong>comando do construtor</strong> como exemplo de regressão. Isso ajuda a detectar mudanças futuras; não reescreve as regras do motor por si só.</p>
          <a href="#training-form" className="text-link">Ir para o formulário ↓</a></div>
      </div>

      <div className="training-explainer ui-card"><h4>O caminho da frase</h4>
        <ol><li>Escreva um comando do construtor.</li><li>Capture a interpretação atual do motor.</li><li>Confira o resultado e os diagnósticos.</li><li>Salve como exemplo de regressão.</li></ol>
        <p className="note">Para analisar uma frase comum, use “Análise de frase” no menu principal.</p></div>

      <div id="training-form" className="form-grid training-form">
        <label>
          1. Comando a registrar
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="crie uma caixa azul com um botão vermelho dentro"
          />
        </label>
        <details className="import-box training-advanced"><summary>Configuração avançada: documento inicial e seleção</summary>
          <p className="note">Use apenas quando a frase depende de elementos que já existem na página. Sem isso, deixe o documento como <code>[]</code>.</p>
          <label>Documento inicial (JSON)<textarea rows={4} value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder='[{"entityConceptId":"C_ENT_BUTTON"}]' /></label>
          <label>Seleção inicial (índice ou “all”)<input value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="0" /></label>
        </details>
      </div>

      <div className="row">
        <button className="primary" onClick={captureNow} disabled={!input.trim()}>
          2. Capturar resultado
        </button>
        <button onClick={saveTraining} disabled={!capture}>
          3. Salvar exemplo
        </button>
      </div>

      <details className="training-correction"><summary>Registrar captura como correção manual</summary>
        <p className="note">Esta opção marca a captura atual como correção no conjunto de regressão; ela não altera a interpretação do motor automaticamente.</p>
        <button onClick={saveCorrection} disabled={!capture}>Registrar como correção</button>
      </details>

      {error && <p className="err" role="alert">{error}</p>}
      {message && <p className="ok" role="status">{message}</p>}

      {capture && (
        <div className="capture">
          <h4>Resultado capturado</h4>
          <p><strong>{capture.diagnostics.length ? `${capture.diagnostics.length} diagnóstico(s)` : 'Sem diagnósticos'}</strong> · {capture.tree ? 'Uma árvore de página foi produzida.' : 'Nenhum elemento foi produzido.'}</p>
          <p className="note">O documento atual da aplicação não foi alterado. Confira o resultado antes de salvar o exemplo.</p>
          <details><summary>Ver AST, plano, árvore e códigos técnicos</summary>
            <label>AST</label><pre className="code-block">{capture.ast}</pre>
            <label>Plano de execução</label><pre className="code-block">{capture.plan}</pre>
            <label>Árvore resultante</label><pre className="code-block">{capture.tree || '(vazia)'}</pre>
            <label>Diagnósticos</label><pre className="code-block">{capture.diagnostics.join('\n') || '(nenhum)'}</pre>
          </details>
        </div>
      )}

      <h4>Exemplos cadastrados ({store.training.length})</h4>
      <p className="note">Eles são comparados com o comportamento atual em “Testes → Treinamento”.</p>
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
              <td>{t.source === 'correction' ? 'correção registrada' : 'exemplo manual'}</td>
              <td className="details">
                <pre>{t.expectedTree || '(vazia)'}</pre>
              </td>
              <td>
                <button className="danger" aria-label={`Remover exemplo ${t.id}`} onClick={() => { store.removeTrainingRecord(t.id); onChange(); }}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {store.training.length === 0 && (
            <tr>
              <td colSpan={5}>Nenhum exemplo salvo ainda. Capture um comando acima para começar.</td>
            </tr>
          )}
        </tbody>
      </table>

      <details className="import-box">
        <summary>Importar dataset de treino (JSON)</summary>
        <textarea
          aria-label="JSON do conjunto de treino a importar"
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
