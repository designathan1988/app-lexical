import { RawLexer } from '../engine/lexical/RawLexer';
import { createInitialKnowledgeBase, type KnowledgeBase } from './knowledgeBase';
import { HISTORICAL_FACTORY_IDS } from './legacyIds';

/**
 * Versão do FORMATO dos dados da base. Mude quando a base de fábrica mudar de
 * modo que uma base salva antiga deixe de ser válida (ex.: formas manuais
 * substituídas por geração a partir do lema).
 */
export const KB_DATA_VERSION = 2;

export interface MigrationReport {
  fromVersion: number | null;
  keptUserLexemes: string[];
  keptUserConcepts: string[];
  keptUserMultiwords: string[];
  keptUserForms: string[];
  droppedFactoryForms: number;
  droppedSupersededForms: number;
}

/**
 * Migra uma base salva antiga para a base de fábrica ATUAL, preservando só o
 * que é do usuário:
 *  - lema/conceito/expressão cujo id nunca foi de fábrica;
 *  - forma manual que não é de fábrica e que o léxico atual não gera
 *    (mesmo lema, mesma forma normalizada).
 * Tudo o mais vem da versão atual — inclusive as formas, agora geradas a
 * partir de cada lema.
 */
export function migrateKnowledgeBase(
  old: KnowledgeBase,
  fromVersion: number | null
): { kb: KnowledgeBase; report: MigrationReport } {
  const kb = createInitialKnowledgeBase();
  const report: MigrationReport = {
    fromVersion,
    keptUserLexemes: [],
    keptUserConcepts: [],
    keptUserMultiwords: [],
    keptUserForms: [],
    droppedFactoryForms: 0,
    droppedSupersededForms: 0
  };

  const isUser = (id: string, current: Record<string, unknown>) =>
    !(id in current) && !HISTORICAL_FACTORY_IDS.has(id);

  for (const [id, concept] of Object.entries(old.concepts ?? {})) {
    if (isUser(id, kb.concepts)) {
      kb.concepts[id] = concept;
      report.keptUserConcepts.push(id);
    }
  }

  for (const [id, lexeme] of Object.entries(old.lexemes ?? {})) {
    if (isUser(id, kb.lexemes)) {
      kb.lexemes[id] = lexeme;
      report.keptUserLexemes.push(id);
    }
  }

  const mweIds = new Set(kb.multiwords.map((m) => m.id));
  for (const mwe of old.multiwords ?? []) {
    if (!mweIds.has(mwe.id) && !HISTORICAL_FACTORY_IDS.has(mwe.id)) {
      kb.multiwords.push(mwe);
      report.keptUserMultiwords.push(mwe.id);
    }
  }

  // Formas: as atuais já incluem as geradas dos lemas acrescentados acima?
  // Não — a geração roda no store. Aqui comparamos com as da fábrica atual.
  const produced = new Set(
    kb.surfaceForms.map((s) => `${s.lexemeId}|${RawLexer.normalize(s.rawText)}`)
  );
  const formIds = new Set(kb.surfaceForms.map((s) => s.id));
  for (const sf of old.surfaceForms ?? []) {
    if (sf.generated) continue;
    if (formIds.has(sf.id) || HISTORICAL_FACTORY_IDS.has(sf.id)) {
      report.droppedFactoryForms++;
      continue;
    }
    if (produced.has(`${sf.lexemeId}|${RawLexer.normalize(sf.rawText)}`)) {
      report.droppedSupersededForms++;
      continue;
    }
    if (!(sf.lexemeId in kb.lexemes)) {
      report.droppedFactoryForms++;
      continue;
    }
    kb.surfaceForms.push(sf);
    report.keptUserForms.push(sf.id);
  }

  if (old.paradigmOverrides) kb.paradigmOverrides = old.paradigmOverrides;

  return { kb, report };
}

export function describeMigration(report: MigrationReport): string {
  const kept =
    report.keptUserLexemes.length +
    report.keptUserConcepts.length +
    report.keptUserMultiwords.length +
    report.keptUserForms.length;
  return (
    `Base salva migrada da versão ${report.fromVersion ?? 1} para ${KB_DATA_VERSION}: ` +
    `as formas agora são geradas a partir de cada lema. ` +
    `${report.droppedFactoryForms + report.droppedSupersededForms} formas antigas de fábrica ` +
    `foram substituídas; ${kept} itens seus foram preservados.`
  );
}
