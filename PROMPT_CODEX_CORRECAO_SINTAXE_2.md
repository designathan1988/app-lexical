# PROMPT — Correção 2 da análise de frases (resultado da verificação oculta)

## Respostas às suas duas perguntas

1. **GOLD-FIX autorizado:** em `tests/fixtures/sentences-extra-2.json`, troque `começar.COMEÇAR` por `começar.INICIAR`, que é o id do sentido na moldura e no gabarito. Faça o commit `GOLD-FIX` com a justificativa em `research/morfologia/CHANGES.md`, como antes.
2. **A avaliação oculta não fica disponível para você, de propósito.** Quem a roda é o revisor (Claude), fora do repositório. Não procure por ela nem tente reconstruí-la. O resultado está abaixo.

## Resultado da verificação oculta (commit `d96a79e`)

| Conjunto | Frases totalmente certas | Ligações | Papéis do grafo |
|---|---|---|---|
| 1ª verificação (44 frases; os erros dela estavam descritos no prompt anterior) | 43/44 (98%) | 136/137 (99%) | 93/93 (100%) |
| **2ª verificação (24 frases inéditas, escritas depois da sua entrega)** | **16/24 (67%)** | **55/70 (79%)** | **29/33 (88%)** |

As correções resolveram bem os casos descritos, mas a 2ª verificação mostra que **ainda não generalizam**. Corrija as classes de erro abaixo.

Os exemplos deste prompt são **ilustrativos e diferentes** das frases ocultas. Haverá uma 3ª verificação com frases novas. Valem todas as regras de antes:
- `AGENTS.md`;
- testes primeiro, com pelo menos 6 frases suas, novas, por item, em `tests/fixtures/sentences-extra-3.json`;
- nada piora;
- sem aumento de escopo;
- relatório em português.

---

## 1. Classes de erro a corrigir

### 2.1 Particípio como predicativo depois de cópula

**Erro observado:** ser/estar + **particípio** (VERB `VerbForm=Part`) não é reconhecido como oração copular. O particípio fica como `dep`, e quando a cópula está numa subordinada a oração se desmonta.

**Correto:** o particípio é o predicativo e o núcleo, com `cop`, assim como o adjetivo. Isso vale:
- com advérbio no meio;
- em orações subordinadas (se/quando/porque + estiver/estava + particípio);
- em todas as formas de ser/estar/ficar/parecer com papel copular.

Siga a decisão UD do português para particípio predicativo (pesquise e cite) e mantenha a passiva analítica (`aux:pass`) distinta, se a diretriz exigir.

Exemplos:
- "A loja estava fechada."
- "Os pratos foram lavados."
- "Quando estiver pronto, me avise."
- "O vidro parece rachado."

### 2.2 Advérbio de grau: só modifica o que é graduável

**Erro observado (regressão da sua correção 1.6):** "VERBO muito + advérbio de tempo" passou a ligar "muito" ao advérbio de tempo.

**Correto:**
- o advérbio de grau se liga ao ADV/ADJ seguinte **só quando este é graduável** (modo, qualidade, intensidade: bem, mal, devagar, rápido, cedo, tarde, cansado…);
- diante de advérbio de tempo dêitico ou de lugar (hoje, ontem, amanhã, agora, aqui, lá), o grau modifica o **verbo**.

Marque a graduabilidade nos dados (traço ou tipo semântico do advérbio); não faça lista de pares.

Exemplos:
- "Ela dormiu muito ontem."
- "Choveu pouco aqui."
- "Ele fala muito alto."
- "Saímos bem cedo."

### 2.3 Cobertura lexical de advérbios e quantificadores de grau

**Erro observado:** "bastante" recebeu a leitura NOUN e tomou o lugar do predicativo.

Revise as classes fechadas: bastante, demais, tão, tanto, meio (em "meio cansado"), bem (grau), quase, pouco, mais, menos. Cada um com a leitura ADV de grau e, quando couber, DET/PRON quantificador ("bastante comida", "pouca água").

### 2.4 Adjetivo ou particípio usado como núcleo nominal

**Erro observado:** palavra que a semente só conhece como ADJ (ou que é ADJ/NOUN), depois de DET ou de preposição, ficou sem papel: `dep`, sem `obj`/`obl`, e o argumento sumiu do grafo.

**Correto:** depois de DET, ou de preposição sem outro núcleo, um ADJ funciona como núcleo nominal. Isso é conversão: pesquise a convenção UD (se mantém ADJ como núcleo de `obj`/`obl`/`nsubj` ou se a leitura NOUN deve existir) e implemente de forma geral.

Exemplos:
- "O doente melhorou."
- "Ela ajudou os pobres."
- "Ele respondeu com educação."
- "O jovem saiu."

### 2.5 Verbo regular fora da semente: lema pelo palpite

**Erro observado:** um verbo regular conjugado, ausente da semente, recebeu como conceito a **forma flexionada** ("…ou"), sem lema e sem papéis no grafo.

**Correto:** a leitura `GUESS` de forma finita regular deve **reconstruir o lema** (-ou → -ar, -aram → -ar, -iu → -ir, -eu → -er…) a partir do paradigma, no sentido inverso da geração. Não use lista de palavras.

Sem moldura, o verbo recebe a moldura padrão marcada como incerta, com ARG0 = sujeito e ARG1 = objeto direto, e o diagnóstico de incerteza.

Exemplos com verbos fora da semente:
- "O técnico consertou a máquina."
- "As crianças pintaram o muro."
- "Ela decorou a sala."

Confira antes se estão mesmo fora da semente; se estiverem dentro, troque por outros.

### 2.6 Interrogativa indireta e orações com pronome interrogativo encaixado

**Erro observado:** em "VERBO (saber/perguntar/ver…) + onde/quando/como/quem/o que + oração", a oração encaixada se desfez: o sujeito dela virou objeto do verbo principal.

**Correto (UD):**
- a oração encaixada é `ccomp` do verbo principal;
- o pronome ou advérbio interrogativo fica dentro dela, com a função que tem lá (`advmod`, `obj`, `nsubj`);
- o sujeito dela é `nsubj` do verbo dela.

**Grafo:** `amr-unknown` dentro da oração encaixada. Siga a diretriz AMR para pergunta indireta, pesquise e cite.

Exemplos:
- "Ele perguntou quem chegou."
- "Não lembro onde deixei a chave."
- "Ela sabe como funciona."

### 2.7 Predicativo adverbial e relativa no sujeito de oração copular

**Erro observado:** em "SUJEITO + relativa + estar + bem/mal", a raiz virou o verbo da relativa e a cópula ficou como `dep`.

**Correto:**
- *estar* + advérbio predicativo (bem, mal, assim, longe, perto) é oração copular com o advérbio como núcleo;
- a relativa continua `acl:relcl` do nome;
- o "que" relativo recebe a função que tem na relativa (`nsubj` quando a relativa não tem outro sujeito).

Exemplos:
- "A senhora que tropeçou está bem."
- "O time que perdeu ficou mal."

---

## 2. Entrega

Igual à anterior:
- seção nova no `RELATORIO_SINTAXE.md` ("Correção 2"), com fonte, regra (id), frases e resultado de cada item;
- tabela antes × depois para gabarito, extras, extras-2 e extras-3;
- saída real de `npm test`, `npx tsc --noEmit` e `npm run build`;
- lista do que ainda falha.

**Critério de pronto:**
- [ ] itens 2.1 a 2.7 corrigidos, ou bloqueados com explicação;
- [ ] suíte verde;
- [ ] nenhuma métrica anterior caiu;
- [ ] extras-3 com ligações ≥ 95% e papéis ≥ 95%.

Depois disso, a 3ª verificação oculta será rodada pelo revisor.
