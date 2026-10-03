# PROMPT — Análise geral de frases do português: classes, sintaxe, sujeito/predicado e grafo de significado

## Papel

Você é o **engenheiro de implementação**. Vai implementar, no motor deste projeto, a **análise geral de frases do português do Brasil**:

`frase → tokens → lema + classe + traços → árvore de dependências (UD) → sujeito/predicado → grafo de significado (estilo AMR)`

Tudo **determinístico**, por **regras e dados**, sem aprendizado de máquina e sem dicionários externos.

**Projeto:** `C:\Codex-Shared\Lexical`.
- Stack: TypeScript, React, Vite e Vitest.
- O projeto é um compilador semântico de comandos em português para um construtor de páginas (ex.: "crie uma caixa azul com um botão dentro").
- O léxico é **lema + paradigma**: as flexões são geradas, não cadastradas.
- Já existe um **analisador derivacional** geral (retomável = re- + tomar + -vel).

**Objetivo de longo prazo do dono do projeto:** o sistema entender o **português geral**, montando uma **rede de significado** a partir de **poucas raízes e muitos geradores**, **sem importar dicionários**.

**Exemplo que ele quer ver funcionando, no painel:**

> **Eu quero tomar café.**
> - Classes: eu = pronome, quero = verbo (querer, 1ª sg., presente), tomar = verbo (infinitivo), café = substantivo.
> - Sujeito: **eu**. Predicado: **quero tomar café**.
> - Grafo: `(querer.DESEJAR :ARG0 eu :ARG1 (tomar.INGERIR :ARG0 eu :ARG1 café))`. O "eu" de tomar vem do **controle** do verbo querer.

Escreva **todo** texto voltado ao usuário (relatórios, mensagens da interface, comentários, commits) **em português do Brasil**.

---

## 0. Regras invioláveis

1. **Pesquise antes de implementar.** Para cada etapa, leia a documentação oficial abaixo e anote no relatório final o que usou e onde (com o link). Não improvise formalismo.
   - **Universal Dependencies (UD)**:
     - classes (UPOS): https://universaldependencies.org/u/pos/index.html
     - traços: https://universaldependencies.org/u/feat/index.html
     - relações: https://universaldependencies.org/u/dep/index.html
     - formato CoNLL-U: https://universaldependencies.org/format.html
     - páginas do português: https://universaldependencies.org/pt/index.html
     - treebanks de referência (só leia as decisões de anotação, como cópula, contrações e clíticos): https://universaldependencies.org/treebanks/pt_bosque e https://universaldependencies.org/treebanks/pt_pud
   - **Constraint Grammar** (desambiguação de classe por regras SELECT/REMOVE em contexto; é o formalismo de origem do Bosque):
     - manual: https://edu.visl.dk/cg3/chunked/
     - tutorial: https://edu.visl.dk/cg3_howto.pdf
   - **AMR**:
     - diretrizes: https://github.com/amrisi/amr-guidelines/blob/master/amr.md
     - adaptação ao português (AMR-PT): https://aclanthology.org/W19-4028/
   - **Smatch** (comparação de grafos AMR por triplas, com mapeamento de variáveis): https://pypi.org/project/smatch/1.0.2 e https://amrlib.readthedocs.io/en/latest/evaluation/
   - **Papéis semânticos em português**, como referência conceitual (**não importe dados**):
     - PropBank-Br: https://aclanthology.org/L12-1114/
     - VerbNet.Br.
2. **Nenhum dicionário, treebank ou base lexical externa entra em `src/`.** Você pode **ler** o Bosque, o PUD e o PropBank-Br para entender as convenções, mas nenhuma palavra, árvore ou moldura deles é copiada para os dados. Os dados do motor são os do projeto (seção 1) mais o que você **digitar e justificar**.
3. **Generalize por regra, nunca por frase.**
   - Proibido condicionar código a frases do gabarito, a lemas específicos ou a palavras literais.
   - Toda palavra da língua usada nas regras vem de **JSON de dados**: classes fechadas, contrações, regras de desambiguação, papéis de preposição.
   - O código TypeScript só conhece **categorias**: UPOS, traços, relações, tipos semânticos, propriedades de moldura.
   - **Haverá um conjunto de verificação oculto**: frases novas, escritas depois da sua entrega, que você não verá. Regra feita sob medida para o gabarito vai falhar nele.
   - Lição do trabalho anterior: o aplicador do DeepSeek dava 100% no gabarito e falhava em palavras novas, porque reconhecia **pares declarados**. Não repita isso.
4. **Testes primeiro, sempre.**
   - Em cada fase, o primeiro commit é `TEST-EXPECTATION: ...`, só com os testes novos falhando; depois vêm os commits de código.
   - **Nunca afrouxe um teste** nem um limiar já existente.
   - Alterar uma expectativa antiga só com justificativa em `research/morfologia/CHANGES.md`, citando a diretriz UD/AMR e em commit separado `GOLD-FIX: ...`, **antes** do código que dele depende. No máximo 10% do gabarito pode ser alterado; cada alteração será revisada.
5. **Nada quebra.**
   - A suíte atual (**413 testes, 30 arquivos**) continua 100% verde em **todo** commit (`npm test`).
   - `npx tsc --noEmit` e `npm run build` limpos.
   - O comportamento dos **comandos do construtor** (o `DomainParser`) **não muda**, exceto o item da Fase 1.3, que tem teste próprio.
6. **Determinismo.**
   - Sem `Math.random`, `eval` nem `new Function` (o `tests/architecture.test.ts` já verifica).
   - Sem rede em tempo de execução e sem dependência nova de runtime.
   - Mesma entrada → mesma saída, mesma ordem.
7. **Rastreabilidade.** Toda decisão (classe escolhida, arco criado, sentido escolhido, papel atribuído) registra **qual regra** decidiu, com o **id da regra** no trace. Isso aparece no inspetor.
8. **Honestidade nos números.** O relatório final traz a saída real dos testes, os números reais e a **lista de falhas**. Nunca declare "100%" ou "pronto" sem a saída que prove.
9. **Git.**
   - Crie a branch `codex/sintaxe-significado` a partir do último commit de `claude/morfologia-integrada` (que já contém este prompt).
   - Faça um commit por etapa; não use `--amend`, `rebase` nem `push --force`.
   - Nesta máquina o git pode exigir `git -c safe.directory=C:/Codex-Shared/Lexical ...`. Se ele pedir identidade, use a mesma dos commits existentes (`git log -1 --format="%an <%ae>"`).

---

## 1. O que já existe (leia antes de escrever código)

| Caminho | O que é |
|---|---|
| `src/knowledge/paradigms.ts`, `src/knowledge/features.ts` | Paradigmas de flexão e traços **UD** na ordem canônica `Gender, Number, Person, Mood, VerbForm, Tense, Degree` (chave: `Number=Sing\|Person=1\|Mood=Ind\|VerbForm=Fin\|Tense=Pres`). |
| `src/knowledge/knowledgeBase.ts`, `migrateKnowledgeBase.ts` | Base do domínio (versão 2) e migração. Ids de forma gerada: `LEX_X#FeatureKey`. |
| `src/engine/morphology/DerivationalAnalyzer.ts`, `src/knowledge/morphology/` | Analisador derivacional reverso (regras + restauração de radical); dados `affix-rules.json`, `stem-rules.json`, `seed-roots.json` (1160 raízes com sentidos e tipos semânticos), `semantic-functions.json`, `semantic-types.json`, `frames.json`. Teste: `tests/derivation-generalization.test.ts`. |
| `research/morfologia/inflection-paradigms-proposed.json` | Paradigmas que faltam (ex.: `N_M_NS` homem/homens), cada um com tabela de conferência. **Ainda não integrados.** |
| `research/morfologia/irregular-verbs.json` | Conjugação completa dos irregulares e particípios irregulares/abundantes. **Ainda não integrado.** |
| `research/morfologia/tests-inflection.json` | 258 casos de flexão com resposta. |
| `research/morfologia/frames.json` | 422 molduras: `roles` (ARG0/ARG1… com `prefers` = tipos semânticos), `syntax` (papel → relação UD), `control` (`SUBJECT`/`OBJECT`), `complement` (`xcomp`/`ccomp`). **122 são `defaultTemplate: true`, genéricas e não confiáveis** (ver `KNOWN_GAPS.md`). |
| `research/morfologia/tests-sentences.json` | **80 frases-gabarito**, cada uma com `tokens` (form, lemma, pos, feats), `dependencies` (rel, head, dep, índices a partir de 1), `subject`, `predicate` e `meaningGraph`. Fenômenos: sujeito oculto, controle, cópula, negação, perguntas sim/não e com pronome interrogativo, imperativo, bitransitivas com "para/a", oblíquos de lugar e tempo, orações completivas, condicionais, temporais e causais, relativas, coordenação de sujeitos, objetos, predicados e orações, clíticos ("me ajuda"). |
| `src/engine/parser/*`, `src/engine/syntax/*` | Parser **do domínio** (comandos). Não é o parser geral; não o reescreva. |
| `src/ui/components/PipelineInspector.tsx`, `src/ui/components/AdminPanel.tsx`, `admin/MorphologySection.tsx` | Inspetor do pipeline e painel administrativo (já tem a aba **Morfologia**). |

Rode `npm test` antes de tudo e registre a linha de base (413/413).

**Sobre o gabarito de frases:** ele tem inconsistências de notação no grafo, como parênteses às vezes sim e às vezes não (`café` × `(café)`, `(livro)`). **Não "corrija" isso no gabarito.** O comparador de grafos (Fase 6) normaliza: um conceito sem filhos, com ou sem parênteses, é a mesma tripla de instância. Erros de **conteúdo** (papel errado, relação UD contrária à diretriz) seguem a regra 0.4.

---

## 2. Arquitetura-alvo

Crie a camada geral em `src/engine/language/`, separada do parser do domínio, com dados em `src/knowledge/language/`:

```
Tokenizer           → tokens + contrações expandidas (CoNLL-U multiword: "na" = em + a)
LexicalAnalyzer     → para cada token, TODAS as leituras {lemma, upos, feats, origem}
                      origens: CLOSED_CLASS | INFLECTION | DERIVATION (hipótese) | GUESS
Tagger (CG)         → elimina leituras por regras SELECT/REMOVE em contexto (dados)
DependencyParser    → árvore UD (head, deprel), guiada por molduras e concordância
ClauseAnalyzer      → sujeito, predicado, sujeito oculto, modo (declarativa/interrogativa/imperativa), polaridade
MeaningGraphBuilder → grafo estilo AMR: sentido escolhido, papéis, controle, correferência
SentenceAnalysis    → objeto final + trace por regra + exportação CoNLL-U e PENMAN
```

Fachada pública: `SemanticEngine.analyzeSentence(text): SentenceAnalysis`. É só leitura: **não executa** nada no documento.

---

## 3. Fases (faça na ordem; cada fase termina com testes verdes, números e commit)

### Fase 1 — Pendências da morfologia (curta)

1.1 **Ruído nas leituras alternativas.**
- Hoje `botãozinho` mostra também "botar → boto → botão → botãozinho".
- Corte leituras com score menor que o do topo − 1,5, ou com cadeia 2 passos mais longa que a do topo.
- Teste: as leituras exibidas de `botãozinho`, `retomável`, `jardineiros` não incluem cadeias absurdas, e as métricas de `tests/derivation-generalization.test.ts` não caem.

1.2 **Radicais latinos como dados de radical**, não como pares de palavras.
- Crie em `stem-rules.json` uma coleção de **alternâncias de radical verbal**: radical do supino ou do particípio latino, ligado ao verbo (ver ~ vis-, ler ~ leg-, ouvir ~ aud-, destruir ~ destrut-, escrever ~ escri(p)t-/scri-, eleger ~ eleiç-, dividir ~ divis-…), com fonte.
- O analisador as usa para qualquer sufixo que aceite radical latino (-ção, -são, -vel, -ivo, -or…). Assim **invisível, indestrutível, descrição, reeleição, divisível, legível** passam, e também derivados não listados que usem o mesmo radical.
- Teste com 10 palavras **fora** dos dados.

1.3 **Derivado de palavra do domínio.**
- Quando a raiz é lexema do domínio e a função é avaliativa (`DIMINUTIVE`, `AUGMENTATIVE`), o token resolve para o conceito da raiz com diagnóstico `WARNING DERIVED_MATCH` ("botãozinho" → botão).
- Nunca para ações destrutivas, coerente com a política do `LexicalRecovery`.
- Commit de teste primeiro: "crie um botãozinho azul" cria um botão azul com o WARNING; "apaguezinho" continua erro.

### Fase 2 — Léxico de classes fechadas e contrações (dados digitados)

`src/knowledge/language/closed-class.json`, cada entrada com `form`, `lemma`, `upos`, `feats`, `note`:
- pronomes pessoais retos e oblíquos;
- clíticos me/te/se/o/a/lhe/nos/vos, com hífen em ênclise e mesóclise ("ajude-me", "dá-lo-ei");
- pronomes possessivos, demonstrativos e indefinidos (alguém, ninguém, nada, tudo, todo…);
- pronomes interrogativos e relativos (que, quem, onde, quando, como, quanto, qual);
- artigos e numerais cardinais por extenso;
- preposições;
- conjunções coordenativas e subordinativas;
- advérbios fechados (não, nunca, já, ainda, muito, bem, mal, cedo, tarde, hoje, ontem, amanhã, aqui, lá…).

O mesmo token pode ter várias leituras ("a" = DET / ADP / PRON; "que" = PRON / SCONJ).

`contractions.json`:
- de + artigo/pronome (do, da, dos, das, dele, deste, daquele, disso…);
- em + … (no, na, nele, neste, naquilo, num, numa…);
- a + … (ao, à, aos, às, àquele);
- por + artigo (pelo, pela…).

Siga a convenção UD do português: token de várias palavras no CoNLL-U, com faixa `4-5 na` e as linhas `em` e `a`.

Testes: tokenização e leituras de 40 casos escritos por você, **incluindo** frases fora do gabarito.

### Fase 3 — Análise lexical geral (flexão + derivação)

1. **Integre** `inflection-paradigms-proposed.json` e `irregular-verbs.json` aos paradigmas (`src/knowledge/paradigms.ts` ou um módulo de dados irmão), respeitando o formato existente.
   - Teste: **258/258** de `tests-inflection.json`.
2. **Índice inverso de formas** para as 1160 raízes-semente e os lexemas do domínio: forma → leituras `{lemma, upos, feats}`, geradas pelos paradigmas. É o mesmo gerador, nos dois sentidos.
   - Atribua paradigma às raízes-semente sem `inflection`, por regra de terminação, e registre a regra.
3. Palavra fora do índice:
   - primeiro, desfaça a flexão e chame o `DerivationalAnalyzer` (leitura `DERIVATION`, status `HYPOTHESIS`);
   - se nada servir, palpite de classe por terminação (-mente → ADV; -ção/-dade → NOUN; terminações verbais → VERB com traços), com origem `GUESS`, nunca escondida.
4. Teste: acurácia de **lema** e de **traços** sobre os tokens das 80 frases do gabarito, **antes** da desambiguação, medindo "a leitura correta está entre as candidatas" (meta: ≥ 99%).

### Fase 4 — Desambiguação de classe (Constraint Grammar)

`src/knowledge/language/pos-rules.json`: regras ordenadas no estilo CG-3 (`SELECT`, `REMOVE`, condições de contexto por posição relativa, classe, traço, barreira). Cada regra tem `id`, `note` (justificativa linguística) e `example`. Exemplos de fenômenos:
- "a" antes de substantivo feminino singular é DET; "a" depois de verbo de movimento e antes de infinitivo é ADP;
- "que" depois de verbo de dizer/crer/saber é SCONJ; "que" depois de substantivo é PRON relativo;
- "o"/"a" antes de verbo finito é clítico PRON;
- substantivo × verbo homógrafos ("ajuda", "conserto", "corte") decididos pelo contexto (depois de DET → NOUN);
- "vamos" + infinitivo → AUX (siga a decisão UD do português e documente).

O motor CG em TypeScript é genérico: lê as regras do JSON e não conhece palavras. Toda remoção aparece no trace.

Testes:
- **UPOS ≥ 97%** nos tokens das 80 frases;
- **20 frases suas, fora do gabarito**, com UPOS ≥ 95%.

### Fase 5 — Dependências, sujeito e predicado

**Parser determinístico** baseado em regras.
- Sugestão: primeiro sintagmas (nominal = det/num/adj + nome + adj/PP; verbal = aux/cop + verbo); depois a estrutura da oração.
- Pode ser um algoritmo de transição (*arc-eager*) com **oráculo por regras**, ou montagem por padrões. Escolha, justifique no relatório e cite a fonte.

Decisões obrigatórias, conforme UD e as páginas do português:
- **Cópula:** em "A casa é grande", o predicativo é a raiz e "é" é `cop`.
- **Sujeito:**
  - `nsubj` por concordância de pessoa e número com o verbo finito;
  - sujeito posposto nas perguntas;
  - **sujeito oculto**: sem nó na árvore, registrado na análise da oração com pessoa e número tirados do verbo ("Quero um café" → eu).
- **Complementos e adjuntos:**
  - complemento direto `obj`; preposicionado `obl`;
  - a moldura (`frames.json` → `syntax`) decide se o PP é argumento ("gostar **de**", "precisar **de**") ou adjunto;
  - nas molduras `defaultTemplate`, use um padrão conservador e registre a incerteza.
- **Verbos com complemento oracional:**
  - verbos de controle (`control`) → `xcomp`;
  - "que" + oração → `ccomp` com `mark`;
  - se/quando/porque → `advcl` com `mark`;
  - relativas → `acl:relcl`.
- **Demais relações:** coordenação `conj` + `cc` (sujeitos, objetos, predicados, orações), `advmod`, `amod`, `det`, `nummod`, `case`, `punct`, `fixed` (locuções como "por favor", "à noite": siga o gabarito e a diretriz).
- **Sujeito e predicado** (`ClauseAnalyzer`):
  - **leia o gabarito** e escreva no relatório a definição operacional que ele usa (ex.: em sent-001, `predicate: [2,3]` é o **núcleo verbal**: verbo + cadeia xcomp/aux/cop);
  - implemente essa definição de forma geral;
  - exponha também o predicado completo (subárvore da raiz menos o sujeito), rotulado como tal.
- **Modo e polaridade:** declarativa/interrogativa ("?" e pronome interrogativo)/imperativa (traço `Mood=Imp` ou subjuntivo de ordem, sem sujeito); negação ("não", "nunca", "ninguém", "nem").
- **Exportação CoNLL-U** válida (10 colunas), com teste de formato.

Testes, nas 80 frases:
- **UAS ≥ 90%** e **LAS ≥ 85%**;
- sujeito exato ≥ 90%, predicado (núcleo) exato ≥ 90%.

Nas suas 20 frases extras: UAS ≥ 85%.

### Fase 6 — Grafo de significado

`MeaningGraphBuilder`:
- **Sentido:**
  - escolha entre os `senses` da raiz pela **preferência de seleção**: os `prefers` da moldura contra o `semanticType` dos argumentos, subindo a hierarquia de `semantic-types.json`;
  - "tomar café" → INGERIR, porque café é bebida;
  - empate → escolha determinística **e** diagnóstico `AMBIGUOUS_SENSE` com as alternativas.
- **Papéis:** relação UD → papel pela `syntax` da moldura.
  - Para os adjuntos, crie `src/knowledge/language/adjunct-roles.json`: preposição + tipo semântico → `:LOC`, `:TIME`, `:COM`, `:MANNER`, `:cause`, `:condition`, `:freq`, `:degree`.
- **Controle e correferência:**
  - o ARG0 do `xcomp` é o sujeito (control `SUBJECT`) ou o objeto (`OBJECT`) da matriz, como **o mesmo nó** (reentrância AMR, variável repetida);
  - sujeito oculto vira nó pronominal implícito;
  - imperativo → ARG0 `você`;
  - relativa → `:mod` com o nó do antecedente reentrante.
- **Polaridade e modo:** `:polarity -`, `:mode interrogative/imperative`; pronome interrogativo → `amr-unknown` no papel certo; coordenação → `and`; cópula + adjetivo → `(adjetivo :ARG1 sujeito)`.
- **Saída** em duas formas:
  - **PENMAN** com variáveis (`(q / querer.DESEJAR :ARG0 (e / eu) :ARG1 (t / tomar.INGERIR :ARG0 e :ARG1 (c / café)))`);
  - **JSON** de nós e arestas, para o desenho.
- **Comparador** `src/eval/graphMatch.ts`:
  - leitor da notação simplificada do gabarito;
  - conversão em triplas (instância, relação, atributo);
  - F1 estilo **Smatch**, com busca **exata** do melhor mapeamento de variáveis (os grafos são pequenos; determinístico, sem subida de encosta aleatória).
  - Tenha testes próprios: grafos idênticos com variáveis trocadas dão F1 = 1; um papel trocado reduz o F1 na conta certa.

Testes nas 80 frases:
- **Smatch F1 médio ≥ 0,85**;
- grafo exato (F1 = 1) em ≥ 70%;
- sentido correto em ≥ 90% dos predicados.

### Fase 7 — Interface (verificada no navegador)

1. **Inspetor:** quando a entrada do chat é uma frase geral, ou sempre, como aba extra, mostre a análise geral **ao lado** da análise de comando, sem mudar a execução. Abas novas:
   - **Classes**: tabela token / lema / UPOS / traços / origem / regra;
   - **Sintaxe**: árvore de dependências desenhada em SVG com arcos rotulados, mais o CoNLL-U; sujeito e predicado destacados;
   - **Significado**: grafo em SVG (nós = conceitos com sentido, arestas = papéis; reentrâncias visíveis) e o PENMAN.
2. **Painel administrativo → "Análise de frase":** caixa de texto livre; mostra as três vistas e o **trace de regras** (qual regra CG, qual regra de arco, qual moldura, qual preferência decidiu).
3. **Gabarito no painel:** lista das 80 frases com acerto/erro por métrica e o diff (gabarito × saída) para cada falha.
4. Verifique com `npm run dev` (porta 5173):
   - "Eu quero tomar café." mostra exatamente o exemplo do Papel;
   - mais 5 frases do gabarito e 5 suas;
   - sem erros no console;
   - inclua capturas de tela no relatório.

### Fase 8 — Rede ensinável (mínimo útil)

No painel, **"Ensinar palavra"**:
- o usuário cadastra uma raiz (lema, classe, paradigma sugerido por regra de terminação, sentido com glosa, tipo semântico e, para verbos, moldura a partir de um modelo existente);
- a raiz persiste na base pelo `KnowledgeBaseStore`, com versão nova da base e migração no padrão de `migrateKnowledgeBase.ts`, testada;
- **na hora**, todas as flexões e derivações da raiz passam a ser reconhecidas e as frases com ela são analisadas.

Vista **"Rede"**: para um lema, o grafo lema → formas geradas (resumo) → derivados atestados/hipotéticos → sentidos → molduras → tipos semânticos.

Teste:
1. ensinar "surfar" (VERB, moldura de `andar` / `correr`);
2. "Nós surfamos ontem." é analisada com ARG0 = nós e `:TIME ontem`;
3. "surfista" é analisada como AGENT_OF(surfar).

---

## 4. Testes a criar (resumo)

| Arquivo | Conteúdo |
|---|---|
| `tests/language-closed-class.test.ts` | tokenização, contrações, clíticos (Fase 2) |
| `tests/language-inflection.test.ts` | 258/258 de flexão; índice inverso (Fase 3) |
| `tests/language-tagger.test.ts` | UPOS no gabarito e nas frases extras (Fase 4) |
| `tests/language-dependencies.test.ts` | UAS/LAS, sujeito, predicado, CoNLL-U (Fase 5) |
| `tests/meaning-graph.test.ts` | comparador Smatch + F1 no gabarito + sentido (Fase 6) |
| `tests/teachable-network.test.ts` | ensinar raiz, migração, análise imediata (Fase 8) |
| `tests/architecture.test.ts` (acrescentar) | os `.ts` de `src/engine/language/` **não contêm literais de palavras do português**: nenhum literal de string em minúsculas com 2+ letras que seja forma do léxico ou de classe fechada. Palavras só nos JSON. |

As 20 frases extras ficam em `tests/fixtures/sentences-extra.json`, no mesmo formato de `tests-sentences.json`, escritas **antes** do código da fase que as usa.

Cada teste de métrica **imprime** o número real (ex.: `console.info('UAS', x)`) além de verificar o limiar.

---

## 5. Entrega

1. `RELATORIO_SINTAXE.md` (em português):
   - o que foi pesquisado, com links, e qual decisão cada fonte sustentou;
   - arquitetura;
   - **tabela de números reais** por fase: lema, traços, UPOS, UAS, LAS, sujeito, predicado, Smatch, sentido; no gabarito e nas extras;
   - **todas** as falhas restantes, com causa;
   - lacunas conhecidas;
   - saída de `npm test`;
   - capturas de tela.
2. `research/morfologia/CHANGES.md` atualizado se houve `GOLD-FIX`.
3. Branch `codex/sintaxe-significado` com o histórico de commits:
   - `TEST-EXPECTATION` antes do código, em cada fase;
   - suíte verde em todos os commits.

## 6. Critério de pronto

- [ ] `npm test` 100% verde (os 413 antigos + os novos), `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Limiares das fases atingidos **no gabarito e nas frases extras**, com os números no relatório.
- [ ] "Eu quero tomar café." mostra no painel: classes corretas, sujeito "eu", predicado "quero tomar café", árvore UD do gabarito e o grafo com o "eu" reentrante em tomar.
- [ ] Nenhuma palavra do português em código TypeScript da camada geral (teste de arquitetura).
- [ ] Nenhum dado externo importado.
- [ ] Comandos do construtor inalterados (exceto a Fase 1.3, com teste).
- [ ] Relatório honesto, com falhas listadas.

**Lembrete final:** depois da entrega, o trabalho será conferido com **frases novas que você não viu**. O que vale é a generalização, não o gabarito.
