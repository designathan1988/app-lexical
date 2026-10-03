// Gera irregular-verbs.json a partir de uma especificação compacta por verbo:
// pres/past/imp/impv/subj = 6/6/6/5/6 formas; futStem/cndStem = radical do
// futuro/condicional; part = [mascSing, femSing, mascPlur, femPlur].
// Rode com: node research/morfologia/ref/build-irregular.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const P = ['Sing', 'Plur'];
const N = ['Sing', 'Plur'];

const fin = (person, number, mood, tense) => ({
  Number: number, Person: person, Mood: mood, VerbForm: 'Fin', Tense: tense
});

const SPEC = [
  { id: 'V_HAVER', lemma: 'haver', ger: 'havendo', part: ['havido', 'havida', 'havidos', 'havidas'],
    pres: ['hei', 'hás', 'há', 'havemos', 'haveis', 'hão'],
    past: ['houve', 'houveste', 'houve', 'houvemos', 'houvestes', 'houveram'],
    imp: ['havia', 'havias', 'havia', 'havíamos', 'havíeis', 'haviam'],
    futStem: 'haver',
    impv: ['há', 'haja', 'hajamos', 'havei', 'hajam'],
    subj: ['haja', 'hajas', 'haja', 'hajamos', 'hajais', 'hajam'] },
  { id: 'V_VIR', lemma: 'vir', ger: 'vindo', part: ['vindo', 'vinda', 'vindos', 'vindas'],
    pres: ['venho', 'vens', 'vem', 'vimos', 'vindes', 'vêm'],
    past: ['vim', 'vieste', 'veio', 'viemos', 'viestes', 'vieram'],
    imp: ['vinha', 'vinhas', 'vinha', 'vínhamos', 'vínheis', 'vinham'],
    futStem: 'vir',
    impv: ['vem', 'venha', 'venhamos', 'vinde', 'venham'],
    subj: ['venha', 'venhas', 'venha', 'venhamos', 'venhais', 'venham'] },
  { id: 'V_DIZER', lemma: 'dizer', ger: 'dizendo', part: ['dito', 'dita', 'ditos', 'ditas'],
    pres: ['digo', 'dizes', 'diz', 'dizemos', 'dizeis', 'dizem'],
    past: ['disse', 'disseste', 'disse', 'dissemos', 'dissestes', 'disseram'],
    imp: ['dizia', 'dizias', 'dizia', 'dizíamos', 'dizíeis', 'diziam'],
    futStem: 'dir',
    impv: ['dize', 'diga', 'digamos', 'dizei', 'digam'],
    subj: ['diga', 'digas', 'diga', 'digamos', 'digais', 'digam'] },
  { id: 'V_SABER', lemma: 'saber', ger: 'sabendo', part: ['sabido', 'sabida', 'sabidos', 'sabidas'],
    pres: ['sei', 'sabes', 'sabe', 'sabemos', 'sabeis', 'sabem'],
    past: ['soube', 'soubeste', 'soube', 'soubemos', 'soubestes', 'souberam'],
    imp: ['sabia', 'sabias', 'sabia', 'sabíamos', 'sabíeis', 'sabiam'],
    futStem: 'saber',
    impv: ['sabe', 'saiba', 'saibamos', 'sabei', 'saibam'],
    subj: ['saiba', 'saibas', 'saiba', 'saibamos', 'saibais', 'saibam'] },
  { id: 'V_VER', lemma: 'ver', ger: 'vendo', part: ['visto', 'vista', 'vistos', 'vistas'],
    pres: ['vejo', 'vês', 'vê', 'vemos', 'vedes', 'veem'],
    past: ['vi', 'viste', 'viu', 'vimos', 'vistes', 'viram'],
    imp: ['via', 'vias', 'via', 'víamos', 'víeis', 'viam'],
    futStem: 'ver',
    impv: ['vê', 'veja', 'vejamos', 'vede', 'vejam'],
    subj: ['veja', 'vejas', 'veja', 'vejamos', 'vejais', 'vejam'] },
  { id: 'V_DAR', lemma: 'dar', ger: 'dando', part: ['dado', 'dada', 'dados', 'dadas'],
    pres: ['dou', 'dás', 'dá', 'damos', 'dais', 'dão'],
    past: ['dei', 'deste', 'deu', 'demos', 'destes', 'deram'],
    imp: ['dava', 'davas', 'dava', 'dávamos', 'dáveis', 'davam'],
    futStem: 'dar',
    impv: ['dá', 'dê', 'demos', 'dai', 'deem'],
    subj: ['dê', 'dês', 'dê', 'demos', 'deis', 'deem'] },
  { id: 'V_LER', lemma: 'ler', ger: 'lendo', part: ['lido', 'lida', 'lidos', 'lidas'],
    pres: ['leio', 'lês', 'lê', 'lemos', 'ledes', 'leem'],
    past: ['li', 'leste', 'leu', 'lemos', 'lestes', 'leram'],
    imp: ['lia', 'lias', 'lia', 'líamos', 'líeis', 'liam'],
    futStem: 'ler',
    impv: ['lê', 'leia', 'leiamos', 'lede', 'leiam'],
    subj: ['leia', 'leias', 'leia', 'leiamos', 'leiais', 'leiam'] },
  { id: 'V_CRER', lemma: 'crer', ger: 'crendo', part: ['crido', 'crida', 'cridos', 'cridas'],
    pres: ['creio', 'crês', 'crê', 'cremos', 'credes', 'creem'],
    past: ['cri', 'creste', 'creu', 'cremos', 'crestes', 'creram'],
    imp: ['cria', 'crias', 'cria', 'críamos', 'críeis', 'criam'],
    futStem: 'crer',
    impv: ['crê', 'creia', 'creiamos', 'crede', 'creiam'],
    subj: ['creia', 'creias', 'creia', 'creiamos', 'creiais', 'creiam'] },
  { id: 'V_OUVIR', lemma: 'ouvir', ger: 'ouvindo', part: ['ouvido', 'ouvida', 'ouvidos', 'ouvidas'],
    pres: ['ouço', 'ouves', 'ouve', 'ouvimos', 'ouvis', 'ouvem'],
    past: ['ouvi', 'ouviste', 'ouviu', 'ouvimos', 'ouvistes', 'ouviram'],
    imp: ['ouvia', 'ouvias', 'ouvia', 'ouvíamos', 'ouvíeis', 'ouviam'],
    futStem: 'ouvir',
    impv: ['ouve', 'ouça', 'ouçamos', 'ouvi', 'ouçam'],
    subj: ['ouça', 'ouças', 'ouça', 'ouçamos', 'ouçais', 'ouçam'] },
  { id: 'V_PEDIR', lemma: 'pedir', ger: 'pedindo', part: ['pedido', 'pedida', 'pedidos', 'pedidas'],
    pres: ['peço', 'pedes', 'pede', 'pedimos', 'pedis', 'pedem'],
    past: ['pedi', 'pediste', 'pediu', 'pedimos', 'pedistes', 'pediram'],
    imp: ['pedia', 'pedias', 'pedia', 'pedíamos', 'pedíeis', 'pediam'],
    futStem: 'pedir',
    impv: ['pede', 'peça', 'peçamos', 'pedi', 'peçam'],
    subj: ['peça', 'peças', 'peça', 'peçamos', 'peçais', 'peçam'] },
  { id: 'V_MEDIR', lemma: 'medir', ger: 'medindo', part: ['medido', 'medida', 'medidos', 'medidas'],
    pres: ['meço', 'medes', 'mede', 'medimos', 'medis', 'medem'],
    past: ['medi', 'mediste', 'mediu', 'medimos', 'medistes', 'mediram'],
    imp: ['media', 'medias', 'media', 'medíamos', 'medíeis', 'mediam'],
    futStem: 'medir',
    impv: ['mede', 'meça', 'meçamos', 'medi', 'meçam'],
    subj: ['meça', 'meças', 'meça', 'meçamos', 'meçais', 'meçam'] },
  { id: 'V_DORMIR', lemma: 'dormir', ger: 'dormindo', part: ['dormido', 'dormida', 'dormidos', 'dormidas'],
    pres: ['durmo', 'dormes', 'dorme', 'dormimos', 'dormis', 'dormem'],
    past: ['dormi', 'dormiste', 'dormiu', 'dormimos', 'dormistes', 'dormiram'],
    imp: ['dormia', 'dormias', 'dormia', 'dormíamos', 'dormíeis', 'dormiam'],
    futStem: 'dormir',
    impv: ['dorme', 'durma', 'durmamos', 'dormi', 'durmam'],
    subj: ['durma', 'durmas', 'durma', 'durmamos', 'durmais', 'durmam'] },
  { id: 'V_SAIR', lemma: 'sair', ger: 'saindo', part: ['saído', 'saída', 'saídos', 'saídas'],
    pres: ['saio', 'sais', 'sai', 'saímos', 'saís', 'saem'],
    past: ['saí', 'saíste', 'saiu', 'saímos', 'saístes', 'saíram'],
    imp: ['saía', 'saías', 'saía', 'saíamos', 'saíeis', 'saíam'],
    futStem: 'sair',
    impv: ['sai', 'saia', 'saiamos', 'saí', 'saiam'],
    subj: ['saia', 'saias', 'saia', 'saiamos', 'saiais', 'saiam'] },
  { id: 'V_CAIR', lemma: 'cair', ger: 'caindo', part: ['caído', 'caída', 'caídos', 'caídas'],
    pres: ['caio', 'cais', 'cai', 'caímos', 'caís', 'caem'],
    past: ['caí', 'caíste', 'caiu', 'caímos', 'caístes', 'caíram'],
    imp: ['caía', 'caías', 'caía', 'caíamos', 'caíeis', 'caíam'],
    futStem: 'cair',
    impv: ['cai', 'caia', 'caiamos', 'caí', 'caiam'],
    subj: ['caia', 'caias', 'caia', 'caiamos', 'caiais', 'caiam'] },
  { id: 'V_CABER', lemma: 'caber', ger: 'cabendo', part: ['cabido', 'cabida', 'cabidos', 'cabidas'],
    pres: ['caibo', 'cabes', 'cabe', 'cabemos', 'cabeis', 'cabem'],
    past: ['coube', 'coubeste', 'coube', 'coubemos', 'coubestes', 'couberam'],
    imp: ['cabia', 'cabias', 'cabia', 'cabíamos', 'cabíeis', 'cabiam'],
    futStem: 'caber',
    impv: ['cabe', 'caiba', 'caibamos', 'cabei', 'caibam'],
    subj: ['caiba', 'caibas', 'caiba', 'caibamos', 'caibais', 'caibam'] },
  { id: 'V_VALER', lemma: 'valer', ger: 'valendo', part: ['valido', 'valida', 'validos', 'validas'],
    pres: ['valho', 'vales', 'vale', 'valemos', 'valeis', 'valem'],
    past: ['vali', 'valeste', 'valeu', 'valemos', 'valestes', 'valeram'],
    imp: ['valia', 'valias', 'valia', 'valíamos', 'valíeis', 'valiam'],
    futStem: 'valer',
    impv: ['vale', 'valha', 'valhamos', 'valei', 'valham'],
    subj: ['valha', 'valhas', 'valha', 'valhamos', 'valhais', 'valham'] },
  { id: 'V_PERDER', lemma: 'perder', ger: 'perdendo', part: ['perdido', 'perdida', 'perdidos', 'perdidas'],
    pres: ['perco', 'perdes', 'perde', 'perdemos', 'perdeis', 'perdem'],
    past: ['perdi', 'perdeste', 'perdeu', 'perdemos', 'perdestes', 'perderam'],
    imp: ['perdia', 'perdias', 'perdia', 'perdíamos', 'perdíeis', 'perdiam'],
    futStem: 'perder',
    impv: ['perde', 'perca', 'percamos', 'perdei', 'percam'],
    subj: ['perca', 'percas', 'perca', 'percamos', 'percais', 'percam'] },
  { id: 'V_SEGUIR', lemma: 'seguir', ger: 'seguindo', part: ['seguido', 'seguida', 'seguidos', 'seguidas'],
    pres: ['sigo', 'segues', 'segue', 'seguimos', 'seguis', 'seguem'],
    past: ['segui', 'seguiste', 'seguiu', 'seguimos', 'seguistes', 'seguiram'],
    imp: ['seguia', 'seguias', 'seguia', 'seguíamos', 'seguíeis', 'seguiam'],
    futStem: 'seguir',
    impv: ['segue', 'siga', 'sigamos', 'segui', 'sigam'],
    subj: ['siga', 'sigas', 'siga', 'sigamos', 'sigais', 'sigam'] },
  { id: 'V_SENTIR', lemma: 'sentir', ger: 'sentindo', part: ['sentido', 'sentida', 'sentidos', 'sentidas'],
    pres: ['sinto', 'sentes', 'sente', 'sentimos', 'sentis', 'sentem'],
    past: ['senti', 'sentiste', 'sentiu', 'sentimos', 'sentistes', 'sentiram'],
    imp: ['sentia', 'sentias', 'sentia', 'sentíamos', 'sentíeis', 'sentiam'],
    futStem: 'sentir',
    impv: ['sente', 'sinta', 'sintamos', 'senti', 'sintam'],
    subj: ['sinta', 'sintas', 'sinta', 'sintamos', 'sintais', 'sintam'] },
  { id: 'V_SERVIR', lemma: 'servir', ger: 'servindo', part: ['servido', 'servida', 'servidos', 'servidas'],
    pres: ['sirvo', 'serves', 'serve', 'servimos', 'servis', 'servem'],
    past: ['servi', 'serviste', 'serviu', 'servimos', 'servistes', 'serviram'],
    imp: ['servia', 'servias', 'servia', 'servíamos', 'servíeis', 'serviam'],
    futStem: 'servir',
    impv: ['serve', 'sirva', 'sirvamos', 'servi', 'sirvam'],
    subj: ['sirva', 'sirvas', 'sirva', 'sirvamos', 'sirvais', 'sirvam'] },
  { id: 'V_SUBIR', lemma: 'subir', ger: 'subindo', part: ['subido', 'subida', 'subidos', 'subidas'],
    pres: ['subo', 'sobes', 'sobe', 'subimos', 'subis', 'sobem'],
    past: ['subi', 'subiste', 'subiu', 'subimos', 'subistes', 'subiram'],
    imp: ['subia', 'subias', 'subia', 'subíamos', 'subíeis', 'subiam'],
    futStem: 'subir',
    impv: ['sobe', 'suba', 'subamos', 'subi', 'subam'],
    subj: ['suba', 'subas', 'suba', 'subamos', 'subais', 'subam'] },
  { id: 'V_FUGIR', lemma: 'fugir', ger: 'fugindo', part: ['fugido', 'fugida', 'fugidos', 'fugidas'],
    pres: ['fujo', 'foges', 'foge', 'fugimos', 'fugis', 'fogem'],
    past: ['fugi', 'fugiste', 'fugiu', 'fugimos', 'fugistes', 'fugiram'],
    imp: ['fugia', 'fugias', 'fugia', 'fugíamos', 'fugíeis', 'fugiam'],
    futStem: 'fugir',
    impv: ['foge', 'fuja', 'fujamos', 'fugi', 'fujam'],
    subj: ['fuja', 'fujas', 'fuja', 'fujamos', 'fujais', 'fujam'] },
  { id: 'V_RIR', lemma: 'rir', ger: 'rindo', part: ['rido', 'rida', 'ridos', 'ridas'],
    pres: ['rio', 'ris', 'ri', 'rimos', 'rides', 'riem'],
    past: ['ri', 'riste', 'riu', 'rimos', 'ristes', 'riram'],
    imp: ['ria', 'rias', 'ria', 'ríamos', 'ríeis', 'riam'],
    futStem: 'rir',
    impv: ['ri', 'ria', 'riamos', 'ride', 'riam'],
    subj: ['ria', 'rias', 'ria', 'riamos', 'riais', 'riam'] },
  { id: 'V_CONSTRUIR', lemma: 'construir', ger: 'construindo', part: ['construído', 'construída', 'construídos', 'construídas'],
    pres: ['construo', 'construis', 'constrói', 'construímos', 'construís', 'constroem'],
    past: ['construí', 'construíste', 'construiu', 'construímos', 'construístes', 'construíram'],
    imp: ['construía', 'construías', 'construía', 'construíamos', 'construíeis', 'construíam'],
    futStem: 'construir',
    impv: ['constrói', 'construa', 'construamos', 'construí', 'construam'],
    subj: ['construa', 'construas', 'construa', 'construamos', 'construais', 'construam'] },
  { id: 'V_DESTRUIR', lemma: 'destruir', ger: 'destruindo', part: ['destruído', 'destruída', 'destruídos', 'destruídas'],
    pres: ['destruo', 'destruis', 'destrói', 'destruímos', 'destruís', 'destroem'],
    past: ['destruí', 'destruíste', 'destruiu', 'destruímos', 'destruístes', 'destruíram'],
    imp: ['destruía', 'destruías', 'destruía', 'destruíamos', 'destruíeis', 'destruíam'],
    futStem: 'destruir',
    impv: ['destrói', 'destrua', 'destruamos', 'destruí', 'destruam'],
    subj: ['destrua', 'destruas', 'destrua', 'destruamos', 'destruais', 'destruam'] },
  { id: 'V_CONSEGUIR', lemma: 'conseguir', ger: 'conseguindo', part: ['conseguido', 'conseguida', 'conseguidos', 'conseguidas'],
    pres: ['consigo', 'consegues', 'consegue', 'conseguimos', 'conseguis', 'conseguem'],
    past: ['consegui', 'conseguiste', 'conseguiu', 'conseguimos', 'conseguistes', 'conseguiram'],
    imp: ['conseguia', 'conseguias', 'conseguia', 'conseguíamos', 'conseguíeis', 'conseguiam'],
    futStem: 'conseguir',
    impv: ['consegue', 'consiga', 'consigamos', 'consegui', 'consigam'],
    subj: ['consiga', 'consigas', 'consiga', 'consigamos', 'consigais', 'consigam'] },
  { id: 'V_PREFERIR', lemma: 'preferir', ger: 'preferindo', part: ['preferido', 'preferida', 'preferidos', 'preferidas'],
    pres: ['prefiro', 'preferes', 'prefere', 'preferimos', 'preferis', 'preferem'],
    past: ['preferi', 'preferiste', 'preferiu', 'preferimos', 'preferistes', 'preferiram'],
    imp: ['preferia', 'preferias', 'preferia', 'preferíamos', 'preferíeis', 'preferiam'],
    futStem: 'preferir',
    impv: ['prefere', 'prefira', 'prefiramos', 'preferi', 'prefiram'],
    subj: ['prefira', 'prefiras', 'prefira', 'prefiramos', 'prefirais', 'prefiram'] },
  { id: 'V_MENTIR', lemma: 'mentir', ger: 'mentindo', part: ['mentido', 'mentida', 'mentidos', 'mentidas'],
    pres: ['minto', 'mentes', 'mente', 'mentimos', 'mentis', 'mentem'],
    past: ['menti', 'mentiste', 'mentiu', 'mentimos', 'mentistes', 'mentiram'],
    imp: ['mentia', 'mentias', 'mentia', 'mentíamos', 'mentíeis', 'mentiam'],
    futStem: 'mentir',
    impv: ['mente', 'minta', 'mintamos', 'menti', 'mintam'],
    subj: ['minta', 'mintas', 'minta', 'mintamos', 'mintais', 'mintam'] },
  { id: 'V_COBRIR', lemma: 'cobrir', ger: 'cobrindo', part: ['coberto', 'coberta', 'cobertos', 'cobertas'],
    pres: ['cubro', 'cobres', 'cobre', 'cobrimos', 'cobris', 'cobrem'],
    past: ['cobri', 'cobriste', 'cobriu', 'cobrimos', 'cobristes', 'cobriram'],
    imp: ['cobria', 'cobrias', 'cobria', 'cobríamos', 'cobríeis', 'cobriam'],
    futStem: 'cobrir',
    impv: ['cobre', 'cubra', 'cubramos', 'cobri', 'cubram'],
    subj: ['cubra', 'cubras', 'cubra', 'cubramos', 'cubrais', 'cubram'] },
  { id: 'V_DESCOBRIR', lemma: 'descobrir', ger: 'descobrindo', part: ['descoberto', 'descoberta', 'descobertos', 'descobertas'],
    pres: ['descubro', 'descobres', 'descobre', 'descobrimos', 'descobris', 'descobrem'],
    past: ['descobri', 'descobriste', 'descobriu', 'descobrimos', 'descobristes', 'descobriram'],
    imp: ['descobria', 'descobrias', 'descobria', 'descobríamos', 'descobríeis', 'descobriam'],
    futStem: 'descobrir',
    impv: ['descobre', 'descubra', 'descubramos', 'descobri', 'descubram'],
    subj: ['descubra', 'descubras', 'descubra', 'descubramos', 'descubrais', 'descubram'] },
  { id: 'V_ABRIR', lemma: 'abrir', ger: 'abrindo', part: ['aberto', 'aberta', 'abertos', 'abertas'],
    pres: ['abro', 'abres', 'abre', 'abrimos', 'abris', 'abrem'],
    past: ['abri', 'abriste', 'abriu', 'abrimos', 'abristes', 'abriram'],
    imp: ['abria', 'abrias', 'abria', 'abríamos', 'abríeis', 'abriam'],
    futStem: 'abrir',
    impv: ['abre', 'abra', 'abramos', 'abri', 'abram'],
    subj: ['abra', 'abras', 'abra', 'abramos', 'abrais', 'abram'] }
];

const PERSONS = [[1, 'Sing'], [2, 'Sing'], [3, 'Sing'], [1, 'Plur'], [2, 'Plur'], [3, 'Plur']];
const IMP_PERSONS = [[2, 'Sing'], [3, 'Sing'], [1, 'Plur'], [2, 'Plur'], [3, 'Plur']];
const FUT = ['ei', 'ás', 'á', 'emos', 'eis', 'ão'];
const CND = ['ia', 'ias', 'ia', 'íamos', 'íeis', 'iam'];
const PART_KEYS = [
  { Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' },
  { Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' },
  { Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' },
  { Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }
];

function key(feats) {
  const order = ['Gender', 'Number', 'Person', 'Mood', 'VerbForm', 'Tense', 'Degree'];
  return order.filter((k) => feats[k] !== undefined).map((k) => `${k}=${feats[k]}`).join('|');
}

const verbs = SPEC.map((v) => {
  const forms = {};
  forms[key({ VerbForm: 'Inf' })] = v.lemma;
  forms[key({ VerbForm: 'Ger' })] = v.ger;
  PART_KEYS.forEach((feats, i) => { forms[key(feats)] = v.part[i]; });
  PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Ind', 'Pres'))] = v.pres[i]; });
  PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Ind', 'Past'))] = v.past[i]; });
  PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Ind', 'Imp'))] = v.imp[i]; });
  PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Ind', 'Fut'))] = v.futStem + FUT[i]; });
  PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Cnd', 'Fut'))] = v.futStem + CND[i]; });
  IMP_PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Imp', undefined))] = v.impv[i]; });
  PERSONS.forEach(([p, n], i) => { forms[key(fin(p, n, 'Sub', 'Pres'))] = v.subj[i]; });
  return { id: v.id, lemma: v.lemma, pos: 'VERB', fullForm: true, forms };
});

// Particípios de verbos já existentes no projeto (V_FAZER, V_POR) e abundantes
// (pagar, aceitar, entregar) + escrever (escrito). Só as células de particípio;
// a conjugação completa desses verbos vive em src/knowledge/paradigms.ts.
const supplementaryParticiples = [
  { id: 'V_FAZER', lemma: 'fazer', note: 'já existe no projeto; aqui só o particípio irregular', variants: {
    'Gender=Masc|Number=Sing|VerbForm=Part': ['feito'],
    'Gender=Fem|Number=Sing|VerbForm=Part': ['feita'],
    'Gender=Masc|Number=Plur|VerbForm=Part': ['feitos'],
    'Gender=Fem|Number=Plur|VerbForm=Part': ['feitas'] } },
  { id: 'V_POR', lemma: 'pôr', note: 'já existe no projeto; aqui só o particípio irregular', variants: {
    'Gender=Masc|Number=Sing|VerbForm=Part': ['posto'],
    'Gender=Fem|Number=Sing|VerbForm=Part': ['posta'],
    'Gender=Masc|Number=Plur|VerbForm=Part': ['postos'],
    'Gender=Fem|Number=Plur|VerbForm=Part': ['postas'] } },
  { id: 'V_ESCREVER_IRR', lemma: 'escrever', note: 'particípio irregular (escrito)', variants: {
    'Gender=Masc|Number=Sing|VerbForm=Part': ['escrito'],
    'Gender=Fem|Number=Sing|VerbForm=Part': ['escrita'],
    'Gender=Masc|Number=Plur|VerbForm=Part': ['escritos'],
    'Gender=Fem|Number=Plur|VerbForm=Part': ['escritas'] } },
  { id: 'V_PAGAR_IRR', lemma: 'pagar', note: 'particípio abundante (pago/pagado)', variants: {
    'Gender=Masc|Number=Sing|VerbForm=Part': ['pago', 'pagado'],
    'Gender=Fem|Number=Sing|VerbForm=Part': ['paga', 'pagada'],
    'Gender=Masc|Number=Plur|VerbForm=Part': ['pagos', 'pagados'],
    'Gender=Fem|Number=Plur|VerbForm=Part': ['pagas', 'pagadas'] } },
  { id: 'V_ACEITAR_IRR', lemma: 'aceitar', note: 'particípio abundante (aceito/aceitado)', variants: {
    'Gender=Masc|Number=Sing|VerbForm=Part': ['aceito', 'aceitado'],
    'Gender=Fem|Number=Sing|VerbForm=Part': ['aceita', 'aceitada'],
    'Gender=Masc|Number=Plur|VerbForm=Part': ['aceitos', 'aceitados'],
    'Gender=Fem|Number=Plur|VerbForm=Part': ['aceitas', 'aceitadas'] } },
  { id: 'V_ENTREGAR_IRR', lemma: 'entregar', note: 'particípio abundante (entregue/entregado)', variants: {
    'Gender=Masc|Number=Sing|VerbForm=Part': ['entregue', 'entregado'],
    'Gender=Fem|Number=Sing|VerbForm=Part': ['entregue', 'entregada'],
    'Gender=Masc|Number=Plur|VerbForm=Part': ['entregues', 'entregados'],
    'Gender=Fem|Number=Plur|VerbForm=Part': ['entregues', 'entregadas'] } }
];

const out = {
  version: '1.0.0',
  schemaVersion: '1.0.0',
  description: 'Conjugação completa dos verbos irregulares mais usados que ainda não existem no projeto, em formato de chave de traços canônica (featureKey → forma). supplementaryParticiples cobre particípios irregulares e abundantes de verbos já existentes no projeto (feito, posto, escrito, pago/pagado, aceito/aceitado, entregue/entregado) e também entram no índice de flexão.',
  verbs,
  supplementaryParticiples
};

writeFileSync(join(HERE, '..', 'irregular-verbs.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`irregular-verbs.json gerado: ${verbs.length} verbos completos (${verbs[0] ? Object.keys(verbs[0].forms).length : 0} células cada) + ${supplementaryParticiples.length} particípios suplementares`);
