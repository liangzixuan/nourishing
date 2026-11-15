// A derived index of normalized facts. Full food and original source records
// remain owned by foods; rankings never need to scan their large source bodies.
export const CATALOG_FORMAT=3;

export function createCatalogInsightIndex(db){
  db.exec(`CREATE TABLE food_insights (
    food_rowid INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    priority INTEGER NOT NULL,
    name_fold TEXT NOT NULL,
    compact TEXT NOT NULL,
    facts TEXT NOT NULL
  ); CREATE INDEX food_insight_order ON food_insights(priority,name_fold,id);`);
  const insert=db.prepare('INSERT INTO food_insights(food_rowid,id,priority,name_fold,compact,facts) VALUES(?,?,?,?,?,?)');
  return ({rowid,id,priority,nameFold,compact,food})=>{
    if(food.id!==id)throw Error('Catalog food body and indexed identity differ.');
    const facts={sample:food.sample,nutrients:food.nutrients,portions:food.portions,source:{url:food.source?.url,recordUrl:food.source?.recordUrl}};
    insert.run(rowid,id,priority,nameFold,compact,JSON.stringify(facts));
  };
}
