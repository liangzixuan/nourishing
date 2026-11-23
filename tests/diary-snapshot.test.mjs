import test from 'node:test';
import assert from 'node:assert/strict';
import {sameDiarySnapshot,presentFastingTiming} from '../public/diary-snapshot.js';
test('Diary reuse detects record, date and revision changes',()=>{
 const original={date:'2026-11-16',revision:'one',entries:[{id:'entry',amount:2}],presentation:{}};
 const next=structuredClone(original);assert.equal(sameDiarySnapshot(original,next),true);
 for(const edit of [x=>x.revision='two',x=>x.date='2026-11-17',x=>x.entries[0].amount=3]){const changed=structuredClone(next);edit(changed);assert.equal(sameDiarySnapshot(original,changed),false);}
});
test('Dashboard advances its fasting clock without changing the captured response',()=>{
 const diary={presentation:{fasting:{status:'active',active:{goalHours:1},elapsedSeconds:120,remainingSeconds:3480,progressPercent:120/3600*100,asOf:'2026-11-16T12:00:00Z'}}};const original=structuredClone(diary);
 assert.equal(presentFastingTiming(diary.presentation.fasting,90000).elapsedSeconds,210);assert.deepEqual(diary,original);
 assert.equal(presentFastingTiming(diary.presentation.fasting,0).elapsedSeconds,120);
 const overtime=presentFastingTiming(diary.presentation.fasting,3600000);assert.equal(overtime.remainingSeconds,0);assert.ok(overtime.progressPercent>100);
 diary.presentation.fasting.active.goalHours=null;const untimed=presentFastingTiming(diary.presentation.fasting,90000);assert.equal(untimed.remainingSeconds,null);assert.equal(untimed.progressPercent,null);
});
