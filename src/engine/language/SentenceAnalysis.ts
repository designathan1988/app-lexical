import type { TaggedWord, TaggingTrace } from './Tagger';
import type { DependencyArc } from './DependencyParser';
import type { ClauseAnalysis } from './ClauseAnalyzer';
import type { MultiwordToken } from './Tokenizer';
import type { MeaningGraph } from './MeaningGraphBuilder';

export interface SentenceAnalysis {
  text: string;
  words: TaggedWord[];
  multiwords: MultiwordToken[];
  dependencies: DependencyArc[];
  clause: ClauseAnalysis;
  conllu: string;
  meaningGraph: MeaningGraph;
  trace: { tagging: TaggingTrace[]; dependencies: Array<{ id: number; rule: string }> };
}
