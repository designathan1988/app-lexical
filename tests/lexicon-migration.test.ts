import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { LexicalIndex } from '../src/engine/lexical/LexicalIndex';
import { RawLexer } from '../src/engine/lexical/RawLexer';
import type { Morphology } from '../src/engine/types';

/**
 * F2.2 — Não-regressão da migração do léxico por paradigma.
 *
 * `tests/fixtures/surface-forms-v1.json` congela as 228 SurfaceForms
 * manuais ANTES da migração. Depois da migração, TODA forma precisa
 * continuar resolvendo para o mesmo lexema, com morfologia compatível
 * (os traços registrados antes são um subconjunto dos traços de alguma
 * leitura atual).
 */

interface FixtureForm {
  form: string;
  normalized: string;
  lexemeId: string;
  formType: string;
  morphology: Morphology | null;
}

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'surface-forms-v1.json'), 'utf8')
) as { total: number; forms: FixtureForm[] };

/** Formas que podem deixar de existir, com motivo (relatório da fase). */
const ACCEPTED_REMOVALS = new Map<string, string>([
  // Nenhuma forma foi removida na migração: as manuais de flexão viraram
  // geração e as demais (erro, coloquial, abreviação, sinônimo, exceção)
  // continuam manuais.
]);

function morphologyCompatible(old: Morphology, current?: Morphology): boolean {
  if (!current) return false;
  if (old.gender && current.gender !== old.gender) return false;
  if (old.number && current.number !== old.number) return false;
  if (old.mood && current.mood !== old.mood) return false;
  if (old.tense && current.tense !== old.tense) return false;
  if (old.person && current.person !== old.person) return false;
  return true;
}

describe('F2.2 — migração do léxico preserva as formas existentes', () => {
  const kb = createInitialKnowledgeBase();
  const index = new LexicalIndex(kb.surfaceForms, kb.lexemes);

  it('a fixture cobre as 228 formas manuais capturadas antes da migração', () => {
    expect(fixture.total).toBe(228);
    expect(fixture.forms.length).toBe(228);
  });

  it('toda forma antiga resolve para o mesmo lexema', () => {
    const missing: string[] = [];
    for (const f of fixture.forms) {
      if (ACCEPTED_REMOVALS.has(f.form)) continue;
      const candidates = index.resolve(f.form);
      if (!candidates.some((c) => c.lexeme.id === f.lexemeId)) {
        missing.push(
          `${f.form} (${RawLexer.normalize(f.form)}) → esperado ${f.lexemeId}, obtido [${candidates
            .map((c) => c.lexeme.id)
            .join(', ')}]`
        );
      }
    }
    expect(missing).toEqual([]);
  });

  it('a morfologia registrada continua presente em alguma leitura do mesmo lexema', () => {
    const incompatible: string[] = [];
    for (const f of fixture.forms) {
      if (ACCEPTED_REMOVALS.has(f.form)) continue;
      if (!f.morphology || Object.keys(f.morphology).length === 0) continue;
      const readable = index
        .resolve(f.form)
        .filter((c) => c.lexeme.id === f.lexemeId)
        .some((c) => morphologyCompatible(f.morphology!, c.morphology));
      if (!readable) {
        incompatible.push(`${f.form} → ${f.lexemeId} esperava ${JSON.stringify(f.morphology)}`);
      }
    }
    expect(incompatible).toEqual([]);
  });
});
