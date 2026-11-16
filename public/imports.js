import {accountMessage as m} from './account-cloud-messages.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';

// Keep the exact command when the server reply is uncertain, including on reopening.
let pending=null;
export function openImports({show,close,header,content,onChange}){
 show(`${header(m('accountCloud.importTitle'))}<section class="entry-form"><label class="field-row"><span>${m("integrations.recordType")}</span><select aria-label="${m("accountCloud.importType")}"><option value="foods">${m("integrations.foods")}</option><option value="biometrics">${m("integrations.biometrics")}</option><option value="diary">${m("nav.diary")}</option></select></label><label class="field-row"><span>${m("accountCloud.csvFile")}</span><input type="file" accept=".csv,text/csv" aria-label="${m("accountCloud.csvFile")}"></label><details><summary>${m("accountCloud.csvColumns")}</summary><p data-columns></p></details><div data-review></div><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" class="primary" data-action>${m("bodyPanel.preview")}</button></footer></section>`);
 const root=content.querySelector('.entry-form'),file=root.querySelector('input'),kind=root.querySelector('select'),status=root.querySelector('[role=status]'),review=root.querySelector('[data-review]'),button=root.querySelector('[data-action]');
 let prepared=null,busy=false;
 const columns={foods:'name, serving, grams, calories, protein, carbs, fat',biometrics:'date, type, value, unit, time',diary:'date, foodId or name, amount, group, time'};
 function render(){
  root.querySelector('[data-columns]').textContent=columns[kind.value];
  file.disabled=kind.disabled=busy||!!pending;
  button.disabled=busy||(!pending&&!prepared&&!file.files?.[0]);
  button.textContent=busy?m('accountCloud.pleaseWait'):pending?m('accountCloud.importRetry'):prepared?m('accountCloud.importAction'):m('bodyPanel.preview');
  review.innerHTML=prepared?`<p>${e(m(prepared.count===1?'accountCloud.importReadyOne':'accountCloud.importReadyMany',{count:prepared.count}))}</p>`:'';
 }
 function reset(){prepared=null;status.textContent='';render();}
 file.onchange=reset;kind.onchange=reset;
 if(pending){kind.value=pending.kind;status.textContent=m('accountCloud.importPending');}
 render();
 button.onclick=async()=>{
  if(busy)return;busy=true;status.textContent='';render();
  try{
   if(pending||prepared){
    pending??={...prepared.source,revision:prepared.revision,reviewToken:prepared.reviewToken,requestId:crypto.randomUUID()};
    const result=await request('/api/imports/csv/import',pending);
    pending=null;prepared=null;
    await onChange();if(root.isConnected)close();return result;
   }
   const selected=file.files?.[0];if(!selected)return;
   if(selected.size>10_000_000)throw Error(m('accountCloud.csvSize'));
   const source={kind:kind.value,text:await selected.text()},result=await request('/api/imports/csv/preview',source);
   prepared={...result,source};
  }catch(error){
   if([400,409].includes(error.status)){pending=null;prepared=null;}
   if(root.isConnected)status.textContent=error.message;
  }finally{busy=false;if(root.isConnected)render();}
 };
}
