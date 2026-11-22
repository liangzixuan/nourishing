import {catalogIdentity,compactFoodSource,catalogSourceAliases} from './catalog-source.mjs';
import {searchFoodIndex} from './food-search-index.mjs';
import {CATALOG_FORMAT,createCatalogInsightIndex} from './catalog-insight-index.mjs';
export {CATALOG_FORMAT} from './catalog-insight-index.mjs';
import {catalogSourceId,foodSourceFacts} from './food-catalog-identity.mjs';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { catalog as nutrientCatalog } from './nutrition.mjs';

const FORMAT = CATALOG_FORMAT;
const INSIGHT_CACHE_BYTES = 8 * 1024 * 1024;
const INSIGHT_CACHE_ENTRIES = 6;
const INSIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
const nutrientIds = new Set(nutrientCatalog.map(item => item.id));
function invalid(message) { return Object.assign(new Error(message), {status: 400}); }
function parse(text, label) { try { return JSON.parse(text); } catch { throw new Error(`food catalog contains invalid ${label}. Reinstall the catalog.`); } }
function page(offset, limit) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('Catalog offset must be a nonnegative integer and limit must be from 1 to 100.');
}

export function catalogQuery(query) {
  if (typeof query !== 'string') throw invalid('Catalog query must be text.');
  const trimmed = query.trim().toLowerCase();
  const words = trimmed.normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
  return {trimmed, words, matchNone: Boolean(trimmed && !words.length), expression: words.map(word => `"${word}"*`).join(' AND ')};
}

export function matchesCatalogQuery(name, query) {
  if (query.matchNone) return false;
  const words = String(name).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
  return query.words.every(term => words.some(word => word.startsWith(term)));
}

function freezeProjection(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeProjection(child); Object.freeze(value); }
  return value;
}

/** Builds a new file. The caller owns publication and any temporary-file cleanup. */
export class CatalogWriter {
  constructor(path, {datasets = [], installedAt = new Date().toISOString(), profile = null} = {}) {
    if (existsSync(path)) throw new Error('Catalog output already exists. Choose a new file.');
    mkdirSync(dirname(path), {recursive: true});
    this.db = new DatabaseSync(path);
    this.datasets = structuredClone(datasets);
    this.installedAt = installedAt;
    this.profile = profile;
    this.finished = false;
    try {
      this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA cache_size=-8192;
        CREATE TABLE metadata (key TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE foods (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_fold TEXT NOT NULL, search_text TEXT NOT NULL, dataset_id TEXT NOT NULL, priority INTEGER NOT NULL, body TEXT NOT NULL, original TEXT NOT NULL, compact TEXT NOT NULL);
        CREATE INDEX food_name ON foods(priority,name_fold,id);
        CREATE VIRTUAL TABLE food_search USING fts5(search_text, content='foods', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
        BEGIN IMMEDIATE;`);
      this.insert = this.db.prepare('INSERT INTO foods(id,name,name_fold,search_text,dataset_id,priority,body,original,compact) VALUES(?,?,?,?,?,?,?,?,?)');
      this.index = this.db.prepare('INSERT INTO food_search(rowid,search_text) VALUES(?,?)');
      this.insertInsight=createCatalogInsightIndex(this.db);
    } catch (error) { this.db.close(); this.db = null; throw error; }
  }
  add(food, original = food, category = null) {
    if (!this.db || this.finished) throw new Error('Catalog writer is closed.');
    if (!food || typeof food.id !== 'string' || !food.id || typeof food.name !== 'string' || !food.name || !food.source || typeof food.source.datasetId !== 'string') throw invalid('Catalog food requires an ID, name and dataset source.');
    let priority = this.datasets.findIndex(d => d.id === food.source.datasetId);
    if (priority < 0) { priority = this.datasets.length; this.datasets.push({id: food.source.datasetId, name: food.source.dataset || food.source.datasetId, releaseDate: food.source.releaseDate ?? null, archiveSha256: food.source.archiveSha256 ?? null}); }
    if(category!==null&&(!category||typeof category.id!=='string'||!category.id||typeof category.name!=='string'||!category.name))throw invalid('Catalog categories need exact identity and name.');
    const compact = {...(category?{category:structuredClone(category)}:{}),id: food.id, name: food.name, serving: food.serving, grams: food.grams,
      ...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),
      source: compactFoodSource(food.source),
      ...(food.translations?.length?{translations:structuredClone(food.translations)}:{}),
      knownNutrients: Object.values(food.nutrients || {}).filter(x => typeof x === 'number' && Number.isFinite(x)).length,
      calories: typeof food.nutrients?.calories === 'number' ? food.nutrients.calories : null, portionCount: food.portions?.length || 0};
    const identity=catalogIdentity(food.source);
    const searchText=[food.name,...(food.translations??[]).map(row=>row.name),...catalogSourceAliases(food.source),...(identity?[String(identity.value)]:[])].join(' ');
    const result = this.insert.run(food.id, food.name, food.name.toLowerCase(), searchText, food.source.datasetId, priority, JSON.stringify(food), JSON.stringify(original), JSON.stringify(compact));
    this.index.run(result.lastInsertRowid, searchText);
    this.insertInsight({rowid:result.lastInsertRowid,id:food.id,priority,nameFold:food.name.toLowerCase(),compact:JSON.stringify(compact),food});
  }
  finish() {
    if (!this.db || this.finished) throw new Error('Catalog writer is closed.');
    const counts = new Map(this.db.prepare('SELECT dataset_id,count(*) AS n FROM foods GROUP BY dataset_id').all().map(x => [x.dataset_id, x.n]));
    const datasets = this.datasets.map(d => ({...d, foodCount: counts.get(d.id) || 0}));
    const foodCount = [...counts.values()].reduce((a, b) => a + b, 0);
    const metadata = {format: FORMAT, profile: this.profile, installedAt: this.installedAt, datasets, foodCount};
    this.db.prepare('INSERT INTO metadata VALUES(?,?)').run('catalog', JSON.stringify(metadata));
    this.db.exec('COMMIT;');
    this.finished = true;
    const check = this.db.prepare('PRAGMA integrity_check').get();
    if (Object.values(check)[0] !== 'ok') throw new Error('New food catalog failed SQLite integrity verification.');
    this.db.exec("INSERT INTO food_search(food_search) VALUES('integrity-check')");
    return {available: true, foodCount, datasets, installedAt: this.installedAt};
  }
  close() { if (this.db) { const db = this.db; this.db = null; try { if (!this.finished) db.exec('ROLLBACK'); } finally { db.close(); } } }
}

/** Small fixture helper; production streams records through CatalogWriter. */
export function writeCatalog(path, foods, metadata = {}) {
  let writer;
  try {
    writer = new CatalogWriter(path, metadata);
    for (const entry of foods) writer.add(entry.food || entry, entry.original || entry.food || entry,entry.category);
    return writer.finish();
  } catch (error) {
    if (writer) { writer.close(); writer = null; rmSync(path, {force: true}); }
    throw error;
  } finally { writer?.close(); }
}

export class FoodCatalog {
  constructor(path) {
    this.path = path;
    this.db = null;
    this.insightCache = new Map();
    this.insightCacheBytes = 0;
    if (!existsSync(path)) return;
    let db;
    try {
      db = new DatabaseSync(path, {readOnly: true});
      db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-8192;');
      const row = db.prepare("SELECT body FROM metadata WHERE key='catalog'").get();
      const metadata = parse(row?.body, 'metadata');
      if (metadata.format !== FORMAT || !Array.isArray(metadata.datasets) || !Number.isInteger(metadata.foodCount) || metadata.foodCount < 0 || typeof metadata.installedAt !== 'string') throw new Error('Unsupported or malformed food catalog metadata.');
      if (db.prepare('SELECT count(*) AS n FROM foods').get().n !== metadata.foodCount) throw new Error('food catalog food count does not match its metadata.');
      if(db.prepare('SELECT count(*) AS n FROM food_insights').get().n!==metadata.foodCount||db.prepare('SELECT count(*) AS n FROM food_insights i JOIN foods f ON f.rowid=i.food_rowid AND f.id=i.id').get().n!==metadata.foodCount)throw new Error('Food insight index does not cover the catalog identities.');
      db.prepare('SELECT rowid FROM food_search WHERE food_search MATCH ? LIMIT 1').all('"catalog"');
      this.db = db;
      this.metadata = metadata;
    } catch (error) { db?.close(); throw new Error(`Cannot open food catalog: ${error.message}`, {cause: error}); }
  }
  status() {
    if (!this.db) return {available: false, foodCount: 0, datasets: [], installedAt: null};
    return {available: true, foodCount: this.metadata.foodCount, datasets: this.metadata.datasets.map(d => ({id: d.id, name: d.name, releaseDate: d.releaseDate, foodCount: d.foodCount, archiveSha256: d.archiveSha256})), installedAt: this.metadata.installedAt};
  }
  profile() { return this.db ? structuredClone(this.metadata.profile) : null; }
  search(query, {offset = 0, limit = 25} = {}) {
    page(offset, limit);
    const parsedQuery = catalogQuery(query);
    if (!this.db) return {items: [], total: 0, offset, nextOffset: null};
    const {words, trimmed, expression, matchNone} = parsedQuery;
    if (matchNone) return {items: [], total: 0, offset, nextOffset: null};
    let total, rows;
    if (words.length) {
      total = this.db.prepare('SELECT count(*) AS n FROM food_search WHERE food_search MATCH ?').get(expression).n;
      rows = this.db.prepare(`SELECT f.compact FROM food_search JOIN foods f ON f.rowid=food_search.rowid WHERE food_search MATCH ?
        ORDER BY CASE WHEN f.name_fold=? THEN 0 WHEN substr(f.name_fold,1,length(?))=? THEN 1 ELSE 2 END, bm25(food_search), f.priority, f.name_fold, f.id LIMIT ? OFFSET ?`).all(expression, trimmed, trimmed, trimmed, limit, offset);
    } else {
      total = this.metadata.foodCount;
      rows = this.db.prepare('SELECT compact FROM foods ORDER BY priority,name_fold,id LIMIT ? OFFSET ?').all(limit, offset);
    }
    return {items: rows.map(row => parse(row.compact, 'search result')), total, offset, nextOffset: offset + rows.length < total ? offset + rows.length : null};
  }
  searchWorkspace(query, input) { return searchFoodIndex(this.db,catalogQuery(query),input); }
  get(id) { if (typeof id !== 'string' || !id) throw invalid('Catalog ID must be nonempty text.'); if (!this.db) return null; const row = this.db.prepare('SELECT body FROM foods WHERE id=?').get(id); return row ? parse(row.body, 'food record') : null; }
  getOriginal(id) { if (typeof id !== 'string' || !id) throw invalid('Catalog ID must be nonempty text.'); if (!this.db) return null; const row = this.db.prepare('SELECT original FROM foods WHERE id=?').get(id); return row ? parse(row.original, 'source record') : null; }

  categories() {
    if(!this.db)return [];
    return this.db.prepare(`SELECT json_extract(compact,'$.category.id') AS category_id,json_extract(compact,'$.category.name') AS category_name,
      json_group_array(DISTINCT COALESCE(NULLIF(json_extract(compact,'$.source.dataset'),''),NULLIF(json_extract(compact,'$.source.name'),''),json_extract(compact,'$.source.datasetId'))) AS source_names,
      count(*) AS food_count FROM food_insights WHERE json_type(compact,'$.category.id')='text' AND COALESCE(json_extract(facts,'$.sample'),0)<>1 GROUP BY category_id,category_name ORDER BY category_name,category_id`).all().map(row=>({id:row.category_id,name:row.category_name,foodCount:row.food_count,sourceNames:JSON.parse(row.source_names).filter(Boolean).sort()}));
  }

  /** Minimal normalized facts only; source bodies and original records never leave SQLite here. */
  projectInsights(selectedNutrients, {query = '', portions = 'none'} = {}) {
    if (!Array.isArray(selectedNutrients) || !selectedNutrients.length || !selectedNutrients.every(id => nutrientIds.has(id))) throw invalid('Choose existing nutrient IDs for the catalog projection.');
    if (!['none', 'first', 'all'].includes(portions)) throw invalid('Catalog portion projection must be none, first or all.');
    const selection = [...new Set([...selectedNutrients, 'calories'])].sort();
    const parsedQuery = catalogQuery(query);
    if (!this.db || parsedQuery.matchNone) return [];
    const key = JSON.stringify([selection, parsedQuery.expression, portions]);
    const now = Date.now();
    for (const [cachedKey, entry] of this.insightCache) if (now - entry.createdAt >= INSIGHT_CACHE_TTL_MS) { this.insightCache.delete(cachedKey); this.insightCacheBytes -= entry.bytes; }
    const cached = this.insightCache.get(key);
    if (cached) { this.insightCache.delete(key); this.insightCache.set(key, cached); return cached.items; }
    const sourceRows = parsedQuery.words.length ? 'food_search JOIN food_insights f ON f.food_rowid=food_search.rowid' : 'food_insights f';
    const clauses = ["COALESCE(json_extract(f.facts,'$.sample'),0)<>1"];
    if (parsedQuery.words.length) clauses.push('food_search MATCH ?');
    const portionProjection = portions === 'none' ? "'[]'" : portions === 'all'
      ? "CASE WHEN json_type(f.facts,'$.portions')='array' THEN json_extract(f.facts,'$.portions') ELSE '[]' END"
      : `(SELECT COALESCE(json_group_array(json(p.value)),'[]') FROM
          (SELECT value FROM json_each(f.facts,'$.portions')
           WHERE type='object' AND json_type(value,'$.grams') IN ('integer','real') AND json_extract(value,'$.grams')>0
           AND json_type(value,'$.id')='text' AND json_type(value,'$.label')='text' ORDER BY CAST(key AS INTEGER) LIMIT 1) p)`;
    const sql = `SELECT f.compact,
      (SELECT json_group_object(n.key,n.value) FROM json_each(f.facts,'$.nutrients') n
       WHERE n.key IN (SELECT value FROM json_each(?)) AND n.type IN ('integer','real') AND n.value>=0 AND n.value<=1.7976931348623157e308) AS nutrients,
      ${portionProjection} AS portions,
      json_extract(f.facts,'$.source.url') AS dataset_url,json_extract(f.facts,'$.source.recordUrl') AS record_url
      FROM ${sourceRows} WHERE ${clauses.join(' AND ')} ORDER BY f.priority,f.name_fold,f.id`;
    const args = [JSON.stringify(selection), ...(parsedQuery.words.length ? [parsedQuery.expression] : [])];
    const items = [];
    let bytes = 0;
    for (const row of this.db.prepare(sql).iterate(...args)) {
      const compact = parse(row.compact, 'insight identity');
      const dataset = this.metadata.datasets.find(item => item.id === compact.source.datasetId);
      const item = {category:compact.category??null,id: compact.id, name: compact.name, serving: compact.serving, grams: compact.grams,
        ...(compact.milliliters!==undefined?{milliliters:compact.milliliters}:{}),
        nutrients: parse(row.nutrients, 'insight nutrients'), portions: parse(row.portions, 'insight portions'),
        source: {...compact.source, releaseDate: dataset?.releaseDate ?? null, archiveSha256: dataset?.archiveSha256 ?? null,
          ...(row.dataset_url ? {url: row.dataset_url} : {}), ...(row.record_url ? {recordUrl: row.record_url} : {})}};
      bytes += Buffer.byteLength(JSON.stringify(item));
      items.push(freezeProjection(item));
    }
    Object.freeze(items);
    // Only immutable catalog facts are cached. Library edits are never cached.
    // Oversized projections remain one-request values rather than retained state.
    if (bytes <= INSIGHT_CACHE_BYTES) {
      while (this.insightCache.size >= INSIGHT_CACHE_ENTRIES || this.insightCacheBytes + bytes > INSIGHT_CACHE_BYTES) {
        const oldest = this.insightCache.keys().next().value;
        if (oldest === undefined) break;
        this.insightCacheBytes -= this.insightCache.get(oldest).bytes;
        this.insightCache.delete(oldest);
      }
      this.insightCache.set(key, {items, bytes, createdAt: now});
      this.insightCacheBytes += bytes;
    }
    return items;
  }

  /** Deduplicate only immutable snapshots whose complete normalized facts still match. */
  identicalSnapshotIds(foods) {
    const candidates = foods.filter(food => food?.readOnly === true && typeof food.id === 'string' && catalogIdentity(food.source));
    if (!this.db || !candidates.length) return new Set();
    const byId = Map.groupBy(candidates, catalogSourceId),result = new Set();
    const rows=this.db.prepare('SELECT id,body FROM foods WHERE id IN (SELECT value FROM json_each(?))').iterate(JSON.stringify([...byId.keys()]));
    for(const row of rows){
      const installed=parse(row.body,'snapshot food');
      for(const food of byId.get(row.id)){
        // Local classification and carbohydrate interpretation are intentionally
        // outside source facts; every other normalized field must still match.
        if(isDeepStrictEqual(foodSourceFacts(food),foodSourceFacts(installed)))result.add(food.id);
      }
    }
    return result;
  }

  close() { this.insightCache.clear(); this.insightCacheBytes = 0; if (this.db) { this.db.close(); this.db = null; } }
}
