# PROMPT — Pesquisa e curadoria da rede gerativa do português (dados + regras)

## Papel

Você é o **pesquisador e curador linguístico**. Seu trabalho é **pesquisar** e produzir **dados e regras** em arquivos JSON, mais um **aplicador de referência** que prova que os dados funcionam.

Você **não** altera o motor (`src/`) nem os testes existentes (`tests/`). Outro engenheiro vai conferir tudo e integrar.

Projeto: `C:\Codex-Shared\Lexical`, um compilador semântico determinístico de comandos em português, com léxico por **lema + paradigma**: as flexões são geradas, não cadastradas.

**Objetivo de longo prazo:** entender o português geral, construindo uma **rede de significado** a partir de **poucas raízes e muitos geradores**, **sem importar dicionários externos**.

**Este trabalho é a base desse objetivo:**
1. as regras de **formação de palavras** (derivação, composição, conversão), que funcionam nos dois sentidos: gerar e analisar;
2. um **léxico-semente** pequeno, digitado à mão, com sentidos, tipos semânticos e molduras de argumentos dos verbos;
3. conjuntos de teste com a resposta correta (gold).

---

## 0. Regras invioláveis

1. **Pesquise antes de produzir.** Para cada regra, consulte gramáticas e literatura. Referências sugeridas:
   - Cunha & Cintra, *Nova Gramática do Português Contemporâneo*;
   - Bechara, *Moderna Gramática Portuguesa*;
   - Margarida Basílio, *Teoria Lexical* e *Formação e Classes de Palavras no Português do Brasil*;
   - Maria Carlota Rosa, *Introdução à Morfologia*;
   - Luiz Carlos Rocha, *Estruturas Morfológicas do Português*;
   - Antônio José Sandmann, *Formação de Palavras no Português Brasileiro Contemporâneo*;
   - Alina Villalva, *Morfologia do Português*;
   - artigos sobre produtividade e alternância de sufixos, por exemplo -ção × -mento: https://periodicos.fclar.unesp.br/alfa/article/download/3837/3544/9435
   - Aronoff (regras de formação de palavras e bloqueio): https://mitwpl.mit.edu/catalog/aron01/
   - Koskenniemi (morfologia de dois níveis, regras bidirecionais): https://researchportal.helsinki.fi/en/publications/two-level-morphology-a-general-computational-model-for-word-form-/
2. **Toda regra cita fonte** (`sources`): obra, capítulo ou página quando houver, e URL quando houver.
   - **Nunca invente referência.** Se não puder verificar, escreva `"verified": false` e explique em `note`.
   - Não copie trechos de obras protegidas: registre o **fato linguístico** com suas palavras.
3. **Não importe dicionários, listas de frequência nem bases lexicais externas** (MorphoBr, DELAF, Wiktionary, WordNet, PropBank…). Você pode **citá-los como referência conceitual**, mas cada palavra-semente é **digitada e curada** por você, com justificativa.
4. **Nada é inventado como fato.**
   - Formas e sentidos devem ser do português brasileiro padrão.
   - Em caso de dúvida, marque `"confidence": "LOW"` e explique.
   - Palavras inexistentes só podem aparecer como **contraexemplo** (bloqueio ou sobregeração), marcadas como tal.
5. **Não altere** `src/`, `tests/` nem `audit/`. Trabalhe só em `research/morfologia/`.
6. **Git:**
   - crie a branch `deepseek/morfologia-dados` a partir de `claude/front-end-gramatical`;
   - faça um commit por arquivo ou etapa, com mensagem clara;
   - não use `--amend`, `rebase` nem `push --force`.
7. **Todo JSON tem envelope** `{ "version": "1.0.0", "schemaVersion": "1.0.0", "description": "...", ... }` e ids únicos.

---

## 1. Convenções do projeto (leia antes, não altere)

- `src/knowledge/paradigms.ts`: formato de paradigma de flexão. Campos:
  - `strip`: terminação retirada do lema;
  - `cells`: `{feats, suffix}`;
  - `fullForm`: verbos irregulares, com a forma inteira em cada célula;
  - `orthography`: `C_TO_QU`, `G_TO_GU`, `CEDILLA_TO_C`.

  Paradigmas existentes: `V_AR`, `V_ER`, `V_IR`, irregulares `V_FAZER`, `V_POR`, `V_TER`, `V_ESTAR`, `V_SER`, `V_PODER`, `V_QUERER`, `V_TRAZER`, `V_IR_VERB`; nomes `N_S`, `N_AO_OES`, `N_AO_AES`, `N_AO_AOS`, `N_L_IS`, `N_R_Z_ES`, `N_INVARIANT`; adjetivos e determinantes `ADJ_O`, `ADJ_L`, `ADJ_UNIFORM`, `ADJ_INVARIANT`, `DET_E`, `DET_UM`.
- `src/knowledge/features.ts`: traços no padrão **Universal Dependencies**, nesta ordem canônica: `Gender`, `Number`, `Person`, `Mood`, `VerbForm`, `Tense`, `Degree`. A chave de célula é, por exemplo, `Number=Sing|Person=3|Mood=Ind|VerbForm=Fin|Tense=Pres`. Use **exatamente** esse formato.
- `src/knowledge/knowledgeBase.ts`: lemas atuais do domínio (caixa, botão, texto, cores, verbos de comando). As raízes-semente novas não podem repetir ids existentes.

---

## 2. Entregáveis (todos em `research/morfologia/`)

### 2.1 `semantic-functions.json`: funções de significado dos processos

Inventário das funções que um afixo ou processo aplica ao significado da base. Cada item:

```json
{
  "id": "AGENT_OF",
  "definition": "quem realiza a ação expressa pela base",
  "inputTypes": ["ACAO"],
  "outputType": "PESSOA",
  "graphRelation": "agente_de",
  "glossTemplate": "quem {base}",
  "examples": ["vendedor", "trabalhador"]
}
```

Cubra, no mínimo: `AGENT_OF`, `INSTRUMENT_OF`, `PLACE_OF`, `ACTION_OF`, `RESULT_OF`, `POSSIBLE_PASSIVE` (-vel), `QUALITY_OF` (-idade, -ez, -ura), `MANNER` (-mente), `FULL_OF` (-oso), `PROFESSION_OR_CONTAINER` (-eiro, -eira), `COLLECTIVE` (-ada, -al, -agem), `ADHERENT` (-ista), `DOCTRINE` (-ismo), `CAUSE_TO_BE` (-izar, -ificar, en-…-ar), `BECOME` (-ecer, a-/en-…-ecer), `NEGATION` (in-, des- adjetival), `REVERSAL` (des- verbal), `REPETITION` (re-), `PRIOR` (pré-), `EXCESS` (super-, hiper-), `DIMINUTIVE`, `AUGMENTATIVE`, `RELATIONAL_ADJ` (-al, -ar, -ico), `NATIONALITY_ORIGIN` (-ês, -ense, -ano), `CONVERSION` (mudança de classe sem afixo).

### 2.2 `affix-rules.json`: regras de formação nos dois sentidos

No mínimo **40 regras**, priorizando as mais produtivas do português brasileiro atual. Cada regra:

```json
{
  "id": "SUF_DOR",
  "process": "SUFFIX",
  "form": { "suffix": "dor" },
  "input": { "pos": "VERB", "constraints": {} },
  "output": { "pos": "NOUN", "gender": "Masc", "inflectionParadigm": "N_OR_ORA" },
  "stem": "INFINITIVE_MINUS_R",
  "allomorphy": [
    { "when": { "verbClass": "ER" }, "stemChange": "e", "example": "vender → vendedor" }
  ],
  "semantics": { "function": "AGENT_OF", "alsoPossible": ["INSTRUMENT_OF"] },
  "productivity": "HIGH",
  "examples": [
    { "base": "vender", "derived": "vendedor" },
    { "base": "trabalhar", "derived": "trabalhador" }
  ],
  "counterExamples": [
    { "base": "...", "wouldBe": "...", "reason": "BLOCKED_BY:<palavra existente> | SEMANTIC_RESTRICTION | NOT_ATTESTED" }
  ],
  "sources": [{ "ref": "...", "url": "...", "verified": true, "note": "" }],
  "confidence": "HIGH"
}
```

- `process` ∈ `PREFIX`, `SUFFIX`, `PARASYNTHETIC` (`form: {prefix, suffix}`), `REGRESSIVE`, `CONVERSION`, `COMPOUND_JUXTAPOSITION`, `COMPOUND_AGGLUTINATION`.
- `stem`: uma estratégia de um vocabulário fechado, documentado no próprio arquivo, por exemplo `LEMMA`, `INFINITIVE_MINUS_R`, `VERB_ROOT`, `MINUS_FINAL_VOWEL`, `PARTICIPLE_STEM`, `LATINATE_STEM`. A **alomorfia** vai em `allomorphy`, com condição explícita: `produzir → produção`, `decidir → decisão`, `comer → comível`, `vencer → vencimento`, `feliz → felicidade`.
- Cada regra tem **≥ 5 exemplos reais** e **≥ 2 contraexemplos** (bloqueio ou restrição), quando existirem.
- Cubra também:
  - **prefixos**: re-, des-, in-/im-/i-, pré-, super-, sub-, inter-, anti-, auto-, contra-;
  - **sufixos**: -ção/-são, -mento, -dor, -nte, -vel, -mente, -idade/-dade, -ez/-eza, -ura, -oso, -eiro/-eira, -ista, -ismo, -izar, -ificar, -ecer, -al, -ico, -ês, -ense, -ada, -agem, -inho/-zinho, -ão/-zão;
  - **parassíntese**: a-…-ecer, en-…-ecer, a-…-ar, en-…-ar, es-…-ecer;
  - **regressiva**: -a, -o, -e (pesca, compra, ataque, choro);
  - **conversão**: infinitivo → substantivo ("o jantar"), adjetivo → substantivo ("o verde"), particípio → adjetivo ("botão criado");
  - **composição**: justaposição (guarda-chuva, girassol) e aglutinação (aguardente, planalto), com a regra de flexão do composto.

### 2.3 `inflection-paradigms-proposed.json`: paradigmas de flexão que faltam

No **formato exato** de `src/knowledge/paradigms.ts`, cobrindo no mínimo:
- **nomes**: -m → -ns, -al/-el/-ol/-ul → -ais/-éis/-óis/-uis, -il → -is (átono -il → -eis), -s/-x invariáveis, -or → -ores com feminino -ora;
- **adjetivos**: -ês/-esa, -or/-ora, -ão/-ã, -ão/-ona;
- **verbos**: -ear (passear → passeio), -iar regular e irregular (odiar), -uir, -ger/-gir (g → j antes de a/o), -cer (c → ç), -guer/-guir, -çar.

Cada paradigma tem **≥ 3 lemas de exemplo** e as **formas completas esperadas** de pelo menos um deles, para servir de tabela de conferência (golden table).

### 2.4 `irregular-verbs.json`: conjugação completa dos irregulares

Tabelas **completas**, com todas as células e no formato de chave de traços do projeto, para os verbos irregulares mais usados que entram na semente.

Os que **ainda não existem** no projeto: haver, vir, dizer, saber, ver, dar, ler, crer, ouvir, pedir, medir, dormir, sair, cair, caber, valer, perder, seguir, sentir, servir, subir, fugir, rir, construir, destruir, conseguir, preferir, mentir, cobrir, descobrir, abrir.

Inclua os particípios irregulares e abundantes (aberto, escrito, feito, posto, visto, dito, pago/pagado, aceito/aceitado, entregue/entregado).

### 2.5 `semantic-types.json`: tipos semânticos próprios, com hierarquia

Cerca de 40 tipos, com relação `is_a`, por exemplo:
- `ENTIDADE` > `CONCRETO` > `SER_VIVO` > `PESSOA` / `ANIMAL` / `PLANTA`;
- `OBJETO` > `ALIMENTO` / `BEBIDA` / `VEICULO` / `FERRAMENTA` / `ELEMENTO_DE_INTERFACE`;
- `LUGAR`, `TEMPO`, `EVENTO`, `ACAO`, `ESTADO`, `QUALIDADE`, `QUANTIDADE`, `COR`, `TAMANHO`, `INFORMACAO`, `SENTIMENTO`, `INSTITUICAO`, `PARTE_DO_CORPO`…

Os tipos do domínio atual (`C_ENT_CONTAINER`, `C_ENT_BUTTON`, `C_ENT_TEXT`, valores de cor) devem se encaixar como subtipos de `ELEMENTO_DE_INTERFACE`, `COR` etc., informados em `"domainMappings"`.

### 2.6 `seed-roots.json`: léxico-semente digitado e curado

Tamanho alvo:

| Classe | Quantidade |
|---|---|
| verbos | **300** |
| substantivos | **300** |
| adjetivos | **150** |
| advérbios não derivados em -mente | **60** |
| classes fechadas | **completas** |

As classes fechadas são: artigos, pronomes pessoais retos e oblíquos, possessivos, demonstrativos, indefinidos, relativos e interrogativos; preposições e suas contrações; conjunções coordenativas e subordinativas; numerais cardinais até mil e ordinais até décimo. Escolha pelo **uso comum no português brasileiro do dia a dia**, com justificativa curta por grupo. Inclua obrigatoriamente: tomar, beber, comer, querer, poder, precisar, gostar, ir, vir, fazer, ter, ser, estar, dar, ver, dizer, café, água, casa, pessoa, tempo, dia.

Cada entrada:

```json
{
  "id": "LEX_TOMAR",
  "lemma": "tomar",
  "pos": "VERB",
  "inflection": { "paradigmId": "V_AR" },
  "gender": null,
  "senses": [
    {
      "id": "tomar.INGERIR",
      "gloss": "ingerir (bebida, alimento, remédio)",
      "semanticType": "ACAO",
      "frame": "tomar.INGERIR"
    },
    {
      "id": "tomar.CONQUISTAR",
      "gloss": "apoderar-se de",
      "semanticType": "ACAO",
      "frame": "tomar.CONQUISTAR"
    },
    {
      "id": "tomar.EMBARCAR",
      "gloss": "pegar um veículo",
      "semanticType": "ACAO",
      "frame": "tomar.EMBARCAR"
    }
  ],
  "attestedDerivations": [
    { "rule": "SUF_DOR", "word": "tomador", "sense": "AGENT_OF(tomar.CONQUISTAR|tomar.INGERIR)" },
    { "rule": "PRE_RE", "word": "retomar" }
  ],
  "lexicalized": [
    { "word": "tomada", "gloss": "ponto de energia elétrica", "semanticType": "OBJETO", "note": "sentido não composicional" }
  ],
  "lightVerbConstructions": [
    { "pattern": "tomar banho", "meaning": "banhar-se" },
    { "pattern": "tomar uma decisão", "meaning": "decidir" }
  ],
  "confidence": "HIGH"
}
```

- Substantivos têm `gender` e paradigma de flexão; adjetivos têm paradigma.
- `attestedDerivations` lista **só** derivações reais e de uso corrente. É o que permite ao motor distinguir palavra atestada de hipótese gerada.
- `lexicalized` registra sentidos não composicionais.

### 2.7 `frames.json`: molduras de argumentos dos verbos

Uma moldura por sentido de verbo-semente, com papéis numerados no estilo PropBank (use o conceito, não copie o PropBank-Br) e **preferências de seleção** por tipo semântico:

```json
{
  "id": "tomar.INGERIR",
  "roles": {
    "ARG0": { "label": "quem ingere", "prefers": ["SER_VIVO"] },
    "ARG1": { "label": "o que é ingerido", "prefers": ["BEBIDA", "ALIMENTO", "REMEDIO"] }
  },
  "syntax": [{ "ARG0": "nsubj", "ARG1": "obj" }],
  "examples": ["Eu tomo café.", "Ela tomou o remédio."]
}
```

- **Verbos de controle e auxiliares** (querer, poder, precisar, conseguir, tentar, começar, deixar de, ir + infinitivo) informam `"control": "SUBJECT"`, isto é, o sujeito do infinitivo é o ARG0 do verbo principal ("Eu quero tomar café": quem toma é "eu"), e `"complement": "xcomp"`.
- A **desambiguação de sentido** precisa ser possível só pelas preferências: "tomar café" → INGERIR, "tomar a cidade" → CONQUISTAR, "tomar o ônibus" → EMBARCAR.

### 2.8 Conjuntos de teste com a resposta correta (escritos por raciocínio, **antes** do aplicador)

**`tests-derivation.json`: ≥ 300 casos de palavras que NÃO estão em `seed-roots.json`.**
- Para cada caso: decomposição esperada (raiz-semente + regras, em ordem), classe e gênero, função semântica composta e paráfrase.
- Inclua:
  - **≥ 60 em vários níveis**: retomável, desorganização, reorganizável, infelizmente, desvalorização;
  - **≥ 30 parassintéticos**;
  - **≥ 20 regressivos**;
  - **≥ 20 conversões**;
  - **≥ 20 compostos**;
  - **≥ 60 negativos**: formas bloqueadas ou inexistentes (casação, \*tomável com sentido errado…) com o resultado esperado `{"status": "HYPOTHESIS_BLOCKED" | "NOT_A_WORD"}`;
  - **≥ 20 lexicalizados**, em que a leitura composicional **não** é a principal (tomada, vencimento no sentido de "data", ferragem).
- Formato:

  ```json
  {
    "id": "der-001",
    "word": "retomável",
    "expected": {
      "status": "ANALYZED",
      "chain": [
        { "rule": "PRE_RE", "from": "tomar", "to": "retomar" },
        { "rule": "SUF_VEL", "from": "retomar", "to": "retomável" }
      ],
      "root": "LEX_TOMAR",
      "pos": "ADJECTIVE",
      "semantics": "POSSIBLE_PASSIVE(REPETITION(tomar))",
      "gloss": "que pode ser tomado de novo"
    }
  }
  ```

**`tests-inflection.json`: ≥ 200 casos de flexão** dos paradigmas novos e dos irregulares: forma → lema e traços, e lema + traços → forma.

**`tests-sentences.json`: 80 frases simples** para as etapas seguintes (sintaxe e grafo).
- Variedade obrigatória: declarativas, desejo e controle ("Eu quero tomar café."), negação, perguntas sim/não e com pronome interrogativo, sujeito oculto, verbo de ligação ("O café está quente."), objeto indireto, adjuntos de lugar e tempo.
- Para cada frase:
  - `tokens`: forma, lema, classe UD e traços;
  - `dependencies`: no padrão UD, com relações `nsubj`, `obj`, `iobj`, `xcomp`, `ccomp`, `obl`, `det`, `amod`, `advmod`, `cop`, `aux`, `mark`, `case`, `root`;
  - `subject` e `predicate`;
  - `meaningGraph` no estilo AMR, com o sentido escolhido de cada verbo e os papéis. Exemplo: `(querer.DESEJAR :ARG0 eu :ARG1 (tomar.INGERIR :ARG0 eu :ARG1 café))`.

### 2.9 Aplicador de referência e verificador (JavaScript puro, sem dependências)

- `research/morfologia/ref/apply.mjs`, que exporta:
  - `generate(lemmaEntry, ruleId)` → forma(s) derivada(s), seguindo `stem` e `allomorphy`;
  - `analyze(word)` → **todas** as decomposições possíveis até uma raiz-semente, rodando as regras ao contrário (busca limitada a 4 níveis), cada uma com `chain`, `pos`, `semantics`, `status` (`ATTESTED` se estiver em `attestedDerivations`, `HYPOTHESIS` se não, `HYPOTHESIS_BLOCKED` se um contraexemplo ou bloqueio se aplicar) e `confidence`;
  - `inflect(lemmaEntry, featureKey)` e `lemmatize(form)` para os paradigmas propostos e os irregulares.
- `research/morfologia/ref/validate.mjs` (`node research/morfologia/ref/validate.mjs`):
  1. valida o envelope e o esquema de todos os JSON, os ids únicos e as referências cruzadas (regra → função existente, raiz → paradigma existente ou proposto, sentido → moldura existente, tipo → tipo existente);
  2. confere que **todo exemplo** de cada regra é reproduzido por `generate`;
  3. roda `tests-derivation.json` e `tests-inflection.json` com `analyze`, `inflect` e `lemmatize`;
  4. imprime a acurácia por categoria e a **lista de falhas**.
- Falhas que você não conseguir resolver vão para `KNOWN_GAPS.md`, com o motivo linguístico. **Nunca** altere o esperado para fazer o teste passar. Se um esperado estiver errado, corrija-o com justificativa no `CHANGES.md` desta pasta.

### 2.10 `README.md` da pasta

- O que foi produzido e quantos itens de cada tipo.
- Acurácia do verificador por categoria.
- **Decisões linguísticas** tomadas e por quê: alternâncias, bloqueios, casos discutíveis.
- **Lacunas conhecidas** e incertezas, honestamente.
- Bibliografia efetivamente consultada (separe `verified: true` de `false`).

---

## 3. Ordem de trabalho

1. Ler as convenções do projeto (seção 1).
2. Pesquisar e escrever `semantic-functions.json` e `semantic-types.json`.
3. Escrever **primeiro os testes** (`tests-derivation.json`, `tests-inflection.json`, `tests-sentences.json`), por raciocínio, e commitá-los **antes** das regras.
4. Escrever `affix-rules.json`, `inflection-paradigms-proposed.json`, `irregular-verbs.json`.
5. Escrever `seed-roots.json` e `frames.json`.
6. Escrever o aplicador e o verificador; rodar; corrigir **regras** (não testes) até o máximo possível; registrar as lacunas.
7. Escrever o `README.md` com números gerados pelo verificador (não digitados).

## 4. Critério de pronto

- [ ] `node research/morfologia/ref/validate.mjs` roda sem erro de esquema e imprime a acurácia por categoria.
- [ ] ≥ 40 regras com fontes, ≥ 5 exemplos e contraexemplos; ≥ 300 testes de derivação (≥ 60 negativos); ≥ 200 de flexão; 80 frases com dependências e grafo.
- [ ] Léxico-semente no tamanho alvo, com sentidos, tipos e molduras; nenhuma palavra importada em massa.
- [ ] Testes commitados antes das regras; nenhum esperado alterado sem registro.
- [ ] `README.md`, `KNOWN_GAPS.md` e `CHANGES.md` honestos.
- [ ] Nada fora de `research/morfologia/` foi modificado.
