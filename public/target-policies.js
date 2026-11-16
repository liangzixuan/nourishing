import {escape as e} from './html.js';
import {request,command} from './diary-api.js';

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const options=(rows,value)=>rows.map(([id,label])=>`<option value="${e(id)}" ${String(value)===String(id)?'selected':''}>${e(label)}</option>`).join('');
const select=(name,label,rows,value)=>`<label class="field-row"><span>${e(label)}</span><select name="${name}" aria-label="${e(label)}">${options(rows,value)}</select></label>`;
const input=(name,label,value,{type='number',min='0',required=false}={})=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="${type}" ${type==='number'?`min="${min}" step="any"`:''} value="${e(value??'')}" ${required?'required':''}></label>`;
const numeric=(form,name)=>form.elements[name].value===''?null:Number(form.elements[name].value);

/** Independent weekday nutrient overrides; scheduled templates have their own source screen. */
export async function openTargetPolicies({date,show,close,header,content,onChange}){
 const selectedDate=typeof date==='function'?date():date;let data;
 show(`${header('Weekday overrides')}<p class="empty">Loading…</p>`);const loading=content.firstElementChild;
 async function read(){data=await request('/api/target-policies?date='+selectedDate);}
 try{await read();if(!loading.isConnected)return;weekdayEditor();}catch(error){if(loading.isConnected)content.innerHTML=header('Weekday overrides')+`<p class="sheet-message">${e(error.message)}</p>`;}
 function editor(title,html,submit){
  show(`${header(title)}<form class="entry-form target-policy-form">${html}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button class="primary" type="submit">Save</button></footer></form>`);
  const form=content.querySelector('form');form.querySelector('[data-back]').onclick=menu;
  form.onsubmit=async event=>{event.preventDefault();await save(form,()=>submit(form));};return form;
 }
 async function save(form,build){
  const status=form.querySelector('[role=status]');status.textContent='';form.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{const action=build();if(!action){menu();return;}await command(data.revision,action.type,action.payload);await onChange?.();await read();if(form.isConnected)menu();}
  catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload targets';reload.onclick=async()=>{await read();if(form.isConnected)menu();};status.append(reload);}}}
  finally{form.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 function menu(){close();}
 function weekdayEditor(day=new Date(selectedDate+'T12:00:00Z').getUTCDay()){
  const values=data.weekday[day]??{},carb=data.carbohydrateId;
  const form=editor('Weekday overrides',select('weekday','Weekday',weekdays.map((name,i)=>[i,name]),day)+[['calories','Calories (kcal)'],['protein','Protein (g)'],[carb,'Carbohydrate (g)'],['fat','Fat (g)']].map(([id,label])=>input(id,label,values[id])).join('')+'<button type="button" class="more-results" data-clear>Use default targets</button>',form=>{const targets=Object.fromEntries(['calories','protein',carb,'fat'].map(id=>[id,numeric(form,id)]).filter(([id,value])=>value!==(values[id]??null)));return Object.keys(targets).length?{type:'targetPolicy.weekday',payload:{weekday:Number(form.elements.weekday.value),targets}}:null;});
  form.elements.weekday.onchange=()=>weekdayEditor(Number(form.elements.weekday.value));form.querySelector('[data-clear]').onclick=()=>save(form,()=>({type:'targetPolicy.weekday',payload:{weekday:day,targets:null}}));
 }
}
