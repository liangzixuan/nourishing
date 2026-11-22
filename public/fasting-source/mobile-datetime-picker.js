import {Temporal} from './vendor/temporal.js';
import {escape as e,symbol} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {dateTimeParts,pickerValue,dateWindow,compactWallTime} from './mobile-datetime-values.js';

// Native scroll snapping owns touch momentum. Selection is the row at the center,
// read synchronously on Save so a pending scroll event cannot save an older row.
export class WheelColumn{
 constructor({root,key,label,items,value,onChange,onSettled}){
  Object.assign(this,{root,key,onChange,onSettled});root.setAttribute('role','listbox');root.setAttribute('tabindex','0');root.setAttribute('aria-label',label);root.dataset.timeWheel=key;
  root.addEventListener('scroll',()=>{this.read();clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.disposed)this.onSettled?.()},160)});
  root.addEventListener('click',event=>{const option=event.target.closest('[data-wheel-index]');if(option)this.select(Number(option.dataset.wheelIndex));});
  root.addEventListener('keydown',event=>{const steps={ArrowDown:1,ArrowUp:-1,PageDown:5,PageUp:-5};if(event.key in steps){event.preventDefault();this.select(this.index+steps[event.key]);}else if(['Home','End'].includes(event.key)){event.preventDefault();this.select(event.key==='Home'?0:this.items.length-1);}});
  this.setItems(items,value);this.resize=new ResizeObserver(()=>this.align());this.resize.observe(root);
 }
 setItems(items,value){this.items=items;this.index=Math.max(0,items.findIndex(item=>item.value===value));this.root.innerHTML=items.map((item,index)=>`<div role="option" id="time-wheel-${this.key}-${index}" data-wheel-index="${index}" data-wheel-value="${e(item.value)}">${item.parts?item.parts.map(part=>part.strong?'<strong>'+e(part.text)+'</strong>':e(part.text)).join(''):e(item.label)}</div>`).join('');this.align();this.paint();}
 height(){return parseFloat(getComputedStyle(this.root.firstElementChild).height)||32;}
 align(){if(!this.disposed)this.root.scrollTop=this.index*this.height();}
 read(){const index=Math.max(0,Math.min(this.items.length-1,Math.round(this.root.scrollTop/this.height())));if(index!==this.index){this.index=index;this.paint();this.onChange?.(this.items[index].value);}return this.items[this.index].value;}
 select(index){this.index=Math.max(0,Math.min(this.items.length-1,index));this.align();this.paint();this.onChange?.(this.items[this.index].value);clearTimeout(this.timer);this.onSettled?.();}
 paint(){this.root.setAttribute('aria-activedescendant',`time-wheel-${this.key}-${this.index}`);[...this.root.children].forEach((node,index)=>{node.setAttribute('aria-selected',String(index===this.index));node.dataset.distance=Math.min(3,Math.abs(index-this.index));});}
 dispose(){this.disposed=true;clearTimeout(this.timer);this.resize.disconnect();}
}

export function dateTimeField(name,value,label,language='en'){
 const text=value?compactWallTime(value,language):formatMessage(language,'fastingHistory.active');
 return `<input name="${e(name)}" type="hidden" value="${e(value)}"><button class="dc-button dc-wall-time" type="button" data-datetime-field="${e(name)}" data-datetime-label="${e(label)}" aria-label="${e(label+': '+text)}">${e(text)}</button>`;
}
export function refreshDateTimeFields(form,language='en'){
 for(const button of form.querySelectorAll('[data-datetime-field]')){const field=form.elements[button.dataset.datetimeField];button.textContent=field.value?compactWallTime(field.value,language):formatMessage(language,'fastingHistory.active');button.setAttribute('aria-label',button.dataset.datetimeLabel+': '+button.textContent);button.disabled=field.disabled;}
}

export class MobileDateTimePicker{
 constructor({value,title,language='en',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,onChoose,onSubmit,onClose,canDismiss}){
  Object.assign(this,{language,timeZone,onChoose,onSubmit,onClose,canDismiss});this.original=value||Temporal.Now.plainDateTimeISO(timeZone).toString({smallestUnit:'minute'});this.parts=dateTimeParts(this.original);this.focus=document.activeElement;this.today=Temporal.Now.plainDateISO(timeZone).toString();this.text=key=>formatMessage(language,'dateTimePicker.'+key);
  this.dialog=document.createElement('dialog');this.dialog.className='mdtp-dialog';this.dialog.dataset.datetimePicker='';this.dialog.setAttribute('aria-label',title);
  this.dialog.innerHTML=`<header><h2>${e(title)}</h2><button type="button" data-time-close aria-label="${e(this.text('close'))}">${symbol('close')}</button></header><div class="mdtp-wheels"><div data-wheel-column="date"></div><div data-wheel-column="hour"></div><div data-wheel-column="minute"></div><div data-wheel-column="period"></div></div><p role="alert" hidden></p><button type="button" class="dc-button dc-pill" data-time-apply>${e(this.text('save'))}</button>`;
  this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});this.dialog.addEventListener('click',event=>{if(event.target.closest('[data-time-close]'))this.close();if(event.target.closest('[data-time-apply]'))this.apply();if(event.target===this.dialog){const r=this.dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.close();}});
  document.body.append(this.dialog);this.dialog.showModal();
  const numbers=(count,start)=>Array.from({length:count},(_,index)=>({value:index+start,label:String(index+start).padStart(2,'0')})),periods=[0,1].map(value=>({value,label:new Intl.DateTimeFormat(language,{hour:'numeric',hour12:true,timeZone:'UTC'}).formatToParts(new Date(Date.UTC(2026,0,1,value*12))).find(part=>part.type==='dayPeriod').value}));
  this.columns=Object.fromEntries([['date',this.dates()],['hour',numbers(12,1)],['minute',numbers(60,0)],['period',periods]].map(([key,items])=>[key,new WheelColumn({root:this.dialog.querySelector('[data-wheel-column='+key+']'),key,label:this.text(key),items,value:this.parts[key],onChange:value=>{this.parts[key]=value;this.dialog.querySelector('[role=alert]').hidden=true;},onSettled:key==='date'?()=>this.recenterDates():null})]));
 }
 dates(){return dateWindow(this.parts.date).map(value=>({value,label:value===this.today?this.text('today'):Temporal.PlainDate.from(value).toLocaleString(this.language,{weekday:'short',month:'short',day:'numeric',...(value.slice(0,4)!==this.today.slice(0,4)?{year:'numeric'}:{})})}));}
 recenterDates(){const column=this.columns.date;if(column.index>=7&&column.index<column.items.length-7)return;const dates=this.dates();if(dates[0].value!==column.items[0].value)column.setItems(dates,this.parts.date);}
 apply(){
  if(this.closed)return;for(const [key,column]of Object.entries(this.columns))this.parts[key]=column.read();
  try{const value=pickerValue(this.parts,this.original,this.timeZone);if(this.onSubmit){this.onSubmit(value);return;}this.close();this.onChoose(value);}catch(error){if(this.closed)throw error;const alert=this.dialog.querySelector('[role=alert]');alert.textContent=error.code==='clock-gap'?this.text('clockGap'):this.text('invalid');alert.hidden=false;}
 }
 close(force=false){if(this.closed||!force&&this.canDismiss?.()===false)return;this.closed=true;for(const column of Object.values(this.columns??{}))column.dispose();this.dialog.close();this.dialog.remove();if(this.focus?.isConnected)this.focus.focus({preventScroll:true});this.onClose?.();}
}
