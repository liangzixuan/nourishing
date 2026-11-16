import {parseTemplateSettings,changeMacroPlan} from './domain/macro-templates.mjs';
import {parseEnergyPolicy,parseEnergyExpenditure} from './domain/energy-policy.mjs';
import {parseCarbohydratePolicy,carbohydratePreferences} from './domain/carbohydrate-policy.mjs';

export const targetPolicyCommandFields={
 'targetPolicy.expenditure':['expenditure'],
 'targetPolicy.macros':['macro'],
 'targetPolicy.energy':['policy','kcal'],
 'targetPolicy.carbohydrate':['policy'],
 'targetPolicy.weekday':['weekday','targets'],
 'targetPolicy.schedule':['change'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const amount=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0;
/** Adapt narrow cloud edits to the existing settings owner. No target arithmetic lives here. */
export function prepareTargetPolicyCommand(state,action,context={}){
 if(!Object.hasOwn(targetPolicyCommandFields,action.type))return action;
 const allowed=targetPolicyCommandFields[action.type],p=action.payload;
 if(!object(p)||Object.keys(p).some(key=>!allowed.includes(key))||allowed.filter(key=>key!=='kcal').some(key=>!Object.hasOwn(p,key)))fail('Choose the required target settings only.');
 let patch;
 switch(action.type){
  case 'targetPolicy.expenditure':{
   const expenditure=parseEnergyExpenditure(p.expenditure);if(expenditure.activity.mode!=='manual')fail('Choose recorded exercise for activity.');
   const previous=parseEnergyPolicy(state.settings.energyPolicy);patch={energyPolicy:{...(previous??{version:1,target:{mode:'fixed',includeAboveBaseline:false},display:'remaining'}),...expenditure}};break;
  }
  case 'targetPolicy.macros':{
   const macro=parseTemplateSettings({macro:p.macro,energy:{mode:'inherit'}}).macro;
   const carbohydrate=carbohydratePreferences(state.settings).mode==='net'?'netCarbohydrate':'carbs';
   patch=macro.mode==='fixed'?{macroPolicy:null,targets:{...state.settings.targets,protein:macro.targets.protein,[carbohydrate]:macro.targets.carbohydrate,fat:macro.targets.fat}}:{macroPolicy:macro};break;
  }
  case 'targetPolicy.energy':{
   if(p.policy===undefined)fail('Choose an energy policy.');
   const policy=parseEnergyPolicy(p.policy);if(policy?.activity?.mode==='health-connect')fail('Choose recorded exercise for activity.');patch=policy===null&&!state.settings.energyPolicy?{}:{energyPolicy:policy};
   if(Object.hasOwn(p,'kcal')){if(!amount(p.kcal)||p.kcal===null)fail('Enter a nonnegative calorie target.');patch.targets={...state.settings.targets,calories:p.kcal};}break;
  }
  case 'targetPolicy.carbohydrate':patch={carbohydratePolicy:parseCarbohydratePolicy(p.policy)};break;
  case 'targetPolicy.weekday':{
   if(!Number.isInteger(p.weekday)||p.weekday<0||p.weekday>6)fail('Choose a weekday.');
   const schedule=structuredClone(state.settings.macroSchedule??{});
   if(p.targets===null)delete schedule[p.weekday];
   else{
    if(!object(p.targets)||!Object.keys(p.targets).length||Object.entries(p.targets).some(([key,value])=>!['calories','protein','carbs','netCarbohydrate','fat'].includes(key)||!amount(value)))fail('Enter valid weekday energy and macro targets.');
    schedule[p.weekday]={...schedule[p.weekday],...p.targets};
   }
   patch={macroSchedule:schedule};break;
  }
  case 'targetPolicy.schedule':patch={macroPlan:changeMacroPlan(state.settings.macroPlan,p.change,{today:context.today})};break;
 }
 return {type:'settings.save',payload:patch};
}
