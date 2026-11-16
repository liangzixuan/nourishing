import test from 'node:test';
import assert from 'node:assert/strict';
import {sameDiarySnapshot,presentDiarySnapshot} from '../public/diary-snapshot.js';
test('Diary reuse ignores only capture time and preserves record, revision and fasting transitions',()=>{
 const original={date:'2026-11-16',revision:'one',entries:[{id:'entry',amount:2}],presentation:{fasting:{asOf:'2026-11-16T12:00:00Z',status:'none',elapsedSeconds:null}}};
 const next=structuredClone(original);next.presentation.fasting.asOf='2026-11-16T12:01:00Z';assert.equal(sameDiarySnapshot(original,next),true);
 for(const edit of [x=>x.revision='two',x=>x.date='2026-11-17',x=>x.entries[0].amount=3,x=>x.presentation.fasting.status='active']){const changed=structuredClone(next);edit(changed);assert.equal(sameDiarySnapshot(original,changed),false);}
});
test('Returning to a loaded Diary advances its fasting clock without changing the captured response',()=>{
 const diary={presentation:{fasting:{status:'active',active:{goalHours:1},elapsedSeconds:120,remainingSeconds:3480,progressPercent:120/3600*100,asOf:'2026-11-16T12:00:00Z'}}};const original=structuredClone(diary);
 assert.equal(presentDiarySnapshot(diary,90000).presentation.fasting.elapsedSeconds,210);assert.deepEqual(diary,original);
 assert.equal(presentDiarySnapshot(diary,0).presentation.fasting.elapsedSeconds,120);
 const overtime=presentDiarySnapshot(diary,3600000).presentation.fasting;assert.equal(overtime.remainingSeconds,0);assert.ok(overtime.progressPercent>100);
 diary.presentation.fasting.active.goalHours=null;const untimed=presentDiarySnapshot(diary,90000).presentation.fasting;assert.equal(untimed.remainingSeconds,null);assert.equal(untimed.progressPercent,null);
});
