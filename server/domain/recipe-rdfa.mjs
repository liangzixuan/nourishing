import { RdfaParser } from 'rdfa-streaming-parser';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { recipeSourceFields as fields } from './recipe-source-fields.mjs';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const invalid = message => { throw Object.assign(Error(message), { status: 400 }); };
const key = term => `${term.termType}:${term.value}`;
const schemaName = iri => /^https?:\/\/schema\.org\//.test(iri) ? iri.replace(/^https?:\/\/schema\.org\//, '') : null;
const termValue = term => term.termType === 'Literal' ? { termType: term.termType, value: term.value, datatype: term.datatype.value, language: term.language } : { termType: term.termType, value: term.value };
const numericTypes = new Set(['decimal','integer','double','float','nonNegativeInteger','positiveInteger','int','long','short','byte','unsignedInt','unsignedLong','unsignedShort','unsignedByte'].map(type => XSD + type));
const listNode = Symbol('RDF collection');
const emptyList = { [listNode]: true, empty: true };
function literal(term) {
  if ([XSD + 'string', RDF + 'langString'].includes(term.datatype) || numericTypes.has(term.datatype)) return term.value;
  return { '@value': term.value, '@type': term.datatype, ...(term.language ? { '@language': term.language } : {}) };
}

function project(triples, root) {
  const graph = new Map();
  for (const triple of triples) {
    const id = key(triple.subject);
    if (!graph.has(id)) graph.set(id, []);
    graph.get(id).push(triple);
  }
  const cache = new Map(), colors = new Map(), used = new Set();
  const pending = [{ term: root, exit: false }];
  function value(term) {
    if (term.termType === 'Literal') return literal(term);
    if (term.value === RDF + 'nil') return emptyList;
    return cache.get(key(term)) ?? { '@id': term.termType === 'BlankNode' ? '_:' + term.value : term.value };
  }
  while (pending.length) {
    const { term, exit } = pending.pop(), id = key(term);
    if (exit) {
      const facts = graph.get(id) || [];
      const first = facts.filter(t => t.predicate === RDF + 'first'), rest = facts.filter(t => t.predicate === RDF + 'rest');
      if (first.length || rest.length) {
        if (first.length !== 1 || rest.length !== 1) invalid('Recipe RDFa contains an incomplete or ambiguous collection.');
        const tail = value(rest[0].object);
        if (!tail?.[listNode]) invalid('Recipe RDFa collection does not end in rdf:nil.');
        cache.set(id, { [listNode]: true, first: value(first[0].object), rest: tail });
      } else {
        const node = { '@id': term.termType === 'BlankNode' ? '_:' + term.value : term.value };
        const grouped = new Map();
        for (const fact of facts) {
          const name = fact.predicate === RDF + 'type' ? '@type' : schemaName(fact.predicate);
          if (!name) continue;
          const entry = name === '@type' || ['unitCode','itemListOrder'].includes(name) && fact.object.termType === 'NamedNode' ? fact.object.value : value(fact.object);
          if (!grouped.has(name)) grouped.set(name, []);
          const values = grouped.get(name);
          if (entry?.[listNode]) {
            for (let cell = entry; !cell.empty; cell = cell.rest) {
              if (cell.first?.[listNode]) invalid('Nested RDF collections are not supported as recipe values.');
              values.push(cell.first);
            }
          } else values.push(entry);
        }
        for (const [name, values] of grouped) node[name] = values.length === 1 ? values[0] : values;
        cache.set(id, node);
      }
      colors.set(id, 2); continue;
    }
    if (colors.get(id) === 1) invalid('Recipe RDFa contains a cyclic ingredient or instruction graph.');
    if (colors.get(id) === 2) continue;
    colors.set(id, 1); used.add(id); pending.push({ term, exit: true });
    for (const fact of graph.get(id) || []) if (fact.predicate !== RDF + 'type' && fact.object.termType !== 'Literal' && fact.object.value !== RDF + 'nil' && graph.has(key(fact.object))) pending.push({ term: fact.object, exit: false });
  }
  return { recipe: cache.get(key(root)), triples: triples.filter(triple => used.has(key(triple.subject))) };
}

export async function readRdfaRecipe(input, source) {
  let baseIRI = 'https://nourish.invalid/pasted-recipe';
  try { baseIRI = new URL(source).href; } catch {}
  const parser = new RdfaParser({ baseIRI, contentType: 'text/html' });
  const triples = [], seen = new Set(); let totalBytes = 0, retainedBytes = 0, root = null;
  const sink = new Writable({ objectMode: true, write(quad, encoding, callback) {
    try {
      const triple = { subject: termValue(quad.subject), predicate: quad.predicate.value, object: termValue(quad.object) };
      const encoded = JSON.stringify(triple), bytes = Buffer.byteLength(encoded);
      totalBytes += bytes;
      if (totalBytes > 16777216) invalid('Expanded RDFa exceeds the 16 MiB recipe parsing limit.');
      const name = schemaName(triple.predicate);
      if (triple.predicate === RDF + 'type' || triple.predicate === RDF + 'first' || triple.predicate === RDF + 'rest' || fields.has(name)) {
        if (!seen.has(encoded)) {
          retainedBytes += bytes;
          if (retainedBytes > 5000000) invalid('Recipe RDFa source facts exceed 5 MB.');
          seen.add(encoded); triples.push(triple);
          if (!root && triple.predicate === RDF + 'type' && triple.object.termType === 'NamedNode' && schemaName(triple.object.value) === 'Recipe') root = triple.subject;
        }
      }
      callback();
    } catch (error) { callback(error); }
  } });
  async function* chunks() { for (let i = 0; i < input.length; i += 8192) yield input.slice(i, i + 8192); }
  try { await pipeline(Readable.from(chunks()), parser, sink); }
  catch (error) { if (error.status === 400) throw error; invalid('Recipe RDFa could not be parsed: ' + error.message); }
  if (!root) return null;
  const projected = project(triples, root);
  return { ...projected.recipe, rdfaSource: { version: 1, baseIRI, root, triples: projected.triples } };
}

export function validateRdfaSource(value) {
  if (!value || value.version !== 1 || typeof value.baseIRI !== 'string' || !Array.isArray(value.triples)) invalid('Invalid retained recipe RDFa source.');
  const term = value => value && ['NamedNode','BlankNode','Literal'].includes(value.termType) && typeof value.value === 'string' && (value.termType !== 'Literal' || typeof value.datatype === 'string' && typeof value.language === 'string');
  if (!term(value.root) || value.root.termType === 'Literal' || value.triples.some(t => !t || !term(t.subject) || t.subject.termType === 'Literal' || typeof t.predicate !== 'string' || !term(t.object))) invalid('Invalid retained recipe RDFa terms.');
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > 5000000) invalid('Retained recipe RDFa source exceeds 5 MB.');
  return JSON.parse(encoded);
}
