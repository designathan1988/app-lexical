import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { SentenceAnalysisViews } from '../src/ui/components/SentenceAnalysisViews';
import { SentenceAnalysisSection } from '../src/ui/components/admin/SentenceAnalysisSection';
import { summarizeChatResult } from '../src/ui/useEngine';
import { ChatResultAction } from '../src/ui/components/ChatResultAction';
import extra2 from './fixtures/sentences-extra-2.json';

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

  it('exibe as 80 frases com todas as métricas e detalhes das falhas', () => {
    const html = renderToStaticMarkup(React.createElement(SentenceAnalysisSection, { engine, initialShowGold: true }));
    expect((html.match(/class="row-(?:selected|fail)"/g) ?? [])).toHaveLength(80);
    for (const label of ['Lema', 'Traços', 'UPOS', 'UAS', 'LAS', 'Sujeito', 'Predicado', 'Smatch', 'Sentido']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Lema esperado');
    expect(html).toContain('Traços esperados');
    expect(html).toContain('Sentido esperado');
  });
});

describe('chat de frases gerais', () => {
  const phrases = extra2.sentences.filter((sentence) => sentence.id.startsWith('extra2-1.9-'));

  it('registra pelo menos seis frases inéditas no segundo conjunto extra', () => {
    expect(phrases.length).toBeGreaterThanOrEqual(6);
  });

  for (const phrase of phrases) {
    it(`apresenta análise sem executar ${phrase.id}`, () => {
      const before = JSON.stringify(engine.store.document);
      const result = engine.execute(phrase.text);
      const summary = summarizeChatResult(result, engine.analyzeSentence(phrase.text));
      expect(summary).toEqual({
        text: 'Frase analisada (não é um comando do construtor)',
        analysisOnly: true
      });
      expect(result.compile.diagnostics.length).toBeGreaterThan(0);
      expect(result.execution.mutations).toHaveLength(0);
      expect(JSON.stringify(engine.store.document)).toBe(before);
      const html = renderToStaticMarkup(React.createElement(ChatResultAction, { result, analysisOnly: summary.analysisOnly, onInspect: () => undefined }));
      expect(html).toContain('Classes / Sintaxe / Significado');
    });
  }

  it('mantém bloqueio e diagnósticos para comando inválido do construtor', () => {
    const result = engine.execute('crie uma caixa estranha');
    const summary = summarizeChatResult(result, engine.analyzeSentence(result.input));
    expect(summary.analysisOnly).toBe(false);
    expect(summary.text).toContain('Bloqueado:');
    expect(result.compile.diagnostics.some((diagnostic) => diagnostic.code === 'UNKNOWN_WORD')).toBe(true);
  });
});
