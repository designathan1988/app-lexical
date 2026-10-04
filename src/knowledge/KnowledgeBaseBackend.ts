import type { KnowledgeBase } from './knowledgeBase';
import type { KBVersion, TrainingRecord } from './KnowledgeBaseStore';
import type { EngineSettings } from '../engine/EngineSettings';

/** Estado completo salvo em uma única transação. */
export interface PersistedKnowledgeBase {
  dataVersion: number;
  knowledgeBase: KnowledgeBase;
  settings: EngineSettings;
  versions: KBVersion[];
  training: TrainingRecord[];
}

export interface KnowledgeBaseBackend {
  load(): Promise<PersistedKnowledgeBase | null>;
  save(value: PersistedKnowledgeBase): Promise<void>;
}
