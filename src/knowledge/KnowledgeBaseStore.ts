import {
  createInitialKnowledgeBase,
  cloneKnowledgeBase,
  generateSurfaceForms,
  type KnowledgeBase
} from './knowledgeBase';
import type { SurfaceForm, Lexeme, LexemeId, ConceptId, MultiwordEntry } from '../engine/types';
import type { ConceptNode } from '../engine/ontology/Concept';
import type { EvalRecord } from '../eval/datasetSchema';
import {
  DEFAULT_ENGINE_SETTINGS,
  type EngineSettings
} from '../engine/EngineSettings';
import { migrateKnowledgeBase, describeMigration, KB_DATA_VERSION } from './migrateKnowledgeBase';
import { LANGUAGE_PARADIGMS, suggestParadigm } from '../engine/language/LanguageInflector';
import type { TeachableRoot, TeachRootInput } from './language/teachableRoot';
import frameData from './morphology/frames.json';
import semanticTypes from './morphology/semantic-types.json';
import type { KnowledgeBaseBackend, PersistedKnowledgeBase } from './KnowledgeBaseBackend';

export type { EngineSettings };
export const DEFAULT_SETTINGS: EngineSettings = DEFAULT_ENGINE_SETTINGS;

export interface KBVersion {
  id: string;
  label: string;
  timestamp: number;
  snapshot: KnowledgeBase;
  metricsSummary?: Record<string, number>;
}

export interface TrainingRecord {
  id: string;
  input: string;
  seed?: EvalRecord['seed'];
  selection?: EvalRecord['selection'];
  expectedAst: string;
  expectedPlan: string;
  expectedTree?: string;
  expectedDiagnostics: string[];
  correctedFrom?: string;
  source: 'manual' | 'correction' | 'imported';
  createdAt: number;
}

const STORAGE_KEY = 'lexical.knowledgeBase.v2';
const LANGUAGE_ROOTS_KEY = 'lexical.languageRoots.v3';
/** Chaves de versões anteriores, migradas na primeira abertura. */
const LEGACY_STORAGE_KEYS = ['lexical.knowledgeBase.v1'];

/** Armazenamento tolerante a falhas: nunca lança, sempre degrada com aviso. */
interface PersistResult {
  ok: boolean;
  reason?: string;
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): PersistResult {
  try {
    if (typeof localStorage === 'undefined') return { ok: false, reason: 'storage indisponível' };
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* ignora */
  }
}

/**
 * Estado administrativo da base de conhecimento: versionamento, conjuntos de
 * dados, configurações. Usa exatamente o mesmo motor da aplicação real.
 *
 * Persiste em `localStorage` com try/catch em toda leitura e escrita; se o
 * storage falhar, o painel continua funcionando em memória e reporta o motivo.
 */
export class KnowledgeBaseStore {
  kb!: KnowledgeBase;
  settings: EngineSettings = { ...DEFAULT_SETTINGS };
  versions: KBVersion[] = [];
  training: TrainingRecord[] = [];
  lastPersistError: string | null = null;
  lastRestoreError: string | null = null;
  /** Relatório da migração de uma base salva antiga (exibido no painel). */
  migrationNotice: string | null = null;
  private listeners = new Set<() => void>();
  private versionCounter = 0;
  private trainingCounter = 0;
  private persistEnabled = true;
  private backend?: KnowledgeBaseBackend;
  private pendingPersistence: Promise<void> = Promise.resolve();

  constructor(initial?: KnowledgeBase, opts: { persist?: boolean } = {}) {
    const persist = opts.persist ?? true;
    this.persistEnabled = persist;

    if (!initial && persist) {
      const restored = this.restore();
      if (restored) {
        this.snapshotVersion('Base restaurada da sessão anterior');
        return;
      }
    }

    this.kb = initial ?? createInitialKnowledgeBase();
    this.snapshotVersion('Base inicial');
  }

  /**
   * Regenera as SurfaceForms de paradigma (F2.1/F2.5) e as mantém ANTES das
   * manuais na ordem de candidatos (invariante da migração). Chamado sempre
   * que lexemas mudam; barato o bastante para rodar a cada edição.
   */
  private rebuildGeneratedForms(): void {
    const manual = this.kb.surfaceForms.filter((s) => !s.generated);
    this.kb.surfaceForms = [
      ...generateSurfaceForms(this.kb.lexemes, this.kb.paradigmOverrides),
      ...manual
    ];
  }

  // ---- Persistência ---------------------------------------------------------

  /**
   * Adota uma base vinda de fora (localStorage ou backup importado): se o
   * formato for antigo, migra para a fábrica atual preservando as adições do
   * usuário; sempre regenera as formas a partir dos lemas.
   */
  private adoptKnowledgeBase(incoming: KnowledgeBase, dataVersion?: number): KnowledgeBase {
    if (dataVersion === KB_DATA_VERSION) {
      this.kb = incoming;
    } else {
      const migrated = migrateKnowledgeBase(incoming, dataVersion ?? null);
      this.kb = migrated.kb;
      this.migrationNotice = describeMigration(migrated.report);
    }
    this.rebuildGeneratedForms();
    return this.kb;
  }

  /** Carrega o estado salvo. Retorna false se não houver nada ou falhar. */
  restore(): boolean {
    let raw = safeGetItem(STORAGE_KEY);
    let legacyKey: string | null = null;
    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = safeGetItem(key);
        if (raw) {
          legacyKey = key;
          break;
        }
      }
    }
    if (!raw) {
      const rootsOnly = this.readSavedLanguageRoots();
      if (!rootsOnly.length) return false;
      this.kb = createInitialKnowledgeBase();
      this.kb.languageRoots = rootsOnly;
      this.migrationNotice = 'Raízes ensinadas restauradas do registro separado.';
      return true;
    }
    try {
      const parsed = JSON.parse(raw) as {
        dataVersion?: number;
        knowledgeBase?: KnowledgeBase;
        settings?: EngineSettings;
        versions?: KBVersion[];
        training?: TrainingRecord[];
      };
      if (!parsed.knowledgeBase) return false;

      this.kb = this.adoptKnowledgeBase(parsed.knowledgeBase, parsed.dataVersion);
      for (const root of this.readSavedLanguageRoots()) {
        if (!this.kb.languageRoots.some((item) => item.id === root.id)) this.kb.languageRoots.push(root);
      }
      this.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
      this.versions = parsed.versions ?? [];
      this.training = parsed.training ?? [];
      this.versionCounter = this.versions.length;
      this.trainingCounter = this.training.length;
      if (this.migrationNotice || legacyKey) {
        this.persist();
        if (legacyKey) safeRemoveItem(legacyKey);
      }
      return true;
    } catch (error) {
      this.lastRestoreError = `Falha ao restaurar: ${(error as Error).message}`;
      safeRemoveItem(STORAGE_KEY);
      return false;
    }
  }

  /** Aplica e persiste novas configurações do motor. */
  updateSettings(patch: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.emit();
  }

  /** Lê a base transacional antes de a interface ser montada; migra a cópia local antiga se o banco estiver vazio. */
  async attachBackend(backend: KnowledgeBaseBackend): Promise<void> {
    const saved = await backend.load();
    let mergedRoots = false;
    if (saved) {
      this.kb = this.adoptKnowledgeBase(saved.knowledgeBase, saved.dataVersion);
      for (const root of this.readSavedLanguageRoots()) {
        if (!this.kb.languageRoots.some((item) => item.id === root.id)) {
          this.kb.languageRoots.push(root);
          mergedRoots = true;
        }
      }
      this.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
      this.versions = saved.versions ?? [];
      this.training = saved.training ?? [];
      this.versionCounter = this.versions.length;
      this.trainingCounter = this.training.length;
    }
    this.backend = backend;
    this.persistEnabled = true;
    if (saved) {
      this.lastPersistError = null;
      if (mergedRoots) {
        this.persist();
        await this.flushPersistence();
      }
      return;
    }
    this.persist();
    try {
      await this.flushPersistence();
    } catch (error) {
      this.lastPersistError = `Falha ao migrar a base para IndexedDB: ${(error as Error).message}`;
    }
  }

  /** Aguarda a transação mais recente; rejeita quando o banco não confirmou a gravação. */
  flushPersistence(): Promise<void> {
    return this.pendingPersistence;
  }

  private persistencePayload(): PersistedKnowledgeBase {
    return {
      dataVersion: KB_DATA_VERSION,
      knowledgeBase: this.kb,
      settings: this.settings,
      versions: this.versions,
      training: this.training
    };
  }

  private persist(): void {
    if (!this.persistEnabled) return;
    const rootResult = safeSetItem(LANGUAGE_ROOTS_KEY, JSON.stringify({
      dataVersion: KB_DATA_VERSION,
      roots: this.kb.languageRoots
    }));
    if (this.backend) {
      const backend = this.backend;
      const payload = structuredClone(this.persistencePayload());
      const previous = this.pendingPersistence;
      const writing = previous.then(() => backend.save(payload), () => backend.save(payload));
      this.pendingPersistence = writing.then(
        () => { this.lastPersistError = null; },
        (error: Error) => {
          this.lastPersistError = `Falha ao salvar a base no IndexedDB: ${error.message}`;
          throw error;
        }
      );
      void this.pendingPersistence.catch((error: Error) => {
        this.lastPersistError = `Falha ao salvar a base no IndexedDB: ${error.message}`;
      });
      return;
    }
    const payload = JSON.stringify(this.persistencePayload());
    const result = safeSetItem(STORAGE_KEY, payload);
    this.lastPersistError = !rootResult.ok
      ? `Falha ao salvar raízes ensinadas: ${rootResult.reason}`
      : result.ok ? null : `Falha ao salvar histórico completo: ${result.reason} Raízes ensinadas salvas separadamente.`;
  }

  private readSavedLanguageRoots(): TeachableRoot[] {
    const raw = safeGetItem(LANGUAGE_ROOTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { roots?: TeachableRoot[] };
      return Array.isArray(parsed.roots) ? parsed.roots : [];
    } catch (error) {
      this.lastRestoreError = `Falha ao restaurar raízes ensinadas: ${(error as Error).message}`;
      return [];
    }
  }

  /** Restaura a base de fábrica, descartando o estado persistido. */
  restoreFactoryDefaults(): void {
    this.kb = createInitialKnowledgeBase();
    this.settings = { ...DEFAULT_SETTINGS };
    this.versions = [];
    this.training = [];
    this.versionCounter = 0;
    this.trainingCounter = 0;
    safeRemoveItem(STORAGE_KEY);
    safeRemoveItem(LANGUAGE_ROOTS_KEY);
    for (const key of LEGACY_STORAGE_KEYS) safeRemoveItem(key);
    this.migrationNotice = null;
    this.snapshotVersion('Base de fábrica');
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.persist();
    this.listeners.forEach((fn) => fn());
  }

  // ---- Validação de integridade ---------------------------------------------

  /**
   * Verifica a coerência da base. É chamada antes de aplicar edições do painel
   * e exposta à UI para que o usuário veja o que está quebrado.
   */
  validate(): Array<{ severity: 'ERROR' | 'WARNING'; message: string; subject: string }> {
    const issues: Array<{ severity: 'ERROR' | 'WARNING'; message: string; subject: string }> = [];
    const conceptIds = new Set(Object.keys(this.kb.concepts));
    const lexemeIds = new Set(Object.keys(this.kb.lexemes));

    // Lexemas apontando para conceitos inexistentes.
    for (const lexeme of Object.values(this.kb.lexemes)) {
      for (const conceptId of lexeme.senseConceptIds) {
        if (!conceptIds.has(conceptId)) {
          issues.push({
            severity: 'ERROR',
            subject: lexeme.id,
            message: `O lexema ${lexeme.id} aponta para o conceito inexistente ${conceptId}.`
          });
        }
      }
    }

    // SurfaceForms apontando para lexemas inexistentes; formas duplicadas.
    const seenForms = new Map<string, string>();
    for (const form of this.kb.surfaceForms) {
      if (!lexemeIds.has(form.lexemeId)) {
        issues.push({
          severity: 'ERROR',
          subject: form.id,
          message: `A forma "${form.rawText}" aponta para o lexema inexistente ${form.lexemeId}.`
        });
      }
      // Homografia legítima (ex.: "marquem" no imperativo E no subjuntivo,
      // "cria" no indicativo E no imperativo) não é defeito: só é duplicata
      // quando repete a MESMA célula (mesma forma, mesmo lexema, mesmos traços).
      const key = `${form.rawText.toLowerCase()}|${form.lexemeId}|${form.features ?? ''}`;
      if (seenForms.has(key)) {
        issues.push({
          severity: 'WARNING',
          subject: form.id,
          message: `A forma "${form.rawText}" está duplicada para ${form.lexemeId} (${seenForms.get(key)}).`
        });
      }
      seenForms.set(key, form.id);
    }

    // MWEs duplicadas ou apontando para conceito inexistente.
    const seenMwe = new Map<string, string>();
    for (const mwe of this.kb.multiwords) {
      if (!conceptIds.has(mwe.conceptId)) {
        issues.push({
          severity: 'ERROR',
          subject: mwe.id,
          message: `A expressão "${mwe.phrase}" aponta para o conceito inexistente ${mwe.conceptId}.`
        });
      }
      const key = mwe.phrase.toLowerCase();
      if (seenMwe.has(key)) {
        issues.push({
          severity: 'ERROR',
          subject: mwe.id,
          message: `A expressão "${mwe.phrase}" está duplicada (${seenMwe.get(key)}).`
        });
      }
      seenMwe.set(key, mwe.id);
    }

    // Propriedades e grupos referenciando conceitos inexistentes.
    for (const concept of Object.values(this.kb.concepts)) {
      if (concept.kind === 'PROPERTY' && concept.groupId && !conceptIds.has(concept.groupId)) {
        issues.push({
          severity: 'ERROR',
          subject: concept.id,
          message: `A propriedade ${concept.id} aponta para o grupo inexistente ${concept.groupId}.`
        });
      }
      if (concept.kind === 'PROPERTY_GROUP') {
        for (const member of concept.members) {
          if (!conceptIds.has(member)) {
            issues.push({
              severity: 'ERROR',
              subject: concept.id,
              message: `O grupo ${concept.id} lista o membro inexistente ${member}.`
            });
          }
        }
        for (const [category, propertyId] of Object.entries(concept.bindingByValueCategory)) {
          if (propertyId && !conceptIds.has(propertyId)) {
            issues.push({
              severity: 'ERROR',
              subject: concept.id,
              message: `O grupo ${concept.id} liga ${category} à propriedade inexistente ${propertyId}.`
            });
          }
        }
      }
      if (concept.kind === 'ENTITY') {
        for (const propertyId of concept.capabilities.acceptedPropertyIds) {
          if (!conceptIds.has(propertyId)) {
            issues.push({
              severity: 'ERROR',
              subject: concept.id,
              message: `A entidade ${concept.id} aceita a propriedade inexistente ${propertyId}.`
            });
          }
        }
        for (const [category, propertyId] of Object.entries(
          concept.capabilities.defaultValueBindings
        )) {
          if (propertyId && !conceptIds.has(propertyId)) {
            issues.push({
              severity: 'ERROR',
              subject: concept.id,
              message: `A entidade ${concept.id} liga ${category} à propriedade inexistente ${propertyId}.`
            });
          }
        }
      }
      if (concept.kind === 'VALUE' && concept.preferredPropertyId) {
        if (!conceptIds.has(concept.preferredPropertyId)) {
          issues.push({
            severity: 'ERROR',
            subject: concept.id,
            message: `O valor ${concept.id} prefere a propriedade inexistente ${concept.preferredPropertyId}.`
          });
        }
      }
    }

    // Padrões do domínio.
    if (!conceptIds.has(this.kb.defaults.impliedContainmentRelationId)) {
      issues.push({
        severity: 'ERROR',
        subject: 'defaults.impliedContainmentRelationId',
        message: `A relação implicada aponta para o conceito inexistente ${this.kb.defaults.impliedContainmentRelationId}.`
      });
    }

    return issues;
  }

  integrityOk(): boolean {
    return this.validate().every((i) => i.severity !== 'ERROR');
  }

  // ---- Versionamento --------------------------------------------------------

  snapshotVersion(label: string, metricsSummary?: Record<string, number>): KBVersion {
    const version: KBVersion = {
      id: `v${++this.versionCounter}`,
      label,
      timestamp: Date.now(),
      snapshot: cloneKnowledgeBase(this.kb),
      metricsSummary
    };
    this.versions.push(version);
    this.emit();
    return version;
  }

  restoreVersion(id: string): boolean {
    const version = this.versions.find((v) => v.id === id);
    if (!version) return false;
    this.kb = cloneKnowledgeBase(version.snapshot);
    this.emit();
    return true;
  }

  diffVersion(id: string): Record<string, { before: number; after: number }> {
    const version = this.versions.find((v) => v.id === id);
    if (!version) return {};
    return {
      surfaceForms: { before: version.snapshot.surfaceForms.length, after: this.kb.surfaceForms.length },
      lexemes: {
        before: Object.keys(version.snapshot.lexemes).length,
        after: Object.keys(this.kb.lexemes).length
      },
      concepts: {
        before: Object.keys(version.snapshot.concepts).length,
        after: Object.keys(this.kb.concepts).length
      },
      multiwords: { before: version.snapshot.multiwords.length, after: this.kb.multiwords.length }
    };
  }

  // ---- SurfaceForms ---------------------------------------------------------

  addSurfaceForm(sf: SurfaceForm): void {
    this.kb.surfaceForms.push(sf);
    this.emit();
  }

  updateSurfaceForm(id: string, patch: Partial<SurfaceForm>): void {
    const idx = this.kb.surfaceForms.findIndex((s) => s.id === id);
    if (idx < 0) return;
    this.kb.surfaceForms[idx] = { ...this.kb.surfaceForms[idx], ...patch };
    this.emit();
  }

  removeSurfaceForm(id: string): void {
    this.kb.surfaceForms = this.kb.surfaceForms.filter((s) => s.id !== id);
    this.emit();
  }

  searchSurfaceForms(query: string): SurfaceForm[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.kb.surfaceForms;
    return this.kb.surfaceForms.filter(
      (s) =>
        s.rawText.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.lexemeId.toLowerCase().includes(q)
    );
  }

  // ---- Lexemes ---------------------------------------------------------------

  /** Acrescenta uma raiz ao léxico geral, registra uma versão e persiste. */
  teachRoot(input: TeachRootInput): TeachableRoot {
    const lemma = input.lemma.trim().normalize('NFC').toLocaleLowerCase('pt-BR');
    const gloss = input.gloss.trim();
    if (!lemma || !/^\p{L}+(?:-\p{L}+)*$/u.test(lemma)) throw new Error('Informe um lema válido.');
    if (!gloss) throw new Error('Informe uma glosa para o sentido.');
    if (this.kb.languageRoots.some((root) => root.lemma === lemma && root.pos === input.pos)) throw new Error('Esta raiz já foi ensinada.');
    const types = (semanticTypes as { types: Array<{ id: string }> }).types;
    if (!types.some((type) => type.id === input.semanticType)) throw new Error('Tipo semântico desconhecido.');
    const suggestion = suggestParadigm(lemma, input.pos);
    const paradigmId = input.paradigmId ?? suggestion?.id;
    const paradigm = paradigmId ? LANGUAGE_PARADIGMS[paradigmId] : undefined;
    if (!paradigmId || !paradigm || paradigm.pos !== input.pos) throw new Error('Paradigma incompatível com a classe.');
    const normalizedId = lemma.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '_').toUpperCase();
    const senseId = `${lemma}.${normalizedId}`;
    const root: TeachableRoot = {
      id: `USR_${normalizedId}`,
      lemma,
      pos: input.pos,
      paradigmId,
      paradigmRule: input.paradigmId && input.paradigmId !== suggestion?.id ? 'USER_CHOICE' : suggestion?.rule ?? 'USER_CHOICE',
      sense: { id: senseId, gloss, semanticType: input.semanticType }
    };
    if (input.pos === 'VERB') {
      const template = (frameData as unknown as { frames: Array<TeachableRoot['frame'] & { id: string }> }).frames
        .find((frame) => frame.id === input.frameTemplateId);
      if (!template) throw new Error('Escolha uma moldura verbal existente.');
      root.frame = {
        id: senseId,
        sourceTemplateId: template.id,
        roles: structuredClone(template.roles),
        syntax: structuredClone(template.syntax),
        ...(template.control ? { control: template.control } : {}),
        ...(template.complement ? { complement: template.complement } : {})
      };
    }
    this.kb.languageRoots.push(root);
    this.snapshotVersion(`Raiz ensinada: ${lemma}`);
    return root;
  }

  addLexeme(lexeme: Lexeme): void {
    this.kb.lexemes[lexeme.id] = lexeme;
    this.rebuildGeneratedForms();
    this.emit();
  }

  updateLexeme(id: LexemeId, patch: Partial<Lexeme>): void {
    const current = this.kb.lexemes[id];
    if (!current) return;
    this.kb.lexemes[id] = { ...current, ...patch };
    this.rebuildGeneratedForms();
    this.emit();
  }

  /** Edição de paradigma pelo painel (F2.5): persiste e regenera. */
  updateParadigm(
    paradigmId: string,
    patch: { cells?: unknown; orthography?: unknown; disabledCells?: string[] }
  ): void {
    this.kb.paradigmOverrides = this.kb.paradigmOverrides ?? {};
    const current = this.kb.paradigmOverrides[paradigmId] ?? {};
    this.kb.paradigmOverrides[paradigmId] = {
      ...current,
      ...(patch as Record<string, never>)
    };
    this.rebuildGeneratedForms();
    this.emit();
  }

  /** Restaura um paradigma ao padrão de fábrica. */
  resetParadigm(paradigmId: string): void {
    if (this.kb.paradigmOverrides) delete this.kb.paradigmOverrides[paradigmId];
    this.rebuildGeneratedForms();
    this.emit();
  }

  removeLexeme(id: LexemeId): void {
    delete this.kb.lexemes[id];
    this.kb.surfaceForms = this.kb.surfaceForms.filter((s) => s.lexemeId !== id);
    this.rebuildGeneratedForms();
    this.emit();
  }

  // ---- Concepts ---------------------------------------------------------------

  addConcept(concept: ConceptNode): void {
    this.kb.concepts[concept.id] = concept;
    this.emit();
  }

  updateConcept(id: ConceptId, patch: Partial<ConceptNode>): void {
    const current = this.kb.concepts[id];
    if (!current) return;
    this.kb.concepts[id] = { ...current, ...patch } as ConceptNode;
    this.emit();
  }

  removeConcept(id: ConceptId): void {
    delete this.kb.concepts[id];
    this.emit();
  }

  // ---- Multiwords ---------------------------------------------------------------

  addMultiword(mwe: MultiwordEntry): void {
    this.kb.multiwords.push(mwe);
    this.emit();
  }

  removeMultiword(id: string): void {
    this.kb.multiwords = this.kb.multiwords.filter((m) => m.id !== id);
    this.emit();
  }

  // ---- Treinamento / correções -----------------------------------------------------

  addTrainingRecord(record: Omit<TrainingRecord, 'id' | 'createdAt'>): TrainingRecord {
    const full: TrainingRecord = {
      ...record,
      id: `train_${++this.trainingCounter}`,
      createdAt: Date.now()
    };
    this.training.push(full);
    this.emit();
    return full;
  }

  removeTrainingRecord(id: string): void {
    this.training = this.training.filter((t) => t.id !== id);
    this.emit();
  }

  // ---- Import / Export --------------------------------------------------------

  exportJSON(): string {
    return JSON.stringify(
      { dataVersion: KB_DATA_VERSION, knowledgeBase: this.kb, settings: this.settings },
      null,
      2
    );
  }

  importJSON(json: string): void {
    const parsed = JSON.parse(json) as {
      dataVersion?: number;
      knowledgeBase: KnowledgeBase;
      settings?: EngineSettings;
    };
    if (parsed.knowledgeBase) {
      this.kb = this.adoptKnowledgeBase(parsed.knowledgeBase, parsed.dataVersion);
      if (parsed.settings) this.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      this.emit();
    }
  }

  exportTrainingJSON(): string {
    return JSON.stringify(this.training, null, 2);
  }

  importTrainingJSON(json: string): void {
    const parsed = JSON.parse(json) as TrainingRecord[];
    if (Array.isArray(parsed)) {
      this.training.push(...parsed);
      this.emit();
    }
  }
}
