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

  const tabs: Array<{ id: AdminTab; label: string; group: string }> = [
    { id: 'dados', label: 'Dados', group: 'Explorar' },
    { id: 'paradigmas', label: 'Paradigmas', group: 'Explorar' },
    { id: 'morfologia', label: 'Morfologia', group: 'Explorar' },
    { id: 'frase', label: 'Análise de frase', group: 'Explorar' },
    { id: 'rede', label: 'Rede ensinável', group: 'Ensinar' },
    { id: 'treinamento', label: 'Treinamento', group: 'Ensinar' },
    { id: 'testes', label: 'Testes', group: 'Verificar' },
    { id: 'metricas', label: 'Métricas', group: 'Verificar' },
    { id: 'diagnosticos', label: 'Erros / Diagnósticos', group: 'Verificar' },
    { id: 'configuracoes', label: 'Configurações', group: 'Sistema' },
    { id: 'historico', label: 'Histórico', group: 'Sistema' }
  ];

  return (
    <div className="admin-layout">
      <div className="admin-mobile-nav"><label>Área do painel
        <select aria-label="Escolher área do painel" value={tab} onChange={(event) => setTab(event.target.value as AdminTab)}>
          {['Explorar', 'Ensinar', 'Verificar', 'Sistema'].map((group) => <optgroup key={group} label={group}>
            {tabs.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </optgroup>)}
        </select>
      </label></div>
      <aside className="admin-nav">
        {tabs.map((t, index) => <React.Fragment key={t.id}>
          {(index === 0 || tabs[index - 1].group !== t.group) && <div className="admin-nav-heading">{t.group}</div>}
          <button
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        </React.Fragment>)}
      </aside>

      <main className="admin-body">
        {store.migrationNotice && <p className="ok">{store.migrationNotice}</p>}
        {store.lastPersistError && <p className="err" role="alert">{store.lastPersistError}</p>}
        {tab === 'dados' && <DataSection engine={engine} store={store} onChange={bump} onTeachWord={() => setTab('rede')} />}
        {tab === 'paradigmas' && <ParadigmSection engine={engine} store={store} onChange={bump} />}
        {tab === 'morfologia' && <MorphologySection engine={engine} />}
        {tab === 'frase' && <SentenceAnalysisSection engine={engine} />}
        {tab === 'rede' && <TeachableNetworkSection engine={engine} store={store} onChange={bump} onAnalyze={onAnalyze} />}
        {tab === 'treinamento' && (
          <TrainingSection engine={engine} store={store} onChange={bump} onTeachWord={() => setTab('rede')} />
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
