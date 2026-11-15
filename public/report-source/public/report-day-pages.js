import {formatMessage} from './message-format.js';
// Date pagination changes presentation only. Every row comes from the applied capture.
const pageSize=30;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reportDayPagesMarkup(kind,count,attribute,{language='en'}={}){
  const message=(key,values)=>formatMessage(language,'reportPages.'+key,values),label=message(kind);
  return `<details ${attribute} data-report-day-pages="${kind}" data-report-page-language="${escape(language)}"><summary>${escape(message('summary',{label,count}))}</summary><div data-report-page-controls hidden><button type="button" class="btn" data-report-page-move="-1">${escape(message('previous'))}</button><label>${escape(message('page'))} <input type="number" min="1" step="1" value="1" data-report-page-number aria-label="${escape(message('pageLabel',{label}))}"></label><button type="button" class="btn" data-report-page-move="1">${escape(message('next'))}</button><p role="status" aria-live="polite" data-report-page-status></p></div><div data-report-page-content></div></details>`;
}
export class ReportDayPages{
  constructor(root){
    this.root=root;this.sources={};
    this.toggle=event=>{const details=event.target;if(details.matches?.('[data-report-day-pages]')&&details.open&&!details.hasAttribute('data-report-page-index'))this.render(details,0);};
    this.click=event=>{const button=event.target.closest('[data-report-page-move]');if(!button||!root.contains(button))return;const details=button.closest('[data-report-day-pages]');event.preventDefault();this.render(details,Number(details.dataset.reportPageIndex)+Number(button.dataset.reportPageMove));if(button.disabled)details.querySelector('[data-report-page-number]').focus();};
    this.change=event=>{if(!event.target.matches('[data-report-page-number]'))return;const details=event.target.closest('[data-report-day-pages]'),index=event.target.valueAsNumber-1;this.render(details,Number.isInteger(index)?index:Number(details.dataset.reportPageIndex));};
    root.addEventListener('toggle',this.toggle,true);root.addEventListener('click',this.click);root.addEventListener('change',this.change);
  }
  setSources(sources){this.sources=sources;}
  render(details,index){
    const source=this.sources[details.dataset.reportDayPages];if(!source)return;
    const count=source.days.length,pages=Math.max(1,Math.ceil(count/pageSize)),page=Math.min(pages-1,Math.max(0,index)),start=page*pageSize,days=source.days.slice(start,start+pageSize);
    details.dataset.reportPageIndex=String(page);details.querySelector('[data-report-page-controls]').hidden=false;
    const input=details.querySelector('[data-report-page-number]');input.max=String(pages);input.value=String(page+1);
    details.querySelector('[data-report-page-move="-1"]').disabled=page===0;details.querySelector('[data-report-page-move="1"]').disabled=page===pages-1;
    const language=details.dataset.reportPageLanguage;
    details.querySelector('[data-report-page-status]').textContent=formatMessage(language,'reportPages.'+(count?'status':'empty'),count?{page:page+1,pages,start:start+1,end:start+days.length,count,from:days[0].date,to:days.at(-1).date}:{});
    details.querySelector('[data-report-page-content]').innerHTML=source.renderDays(days);
  }
  dispose(){this.root.removeEventListener('toggle',this.toggle,true);this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);this.sources={};}
}
