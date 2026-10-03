import type { TaggedWord, TaggingTrace } from './Tagger';
import type { DependencyArc } from './DependencyParser';
import type { ClauseAnalysis } from './ClauseAnalyzer';
import type { MultiwordToken } from './Tokenizer';

export interface SentenceAnalysis {
  text: string;
  words: TaggedWord[];
  multiwords: MultiwordToken[];
  dependencies: DependencyArc[];
  clause: ClauseAnalysis;
  conllu: string;
  trace: { tagging: TaggingTrace[]; dependencies: Array<{ id: number; rule: string }> };
}
