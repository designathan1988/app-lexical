import { describe, it, expect } from 'vitest';
import { PARADIGMS, generateForms, generateDiminutives } from '../src/knowledge/paradigms';

/**
 * F2.3 — Tabelas golden escritas à mão ANTES do gerador.
 *
 * Cada tabela lista, para um lema, TODAS as formas que o paradigma deve
 * gerar e os traços de cada uma, na chave canônica (ordem fixa:
 * Gender, Number, Person, Mood, VerbForm, Tense, Degree).
 *
 * As tabelas foram escritas por raciocínio linguístico (gramática do
 * português), não a partir da saída do gerador. O gerador precisa
 * reproduzi-las exatamente — nem forma a menos, nem a mais.
 */

type Row = [surface: string, feats: string];

const N = { Sing: 'Sing', Plur: 'Plur' } as const;
const P = { 1: '1', 2: '2', 3: '3' } as const;

// --- feixes por tempo/modo (chaves canônicas) ------------------------------
const ind = (person: string, number: string, tense: string) =>
  `Number=${number}|Person=${person}|Mood=Ind|VerbForm=Fin|Tense=${tense}`;
const sub = (person: string, number: string) =>
  `Number=${number}|Person=${person}|Mood=Sub|VerbForm=Fin|Tense=Pres`;
const impv = (person: string, number: string) =>
  `Number=${number}|Person=${person}|Mood=Imp|VerbForm=Fin`;
const cnd = (person: string, number: string) =>
  `Number=${number}|Person=${person}|Mood=Cnd|VerbForm=Fin|Tense=Fut`;
const part = (gender: string, number: string) => `Gender=${gender}|Number=${number}|VerbForm=Part`;
const INF = 'VerbForm=Inf';
const GER = 'VerbForm=Ger';

// --- paradigmas regulares: células iguais, sufixos diferentes --------------

/** -ar: PRES/PRF/IMP/FUT/CND/SUBJ/IMPV + infinitivo/gerúndio/particípio. */
const cellsAR = (stem: string): Row[] => [
  [`${stem}ar`, INF],
  [`${stem}ando`, GER],
  [`${stem}ado`, part('Masc', 'Sing')],
  [`${stem}ada`, part('Fem', 'Sing')],
  [`${stem}ados`, part('Masc', 'Plur')],
  [`${stem}adas`, part('Fem', 'Plur')],
  [`${stem}o`, ind(P[1], N.Sing, 'Pres')],
  [`${stem}as`, ind(P[2], N.Sing, 'Pres')],
  [`${stem}a`, ind(P[3], N.Sing, 'Pres')],
  [`${stem}amos`, ind(P[1], N.Plur, 'Pres')],
  [`${stem}ais`, ind(P[2], N.Plur, 'Pres')],
  [`${stem}am`, ind(P[3], N.Plur, 'Pres')],
  [`${stem}ei`, ind(P[1], N.Sing, 'Past')],
  [`${stem}aste`, ind(P[2], N.Sing, 'Past')],
  [`${stem}ou`, ind(P[3], N.Sing, 'Past')],
  [`${stem}amos`, ind(P[1], N.Plur, 'Past')],
  [`${stem}astes`, ind(P[2], N.Plur, 'Past')],
  [`${stem}aram`, ind(P[3], N.Plur, 'Past')],
  [`${stem}ava`, ind(P[1], N.Sing, 'Imp')],
  [`${stem}avas`, ind(P[2], N.Sing, 'Imp')],
  [`${stem}ava`, ind(P[3], N.Sing, 'Imp')],
  [`${stem}ávamos`, ind(P[1], N.Plur, 'Imp')],
  [`${stem}áveis`, ind(P[2], N.Plur, 'Imp')],
  [`${stem}avam`, ind(P[3], N.Plur, 'Imp')],
  [`${stem}arei`, ind(P[1], N.Sing, 'Fut')],
  [`${stem}arás`, ind(P[2], N.Sing, 'Fut')],
  [`${stem}ará`, ind(P[3], N.Sing, 'Fut')],
  [`${stem}aremos`, ind(P[1], N.Plur, 'Fut')],
  [`${stem}areis`, ind(P[2], N.Plur, 'Fut')],
  [`${stem}arão`, ind(P[3], N.Plur, 'Fut')],
  [`${stem}aria`, cnd(P[1], N.Sing)],
  [`${stem}arias`, cnd(P[2], N.Sing)],
  [`${stem}aria`, cnd(P[3], N.Sing)],
  [`${stem}aríamos`, cnd(P[1], N.Plur)],
  [`${stem}aríeis`, cnd(P[2], N.Plur)],
  [`${stem}ariam`, cnd(P[3], N.Plur)],
  [`${stem}e`, sub(P[1], N.Sing)],
  [`${stem}es`, sub(P[2], N.Sing)],
  [`${stem}e`, sub(P[3], N.Sing)],
  [`${stem}emos`, sub(P[1], N.Plur)],
  [`${stem}eis`, sub(P[2], N.Plur)],
  [`${stem}em`, sub(P[3], N.Plur)],
  [`${stem}a`, impv(P[2], N.Sing)],
  [`${stem}e`, impv(P[3], N.Sing)],
  [`${stem}emos`, impv(P[1], N.Plur)],
  [`${stem}ai`, impv(P[2], N.Plur)],
  [`${stem}em`, impv(P[3], N.Plur)]
];

/** -er (mover): sufixos do paradigma de 2ª conjugação. */
const cellsER = (stem: string): Row[] => [
  [`${stem}er`, INF],
  [`${stem}endo`, GER],
  [`${stem}ido`, part('Masc', 'Sing')],
  [`${stem}ida`, part('Fem', 'Sing')],
  [`${stem}idos`, part('Masc', 'Plur')],
  [`${stem}idas`, part('Fem', 'Plur')],
  [`${stem}o`, ind(P[1], N.Sing, 'Pres')],
  [`${stem}es`, ind(P[2], N.Sing, 'Pres')],
  [`${stem}e`, ind(P[3], N.Sing, 'Pres')],
  [`${stem}emos`, ind(P[1], N.Plur, 'Pres')],
  [`${stem}eis`, ind(P[2], N.Plur, 'Pres')],
  [`${stem}em`, ind(P[3], N.Plur, 'Pres')],
  [`${stem}i`, ind(P[1], N.Sing, 'Past')],
  [`${stem}este`, ind(P[2], N.Sing, 'Past')],
  [`${stem}eu`, ind(P[3], N.Sing, 'Past')],
  [`${stem}emos`, ind(P[1], N.Plur, 'Past')],
  [`${stem}estes`, ind(P[2], N.Plur, 'Past')],
  [`${stem}eram`, ind(P[3], N.Plur, 'Past')],
  [`${stem}ia`, ind(P[1], N.Sing, 'Imp')],
  [`${stem}ias`, ind(P[2], N.Sing, 'Imp')],
  [`${stem}ia`, ind(P[3], N.Sing, 'Imp')],
  [`${stem}íamos`, ind(P[1], N.Plur, 'Imp')],
  [`${stem}íeis`, ind(P[2], N.Plur, 'Imp')],
  [`${stem}iam`, ind(P[3], N.Plur, 'Imp')],
  [`${stem}erei`, ind(P[1], N.Sing, 'Fut')],
  [`${stem}erás`, ind(P[2], N.Sing, 'Fut')],
  [`${stem}erá`, ind(P[3], N.Sing, 'Fut')],
  [`${stem}eremos`, ind(P[1], N.Plur, 'Fut')],
  [`${stem}ereis`, ind(P[2], N.Plur, 'Fut')],
  [`${stem}erão`, ind(P[3], N.Plur, 'Fut')],
  [`${stem}eria`, cnd(P[1], N.Sing)],
  [`${stem}erias`, cnd(P[2], N.Sing)],
  [`${stem}eria`, cnd(P[3], N.Sing)],
  [`${stem}eríamos`, cnd(P[1], N.Plur)],
  [`${stem}eríeis`, cnd(P[2], N.Plur)],
  [`${stem}eriam`, cnd(P[3], N.Plur)],
  [`${stem}a`, sub(P[1], N.Sing)],
  [`${stem}as`, sub(P[2], N.Sing)],
  [`${stem}a`, sub(P[3], N.Sing)],
  [`${stem}amos`, sub(P[1], N.Plur)],
  [`${stem}ais`, sub(P[2], N.Plur)],
  [`${stem}am`, sub(P[3], N.Plur)],
  [`${stem}e`, impv(P[2], N.Sing)],
  [`${stem}a`, impv(P[3], N.Sing)],
  [`${stem}amos`, impv(P[1], N.Plur)],
  [`${stem}ei`, impv(P[2], N.Plur)],
  [`${stem}am`, impv(P[3], N.Plur)]
];

// ---------------------------------------------------------------------------
// Tabelas golden
// ---------------------------------------------------------------------------

const GOLDEN: Array<{ lexemeId: string; lemma: string; paradigmId: string; rows: Row[] }> = [
  {
    lexemeId: 'LEX_CRIAR',
    lemma: 'criar',
    paradigmId: 'V_AR',
    rows: cellsAR('cri')
  },
  {
    // g → gu antes de e: apaguei, apague, apaguemos…
    lexemeId: 'LEX_APAGAR',
    lemma: 'apagar',
    paradigmId: 'V_AR_GAR',
    rows: [
      ['apagar', INF],
      ['apagando', GER],
      ['apagado', part('Masc', 'Sing')],
      ['apagada', part('Fem', 'Sing')],
      ['apagados', part('Masc', 'Plur')],
      ['apagadas', part('Fem', 'Plur')],
      ['apago', ind(P[1], N.Sing, 'Pres')],
      ['apagas', ind(P[2], N.Sing, 'Pres')],
      ['apaga', ind(P[3], N.Sing, 'Pres')],
      ['apagamos', ind(P[1], N.Plur, 'Pres')],
      ['apagais', ind(P[2], N.Plur, 'Pres')],
      ['apagam', ind(P[3], N.Plur, 'Pres')],
      ['apaguei', ind(P[1], N.Sing, 'Past')],
      ['apagaste', ind(P[2], N.Sing, 'Past')],
      ['apagou', ind(P[3], N.Sing, 'Past')],
      ['apagamos', ind(P[1], N.Plur, 'Past')],
      ['apagastes', ind(P[2], N.Plur, 'Past')],
      ['apagaram', ind(P[3], N.Plur, 'Past')],
      ['apagava', ind(P[1], N.Sing, 'Imp')],
      ['apagavas', ind(P[2], N.Sing, 'Imp')],
      ['apagava', ind(P[3], N.Sing, 'Imp')],
      ['apagávamos', ind(P[1], N.Plur, 'Imp')],
      ['apagáveis', ind(P[2], N.Plur, 'Imp')],
      ['apagavam', ind(P[3], N.Plur, 'Imp')],
      ['apagarei', ind(P[1], N.Sing, 'Fut')],
      ['apagarás', ind(P[2], N.Sing, 'Fut')],
      ['apagará', ind(P[3], N.Sing, 'Fut')],
      ['apagaremos', ind(P[1], N.Plur, 'Fut')],
      ['apagareis', ind(P[2], N.Plur, 'Fut')],
      ['apagarão', ind(P[3], N.Plur, 'Fut')],
      ['apagaria', cnd(P[1], N.Sing)],
      ['apagarias', cnd(P[2], N.Sing)],
      ['apagaria', cnd(P[3], N.Sing)],
      ['apagaríamos', cnd(P[1], N.Plur)],
      ['apagaríeis', cnd(P[2], N.Plur)],
      ['apagariam', cnd(P[3], N.Plur)],
      ['apague', sub(P[1], N.Sing)],
      ['apagues', sub(P[2], N.Sing)],
      ['apague', sub(P[3], N.Sing)],
      ['apaguemos', sub(P[1], N.Plur)],
      ['apagueis', sub(P[2], N.Plur)],
      ['apaguem', sub(P[3], N.Plur)],
      ['apaga', impv(P[2], N.Sing)],
      ['apague', impv(P[3], N.Sing)],
      ['apaguemos', impv(P[1], N.Plur)],
      ['apagai', impv(P[2], N.Plur)],
      ['apaguem', impv(P[3], N.Plur)]
    ]
  },
  {
    // c → qu antes de e: coloquei, coloque, coloquemos…
    lexemeId: 'LEX_COLOCAR',
    lemma: 'colocar',
    paradigmId: 'V_AR_CAR',
    rows: [
      ['colocar', INF],
      ['colocando', GER],
      ['colocado', part('Masc', 'Sing')],
      ['colocada', part('Fem', 'Sing')],
      ['colocados', part('Masc', 'Plur')],
      ['colocadas', part('Fem', 'Plur')],
      ['coloco', ind(P[1], N.Sing, 'Pres')],
      ['colocas', ind(P[2], N.Sing, 'Pres')],
      ['coloca', ind(P[3], N.Sing, 'Pres')],
      ['colocamos', ind(P[1], N.Plur, 'Pres')],
      ['colocais', ind(P[2], N.Plur, 'Pres')],
      ['colocam', ind(P[3], N.Plur, 'Pres')],
      ['coloquei', ind(P[1], N.Sing, 'Past')],
      ['colocaste', ind(P[2], N.Sing, 'Past')],
      ['colocou', ind(P[3], N.Sing, 'Past')],
      ['colocamos', ind(P[1], N.Plur, 'Past')],
      ['colocastes', ind(P[2], N.Plur, 'Past')],
      ['colocaram', ind(P[3], N.Plur, 'Past')],
      ['colocava', ind(P[1], N.Sing, 'Imp')],
      ['colocavas', ind(P[2], N.Sing, 'Imp')],
      ['colocava', ind(P[3], N.Sing, 'Imp')],
      ['colocávamos', ind(P[1], N.Plur, 'Imp')],
      ['colocáveis', ind(P[2], N.Plur, 'Imp')],
      ['colocavam', ind(P[3], N.Plur, 'Imp')],
      ['colocarei', ind(P[1], N.Sing, 'Fut')],
      ['colocarás', ind(P[2], N.Sing, 'Fut')],
      ['colocará', ind(P[3], N.Sing, 'Fut')],
      ['colocaremos', ind(P[1], N.Plur, 'Fut')],
      ['colocareis', ind(P[2], N.Plur, 'Fut')],
      ['colocarão', ind(P[3], N.Plur, 'Fut')],
      ['colocaria', cnd(P[1], N.Sing)],
      ['colocarias', cnd(P[2], N.Sing)],
      ['colocaria', cnd(P[3], N.Sing)],
      ['colocaríamos', cnd(P[1], N.Plur)],
      ['colocaríeis', cnd(P[2], N.Plur)],
      ['colocariam', cnd(P[3], N.Plur)],
      ['coloque', sub(P[1], N.Sing)],
      ['coloques', sub(P[2], N.Sing)],
      ['coloque', sub(P[3], N.Sing)],
      ['coloquemos', sub(P[1], N.Plur)],
      ['coloqueis', sub(P[2], N.Plur)],
      ['coloquem', sub(P[3], N.Plur)],
      ['coloca', impv(P[2], N.Sing)],
      ['coloque', impv(P[3], N.Sing)],
      ['coloquemos', impv(P[1], N.Plur)],
      ['colocai', impv(P[2], N.Plur)],
      ['coloquem', impv(P[3], N.Plur)]
    ]
  },
  { lexemeId: 'LEX_MOVER', lemma: 'mover', paradigmId: 'V_ER', rows: cellsER('mov') },
  { lexemeId: 'LEX_MUDAR', lemma: 'mudar', paradigmId: 'V_AR', rows: cellsAR('mud') },
  { lexemeId: 'LEX_DEIXAR', lemma: 'deixar', paradigmId: 'V_AR', rows: cellsAR('deix') }
];

// Irregular: fazer
const FAZER_ROWS: Row[] = [
  ['fazer', INF],
  ['fazendo', GER],
  ['feito', part('Masc', 'Sing')],
  ['feita', part('Fem', 'Sing')],
  ['feitos', part('Masc', 'Plur')],
  ['feitas', part('Fem', 'Plur')],
  ['faço', ind(P[1], N.Sing, 'Pres')],
  ['fazes', ind(P[2], N.Sing, 'Pres')],
  ['faz', ind(P[3], N.Sing, 'Pres')],
  ['fazemos', ind(P[1], N.Plur, 'Pres')],
  ['fazeis', ind(P[2], N.Plur, 'Pres')],
  ['fazem', ind(P[3], N.Plur, 'Pres')],
  ['fiz', ind(P[1], N.Sing, 'Past')],
  ['fizeste', ind(P[2], N.Sing, 'Past')],
  ['fez', ind(P[3], N.Sing, 'Past')],
  ['fizemos', ind(P[1], N.Plur, 'Past')],
  ['fizestes', ind(P[2], N.Plur, 'Past')],
  ['fizeram', ind(P[3], N.Plur, 'Past')],
  ['fazia', ind(P[1], N.Sing, 'Imp')],
  ['fazias', ind(P[2], N.Sing, 'Imp')],
  ['fazia', ind(P[3], N.Sing, 'Imp')],
  ['fazíamos', ind(P[1], N.Plur, 'Imp')],
  ['fazíeis', ind(P[2], N.Plur, 'Imp')],
  ['faziam', ind(P[3], N.Plur, 'Imp')],
  ['farei', ind(P[1], N.Sing, 'Fut')],
  ['farás', ind(P[2], N.Sing, 'Fut')],
  ['fará', ind(P[3], N.Sing, 'Fut')],
  ['faremos', ind(P[1], N.Plur, 'Fut')],
  ['fareis', ind(P[2], N.Plur, 'Fut')],
  ['farão', ind(P[3], N.Plur, 'Fut')],
  ['faria', cnd(P[1], N.Sing)],
  ['farias', cnd(P[2], N.Sing)],
  ['faria', cnd(P[3], N.Sing)],
  ['faríamos', cnd(P[1], N.Plur)],
  ['faríeis', cnd(P[2], N.Plur)],
  ['fariam', cnd(P[3], N.Plur)],
  ['faça', sub(P[1], N.Sing)],
  ['faças', sub(P[2], N.Sing)],
  ['faça', sub(P[3], N.Sing)],
  ['façamos', sub(P[1], N.Plur)],
  ['façais', sub(P[2], N.Plur)],
  ['façam', sub(P[3], N.Plur)],
  ['faze', impv(P[2], N.Sing)],
  ['faça', impv(P[3], N.Sing)],
  ['façamos', impv(P[1], N.Plur)],
  ['fazei', impv(P[2], N.Plur)],
  ['façam', impv(P[3], N.Plur)]
];

const POR_ROWS: Row[] = [
  ['pôr', INF],
  ['pondo', GER],
  ['posto', part('Masc', 'Sing')],
  ['posta', part('Fem', 'Sing')],
  ['postos', part('Masc', 'Plur')],
  ['postas', part('Fem', 'Plur')],
  ['ponho', ind(P[1], N.Sing, 'Pres')],
  ['pões', ind(P[2], N.Sing, 'Pres')],
  ['põe', ind(P[3], N.Sing, 'Pres')],
  ['pomos', ind(P[1], N.Plur, 'Pres')],
  ['pondes', ind(P[2], N.Plur, 'Pres')],
  ['põem', ind(P[3], N.Plur, 'Pres')],
  ['pus', ind(P[1], N.Sing, 'Past')],
  ['puseste', ind(P[2], N.Sing, 'Past')],
  ['pôs', ind(P[3], N.Sing, 'Past')],
  ['pusemos', ind(P[1], N.Plur, 'Past')],
  ['pusestes', ind(P[2], N.Plur, 'Past')],
  ['puseram', ind(P[3], N.Plur, 'Past')],
  ['punha', ind(P[1], N.Sing, 'Imp')],
  ['punhas', ind(P[2], N.Sing, 'Imp')],
  ['punha', ind(P[3], N.Sing, 'Imp')],
  ['púnhamos', ind(P[1], N.Plur, 'Imp')],
  ['púnheis', ind(P[2], N.Plur, 'Imp')],
  ['punham', ind(P[3], N.Plur, 'Imp')],
  ['porei', ind(P[1], N.Sing, 'Fut')],
  ['porás', ind(P[2], N.Sing, 'Fut')],
  ['porá', ind(P[3], N.Sing, 'Fut')],
  ['poremos', ind(P[1], N.Plur, 'Fut')],
  ['poreis', ind(P[2], N.Plur, 'Fut')],
  ['porão', ind(P[3], N.Plur, 'Fut')],
  ['poria', cnd(P[1], N.Sing)],
  ['porias', cnd(P[2], N.Sing)],
  ['poria', cnd(P[3], N.Sing)],
  ['poríamos', cnd(P[1], N.Plur)],
  ['poríeis', cnd(P[2], N.Plur)],
  ['poriam', cnd(P[3], N.Plur)],
  ['ponha', sub(P[1], N.Sing)],
  ['ponhas', sub(P[2], N.Sing)],
  ['ponha', sub(P[3], N.Sing)],
  ['ponhamos', sub(P[1], N.Plur)],
  ['ponhais', sub(P[2], N.Plur)],
  ['ponham', sub(P[3], N.Plur)],
  ['põe', impv(P[2], N.Sing)],
  ['ponha', impv(P[3], N.Sing)],
  ['ponhamos', impv(P[1], N.Plur)],
  ['ponde', impv(P[2], N.Plur)],
  ['ponham', impv(P[3], N.Plur)]
];

const BOTAO_ROWS: Row[] = [
  ['botão', 'Gender=Masc|Number=Sing'],
  ['botões', 'Gender=Masc|Number=Plur']
];

const CAIXA_ROWS: Row[] = [
  ['caixa', 'Gender=Fem|Number=Sing'],
  ['caixas', 'Gender=Fem|Number=Plur']
];

const AZUL_ROWS: Row[] = [['azul', 'Number=Sing'], ['azuis', 'Number=Plur']];

const PRETO_ROWS: Row[] = [
  ['preto', 'Gender=Masc|Number=Sing'],
  ['preta', 'Gender=Fem|Number=Sing'],
  ['pretos', 'Gender=Masc|Number=Plur'],
  ['pretas', 'Gender=Fem|Number=Plur']
];

const VERMELHO_ROWS: Row[] = [
  ['vermelho', 'Gender=Masc|Number=Sing'],
  ['vermelha', 'Gender=Fem|Number=Sing'],
  ['vermelhos', 'Gender=Masc|Number=Plur'],
  ['vermelhas', 'Gender=Fem|Number=Plur']
];

function normalize(rows: Row[]): string[] {
  return rows.map(([s, f]) => `${s}\t${f}`).sort();
}

describe('F2.3 — tabelas golden dos paradigmas', () => {
  it('gera exatamente as tabelas escritas à mão (verbos regulares)', () => {
    for (const { lexemeId, lemma, paradigmId, rows } of GOLDEN) {
      const paradigm = PARADIGMS[paradigmId];
      expect(paradigm, `paradigma ${paradigmId} ausente`).toBeDefined();
      const generated = generateForms(lexemeId, lemma, paradigm).map(
        (f) => [f.surface, f.featureKey] as Row
      );
      expect(normalize(generated), `tabela de ${lemma}`).toEqual(normalize(rows));
    }
  });

  it('fazer: paradigma irregular completo', () => {
    const generated = generateForms('LEX_FAZER', 'fazer', PARADIGMS['V_FAZER']).map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(generated)).toEqual(normalize(FAZER_ROWS));
  });

  it('pôr: paradigma irregular completo', () => {
    const generated = generateForms('LEX_POR', 'pôr', PARADIGMS['V_POR']).map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(generated)).toEqual(normalize(POR_ROWS));
  });

  it('botão: -ão → -ões', () => {
    const generated = generateForms('LEX_BOTAO', 'botão', PARADIGMS['N_AO_OES'], {
      inherent: { Gender: 'Masc' }
    }).map((f) => [f.surface, f.featureKey] as Row);
    expect(normalize(generated)).toEqual(normalize(BOTAO_ROWS));
  });

  it('caixa: +s', () => {
    const generated = generateForms('LEX_CAIXA', 'caixa', PARADIGMS['N_S'], {
      inherent: { Gender: 'Fem' }
    }).map((f) => [f.surface, f.featureKey] as Row);
    expect(normalize(generated)).toEqual(normalize(CAIXA_ROWS));
  });

  it('azul: uniforme em gênero, -l → -is', () => {
    const generated = generateForms('LEX_AZUL', 'azul', PARADIGMS['ADJ_L']).map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(generated)).toEqual(normalize(AZUL_ROWS));
  });

  it('preto: -o/-a/-os/-as', () => {
    const generated = generateForms('LEX_PRETO', 'preto', PARADIGMS['ADJ_O']).map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(generated)).toEqual(normalize(PRETO_ROWS));
  });

  it('vermelho: -o/-a/-os/-as', () => {
    const generated = generateForms('LEX_VERMELHO', 'vermelho', PARADIGMS['ADJ_O']).map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(generated)).toEqual(normalize(VERMELHO_ROWS));
  });
});

describe('F2.1 — derivação de diminutivo', () => {
  it('botão → botãozinho/botõezinhos (mesmo lexema, Degree=Dim)', () => {
    const sing = generateDiminutives('botão', 'Masc', 'Sing').map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(sing)).toEqual(
      normalize([['botãozinho', 'Gender=Masc|Number=Sing|Degree=Dim']])
    );
    const plur = generateDiminutives('botão', 'Masc', 'Plur').map(
      (f) => [f.surface, f.featureKey] as Row
    );
    expect(normalize(plur)).toEqual(
      normalize([['botõezinhos', 'Gender=Masc|Number=Plur|Degree=Dim']])
    );
  });

  it('caixa → caixinha/caixinhas', () => {
    const rows = [
      ...generateDiminutives('caixa', 'Fem', 'Sing'),
      ...generateDiminutives('caixa', 'Fem', 'Plur')
    ].map((f) => [f.surface, f.featureKey] as Row);
    expect(normalize(rows)).toEqual(
      normalize([
        ['caixinha', 'Gender=Fem|Number=Sing|Degree=Dim'],
        ['caixinhas', 'Gender=Fem|Number=Plur|Degree=Dim']
      ])
    );
  });

  it('preto/preto feminino e plural: pretinho, pretinha, pretinhos, pretinhas', () => {
    const rows = [
      ...generateDiminutives('preto', 'Masc', 'Sing'),
      ...generateDiminutives('preto', 'Fem', 'Sing'),
      ...generateDiminutives('preto', 'Masc', 'Plur'),
      ...generateDiminutives('preto', 'Fem', 'Plur')
    ].map((f) => [f.surface, f.featureKey] as Row);
    expect(normalize(rows)).toEqual(
      normalize([
        ['pretinho', 'Gender=Masc|Number=Sing|Degree=Dim'],
        ['pretinha', 'Gender=Fem|Number=Sing|Degree=Dim'],
        ['pretinhos', 'Gender=Masc|Number=Plur|Degree=Dim'],
        ['pretinhas', 'Gender=Fem|Number=Plur|Degree=Dim']
      ])
    );
  });
});
