import {randomUUID,createHash} from 'node:crypto';
const fail=()=>{throw Object.assign(Error('Invalid Health Connect export workspace identity.'),{status:400});};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function validateHealthExportNamespace(value){if(!uuid(value))fail();return value;}
export function readHealthExportIdentity(db){
 if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='health_export_identity'").get())return null;
 const rows=db.prepare('SELECT id,namespace FROM health_export_identity').all();
 if(rows.length!==1||rows[0].id!==1||!uuid(rows[0].namespace))fail();
 return rows[0].namespace;
}
export function initializeHealthExportIdentity(db){
 db.exec('CREATE TABLE IF NOT EXISTS health_export_identity (id INTEGER PRIMARY KEY CHECK(id=1),namespace TEXT NOT NULL)');
 if(!db.prepare('SELECT id FROM health_export_identity').get())db.prepare('INSERT INTO health_export_identity VALUES(1,?)').run(randomUUID());
 return readHealthExportIdentity(db);
}
/** The backup owner calls this within its restore transaction. */
export function restoreHealthExportIdentity(source,target){
 const namespace=readHealthExportIdentity(source);initializeHealthExportIdentity(target);
 target.prepare('UPDATE health_export_identity SET namespace=? WHERE id=1').run(namespace??randomUUID());
}

/** Stable intake identity, shared by individual exports and reviewed groups. */
export function healthIntakeClientId(namespace,kind,collection,id){
 if(!uuid(namespace)||!['nutrition','hydration'].includes(kind)||!['entries','biometrics'].includes(collection)||typeof id!=='string'||!id.trim())fail();
 return 'nourish-export:'+kind+':'+createHash('sha256').update(JSON.stringify([namespace,collection,id])).digest('hex');
}
