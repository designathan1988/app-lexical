# PROMPT DE CORREÇÃO — Motor Semântico PT-BR (projeto `Lexical`)

Você vai corrigir **integralmente** os defeitos e lacunas listados abaixo em um projeto existente. O projeto é um compilador semântico determinístico que converte comandos em português natural em operações tipadas sobre um pagebuilder.

Leia este documento inteiro antes de alterar qualquer arquivo. Depois leia, nesta ordem:

1. `LEXICAL.txt` — contrato arquitetural principal (não reescreva nem simplifique a arquitetura).
2. `PROMPT.txt` — requisitos originais (seções §1 a §39 + painel administrativo).
3. `RELATORIO.md` — o que a implementação anterior **afirma** ter feito. Várias afirmações são falsas ou exageradas; este documento aponta quais.

Trabalhe direto no código. Não pare em um plano. Não peça confirmação entre etapas.

---

## 0. CONTEXTO DO PROJETO

- Caminho: `C:\Codex-Shared\Lexical` (Windows). Stack: TypeScript + React 18 + Vite 5 + Vitest 2.
- Comandos:
  - `npm test` (vitest) — hoje: 158 testes, todos passam.
  - `npx tsc --noEmit` — hoje: sem erros.
  - `npm run build`
  - `npm run dev` → `http://localhost:5173`
- Pipeline atual (todos os arquivos em `src/`):

```
RawLexer (engine/lexical/RawLexer.ts)
 → expandContractions (engine/lexical/GrammarNormalizer.ts)
 → MultiwordTrie (engine/lexical/MultiwordTrie.ts)
 → LexicalIndex (engine/lexical/LexicalIndex.ts) + PortuguesePhonetic
 → SemanticTokenBuilder (engine/parser/SemanticTokenBuilder.ts)
 → DomainParser (engine/parser/DomainParser.ts) + PropertyBinder + DiscourseContext + Grammar.ts
 → AST (engine/ast/ast.ts)
 → ExecutionPlanner (engine/planning/ExecutionPlanner.ts) + ReferenceResolver (engine/document/ReferenceResolver.ts)
 → ConstraintValidator (engine/planning/ConstraintValidator.ts)
 → ExecutionEngine (engine/runtime/ExecutionEngine.ts)
 → BuilderRuntimeAdapterImpl → BuilderStore (builder/) [transação + undo/redo]
Fachadas: engine/SemanticCompiler.ts, engine/SemanticEngine.ts
Dados: knowledge/knowledgeBase.ts, knowledge/KnowledgeBaseStore.ts
Avaliação: eval/dataset.ts, eval/metrics.ts, eval/signatures.ts, eval/benchmark.ts
UI: ui/App.tsx, ui/useEngine.ts, ui/components/** (chat, preview, inspetor, painel admin)
```

- Base de conhecimento atual: 63 SurfaceForms, 26 lexemas, 35 conceitos, 9 MWEs, 3 entidades (CONTAINER, BUTTON, TEXT).

---

## 1. REGRAS INVIOLÁVEIS

1. **Não implemente por frases.** São proibidos `if (input.includes("..."))`, regex que codifique frases de teste e casos especiais para uma frase específica. Regex só no lexer, para classes lexicais.
2. **Não mascare testes.** Nunca altere um resultado esperado para fazer um teste passar, a menos que o esperado esteja comprovadamente errado; nesse caso, justifique no relatório. Nunca escreva AST, plano ou métrica à mão e apresente como saída real.
3. **Teste primeiro.** Para cada defeito: escreva antes o teste de regressão que reproduz o defeito, rode, confirme que ele **falha**, depois corrija e confirme que passa.
4. **Sem regressões.** Ao final, todos os testes existentes continuam passando, além dos novos. `tsc --noEmit` e `npm run build` limpos.
5. **Separação de camadas preservada:** SurfaceForm ≠ Lexeme ≠ Concept ≠ Mention ≠ DocumentInstance ≠ SemanticAST ≠ ExecutionPlan ≠ RuntimeMutation. Sem `currentEntity` global. Sem árvore paralela ao `BuilderStore`.
6. **Segurança:** sem `eval`, sem `new Function`, sem geração de JS a partir da frase, sem `Math.random()` no parser, planner ou executor.
7. **Nenhuma exceção pode escapar do motor para a UI.** Todo erro vira `Diagnostic` estruturado.
8. **O conjunto de avaliação final (held-out, seção 4.B) não pode ser usado para ajustar regras.**
9. **Se você tiver acesso à web**, consulte a documentação oficial e referências consolidadas antes de implementar técnicas não triviais. Exemplos: resolução de anáfora por saliência (Lappin & Leass, centering theory); correção ortográfica por índice (SymSpell, BK-tree); distância de Damerau-Levenshtein. Cite os links no relatório.

---

## 2. DEFEITOS CONFIRMADOS — corrigir todos

Cada item traz: reprodução exata (já executada contra o código atual), causa raiz, correção exigida e critério de aceitação. Use `SemanticEngine` + `createInitialKnowledgeBase()` nos testes, como faz `tests/e2e.test.ts`.

### D1. Pronome resolve para o nó errado após um comando que falhou (CRÍTICO)

**Reprodução:**
```
crie uma caixa banana   → falha (UNCONSUMED_INPUT), documento vazio
crie um botão           → cria node_1 (botão)
apague ela              → APAGA O BOTÃO (deveria falhar)
```

**Causa raiz:**
- `DomainParser.parseNewEntity` e `parseSelector` registram menções no `DiscourseContext` persistente **durante o parsing**, mesmo quando o comando depois falha.
- `DomainParser.parse()` reinicia `tempCounter = 0` a cada comando, então `tmp_1` se repete entre comandos.
- `DiscourseContext.reify()` (chamado em `SemanticEngine.execute`) reescreve **todas** as menções `NEW_ENTITY` com aquele tempId, inclusive a menção órfã da caixa que falhou, que passa a apontar para o botão.
- `resolvePronoun` não confere se o nó ainda existe nem se o tipo do nó é compatível com a menção.

**Correção exigida:**
- Torne o discurso **transacional**: o parser escreve menções em um buffer de staging do comando atual. O staging só é promovido ao discurso persistente se a execução tiver sucesso, já com as referências materializadas em NODE_ID. Em falha, NO_OP de erro ou análise, o staging é descartado.
- `reify` só toca menções do staging do comando atual.
- Ao resolver pronome:
  - descarte menções cujo NODE_ID não existe mais no documento (ex.: após undo ou delete);
  - descarte menções cujo nó atual tem `entityConceptId` diferente do da menção;
  - aplique concordância de gênero e número.
- Defina o comportamento com undo/redo: o discurso nunca pode apontar para um nó inexistente. Se um antecedente sumiu, emita `UNRESOLVED_PRONOUN` (não `UNRESOLVED_PLACEMENT_TARGET`).

**Aceitação:**
- A sequência acima termina com `UNRESOLVED_PRONOUN` e o botão continua no documento.
- `crie uma caixa` → undo → `crie um botão dentro dela` → `UNRESOLVED_PRONOUN`, nada criado.
- `crie uma caixa` → `crie um botão dentro dela` continua funcionando.
- A sequência do §38 do PROMPT.txt continua funcionando.

### D2. Ordinais seguem a ordem de criação, não a ordem do documento (CRÍTICO)

**Reprodução:**
```
crie dois botões                                       → node_1 | node_2
mude o primeiro botão para azul                        → node_1 azul
mova o primeiro botão para depois do segundo botão     → node_2 | node_1(azul)
apague o primeiro botão                                → APAGA node_1 (o azul, visualmente o SEGUNDO)
```

**Causa raiz:** `ReferenceResolver.resolveSelector` usa `Array.from(document.nodes.values())`, ou seja, a ordem de inserção do `Map`.

**Correção exigida:**
- Os candidatos devem ser ordenados pela **ordem do documento**: travessia em pré-ordem a partir de `rootIds` seguindo `childIds`.
- Exponha essa travessia como função do modelo de documento, reutilizada pelo resolver, pelas assinaturas de árvore e pelo renderer.
- Ordinal, "primeiro", "último" e `COUNT` usam essa ordem.

**Aceitação:**
- Na sequência acima, sobra apenas o botão azul.
- Teste equivalente com nós aninhados: "o segundo botão" conta em pré-ordem do documento inteiro, ou dentro do pai quando há `parent` no seletor.

### D3. Exceções em vez de diagnósticos; a UI real fica muda (CRÍTICO)

**Reprodução:**
- `crie um botão` → `mude a cor de fundo do botão para 2px` → `Error: Property C_PROP_BG_COLOR does not accept SIZE`, lançado até o handler do React. No navegador o chat não mostra nada; o erro aparece só no console.
- `crie um botão 2px` → `Error: Entity C_ENT_BUTTON has no default binding for SIZE`.

**Causa raiz:**
- `PropertyBinder.bind` lança `Error` genérico.
- `SemanticCompiler.compile` só captura `ParseError` e relança o resto.
- `ExecutionEngine.execute` faz rollback e relança.
- `ui/useEngine.ts` não tem try/catch.

**Correção exigida:**
- `PropertyBinder` retorna resultado tipado (sucesso ou diagnóstico). Use os códigos:
  - `INVALID_VALUE_CATEGORY` — valor de categoria incompatível com a propriedade ou o grupo;
  - `INVALID_PROPERTY` — entidade sem binding padrão para a categoria, ou propriedade não aceita pela entidade.
- Cada diagnóstico traz trecho e offsets da entrada, camada (`binder`) e candidatos considerados.
- `parseSelector` hoje engole o erro do binder com `catch {}`. Troque por tratamento explícito.
- `ConstraintValidator` também valida categoria do valor × `valueCategories` da propriedade em todo `SET_PROPERTY` (defesa em profundidade).
- `SemanticCompiler.compile` e `SemanticEngine.execute` nunca lançam. Erro inesperado vira diagnóstico `INTERNAL_ERROR` com a mensagem, e o documento fica intacto.
- `ExecutionEngine`: em falha de runtime, rollback **e** retorno `success:false` com diagnóstico (sem relançar).
- `useEngine.send` com try/catch como última barreira. Toda falha aparece no chat como "Bloqueado: …".

**Aceitação:**
- As duas frases produzem `INVALID_VALUE_CATEGORY` / `INVALID_PROPERTY`, nenhuma exceção, documento inalterado.
- No navegador, o chat mostra a mensagem de bloqueio e o console fica sem erros.

### D4. Recuperação fonética inventa interpretações (ALTO)

**Reprodução:**
- `crie um botão rosa` ("rosa" não está cadastrada) → cria um botão **roxo** (`#a855f7`), só com WARNING.
- `apaga o botão` → DELETE executado por palpite fonético ("apaga" não está cadastrada).

**Causa raiz:**
- `LexicalIndex.resolve` devolve o balde da chave fonética com score fixo 0.65, sem avaliar nada.
- O parser escolhe `conceptsOfKind(...)[0]` e `values[0]`, ou seja, o primeiro candidato. O §5 do PROMPT.txt proíbe isso.

**Correção exigida — implementar o fluxo do §5 de verdade:**
```
entrada desconhecida → chave fonética → candidatos → compatibilidade lexical
→ compatibilidade gramatical → compatibilidade semântica → contexto → candidato final
```
- **Geração de candidatos por índice**, sem varrer o dicionário. Use o balde fonético **e** um índice de distância de edição (SymSpell por deleções ou BK-tree).
- **Score composto e registrado** (no candidato e no trace):
  - similaridade de superfície: Damerau-Levenshtein normalizada;
  - igualdade de chave fonética;
  - compatibilidade gramatical: classe esperada na posição — verbo no início do comando, substantivo após determinante, valor após entidade ou propriedade —, mais morfologia;
  - compatibilidade semântica: a categoria do valor tem binding para a entidade ou propriedade em foco;
  - contexto.
- **Política de decisão** (parametrizável em `EngineSettings` e no painel de Configurações):
  - candidato único acima do limiar alto, e o operador não é destrutivo → aplica, com WARNING `PHONETIC_MATCH` mostrando forma, lexema, score e componentes do score;
  - empate, ou vários acima do limiar → `AMBIGUOUS_SENSE` (ERROR) com os candidatos;
  - abaixo do limiar → `UNKNOWN_WORD` (ERROR em palavra de conteúdo) com sugestões, sem executar;
  - **ações destrutivas (DELETE, MOVE) nunca são resolvidas só por recuperação aproximada.** Geram ERROR com sugestão.
- Substitua todos os `[0]` de escolha semântica no parser (`parseSpatial`, `parsePropertyHead`, `parseValue`, `peekSpatial`, `disambiguateAction` no fallback) por ranking com score e diagnóstico de empate.
- Cadastre como **dados** (não código) as flexões comuns que faltam, por exemplo:
  - `apaga`, `apaguem`, `remova`, `remover`, `remove`, `exclua`, `excluir`, `delete`, `deletar`, `tire`, `tirar`;
  - `altere`, `alterar`, `troque`, `trocar`, `pinte`, `pintar`;
  - `insira`, `inserir`, `crie/cria/criem`, `move/mova/movam`;
  - feminino e plural de todas as cores.

**Aceitação:**
- `crie um botão rosa` → bloqueado com `UNKNOWN_WORD` + sugestões; nada criado.
- `apaga o botão` funciona por correspondência **exata** (forma cadastrada).
- Um erro de digitação a distância 1 de uma forma cadastrada de valor ou entidade, não destrutivo (ex.: `vermelo`), é aceito com WARNING e score registrado.
- Um verbo destrutivo desconhecido parecido com `apagar` é bloqueado.
- Teste de robustez: lista de ≥ 30 palavras fora do domínio, nenhuma pode gerar mutação.

### D5. Seletor sem substantivo casa qualquer tipo (ALTO)

**Reprodução:** discurso vazio, documento com uma caixa e um botão → `apague todos` → **apaga o documento inteiro**. Também vale para `apague o primeiro`, que apaga o primeiro nó de qualquer tipo.

**Causa raiz:** em `DomainParser.parseSelector`, sem núcleo nominal e sem antecedente, `entityConceptId` fica `undefined`, e o resolver não filtra por tipo.

**Correção exigida:**
- Seletor sem núcleo nominal é **elipse**. Só é válido quando há antecedente saliente no discurso persistente (comandos já executados com sucesso). Nesse caso, registre no AST a origem (`elidedFrom: <menção>`) e emita INFO `ELLIPSIS_RESOLVED`.
- Sem antecedente → ERROR `INCOMPLETE_REFERENCE`, sem plano.

**Aceitação:**
- `apague todos` e `apague o primeiro` com discurso vazio → bloqueados.
- `crie dois botões` → `apague todos` → apaga só os botões.

### D6. "Apenas Analisar" diverge de "Executar" (MÉDIO)

**Reprodução:** `crie uma caixa` → Analisar `crie um botão dentro dela` → `UNRESOLVED_PRONOUN`; Executar a mesma frase → funciona.

**Causa raiz:** `SemanticEngine.analyze` cria um compilador com discurso descartável **vazio**.

**Correção:** `analyze` usa uma **cópia somente leitura** do discurso persistente (com o staging do D1, basta descartar o staging no fim) e o documento real.

**Aceitação:** para qualquer frase, `analyze(x).plan` é igual ao plano que `execute(x)` usaria no mesmo estado, e `analyze` não altera discurso nem documento. Teste por propriedade sobre todas as frases do dataset.

### D7. Plural de ordinal e contagem a partir do fim (MÉDIO)

**Reprodução:** `crie cinco botões` → `apague os dois últimos botões` → `UNKNOWN_WORD` ("últimos" não existe). Mesmo com a forma cadastrada, o resolver faria `slice(len-1, len-1+2)` e devolveria um nó só.

**Correção:**
- Formas plurais de todos os ordinais, `penúltimo/a/os/as` (-2), e as duas ordens: `os dois últimos` e `os últimos dois`; `os três primeiros` e `os primeiros três`.
- Ordinal negativo com `COUNT n` seleciona os **n últimos**.
- Ordinal ou contagem além do disponível → `TARGET_NOT_FOUND` com a cardinalidade encontrada.

**Aceitação:**
- `apague os dois últimos botões` apaga node_4 e node_5.
- `apague o sexto botão` com 5 botões → `TARGET_NOT_FOUND`.

### D8. "outra caixa" falha em documento vazio (MÉDIO)

**Reprodução:**
- documento vazio, `crie uma caixa dentro de outra caixa` → `UNRESOLVED_PLACEMENT_TARGET`;
- com caixas existentes → escolhe a primeira com `AMBIGUOUS_REFERENCE`.

O `RELATORIO.md` afirma que o caso do §36 funciona.

**Causa raiz:** `otherDeterminers` em `parseNominalPrefix` sempre vira `DEFINITE` (referência a nó existente).

**Correção — semântica de "outro/outra" baseada em dados e contexto:**
- denota uma entidade **distinta** da menção de mesmo tipo já presente na frase;
- se não houver instância existente compatível → interpretação indefinida (criar nova entidade, registrada no AST);
- se houver exatamente uma → referencia essa;
- se houver várias → aplicar saliência (D10); se continuar empatado, `AMBIGUOUS_REFERENCE` (ERROR).

**Aceitação:**
- Documento vazio → duas caixas aninhadas.
- Com uma caixa existente → a nova vai dentro dela.
- Com três caixas e sem saliência → bloqueado com `AMBIGUOUS_REFERENCE`.

### D9. Operação que não faz nada é reportada como sucesso (MÉDIO)

**Causa raiz:**
- `BuilderStore.place` retorna em silêncio quando origem == alvo, quando há ciclo (mover um ancestral para dentro do descendente) ou quando o nó não existe. `setProperty` e `clearProperty` também retornam em silêncio com nó inexistente.
- O executor registra a "mutação" mesmo assim.
- `ConstraintValidator` não verifica ciclos, nó relativo a si mesmo, existência de alvos de DELETE/MOVE, nem o pai efetivo em BEFORE/AFTER/BESIDE/ABOVE/BELOW (inserir ao lado de um nó coloca a origem no pai **dele**, e esse pai precisa aceitar a origem).

**Correção:**
- As primitivas do runtime retornam resultado tipado (`ok` ou erro com código).
- O validador checa, antes da mutação:
  - ciclo → `INVALID_CONTAINMENT` (subcódigo `CYCLE`);
  - auto-relação;
  - containment do pai efetivo em relações de irmão;
  - existência dos alvos;
  - cardinalidade;
  - operação permitida para a entidade.
- O executor aborta a transação inteira (rollback) se qualquer primitiva falhar, e devolve `success:false`.
- A lista de mutações contém só mutações efetivamente aplicadas.

**Aceitação:**
- `crie uma caixa dentro de outra caixa` → `mova a primeira caixa para dentro da segunda caixa` → `INVALID_CONTAINMENT/CYCLE`, documento inalterado, nenhuma entrada nova no undo.

### D10. Referência ambígua escolhe o primeiro em silêncio (MÉDIO)

**Causa raiz:**
- `AMBIGUOUS_REFERENCE` é WARNING por padrão e escolhe `nodes[0]`.
- A checagem é **pulada** quando há filtro de `parent` ou `propertyFilter`, mesmo que vários nós ainda casem.

**Correção:**
- Ordem de resolução de um definido singular:
  1. filtros explícitos;
  2. **saliência no discurso** (menção mais recente desse tipo cujo nó ainda existe);
  3. seleção atual, se compatível;
  4. se ainda houver mais de um → `AMBIGUOUS_REFERENCE` como **ERROR** por padrão (configurável), com candidatos.
- A checagem vale depois de **todos** os filtros.

**Aceitação:**
- Os 14 casos obrigatórios continuam passando.
- Documento com 2 botões e discurso vazio: `apague o botão` → bloqueado com os 2 candidatos.
- `crie um botão` → `crie outro botão` → `deixe ele azul` → aplica no segundo (saliência).

### D11. UPDATE sem seleção no chat real (MÉDIO)

**Reprodução (chat):** `crie uma caixa` → `deixe a borda azul` → `TARGET_NOT_FOUND`. A seleção só muda por clique no preview.

**Correção:**
- Como em editores visuais reais, após um comando bem-sucedido a seleção passa a ser o conjunto de nós criados ou afetados. Controle isso pela configuração `selectAfterCommand`, padrão `true`, editável no painel.
- Implemente via adaptador, dentro da mesma transação, para que undo restaure a seleção.
- Implemente QUERY de verdade: lexemas `selecione`, `selecionar`, `marque` → `QUERY_NODE`, que define a seleção.

**Aceitação:**
- `crie uma caixa` → `deixe a borda azul` → borda azul na caixa.
- `selecione o segundo botão` → `deixe a borda com 2px` → aplica no segundo botão.

---

## 3. NÃO CONFORMIDADES DE ARQUITETURA E REQUISITOS — corrigir todas

### A1. Operadores e palavras gramaticais devem ser dados, não código (§6, §32)

- Hoje `C_OP_NOT`, `C_OP_WITHOUT` e `C_OP_EXCEPT` existem na base, mas **o parser nunca os usa**.
- Negação (`não`), `sem`, `menos/exceto`, `com`, `para`, `de`, `e`, artigos, ordinais, cardinais e pronomes estão fixos em `parser/Grammar.ts` e em comparações `rawWord() === 'com'` dentro de `DomainParser`.
- `parseCreate` usa a string literal `'C_SPAT_INSIDE'`.

Exigido:
- Mova essas classes fechadas para a base de conhecimento como lexemas com classe gramatical (`DETERMINER`, `ORDINAL`, `CARDINAL`, `PRONOUN`, `PREPOSITION`, `CONJUNCTION`, `OPERATOR`) e sentido (OperatorConcept, valor ordinal ou cardinal, traços de gênero e número).
- `Grammar.ts` passa a ser **derivado** dos dados na construção do índice.
- O parser consulta categorias e conceitos (`OPERATOR:NEGATION`, `OPERATOR:EXCEPT`, `PREPOSITION:COMITATIVE`…), nunca strings literais.
- A relação implicada por "com … dentro" vem de dados.
- **Aceitação:**
  - adicionar `salvo` como forma de `C_OP_EXCEPT` **apenas via dados** (teste e painel) faz `apague todos os botões salvo o primeiro` funcionar sem tocar no parser;
  - o mesmo para um novo ordinal e uma nova preposição espacial;
  - um teste estático falha se `DomainParser.ts` contiver comparação com literal de palavra portuguesa.

### A2. Negação com escopo em qualquer posição (§11)

- Hoje só `não` no início da frase vira NO_OP.
- `crie um botão e não apague a caixa` → `UNCONSUMED_INPUT`, porque `splitCommands` só separa quando "e" é seguido de verbo.
- Exigido:
  - coordenação de comandos também quando "e" é seguido de negação + verbo;
  - escopo da negação limitado ao comando ou sintagma dentro do qual ela ocorre;
  - `não` diante de propriedade/valor dentro de CREATE/UPDATE, por exemplo `deixe o botão sem borda e não azul`: defina e documente a semântica, ou emita `UNSUPPORTED_OPERATION`.
- **Aceitação:**
  - `crie um botão e não apague a caixa` → cria o botão, não apaga nada, e o AST mostra o segundo comando como NO_OP;
  - `não crie um botão` continua NO_OP.

### A3. Múltiplas propriedades e coordenação de modificadores (§29)

Hoje falham:
- `crie um botão com fundo azul e borda vermelha` (UNCONSUMED_INPUT; "com" seguido de propriedade não é tratado);
- `crie uma caixa azul e com borda 2px`;
- `crie uma caixa azul e redonda`.

Exigido:
- Em CREATE e UPDATE, `com` + (propriedade | grupo | valor) é mutação da entidade corrente.
- `e` + (propriedade | valor) coordena mutações sobre a mesma entidade.
- Ligação adjetivo→entidade com evidência de concordância de gênero e número, usada como feature de score, não como regra rígida.
- Adicione `C_PROP_BORDER_RADIUS` (categoria SIZE, com valor nomeado `redondo/redonda`) **via dados**, com mapeamento no renderer.
- **Aceitação:**
  - as três frases produzem as mutações corretas na mesma entidade;
  - `deixe o botão vermelho com borda azul de 3px` gera bg, borderColor e borderWidth.

### A4. Texto/rótulo de componentes

- `crie um botão com texto "Ok"` hoje é interpretado como "criar uma entidade TEXT dentro do botão" e falha.
- `crie um botão escrito "Ok"` → UNKNOWN_WORD.
- Exigido:
  - propriedade de conteúdo textual (`C_PROP_TEXT_CONTENT`, categoria TEXT) com formas `texto`, `rótulo`, `escrito`, `com o texto`, `que diz`;
  - desambiguação por dados: se a entidade corrente aceita a propriedade de conteúdo, `com texto "X"` é propriedade; caso contrário (ex.: caixa), é entidade filha TEXT;
  - `mude o texto do botão "Entrar" para "Sair"` atualiza o conteúdo.
- **Aceitação:** as frases acima funcionam, e `crie uma caixa com texto "Olá"` cria uma caixa com um TEXT filho.

### A5. Códigos de diagnóstico exigidos (§20)

- Hoje `INVALID_VALUE_CATEGORY`, `INVALID_CONTAINMENT` e `UNSUPPORTED_OPERATION` **nunca** são emitidos, e `INVALID_PROPERTY` aparece como `INVALID_PROPERTY_FOR_ENTITY`.
- Exigido:
  - padronize os nove códigos do §20 (`UNKNOWN_WORD`, `AMBIGUOUS_REFERENCE`, `TARGET_NOT_FOUND`, `INVALID_PROPERTY`, `INVALID_VALUE_CATEGORY`, `INVALID_CONTAINMENT`, `UNRESOLVED_PRONOUN`, `AMBIGUOUS_SENSE`, `UNSUPPORTED_OPERATION`);
  - subcódigos são permitidos, em campo `subcode`.
- Todo diagnóstico de qualquer camada (inclusive planner, resolver e validator) traz o trecho e o offset de origem. Para isso, **os nós do AST devem carregar `span: {start, end}`** da entrada, e o plano deve carregar o span do nó do AST que o originou.
- **Aceitação:** um teste para cada código, conferindo severity, code, layer, span e candidates.

### A6. Métricas reais (§27)

- Hoje `eval/metrics.ts` compara só o tipo do comando, os tipos criados, a árvore final e os códigos de diagnóstico.
- O que o RELATORIO chama de "entity attachment accuracy" é só a lista de tipos criados.
- Exigido — métricas separadas, por caso e agregadas, por conjunto:
  - lexical resolution accuracy (lexema esperado por token de conteúdo);
  - concept/sense accuracy;
  - entity attachment accuracy (pares `(fonte, relação, alvo)` esperados × obtidos);
  - property/value binding accuracy (triplas `(entidade, propriedade, valor)`);
  - reference resolution accuracy (nós esperados, por índice de pré-ordem do seed, × resolvidos);
  - AST exact match (assinatura canônica);
  - execution-plan exact match (assinatura com IDs normalizados);
  - end-to-end command success;
  - false-positive rate (casos que deviam falhar e mutaram);
  - ambiguity detection rate (sobre casos **realmente ambíguos**; hoje não existe nenhum e a métrica dá 0%).
- Painel **Métricas**: mostra cada uma, a matriz de erros por camada e a lista "onde o motor erra".

### A7. Dataset versionado e particionado (§28)

- Hoje: 34 casos em TypeScript, sem AST nem plano esperados, divididos em regressão/composição/negativos.
- Exigido:
  - dataset em **arquivos JSON versionados** (`src/eval/data/dev.json`, `regression.json`, `final.json`, com campo `version` e `schemaVersion`);
  - cada registro: `id`, `input`, `seed`, `selection`, `discourse` (comandos prévios, quando necessário), `expected.ast`, `expected.plan`, `expected.resolvedReferences`, `expected.bindings`, `expected.attachments`, `expected.finalTree`, `expected.diagnostics`, `expectError`, `tags`;
  - tamanho mínimo:

    | Conjunto | Mínimo | Conteúdo obrigatório |
    |---|---|---|
    | dev | 60 | — |
    | regression | 80 | os 14 obrigatórios, as 8 variações do §36, a sequência do §38 e um caso para cada defeito D1–D11 |
    | final (held-out) | 40 | escrito **antes** das correções e não usado para ajustar regras |
    | negativos (entre os conjuntos) | 25 | — |
    | realmente ambíguos (entre os conjuntos) | 10 | — |

  - os resultados esperados devem ser escritos por raciocínio sobre a semântica, **nunca** copiados da saída do motor;
  - um teste garante que o conjunto final não é importado por nenhum código de regras.

### A8. Testes e2e por camada (§24)

- Hoje `tests/e2e.test.ts` só chama `evaluate()`. O RELATORIO afirma "asserção por camada", o que é falso.
- Exigido: para cada um dos 14 casos, asserções explícitas de:
  - tokens esperados (raw e normalizados, com offsets);
  - MWEs;
  - conceitos relevantes;
  - AST;
  - referências resolvidas;
  - plano;
  - mutação final (árvore, propriedades e ordem dos nós);
  - undo e redo.

### A9. Relações espaciais por posição real

- `ReferenceResolver.applyDirection` existe, mas `rect` nunca é preenchido. "o botão da direita" cai em filtro sem ordenação.
- Exigido:
  - o `DocumentRenderer` mede o layout (`getBoundingClientRect`) após renderizar e reporta `rect` ao store como **metadado fora do histórico** (não cria entrada de undo);
  - formas lexicais via dados: `da direita`, `da esquerda`, `de cima`, `de baixo`, `mais à direita`;
  - sem `rect` (testes em Node), o resolver usa uma ordem determinística documentada e emite INFO.
- **Aceitação:** teste unitário com `rect` sintético e verificação no navegador.

### A10. Painel administrativo (requisitos do PROMPT.txt)

- **Persistência:** hoje recarregar a página perde base, treino, histórico e configurações.
  - Persista com IndexedDB ou localStorage, com try/catch em toda leitura e escrita, e funcionamento correto quando o storage falha.
  - Restaurar o padrão de fábrica.
- **Dados:** edição completa (não só adicionar e remover) de SurfaceForms, lexemas, conceitos de **todos** os tipos, MWEs, classes gramaticais (A1) e regras/relações (constraints de containment, bindings padrão e de grupo).
  - Validação de integridade ao salvar: lexema apontando para conceito inexistente, MWE duplicada, etc.
- **Testes:** além das suítes de avaliação, mostrar o resultado dos testes unitários.
  - Adicione o script `npm run test:report` (`vitest run --reporter=json --outputFile=public/test-report.json`); o painel lê e exibe esse JSON com data da execução.
- **Treinamento:** "corrigir interpretação" salva o registro no formato do A7, no conjunto `dev` ou `regression` (nunca no `final`).
- **Histórico:** comparar duas versões da base **e** os resultados de métricas entre versões (regressões destacadas).
- Toda alteração deve valer imediatamente no chat e no preview.

### A11. Benchmark

- Mantenha o benchmark existente (100 / 1.000 / 10.000 / 100.000 SurfaceForms, Trie com milhares de MWEs).
- Acrescente o tempo de geração de candidatos aproximados (D4) com 100.000 formas. Deve ser via índice: prove que o custo não cresce linearmente com o dicionário, medindo nos quatro tamanhos.

---

## 4. ORDEM DE TRABALHO

1. Leia `LEXICAL.txt`, `PROMPT.txt`, `RELATORIO.md` e todo `src/`.
2. Escreva o conjunto **final (held-out)** do A7 antes de qualquer correção, commite mentalmente que não vai tocá-lo, e registre o score inicial.
3. Para cada defeito D1–D11: teste vermelho → correção → teste verde → `npm test` completo.
4. A1 (gramática como dados) cedo, porque afeta o parser inteiro; depois A2–A5.
5. A6–A8 (métricas, dataset, e2e por camada).
6. A9–A11 (espacial, painel, benchmark).
7. Rode `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:report`.
8. Validação real (§38 do PROMPT.txt): rode `npm run dev` e execute no chat, conferindo árvore antes e depois, AST, plano, propriedades, ordem dos nós, undo e redo:
   - a sequência do §38;
   - as reproduções D1, D2, D3, D7, D8, D9, D11.

   Se você não tiver navegador, escreva um script `scripts/validate-sequences.ts` (rodável com `npx vite-node`) que faz o mesmo contra `SemanticEngine` e imprime o estado após cada comando, e diga explicitamente que a validação visual não foi feita.
9. Reescreva o `RELATORIO.md` (seção 5).

---

## 5. RELATÓRIO FINAL OBRIGATÓRIO

Reescreva `RELATORIO.md` com dados **gerados pela execução real**. Inclua um script que produza as tabelas, sem números digitados à mão:

- Para cada D1–D11 e A1–A11:
  - status (corrigido / parcial / não feito);
  - arquivos alterados;
  - teste que cobre o item;
  - saída real antes e depois.
- Contagem de testes: total, aprovados, reprovados, pulados.
- Todas as métricas do A6, separadas por conjunto (dev / regression / final), com a matriz de erros por camada. Score do conjunto final **antes e depois**.
- Benchmark completo.
- Exemplos reais de AST e ExecutionPlan com spans.
- Limitações que ainda restam, sem esconder nada.
- Lista das afirmações do relatório anterior que eram falsas e como ficaram.

Não declare suporte a nada que não tenha teste. Se algo não puder ser feito, diga o motivo técnico.

---

## 6. FASE FINAL (somente depois de tudo acima verde)

Limitações que o próprio `RELATORIO.md` declarou. Implemente pelos mesmos mecanismos gerais, com testes e casos no dataset:

- oração relativa simples: `crie uma caixa que tenha borda azul`, `apague o botão que está dentro da caixa`;
- anáfora definida: `a mesma`, `aquela`, `essa caixa` (saliência);
- elipse nominal com propriedade: `apague o azul` (antecedente de tipo pela saliência + filtro de propriedade);
- quantificadores vagos: `alguns`, `vários`. Emita `UNSUPPORTED_OPERATION` ou `AMBIGUOUS_REFERENCE` com explicação, em vez de inventar uma cardinalidade.

---

## 7. CRITÉRIO DE PRONTO

Só está pronto quando **todos** os itens forem verdadeiros:

- [ ] Todas as reproduções da seção 2 se comportam como no critério de aceitação, com teste automatizado.
- [ ] Nenhuma exceção chega à UI. Console do navegador limpo nas sequências de validação.
- [ ] Nenhuma palavra fora do domínio gera mutação. Nenhuma ação destrutiva é resolvida por aproximação.
- [ ] Gramática, operadores e sinônimos estendíveis só por dados (teste do `salvo` passa).
- [ ] `analyze` ≡ `execute` em plano, para todo o dataset.
- [ ] Ordinais e referências seguem a ordem do documento e a saliência do discurso.
- [ ] Os nove códigos do §20 são emitidos e testados, com spans.
- [ ] Métricas do §27 completas, por conjunto, com o conjunto final intocado.
- [ ] Painel com persistência, edição completa e relatório de testes unitários.
- [ ] `npx tsc --noEmit`, `npm test` e `npm run build` limpos.
- [ ] `RELATORIO.md` honesto, gerado a partir da execução real.
