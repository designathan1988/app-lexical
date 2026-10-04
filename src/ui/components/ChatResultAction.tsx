import React from 'react';
import type { CommandResult } from '../../engine/SemanticEngine';

interface Props {
  result: CommandResult;
  analysisOnly?: boolean;
  onInspect: (result: CommandResult) => void;
}

export function ChatResultAction({ result, analysisOnly, onInspect }: Props) {
  return (
    <div className="bubble-actions">
      <button className="link" onClick={() => onInspect(result)}>
        {analysisOnly ? 'Classes / Sintaxe / Significado' : 'inspecionar pipeline'}
      </button>
    </div>
  );
}
