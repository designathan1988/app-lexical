import React, { useState } from 'react';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';

interface Props {
  store: KnowledgeBaseStore;
  onChange: () => void;
}

/** Comparação de versões da base de conhecimento e restauração. */
export function HistorySection({ store, onChange }: Props) {
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const diff = selected ? store.diffVersion(selected) : null;

  return (
    <div className="admin-section">
      <header className="section-header">
        <h3>Histórico de versões</h3>
      </header>

      <div className="row">
        <input
          placeholder="rótulo da versão (ex.: após adicionar cores)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          onClick={() => {
            store.snapshotVersion(label || `Versão ${store.versions.length + 1}`);
            setLabel('');
            onChange();
            setMessage('Versão capturada.');
          }}
        >
          Capturar versão
        </button>
      </div>

      {message && <p className="ok">{message}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>rótulo</th>
            <th>data</th>
            <th>surfaceForms</th>
            <th>lexemas</th>
            <th>conceitos</th>
            <th>MWEs</th>
            <th>ações</th>
          </tr>
        </thead>
        <tbody>
          {store.versions.map((v) => (
            <tr key={v.id} className={selected === v.id ? 'row-selected' : ''}>
              <td><code>{v.id}</code></td>
              <td>{v.label}</td>
              <td>{new Date(v.timestamp).toLocaleString('pt-BR')}</td>
              <td>{v.snapshot.surfaceForms.length}</td>
              <td>{Object.keys(v.snapshot.lexemes).length}</td>
              <td>{Object.keys(v.snapshot.concepts).length}</td>
              <td>{v.snapshot.multiwords.length}</td>
              <td>
                <button onClick={() => setSelected(v.id)}>comparar</button>
                <button
                  className="danger"
                  onClick={() => {
                    store.restoreVersion(v.id);
                    onChange();
                    setMessage(`Base restaurada para ${v.id}.`);
                  }}
                >
                  restaurar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {diff && (
        <>
          <h4>Comparação com a versão atual</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>conjunto</th>
                <th>na versão</th>
                <th>atual</th>
                <th>delta</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(diff).map(([key, d]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{d.before}</td>
                  <td>{d.after}</td>
                  <td className={d.after === d.before ? '' : d.after > d.before ? 'ok' : 'err'}>
                    {d.after - d.before >= 0 ? '+' : ''}
                    {d.after - d.before}
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
