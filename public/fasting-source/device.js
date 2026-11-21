import {applyFastingChange,applyFastingCommand,fastingView} from '../local-diary-projection.js';

function fromView(view) {
 const state={settings:{},fasts:view.history.rows.map(({revision,durationSeconds,startLocal,endLocal,...record})=>record)};
 state.fastingPlan={version:1,schedules:view.schedules.filter(row=>row.armedAt).map(({nextStart,...schedule})=>schedule)};
 applyFastingChange(state,{settings:view.settings});
 return state;
}

// Validate against the same visible records, clock and account zone the editor used.
export function prepareFastingWrite(view,body) {
 const now=new Date(),at=now.toISOString(),p=body.payload;
 if(body.type==='fast.start')p.start??=at;
 if(body.type==='fast.end')p.end??=at;
 if(['fasting.schedule.save','fasting.schedule.startNow'].includes(body.type))p.recordedAt??=at;
 const state=fromView(view);
 if(view.active&&!state.fasts.some(row=>row.id===view.active.id)){
  const {startLocal,...record}=view.active;state.fasts.push(record);
 }
 const {result}=applyFastingCommand(state,body,{now,timeZone:view.timeZone});
 return result.fastingChange;
}

export function projectFastingResponse(path,view,state,changes,revision) {
 const url=new URL(path,'http://localhost');
 if(url.pathname==='/api/dashboard'&&view?.capture?.calendar&&state){
  const {capture}=view,now=new Date(),fast=fastingView(state,{now,timeZone:capture.calendar.timeZone},{limit:1},revision);
  const next=fast.schedules.filter(row=>row.nextStart).sort((a,b)=>a.nextStart.localeCompare(b.nextStart))[0];
  return {...view,preferences:{...view.preferences,fastingEnabled:fast.settings.enabled,timerDirection:fast.settings.timerDirection},
   dashboard:{...view.dashboard,widgets:{...view.dashboard.widgets,fasting:fast.settings.showDashboard}},
   upcoming:next?{label:next.label,start:next.nextStart}:null,capture:{...capture,cards:{...capture.cards,fasting:fast.timing},calendar:{...capture.calendar,asOf:now.toISOString()}}};
 }
 if(url.pathname!=='/api/fasting'||!view?.history)return view;
 const base=state??fromView(view);
 if(!state)for(const change of changes)applyFastingChange(base,change);
 const limit=Number(url.searchParams.get('limit')??25),offset=Number(url.searchParams.get('offset')??0);
 return fastingView(base,{now:new Date(),timeZone:view.timeZone,schedulerReady:view.schedulerReady},{offset:state?offset:0,limit},revision??view.revision);
}
