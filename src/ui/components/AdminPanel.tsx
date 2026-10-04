import React, { useState, useSyncExternalStore } from 'react';
import type { SemanticEngine } from '../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../knowledge/KnowledgeBaseStore';
import { DataSection } from './admin/DataSection';
import { ParadigmSection } from './admin/ParadigmSection';
import { TrainingSection } from './admin/TrainingSection';
import { TestSection } from './admin/TestSection';
import { MetricsSection } from './admin/MetricsSection';
import { DiagnosticsSection } from './admin/DiagnosticsSection';
import { SettingsSection } from './admin/SettingsSection';
import { HistorySection } from './admin/HistorySection';
import { MorphologySection } from './admin/MorphologySection';
import { SentenceAnalysisSection } from './admin/SentenceAnalysisSection';
import { TeachableNetworkSection } from './admin/TeachableNetworkSection';

export type AdminTab =
  | 'dados'
  | 'paradigmas'
  | 'morfologia'
  | 'frase'
  | 'rede'
  | 'treinamento'
  | 'testes'
  | 'metricas'
  | 'diagnosticos'
  | 'configuracoes'
  | 'historico';

interface Props {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
  onChange: () => void;
  onAnalyze?: (sentence: string) => void;
}

/** Painel administrativo: usa os mesmos dados e o mesmo motor da aplicação real. */
export function AdminPanel({ engine, store, onChange, onAnalyze }: Props) {
  const [tab, setTab] = useState<AdminTab>('dados');
  const [revision, setRevision] = useState(0);

  useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => revision
  );

  const bump = () => {
    setRevision((v) => v + 1);
    onChange();
  };

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: 'dados', label: 'Dados' },
    { id: 'paradigmas', label: 'Paradigmas' },
    { id: 'morfologia', label: 'Morfologia' },
    { id: 'frase', label: 'Análise de frase' },
    { id: 'rede', label: 'Rede ensinável' },
    { id: 'treinamento', label: 'Treinamento' },
    { id: 'testes', label: 'Testes' },
    { id: 'metricas', label: 'Métricas' },
    { id: 'diagnosticos', label: 'Erros / Diagnósticos' },
    { id: 'configuracoes', label: 'Configurações' },
    { id: 'historico', label: 'Histórico' }
  ];

  return (
    <div className="admin-layout">
      <aside className="admin-nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </aside>

      <main className="admin-body">
        {store.migrationNotice && <p className="ok">{store.migrationNotice}</p>}
        {store.lastPersistError && <p className="err" role="alert">{store.lastPersistError}</p>}
        {tab === 'dados' && <DataSection engine={engine} store={store} onChange={bump} />}
        {tab === 'paradigmas' && <ParadigmSection engine={engine} store={store} onChange={bump} />}
        {tab === 'morfologia' && <MorphologySection engine={engine} />}
        {tab === 'frase' && <SentenceAnalysisSection engine={engine} />}
        {tab === 'rede' && <TeachableNetworkSection engine={engine} store={store} onChange={bump} onAnalyze={onAnalyze} />}
        {tab === 'treinamento' && (
          <TrainingSection engine={engine} store={store} onChange={bump} />
        )}
        {tab === 'testes' && <TestSection engine={engine} store={store} />}
        {tab === 'metricas' && <MetricsSection engine={engine} />}
        {tab === 'diagnosticos' && <DiagnosticsSection engine={engine} />}
        {tab === 'configuracoes' && (
          <SettingsSection store={store} onChange={bump} />
        )}
        {tab === 'historico' && <HistorySection store={store} onChange={bump} />}
      </main>
    </div>
  );
}
