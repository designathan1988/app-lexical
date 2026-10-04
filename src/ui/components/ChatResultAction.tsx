import React from 'react';
import type { CommandResult } from '../../engine/SemanticEngine';
import type { SentenceAnalysis } from '../../engine/language/SentenceAnalysis';
import { sentenceSummary } from './SentenceWorkbench';

interface Props {
  result: CommandResult;
  analysisOnly?: boolean;
  onInspect: (result: CommandResult) => void;
  analysis?: SentenceAnalysis;
  onOpenAnalysis?: () => void;
}

export function ChatResultAction({ result, analysisOnly, onInspect, analysis, onOpenAnalysis }: Props) {
  if (analysisOnly && analysis) {
    const summary = sentenceSummary(analysis);
    return <div className="chat-analysis-card ui-card">
      <div className="summary-kicker">FRASE ANALISADA</div>
      <p><strong>Quem:</strong> {summary.subject} · <strong>Ação:</strong> {summary.action} · <strong>O quê:</strong> {summary.object} · <strong>Quando:</strong> {summary.time} · <strong>Tipo:</strong> {summary.type}</p>
      <button className="primary" onClick={onOpenAnalysis}>Ver análise completa</button>
      <small>O documento não foi alterado. Diagnósticos disponíveis no pipeline.</small>
    </div>;
  }
  return (
    <div className="bubble-actions">
      <button className="link" onClick={() => onInspect(result)}>
        {analysisOnly ? 'Classes / Sintaxe / Significado' : 'inspecionar pipeline'}
      </button>
    </div>
  );
}
