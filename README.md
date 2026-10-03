# Motor Semântico — Compilador de Domínio PT-BR para Pagebuilder

Compilador semântico determinístico que converte comandos em português natural
em operações estruturadas e validadas sobre um documento de pagebuilder.

```
crie uma caixa azul com um botão vermelho dentro
  → CREATE container {backgroundColor: #2563eb}
    CREATE button    {backgroundColor: #dc2626}
    PLACE button CHILD_OF container
```

A meta não é reconhecer frases específicas: é implementar os mecanismos gerais
que fazem novas combinações funcionarem a partir dos dados lexicais, da
ontologia, das regras semânticas e do estado real do documento.

## Início rápido

```bash
npm install
```

```bash
npm run dev
```

Abra `http://localhost:5173`.

## Testes

```bash
npm test
```

158 testes em 13 arquivos: lexical, parser, referências, planejamento, runtime,
end-to-end, composição combinatória, robustez, persistência, rendering,
métricas e benchmark.

```bash
npx vitest run tests/bench-report.test.ts
```

## Build

```bash
npm run build
```

## Arquitetura

O pipeline completo, da entrada bruta à mutação de runtime:

```
RAW INPUT
  → NON-DESTRUCTIVE LEXER          (preserva acentos, offsets, strings, hex, CSS)
  → GRAMMATICAL NORMALIZER         (contrações PT-BR, limites preservados)
  → MULTIWORD MATCHER              (Trie, longest-match)
  → LEXICAL RESOLUTION             (exato; fonético apenas como fallback)
  → DOMAIN PARSER                  (ação, entidades, propriedades, quantidade,
                                    ordinal, coordenação, containment, espaço,
                                    negação, exclusão, pronomes, referências)
  → SEMANTIC AST                   (serializável, sem DOM, sem ciclos)
  → WORD-SENSE + PROPERTY BINDING  (grupo/propriedade/categoria)
  → DOCUMENT REFERENCE RESOLVER    (conceito ≠ instância)
  → CONSTRAINT VALIDATOR           (affordances realmente executadas)
  → EXECUTION PLANNER              (plano determinístico)
  → EXECUTION PLAN
  → OPERATION-SPECIFIC EXECUTOR    (CREATE / UPDATE / DELETE / MOVE / QUERY)
  → BUILDER RUNTIME                (transação, undo/redo)
```

Invariante estrutural:

```
SurfaceForm ≠ Lexeme ≠ Concept ≠ Mention ≠ DocumentInstance ≠ SemanticAST
            ≠ ExecutionPlan ≠ RuntimeMutation
```

## Estrutura

```
src/
├── engine/
│   ├── lexical/       RawLexer, GrammarNormalizer, MultiwordTrie,
│   │                  PortuguesePhonetic, LexicalIndex
│   ├── ontology/      Concept (união discriminada)
│   ├── parser/        SemanticToken(Builder), SemanticCursor, DomainParser,
│   │                  PropertyBinder, DiscourseContext, Grammar
│   ├── ast/           AST semântica
│   ├── document/      DocumentModel, ReferenceResolver
│   ├── planning/      ExecutionPlan, ExecutionPlanner, ConstraintValidator
│   ├── runtime/       BuilderRuntimeAdapter, ExecutionEngine
│   ├── SemanticCompiler.ts    pipeline + trace de debug
│   └── SemanticEngine.ts      fachada de composição
├── builder/           BuilderStore (estado vivo + undo/redo), adapter, CSS
├── knowledge/         base persistível (JSON) + store versionado
├── eval/              dataset, métricas, assinaturas, benchmark
└── ui/                chat + preview + painel administrativo
```

## Interface

**Chat + Preview** — escreva um comando, execute (ou apenas analise) e veja o
preview renderizado em tempo real a partir do documento real. O inspetor mostra
tokens, MWEs, candidatos lexicais, AST, ExecutionPlan, diagnósticos e as
mutações efetivamente aplicadas.

**Painel administrativo** — áreas separadas para Dados, Treinamento, Testes,
Métricas, Erros/Diagnósticos, Configurações e Histórico. Usa o mesmo motor e os
mesmos dados da aplicação; toda alteração é validável imediatamente pelo chat.

## Extensibilidade

Adicionar uma palavra, flexão, cor ou alias **não exige alterar o parser** —
apenas dados:

```ts
store.addConcept({ kind: 'VALUE', id: 'C_VAL_PINK',
                   valueCategory: 'COLOR', literal: '#ec4899' });
store.addLexeme({ id: 'LEX_ROSA', lemma: 'rosa', pos: 'ADJECTIVE',
                  senseConceptIds: ['C_VAL_PINK'] });
store.addSurfaceForm({ id: 'SF_ROSA', rawText: 'rosa',
                       lexemeId: 'LEX_ROSA', formType: 'CANONICAL' });
engine.rebuild();
// "crie um botão rosa" passa a funcionar
```

Também disponível pela aba **Dados** do painel.

## Segurança de execução

O motor nunca executa texto recebido do usuário: sem `eval`, sem `new Function`,
sem geração dinâmica de JavaScript. Dados semânticos viram operações tipadas do
runtime. Regex é usado apenas pelo lexer para classes lexicais (números,
unidades, hex).

## Documentação

Ver [`RELATORIO.md`](./RELATORIO.md) para o relatório completo: arquitetura,
integração, contagem de testes, métricas, benchmark, provas de execução,
limitações reais e casos ainda não suportados.
