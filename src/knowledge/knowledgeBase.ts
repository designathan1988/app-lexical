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

function lex(
  id: LexemeId,
  lemma: string,
  pos: PartOfSpeech,
  senseConceptIds: ConceptId[] = []
): Lexeme {
  return { id, lemma, pos, senseConceptIds };
}

export const INITIAL_LEXEMES: Record<LexemeId, Lexeme> = {
  // Verbos — criação
  LEX_CRIAR: lex('LEX_CRIAR', 'criar', 'VERB', ['C_ACT_CREATE']),
  LEX_ADICIONAR: lex('LEX_ADICIONAR', 'adicionar', 'VERB', ['C_ACT_CREATE']),
  LEX_COLOCAR: lex('LEX_COLOCAR', 'colocar', 'VERB', ['C_ACT_CREATE', 'C_ACT_MOVE']),
  LEX_BOTAR: lex('LEX_BOTAR', 'botar', 'VERB', ['C_ACT_CREATE']),
  LEX_FAZER: lex('LEX_FAZER', 'fazer', 'VERB', ['C_ACT_CREATE']),
  LEX_INSERIR: lex('LEX_INSERIR', 'inserir', 'VERB', ['C_ACT_CREATE']),
  // Verbos — atualização
  LEX_MUDAR: lex('LEX_MUDAR', 'mudar', 'VERB', ['C_ACT_UPDATE']),
  LEX_DEIXAR: lex('LEX_DEIXAR', 'deixar', 'VERB', ['C_ACT_UPDATE']),
  LEX_ALTERAR: lex('LEX_ALTERAR', 'alterar', 'VERB', ['C_ACT_UPDATE']),
  LEX_TROCAR: lex('LEX_TROCAR', 'trocar', 'VERB', ['C_ACT_UPDATE']),
  LEX_PINTAR: lex('LEX_PINTAR', 'pintar', 'VERB', ['C_ACT_UPDATE']),
  // Verbos — exclusão
  LEX_APAGAR: lex('LEX_APAGAR', 'apagar', 'VERB', ['C_ACT_DELETE']),
  LEX_REMOVER: lex('LEX_REMOVER', 'remover', 'VERB', ['C_ACT_DELETE']),
  LEX_EXCLUIR: lex('LEX_EXCLUIR', 'excluir', 'VERB', ['C_ACT_DELETE']),
  LEX_DELETAR: lex('LEX_DELETAR', 'deletar', 'VERB', ['C_ACT_DELETE']),
  LEX_TIRAR: lex('LEX_TIRAR', 'tirar', 'VERB', ['C_ACT_DELETE']),
  // Verbos — movimento
  LEX_MOVER: lex('LEX_MOVER', 'mover', 'VERB', ['C_ACT_MOVE']),
  // Verbos — consulta
  LEX_SELECIONAR: lex('LEX_SELECIONAR', 'selecionar', 'VERB', ['C_ACT_QUERY']),
  LEX_MARCAR: lex('LEX_MARCAR', 'marcar', 'VERB', ['C_ACT_QUERY']),

  // Substantivos
  LEX_BOTAO: lex('LEX_BOTAO', 'botão', 'NOUN', ['C_ENT_BUTTON']),
  LEX_CAIXA: lex('LEX_CAIXA', 'caixa', 'NOUN', ['C_ENT_CONTAINER']),
  LEX_CONTAINER: lex('LEX_CONTAINER', 'container', 'NOUN', ['C_ENT_CONTAINER']),
  LEX_TEXTO: lex('LEX_TEXTO', 'texto', 'NOUN', ['C_ENT_TEXT']),

  // Propriedades
  LEX_BORDA: lex('LEX_BORDA', 'borda', 'NOUN', ['C_PROP_GROUP_BORDER']),
  LEX_FUNDO: lex('LEX_FUNDO', 'fundo', 'NOUN', ['C_PROP_BG_COLOR']),
  LEX_ROTULO: lex('LEX_ROTULO', 'rótulo', 'NOUN', ['C_PROP_TEXT_CONTENT']),
  LEX_CONTEUDO: lex('LEX_CONTEUDO', 'conteúdo', 'NOUN', ['C_PROP_TEXT_CONTENT']),

  // Adjetivos de cor
  LEX_AZUL: lex('LEX_AZUL', 'azul', 'ADJECTIVE', ['C_VAL_BLUE']),
  LEX_VERMELHO: lex('LEX_VERMELHO', 'vermelho', 'ADJECTIVE', ['C_VAL_RED']),
  LEX_VERDE: lex('LEX_VERDE', 'verde', 'ADJECTIVE', ['C_VAL_GREEN']),
  LEX_AMARELO: lex('LEX_AMARELO', 'amarelo', 'ADJECTIVE', ['C_VAL_YELLOW']),
  LEX_PRETO: lex('LEX_PRETO', 'preto', 'ADJECTIVE', ['C_VAL_BLACK']),
  LEX_BRANCO: lex('LEX_BRANCO', 'branco', 'ADJECTIVE', ['C_VAL_WHITE']),
  LEX_CINZA: lex('LEX_CINZA', 'cinza', 'ADJECTIVE', ['C_VAL_GRAY']),
  LEX_LARANJA: lex('LEX_LARANJA', 'laranja', 'ADJECTIVE', ['C_VAL_ORANGE']),
  LEX_ROXO: lex('LEX_ROXO', 'roxo', 'ADJECTIVE', ['C_VAL_PURPLE']),
  LEX_REDONDO: lex('LEX_REDONDO', 'redondo', 'ADJECTIVE', ['C_VAL_ROUND']),

  // Numerais — ordinais
  LEX_ORD_1: lex('LEX_ORD_1', 'primeiro', 'NUMERAL', ['C_ORD_1']),
  LEX_ORD_2: lex('LEX_ORD_2', 'segundo', 'NUMERAL', ['C_ORD_2']),
  LEX_ORD_3: lex('LEX_ORD_3', 'terceiro', 'NUMERAL', ['C_ORD_3']),
  LEX_ORD_4: lex('LEX_ORD_4', 'quarto', 'NUMERAL', ['C_ORD_4']),
  LEX_ORD_5: lex('LEX_ORD_5', 'quinto', 'NUMERAL', ['C_ORD_5']),
  LEX_ORD_6: lex('LEX_ORD_6', 'sexto', 'NUMERAL', ['C_ORD_6']),
  LEX_ORD_7: lex('LEX_ORD_7', 'sétimo', 'NUMERAL', ['C_ORD_7']),
  LEX_ORD_8: lex('LEX_ORD_8', 'oitavo', 'NUMERAL', ['C_ORD_8']),
  LEX_ORD_9: lex('LEX_ORD_9', 'nono', 'NUMERAL', ['C_ORD_9']),
  LEX_ORD_10: lex('LEX_ORD_10', 'décimo', 'NUMERAL', ['C_ORD_10']),
  LEX_ORD_LAST: lex('LEX_ORD_LAST', 'último', 'NUMERAL', ['C_ORD_LAST']),
  LEX_ORD_PENULTIMATE: lex('LEX_ORD_PENULTIMATE', 'penúltimo', 'NUMERAL', ['C_ORD_PENULTIMATE']),

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
export function colorForms(id: string, stem: string, lexemeId: LexemeId): SurfaceForm[] {
  return [
    sf(`${id}_M_S`, `${stem}o`, lexemeId, 'CANONICAL', { gender: M, number: S }),
    sf(`${id}_F_S`, `${stem}a`, lexemeId, 'INFLECTION', { gender: F, number: S }),
    sf(`${id}_M_P`, `${stem}os`, lexemeId, 'INFLECTION', { gender: M, number: P }),
    sf(`${id}_F_P`, `${stem}as`, lexemeId, 'INFLECTION', { gender: F, number: P })
  ];
}

/** Gera as quatro flexões de um ordinal de duas terminações. */
function ordinalForms(id: string, stem: string, lexemeId: LexemeId): SurfaceForm[] {
  return [
    sf(`${id}_M_S`, `${stem}o`, lexemeId, 'CANONICAL', { gender: M, number: S }),
    sf(`${id}_F_S`, `${stem}a`, lexemeId, 'INFLECTION', { gender: F, number: S }),
    sf(`${id}_M_P`, `${stem}os`, lexemeId, 'INFLECTION', { gender: M, number: P }),
    sf(`${id}_F_P`, `${stem}as`, lexemeId, 'INFLECTION', { gender: F, number: P })
  ];
}

export const INITIAL_SURFACE_FORMS: SurfaceForm[] = [
  // --- Verbos (formas canônicas, infinitivas, imperativas e flexionadas) ------
  sf('SF_CRIAR', 'criar', 'LEX_CRIAR'),
  sf('SF_CRIE', 'crie', 'LEX_CRIAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_CRIA', 'cria', 'LEX_CRIAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_CRIEM', 'criem', 'LEX_CRIAR', 'INFLECTION', { mood: 'IMPERATIVE', number: P }),
  sf('SF_CRIOU', 'criou', 'LEX_CRIAR', 'INFLECTION'),

  sf('SF_ADICIONAR', 'adicionar', 'LEX_ADICIONAR'),
  sf('SF_ADICIONE', 'adicione', 'LEX_ADICIONAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_ADICIONA', 'adiciona', 'LEX_ADICIONAR', 'INFLECTION'),

  sf('SF_COLOCAR', 'colocar', 'LEX_COLOCAR'),
  sf('SF_COLOQUE', 'coloque', 'LEX_COLOCAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_COLOQUEM', 'coloquem', 'LEX_COLOCAR', 'INFLECTION', { mood: 'IMPERATIVE', number: P }),
  sf('SF_PONHA', 'ponha', 'LEX_COLOCAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_BOTAR', 'botar', 'LEX_BOTAR'),
  sf('SF_BOTE', 'bote', 'LEX_BOTAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_FAZER', 'fazer', 'LEX_FAZER'),
  sf('SF_FACA', 'faça', 'LEX_FAZER', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_FACA_ASCII', 'faca', 'LEX_FAZER', 'MISSPELLING', { mood: 'IMPERATIVE' }),

  sf('SF_INSERIR', 'inserir', 'LEX_INSERIR'),
  sf('SF_INSIRA', 'insira', 'LEX_INSERIR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_MUDAR', 'mudar', 'LEX_MUDAR'),
  sf('SF_MUDE', 'mude', 'LEX_MUDAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_MUDEM', 'mudem', 'LEX_MUDAR', 'INFLECTION', { mood: 'IMPERATIVE', number: P }),

  sf('SF_DEIXAR', 'deixar', 'LEX_DEIXAR'),
  sf('SF_DEIXE', 'deixe', 'LEX_DEIXAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_DEIXEM', 'deixem', 'LEX_DEIXAR', 'INFLECTION', { mood: 'IMPERATIVE', number: P }),

  sf('SF_ALTERAR', 'alterar', 'LEX_ALTERAR'),
  sf('SF_ALTERE', 'altere', 'LEX_ALTERAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_TROCAR', 'trocar', 'LEX_TROCAR'),
  sf('SF_TROQUE', 'troque', 'LEX_TROCAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_PINTAR', 'pintar', 'LEX_PINTAR'),
  sf('SF_PINTE', 'pinte', 'LEX_PINTAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_APAGAR', 'apagar', 'LEX_APAGAR'),
  sf('SF_APAGUE', 'apague', 'LEX_APAGAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_APAGA', 'apaga', 'LEX_APAGAR', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_APAGUEM', 'apaguem', 'LEX_APAGAR', 'INFLECTION', { mood: 'IMPERATIVE', number: P }),

  sf('SF_REMOVER', 'remover', 'LEX_REMOVER'),
  sf('SF_REMOVA', 'remova', 'LEX_REMOVER', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_REMOVE', 'remove', 'LEX_REMOVER', 'INFLECTION'),

  sf('SF_EXCLUIR', 'excluir', 'LEX_EXCLUIR'),
  sf('SF_EXCLUA', 'exclua', 'LEX_EXCLUIR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_DELETAR', 'deletar', 'LEX_DELETAR'),
  sf('SF_DELETE', 'delete', 'LEX_DELETAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_TIRAR', 'tirar', 'LEX_TIRAR'),
  sf('SF_TIRE', 'tire', 'LEX_TIRAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_MOVER', 'mover', 'LEX_MOVER'),
  sf('SF_MOVA', 'mova', 'LEX_MOVER', 'INFLECTION', { mood: 'IMPERATIVE' }),
  sf('SF_MOVE', 'move', 'LEX_MOVER', 'INFLECTION'),
  sf('SF_MOVAM', 'movam', 'LEX_MOVER', 'INFLECTION', { mood: 'IMPERATIVE', number: P }),

  sf('SF_SELECIONAR', 'selecionar', 'LEX_SELECIONAR'),
  sf('SF_SELECIONE', 'selecione', 'LEX_SELECIONAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  sf('SF_MARCAR', 'marcar', 'LEX_MARCAR'),
  sf('SF_MARQUE', 'marque', 'LEX_MARCAR', 'INFLECTION', { mood: 'IMPERATIVE' }),

  // --- Substantivos ----------------------------------------------------------
  sf('SF_BOTAO', 'botão', 'LEX_BOTAO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_BOTOES', 'botões', 'LEX_BOTAO', 'INFLECTION', { gender: M, number: P }),
  sf('SF_BOTAO_ASCII', 'botao', 'LEX_BOTAO', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_BOTOES_ASCII', 'botoes', 'LEX_BOTAO', 'COLLOQUIAL', { gender: M, number: P }),

  sf('SF_CAIXA', 'caixa', 'LEX_CAIXA', 'CANONICAL', { gender: F, number: S }),
  sf('SF_CAIXAS', 'caixas', 'LEX_CAIXA', 'INFLECTION', { gender: F, number: P }),

  sf('SF_CONTAINER', 'container', 'LEX_CONTAINER', 'CANONICAL', { gender: M, number: S }),
  sf('SF_CONTAINERS', 'containers', 'LEX_CONTAINER', 'INFLECTION', { gender: M, number: P }),

  sf('SF_TEXTO', 'texto', 'LEX_TEXTO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_TEXTOS', 'textos', 'LEX_TEXTO', 'INFLECTION', { gender: M, number: P }),
  // "texto" também nomeia a propriedade de conteúdo: a desambiguação é
  // estrutural (entidade corrente aceita conteúdo textual? então é propriedade).
  sf('SF_TEXTO_PROP', 'texto', 'LEX_CONTEUDO', 'CANONICAL', { gender: M, number: S }),

  // --- Propriedades ------------------------------------------------------------
  sf('SF_BORDA', 'borda', 'LEX_BORDA', 'CANONICAL', { gender: F, number: S }),
  sf('SF_BORDAS', 'bordas', 'LEX_BORDA', 'INFLECTION', { gender: F, number: P }),
  sf('SF_FUNDO', 'fundo', 'LEX_FUNDO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_ROTULO', 'rótulo', 'LEX_ROTULO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_ROTULO_ASCII', 'rotulo', 'LEX_ROTULO', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_CONTEUDO', 'conteúdo', 'LEX_CONTEUDO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_CONTEUDO_ASCII', 'conteudo', 'LEX_CONTEUDO', 'COLLOQUIAL', { gender: M, number: S }),

  // --- Cores (todas as flexões de gênero e número) -------------------------------
  // azul é invariante em gênero: apenas singular/plural.
  sf('SF_AZUL', 'azul', 'LEX_AZUL', 'CANONICAL', { number: S }),
  sf('SF_AZUIS', 'azuis', 'LEX_AZUL', 'INFLECTION', { number: P }),
  sf('SF_ASUL', 'asul', 'LEX_AZUL', 'MISSPELLING', { number: S }),

  ...colorForms('SF_VERMELHO', 'vermelh', 'LEX_VERMELHO'),
  ...colorForms('SF_AMARELO', 'amarel', 'LEX_AMARELO'),
  ...colorForms('SF_PRETO', 'pret', 'LEX_PRETO'),
  ...colorForms('SF_BRANCO', 'branc', 'LEX_BRANCO'),
  ...colorForms('SF_ROXO', 'rox', 'LEX_ROXO'),
  // verde, cinza e laranja são invariantes em gênero
  sf('SF_VERDE', 'verde', 'LEX_VERDE', 'CANONICAL', { number: S }),
  sf('SF_VERDES', 'verdes', 'LEX_VERDE', 'INFLECTION', { number: P }),
  sf('SF_CINZA', 'cinza', 'LEX_CINZA', 'CANONICAL', { number: S }),
  sf('SF_CINZAS', 'cinzas', 'LEX_CINZA', 'INFLECTION', { number: P }),
  sf('SF_LARANJA', 'laranja', 'LEX_LARANJA', 'CANONICAL', { number: S }),
  sf('SF_LARANJAS', 'laranjas', 'LEX_LARANJA', 'INFLECTION', { number: P }),

  ...colorForms('SF_REDONDO', 'redond', 'LEX_REDONDO'),

  // --- Ordinais --------------------------------------------------------------
  ...ordinalForms('SF_ORD_1', 'primeir', 'LEX_ORD_1'),
  ...ordinalForms('SF_ORD_2', 'segund', 'LEX_ORD_2'),
  ...ordinalForms('SF_ORD_3', 'terceir', 'LEX_ORD_3'),
  ...ordinalForms('SF_ORD_4', 'quart', 'LEX_ORD_4'),
  ...ordinalForms('SF_ORD_5', 'quint', 'LEX_ORD_5'),
  ...ordinalForms('SF_ORD_6', 'sext', 'LEX_ORD_6'),
  ...ordinalForms('SF_ORD_7', 'sétim', 'LEX_ORD_7'),
  sf('SF_ORD_7_ASCII', 'setim', 'LEX_ORD_7', 'MISSPELLING'),
  ...ordinalForms('SF_ORD_8', 'oitav', 'LEX_ORD_8'),
  ...ordinalForms('SF_ORD_9', 'non', 'LEX_ORD_9'),
  ...ordinalForms('SF_ORD_10', 'décim', 'LEX_ORD_10'),
  sf('SF_ORD_10_ASCII', 'decim', 'LEX_ORD_10', 'MISSPELLING'),
  ...ordinalForms('SF_ORD_LAST', 'últim', 'LEX_ORD_LAST'),
  sf('SF_ORD_LAST_ASCII_S', 'ultimo', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_ORD_LAST_ASCII_F', 'ultima', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: F, number: S }),
  sf('SF_ORD_LAST_ASCII_MP', 'ultimos', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: M, number: P }),
  sf('SF_ORD_LAST_ASCII_FP', 'ultimas', 'LEX_ORD_LAST', 'COLLOQUIAL', { gender: F, number: P }),
  ...ordinalForms('SF_ORD_PENULTIMATE', 'penúltim', 'LEX_ORD_PENULTIMATE'),
  sf('SF_ORD_PEN_ASCII_S', 'penultimo', 'LEX_ORD_PENULTIMATE', 'COLLOQUIAL', { gender: M, number: S }),
  sf('SF_ORD_PEN_ASCII_F', 'penultima', 'LEX_ORD_PENULTIMATE', 'COLLOQUIAL', { gender: F, number: S }),

  // --- Cardinais ----------------------------------------------------------------
  sf('SF_CARD_1_M', 'um', 'LEX_CARD_1', 'CANONICAL', { gender: M, number: S }),
  sf('SF_CARD_1_F', 'uma', 'LEX_CARD_1', 'INFLECTION', { gender: F, number: S }),
  sf('SF_CARD_2_M', 'dois', 'LEX_CARD_2', 'CANONICAL', { gender: M, number: P }),
  sf('SF_CARD_2_F', 'duas', 'LEX_CARD_2', 'INFLECTION', { gender: F, number: P }),
  sf('SF_CARD_3', 'três', 'LEX_CARD_3', 'CANONICAL'),
  sf('SF_CARD_3_ASCII', 'tres', 'LEX_CARD_3', 'COLLOQUIAL'),
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

  // --- Operadores e palavras gramaticais -----------------------------------------
  sf('SF_NAO', 'não', 'LEX_NAO'),
  sf('SF_NAO_ASCII', 'nao', 'LEX_NAO', 'COLLOQUIAL'),
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

  // --- Marcas espaciais ------------------------------------------------------------
  sf('SF_DENTRO', 'dentro', 'LEX_DENTRO'),
  sf('SF_DEPOIS', 'depois', 'LEX_DEPOIS'),
  sf('SF_ANTES', 'antes', 'LEX_ANTES'),
  sf('SF_LADO', 'lado', 'LEX_LADO', 'CANONICAL', { gender: M, number: S }),
  sf('SF_DIREITA', 'direita', 'LEX_DIREITA', 'CANONICAL', { gender: F, number: S }),
  sf('SF_ESQUERDA', 'esquerda', 'LEX_ESQUERDA', 'CANONICAL', { gender: F, number: S })
];

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
    surfaceForms: INITIAL_SURFACE_FORMS.map((s) => ({ ...s })),
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
  return {
    surfaceForms: kb.surfaceForms.map((s) => ({ ...s })),
    lexemes: Object.fromEntries(Object.entries(kb.lexemes).map(([id, l]) => [id, { ...l }])),
    concepts: structuredClone(kb.concepts),
    multiwords: kb.multiwords.map((m) => ({ ...m })),
    defaults: { ...kb.defaults }
  };
}
