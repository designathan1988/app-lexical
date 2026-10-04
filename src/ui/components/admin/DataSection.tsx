import React, { useMemo, useState } from 'react';
import type { SemanticEngine } from '../../../engine/SemanticEngine';
import type { KnowledgeBaseStore } from '../../../knowledge/KnowledgeBaseStore';
import type { SurfaceForm, ConceptId, ValueCategory, PartOfSpeech, Lexeme } from '../../../engine/types';
import type { ConceptNode } from '../../../engine/ontology/Concept';

interface Props {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
  onChange: () => void;
  onTeachWord?: () => void;
}

type Entity = 'surface' | 'lexeme' | 'concept' | 'mwe';

const groupInfo: Record<Entity, { title: string; stage: string; technical: string; description: string; example: string; next: string }> = {
  surface: { title: 'Formas', stage: 'o que você digita', technical: 'surface forms', description: 'As grafias que o motor reconhece quando você escreve. Uma palavra pode ter várias formas flexionadas.', example: 'botão → botões', next: 'Abra uma linha para ver as formas geradas e as exceções.' },
  lexeme: { title: 'Palavras', stage: 'entrada de dicionário', technical: 'lexemas', description: 'A entrada de dicionário: lema, classe e paradigma. É a base usada para gerar e reconhecer formas.', example: 'botão · substantivo · N_AO_OES', next: 'Para ensinar uma palavra nova, use o assistente de ensino.' },
  concept: { title: 'Significados', stage: 'a ideia reconhecida', technical: 'conceitos', description: 'A ideia ou ação associada às palavras. Um mesmo lema pode apontar para sentidos diferentes.', example: 'botão → elemento de interface', next: 'Veja aqui o que cada palavra pode representar no construtor.' },
  mwe: { title: 'Expressões', stage: 'palavras em conjunto', technical: 'multiwords', description: 'Grupos de palavras que funcionam como uma unidade de sentido.', example: 'ao lado de → relação espacial', next: 'Use esta lista para entender frases que dependem de mais de uma palavra.' }
};
const posNames: Record<string, string> = { VERB: 'verbo', NOUN: 'substantivo', ADJECTIVE: 'adjetivo', ADVERB: 'advérbio',
  DETERMINER: 'determinante', PRONOUN: 'pronome', PREPOSITION: 'preposição', NUMERAL: 'numeral', CONJUNCTION: 'conjunção' };
const conceptKinds: Record<string, string> = { ENTITY: 'elemento', PROPERTY: 'propriedade', VALUE: 'valor', ACTION: 'ação', RELATION: 'relação' };
const formTypeNames: Record<string, string> = { MISSPELLING: 'grafia alternativa', COLLOQUIAL: 'forma coloquial', ABBREVIATION: 'abreviação', INFLECTION: 'flexão excepcional' };
const valueCategoryNames: Record<string, string> = { COLOR: 'cor', SIZE: 'tamanho', NUMBER: 'número', TEXT: 'texto', BOOLEAN: 'sim/não', ALIGNMENT: 'alinhamento', WEIGHT: 'peso', DISPLAY: 'exibição', ENUM: 'opção' };

export function DataSection({ engine, store, onChange, onTeachWord }: Props) {
  const [entity, setEntity] = useState<Entity>('surface');
  const [query, setQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');

  const concepts = store.kb.concepts;
  const lexemes = store.kb.lexemes;
  const group = groupInfo[entity];

  const surfaceList = useMemo(
    () => store.searchSurfaceForms(query),
    [query, store.kb.surfaceForms, store.kb.surfaceForms.length]
  );

  const conceptList = useMemo(() => {
    const all = Object.values(concepts);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.id.toLowerCase().includes(q) || c.kind.toLowerCase().includes(q));
  }, [concepts, query]);

  const lexemeList = useMemo(() => {
    const all = Object.values(lexemes);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (l) => l.id.toLowerCase().includes(q) || l.lemma.toLowerCase().includes(q)
    );
  }, [lexemes, query]);

  const mweList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return store.kb.multiwords;
    return store.kb.multiwords.filter(
      (m) => m.phrase.toLowerCase().includes(q) || m.conceptId.toLowerCase().includes(q)
    );
  }, [store.kb.multiwords, query]);
  const visibleCount = entity === 'surface' ? surfaceList.length : entity === 'lexeme' ? lexemeList.length
    : entity === 'concept' ? conceptList.length : mweList.length;

  const notify = (m: string) => {
    setMessage(m);
    onChange();
  };

  const doExport = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'knowledge-base.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = () => {
    try {
      store.importJSON(importText);
      notify('Base de conhecimento importada com sucesso.');
      setImportText('');
    } catch (e) {
      setMessage(`Falha ao importar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="admin-section">
      <header className="section-header">
        <div><div className="summary-kicker">EXPLORE OS DADOS</div><h3>Como o motor entende as palavras</h3>
          <p className="note">A base liga o que você digita ao lema e, depois, ao significado. Escolha um grupo para explorar.</p></div>
        <div className="row">
          <input
            aria-label={`Pesquisar ${group.title.toLowerCase()}`}
            placeholder={`Buscar em ${group.title.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={doExport}>Exportar backup</button>
        </div>
      </header>

      <div className="data-groups" aria-label="Grupos de dados">
        {([
          ['surface', store.kb.surfaceForms.length], ['lexeme', Object.keys(lexemes).length],
          ['concept', Object.keys(concepts).length], ['mwe', store.kb.multiwords.length]
        ] as Array<[Entity, number]>).map(([id, count], index) => (
          <button key={id} className={`data-group ${entity === id ? 'active' : ''}`} aria-pressed={entity === id}
            onClick={() => { setEntity(id); setQuery(''); }}>
            <small>0{index + 1} · {groupInfo[id].stage}</small><strong>{groupInfo[id].title}</strong>
            <span>{groupInfo[id].description}</span><em>{count} registros</em>
          </button>))}
      </div>

      <div className="data-explainer ui-card" role="status"><div><div className="summary-kicker">GRUPO SELECIONADO</div><h4>{group.title}</h4><p>{group.description}</p>
        <p><strong>Exemplo:</strong> {group.example}</p><p className="note">{group.next} <small>Nome técnico: {group.technical}.</small></p></div>
        {onTeachWord && <button className="primary" onClick={onTeachWord}>Ensinar palavra nova</button>}
      </div>

      {message && <p className="ok" role="status">{message}</p>}

      <div className="data-records"><h4>Registros: {group.title.toLowerCase()}</h4>
      {query.trim() && <p className="note" role="status">{visibleCount ? `${visibleCount} registro(s) encontrado(s).` : 'Nenhum registro encontrado. Tente outra palavra ou limpe a busca.'}</p>}
      {entity === 'surface' && (
        <SurfaceTable
          list={surfaceList}
          lexemes={lexemes}
          onAdd={(sf) => {
            store.addSurfaceForm(sf);
            notify(`Exceção "${sf.rawText}" adicionada ao lema ${sf.lexemeId}.`);
          }}
          onRemove={(id) => {
            store.removeSurfaceForm(id);
            notify('Exceção removida.');
          }}
        />
      )}

      {entity === 'lexeme' && (
        <LexemeTable
          list={lexemeList}
          conceptIds={Object.keys(concepts)}
          onAdd={(l) => {
            store.addLexeme(l);
            notify(`Lexema "${l.lemma}" adicionado.`);
          }}
          onRemove={(id) => {
            store.removeLexeme(id);
            notify('Lexema removido.');
          }}
          onUpdate={(id, patch) => {
            store.updateLexeme(id, patch);
            notify('Lexema atualizado.');
          }}
        />
      )}

      {entity === 'concept' && (
        <ConceptTable
          list={conceptList}
          onRemove={(id) => {
            store.removeConcept(id);
            notify('Conceito removido.');
          }}
          onAddValue={(id, category, literal) => {
            store.addConcept({ kind: 'VALUE', id, valueCategory: category, literal });
            notify(`Valor "${id}" adicionado.`);
          }}
        />
      )}

      {entity === 'mwe' && (
        <MweTable
          list={mweList}
          conceptIds={Object.keys(concepts)}
          onAdd={(id, phrase, conceptId) => {
            store.addMultiword({ id, phrase, conceptId });
            notify(`Expressão "${phrase}" adicionada.`);
          }}
          onRemove={(id) => {
            store.removeMultiword(id);
            notify('Expressão removida.');
          }}
        />
      )}
      </div>

      <details className="import-box">
        <summary>Importar backup / dataset (JSON)</summary>
        <textarea
          aria-label="Conteúdo JSON do backup a importar"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{"knowledgeBase": {...}}'
          rows={6}
        />
        <button onClick={doImport}>Importar</button>
      </details>
    </div>
  );
}

/**
 * Léxico por LEMA: uma linha por lexema (ex.: LEX_CRIAR) com todas as suas
 * formas — geradas pelo paradigma ou pelo próprio lema — dentro dela. Formas
 * manuais existem só como EXCEÇÃO (erro de digitação, coloquial, abreviação,
 * forma supletiva); o id delas é derivado do lema, nunca digitado.
 */
function SurfaceTable({
  list,
  lexemes,
  onAdd,
  onRemove
}: {
  list: SurfaceForm[];
  lexemes: Record<string, Lexeme>;
  onAdd: (sf: SurfaceForm) => void;
  onRemove: (id: string) => void;
}) {
  const lexemeIds = Object.keys(lexemes);
  const [newText, setNewText] = useState('');
  const [newLexeme, setNewLexeme] = useState(lexemeIds[0] ?? '');
  const [newType, setNewType] = useState<SurfaceForm['formType']>('MISSPELLING');

  const byLexeme = useMemo(() => {
    const groups = new Map<string, SurfaceForm[]>();
    for (const sf of list) {
      const group = groups.get(sf.lexemeId) ?? [];
      group.push(sf);
      groups.set(sf.lexemeId, group);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [list]);

  const exceptions = list.filter((sf) => !sf.generated);

  return (
    <>
      <h4>
        Palavras e suas formas ({byLexeme.length} palavras base · {list.length} formas)
      </h4>
      <p className="details">
        O <strong>lema</strong> é a forma de dicionário. Flexões como plural e tempo verbal são geradas
        pelo paradigma. Para uma palavra nova, use <strong>Ensinar palavra nova</strong> acima.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>palavra base</th>
            <th>classe</th>
            <th>formas reconhecidas</th>
            <th>paradigma</th>
            <th>ID técnico</th>
          </tr>
        </thead>
        <tbody>
          {byLexeme.map(([lexemeId, forms]) => {
            const lexeme = lexemes[lexemeId];
            const surfaces = [...new Set(forms.map((f) => f.rawText))];
            return (
              <tr key={lexemeId}>
                <td><strong>{lexeme?.lemma ?? '—'}</strong></td>
                <td className="details">{posNames[lexeme?.pos ?? ''] ?? lexeme?.pos ?? '—'}</td>
                <td>
                  <details>
                    <summary>
                      {surfaces.length} {surfaces.length === 1 ? 'forma' : 'formas'}:{' '}
                      {surfaces.slice(0, 6).join(', ')}
                      {surfaces.length > 6 ? ', …' : ''}
                    </summary>
                    <table className="data-table">
                      <tbody>
                        {forms.map((sf) => (
                          <tr key={sf.id}>
                            <td>{sf.rawText}</td>
                            <td className="details"><code>{sf.features || '—'}</code></td>
                            <td className="details">{sf.generated ? 'gerada' : `exceção (${sf.formType})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </td>
                <td className="details"><code>{lexeme?.paradigmId ?? 'invariável'}</code></td>
                <td className="details"><code>{lexemeId}</code></td>
              </tr>
            );
          })}
          {byLexeme.length === 0 && (
            <tr>
              <td colSpan={5} className="details">Nenhum lema neste filtro.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h4>Exceções fora do paradigma ({exceptions.length})</h4>
      <div className="add-row">
        <input
          aria-label="Forma escrita excepcional"
          placeholder="forma escrita (ex.: erro comum)"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <select aria-label="Palavra base da exceção" value={newLexeme} onChange={(e) => setNewLexeme(e.target.value)}>
          {lexemeIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select
          aria-label="Tipo de exceção"
          value={newType}
          onChange={(e) => setNewType(e.target.value as SurfaceForm['formType'])}
        >
          {['MISSPELLING', 'COLLOQUIAL', 'ABBREVIATION', 'INFLECTION'].map((t) => (
            <option key={t} value={t}>
              {formTypeNames[t] ?? t}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const text = newText.trim();
            if (!text || !newLexeme) return;
            // Id derivado do lema: nunca digitado à mão.
            onAdd({
              id: `${newLexeme}#${newType}:${text.toLowerCase()}`,
              rawText: text,
              lexemeId: newLexeme,
              formType: newType
            });
            setNewText('');
          }}
        >
          Adicionar exceção
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>forma</th>
            <th>lema</th>
            <th>tipo</th>
            <th>ações</th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((sf) => (
            <tr key={sf.id}>
              <td>{sf.rawText}</td>
              <td><code>{sf.lexemeId}</code></td>
              <td className="details">{formTypeNames[sf.formType] ?? sf.formType}</td>
              <td>
                <button className="danger" onClick={() => onRemove(sf.id)}>
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function LexemeTable({
  list,
  conceptIds,
  onAdd,
  onRemove,
  onUpdate
}: {
  list: Array<{ id: string; lemma: string; pos: PartOfSpeech; senseConceptIds: ConceptId[] }>;
  conceptIds: string[];
  onAdd: (l: { id: string; lemma: string; pos: PartOfSpeech; senseConceptIds: ConceptId[] }) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: { senseConceptIds?: ConceptId[]; lemma?: string }) => void;
}) {
  const [newId, setNewId] = useState('');
  const [newLemma, setNewLemma] = useState('');
  const [newPos, setNewPos] = useState<PartOfSpeech>('NOUN');
  const [newSense, setNewSense] = useState(conceptIds[0] ?? '');

  return (
    <>
      <div className="add-row">
        <input aria-label="ID técnico da palavra" placeholder="ID" value={newId} onChange={(e) => setNewId(e.target.value)} />
        <input aria-label="Palavra base ou lema" placeholder="lema" value={newLemma} onChange={(e) => setNewLemma(e.target.value)} />
        <select aria-label="Classe da palavra" value={newPos} onChange={(e) => setNewPos(e.target.value as PartOfSpeech)}>
          {[
            'NOUN',
            'VERB',
            'ADJECTIVE',
            'ADVERB',
            'PREPOSITION',
            'PRONOUN',
            'NUMERAL',
            'CONJUNCTION',
            'DETERMINER'
          ].map((p) => (
            <option key={p} value={p}>
              {posNames[p] ?? p}
            </option>
          ))}
        </select>
        <select aria-label="Significado associado" value={newSense} onChange={(e) => setNewSense(e.target.value)}>
          {conceptIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!newId || !newLemma || !newSense) return;
            onAdd({ id: newId, lemma: newLemma, pos: newPos, senseConceptIds: [newSense] });
            setNewId('');
            setNewLemma('');
          }}
        >
          Adicionar
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>palavra base</th>
            <th>classe</th>
            <th>significados ligados</th>
            <th>ID técnico</th>
            <th>ações</th>
          </tr>
        </thead>
        <tbody>
          {list.map((l) => (
            <tr key={l.id}>
              <td><strong>{l.lemma}</strong></td>
              <td>{posNames[l.pos] ?? l.pos}</td>
              <td>{l.senseConceptIds.join(', ')}</td>
              <td className="details"><code>{l.id}</code></td>
              <td>
                <button className="danger" onClick={() => onRemove(l.id)}>
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ConceptTable({
  list,
  onRemove,
  onAddValue
}: {
  list: ConceptNode[];
  onRemove: (id: string) => void;
  onAddValue: (id: string, category: ValueCategory, literal: string) => void;
}) {
  const [newId, setNewId] = useState('');
  const [category, setCategory] = useState<ValueCategory>('COLOR');
  const [literal, setLiteral] = useState('');

  return (
    <>
      <div className="add-row">
        <input
          aria-label="ID técnico do valor"
          placeholder="ID do valor (ex.: C_VAL_PINK)"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
        />
        <select aria-label="Categoria do valor" value={category} onChange={(e) => setCategory(e.target.value as ValueCategory)}>
          {['COLOR', 'SIZE', 'NUMBER', 'TEXT', 'BOOLEAN', 'ALIGNMENT', 'WEIGHT', 'DISPLAY', 'ENUM'].map(
            (c) => (
              <option key={c} value={c}>
                {valueCategoryNames[c] ?? c}
              </option>
            )
          )}
        </select>
        <input
          aria-label="Valor literal"
          placeholder="literal (ex.: #ec4899)"
          value={literal}
          onChange={(e) => setLiteral(e.target.value)}
        />
        <button
          onClick={() => {
            if (!newId || !literal) return;
            onAddValue(newId, category, literal);
            setNewId('');
            setLiteral('');
          }}
        >
          Adicionar valor
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>significado / ID</th>
            <th>tipo de dado</th>
            <th>detalhes</th>
            <th>ações</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td><code>{c.id}</code></td>
              <td>{conceptKinds[c.kind] ?? c.kind}</td>
              <td className="details">
                {c.kind === 'PROPERTY' && `${c.runtimeProperty} · ${c.valueCategories.join('/')}`}
                {c.kind === 'VALUE' && `${c.valueCategory} · ${String(c.literal)}`}
                {c.kind === 'PROPERTY_GROUP' && c.members.join(', ')}
                {c.kind === 'SPATIAL' && c.relation}
                {c.kind === 'ACTION' && c.operation}
                {c.kind === 'OPERATOR' && c.operator}
                {c.kind === 'ENTITY' &&
                  `contém filhos: ${c.capabilities.canContainChildren ? 'sim' : 'não'} · props: ${c.capabilities.acceptedPropertyIds.length}`}
                {c.kind === 'QUERY' && c.query}
              </td>
              <td>
                <button className="danger" onClick={() => onRemove(c.id)}>
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MweTable({
  list,
  conceptIds,
  onAdd,
  onRemove
}: {
  list: Array<{ id: string; phrase: string; conceptId: string }>;
  conceptIds: string[];
  onAdd: (id: string, phrase: string, conceptId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [newId, setNewId] = useState('');
  const [phrase, setPhrase] = useState('');
  const [conceptId, setConceptId] = useState(conceptIds[0] ?? '');

  return (
    <>
      <div className="add-row">
        <input aria-label="ID técnico da expressão" placeholder="ID" value={newId} onChange={(e) => setNewId(e.target.value)} />
        <input
          aria-label="Texto da expressão"
          placeholder="expressão (ex.: ao lado de)"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
        />
        <select aria-label="Significado da expressão" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
          {conceptIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!newId || !phrase || !conceptId) return;
            onAdd(newId, phrase, conceptId);
            setNewId('');
            setPhrase('');
          }}
        >
          Adicionar
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>expressão</th>
            <th>significado ligado</th>
            <th>ID técnico</th>
            <th>ações</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => (
            <tr key={m.id}>
              <td><strong>{m.phrase}</strong></td>
              <td>{m.conceptId}</td>
              <td className="details"><code>{m.id}</code></td>
              <td>
                <button className="danger" onClick={() => onRemove(m.id)}>
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
