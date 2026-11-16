import {dc} from './discover-cloud-messages.js';
import {TargetControlScreen as CloudTargetScreen} from './energy-expenditure.js';
import {parseMacroPlan,parseTemplateSettings} from './report-source/server/macro-templates.mjs';
import {validateMacroTargets} from './macro-energy-source/macro-capture.js';
const digest=/^[a-f0-9]{64}$/;
export function captureMacroSchedule(value,date,language='en'){
 const fail=()=>{throw Error(dc('scheduleLoad'));};
 if(!value||value.date!==date||!/^\d{4}-\d{2}-\d{2}$/.test(value.today)||!digest.test(value.revision)||!['kcal','kJ'].includes(value.energyUnit))fail();
 const plan=parseMacroPlan(value.plan),schedule=value.week,assignment=value.effective?.assignment;
 if(!schedule||typeof schedule.enabled!=='boolean'||!(schedule.from===null||/^\d{4}-\d{2}-\d{2}$/.test(schedule.from))||!Array.isArray(schedule.days)||schedule.days.length!==7||schedule.days.some(id=>id!==null&&!plan.templates.some(t=>t.id===id)))fail();
 if(!assignment||!['default','weekly','daily-template','daily-custom','daily-default'].includes(assignment.source)||![assignment.templateId,assignment.name,assignment.effectiveFrom].every(v=>v===null||typeof v==='string'))fail();
 const settings=parseTemplateSettings({macro:value.defaults?.controls?.macro,energy:{mode:'inherit'}}),macroTargets=validateMacroTargets(value.effective?.macroTargets,language);
 return {date,today:value.today,revision:value.revision,energyUnit:value.energyUnit,plan,schedule,assignment,defaults:{settings},summary:{macroTargets}};
}
export class TargetControlScreen extends CloudTargetScreen{
 capture(value){return captureMacroSchedule(value,this.date,this.language);}
 action(change){return {type:'targetPolicy.schedule',payload:{change}};}
}
