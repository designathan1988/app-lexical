import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { SentenceAnalysisViews } from '../src/ui/components/SentenceAnalysisViews';
import { SentenceAnalysisSection } from '../src/ui/components/admin/SentenceAnalysisSection';

const engine = new SemanticEngine(createInitialKnowledgeBase());
const analysis = engine.analyzeSentence('Eu quero tomar café.');

describe('vistas da análise geral', () => {
  it('mostra classes, lema, traços, origem e regra', () => {
    const html = renderToStaticMarkup(React.createElement(SentenceAnalysisViews, { analysis, view: 'classes' }));
    expect(html).toContain('Eu');
    expect(html).toContain('querer');
    expect(html).toContain('PRON');
    expect(html).toContain('INFLECTION');
    expect(html).toContain('Regra');
  });

  it('desenha árvore rotulada e apresenta CoNLL-U', () => {
    const html = renderToStaticMarkup(React.createElement(SentenceAnalysisViews, { analysis, view: 'syntax' }));
    expect(html).toContain('<svg');
    expect(html).toContain('nsubj');
    expect(html).toContain('CoNLL-U');
    expect(html).toContain('Sujeito');
    expect(html).toContain('Predicado');
  });

  it('desenha grafo e apresenta PENMAN e trace', () => {
    const html = renderToStaticMarkup(React.createElement(SentenceAnalysisViews, { analysis, view: 'meaning' }));
    expect(html).toContain('<svg');
    expect(html).toContain('querer.DESEJAR');
    expect(html).toContain('tomar.INGERIR');
    expect(html).toContain('PENMAN');
    expect(html).toContain('ARG0');
    expect(html).toContain('SENSE_PREFERENCE');
    expect(html).toContain('FRAME:tomar.INGERIR:ARG1');
  });

  it('oferece texto livre e comparação do gabarito no painel', () => {
    const html = renderToStaticMarkup(React.createElement(SentenceAnalysisSection, { engine }));
    expect(html).toContain('Análise de frase');
    expect(html).toContain('Analisar frase');
    expect(html).toContain('Gabarito');
  });
});
