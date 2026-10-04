# Análise geral de frases do português

## Estado da entrega

Implementação na branch `codex/sintaxe-significado`, iniciada em `591733f` (`claude/morfologia-integrada`). A camada geral é somente leitura e não substitui o compilador de comandos do construtor. O exemplo **“Eu quero tomar café.”** produz `eu/PRON`, `quero/querer/VERB`, `tomar/tomar/VERB`, `café/café/NOUN`; sujeito `[1]`; núcleo do predicado `[2,3]`; predicado completo “quero tomar café”; e o mesmo nó `eu` em `:ARG0` de `querer.DESEJAR` e de `tomar.INGERIR`.

Linha de base antes das edições: `npm test` → **30 arquivos, 413 testes aprovados**. A última verificação completa está documentada abaixo. Os commits `TEST-EXPECTATION` foram deliberadamente vermelhos, conforme a escolha do solicitante; os commits de implementação foram verificados em verde. Nenhum gabarito antigo foi alterado. As correções de expectativas novas estão justificadas em [CHANGES.md](research/morfologia/CHANGES.md).

## Fontes e decisões

| Fonte consultada | Decisão sustentada | Aplicação |
|---|---|---|
| [UD: classes UPOS](https://universaldependencies.org/u/pos/index.html), [traços](https://universaldependencies.org/u/feat/index.html) | Inventário `PRON`, `DET`, `ADP`, `AUX` etc. e traços como `Person`, `Number`, `Mood`, `VerbForm`. | `closed-class.json`, `LanguageInflector.ts`, `LexicalAnalyzer.ts`, `Tagger.ts`. |
| [UD: relações](https://universaldependencies.org/u/dep/index.html), [cópula](https://universaldependencies.org/u/dep/cop.html), [xcomp](https://universaldependencies.org/u/dep/xcomp.html), [ccomp](https://universaldependencies.org/u/dep/ccomp.html), [nsubj](https://universaldependencies.org/u/dep/nsubj.html), [case](https://universaldependencies.org/u/dep/case.html) | Predicativo como raiz de oração copular; `xcomp` com controle obrigatório; complemento com sujeito próprio como `ccomp`; preposição dependente do nome. | `DependencyParser.ts`, `ClauseAnalyzer.ts`. Cópulas e auxiliares em contexto recebem `AUX`, embora o gabarito local os chame de `VERB`. |
| [CoNLL-U](https://universaldependencies.org/format.html), [UD português](https://universaldependencies.org/pt/index.html), [Bosque](https://universaldependencies.org/treebanks/pt_bosque/), [PUD](https://universaldependencies.org/treebanks/pt_pud/) | Dez colunas e linha de faixa para contração; convenções portuguesas de artigos, contrações e clíticos. A forma feminina do artigo tem lema `o` no [Bosque](https://universaldependencies.org/treebanks/pt_bosque/pt_bosque-pos-DET.html). | `Tokenizer.ts`, `Conllu.ts`, `closed-class.json`, `contractions.json`. Bosque e PUD foram consultados, não copiados. |
| [Manual CG-3](https://edu.visl.dk/cg3/chunked/), [tutorial CG-3](https://edu.visl.dk/cg3_howto.pdf) | Coortes com múltiplas leituras e regras contextuais ordenadas `SELECT`/`REMOVE`. | `Tagger.ts`, `pos-rules.json`; cada remoção registra o ID da regra. |
| [Diretrizes AMR](https://github.com/amrisi/amr-guidelines/blob/master/amr.md), [AMR-PT](https://aclanthology.org/W19-4028/) | Papéis `ARG*`, controle como reentrância, polaridade, perguntas e adaptação de conceitos ao português. | `MeaningGraphBuilder.ts`, `adjunct-roles.json`, `implicit-pronouns.json`. |
| [Smatch](https://pypi.org/project/smatch/1.0.2/), [avaliação amrlib](https://amrlib.readthedocs.io/en/latest/evaluation/) | F1 de triplas de instância, relação e atributo com mapeamento de variáveis. | `graphMatch.ts` usa busca exata e determinística; não usa subida de encosta aleatória. |
| [PropBank-Br](https://aclanthology.org/L12-1114/), [VerbNet.Br](https://aclanthology.org/W11-4503/) | Referência conceitual para papéis e molduras verbais. | Os papéis são lidos apenas das molduras próprias do projeto; nenhum dado dessas bases foi importado. |
| [Alomorfia em adjetivos `-vel`](https://www.scielo.br/j/alfa/a/KBB8JSXYhkf3Wb6sXcbG9XJ/), [formação de palavras](https://www.scielo.br/j/delta/a/7TDJXwhYDpNRkXLYWhvnbnB/) | Alternâncias de radical e derivação por regras, com a ressalva de que certas ligações são históricas e não produtivas no português sincrônico. | `stem-rules.json` separa radical do sufixo. As alternâncias específicas além de `vis-` vieram dos exemplos fornecidos pelo solicitante e ainda pedem verificação etimológica individual. |

## Arquitetura e comportamento

`SemanticEngine.analyzeSentence(text)` monta `Tokenizer → LexicalAnalyzer → Tagger → DependencyParser → ClauseAnalyzer → MeaningGraphBuilder`. A saída inclui leituras alternativas, escolha, traços, origem, regra, árvore UD, sujeito, dois recortes do predicado, modo, polaridade, CoNLL-U, nós/arestas, PENMAN e trace. O método não executa nem altera o documento. `DomainParser` não foi reescrito.

O parser usa **montagem determinística por padrões**: seleciona núcleo verbal ou predicativo, associa determinantes, casos, coordenação e orações, depois sujeitos, objetos e adjuntos. A escolha do sujeito combina posição com concordância de pessoa e número; um teste com objeto anteposto (“Eu, a casa comprei.”) verifica que o verbo de 1ª pessoa seleciona “Eu”. A relação é registrada com o ID da regra que criou o arco. Molduras do projeto orientam os papéis semânticos; molduras `defaultTemplate` geram diagnóstico de incerteza. Essa escolha é compatível com as relações da UD citadas acima, embora construções ambíguas mais longas continuem abertas.

Definição operacional observada no gabarito: **predicado (núcleo)** é o verbo finito principal e sua cadeia `xcomp` ou verbo coordenado; em oração copular, é a cópula finita, embora o predicativo seja a raiz UD. Exemplo: `sent-001` usa `[2,3]` e `sent-021` usa `[3]`. **Predicado completo** é a subárvore da raiz sem a subárvore do sujeito e sem pontuação.

Os dados de classes fechadas, contrações, regras CG, alternâncias e papéis ficam em JSON. `src/` não contém dicionário, treebank nem molduras externas. Os 24 paradigmas propostos e 31 verbos irregulares copiados para `src/knowledge/language/` já pertenciam a `research/morfologia/` deste projeto. A base ensinável usa formato de dados **v3**: uma raiz nova traz paradigma, regra de atribuição, glosa, tipo e moldura copiada de um modelo do próprio projeto.

## Números medidos

As 80 frases do gabarito contêm 431 tokens para UPOS e dependências; as 20 extras, 78. A métrica lexical exclui pontuação (348 e 58 tokens). Os traços são medidos onde foram anotados (294 e 58 tokens).

| Métrica | Gabarito (80) | Extras (20) |
|---|---:|---:|
| Lema entre as candidatas | 348/348 (100%) | 58/58 (100%) |
| Traços entre as candidatas | 293/294 (99,66%) | 58/58 (100%) |
| Lema **e** traços na mesma leitura | 347/348 (99,71%) | 58/58 (100%) |
| UPOS selecionado | 419/431 (97,22%) | 77/78 (98,72%) |
| UAS | 431/431 (100%) | 78/78 (100%) |
| LAS | 431/431 (100%) | 78/78 (100%) |
| Sujeito exato | 80/80 (100%) | 20/20 (100%) |
| Predicado núcleo exato | 80/80 (100%) | 20/20 (100%) |
| Smatch F1 médio | 0,9401 | 0,9029 |
| Grafo exato (F1 = 1) | 62/80 (77,5%) | 12/20 (60%) |
| Sentido esperado presente | 74/80 (92,5%) | 19/20 (95%) |

Fase 1: os três casos de ruído, as dez palavras de radical latino fora dos dados e os dois comandos de domínio passaram. Fase 2: 40 formas de classe fechada, seis contrações e os demais casos somam 49 testes aprovados. Fase 3: **258/258** casos de flexão. Fase 4: os limiares de UPOS foram atingidos. Fase 5: os limiares de UAS, LAS, sujeito e predicado foram atingidos. Fase 6: os três limiares de grafo foram atingidos **no gabarito**; nas extras, grafos exatos ficaram em 60%, sem limiar exigido nessa fase. Fase 8: `surfar` gerou 53 formas e 11 hipóteses derivacionais na vista de rede; `surfista` aparece como `AGENT_OF(surfar)`.

## Falhas restantes e causas

- **Classe:** 12 tokens do gabarito (`sent-015`, `020`–`023`, `030`, `041`, `067`–`069`, `072`, `080`) e um das extras (`extra-019`) divergem porque a implementação marca cópula ou auxiliar como `AUX` conforme UD, enquanto os dados locais registram `VERB`. A árvore e o grafo desses casos continuam sendo avaliados. Não alterei o gabarito para aumentar a métrica.
- **Traços:** em `sent-079`, “ajuda” não tem, entre as leituras lexicais, a combinação `Mood=Imp|Person=3` do gabarito; o paradigma regular oferece 3ª pessoa do indicativo e 2ª do imperativo. O modo imperativo da oração é inferido estruturalmente.
- **Dependências, sujeito e predicado:** nenhuma divergência nos 80 casos e nas 20 extras medidos. Esse resultado não demonstra cobertura de todas as construções do português.
- **Grafo no gabarito, 18 não exatos:** `sent-034`, `035`, `050`, `052`, `057`, `060`–`062`, `064`–`069`, `073`–`075`, `077`. Seis têm sentido diferente (`034`, `035`, `050`, `061`, `064`, `073`). Causas principais: seleção entre sentidos ainda ambíguos (`ficar`, `chegar`, `achar`); nome próprio composto “São Paulo” dividido; moldura de `ter.CONTER` divergente dos papéis do gabarito; adjuntos temporais compostos, quantificação implícita e correferência em relativas ainda incompletos. As notas por frase e o diff estão no painel administrativo.
- **Grafo nas extras, oito não exatos:** `extra-001`, `002`, `005`, `010`, `013`–`015`, `018`. Parte da diferença vem de grafos extras redigidos com forma plural de superfície onde o motor usa lema. `extra-005` usa `dançar.DANÇAR` na anotação extra, enquanto a raiz do projeto identifica o sentido como `dançar.DANCAR`; o contador de sentido registra a divergência. Mantive a anotação para não ajustar o conjunto depois de ver a saída.
- **Persistência sob cota:** o navegador usado no teste já tinha snapshots completos próximos do limite do `localStorage`. Ao ensinar a raiz, o histórico completo excedeu a cota. A base v3 salva as raízes em um registro pequeno adicional e as restaura após recarga; a interface informa quando o histórico completo não coube. Os snapshots antigos não foram apagados. A persistência do **novo snapshot completo** continua limitada pela cota do navegador.
- **Generalização ainda aberta:** molduras genéricas (`defaultTemplate`) são marcadas como incertas; nomes próprios com várias palavras, construções elípticas e alguns tipos de coordenação e relativa ainda podem falhar em frases novas. A busca exata de Smatch cresce combinatoriamente para grafos grandes.

## Interface e capturas

No Chrome local, `http://127.0.0.1:5173/`, foram verificados: chat → “Eu quero tomar café.” → Classes/Sintaxe/Significado; painel → texto livre; lista de 80 frases com métricas e diff; cinco frases do gabarito e cinco frases novas; ensino de `surfar`, análise de “Nós surfamos ontem.” e restauração após recarga. A vista móvel foi ajustada após uma captura revelar a navegação lateral larga. O primeiro carregamento expôs um favicon ausente (404); foi adicionado `public/favicon.svg`. Na sessão limpa final, o ícone respondeu `200` e não houve erros ou avisos no console. O plugin Browser não estava disponível; foi usado Playwright já presente no ambiente com Chrome local, sem instalação.

![Classes no painel](research/morfologia/capturas/analise-classes.png)
![Árvore UD e CoNLL-U](research/morfologia/capturas/analise-sintaxe.png)
![Grafo e reentrância](research/morfologia/capturas/analise-significado.png)
![Comparação do gabarito](research/morfologia/capturas/gabarito.png)
![Vista móvel](research/morfologia/capturas/mobile-classes.png)
![Rede ensinada](research/morfologia/capturas/rede-surfar.png)
![Frase com raiz ensinada](research/morfologia/capturas/surfar-frase.png)

## Verificação final

Saída final observada após o relatório, o ajuste de `AUX` e a correção de concordância: `npm test` → **38 arquivos aprovados, 509 testes aprovados (509)**, sem falhas; `npx tsc --noEmit` → código de saída `0`; `npm run build` → código de saída `0`, 124 módulos transformados, bundle principal de 1.208,16 kB; `git diff --check` → código de saída `0`. O Vite emitiu aviso de chunk acima de 500 kB; o limite não foi afrouxado.

Comandos do construtor preservados, exceto a recuperação derivacional avaliativa solicitada (`DERIVED_MATCH`); a suíte antiga de 413 testes permaneceu verde. Não houve instalação de dependências de runtime, uso de rede em tempo de execução, `eval`, `new Function` ou aleatoriedade na camada nova.
