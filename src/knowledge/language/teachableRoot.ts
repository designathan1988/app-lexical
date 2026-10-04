import type { ParadigmId } from '../paradigms';

export type TeachablePos = 'VERB' | 'NOUN' | 'ADJECTIVE' | 'ADVERB';

export interface TeachableRoot {
  id: string;
  lemma: string;
  pos: TeachablePos;
  paradigmId: ParadigmId;
  paradigmRule: string;
  sense: { id: string; gloss: string; semanticType: string };
  frame?: {
    id: string;
    sourceTemplateId: string;
    roles: Record<string, { label: string; prefers: string[] }>;
    syntax: Array<Record<string, string>>;
    control?: 'SUBJECT' | 'OBJECT';
    complement?: string;
    defaultTemplate?: boolean;
  };
}

export interface TeachRootInput {
  lemma: string;
  pos: TeachablePos;
  paradigmId?: ParadigmId;
  gloss: string;
  semanticType: string;
  frameTemplateId?: string;
}
