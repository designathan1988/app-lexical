import { describe, it, expect } from 'vitest';
import { nodeStyle } from '../src/builder/PropertyMapping';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import type { ConceptId } from '../src/engine/types';

const kb = createInitialKnowledgeBase();
const container = kb.concepts['C_ENT_CONTAINER'];
const button = kb.concepts['C_ENT_BUTTON'];

describe('Precedência de estilo (ontologia vs propriedades explícitas)', () => {
  it('propriedade explícita vence o estilo padrão da entidade', () => {
    const style = nodeStyle({ C_PROP_BG_COLOR: '#2563eb' } as Record<
      ConceptId,
      string | number | boolean
    >, container);
    expect(style['backgroundColor']).toBe('#2563eb');
  });

  it('borderColor explícito não é suprimido pelo borderStyle padrão', () => {
    const style = nodeStyle({ C_PROP_BORDER_COLOR: '#2563eb' }, container);
    expect(style['borderColor']).toBe('#2563eb');
    expect(style['borderStyle']).toBe('solid');
  });

  it('borderWidth explícito aparece com estilo visível', () => {
    const style = nodeStyle({ C_PROP_BORDER_WIDTH: '4px' }, container);
    expect(style['borderWidth']).toBe('4px');
    expect(style['borderStyle']).toBe('solid');
  });

  it('borderColor + borderWidth combinados', () => {
    const style = nodeStyle(
      { C_PROP_BORDER_COLOR: '#2563eb', C_PROP_BORDER_WIDTH: '4px' },
      container
    );
    expect(style['borderColor']).toBe('#2563eb');
    expect(style['borderWidth']).toBe('4px');
    expect(style['borderStyle']).toBe('solid');
  });

  it('borderStyle=none explícito remove a borda inteira', () => {
    const style = nodeStyle(
      {
        C_PROP_BORDER_COLOR: '#2563eb',
        C_PROP_BORDER_WIDTH: '4px',
        C_PROP_BORDER_STYLE: 'none'
      },
      container
    );
    expect(style['borderStyle']).toBe('none');
    expect(style['borderColor']).toBeUndefined();
    expect(style['borderWidth']).toBeUndefined();
  });

  it('sem propriedades, mantém os padrões da entidade', () => {
    const style = nodeStyle({}, button);
    expect(style['padding']).toBe('10px 16px');
    expect(style['cursor']).toBe('pointer');
  });

  it('cor do texto em BUTTON não sobrescreve a cor padrão do botão sem comando', () => {
    const plain = nodeStyle({}, button);
    expect(plain['color']).toBe('#ffffff');

    const colored = nodeStyle({ C_PROP_TEXT_COLOR: '#dc2626' }, button);
    expect(colored['color']).toBe('#dc2626');
  });
});
