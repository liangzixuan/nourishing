// Default is read-only. --apply requires an explicitly supplied current cloud revision.
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {operator} from './operator.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {digest} from '../server/data-codec.mjs';
import {HEALTH_EXPORT_FAMILIES,readLegacyHealthExportMetadata,readHealthExportState,installHealthExportMetadata} from '../server/health-export-state.mjs';

const unrelatedBytes=state=>JSON.stringify(Object.fromEntries(Object.entries(state).filter(([family])=>!HEALTH_EXPORT_FAMILIES.includes(family))));

try{
 const {values}=parseArgs({options:{source:{type:'string'},owner:{type:'string'},revision:{type:'string'},apply:{type:'boolean',default:false}}});
 if(!values.source||!values.owner||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(values.owner))throw Error('Supply --source and --owner.');
 if(values.apply&&!/^[a-f0-9]{64}$/.test(values.revision??''))throw Error('Apply requires --revision from the reviewed cloud head.');
 const source=new DatabaseSync(values.source,{readOnly:true});let metadata;
 try{metadata=readLegacyHealthExportMetadata(source);}finally{source.close();}
 if(!metadata)throw Error('Source has no export namespace. No migration was performed.');
 const {db,users}=operator();await users.get({userId:values.owner});
 const repository=createDataRepository(db,values.owner),state=await repository.readState(),current=readHealthExportState(state);
 const candidate=structuredClone(state),proposed=installHealthExportMetadata(candidate,metadata);
 assert.equal(unrelatedBytes(candidate),unrelatedBytes(state));
 assert.equal(readHealthExportState(candidate).namespace,metadata.namespace);
 if(values.revision&&proposed.changed&&digest(state)!==values.revision)throw Object.assign(Error('Cloud revision changed.'),{code:409});
 const report={mode:values.apply?'apply':'read-only',source:{identityPresent:true,drafts:metadata.drafts.length,policies:metadata.policies.length},target:{identityPresent:current!==null,drafts:current?.drafts.length??0,policies:current?.policies.length??0},changeNeeded:proposed.changed};
 if(values.apply){
  const store=createWorkspaceStore(db,values.owner),result=await store.importHealthExportMetadata(metadata,{revision:values.revision});
  const after=await repository.readState();installHealthExportMetadata(structuredClone(after),metadata);
  assert.equal(unrelatedBytes(after),unrelatedBytes(state));
  assert.equal(readHealthExportState(after).namespace,metadata.namespace);
  const repeated=await store.importHealthExportMetadata(metadata,{revision:values.revision});
  assert.equal(repeated.changed,false);assert.equal(repeated.revision,result.revision);
  assert.equal(JSON.stringify(await repository.readState()),JSON.stringify(after));
  report.changed=result.changed;report.verified=true;report.unrelatedStateUnchanged=true;report.sourceLineageExact=true;report.repeatedApplyNoOp=true;
 }
 console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({ok:false,status:Number.isInteger(error.code)?error.code:null,message:error.publicMessage??'Migration did not complete. Check source, operator access and the supplied revision.'}));process.exitCode=1;}
