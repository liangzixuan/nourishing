import {DatabaseSync} from 'node:sqlite';
import {catalogIdentity,compactFoodSource,catalogSourceAliases} from './domain/catalog-source.mjs';
import {catalogQuery} from './domain/usda-catalog.mjs';
import {searchFoodIndex} from './domain/food-search-index.mjs';

/** A lazy, public-only FTS index owned by one verified Appwrite artifact.
 * Personal rows enter the canonical query as bound values, never stored tables. */
export function createCatalogSearchIndex(foods,metadata,valuesFor){
 let db=null;
 function prepare(){
  if(db)return db;
  const candidate=new DatabaseSync(':memory:');
  try{
   candidate.exec(`PRAGMA cache_size=-8192; CREATE TABLE food_insights(food_rowid INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,priority INTEGER NOT NULL,name_fold TEXT NOT NULL,compact TEXT NOT NULL);
    CREATE INDEX food_insight_order ON food_insights(priority,name_fold,id);
    CREATE VIRTUAL TABLE food_search USING fts5(search_text,content='',tokenize='unicode61 remove_diacritics 2'); BEGIN;`);
   const insert=candidate.prepare('INSERT INTO food_insights VALUES(?,?,?,?,?)'),fts=candidate.prepare('INSERT INTO food_search(rowid,search_text) VALUES(?,?)');
   const priorities=new Map((metadata.datasets??[]).map((row,index)=>[row.id,index]));
   for(const [index,food]of foods.entries()){
    const identity=catalogIdentity(food.source),values=valuesFor(food),compact={id:food.id,name:food.name,serving:food.serving,grams:food.grams??null,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),source:compactFoodSource(food.source),...(food.category?{category:food.category}:{}),...(food.translations?.length?{translations:food.translations}:{}),knownNutrients:Object.values(values).filter(Number.isFinite).length,calories:values.calories??null,portionCount:food.portions?.length??0};
    insert.run(index+1,food.id,priorities.get(food.source?.datasetId)??priorities.size,food.name.toLowerCase(),JSON.stringify(compact));
    fts.run(index+1,[food.name,...(food.translations??[]).map(row=>row.name),...catalogSourceAliases(food.source),...(identity?[String(identity.value)]:[])].join(' '));
   }
   candidate.exec('COMMIT');db=candidate;return db;
  }catch(error){candidate.close();throw error;}
 }
 return {
  search(query,options){return searchFoodIndex(prepare(),catalogQuery(query),options);},
  dispose(){db?.close();db=null;}
 };
}
