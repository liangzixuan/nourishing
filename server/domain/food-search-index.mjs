import {DatabaseSync} from 'node:sqlite';
import {catalogSearchCategories} from './food-search-categories.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const foodSearchCategories=Object.freeze(['all','favorites','custom','common','supplements','brands','restaurants','beverages']);
export const foodSearchSorts=Object.freeze(['best','az','za','recent','frequent']);
export function parseFoodSearchOptions(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Choose food search options.');
 if(Object.keys(input).some(key=>!['query','category','sort','databases','offset','limit'].includes(key)))fail('Unknown food search option.');
 const {query='',category='all',sort='best',databases=[],offset=0,limit=25}=input;
 if(typeof query!=='string'||!foodSearchCategories.includes(category)||!foodSearchSorts.includes(sort))fail('Choose a supported food search category and sort order.');
 if(!Array.isArray(databases)||databases.some(id=>typeof id!=='string'||!id)||new Set(databases).size!==databases.length)fail('Choose each database once.');
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('Search offset must be nonnegative and limit from 1 to 100.');
 return {query,category,sort,databases:[...databases],offset,limit};
}

/** Merge compact local rows with indexed catalog matches inside SQLite. The
 * caller supplies already parsed literal tokens and normalized local facts.
 * No catalog rows, tables, settings, or personal records are modified. */
export function searchFoodIndex(catalogDb,parsedQuery,{options,libraryRows=[],excludedCatalogIds=[]}){
 const {category,sort,databases,offset,limit}=parseFoodSearchOptions(options);
 if(parsedQuery.matchNone)return {items:[],total:0,offset,nextOffset:null};
 const db=catalogDb??new DatabaseSync(':memory:');
 try{
  const terms=parsedQuery.words.length>0;
  const categoryIds=catalogSearchCategories[category];
  const catalog=(!catalogDb||['custom','favorites','supplements','brands'].includes(category))?
   `SELECT '' AS identity,'{}' AS compact,'' AS name_fold,0 AS tier,0 AS rank,0 AS priority,'' AS database_id,0 AS common,0 AS category_match,0 AS frequency,0 AS recent WHERE 0`:
   `SELECT f.id AS identity,f.compact,f.name_fold,
    CASE WHEN f.name_fold=$query THEN 0 WHEN substr(f.name_fold,1,length($query))=$query THEN 1 ELSE 2 END AS tier,
    ${terms?'bm25(food_search)':'0'} AS rank,f.priority,json_extract(f.compact,'$.source.datasetId') AS database_id,1 AS common,
    ${categoryIds?"json_extract(f.compact,'$.category.id') IN (SELECT value FROM json_each($categoryIds))":'0'} AS category_match,0 AS frequency,0 AS recent
    FROM ${terms?'food_search JOIN food_insights f ON f.food_rowid=food_search.rowid':'food_insights f'}
    WHERE ${terms?'food_search MATCH $match AND ':''}f.id NOT IN (SELECT value FROM json_each($excluded))`;
  const local=`SELECT json_extract(value,'$.identity') AS identity,json_extract(value,'$.compact') AS compact,
    json_extract(value,'$.nameFold') AS name_fold,json_extract(value,'$.tier') AS tier,0 AS rank,-1 AS priority,
    json_extract(value,'$.database') AS database_id,json_extract(value,'$.common') AS common,
    ${categoryIds?`(json_extract(value,$categoryFlag)=1 ${catalogDb?"OR json_extract((SELECT compact FROM food_insights WHERE id=json_extract(l.value,'$.catalogId')),'$.category.id') IN (SELECT value FROM json_each($categoryIds))":''})`:'0'} AS category_match,json_extract(value,'$.frequency') AS frequency,json_extract(value,'$.recent') AS recent
    FROM json_each($library) l`;
  const filter=[...(databases.length?['database_id IN (SELECT value FROM json_each($databases))']:[]),...(category==='common'?['common=1']:categoryIds?['category_match=1']:[])];
  const cte=`WITH candidates AS (${catalog} UNION ALL ${local}), matches AS (SELECT * FROM candidates ${filter.length?'WHERE '+filter.join(' AND '):''})`;
  const order={az:'name_fold ASC,identity ASC',za:'name_fold DESC,identity DESC',recent:'recent DESC,frequency DESC,name_fold,identity',frequent:'frequency DESC,recent DESC,name_fold,identity',best:'tier,frequency DESC,rank,priority,name_fold,identity'}[sort];
  const parameters={$library:JSON.stringify(libraryRows),...(catalogDb&&!['custom','favorites','supplements','brands'].includes(category)?{$query:parsedQuery.trimmed,$excluded:JSON.stringify(excludedCatalogIds),...(terms?{$match:parsedQuery.expression}:{})}:{}),...(databases.length?{$databases:JSON.stringify(databases)}:{})};
  if(categoryIds){parameters.$categoryFlag='$.'+category;if(catalogDb)parameters.$categoryIds=JSON.stringify(categoryIds);}
  const total=db.prepare(cte+' SELECT count(*) AS n FROM matches').get(parameters).n;
  const rows=db.prepare(cte+' SELECT compact FROM matches ORDER BY '+order+' LIMIT $limit OFFSET $offset').all({...parameters,$limit:limit,$offset:offset});
  return {items:rows.map(row=>({kind:'catalog',...JSON.parse(row.compact)})),total,offset,nextOffset:offset+rows.length<total?offset+rows.length:null};
 }finally{if(!catalogDb)db.close();}
}
