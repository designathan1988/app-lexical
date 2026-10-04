export interface GraphNode { id: string; concept: string }
export interface GraphEdge { from: string; role: string; to: string }
export interface GraphAttribute { from: string; role: string; value: string }
export interface ParsedGraph {
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  attributes: GraphAttribute[];
}

const attributeRoles = new Set(['polarity', 'mode', 'degree', 'quant', 'polite', 'emph']);

export function parseGraph(source: string): ParsedGraph {
  const tokens = source.match(/\(|\)|:[\p{L}\p{N}_-]+|\/|[^\s():/]+/gu) ?? [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const attributes: GraphAttribute[] = [];
  const variables = new Map<string, string>();
  const leaves = new Map<string, string>();
  let cursor = 0;
  let nextId = 1;
  const addNode = (concept: string, variable?: string, leaf = false): string => {
    const existing = leaf ? leaves.get(concept) : undefined;
    if (existing) return existing;
    const id = variable ?? `v${nextId++}`;
    nodes.push({ id, concept });
    if (variable) variables.set(variable, id);
    if (leaf) leaves.set(concept, id);
    return id;
  };
  const parseNode = (): string => {
    const wrapped = tokens[cursor] === '(';
    if (wrapped) cursor++;
    const first = tokens[cursor++] ?? '_';
    let variable: string | undefined;
    let concept = first;
    if (tokens[cursor] === '/') {
      cursor++;
      variable = first;
      concept = tokens[cursor++] ?? '_';
    }
    if (wrapped && concept !== 'and') {
      while (tokens[cursor] && tokens[cursor] !== ')' && !tokens[cursor].startsWith(':') && tokens[cursor] !== '(') {
        concept += ` ${tokens[cursor++]}`;
      }
    }
    const id = addNode(concept, variable, !variable && (tokens[cursor] === ')' || !wrapped));
    let implicit = 1;
    while (cursor < tokens.length && (!wrapped || tokens[cursor] !== ')')) {
      let role: string;
      if (tokens[cursor]?.startsWith(':')) role = tokens[cursor++].slice(1);
      else if (concept === 'and') role = `op${implicit++}`;
      else break;
      if (!tokens[cursor]) break;
      if (tokens[cursor] === '(') {
        const child = parseNode();
        edges.push({ from: id, role, to: child });
      } else {
        const value = tokens[cursor++];
        if (variables.has(value)) edges.push({ from: id, role, to: variables.get(value)! });
        else if (attributeRoles.has(role)) attributes.push({ from: id, role, value });
        else edges.push({ from: id, role, to: addNode(value, undefined, true) });
      }
    }
    if (wrapped && tokens[cursor] === ')') cursor++;
    return id;
  };
  const root = parseNode();
  return { root, nodes, edges, attributes };
}

export function smatchF1(left: string | ParsedGraph, right: string | ParsedGraph): number {
  const a = typeof left === 'string' ? parseGraph(left) : left;
  const b = typeof right === 'string' ? parseGraph(right) : right;
  const totalA = a.nodes.length + a.edges.length + a.attributes.length;
  const totalB = b.nodes.length + b.edges.length + b.attributes.length;
  if (!totalA && !totalB) return 1;
  if (!totalA || !totalB) return 0;
  const bConcept = new Map(b.nodes.map((node) => [node.id, node.concept]));
  const bEdge = new Set(b.edges.map((edge) => `${edge.from}|${edge.role}|${edge.to}`));
  const bAttr = new Set(b.attributes.map((attribute) => `${attribute.from}|${attribute.role}|${attribute.value}`));
  const mapping = new Map<string, string>();
  const used = new Set<string>();
  let best = 0;
  const ordered = [...a.nodes].sort((x, y) => {
    const dx = a.edges.filter((edge) => edge.from === x.id || edge.to === x.id).length;
    const dy = a.edges.filter((edge) => edge.from === y.id || edge.to === y.id).length;
    return dy - dx;
  });
  const scorePartial = (): number => {
    let score = 0;
    for (const node of a.nodes) if (mapping.has(node.id) && bConcept.get(mapping.get(node.id)!) === node.concept) score++;
    for (const edge of a.edges) {
      const from = mapping.get(edge.from);
      const to = mapping.get(edge.to);
      if (from && to && bEdge.has(`${from}|${edge.role}|${to}`)) score++;
    }
    for (const attribute of a.attributes) {
      const from = mapping.get(attribute.from);
      if (from && bAttr.has(`${from}|${attribute.role}|${attribute.value}`)) score++;
    }
    return score;
  };
  const search = (index: number) => {
    if (index === ordered.length) {
      best = Math.max(best, scorePartial());
      return;
    }
    const node = ordered[index];
    const candidates = [...b.nodes].sort((x, y) => Number(y.concept === node.concept) - Number(x.concept === node.concept));
    for (const candidate of candidates) {
      if (used.has(candidate.id)) continue;
      mapping.set(node.id, candidate.id);
      used.add(candidate.id);
      search(index + 1);
      used.delete(candidate.id);
      mapping.delete(node.id);
      if (best === Math.min(totalA, totalB)) return;
    }
    search(index + 1);
  };
  search(0);
  return (2 * best) / (totalA + totalB);
}
