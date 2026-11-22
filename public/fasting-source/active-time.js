import {MobileDateTimePicker} from './mobile-datetime-picker.js';
import {scheduledWallInstant} from './fasting-time.mjs';
import {Temporal} from './vendor/temporal.js';
import {fastingMutation} from './mutation.js';
import {t,uiLanguage} from '../app-language.js';

// End Time on a running fast is the goal endpoint. Only Stop records completion.
export function openActiveFastTime({active,field,context,onClose,onSaved}){
 const view=context(),start=Temporal.Instant.from(active.start),hourNs=3_600_000_000_000;
 const instant=field==='start'?start:start.add({nanoseconds:Math.round(active.goalHours*hourNs)});
 const original=instant.toZonedDateTimeISO(view.timeZone).toPlainDateTime().toString({smallestUnit:'minute'});
 let mutation,disposed=false;
 const picker=new MobileDateTimePicker({
  value:original,title:t('discover.fasting.'+(field==='start'?'startTime':'endTime')),language:uiLanguage(),timeZone:view.timeZone,
  canDismiss:()=>!mutation?.busy,onClose:()=>{if(!disposed)onClose();},
  onSubmit:value=>{
   if(mutation.blocked)return;
   if(value===original){picker.close();return;}
   const selected=scheduledWallInstant(value,view.timeZone);
   const change=field==='start'?{start:selected.toString()}:{goalHours:Number(selected.epochNanoseconds-start.epochNanoseconds)/hourNs};
   void mutation.run('fast.update',{id:active.id,activeStart:active.start,...change});
  }
 });
 mutation=fastingMutation({revision:()=>view.revision,context:()=>view,host:picker.dialog,onSaved,onReload:onSaved});
 return {back:()=>picker.close(),dispose(){disposed=true;mutation.dispose();picker.close(true);}};
}
