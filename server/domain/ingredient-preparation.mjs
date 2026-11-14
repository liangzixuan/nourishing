// Shared state identities for source ingredients and food candidate names.
export const preparationStateAliases=new Map([
 ['raw','raw'],['uncooked','raw'],['cooked','cooked'],['boiled','boiled'],['roasted','roasted'],['fried','fried'],['baked','baked'],['steamed','steamed'],['grilled','grilled'],['broiled','broiled'],['dried','dried'],['dry','dried'],['canned','canned'],['smoked','smoked'],['frozen','frozen'],['pickled','pickled'],['fresh','fresh'],['sauteed','sauteed'],['sautéed','sauteed'],['thawed','thawed'],['defrosted','thawed'],['cooled','cooled'],['toasted','toasted'],
]);
export const cookingMethods=new Set(['boiled','roasted','fried','baked','steamed','grilled','broiled','sauteed','toasted']);
export const preparationStateNames=Object.freeze([...new Set(preparationStateAliases.values())]);
export const preparationStatePatterns=preparationStateNames.map(name=>[name,new RegExp('\\b(?:'+[...preparationStateAliases].filter(([,value])=>value===name).map(([alias])=>alias).join('|')+')\\b','iu')]);

const physicalForms=new Map(['chopped','minced','diced','sliced','sifted','packed','ground','grated','shredded','peeled','unpeeled','mashed','crushed','whole','beaten','melted','softened','drained','rinsed','seeded','pitted','piece','chunk','cubed','quartered','halved'].map(name=>[name,name]));
for(const [alias,name]of [['pieces','piece'],['chunks','chunk'],['stoned','pitted']])physicalForms.set(alias,name);
export const physicalFormName=word=>physicalForms.get(word)??null;
const formPatterns=[...physicalForms].map(([alias,name])=>[name,alias==='whole'?/\bwhole\b(?![ -]+(?:wheat|grains?|milk|eggs?)\b)/iu:new RegExp('\\b'+alias+'\\b','iu')]);
const cutShapes={cubes:'cubed',chunks:'chunk',pieces:'piece',strips:'strips',slices:'sliced',quarters:'quartered',halves:'halved'};
export const preparationFormNames=Object.freeze([...new Set([...physicalForms.values(),...Object.values(cutShapes)])]);
const cutPattern=/\bcut\s+into\s+(?:(extra[ -]small|extra[ -]large|small|medium|large)\s+)?(cubes|chunks|pieces|strips|slices|quarters|halves)\b/giu;
const sizePattern=/\b(extra[ -]small|extra[ -]large|small|medium|large|jumbo)\b/iu;
const unique=values=>[...new Set(values)];
function scan(text){
 const spans=[];
 for(const [name,pattern]of preparationStatePatterns)for(const match of text.matchAll(new RegExp(pattern.source,'giu')))spans.push({start:match.index,end:match.index+match[0].length,state:name});
 for(const [name,pattern]of formPatterns)for(const match of text.matchAll(new RegExp(pattern.source,'giu')))spans.push({start:match.index,end:match.index+match[0].length,form:name});
 for(const match of text.matchAll(cutPattern))spans.push({start:match.index,end:match.index+match[0].length,form:cutShapes[match[2].toLowerCase()],cut:true,cutText:match[0],cutSize:match[1]?.toLowerCase().replaceAll(' ','-')});
 return spans.sort((a,b)=>a.start-b.start||b.end-a.end);
}
export function preparationFacts(text){
 const spans=scan(text),cuts=spans.filter(s=>s.cut),cutSizes=unique(cuts.map(s=>s.cutSize).filter(Boolean));
 let itemText=text;for(const cut of [...cuts].reverse())itemText=itemText.slice(0,cut.start)+' '.repeat(cut.end-cut.start)+itemText.slice(cut.end);
 const size=itemText.match(sizePattern)?.[1]?.toLowerCase().replaceAll(' ','-')??null;
 return {states:preparationStatePatterns.map(([name])=>name).filter(name=>spans.some(s=>s.state===name)),forms:unique(spans.map(s=>s.form).filter(Boolean)),size,...(cutSizes.length?{cutSizes,cutTexts:unique(cuts.filter(s=>s.cutSize).map(s=>s.cutText))}:{})};
}
export function withoutPreparationWords(text){
 const spans=scan(text),merged=[];
 for(const span of spans){const last=merged.at(-1);if(last&&span.start<=last.end)last.end=Math.max(last.end,span.end);else merged.push({start:span.start,end:span.end});}
 const joins=[];for(let i=1;i<merged.length;i++)if(/^\s+and\s+$/iu.test(text.slice(merged[i-1].end,merged[i].start)))joins.push({start:merged[i-1].end,end:merged[i].start});
 const all=[...merged,...joins].sort((a,b)=>a.start-b.start);let cursor=0;const parts=[];
 for(const span of all){parts.push(text.slice(cursor,span.start),' ');cursor=span.end;}parts.push(text.slice(cursor));return parts.join('');
}
export function mergePreparationFacts(left,right){
 const cutSizes=unique([...(left.cutSizes??[]),...(right.cutSizes??[])]),cutTexts=unique([...(left.cutTexts??[]),...(right.cutTexts??[])]);
 return {states:unique([...left.states,...right.states]),forms:unique([...left.forms,...right.forms]),size:left.size||right.size,...(cutSizes.length?{cutSizes,cutTexts}:{})};
}
export const preparationDescription=facts=>[...facts.states,...facts.forms,facts.size,...(facts.cutTexts??[])].filter(Boolean).join(', ');
