import { describe, it, expect } from 'vitest';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { prepareEngine } from '../src/eval/runner';
import { planSignature } from '../src/eval/signatures';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_V1_DATASET } from '../src/eval/loader';
import { VALID_LAYERS } from '../src/engine/diagnostics';
import type { EvalRecord } from '../src/eval/datasetSchema';

/**
 * F1.3 — invariantes globais, verificadas por propriedade sobre todos os
 * registros de todos os conjuntos:
 *
 *   consumo     — todo token com leitura ou literal é consumido por algum nó
 *                 do AST ou reportado em diagnóstico;
 *   duplicatas  — nenhum par de diagnósticos com o mesmo (code, start, end);
 *   spans       — 0 ≤ start ≤ end ≤ input.length em todo diagnóstico;
 *   camadas     — toda camada é uma das válidas do pipeline;
 *   analyze ≡ execute — mesmo plano.
 */

const kb = createInitialKnowledgeBase();
const ALL: Array<{ set: string; rec: EvalRecord }> = [
  ...DEV_DATASET.records.map((rec) => ({ set: 'dev', rec })),
  ...REGRESSION_DATASET.records.map((rec) => ({ set: 'regression', rec })),
  ...FINAL_V1_DATASET.records.map((rec) => ({ set: 'final-v1', rec }))
];

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

describe('F1.3 — consumo de tokens', () => {
  it('todo token com leitura ou literal é consumido por um nó ou diagnosticado', () => {
    const violations: string[] = [];
    for (const { set, rec } of ALL) {
      const engine = prepareEngine(kb, rec);
      const result = engine.execute(rec.input);
      const { semanticTokens, consumption } = result.compile.trace;
      const consumed = new Set<number>(
        (consumption ?? []).flatMap((c) => c.consumedTokenIndices)
      );
      semanticTokens.forEach((token, i) => {
        const hasReading = token.candidates.length > 0;
        if (!hasReading && !token.literal) return;
        if (consumed.has(i)) return;
        // Qualquer diagnóstico que mencione o token conta como reportá-lo,
        // inclusive INFO deliberado (ex.: NEGATED_ACTION cobre o comando todo).
        const reported = result.compile.diagnostics.some(
          (d) =>
            typeof d.start === 'number' &&
            typeof d.end === 'number' &&
            overlaps({ start: d.start, end: d.end }, token.span)
        );
        if (!reported) {
          violations.push(
            `${set}/${rec.id} «${rec.input}»: token ${i} "${token.rawTokens
              .map((t) => t.raw)
              .join(' ')}" com leitura/literal não foi consumido nem reportado`
          );
        }
      });
    }
    expect(violations).toEqual([]);
  });
});

describe('F1.3 — diagnósticos bem formados', () => {
  it('nenhum par com o mesmo (code, start, end) em todos os conjuntos', () => {
    const violations: string[] = [];
    for (const { set, rec } of ALL) {
      const engine = prepareEngine(kb, rec);
      const result = engine.execute(rec.input);
      const seen = new Set<string>();
      for (const d of result.compile.diagnostics) {
        const key = `${d.code}|${d.start}|${d.end}`;
        if (seen.has(key)) {
          violations.push(`${set}/${rec.id} «${rec.input}»: duplicata ${key} — ${d.message}`);
        }
        seen.add(key);
      }
    }
    expect(violations).toEqual([]);
  });

  it('todo diagnóstico tem 0 ≤ start ≤ end ≤ input.length', () => {
    const violations: string[] = [];
    for (const { set, rec } of ALL) {
      const engine = prepareEngine(kb, rec);
      const result = engine.execute(rec.input);
      for (const d of result.compile.diagnostics) {
        if (
          typeof d.start !== 'number' ||
          typeof d.end !== 'number' ||
          d.start < 0 ||
          d.end < d.start ||
          d.end > rec.input.length
        ) {
          violations.push(
            `${set}/${rec.id} «${rec.input}»: ${d.code} span [${d.start},${d.end}]`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('toda camada é uma das válidas do pipeline (IV.F)', () => {
    const violations: string[] = [];
    for (const { set, rec } of ALL) {
      const engine = prepareEngine(kb, rec);
      const result = engine.execute(rec.input);
      for (const d of result.compile.diagnostics) {
        if (!(VALID_LAYERS as readonly string[]).includes(d.layer)) {
          violations.push(`${set}/${rec.id}: camada "${d.layer}" (${d.code})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('F1.3 — analyze ≡ execute', () => {
  it('o plano de analyze é idêntico ao de execute para todo registro', () => {
    const violations: string[] = [];
    for (const { set, rec } of ALL) {
      const analyzed = prepareEngine(kb, rec).analyze(rec.input);
      const executed = prepareEngine(kb, rec).execute(rec.input);
      const planA = planSignature(analyzed.plan);
      const planE = planSignature(executed.compile.plan);
      if (planA !== planE) {
        violations.push(
          `${set}/${rec.id} «${rec.input}»:\n  analyze:  ${planA}\n  execute: ${planE}`
        );
      }
      const codesA = analyzed.diagnostics.map((d) => `${d.code}|${d.start}|${d.end}`).join(',');
      const codesE = executed.compile.diagnostics
        .map((d) => `${d.code}|${d.start}|${d.end}`)
        .join(',');
      if (codesA !== codesE) {
        violations.push(
          `${set}/${rec.id} «${rec.input}» diagnósticos diferem:\n  analyze:  ${codesA}\n  execute: ${codesE}`
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('analyze não altera o documento nem a seleção', () => {
    const violations: string[] = [];
    for (const { set, rec } of ALL) {
      const engine = prepareEngine(kb, rec);
      const before = JSON.stringify(engine.store.document);
      const selectionBefore = JSON.stringify([...engine.store.document.selectionIds]);
      engine.analyze(rec.input);
      const after = JSON.stringify(engine.store.document);
      const selectionAfter = JSON.stringify([...engine.store.document.selectionIds]);
      if (before !== after) violations.push(`${set}/${rec.id}: documento mudou em analyze`);
      if (selectionBefore !== selectionAfter) violations.push(`${set}/${rec.id}: seleção mudou`);
    }
    expect(violations).toEqual([]);
  });
});
