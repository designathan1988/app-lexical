# Rede gerativa do português — dados, regras e aplicador de referência

Pesquisa e curadoria linguística para o compilador semântico determinístico de
`C:\Codex-Shared\Lexical`. **Nada aqui altera `src/`, `tests/` ou `audit/`** —
todo o material vive em `research/morfologia/`.

Objetivo de longo prazo: entender o português geral construindo uma **rede de
significado** a partir de **poucas raízes e muitos geradores**, sem importar
dicionários externos. Este pacote é a base: as regras de formação de palavras
(nos dois sentidos), um léxico-semente digitado à mão e conjuntos de teste com
a resposta correta.

## Como rodar

```bash
node research/morfologia/ref/validate.mjs
```

Imprime a acurácia por categoria, a lista de falhas e grava
`validation-report.txt`. Sai com código 1 se houver erro de esquema ou exemplo
de regra não reproduzido.

## O que foi produzido

| Arquivo | Conteúdo | Números |
|---|---|---|
| `semantic-types.json` | Tipos semânticos com hierarquia `is_a` + `domainMappings` do domínio atual | 40 tipos |
| `semantic-functions.json` | Funções de significado dos afixos/processos | 32 funções |
| `affix-rules.json` | Regras de formação nos dois sentidos | 48 regras, 284 exemplos, 100 contraexemplos, 56 fontes |
| `inflection-paradigms-proposed.json` | Paradigmas de flexão que faltavam, com tabela gold | 24 paradigmas |
| `irregular-verbs.json` | Conjugação completa dos irregulares + particípios abundantes | 31 verbos (47 células cada) + 6 séries de particípio |
| `seed-roots.json` | Léxico-semente digitado e curado | 1.160 entradas, 1.215 sentidos, 219 derivações atestadas, 10 lexicalizações |
| `frames.json` | Molduras de argumentos (estilo PropBank, conceito apenas) | 422 molduras (300 escritas à mão, 18 de controle) |
| `tests-derivation.json` | Casos de derivação (gold) fora da semente | 449 |
| `tests-inflection.json` | Casos de flexão (gold) | 258 |
| `tests-sentences.json` | Frases com UD + grafo de significado | 80 |
| `ref/apply.mjs` | Aplicador de referência (JS puro, sem dependências) | — |
| `ref/validate.mjs` | Verificador | — |
| `ref/build-irregular.mjs`, `ref/build-frames.mjs` | Geradores dos dois JSON derivados (proveniência) | — |

### Composição das 48 regras

| Processo | Quantas | Exemplos |
|---|---|---|
| SUFFIX | 24 | -dor, -nte, -ção, -mento, -vel, -mente, -idade, -eza, -ura, -oso, -eiro, -ista, -ismo, -izar, -ificar, -ecer, -al, -ico, -ês, -ense, -ada, -agem, -inho, -ão |
| PREFIX | 10 | re-, des-, in-, pré-, super-, sub-, inter-, anti-, auto-, contra- |
| PARASYNTHETIC | 6 | a-…-ecer, en-…-ecer, es-…-ecer, a-…-ar, en-…-ar, es-…-ar |
| REGRESSIVE | 3 | -a, -o, -e (pesca, choro, ataque) |
| CONVERSION | 3 | infinitivo→nome, adjetivo→nome, particípio→adjetivo |
| COMPOUND | 2 | justaposição (guarda-chuva), aglutinação (aguardente) |

### Léxico-semente

| Classe | Quantidade |
|---|---|
| verbos | 367 |
| substantivos | 407 |
| adjetivos | 154 |
| advérbios não derivados | 60 |
| determinantes | 22 |
| pronomes | 31 |
| preposições (incl. contrações) | 44 |
| conjunções | 27 |
| numerais (cardinais até mil, ordinais até décimo) | 48 |

Todas as raízes obrigatórias do contrato estão presentes (tomar, beber, comer,
querer, poder, precisar, gostar, ir, vir, fazer, ter, ser, estar, dar, ver,
dizer, café, água, casa, pessoa, tempo, dia). As classes fechadas trazem, em
`closedClassJustifications`, a justificativa curta de cada grupo.

## Acurácia do verificador

Números gerados por `ref/validate.mjs` (não digitados):

| Categoria | Acurácia |
|---|---|
| Esquema e referências cruzadas | **0 erros** (2 avisos justificados) |
| Exemplos de regra reproduzidos por `generate` | **100,0% (284/284)** |
| Derivação — multinível | 100,0% (87/87) |
| Derivação — sufixo | 100,0% (161/161) |
| Derivação — parassíntese | 100,0% (32/32) |
| Derivação — regressiva | 100,0% (22/22) |
| Derivação — conversão | 100,0% (26/26) |
| Derivação — justaposição | 100,0% (20/20) |
| Derivação — aglutinação | 100,0% (5/5) |
| Derivação — negativos (bloqueio/inexistência) | 100,0% (76/76) |
| Derivação — lexicalizados | 100,0% (20/20) |
| **Derivação — TOTAL** | **100,0% (449/449)** |
| **Flexão — TOTAL** | **100,0% (258/258)** |

## Decisões linguísticas

### Alternâncias

- **`-ção` × `-mento`** (Basílio; artigo da Alfa citado nas fontes): o português
  reparte o trabalho — `-ção` prefere radicais latinos e verbos de tema `a`/`i`
  (`criar → criação`, `produzir → produção`), `-mento` prefere verbos de tema
  `e` (`vencer → vencimento`) e radicais populares (`casar → casamento`). As
  duas regras convivem e o bloqueio decide os casos em disputa.
- **`-dor` com alomorfia de classe**: `-ador` (AR), `-edor` (ER), `-idor` (IR),
  com `correr → corredor` (raiz terminada em `rr`). O radical é sempre o verbal,
  mesmo quando a estratégia declarada é outra (`falar → falante`, não
  `falaante`) — o gerador usa `VERB_ROOT` para toda regra de classe verbal.
- **`-nte`**: o IR licencia `-inte` e `-ente` (`ouvir → ouvinte`,
  `assistir → assistente`); geram-se as duas formas e a análise confere.
- **`-vel`**: o particípio é o radical (`comer → comível`, `vencer → vencível`);
  radicais latinos entram como pares declarados (`ver → visível`,
  `reverter → reversível`, `destruir → destrutível`).
- **Prefixos preservam a classe**: `nacional` (ADJ) → `internacional` (ADJ) →
  `internacionalizar` (V). Sem isso, a análise de `internacionalização`
  escolheria a ordem errada (`inter-` colado a um nome já formado).
- **`anti-`, `des-`, `in-`**: `anti + social → antissocial` (o encontro dobra o
  `s`); `des + escrever → descrever` (elide o `e-` da base); `in + estável →
  instável` e `in + móvel → imóvel` (pares declarados).

### Bloqueios

O bloqueio (Aronoff) é dado, não código: cada contraexemplo declara
`wouldBe` e o motivo. Motivos usados: `BLOCKED_BY:<forma existente>`,
`SEMANTIC_RESTRICTION`, `NOT_ATTESTED`. Casos:

- `casar` bloqueia `casação` (existe `casamento`); `trabalhar` bloqueia
  `trabalhamento` (existe `trabalho`); `morar` bloqueia `moramento` (existe
  `moradia`); `fazer` bloqueia `fazimento` (existe `feitura`).
- `triste` bloqueia `tristidade` (existe `tristeza`); `alto` bloqueia `altidade`
  (existe `altura`); `belo` bloqueia `belidade` (existe `beleza`).
- `poder` bloqueia `podível` (existe `possível`); `bom` bloqueia `imbom`
  (existe `mau`); `belo` bloqueia `belificar` (existe `embelezar`).
- `Brasil` bloqueia `brasilês` e `brasiles` (existe `brasileiro`); `São Paulo`
  bloqueia `sãopaulense` (existe `paulista`).
- Restrição semântica: `morrer`/`estar` não geram agente (`morredor`,
  `estador`); `dez`/`de` não geram aumentativo.

Os 76 negativos do conjunto de teste cobrem `HYPOTHESIS_BLOCKED` (o bloqueio
dispara) e `NOT_A_WORD`. **Nenhum esperado foi afrouxado para passar**: as
correções de esperado estão registradas em `CHANGES.md` com justificativa.

### Casos discutíveis, resolvidos por princípio explícito

- **Ordem de aplicação.** `reorganização` tem duas leituras formais:
  `re + organização` e `reorganizar + ção`. O analisador exige **coerência de
  classe ao longo da cadeia** (um prefixo verbal não recebe um nome) e prefere a
  cadeia cujas **formas intermediárias são palavras reais** — `antissocialismo`
  é `anti + socialismo`, não `antissocial + ismo`. Isso resolve toda a família
  `des-/re-/in-/inter-/anti-/auto-/super-` sem lista de exceções.
- **Palavra atestada como base.** `reescrita` e `despedida` são analisadas em
  relação a `reescrever`/`despedir`. Quando a forma é **lexicalizada**
  (`despedir`, `descrever`), a semântica para na palavra
  (`ACTION_OF(despedir)`), porque o sentido não é composicional; quando é
  composicional (`reescrever`), a cadeia desce até a raiz
  (`RESULT_OF(REPETITION(escrever))`).
- **Duas leituras licenciadas.** Uma regra com `alsoPossible` produz a leitura
  principal e as alternativas; `informação` é `RESULT_OF(informar)` ao lado de
  `ACTION_OF(informar)`. O analisador devolve as duas em vez de escolher uma.
- **Homografia deverbal.** `pago` é particípio de `pagar` (não regressivo); o
  analisador prefere `CONV_PART_ADJ` quando a forma é um particípio real, e
  `REG_O`/`REG_A` quando não é (`gasto`, `erro`, `grito`).
- **Compostos.** A regra de flexão do composto está declarada na própria regra:
  verbo+substantivo e substantivo+substantivo determinativo flexionam só o
  segundo elemento (`guarda-chuvas`, `couves-flores`); substantivo+substantivo
  sem determinação flexionam ambos (`porcos-espinhos`).
- **Aglutinações são lexicalizadas**: `aguardente`, `planalto`, `pernalta`,
  `embora`, `fidalgo` estão listadas — a regra não é produtiva.

## Lacunas conhecidas e incertezas

Ver `KNOWN_GAPS.md` (honesto e detalhado). Em resumo: 122 molduras estruturais
pendentes de curadoria, 3 coleções latinas não escritas, concordância de
compostos não implementada no verificador, cobertura de alomorfia latina
limitada aos pares declarados, entradas com `confidence: MEDIUM`.

## Bibliografia efetivamente consultada

### `verified: true` — nenhuma

Nesta sessão não houve acesso a texto de obra; **nenhuma referência foi
verificada página a página**. Todos os fatos linguísticos vêm do conhecimento
padrão do português brasileiro e foram conferidos contra os próprios dados
(exemplos, contraexemplos e testes). Nenhuma referência foi inventada.

### `verified: false` — citadas como referência conceitual (56 fontes)

- Cunha & Cintra, *Nova Gramática do Português Contemporâneo* — plural, sufixos
  agentivos, diminutivos/aumentativos, gentílicos, prefixos, composição.
- Bechara, *Moderna Gramática Portuguesa* — -ura, -ismo, -ecer, -agem, -mente,
  prefixos, substantivação do infinitivo, particípio adjetivado.
- Basílio, *Teoria Lexical* e *Formação e Classes de Palavras no Português do
  Brasil* — -dor, -ção, -izar, des-, re-, super-, -ico, parassíntese, derivação
  regressiva, bloqueio.
- Rocha, *Estruturas Morfológicas do Português* — -nte, -eza/-ez, -ificar.
- Sandmann, *Formação de Palavras no Português Brasileiro Contemporâneo* —
  -oso, -ada, auto-, composição.
- Villalva, *Morfologia do Português* — referência geral de morfologia.
- Alfa (UNESP), artigo sobre -ção × -mento
  (https://periodicos.fclar.unesp.br/alfa/article/download/3837/3544/9435) —
  divisão de trabalho entre os dois sufixos.
- Aronoff, *Word Formation in Generative Grammar*
  (https://mitwpl.mit.edu/catalog/aron01/) — conceito de bloqueio, usado como
  fundamento dos `counterExamples`.
- Koskenniemi, *Two-Level Morphology*
  (https://researchportal.helsinki.fi/en/publications/two-level-morphology-a-general-computational-model-for-word-form-/) —
  modelo de regras bidirecionais, que inspira `ref/apply.mjs`.

As três URLs foram fornecidas no prompt; **o conteúdo não foi lido nesta
sessão** — estão marcadas `verified: false` e a nota de cada fonte diz isso.

## Método

1. Testes escritos **antes** das regras e commitados antes delas (commit
   `41cf51f`).
2. Regras e léxico produzidos depois, cada etapa commitada.
3. Aplicador e verificador por último; correções feitas nas **regras**
   (não nos testes) até o máximo possível.
4. As poucas correções de esperado estão em `CHANGES.md`, cada uma com o motivo
   linguístico; as falhas não resolvidas estão em `KNOWN_GAPS.md`.
