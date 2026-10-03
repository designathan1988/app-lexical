/**
 * Fachada de métricas. A medição real vive em `runner.ts`; aqui ficam os
 * agregados usados pela UI e pelos testes.
 */
export {
  runDataset,
  runRecord,
  ratio,
  lexicalCoverage,
  type SetReport,
  type RecordResult,
  type MetricValue
} from './runner';

import type { SetReport } from './runner';
import type { EvalDataset } from './datasetSchema';

export interface MetricsBundle {
  dev: SetReport;
  regression: SetReport;
  finalV1: SetReport;
}

export function summarize(reports: SetReport[]): {
  total: number;
  passed: number;
  failed: number;
  endToEndSuccess: number | null;
} {
  const total = reports.reduce((a, r) => a + r.total, 0);
  const passed = reports.reduce((a, r) => a + r.passed, 0);
  return {
    total,
    passed,
    failed: total - passed,
    endToEndSuccess: total === 0 ? null : passed / total
  };
}

export type { EvalDataset };
