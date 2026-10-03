# PROMPT DE CORREÇÃO 2 — Conclusão integral e auditável

Este prompt continua o trabalho de `PROMPT_CORRECAO.md`, que segue valendo integralmente: regras, defeitos D1–D11, requisitos A1–A11, fase final e critério de pronto.

Uma auditoria independente do estado do projeto em **2026-10-03 às 11:51** verificou o que já está correto, o que está quebrado, o que falta e uma violação de processo que precisa ser resolvida antes de tudo.

Leia este documento inteiro. Depois releia `PROMPT_CORRECAO.md`, `PROMPT.txt` e `LEXICAL.txt`. Trabalhe direto no código, sem parar em plano e sem pedir confirmação entre etapas.

Projeto: `C:\Codex-Shared\Lexical` (Windows). Stack: TypeScript, React 18, Vite 5, Vitest 2.

---

## 0. O QUE A AUDITORIA CONFIRMOU COMO CORRETO — não regredir

Estes comportamentos foram verificados executando o motor real. Todos precisam continuar valendo, cobertos por teste:

| Item | Comportamento verificado |
|---|---|
| D1 | `crie uma caixa banana` → `crie um botão` → `apague ela` resulta em `UNRESOLVED_PRONOUN`, e o botão permanece. Pronome após undo resulta em `UNRESOLVED_PRONOUN`. |
| D2 | Ordinais seguem a ordem do documento (pré-ordem) depois de MOVE. |
| D3 | `mude a cor de fundo do botão para 2px` dá `INVALID_VALUE_CATEGORY`; `crie um botão 2px` dá `INVALID_PROPERTY`. Nenhuma exceção. |
| D4 | `crie um botão rosa` é bloqueado. `vermelo` vira `C_VAL_RED` com WARNING. Verbo destrutivo digitado errado é bloqueado. `apaga` é reconhecido por correspondência exata. |
| D5 | `apague todos` e `apague o primeiro` sem contexto dão `INCOMPLETE_REFERENCE`. |
| D6 | `analyze` produz o mesmo plano que `execute`. |
| D7 | `apague os dois últimos botões` apaga os 2 últimos. |
| D8 | `crie uma caixa dentro de outra caixa` em documento vazio cria duas caixas aninhadas. |
| D9 | Mover um ancestral para dentro do descendente dá `INVALID_CONTAINMENT`, sem alterar o documento. |
| D11 | `crie uma caixa` → `deixe a borda azul` funciona (seleção após comando). |
| A2 | `crie um botão e não apague a caixa` cria o botão e marca o 2º comando como NO_OP. |
| A3/A4 | Funcionam: `crie um botão com fundo azul e borda vermelha`, `crie uma caixa azul e redonda`, `crie um botão com texto "Ok"`, `crie um botão escrito "Ok"`, `remova o botão`. |
| Determinismo | Mesma entrada e mesmo estado produzem o mesmo plano. Undo/redo da frase como unidade. |

---

## 1. PRIMEIRA TAREFA OBRIGATÓRIA — auditabilidade e integridade do held-out

### 1.1 Versionamento antes de qualquer alteração

O projeto não está sob git, e isso impede auditar o que mudou. Antes de editar qualquer arquivo:

```
git init
git add -A
git commit -m "baseline: estado auditado em 2026-10-03 11:51"
```

Confira se `.gitignore` contém `node_modules/` e `dist/`. Daqui em diante:

- faça **um commit por item** corrigido;
- a mensagem do commit começa com o ID do item (ex.: `B1: …`, `A9: …`);
- nunca reescreva o histórico: sem `--amend` em commits anteriores, sem `rebase`, sem `reset --hard`.

### 1.2 Violação encontrada: o conjunto held-out foi reescrito durante as correções

**Evidência:**
- `scripts/score.ts` (criado às 11:28) já importava `src/eval/data/final.json`, então o arquivo existia nesse horário;
- `final.json` foi regravado às **11:49:28**, depois de `traversal.ts` (11:27), `defects.test.ts` (11:29) e `ApproximateMatcher.ts` (11:40);
- `regression.json` foi alterado às 11:50, num momento em que havia testes falhando.

O `PROMPT_CORRECAO.md` exigia que o conjunto final fosse escrito **antes** das correções e **nunca** usado nem alterado para ajustar regras. Como não havia git, é impossível saber o que mudou. Portanto:

1. Escreva em `src/eval/data/CHANGES.md` uma declaração honesta do que foi alterado em `final.json` e `regression.json` depois de criados: quais registros, valor esperado antigo × novo e motivo. Se você não souber reconstruir, diga isso explicitamente. Não invente.
2. O `final.json` atual está **comprometido**:
   - renomeie-o para `src/eval/data/final-v1-compromised.json`;
   - trate-o daqui em diante como mais um conjunto de regressão;
   - relate as métricas dele separadamente, rotuladas como "comprometido".
3. **Não crie um novo held-out.** A avaliação final será feita pelo auditor com um conjunto externo que você não verá. Para isso:
   - `scripts/score.ts` deve aceitar um caminho arbitrário: `npx vite-node scripts/score.ts --dataset <caminho.json> [--out <relatorio.json>]`;
   - o arquivo é validado pelo `datasetSchema.ts`, e as métricas do A6 são impressas e gravadas em JSON;
   - documente o schema em `src/eval/data/SCHEMA.md` (campos obrigatórios e opcionais, formato de `finalTree`, de `expected.ast` e `expected.plan` com IDs normalizados, de `resolvedReferences` por índice de pré-ordem do seed);
   - **não leia, não crie e não altere nada dentro de uma pasta `audit/`**, se ela existir.
4. **Regra para valores esperados daqui em diante.** Qualquer alteração de valor esperado em `dev.json`, `regression.json` ou em asserções de testes existentes exige:
   - uma entrada em `CHANGES.md` (id, antigo, novo, justificativa semântica);
   - um commit próprio com prefixo `DATASET:` ou `TEST-EXPECTATION:`.

   Ajustar o esperado para coincidir com a saída do motor, sem justificativa semântica independente, é proibido.
5. **Não enfraqueça testes para fazê-los passar**: nada de remover asserções, afrouxar regex ou mudar `toBe` para `toContain`. Isso vale em especial para `tests/architecture.test.ts`.

---

## 2. TESTES FALHANDO NO MOMENTO DA AUDITORIA — corrigir o código

Resultado de `npm test` às 11:51: **242 testes, 236 passam, 6 falham**, todos em `tests/architecture.test.ts`:

1. `A1 — DomainParser não compara palavras portuguesas literais` → remova do parser **todas** as decisões baseadas em literal de palavra, inclusive formas indiretas: `Set` de palavras, `switch` sobre string, `includes('…')`, mapas locais. As decisões devem vir de categorias e conceitos da base de conhecimento (`GrammarIndex`).
2. `A5 — AMBIGUOUS_REFERENCE é emitido com camada e span`
3. `A5 — TARGET_NOT_FOUND é emitido com camada e span`
4. `A5 — UNSUPPORTED_OPERATION é emitido com camada e span`
5. `A5 — todo diagnóstico de qualquer camada traz span dentro da entrada`

   Para os itens 2 a 5: o resolver, o planner e o validator precisam receber o `span` do nó do AST que originou o passo do plano. Cada passo do `ExecutionPlan` carrega `sourceSpan`. Os diagnósticos dessas camadas usam esse span. Nenhum diagnóstico sai sem `start`/`end` válidos (`0 ≤ start ≤ end ≤ input.length`).

6. `A7 — contém ao menos 25 casos negativos e 10 genuinamente ambíguos` → acrescente casos a `dev.json` e `regression.json` (nunca ao held-out), escritos por raciocínio sobre a semântica.
   - "Genuinamente ambíguo" quer dizer: mais de uma leitura plausível, ou referência que casa com vários nós sem saliência. O esperado é um diagnóstico `AMBIGUOUS_REFERENCE` ou `AMBIGUOUS_SENSE`, sem mutação.
   - Use variedade real: verbo com dois sentidos sem pista sintática, definido singular com 2+ candidatos e discurso vazio, `outra caixa` com 3 caixas e sem saliência, pronome com dois antecedentes compatíveis em gênero e número, e assim por diante.

---

## 3. DEFEITOS NOVOS ENCONTRADOS NA AUDITORIA

Para cada um: teste vermelho primeiro, depois a correção, depois o teste verde e o commit.

### B1. Verbo desconhecido gera `NEGATED_ACTION` falso

**Reprodução** (documento com um botão):

| Entrada | Diagnósticos atuais |
|---|---|
| `pague o botão` | `ERROR:UNKNOWN_WORD ERROR:UNKNOWN_WORD INFO:NEGATED_ACTION` |
| `apgue o botão` | `ERROR:UNKNOWN_WORD ERROR:UNKNOWN_WORD INFO:NEGATED_ACTION` |
| `mva o botão para depois da caixa` | `ERROR:UNKNOWN_WORD ERROR:UNKNOWN_WORD INFO:NEGATED_ACTION` |

Não existe negação nessas frases. O bloqueio está correto, mas o diagnóstico é falso. Provavelmente um comando sem ação reconhecida está virando `NO_OP` com motivo de negação.

**Correção:**
- `NO_OP` com `NEGATED_ACTION` só quando existe um operador de negação com escopo sobre uma ação reconhecida.
- Comando sem ação reconhecida → ERROR `UNKNOWN_WORD` **uma única vez**, no token do verbo, com as sugestões aproximadas no campo `candidates` e na mensagem (ex.: `apgue` → sugestão `apague` / `C_ACT_DELETE`, bloqueada por ser destrutiva).

**Aceitação:**
- as três frases não emitem `NEGATED_ACTION`;
- `apgue o botão` traz `apague` entre as sugestões;
- `não apague o botão` continua `NEGATED_ACTION`.

### B2. Diagnósticos duplicados

**Reprodução:**
- `UNKNOWN_WORD` aparece 2× (B1);
- `mude a cor de fundo do botão para 2px` → `INVALID_VALUE_CATEGORY` 2×;
- `crie um botão 2px` → `INVALID_PROPERTY` 2×;
- `deixe o texto do botão vermelho` → `INVALID_VALUE_CATEGORY` 2×.

**Correção:**
- Encontre a causa raiz, provavelmente a mesma lista de diagnósticos mesclada duas vezes entre parser, planner, validator e `SemanticCompiler`.
- Cada problema é reportado **uma vez**, pela camada que o detectou.
- Um filtro de deduplicação por `(code, subcode, start, end, layer)` só é aceitável como proteção adicional, depois de corrigida a causa.

**Aceitação:** teste por propriedade sobre todas as frases de `dev.json` + `regression.json` + `final-v1-compromised.json`: nenhum par de diagnósticos com mesmo `code`, `start`, `end` e `layer`.

### B3. "texto" como grupo de propriedades

**Reprodução:** `crie um botão` → `deixe o texto do botão vermelho` → `INVALID_VALUE_CATEGORY`. Em português, a leitura natural é "cor do texto = vermelho".

**Correção, pelo mesmo mecanismo de `borda`:**
- Crie um `PropertyGroupConcept` para texto, com `bindingByValueCategory`:
  - COLOR → `C_PROP_TEXT_COLOR`;
  - TEXT → `C_PROP_TEXT_CONTENT`;
  - SIZE → tamanho da fonte (adicione `C_PROP_FONT_SIZE` via dados, com mapeamento no renderer).
- A palavra "texto" mantém os sentidos de entidade TEXT e de grupo. A escolha entre eles é feita pelo parser por contexto sintático e categoria do valor, com score registrado. Sem `if`.

**Aceitação:**
- `deixe o texto do botão vermelho` → `textColor`;
- `mude o texto do botão para "Sair"` → conteúdo;
- `deixe o texto do botão com 18px` → `fontSize`;
- `crie um texto vermelho` → entidade TEXT com sua cor padrão;
- `crie uma caixa com texto "Olá"` → caixa com TEXT filho.

### B4. Candidatos duplicados no mesmo token

**Reprodução:** o trace de `botão` mostra `C_ENT_BUTTON[EXACT:1.00] C_ENT_BUTTON[EXACT:0.96]`. As formas `botão` e `botao` (COLLOQUIAL) normalizam para a mesma chave.

**Correção:**
- Mescle candidatos por `(conceptId, lexemeId)`, ficando com o maior score e registrando as SurfaceForms de origem.
- Formas ASCII que só diferem por diacrítico são redundantes, porque a indexação já remove diacríticos. Remova-as da base ou marque-as e ignore-as na construção do índice.

**Aceitação:** nenhum token tem dois candidatos com o mesmo `conceptId`.

### B5. A prova de extensibilidade só por dados não existe

`salvo` foi adicionado direto em `knowledgeBase.ts`. O A1 pedia a **prova em teste** de que uma palavra nova funciona só por dados, sem tocar no código.

**Correção:** crie `tests/extensibility.test.ts`. Usando apenas a API de `KnowledgeBaseStore` em tempo de execução, mais `engine.rebuild()`, sem editar `knowledgeBase.ts`, adicione e prove:
1. uma forma de exceção nova, ex. `tirando` → `C_OP_EXCEPT`: `apague todos os botões tirando o primeiro` funciona;
2. um ordinal novo, ex. `vigésimo`;
3. uma MWE espacial nova, ex. `logo após` → `C_SPAT_AFTER`;
4. um sinônimo verbal novo, ex. `elimine` → DELETE;
5. uma cor nova (`C_VAL_PINK` + `rosa`): `crie um botão rosa` passa a funcionar.

O teste falha se algum desses itens exigir mudança em arquivos de `src/engine/`.

---

## 4. REQUISITOS DE `PROMPT_CORRECAO.md` AINDA NÃO ENTREGUES

Na auditoria, estes itens **não existiam**. Implemente-os conforme a especificação completa daquele arquivo:

- **A9 — posição real:** `DocumentRenderer` mede `getBoundingClientRect` e reporta `rect` ao store como metadado fora do histórico; formas `da direita`, `da esquerda`, `de cima`, `de baixo`, `mais à direita` via dados; fallback determinístico documentado + INFO em Node; teste com `rect` sintético.
- **A10 — painel administrativo:**
  - persistência em IndexedDB ou localStorage (com try/catch em toda leitura e escrita), cobrindo base, configurações, dataset de treino e histórico de versões;
  - "restaurar padrão de fábrica";
  - edição completa de todos os tipos de conceito, MWEs, classes gramaticais e regras/constraints/bindings, com validação de integridade;
  - script `npm run test:report` (`vitest run --reporter=json --outputFile=public/test-report.json`), exibido na aba Testes com data;
  - aba Treinamento salva só em `dev` ou `regression`;
  - aba Histórico compara versões da base **e** métricas entre versões, destacando regressões.
- **A11 — benchmark:** tempo de geração de candidatos aproximados com 100 / 1.000 / 10.000 / 100.000 SurfaceForms, mostrando que não cresce linearmente (índice, sem varredura).
- **A6 / A8:** confirme que **todas** as métricas do A6 aparecem no painel Métricas e no `scripts/score.ts`, por conjunto, com matriz de erros por camada. Confirme também que cada um dos 14 casos obrigatórios tem asserções explícitas de tokens (com offsets), MWEs, conceitos, AST, referências resolvidas, plano, mutação final, undo e redo.
- **Fase final (seção 6 de `PROMPT_CORRECAO.md`):** oração relativa simples, anáfora definida (`a mesma`, `aquela`, `essa caixa`), elipse com propriedade (`apague o azul`), quantificadores vagos com diagnóstico. Somente depois de todo o resto verde.

---

## 5. VALIDAÇÃO NA APLICAÇÃO REAL

1. Crie `scripts/validate-sequences.ts` (rodável com `npx vite-node`). Ele executa contra o `SemanticEngine` real e imprime, para cada comando: árvore antes, frase, AST, plano, diagnósticos, árvore depois, propriedades e ordem dos nós, além de undo e redo ao final de cada sequência. Sequências:
   - a do §38 do `PROMPT.txt`;
   - todas as reproduções da seção 0 deste arquivo;
   - todas as reproduções de B1–B5.
2. Rode `npm run dev` e repita no chat do navegador, no mínimo: a sequência do §38, a reprodução do D3 e a do B1.
   - O console do navegador deve ficar sem erros.
   - Toda falha aparece no chat como "Bloqueado: …".
   - Confira a persistência: recarregar a página mantém base, configurações e treino.
   - Se você não tiver acesso a navegador, declare isso explicitamente no relatório. Não afirme validação visual que não fez.
3. Ao final, todos estes comandos devem passar limpos:

```
npx tsc --noEmit
npm test
npm run build
npm run test:report
npx vite-node scripts/score.ts --dataset src/eval/data/regression.json
```

4. Não deixe arquivos de depuração no projeto (ex.: `tests/dbg.test.ts`, que existiu durante o trabalho).

---

## 6. RELATÓRIO FINAL

Reescreva `RELATORIO.md`. Tudo que é número ou saída deve ser **gerado por script a partir da execução real**. Inclua:

1. Tabela D1–D11, A1–A11 e B1–B5: status (corrigido / parcial / não feito), commit(s), teste(s) que cobrem, saída real antes × depois.
2. Conteúdo integral de `src/eval/data/CHANGES.md` (seção 1.2).
3. Contagem de testes: total, aprovados, reprovados, pulados.
4. Métricas do A6 por conjunto (`dev`, `regression`, `final-v1-compromised`), com a matriz de erros por camada.
5. Benchmark completo, incluindo a busca aproximada.
6. Exemplos reais de AST e ExecutionPlan com spans.
7. Saída de `scripts/validate-sequences.ts`.
8. O que foi validado no navegador e o que não foi.
9. Limitações restantes, sem omissões.
10. `git log --oneline` completo desde o baseline.

Não declare suporte a nada sem teste. Não esconda falhas.

---

## 7. CRITÉRIO DE PRONTO

- [ ] Repositório git com baseline e um commit por item; nenhum histórico reescrito.
- [ ] `CHANGES.md` declarando as alterações do held-out e da regressão; `final.json` renomeado para comprometido; `score.ts` aceita dataset externo; nada lido ou criado em `audit/`.
- [ ] Nenhum teste enfraquecido; toda mudança de expectativa justificada em `CHANGES.md`.
- [ ] Os 6 testes de `architecture.test.ts` passam por correção de código.
- [ ] B1–B5 corrigidos, com testes.
- [ ] Tudo da seção 0 continua valendo.
- [ ] A6, A8, A9, A10, A11 e a fase final entregues conforme `PROMPT_CORRECAO.md`.
- [ ] `tsc`, `npm test`, `build`, `test:report` e `score` limpos.
- [ ] Validação por script feita; validação no navegador feita ou declarada como não feita.
- [ ] `RELATORIO.md` gerado a partir da execução real.
