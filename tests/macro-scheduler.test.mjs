import {createWebHandler} from '../server/http.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {prepareTargetPolicyCommand} from '../server/target-policy-commands.mjs';
import {targetPolicyView,previewTargetPolicy,previewMacroTemplate} from '../server/target-policy-view.mjs';
const date='2026-11-16',context={today:date},fixed={macro:{mode:'fixed',targets:{protein:0,carbohydrate:null,fat:50}},energy:{mode:'fixed',kcal:2000}};
function apply(state,change){const input={date,type:'targetPolicy.schedule',payload:{change}},before=structuredClone(state),preview=previewTargetPolicy(state,input,context);assert.deepEqual(state,before);const action=prepareTargetPolicyCommand(state,input,context);act(state,action.type,action.payload);assert.deepEqual(targetPolicyView(state,date,context),preview.view);return preview.view;}
test('template preview isolates a disabled scheduler, preserves zero/unknown and canonical units',()=>{
 const state=initialState();state.settings.energyUnit='kJ';apply(state,{kind:'enabled',enabled:false});const before=structuredClone(state),view=previewMacroTemplate(state,{date,settings:fixed});
 assert.equal(view.macroTargets.targets.protein,0);assert.equal(view.macroTargets.targets.carbohydrate,null);assert.equal(view.macroTargets.energyTarget,2000);assert.deepEqual(state,before);
 const keto={macro:{version:1,mode:'keto',program:'custom',leanBodyMassKg:null,proteinPerKg:1.5,carbohydrateGrams:30,athleticBonus:false,proteinAddition:0},energy:{mode:'inherit'}};
 assert.equal(previewMacroTemplate(state,{date,settings:keto}).macroTargets.targets.protein,null);
 const ratio={macro:{version:1,mode:'ratios',basis:'percent',values:{protein:30,carbohydrate:40,fat:30}},energy:{mode:'fixed',kcal:2000}};
 assert.equal(previewMacroTemplate(state,{date,settings:ratio}).macroTargets.targets.protein,150);assert.deepEqual(state,before);
 for(const input of [{date,settings:fixed,owner:'other'},{date:'invalid',settings:fixed},{date,settings:{...fixed,extra:true}},{date,settings:{macro:{...fixed.macro,targets:{...fixed.macro.targets,protein:-1}},energy:fixed.energy}},null])assert.throws(()=>previewMacroTemplate(state,input),error=>error.status===400&&error.code===400);
 assert.deepEqual(state,before);
});
test('schedule edits preserve past weekly assignments, selected date overrides and unrelated targets',()=>{
 const state=initialState(),before=structuredClone(state.settings);apply(state,{kind:'template-create',template:{id:'training',name:'Training',settings:fixed}});state.settings.macroPlan.weeks=[{from:'2026-11-01',days:Array(7).fill('training')}];
 apply(state,{kind:'weekday',weekday:1,templateId:null});assert.equal(state.settings.macroPlan.weeks.length,2);assert.equal(targetPolicyView(state,'2026-11-09',context).effective.assignment.templateId,'training');assert.equal(targetPolicyView(state,date,context).effective.assignment.source,'default');
 apply(state,{kind:'day',date:'2026-11-15',selection:{kind:'custom',settings:fixed}});assert.equal(targetPolicyView(state,'2026-11-15',context).effective.assignment.source,'daily-custom');
 apply(state,{kind:'day',date:'2026-11-15',selection:{kind:'default'}});assert.equal(targetPolicyView(state,'2026-11-15',context).effective.assignment.source,'daily-default');
 apply(state,{kind:'day',date:'2026-11-15',selection:null});assert.equal(targetPolicyView(state,'2026-11-15',context).effective.assignment.source,'weekly');
 apply(state,{kind:'template-delete',id:'training'});assert.equal(state.settings.macroPlan.templates.length,0);assert.ok(state.settings.macroPlan.weeks.every(week=>week.days.every(id=>id===null)));
 for(const key of Object.keys(before))assert.deepEqual(state.settings[key],before[key]);
});

test('template preview authenticates owner, rejects query/extra fields and does not mutate either account',async()=>{
 const states={a:initialState(),b:initialState()},seen=[],handler=createWebHandler({config:{origin:'https://nourishing.test'},service:{targetTemplatePreview:async(owner,input)=>{seen.push(owner);return previewMacroTemplate(states[owner],input);}}});
 const body={date,settings:fixed},send=(owner,input=body,suffix='',origin='https://nourishing.test')=>handler(new Request('https://nourishing.test/api/target-policies/template-preview'+suffix,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(owner?{Cookie:'__Host-nourishing_session='+owner}:{})},body:JSON.stringify(input)}));
 const before=structuredClone(states);assert.equal((await send(null)).status,401);assert.equal((await send('a',body,'?owner=b')).status,400);assert.equal((await send('a',body,'','https://foreign.test')).status,403);assert.equal((await send('a',{...body,owner:'b'})).status,400);assert.equal((await send('a')).status,200);assert.deepEqual(seen,['a','a']);assert.deepEqual(states,before);
});

test('deleting a daily template retains the weekly template and records an explicit daily default',()=>{
 const state=initialState();for(const id of ['weekly','daily'])apply(state,{kind:'template-create',template:{id,name:id,settings:fixed}});
 apply(state,{kind:'weekly',from:date,days:Array(7).fill('weekly')});apply(state,{kind:'day',date,selection:{kind:'template',id:'daily'}});const weeks=structuredClone(state.settings.macroPlan.weeks);
 const view=apply(state,{kind:'template-delete',id:'daily'});assert.equal(view.effective.assignment.source,'daily-default');assert.deepEqual(state.settings.macroPlan.weeks,weeks);assert.deepEqual(state.settings.macroPlan.days,[{date,selection:{kind:'default'}}]);assert.equal(state.settings.macroPlan.templates[0].id,'weekly');
});
