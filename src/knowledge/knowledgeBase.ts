import type {
  ConceptId,
  LexemeId,
  SurfaceForm,
  Lexeme,
  MultiwordEntry,
  PartOfSpeech,
  Morphology
} from '../engine/types';
import type { ConceptNode } from '../engine/ontology/Concept';
import { PARADIGMS, generateForms, generateDiminutives } from './paradigms';
import type { Paradigm, OrthographyRule } from './paradigms';

/** Override persistido de um paradigma (F2.5): substitui células/regras. */
export interface ParadigmOverride {
  cells?: Paradigm['cells'];
  orthography?: OrthographyRule[];
  /** Células desativadas globalmente (por chave canônica). */
  disabledCells?: string[];
}

/**
 * Paradigma efetivo: dados de fábrica com o override do painel aplicado.
 */
export function effectiveParadigm(
  paradigmId: string,
  overrides?: Record<string, ParadigmOverride>
): Paradigm | undefined {
  const base = PARADIGMS[paradigmId];
  if (!base) return undefined;
  const override = overrides?.[paradigmId];
  if (!override) return base;
  return {
    ...base,
    cells: override.cells ?? base.cells,
    orthography: override.orthography ?? base.orthography
  };
}

/**
 * Base de conhecimento persistível (JSON-safe): conceitos, lexemas, formas
 * superficiais, expressões multiword e padrões de domínio.
 *
 * Não contém funções, closures, Maps nem referências a DOM.
 *
 * Toda a gramática fechada (artigos, determinantes, quantificadores, ordinais,
 * cardinais, pronomes, preposições, conjunções e operadores) vive AQUI como
 * dados — o parser consulta conceitos e classes gramaticais, nunca palavras.
 */
export interface KnowledgeBase {
  surfaceForms: SurfaceForm[];
  lexemes: Record<LexemeId, Lexeme>;
  concepts: Record<ConceptId, ConceptNode>;
  multiwords: MultiwordEntry[];
  /** Padrões do domínio que o parser usa sem conhecer palavras. */
  defaults: {
    /** Relação implicada por "com <entidade>" sem relação explícita. */
    impliedContainmentRelationId: ConceptId;
    /** Propriedade de grupo usada quando o grupo não tem binding para a categoria. */
    textContentPropertyId: ConceptId;
  };
  /** Edições de paradigma feitas no painel (F2.5), por id de paradigma. */
  paradigmOverrides?: Record<string, ParadigmOverride>;
}

// ---------------------------------------------------------------------------
// Conceitos
// ---------------------------------------------------------------------------

export const INITIAL_CONCEPTS: Record<ConceptId, ConceptNode> = {
  C_ENT_ROOT: {
    kind: 'ENTITY',
    id: 'C_ENT_ROOT',
    capabilities: {
      canContainChildren: true,
      allowedChildConceptIds: ['C_ENT_CONTAINER', 'C_ENT_BUTTON', 'C_ENT_TEXT'],
      acceptedPropertyIds: ['C_PROP_BG_COLOR', 'C_PROP_PADDING'],
      defaultValueBindings: {}
    },
    rendering: {
      rendererId: 'root',
      domTag: 'div',
      defaultAttributes: { 'data-builder-type': 'root' },
      defaultStyles: { display: 'block', minHeight: '100%' }
    }
  },

  C_ENT_CONTAINER: {
    kind: 'ENTITY',
    id: 'C_ENT_CONTAINER',
    capabilities: {
      canContainChildren: true,
      allowedChildConceptIds: ['C_ENT_CONTAINER', 'C_ENT_BUTTON', 'C_ENT_TEXT'],
      allowedParentConceptIds: ['C_ENT_ROOT', 'C_ENT_CONTAINER'],
      acceptedPropertyIds: [
        'C_PROP_BG_COLOR',
        'C_PROP_BORDER_COLOR',
        'C_PROP_BORDER_WIDTH',
        'C_PROP_BORDER_STYLE',
        'C_PROP_BORDER_RADIUS',
        'C_PROP_PADDING'
      ],
      // Containers NÃO aceitam conteúdo textual: "com texto X" cria um TEXT filho.
      defaultValueBindings: { COLOR: 'C_PROP_BG_COLOR' }
    },
    rendering: {
      rendererId: 'container',
      domTag: 'div',
      defaultAttributes: { 'data-builder-type': 'container' },
      defaultStyles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '16px',
        gap: '8px',
        borderStyle: 'none',
        borderRadius: '6px',
        minHeight: '48px',
        backgroundColor: '#1f2937'
      }
    }
  },

  C_ENT_BUTTON: {
    kind: 'ENTITY',
    id: 'C_ENT_BUTTON',
    capabilities: {
      canContainChildren: false,
      allowedChildConceptIds: [],
      allowedParentConceptIds: ['C_ENT_ROOT', 'C_ENT_CONTAINER'],
      acceptedPropertyIds: [
        'C_PROP_BG_COLOR',
        'C_PROP_TEXT_COLOR',
        'C_PROP_BORDER_COLOR',
        'C_PROP_BORDER_WIDTH',
        'C_PROP_BORDER_STYLE',
        'C_PROP_BORDER_RADIUS',
        'C_PROP_TEXT_CONTENT'
      ],
      defaultValueBindings: { COLOR: 'C_PROP_BG_COLOR', TEXT: 'C_PROP_TEXT_CONTENT' }
    },
    rendering: {
      rendererId: 'button',
      domTag: 'button',
      defaultAttributes: { type: 'button' },
      defaultStyles: {
        padding: '10px 16px',
        cursor: 'pointer',
        borderStyle: 'none',
        borderRadius: '4px',
        backgroundColor: '#374151',
        color: '#ffffff'
      }
    }
  },

  C_ENT_TEXT: {
    kind: 'ENTITY',
    id: 'C_ENT_TEXT',
    capabilities: {
      canContainChildren: false,
      allowedChildConceptIds: [],
      allowedParentConceptIds: ['C_ENT_ROOT', 'C_ENT_CONTAINER'],
      acceptedPropertyIds: ['C_PROP_TEXT_COLOR', 'C_PROP_TEXT_CONTENT'],
      defaultValueBindings: { COLOR: 'C_PROP_TEXT_COLOR', TEXT: 'C_PROP_TEXT_CONTENT' }
    },
    rendering: {
      rendererId: 'text',
      domTag: 'span',
      defaultAttributes: { 'data-builder-type': 'text' },
      defaultStyles: { display: 'block' }
    }
  },

  // --- Ações -----------------------------------------------------------------

  C_ACT_CREATE: {
    kind: 'ACTION',
    id: 'C_ACT_CREATE',
    operation: 'CREATE',
    destructive: false,
    allowedArgumentRoles: ['ENTITY', 'PROPERTY', 'VALUE', 'DESTINATION']
  },
  C_ACT_UPDATE: {
    kind: 'ACTION',
    id: 'C_ACT_UPDATE',
    operation: 'UPDATE',
    destructive: false,
    allowedArgumentRoles: ['TARGET', 'PROPERTY', 'VALUE']
  },
  C_ACT_DELETE: {
    kind: 'ACTION',
    id: 'C_ACT_DELETE',
    operation: 'DELETE',
    destructive: true,
    allowedArgumentRoles: ['TARGET']
  },
  C_ACT_MOVE: {
    kind: 'ACTION',
    id: 'C_ACT_MOVE',
    operation: 'MOVE',
    destructive: true,
    allowedArgumentRoles: ['TARGET', 'DESTINATION']
  },
  C_ACT_QUERY: {
    kind: 'ACTION',
    id: 'C_ACT_QUERY',
    operation: 'QUERY',
    destructive: false,
    allowedArgumentRoles: ['TARGET']
  },

  // --- Propriedades ----------------------------------------------------------

  C_PROP_BG_COLOR: {
    kind: 'PROPERTY', id: 'C_PROP_BG_COLOR', runtimeProperty: 'backgroundColor', valueCategories: ['COLOR']
  },
  C_PROP_TEXT_COLOR: {
    kind: 'PROPERTY', id: 'C_PROP_TEXT_COLOR', runtimeProperty: 'color', valueCategories: ['COLOR']
  },
  C_PROP_TEXT_CONTENT: {
    kind: 'PROPERTY', id: 'C_PROP_TEXT_CONTENT', runtimeProperty: 'textContent',
    valueCategories: ['TEXT'], targetField: 'text'
  },
  C_PROP_BORDER_COLOR: {
    kind: 'PROPERTY', id: 'C_PROP_BORDER_COLOR', runtimeProperty: 'borderColor',
    valueCategories: ['COLOR'], groupId: 'C_PROP_GROUP_BORDER'
  },
  C_PROP_BORDER_WIDTH: {
    kind: 'PROPERTY', id: 'C_PROP_BORDER_WIDTH', runtimeProperty: 'borderWidth',
    valueCategories: ['SIZE'], groupId: 'C_PROP_GROUP_BORDER'
  },
  C_PROP_BORDER_STYLE: {
    kind: 'PROPERTY', id: 'C_PROP_BORDER_STYLE', runtimeProperty: 'borderStyle',
    valueCategories: ['ENUM'], groupId: 'C_PROP_GROUP_BORDER', clearValue: 'none'
  },
  C_PROP_BORDER_RADIUS: {
    kind: 'PROPERTY', id: 'C_PROP_BORDER_RADIUS', runtimeProperty: 'borderRadius',
    valueCategories: ['SIZE'], groupId: 'C_PROP_GROUP_BORDER'
  },
  C_PROP_PADDING: {
    kind: 'PROPERTY', id: 'C_PROP_PADDING', runtimeProperty: 'padding', valueCategories: ['SIZE']
  },

  // --- Grupos ----------------------------------------------------------------

  C_PROP_GROUP_BORDER: {
    kind: 'PROPERTY_GROUP',
    id: 'C_PROP_GROUP_BORDER',
    members: ['C_PROP_BORDER_COLOR', 'C_PROP_BORDER_WIDTH', 'C_PROP_BORDER_STYLE', 'C_PROP_BORDER_RADIUS'],
    bindingByValueCategory: {
      COLOR: 'C_PROP_BORDER_COLOR',
      SIZE: 'C_PROP_BORDER_WIDTH',
      ENUM: 'C_PROP_BORDER_STYLE'
    },
    clearPropertyIds: ['C_PROP_BORDER_COLOR', 'C_PROP_BORDER_WIDTH', 'C_PROP_BORDER_STYLE']
  },

  // --- Valores de cor ---------------------------------------------------------

  C_VAL_BLUE: { kind: 'VALUE', id: 'C_VAL_BLUE', valueCategory: 'COLOR', literal: '#2563eb' },
  C_VAL_RED: { kind: 'VALUE', id: 'C_VAL_RED', valueCategory: 'COLOR', literal: '#dc2626' },
  C_VAL_GREEN: { kind: 'VALUE', id: 'C_VAL_GREEN', valueCategory: 'COLOR', literal: '#16a34a' },
  C_VAL_YELLOW: { kind: 'VALUE', id: 'C_VAL_YELLOW', valueCategory: 'COLOR', literal: '#eab308' },
  C_VAL_BLACK: { kind: 'VALUE', id: 'C_VAL_BLACK', valueCategory: 'COLOR', literal: '#000000' },
  C_VAL_WHITE: { kind: 'VALUE', id: 'C_VAL_WHITE', valueCategory: 'COLOR', literal: '#ffffff' },
  C_VAL_GRAY: { kind: 'VALUE', id: 'C_VAL_GRAY', valueCategory: 'COLOR', literal: '#6b7280' },
  C_VAL_ORANGE: { kind: 'VALUE', id: 'C_VAL_ORANGE', valueCategory: 'COLOR', literal: '#f97316' },
  C_VAL_PURPLE: { kind: 'VALUE', id: 'C_VAL_PURPLE', valueCategory: 'COLOR', literal: '#a855f7' },

  // --- Valores de enumeração ---------------------------------------------------

  C_VAL_NONE: { kind: 'VALUE', id: 'C_VAL_NONE', valueCategory: 'ENUM', literal: 'none' },
  C_VAL_ROUND: {
    kind: 'VALUE', id: 'C_VAL_ROUND', valueCategory: 'SIZE', literal: '50%',
    preferredPropertyId: 'C_PROP_BORDER_RADIUS'
  },

  // --- Ordinais (literal = índice 0-based; negativo conta do fim) ---------------

  C_ORD_1: { kind: 'VALUE', id: 'C_ORD_1', valueCategory: 'ORDINAL', literal: 0 },
  C_ORD_2: { kind: 'VALUE', id: 'C_ORD_2', valueCategory: 'ORDINAL', literal: 1 },
  C_ORD_3: { kind: 'VALUE', id: 'C_ORD_3', valueCategory: 'ORDINAL', literal: 2 },
  C_ORD_4: { kind: 'VALUE', id: 'C_ORD_4', valueCategory: 'ORDINAL', literal: 3 },
  C_ORD_5: { kind: 'VALUE', id: 'C_ORD_5', valueCategory: 'ORDINAL', literal: 4 },
  C_ORD_6: { kind: 'VALUE', id: 'C_ORD_6', valueCategory: 'ORDINAL', literal: 5 },
  C_ORD_7: { kind: 'VALUE', id: 'C_ORD_7', valueCategory: 'ORDINAL', literal: 6 },
  C_ORD_8: { kind: 'VALUE', id: 'C_ORD_8', valueCategory: 'ORDINAL', literal: 7 },
  C_ORD_9: { kind: 'VALUE', id: 'C_ORD_9', valueCategory: 'ORDINAL', literal: 8 },
  C_ORD_10: { kind: 'VALUE', id: 'C_ORD_10', valueCategory: 'ORDINAL', literal: 9 },
  C_ORD_LAST: { kind: 'VALUE', id: 'C_ORD_LAST', valueCategory: 'ORDINAL', literal: -1 },
  C_ORD_PENULTIMATE: { kind: 'VALUE', id: 'C_ORD_PENULTIMATE', valueCategory: 'ORDINAL', literal: -2 },

  // --- Cardinais ---------------------------------------------------------------

  C_CARD_1: { kind: 'VALUE', id: 'C_CARD_1', valueCategory: 'CARDINAL', literal: 1 },
  C_CARD_2: { kind: 'VALUE', id: 'C_CARD_2', valueCategory: 'CARDINAL', literal: 2 },
  C_CARD_3: { kind: 'VALUE', id: 'C_CARD_3', valueCategory: 'CARDINAL', literal: 3 },
  C_CARD_4: { kind: 'VALUE', id: 'C_CARD_4', valueCategory: 'CARDINAL', literal: 4 },
  C_CARD_5: { kind: 'VALUE', id: 'C_CARD_5', valueCategory: 'CARDINAL', literal: 5 },
  C_CARD_6: { kind: 'VALUE', id: 'C_CARD_6', valueCategory: 'CARDINAL', literal: 6 },
  C_CARD_7: { kind: 'VALUE', id: 'C_CARD_7', valueCategory: 'CARDINAL', literal: 7 },
  C_CARD_8: { kind: 'VALUE', id: 'C_CARD_8', valueCategory: 'CARDINAL', literal: 8 },
  C_CARD_9: { kind: 'VALUE', id: 'C_CARD_9', valueCategory: 'CARDINAL', literal: 9 },
  C_CARD_10: { kind: 'VALUE', id: 'C_CARD_10', valueCategory: 'CARDINAL', literal: 10 },

  C_VAL_VAGUE_SOME: { kind: 'VALUE', id: 'C_VAL_VAGUE_SOME', valueCategory: 'CARDINAL', literal: -1 },

  // --- Relações espaciais -------------------------------------------------------

  C_SPAT_INSIDE: { kind: 'SPATIAL', id: 'C_SPAT_INSIDE', relation: 'CHILD_OF' },
  C_SPAT_AFTER: { kind: 'SPATIAL', id: 'C_SPAT_AFTER', relation: 'AFTER' },
  C_SPAT_BEFORE: { kind: 'SPATIAL', id: 'C_SPAT_BEFORE', relation: 'BEFORE' },
  C_SPAT_BESIDE: { kind: 'SPATIAL', id: 'C_SPAT_BESIDE', relation: 'BESIDE' },
  C_SPAT_ABOVE: { kind: 'SPATIAL', id: 'C_SPAT_ABOVE', relation: 'ABOVE' },
  C_SPAT_BELOW: { kind: 'SPATIAL', id: 'C_SPAT_BELOW', relation: 'BELOW' },
  C_SPAT_LEFT: { kind: 'SPATIAL', id: 'C_SPAT_LEFT', relation: 'BESIDE' },
  C_SPAT_RIGHT: { kind: 'SPATIAL', id: 'C_SPAT_RIGHT', relation: 'BESIDE' },

  // --- Operadores gramaticais (DADOS) -------------------------------------------

  C_OP_NOT: { kind: 'OPERATOR', id: 'C_OP_NOT', operator: 'NEGATION' },
  C_OP_WITHOUT: { kind: 'OPERATOR', id: 'C_OP_WITHOUT', operator: 'WITHOUT' },
  C_OP_EXCEPT: { kind: 'OPERATOR', id: 'C_OP_EXCEPT', operator: 'EXCEPT' },
  C_OP_COM: { kind: 'OPERATOR', id: 'C_OP_COM', operator: 'COMITATIVE' },
  C_OP_PARA: { kind: 'OPERATOR', id: 'C_OP_PARA', operator: 'ALLATIVE' },
  C_OP_DE: { kind: 'OPERATOR', id: 'C_OP_DE', operator: 'PARTITIVE' },
  C_OP_E: { kind: 'OPERATOR', id: 'C_OP_E', operator: 'COORDINATION' },
  C_OP_DEF_ART: { kind: 'OPERATOR', id: 'C_OP_DEF_ART', operator: 'DEFINITE_ARTICLE' },
  C_OP_INDEF_ART: { kind: 'OPERATOR', id: 'C_OP_INDEF_ART', operator: 'INDEFINITE_ARTICLE' },
  C_OP_ALL: { kind: 'OPERATOR', id: 'C_OP_ALL', operator: 'UNIVERSAL_QUANTIFIER' },
  C_OP_OTHER: { kind: 'OPERATOR', id: 'C_OP_OTHER', operator: 'ALTERNATIVE_DETERMINER' },

  // --- Consultas -----------------------------------------------------------------

  C_QUERY_SELECT: { kind: 'QUERY', id: 'C_QUERY_SELECT', query: 'SELECT' },
  C_QUERY_INSPECT: { kind: 'QUERY', id: 'C_QUERY_INSPECT', query: 'INSPECT' }
};

// ---------------------------------------------------------------------------
// Lexemas
// ---------------------------------------------------------------------------

interface LexOptions {
  paradigmId?: string;
  gender?: 'Masc' | 'Fem';
  irregular?: Record<string, string | string[]>;
  disabledForms?: string[];
  derivedFrom?: LexemeId;
  allowsDiminutive?: boolean;
}

function lex(
  id: LexemeId,
  lemma: string,
  pos: PartOfSpeech,
  senseConceptIds: ConceptId[] = [],
  options: LexOptions = {}
): Lexeme {
  const lexeme: Lexeme = { id, lemma, pos, senseConceptIds };
  if (options.paradigmId) lexeme.paradigmId = options.paradigmId;
  if (options.gender) lexeme.inherent = { Gender: options.gender };
  if (options.irregular) lexeme.irregular = options.irregular;
  if (options.disabledForms) lexeme.disabledForms = options.disabledForms;
  if (options.derivedFrom) lexeme.derivedFrom = options.derivedFrom;
  if (options.allowsDiminutive) lexeme.allowsDiminutive = true;
  return lexeme;
}

export const INITIAL_LEXEMES: Record<LexemeId, Lexeme> = {
  // Verbos — criação
  LEX_CRIAR: lex('LEX_CRIAR', 'criar', 'VERB', ['C_ACT_CREATE'], { paradigmId: 'V_AR' }),
  LEX_ADICIONAR: lex('LEX_ADICIONAR', 'adicionar', 'VERB', ['C_ACT_CREATE'], { paradigmId: 'V_AR' }),
  LEX_COLOCAR: lex('LEX_COLOCAR', 'colocar', 'VERB', ['C_ACT_CREATE', 'C_ACT_MOVE'], { paradigmId: 'V_AR_CAR' }),
  LEX_BOTAR: lex('LEX_BOTAR', 'botar', 'VERB', ['C_ACT_CREATE'], { paradigmId: 'V_AR' }),
  LEX_FAZER: lex('LEX_FAZER', 'fazer', 'VERB', ['C_ACT_CREATE'], { paradigmId: 'V_FAZER' }),
  LEX_INSERIR: lex('LEX_INSERIR', 'inserir', 'VERB', ['C_ACT_CREATE'], { paradigmId: 'V_IR', irregular: { 'Number=Sing|Person=1|Mood=Sub|VerbForm=Fin|Tense=Pres': 'insira', 'Number=Sing|Person=2|Mood=Sub|VerbForm=Fin|Tense=Pres': 'insiras', 'Number=Sing|Person=3|Mood=Sub|VerbForm=Fin|Tense=Pres': 'insira', 'Number=Plur|Person=1|Mood=Sub|VerbForm=Fin|Tense=Pres': 'insiramos', 'Number=Plur|Person=2|Mood=Sub|VerbForm=Fin|Tense=Pres': 'insirais', 'Number=Plur|Person=3|Mood=Sub|VerbForm=Fin|Tense=Pres': 'insiram', 'Number=Sing|Person=3|Mood=Imp|VerbForm=Fin': 'insira', 'Number=Plur|Person=1|Mood=Imp|VerbForm=Fin': 'insiramos', 'Number=Plur|Person=3|Mood=Imp|VerbForm=Fin': 'insiram', 'Number=Sing|Person=1|Mood=Ind|VerbForm=Fin|Tense=Pres': 'insiro', 'Number=Sing|Person=2|Mood=Ind|VerbForm=Fin|Tense=Pres': 'inseres', 'Number=Sing|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres': 'insere', 'Number=Plur|Person=1|Mood=Ind|VerbForm=Fin|Tense=Pres': 'inserimos', 'Number=Plur|Person=2|Mood=Ind|VerbForm=Fin|Tense=Pres': 'insereis', 'Number=Plur|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres': 'inserem' } }),
  // Verbos — atualização
  LEX_MUDAR: lex('LEX_MUDAR', 'mudar', 'VERB', ['C_ACT_UPDATE'], { paradigmId: 'V_AR' }),
  LEX_DEIXAR: lex('LEX_DEIXAR', 'deixar', 'VERB', ['C_ACT_UPDATE'], { paradigmId: 'V_AR' }),
  LEX_ALTERAR: lex('LEX_ALTERAR', 'alterar', 'VERB', ['C_ACT_UPDATE'], { paradigmId: 'V_AR' }),
  LEX_TROCAR: lex('LEX_TROCAR', 'trocar', 'VERB', ['C_ACT_UPDATE'], { paradigmId: 'V_AR_CAR' }),
  LEX_PINTAR: lex('LEX_PINTAR', 'pintar', 'VERB', ['C_ACT_UPDATE'], { paradigmId: 'V_AR' }),
  // Verbos — exclusão
  LEX_APAGAR: lex('LEX_APAGAR', 'apagar', 'VERB', ['C_ACT_DELETE'], { paradigmId: 'V_AR_GAR' }),
  LEX_REMOVER: lex('LEX_REMOVER', 'remover', 'VERB', ['C_ACT_DELETE'], { paradigmId: 'V_ER' }),
  LEX_EXCLUIR: lex('LEX_EXCLUIR', 'excluir', 'VERB', ['C_ACT_DELETE'], { paradigmId: 'V_IR', irregular: { 'Number=Sing|Person=2|Mood=Ind|VerbForm=Fin|Tense=Pres': 'excluis', 'Number=Sing|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres': 'exclui', 'Number=Plur|Person=1|Mood=Ind|VerbForm=Fin|Tense=Pres': 'excluímos', 'Number=Plur|Person=2|Mood=Ind|VerbForm=Fin|Tense=Pres': 'excluís' } }),
  LEX_DELETAR: lex('LEX_DELETAR', 'deletar', 'VERB', ['C_ACT_DELETE'], { paradigmId: 'V_AR' }),
  LEX_TIRAR: lex('LEX_TIRAR', 'tirar', 'VERB', ['C_ACT_DELETE'], { paradigmId: 'V_AR' }),
  // Verbos — movimento
  LEX_MOVER: lex('LEX_MOVER', 'mover', 'VERB', ['C_ACT_MOVE'], { paradigmId: 'V_ER' }),
  // Verbos — consulta
  LEX_SELECIONAR: lex('LEX_SELECIONAR', 'selecionar', 'VERB', ['C_ACT_QUERY'], { paradigmId: 'V_AR' }),
  LEX_MARCAR: lex('LEX_MARCAR', 'marcar', 'VERB', ['C_ACT_QUERY'], { paradigmId: 'V_AR_CAR' }),

  // Substantivos
  LEX_BOTAO: lex('LEX_BOTAO', 'botão', 'NOUN', ['C_ENT_BUTTON'], { paradigmId: 'N_AO_OES', gender: 'Masc', allowsDiminutive: true }),
  LEX_CAIXA: lex('LEX_CAIXA', 'caixa', 'NOUN', ['C_ENT_CONTAINER'], { paradigmId: 'N_S', gender: 'Fem', allowsDiminutive: true }),
  LEX_CONTAINER: lex('LEX_CONTAINER', 'container', 'NOUN', ['C_ENT_CONTAINER'], { paradigmId: 'N_S', gender: 'Masc' }),
  LEX_TEXTO: lex('LEX_TEXTO', 'texto', 'NOUN', ['C_ENT_TEXT'], { paradigmId: 'N_S', gender: 'Masc' }),

  // Propriedades
  LEX_BORDA: lex('LEX_BORDA', 'borda', 'NOUN', ['C_PROP_GROUP_BORDER'], { paradigmId: 'N_S', gender: 'Fem' }),
  LEX_FUNDO: lex('LEX_FUNDO', 'fundo', 'NOUN', ['C_PROP_BG_COLOR'], { paradigmId: 'N_S', gender: 'Masc' }),
  LEX_ROTULO: lex('LEX_ROTULO', 'rótulo', 'NOUN', ['C_PROP_TEXT_CONTENT'], { paradigmId: 'N_S', gender: 'Masc' }),
  LEX_CONTEUDO: lex('LEX_CONTEUDO', 'conteúdo', 'NOUN', ['C_PROP_TEXT_CONTENT'], { paradigmId: 'N_S', gender: 'Masc' }),

  // Adjetivos de cor
  LEX_AZUL: lex('LEX_AZUL', 'azul', 'ADJECTIVE', ['C_VAL_BLUE'], { paradigmId: 'ADJ_L' }),
  LEX_VERMELHO: lex('LEX_VERMELHO', 'vermelho', 'ADJECTIVE', ['C_VAL_RED'], { paradigmId: 'ADJ_O' }),
  LEX_VERDE: lex('LEX_VERDE', 'verde', 'ADJECTIVE', ['C_VAL_GREEN'], { paradigmId: 'ADJ_INVARIANT' }),
  LEX_AMARELO: lex('LEX_AMARELO', 'amarelo', 'ADJECTIVE', ['C_VAL_YELLOW'], { paradigmId: 'ADJ_O' }),
  LEX_PRETO: lex('LEX_PRETO', 'preto', 'ADJECTIVE', ['C_VAL_BLACK'], { paradigmId: 'ADJ_O', allowsDiminutive: true }),
  LEX_BRANCO: lex('LEX_BRANCO', 'branco', 'ADJECTIVE', ['C_VAL_WHITE'], { paradigmId: 'ADJ_O' }),
  LEX_CINZA: lex('LEX_CINZA', 'cinza', 'ADJECTIVE', ['C_VAL_GRAY'], { paradigmId: 'ADJ_INVARIANT' }),
  LEX_LARANJA: lex('LEX_LARANJA', 'laranja', 'ADJECTIVE', ['C_VAL_ORANGE'], { paradigmId: 'ADJ_INVARIANT' }),
  LEX_ROXO: lex('LEX_ROXO', 'roxo', 'ADJECTIVE', ['C_VAL_PURPLE'], { paradigmId: 'ADJ_O' }),
  LEX_REDONDO: lex('LEX_REDONDO', 'redondo', 'ADJECTIVE', ['C_VAL_ROUND'], { paradigmId: 'ADJ_O' }),

  // Numerais — ordinais
  LEX_ORD_1: lex('LEX_ORD_1', 'primeiro', 'NUMERAL', ['C_ORD_1'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_2: lex('LEX_ORD_2', 'segundo', 'NUMERAL', ['C_ORD_2'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_3: lex('LEX_ORD_3', 'terceiro', 'NUMERAL', ['C_ORD_3'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_4: lex('LEX_ORD_4', 'quarto', 'NUMERAL', ['C_ORD_4'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_5: lex('LEX_ORD_5', 'quinto', 'NUMERAL', ['C_ORD_5'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_6: lex('LEX_ORD_6', 'sexto', 'NUMERAL', ['C_ORD_6'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_7: lex('LEX_ORD_7', 'sétimo', 'NUMERAL', ['C_ORD_7'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_8: lex('LEX_ORD_8', 'oitavo', 'NUMERAL', ['C_ORD_8'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_9: lex('LEX_ORD_9', 'nono', 'NUMERAL', ['C_ORD_9'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_10: lex('LEX_ORD_10', 'décimo', 'NUMERAL', ['C_ORD_10'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_LAST: lex('LEX_ORD_LAST', 'último', 'NUMERAL', ['C_ORD_LAST'], { paradigmId: 'ADJ_O' }),
  LEX_ORD_PENULTIMATE: lex('LEX_ORD_PENULTIMATE', 'penúltimo', 'NUMERAL', ['C_ORD_PENULTIMATE'], { paradigmId: 'ADJ_O' }),

  // Numerais — cardinais
  LEX_CARD_1: lex('LEX_CARD_1', 'um', 'NUMERAL', ['C_CARD_1']),
  LEX_CARD_2: lex('LEX_CARD_2', 'dois', 'NUMERAL', ['C_CARD_2']),
  LEX_CARD_3: lex('LEX_CARD_3', 'três', 'NUMERAL', ['C_CARD_3']),
  LEX_CARD_4: lex('LEX_CARD_4', 'quatro', 'NUMERAL', ['C_CARD_4']),
  LEX_CARD_5: lex('LEX_CARD_5', 'cinco', 'NUMERAL', ['C_CARD_5']),
  LEX_CARD_6: lex('LEX_CARD_6', 'seis', 'NUMERAL', ['C_CARD_6']),
  LEX_CARD_7: lex('LEX_CARD_7', 'sete', 'NUMERAL', ['C_CARD_7']),
  LEX_CARD_8: lex('LEX_CARD_8', 'oito', 'NUMERAL', ['C_CARD_8']),
  LEX_CARD_9: lex('LEX_CARD_9', 'nove', 'NUMERAL', ['C_CARD_9']),
  LEX_CARD_10: lex('LEX_CARD_10', 'dez', 'NUMERAL', ['C_CARD_10']),
  LEX_VAGUE_SOME: lex('LEX_VAGUE_SOME', 'alguns', 'NUMERAL', ['C_VAL_VAGUE_SOME']),
  LEX_VAGUE_SEVERAL: lex('LEX_VAGUE_SEVERAL', 'vários', 'NUMERAL', ['C_VAL_VAGUE_SOME']),

  // Operadores / determinantes / preposições / conjunções
  LEX_NAO: lex('LEX_NAO', 'não', 'ADVERB', ['C_OP_NOT']),
  LEX_SEM: lex('LEX_SEM', 'sem', 'PREPOSITION', ['C_OP_WITHOUT']),
  LEX_MENOS: lex('LEX_MENOS', 'menos', 'PREPOSITION', ['C_OP_EXCEPT']),
  LEX_EXCETO: lex('LEX_EXCETO', 'exceto', 'PREPOSITION', ['C_OP_EXCEPT']),
  LEX_SALVO: lex('LEX_SALVO', 'salvo', 'PREPOSITION', ['C_OP_EXCEPT']),
  LEX_COM: lex('LEX_COM', 'com', 'PREPOSITION', ['C_OP_COM']),
  LEX_PARA: lex('LEX_PARA', 'para', 'PREPOSITION', ['C_OP_PARA']),
  LEX_DE: lex('LEX_DE', 'de', 'PREPOSITION', ['C_OP_DE']),
  LEX_E: lex('LEX_E', 'e', 'CONJUNCTION', ['C_OP_E']),
  LEX_O: lex('LEX_O', 'o', 'DETERMINER', ['C_OP_DEF_ART']),
  LEX_UM: lex('LEX_UM', 'um', 'DETERMINER', ['C_OP_INDEF_ART']),
  LEX_TODO: lex('LEX_TODO', 'todo', 'DETERMINER', ['C_OP_ALL']),
  LEX_OUTRO: lex('LEX_OUTRO', 'outro', 'DETERMINER', ['C_OP_OTHER']),

  // Pronomes pessoais (referência anafórica)
  LEX_ELE: lex('LEX_ELE', 'ele', 'PRONOUN', []),
  LEX_ELA: lex('LEX_ELA', 'ela', 'PRONOUN', []),
  LEX_ELES: lex('LEX_ELES', 'eles', 'PRONOUN', []),
  LEX_ELAS: lex('LEX_ELAS', 'elas', 'PRONOUN', []),

  // Demonstrativos e anafóricos definidos
  LEX_ESSE: lex('LEX_ESSE', 'esse', 'DETERMINER', ['C_OP_DEF_ART']),
  LEX_ESTE: lex('LEX_ESTE', 'este', 'DETERMINER', ['C_OP_DEF_ART']),
  LEX_AQUELE: lex('LEX_AQUELE', 'aquele', 'DETERMINER', ['C_OP_DEF_ART']),
  LEX_MESMO: lex('LEX_MESMO', 'mesmo', 'DETERMINER', ['C_OP_DEF_ART']),

  // Espaciais
  LEX_DENTRO: lex('LEX_DENTRO', 'dentro', 'ADVERB', ['C_SPAT_INSIDE']),
  LEX_DEPOIS: lex('LEX_DEPOIS', 'depois', 'ADVERB', ['C_SPAT_AFTER']),
  LEX_ANTES: lex('LEX_ANTES', 'antes', 'ADVERB', ['C_SPAT_BEFORE']),
  LEX_LADO: lex('LEX_LADO', 'lado', 'NOUN', ['C_SPAT_BESIDE'])
};

// ---------------------------------------------------------------------------
// Formas superficiais
// ---------------------------------------------------------------------------

function sf(
  id: string,
  rawText: string,
  lexemeId: LexemeId,
  formType: SurfaceForm['formType'] = 'CANONICAL',
  morphology?: Morphology
): SurfaceForm {
  return { id, rawText, lexemeId, formType, morphology };
}

const M = 'MASC' as const;
const F = 'FEM' as const;
const S = 'SINGULAR' as const;
const P = 'PLURAL' as const;

/**
 * Gera as quatro flexões de um adjetivo de duas terminações.
 * `stem` é o radical sem a vogal temática: "vermelh" → vermelho/vermelha/
 * vermelhos/vermelhas.
 */
/**
 * SurfaceForms MANUAIS: só erro, coloquial, abreviação, sinônimo e exceção
 * que o paradigma não cobre (F2.2). Toda flexão regular vem de
 * `generateSurfaceForms`.
 */
export const INITIAL_SURFACE_FORMS: SurfaceForm[] = [
  // --- Exceções lexicais -------------------------------------------------------
  // "ponha" é do verbo pôr, mas o léxico do domínio o associa a colocar.
  sf('SF_PONHA', 'ponha', 'LEX_COLOCAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  // "texto" também nomeia a propriedade de conteúdo (sinônimo de conteúdo):
  // a desambiguação é estrutural (entidade corrente aceita texto?).
  sf('SF_TEXTO_PROP', 'texto', 'LEX_CONTEUDO', 'CANONICAL', { gender: M, number: S }),

  // --- Erros de digitação, formas coloquiais e abreviações --------------------
  sf('SF_FACA_ASCII', 'faca', 'LEX_FAZER', 'MISSPELLING', { mood: 'IMPERATIVE' }),
  sf('SF_BOTAO_ASCII', 'botao', 'LEX_BOTAO', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_BOTOES_ASCII', 'botoes', 'LEX_BOTAO', 'COLLOQUIAL', { gender: M, number: P }),
  sf('SF_ROTULO_ASCII', 'rotulo', 'LEX_ROTULO', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_CONTEUDO_ASCII', 'conteudo', 'LEX_CONTEUDO', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_ASUL', 'asul', 'LEX_AZUL', 'MISSPELLING', { number: S }),
  sf('SF_ORD_7_ASCII', 'setim', 'LEX_ORD_7', 'MISSPELLING'),
  sf('SF_ORD_10_ASCII', 'decim', 'LEX_ORD_10', 'MISSPELLING'),
  sf('SF_ORD_LAST_ASCII_S', 'ultimo', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_ORD_LAST_ASCII_F', 'ultima', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: F, number: S }),
  sf('SF_ORD_LAST_ASCII_MP', 'ultimos', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: M, number: P }),
  sf('SF_ORD_LAST_ASCII_FP', 'ultimas', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: F, number: P }),
  sf('SF_ORD_PEN_ASCII_S', 'penultimo', 'LEX_ORD_PENULTIMATE', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_ORD_PEN_ASCII_F', 'penultima', 'LEX_ORD_PENULTIMATE', 'COLLOQUIAL', { gender: F, number: S }),
  sf('SF_NAO_ASCII', 'nao', 'LEX_NAO', 'COLLOQUIAL'),
  sf('SF_CARD_3_ASCII', 'tres', 'LEX_CARD_3', 'COLLOQUIAL'),

  // --- Numerais cardinais e quantificadores vagos (classe fechada) ------------
  sf('SF_CARD_1_M', 'um', 'LEX_CARD_1', 'CANONICAL', { gender: M, number: S }),
  sf('SF_CARD_1_F', 'uma', 'LEX_CARD_1', 'INFLECTION', { gender: F, number: S }),
  sf('SF_CARD_2_M', 'dois', 'LEX_CARD_2', 'CANONICAL', { gender: M, number: P }),
  sf('SF_CARD_2_F', 'duas', 'LEX_CARD_2', 'INFLECTION', { gender: F, number: P }),
  sf('SF_CARD_3', 'três', 'LEX_CARD_3', 'CANONICAL'),
  sf('SF_CARD_4', 'quatro', 'LEX_CARD_4'),
  sf('SF_CARD_5', 'cinco', 'LEX_CARD_5'),
  sf('SF_CARD_6', 'seis', 'LEX_CARD_6'),
  sf('SF_CARD_7', 'sete', 'LEX_CARD_7'),
  sf('SF_CARD_8', 'oito', 'LEX_CARD_8'),
  sf('SF_CARD_9', 'nove', 'LEX_CARD_9'),
  sf('SF_CARD_10', 'dez', 'LEX_CARD_10'),
  sf('SF_VAGUE_SOME_M', 'alguns', 'LEX_VAGUE_SOME', 'CANONICAL', { gender: M, number: P }),
  sf('SF_VAGUE_SOME_F', 'algumas', 'LEX_VAGUE_SOME', 'INFLECTION', { gender: F, number: P }),
  sf('SF_VAGUE_SOME_S', 'algum', 'LEX_VAGUE_SOME', 'INFLECTION', { gender: M, number: S }),
  sf('SF_VAGUE_SOME_SF', 'alguma', 'LEX_VAGUE_SOME', 'INFLECTION', { gender: F, number: S }),
  sf('SF_VAGUE_SEVERAL_M', 'vários', 'LEX_VAGUE_SEVERAL', 'CANONICAL', { gender: M, number: P }),
  sf('SF_VAGUE_SEVERAL_F', 'várias', 'LEX_VAGUE_SEVERAL', 'INFLECTION', { gender: F, number: P }),

  // --- Operadores e palavras gramaticais (classe fechada) ---------------------
  sf('SF_NAO', 'não', 'LEX_NAO'),
  sf('SF_SEM', 'sem', 'LEX_SEM'),
  sf('SF_MENOS', 'menos', 'LEX_MENOS'),
  sf('SF_EXCETO', 'exceto', 'LEX_EXCETO'),
  sf('SF_SALVO', 'salvo', 'LEX_SALVO'),
  sf('SF_COM', 'com', 'LEX_COM'),
  sf('SF_PARA', 'para', 'LEX_PARA'),
  sf('SF_DE', 'de', 'LEX_DE'),
  sf('SF_E', 'e', 'LEX_E'),

  sf('SF_O_M_S', 'o', 'LEX_O', 'CANONICAL', { gender: M, number: S }),
  sf('SF_O_F_S', 'a', 'LEX_O', 'INFLECTION', { gender: F, number: S }),
  sf('SF_O_M_P', 'os', 'LEX_O', 'INFLECTION', { gender: M, number: P }),
  sf('SF_O_F_P', 'as', 'LEX_O', 'INFLECTION', { gender: F, number: P }),

  sf('SF_UM_M_S', 'um', 'LEX_UM', 'CANONICAL', { gender: M, number: S }),
  sf('SF_UM_F_S', 'uma', 'LEX_UM', 'INFLECTION', { gender: F, number: S }),
  sf('SF_UM_M_P', 'uns', 'LEX_UM', 'INFLECTION', { gender: M, number: P }),
  sf('SF_UM_F_P', 'umas', 'LEX_UM', 'INFLECTION', { gender: F, number: P }),

  sf('SF_TODO_M_S', 'todo', 'LEX_TODO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_TODO_F_S', 'toda', 'LEX_TODO', 'INFLECTION', { gender: F, number: S }),
  sf('SF_TODO_M_P', 'todos', 'LEX_TODO', 'INFLECTION', { gender: M, number: P }),
  sf('SF_TODO_F_P', 'todas', 'LEX_TODO', 'INFLECTION', { gender: F, number: P }),

  sf('SF_OUTRO_M_S', 'outro', 'LEX_OUTRO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_OUTRO_F_S', 'outra', 'LEX_OUTRO', 'INFLECTION', { gender: F, number: S }),
  sf('SF_OUTRO_M_P', 'outros', 'LEX_OUTRO', 'INFLECTION', { gender: M, number: P }),
  sf('SF_OUTRO_F_P', 'outras', 'LEX_OUTRO', 'INFLECTION', { gender: F, number: P }),

  sf('SF_ELE', 'ele', 'LEX_ELE', 'CANONICAL', { gender: M, number: S }),
  sf('SF_ELA', 'ela', 'LEX_ELA', 'CANONICAL', { gender: F, number: S }),
  sf('SF_ELES', 'eles', 'LEX_ELES', 'CANONICAL', { gender: M, number: P }),
  sf('SF_ELAS', 'elas', 'LEX_ELAS', 'CANONICAL', { gender: F, number: P }),

  sf('SF_ESSE_M_S', 'esse', 'LEX_ESSE', 'CANONICAL', { gender: M, number: S }),
  sf('SF_ESSE_F_S', 'essa', 'LEX_ESSE', 'INFLECTION', { gender: F, number: S }),
  sf('SF_ESSE_M_P', 'esses', 'LEX_ESSE', 'INFLECTION', { gender: M, number: P }),
  sf('SF_ESSE_F_P', 'essas', 'LEX_ESSE', 'INFLECTION', { gender: F, number: P }),
  sf('SF_ESTE_M_S', 'este', 'LEX_ESTE', 'CANONICAL', { gender: M, number: S }),
  sf('SF_ESTE_F_S', 'esta', 'LEX_ESTE', 'INFLECTION', { gender: F, number: S }),
  sf('SF_AQUELE_M_S', 'aquele', 'LEX_AQUELE', 'CANONICAL', { gender: M, number: S }),
  sf('SF_AQUELE_F_S', 'aquela', 'LEX_AQUELE', 'INFLECTION', { gender: F, number: S }),
  sf('SF_AQUELE_M_P', 'aqueles', 'LEX_AQUELE', 'INFLECTION', { gender: M, number: P }),
  sf('SF_AQUELE_F_P', 'aquelas', 'LEX_AQUELE', 'INFLECTION', { gender: F, number: P }),
  sf('SF_MESMO_M_S', 'mesmo', 'LEX_MESMO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_MESMO_F_S', 'mesma', 'LEX_MESMO', 'INFLECTION', { gender: F, number: S }),
  sf('SF_MESMO_M_P', 'mesmos', 'LEX_MESMO', 'INFLECTION', { gender: M, number: P }),
  sf('SF_MESMO_F_P', 'mesmas', 'LEX_MESMO', 'INFLECTION', { gender: F, number: P }),

  sf('SF_DENTRO', 'dentro', 'LEX_DENTRO'),
  sf('SF_DEPOIS', 'depois', 'LEX_DEPOIS'),
  sf('SF_ANTES', 'antes', 'LEX_ANTES'),
  sf('SF_LADO', 'lado', 'LEX_LADO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_DIREITA', 'direita', 'LEX_DIREITA', 'CANONICAL', { gender: F, number: S }),
  sf('SF_ESQUERDA', 'esquerda', 'LEX_ESQUERDA', 'CANONICAL', { gender: F, number: S })
];

/**
 * Gera as SurfaceForms de um lexeme pelo seu paradigma (F2.1/F2.2):
 * `id = lexemeId#FeatureKey`, formType INFLECTION (ou CANONICAL para o lema),
 * morfologia completa e `generated: true`. Diminutivos entram para lexemes
 * com `allowsDiminutive`.
 */
export function generateSurfaceForms(
  lexemes: Record<LexemeId, Lexeme>,
  overrides?: Record<string, ParadigmOverride>
): SurfaceForm[] {
  const out: SurfaceForm[] = [];
  for (const lexeme of Object.values(lexemes)) {
    if (lexeme.paradigmId) {
      const paradigm = effectiveParadigm(lexeme.paradigmId, overrides);
      if (!paradigm) continue;
      const override = overrides?.[lexeme.paradigmId];
      for (const form of generateForms(lexeme.id, lexeme.lemma, paradigm, {
        inherent: lexeme.inherent,
        irregular: lexeme.irregular,
        disabledForms: [
          ...(lexeme.disabledForms ?? []),
          ...(override?.disabledCells ?? [])
        ]
      })) {
        out.push({
          id: `${lexeme.id}#${form.featureKey}`,
          rawText: form.surface,
          lexemeId: lexeme.id,
          formType: form.formType,
          morphology: form.morphology,
          features: form.featureKey,
          generated: true
        });
      }
    }
    if (lexeme.allowsDiminutive && (lexeme.pos === 'NOUN' || lexeme.pos === 'ADJECTIVE')) {
      const gender = lexeme.inherent?.Gender === 'Fem' ? 'Fem' : 'Masc';
      for (const number of ['Sing', 'Plur'] as const) {
        for (const form of generateDiminutives(lexeme.lemma, gender, number)) {
          out.push({
            id: `${lexeme.id}#${form.featureKey}`,
            rawText: form.surface,
            lexemeId: lexeme.id,
            formType: form.formType,
            morphology: form.morphology,
            features: form.featureKey,
            generated: true
          });
        }
      }
    }
  }
  return out;
}

// Direções espaciais
INITIAL_LEXEMES['LEX_DIREITA'] = lex('LEX_DIREITA', 'direita', 'ADVERB', ['C_SPAT_RIGHT']);
INITIAL_LEXEMES['LEX_ESQUERDA'] = lex('LEX_ESQUERDA', 'esquerda', 'ADVERB', ['C_SPAT_LEFT']);

// ---------------------------------------------------------------------------
// Expressões multiword
// ---------------------------------------------------------------------------

export const INITIAL_MULTIWORDS: MultiwordEntry[] = [
  { id: 'MWE_BG_COLOR', phrase: 'cor de fundo', conceptId: 'C_PROP_BG_COLOR' },
  { id: 'MWE_BG_COLOR_ALT', phrase: 'cor do fundo', conceptId: 'C_PROP_BG_COLOR' },
  { id: 'MWE_TEXT_COLOR', phrase: 'cor do texto', conceptId: 'C_PROP_TEXT_COLOR' },
  { id: 'MWE_TEXT_COLOR_ALT', phrase: 'cor da letra', conceptId: 'C_PROP_TEXT_COLOR' },
  { id: 'MWE_BORDER_COLOR', phrase: 'cor da borda', conceptId: 'C_PROP_BORDER_COLOR' },
  { id: 'MWE_TEXT_CONTENT', phrase: 'com o texto', conceptId: 'C_PROP_TEXT_CONTENT' },
  { id: 'MWE_TEXT_WRITTEN', phrase: 'escrito', conceptId: 'C_PROP_TEXT_CONTENT' },
  { id: 'MWE_TEXT_SAYS', phrase: 'que diz', conceptId: 'C_PROP_TEXT_CONTENT' },
  { id: 'MWE_INSIDE', phrase: 'dentro de', conceptId: 'C_SPAT_INSIDE' },
  { id: 'MWE_AFTER', phrase: 'depois de', conceptId: 'C_SPAT_AFTER' },
  { id: 'MWE_BEFORE', phrase: 'antes de', conceptId: 'C_SPAT_BEFORE' },
  { id: 'MWE_BESIDE', phrase: 'ao lado de', conceptId: 'C_SPAT_BESIDE' },
  { id: 'MWE_BESIDE_ALT', phrase: 'do lado de', conceptId: 'C_SPAT_BESIDE' },
  { id: 'MWE_ABOVE', phrase: 'em cima de', conceptId: 'C_SPAT_ABOVE' },
  { id: 'MWE_BELOW', phrase: 'embaixo de', conceptId: 'C_SPAT_BELOW' },
  { id: 'MWE_RIGHT', phrase: 'da direita', conceptId: 'C_SPAT_RIGHT' },
  { id: 'MWE_LEFT', phrase: 'da esquerda', conceptId: 'C_SPAT_LEFT' },
  { id: 'MWE_MOST_RIGHT', phrase: 'mais à direita', conceptId: 'C_SPAT_RIGHT' },
  { id: 'MWE_MOST_LEFT', phrase: 'mais à esquerda', conceptId: 'C_SPAT_LEFT' },
  // Marcadores de oração relativa: restringem o antecedente por estado
  // ("que está dentro da caixa") ou por propriedade ("que tem borda azul").
  { id: 'MWE_RELATIVE_STATE', phrase: 'que está', conceptId: 'C_RELATIVE_STATE' },
  { id: 'MWE_RELATIVE_STATE_ALT', phrase: 'que esta', conceptId: 'C_RELATIVE_STATE' },
  { id: 'MWE_RELATIVE_STATE_PL', phrase: 'que estão', conceptId: 'C_RELATIVE_STATE' },
  { id: 'MWE_RELATIVE_HAVE', phrase: 'que tem', conceptId: 'C_RELATIVE_HAVE' },
  { id: 'MWE_RELATIVE_HAVE_SUBJ', phrase: 'que tenha', conceptId: 'C_RELATIVE_HAVE' },
  { id: 'MWE_RELATIVE_HAVE_SUBJ_PL', phrase: 'que tenham', conceptId: 'C_RELATIVE_HAVE' },
  { id: 'MWE_RELATIVE_HAVE_ALT', phrase: 'que possui', conceptId: 'C_RELATIVE_HAVE' }
];

/**
 * Operadores de oração relativa. `RELATIVE_STATE` introduz uma restrição
 * espacial; `RELATIVE_HAVE` introduz uma restrição de propriedade. São
 * operadores gramaticais (dados) — o parser consulta o operador, não a palavra.
 */
INITIAL_CONCEPTS['C_RELATIVE_STATE'] = {
  kind: 'OPERATOR',
  id: 'C_RELATIVE_STATE',
  operator: 'RELATIVE_STATE'
};
INITIAL_CONCEPTS['C_RELATIVE_HAVE'] = {
  kind: 'OPERATOR',
  id: 'C_RELATIVE_HAVE',
  operator: 'RELATIVE_HAVE'
};

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

export function createInitialKnowledgeBase(): KnowledgeBase {
  return {
    // Formas geradas do paradigma precedem as manuais (exceções e
    // sinônimos) na ordem de candidatos: "texto" tem a leitura de entidade
    // (LEX_TEXTO) antes da de propriedade (LEX_CONTEUDO, sinônimo manual).
    surfaceForms: [
      ...generateSurfaceForms(INITIAL_LEXEMES),
      ...INITIAL_SURFACE_FORMS.map((s) => ({ ...s }))
    ],
    lexemes: { ...INITIAL_LEXEMES },
    concepts: structuredClone(INITIAL_CONCEPTS),
    multiwords: INITIAL_MULTIWORDS.map((m) => ({ ...m })),
    defaults: {
      impliedContainmentRelationId: 'C_SPAT_INSIDE',
      textContentPropertyId: 'C_PROP_TEXT_CONTENT'
    }
  };
}

export function cloneKnowledgeBase(kb: KnowledgeBase): KnowledgeBase {
  const clone: KnowledgeBase = {
    surfaceForms: kb.surfaceForms.map((s) => ({ ...s })),
    lexemes: Object.fromEntries(Object.entries(kb.lexemes).map(([id, l]) => [id, { ...l }])),
    concepts: structuredClone(kb.concepts),
    multiwords: kb.multiwords.map((m) => ({ ...m })),
    defaults: { ...kb.defaults }
  };
  if (kb.paradigmOverrides) clone.paradigmOverrides = structuredClone(kb.paradigmOverrides);
  return clone;
}
