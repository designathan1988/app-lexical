import React, { useState } from 'react';
import type { KnowledgeBaseStore, EngineSettings } from '../../../knowledge/KnowledgeBaseStore';
import { DEFAULT_SETTINGS } from '../../../knowledge/KnowledgeBaseStore';

interface Props {
  store: KnowledgeBaseStore;
  onChange: () => void;
}

/** Thresholds de confiança, recuperação fonética e resolução de ambiguidades. */
export function SettingsSection({ store, onChange }: Props) {
  const [settings, setSettings] = useState<EngineSettings>({ ...store.settings });
  const [message, setMessage] = useState('');

  const apply = () => {
    store.settings = { ...settings };
    onChange();
    setMessage('Configurações aplicadas ao motor.');
  };

  const reset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    store.settings = { ...DEFAULT_SETTINGS };
    onChange();
    setMessage('Configurações restauradas ao padrão.');
  };

  const num = (key: keyof EngineSettings, label: string, step = 0.05) => (
    <label className="setting">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        max={1}
        value={Number(settings[key])}
        onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
      />
    </label>
  );

  const bool = (key: keyof EngineSettings, label: string) => (
    <label className="setting checkbox">
      <input
        type="checkbox"
        checked={Boolean(settings[key])}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="admin-section">
      <header className="section-header">
        <h3>Configurações do motor</h3>
      </header>

      <div className="settings-grid">
        {num('approximateMinSimilarity', 'Similaridade mínima para aceitar recuperação aproximada')}
        {num('approximateMaxCandidates', 'Máx. candidatos aproximados por token', 1)}
        {num('approximateMaxDistance', 'Distância de edição máxima indexada', 1)}
        {bool('approximateEnabled', 'Habilitar recuperação aproximada (apenas como fallback)')}
        {bool('destructiveRequiresExact', 'Ações destrutivas exigem forma cadastrada exata')}
        {bool('ambiguityWarningEnabled', 'Emitir AMBIGUOUS_REFERENCE em referências ambíguas')}
        {bool('ambiguityIsFatal', 'Tratar ambiguidade como erro fatal (bloqueia execução)')}
        {bool('selectAfterCommand', 'Selecionar os elementos afetados após cada comando')}
      </div>

      <div className="row">
        <button className="primary" onClick={apply}>
          Aplicar
        </button>
        <button onClick={reset}>Restaurar padrão</button>
      </div>

      {message && <p className="ok">{message}</p>}

      <p className="note">
        As configurações alteram o comportamento das camadas de resolução lexical,
        fonética e de referência. Toda alteração pode ser validada imediatamente
        pela aba Chat + Preview.
      </p>
    </div>
  );
}
