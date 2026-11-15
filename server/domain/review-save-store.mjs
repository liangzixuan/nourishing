import {randomUUID} from 'node:crypto';
const conflict=message=>{throw Object.assign(new Error(message),{status:409});};
/** Transport receipts share the workspace transaction; image storage is separate. */
export class ReviewSaveStore{
  constructor(db){
    this.db=db;
    const has=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    db.exec('SAVEPOINT review_save_schema');
    try{
      if(has('photo_save_state')){if(has('review_save_state'))throw Error('Conflicting reviewed-save scope tables.');db.exec('ALTER TABLE photo_save_state RENAME TO review_save_state');}
      if(has('photo_save_receipts')){if(has('review_save_receipts'))throw Error('Conflicting reviewed-save receipt tables.');db.exec("ALTER TABLE photo_save_receipts RENAME TO review_save_receipts; ALTER TABLE review_save_receipts ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo'");}
      db.exec('CREATE TABLE IF NOT EXISTS review_save_state (id INTEGER PRIMARY KEY CHECK(id=1), scope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS review_save_receipts (operation_id TEXT PRIMARY KEY, scope TEXT NOT NULL, request_digest TEXT NOT NULL, receipt TEXT NOT NULL, kind TEXT NOT NULL);');
      db.prepare('INSERT OR IGNORE INTO review_save_state(id,scope) VALUES(1,?)').run(randomUUID());
      db.exec('RELEASE review_save_schema');
    }catch(error){db.exec('ROLLBACK TO review_save_schema; RELEASE review_save_schema');throw error;}
  }
  saveScope(){return this.db.prepare('SELECT scope FROM review_save_state WHERE id=1').get().scope;}
  savedReceipt(kind,save,digest){
    if(save.scope!==this.saveScope())conflict('This save belongs to an earlier workspace restore. Review the current records before saving again.');
    const previous=this.db.prepare('SELECT kind,scope,request_digest,receipt FROM review_save_receipts WHERE operation_id=?').get(save.operationId);
    if(!previous)return null;
    if(previous.kind!==kind||previous.scope!==save.scope||previous.request_digest!==digest)conflict('This save ID was already used for a different packet. Review the current records.');
    return JSON.parse(previous.receipt);
  }
  recordSave(kind,save,digest,receipt){this.db.prepare('INSERT INTO review_save_receipts(operation_id,scope,request_digest,receipt,kind) VALUES(?,?,?,?,?)').run(save.operationId,save.scope,digest,JSON.stringify(receipt),kind);}
  /** Restore calls this within Store.update; backup receipts are never imported. */
  invalidateSaves(){const scope=randomUUID();this.db.prepare('UPDATE review_save_state SET scope=? WHERE id=1').run(scope);this.db.exec('DELETE FROM review_save_receipts');return scope;}
}

export function saveIdentity(value){
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!['operationId','scope','reviewToken'].every(key=>Object.hasOwn(value,key))||typeof value.operationId!=='string'||typeof value.scope!=='string'||!uuid.test(value.operationId)||!uuid.test(value.scope)||typeof value.reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(value.reviewToken))throw Object.assign(Error('Save the exact reviewed packet with its operation ID, scope and review token.'),{status:400});
  return {...value};
}
