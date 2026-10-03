import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';

function engine(): SemanticEngine {
  return new SemanticEngine(createInitialKnowledgeBase());
}

const tree = (e: SemanticEngine) => treeSignature(e.store.document, e.knowledgeBase.concepts);
const codes = (r: ReturnType<SemanticEngine['execute']>) =>
  r.compile.diagnostics.map((d) => d.code);

/** §6 — limitações declaradas no relatório anterior, agora implementadas. */
describe('Oração relativa simples', () => {
  it('"que tenha <propriedade> <valor>" restringe a criação', () => {
    const e = engine();
    const result = e.execute('crie uma caixa que tenha borda azul');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{C_PROP_BORDER_COLOR=#2563eb}');
  });

  it('"que tem <propriedade>" funciona igual', () => {
    const e = engine();
    const result = e.execute('crie um botão que tem fundo vermelho');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(tree(e)).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}');
  });

  it('"que está dentro de <X>" restringe a referência', () => {
    const e = engine();
    const box = e.store.createNode('C_ENT_CONTAINER');
    e.store.createNode('C_ENT_BUTTON');
    const inside = e.store.createNode('C_ENT_BUTTON');
    e.store.place(inside, 'CHILD_OF', box);

    const result = e.execute('apague o botão que está dentro da caixa');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    // Sobrevive o botão de fora; o de dentro foi apagado.
    expect(tree(e)).toBe('C_ENT_CONTAINER{}\nC_ENT_BUTTON{}');
    expect(e.store.document.nodes.has(inside)).toBe(false);
  });

  it('relação relativa sem conteúdo reconhecido produz diagnóstico', () => {
    const e = engine();
    const result = e.execute('crie uma caixa que tem');
    expect(result.success).toBe(false);
    expect(codes(result)).toContain('UNSUPPORTED_OPERATION');
  });
});

describe('Anáfora definida por saliência', () => {
  it('"a mesma" e "essa" resolvem pela menção saliente', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const result = e.execute('mude a mesma caixa para azul');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{C_PROP_BG_COLOR=#2563eb}');
  });

  it('"aquela" resolve pela saliência', () => {
    const e = engine();
    e.execute('crie uma caixa');
    e.execute('crie um botão');
    const result = e.execute('mude aquela caixa para verde');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{C_PROP_BG_COLOR=#16a34a}\nC_ENT_BUTTON{}');
  });
});

describe('Elipse nominal com propriedade', () => {
  it('"apague o azul" usa o tipo saliente + filtro de propriedade', () => {
    const e = engine();
    e.execute('crie dois botões');
    e.execute('deixe o segundo azul');

    const result = e.execute('apague o azul');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(codes(result)).toContain('ELLIPSIS_RESOLVED');
    expect(tree(e)).toBe('C_ENT_BUTTON{}');
  });

  it('sem antecedente, a elipse é recusada', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON', undefined);
    e.store.setProperty(
      Array.from(e.store.document.nodes.keys())[0],
      'C_PROP_BG_COLOR',
      '#2563eb'
    );
    const result = e.execute('apague o azul');
    expect(result.success).toBe(false);
    expect(codes(result)).toContain('INCOMPLETE_REFERENCE');
  });
});

describe('Quantificadores vagos', () => {
  it.each([
    ['crie alguns botões'],
    ['crie vários botões'],
    ['apague uns botões'],
    ['crie umas caixas']
  ])('«%s» não inventa cardinalidade', (input) => {
    const e = engine();
    if (input.startsWith('apague')) e.store.createNode('C_ENT_BUTTON');
    const before = tree(e);
    const result = e.execute(input);

    expect(result.success).toBe(false);
    expect(codes(result)).toContain('UNSUPPORTED_OPERATION');
    expect(tree(e)).toBe(before);
  });
});
