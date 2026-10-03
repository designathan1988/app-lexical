import type { EvalDataset, EvalRecord } from './datasetSchema';
import { DATASET_SCHEMA_VERSION } from './datasetSchema';

import devRaw from './data/dev.json';
import regressionRaw from './data/regression.json';
import finalV1Raw from './data/final-v1-compromised.json';

function asDataset(raw: unknown, expectedName: string): EvalDataset {
  const ds = raw as EvalDataset;
  if (!ds || !Array.isArray(ds.records)) {
    throw new Error(`Dataset ${expectedName} inválido: falta "records".`);
  }
  if (ds.schemaVersion !== DATASET_SCHEMA_VERSION) {
    throw new Error(
      `Dataset ${expectedName}: schemaVersion ${ds.schemaVersion} ≠ ${DATASET_SCHEMA_VERSION}.`
    );
  }
  const ids = new Set<string>();
  for (const r of ds.records) {
    if (ids.has(r.id)) throw new Error(`Dataset ${expectedName}: id duplicado "${r.id}".`);
    ids.add(r.id);
  }
  return ds;
}

export const DEV_DATASET = asDataset(devRaw, 'dev');
export const REGRESSION_DATASET = asDataset(regressionRaw, 'regression');

/**
 * Rótulo obrigatório do conjunto comprometido (F0.3): era o antigo
 * `final.json`, regravado em 2026-10-03 11:49 depois de correções de código.
 * Não é held-out; ver `data/CHANGES.md`.
 */
export const COMPROMISED_LABEL = 'final-v1 (comprometido)';

export const FINAL_V1_DATASET = asDataset(finalV1Raw, 'final-v1-compromised');

export const ALL_DATASETS: EvalDataset[] = [DEV_DATASET, REGRESSION_DATASET, FINAL_V1_DATASET];

export function allRecords(): EvalRecord[] {
  return ALL_DATASETS.flatMap((d) => d.records);
}

/** Casos marcados como genuinamente ambíguos, em qualquer conjunto. */
export function ambiguousRecords(): EvalRecord[] {
  return allRecords().filter((r) => r.expected.ambiguous);
}

/** Casos que devem falhar, em qualquer conjunto. */
export function negativeRecords(): EvalRecord[] {
  return allRecords().filter((r) => r.expectError === true);
}
