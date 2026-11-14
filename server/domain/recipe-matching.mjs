const reason=(code,values={})=>({code,values});
import {compactFoodSource} from './catalog-source.mjs';
/** Ingredient identity and preparation matching. No source line is reparsed here. */
import {isActiveLibraryItem} from './library-status.mjs';
import {physicalFormName,preparationFacts} from './ingredient-preparation.mjs';
import {preparationStateAliases as stateAliases,cookingMethods} from './ingredient-preparation.mjs';
const sizes = new Set(['small', 'medium', 'large', 'jumbo']);
const changedStates = new Set([...cookingMethods, 'cooked', 'dried', 'canned', 'smoked', 'pickled', 'ready-to-eat']);
const productTypes = new Set(['flour', 'bread', 'noodle', 'pasta', 'cracker', 'cake', 'cookie', 'chip', 'flake', 'powder', 'juice', 'sauce', 'spread', 'puree', 'butter', 'oil', 'cheese', 'milk', 'buttermilk', 'yogurt', 'yoghurt', 'dressing', 'soup', 'meatless', 'imitation', 'syrup']);
const poultryParts = new Set(['giblet','gizzard','liver','heart','feet','neck','skin']);
// A taxonomy prefix can also assert preparation. Keep that fact when selecting
// its food-name segment; ready-to-eat cereal must not become a raw grain match.
const categoryHeads = new Map([
  ...['spice', 'nut', 'seed', 'legume', 'fruit', 'vegetable', 'beverage', 'cereal', 'snack', 'sweet', 'leavening agent'].map(name => [name, null]),
  ['cereal ready to eat', 'ready-to-eat'],
]);
const usageDescriptors = new Set(['salad', 'or', 'cooking']);
const variantDescriptors = new Set(['extra', 'light', 'virgin', 'refined', 'fortified', 'enriched']);
const processingCost = {raw: 0, fresh: 0, cooked: 8, boiled: 10, roasted: 10, fried: 12, baked: 10, steamed: 10, grilled: 10, broiled: 10, sauteed: 12, dried: 20, canned: 10, frozen: 8, smoked: 16, pickled: 16};
const irregular = new Map([['leaves', 'leaf'], ['loaves', 'loaf'], ['tomatoes', 'tomato'], ['potatoes', 'potato']]);
const words = text => String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function foodWords(text){
  // USDA SR Legacy names bok choy as pak-choi. Generic Chinese/Napa cabbage
  // stays distinct; only the named variety has this equivalent spelling.
  return words(text).join(' ').replace(/\bpak choi\b/g,'bok choy').replace(/\bsweetcorn\b/g,'sweet corn').split(' ').filter(Boolean);
}
function singular(word) {
  if (irregular.has(word)) return irregular.get(word);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is|ous)$/.test(word)) return word.slice(0, -1);
  return word;
}
const regionalOnionMarker='regional-onion';
const regionalOnionNames=['spring onion','green onion','scallion'];
function onionParts(rawTokens){
  const tokens=rawTokens.map(singular);
  if(!tokens.some(word=>['onion','scallion'].includes(word)))return null;
  const tops=rawTokens.includes('greens')||tokens.some(word=>['top','leaf'].includes(word))||tokens.includes('green')&&tokens.includes('part')&&tokens.includes('only');
  const bulb=tokens.includes('bulb');
  return tops&&bulb?'whole':tops?'tops':bulb&&!tokens.some(word=>['with','include','includes'].includes(word))?'bulb':tokens.includes('white')&&tokens.includes('only')?'white-part':'whole';
}
function regionalOnion(rawTokens){
  const tokens=rawTokens.map(singular);
  const consumed=new Set(),names=new Set();let first=-1;
  for(let index=0;index<tokens.length;index++){
    let name=null,length=1;
    if(tokens[index]==='scallion')name='scallion';
    else if(['spring','green'].includes(rawTokens[index])&&tokens[index+1]==='onion'){name=tokens[index]+' onion';length=2;}
    else if(tokens[index]==='onion'&&['spring','green'].includes(rawTokens[index+1])){name=tokens[index+1]+' onion';length=2;}
    if(name){names.add(name);if(first<0)first=index;for(let offset=0;offset<length;offset++)consumed.add(index+offset);index+=length-1;}
  }
  if(!names.size)return null;
  const identity=[...new Set(tokens.flatMap((word,index)=>index===first?[regionalOnionMarker]:consumed.has(index)?[]:[word]))];
  return {names:[...names],identity,first};
}
function facts(parsed) {
  if (!parsed || typeof parsed !== 'object' || typeof parsed.query !== 'string') throw Object.assign(new Error('Matching requires parsed ingredient facts.'), {status: 400});
  const states = [...new Set((parsed.preparation?.states || []).map(value => stateAliases.get(String(value).toLowerCase()) || String(value).toLowerCase()))];
  const forms = [...new Set((parsed.preparation?.forms || []).map(value => String(value).toLowerCase()))];
  // query is already owned by the ingredient parser; keep all food/type words.
  const tokens=foodWords(parsed.query),identity=[...new Set(tokens.map(singular))];
  return {identity, regional:regionalOnion(tokens),onionParts:onionParts(tokens), states, forms, size: parsed.preparation?.size || null,cutSizes:parsed.preparation?.cutSizes??[]};
}
function foodFacts(food, request) {
  const tokens = foodWords(food?.name);
  const states = [...new Set(tokens.filter(token => stateAliases.has(token)).map(token => stateAliases.get(token)))];
  const forms = [...new Set(tokens.filter(token => !request.identity.includes(token)).map(physicalFormName).filter(Boolean))];
  if (/\bwithout\s+(?:skin|peel)\b/i.test(food?.name || '')) forms.push('peeled');
  if (/\bwith\s+(?:skin|peel)\b/i.test(food?.name || '')) forms.push('unpeeled');
  const identityTokens=tokens.filter(token => !stateAliases.has(token) && (!physicalFormName(token) || request.identity.includes(token)) && !sizes.has(token));
  const identity=[...new Set(identityTokens.map(singular))];
  const segments = String(food?.name || '').split(',');
  let head = foodWords(segments[0]).map(singular);
  // Known comma-delimited taxonomy heads may contain more than one word.
  // Keep all source words in identity; only primary-food comparison uses the
  // next segment. Embedded phrases and unknown prefixes are not discarded.
  const category = head.join(' ');
  if (categoryHeads.has(category) && segments[1]) {
    const preparation = categoryHeads.get(category);
    if (preparation) states.push(preparation);
    head = foodWords(segments[1]).map(singular);
  }
  head = head.filter(word => !stateAliases.has(word) && (!physicalFormName(word) || request.identity.includes(word)) && !sizes.has(word));
  return {identity, head, regional:regionalOnion(identityTokens),onionParts:onionParts(identityTokens),states: [...new Set(states)], forms: [...new Set(forms)],cutSizes:preparationFacts(food?.name||'').cutSizes??[]};
}
function primaryFoodMatches(request,candidate){
  if(!candidate.head.length||candidate.head.some(word=>request.identity.includes(word)))return true;
  if(candidate.head.includes('cabbage')&&request.identity.includes('bok')&&request.identity.includes('choy'))return true;
  return candidate.head.includes('pepper')&&request.identity.includes('chili')&&request.identity.some(word=>['red','green','hot'].includes(word));
}
function assess(request, food) {
  const candidate = foodFacts(food, request);
  if(request.onionParts&&candidate.onionParts&&request.onionParts!==candidate.onionParts)return {status:'incompatible',requiresConfirmation:true,reasons:[reason('onion-parts')],distance:500,identityMatches:true};
  if(!request.regional||!candidate.regional)return assessFacts(request,candidate,food);
  const related=!request.regional.names.some(name=>candidate.regional.names.includes(name));
  const nameRelation=related?{kind:'regional',requested:request.regional.names.join(' / '),candidate:candidate.regional.names.join(' / ')}:null;
  const regionalHead=regionalOnion(candidate.head)?.first===0||candidate.head.length===1&&candidate.head[0]==='onion';
  const head=regionalHead?candidate.head.map(word=>['spring','green','onion','scallion'].includes(word)?regionalOnionMarker:word):candidate.head;
  const result=assessFacts({...request,identity:request.regional.identity},{...candidate,identity:candidate.regional.identity,head},food);
  if(!nameRelation)return result;
  return {...result,nameRelation,status:result.status==='exact'?'suggested':result.status,requiresConfirmation:true,reasons:[...result.reasons,reason('regional-names',{requested:nameRelation.requested,candidate:nameRelation.candidate})]};
}
function assessFacts(request,candidate,food){
  const reasons = [];
  if (food?.sample === true) reasons.push(reason('sample-values'));
  if (!request.identity.length || !candidate.identity.length) return {status: 'incompatible', requiresConfirmation: true, reasons: [...reasons, reason('no-identity')], distance: Infinity, identityMatches: false};
  const missing = request.identity.filter(word => !candidate.identity.includes(word));
  if (missing.length) return {status: 'incompatible', requiresConfirmation: true, reasons: [...reasons, reason('missing-words',{words:missing.join(', ')})], distance: missing.length * 100, identityMatches: false};
  if(request.identity.includes('chicken')&&!request.identity.some(word=>poultryParts.has(word))&&!candidate.identity.includes('meat')&&candidate.identity.some(word=>poultryParts.has(word))){
    return {status:'incompatible',requiresConfirmation:true,reasons:[...reasons,reason('poultry-part')],distance:500,identityMatches:true};
  }
  const differentProducts = candidate.identity.filter(word => productTypes.has(word) && !request.identity.includes(word));
  if (differentProducts.length || !primaryFoodMatches(request,candidate)) {
    return {status: 'incompatible', requiresConfirmation: true, reasons: [...reasons, differentProducts.length ? reason('different-product',{words:differentProducts.join(', ')}) : reason('primary-type')], distance: 500, identityMatches: true};
  }
  let conflict = false;
  if(request.forms.some(form=>['piece','chunk'].includes(form))&&candidate.forms.includes('ground')){
    reasons.push(reason('ground-form'));conflict=true;
  }
  if (request.states.includes('raw') && candidate.states.some(state => changedStates.has(state) && !request.states.includes(state))) {
    reasons.push(reason('requested-raw')); conflict = true;
  }
  if (candidate.states.includes('raw') && request.states.some(state => changedStates.has(state) && !candidate.states.includes(state))) {
    reasons.push(reason('selected-raw')); conflict = true;
  }
  const requestedMethods = request.states.filter(state => cookingMethods.has(state));
  const selectedMethods = candidate.states.filter(state => cookingMethods.has(state));
  if (requestedMethods.length && selectedMethods.some(state => !requestedMethods.includes(state))) { reasons.push(reason('cooking-method')); conflict = true; }
  for (const state of ['fresh', 'dried', 'canned', 'frozen', 'smoked', 'pickled']) {
    if (request.states.includes(state) && candidate.states.some(other => ['fresh', 'dried', 'canned', 'frozen', 'smoked', 'pickled'].includes(other) && other !== state && !request.states.includes(other))) {
      reasons.push(reason('preservation-method',{state})); conflict = true;
    }
  }
  if (request.forms.includes('peeled') && candidate.forms.includes('unpeeled') || request.forms.includes('unpeeled') && candidate.forms.includes('peeled')) { reasons.push(reason('peel-state')); conflict = true; }
  const extras = candidate.identity.filter(word => !request.identity.includes(word));
  if (candidate.head.includes('oil') && candidate.identity.includes('and') && !request.identity.includes('and')) {
    return {status: 'incompatible', requiresConfirmation: true, reasons: [...reasons, reason('mixed-oils')], distance: 500, identityMatches: true};
  }
  // A named cooking method establishes cooked food, but generic cooked food
  // cannot establish a particular method. Preserve the specific method below
  // as extra evidence that still needs review.
  const missingStates = request.states.filter(state => !candidate.states.includes(state) && !(state === 'cooked' && selectedMethods.length));
  const extraStates = candidate.states.filter(state => !request.states.includes(state));
  const missingForms = request.forms.filter(form => !candidate.forms.includes(form));
  const extraForms = candidate.forms.filter(form => !request.forms.includes(form));
  if (conflict) return {status: 'incompatible', requiresConfirmation: true, reasons, distance: 1000 + extras.length, identityMatches: true};
  if (extras.length) reasons.push(reason('extra-descriptors',{words:extras.join(', ')}));
  if (missingStates.length) reasons.push(reason('missing-states',{states:missingStates}));
  if (extraStates.length) reasons.push(reason('extra-states',{states:extraStates}));
  if (missingForms.length) reasons.push(reason('missing-forms',{forms:missingForms}));
  if (extraForms.length) reasons.push(reason('extra-forms',{forms:extraForms}));
  if(request.cutSizes.some(size=>!candidate.cutSizes.includes(size))||candidate.cutSizes.some(size=>!request.cutSizes.includes(size)))reasons.push(reason('cut-size'));
  if (request.size) reasons.push(reason('item-size'));
  if (request.identity.length === 1 && !request.states.length && !request.forms.length) reasons.push(reason('generic-name'));
  const exact = reasons.length === 0;
  return {status: exact ? 'exact' : 'suggested', requiresConfirmation: !exact,
    reasons: exact ? [reason('exact')] : reasons,
    distance: extras.reduce((sum, word) => sum + (usageDescriptors.has(word) ? 0 : variantDescriptors.has(word) ? 5 : 3), 0)
      + candidate.head.filter(word => !request.identity.includes(word)).length * 12 + missingStates.length * 4
      + extraStates.reduce((sum, state) => sum + (processingCost[state] ?? 2), 0) + missingForms.length * 2
      + extraForms.filter(form => form !== 'whole').length, identityMatches: true};
}

const statusOrder={exact:0,suggested:1,incompatible:2};
const missingStateCount=match=>match.reasons.find(reason=>reason.code==='missing-states')?.values.states.length??0;
// Evidence for the requested preparation outranks shorter names. Apply the
// same ordering to alternative clauses, candidates and portion-quality ties.
const matchQuality=(a,b)=>statusOrder[a.status]-statusOrder[b.status]||Number(!!a.nameRelation)-Number(!!b.nameRelation)||missingStateCount(a)-missingStateCount(b)||a.distance-b.distance;
function matchingRequests(parsed){
  facts(parsed);
  if(parsed.alternatives===undefined)return [{parsed,request:facts(parsed)}];
  if(!Array.isArray(parsed.alternatives)||parsed.alternatives.length<2||parsed.alternatives.length>4||parsed.alternatives.some(option=>!option||typeof option.text!=='string'||typeof option.query!=='string'||!option.query.trim()))throw Object.assign(Error('Parsed alternatives must contain two to four named clauses.'),{status:400});
  return parsed.alternatives.map(option=>({parsed:option,request:facts(option)}));
}
function assessRequests(requests,food,alternative){
  const ranked=requests.map(({parsed,request},index)=>({...assess(request,food),option:index,alternative:alternative?parsed.text:null})).sort((a,b)=>matchQuality(a,b)||a.option-b.option);
  const result=ranked[0];
  return alternative?{...result,status:result.status==='exact'?'suggested':result.status,requiresConfirmation:true,reasons:[...result.reasons,reason('source-option',{text:result.alternative})]}:result;
}

/** Shared owner for both suggested matches and an explicitly selected food. */
export function assessIngredientMatch(parsed, food) {
  const result = assessRequests(matchingRequests(parsed),food,parsed.alternatives!==undefined);
  return {status: result.status, requiresConfirmation: result.requiresConfirmation, reasons: result.reasons,...(result.nameRelation?{nameRelation:result.nameRelation}:{})};
}

function source(food) {
  return compactFoodSource(food.source);
}
function queries(parsed, request) {
  const original = words(parsed.query).join(' '), normalized = request.identity.join(' ');
  const states = request.states.join(' ');
  if(request.regional){
    const related=regionalOnionNames.filter(name=>!request.regional.names.includes(name)).map(name=>request.regional.identity.map(word=>word===regionalOnionMarker?name:word).join(' '));
    return [...new Set([original,states?`${normalized} ${states}`:normalized,...related.map(query=>states?`${query} ${states}`:query)])].slice(0,4);
  }
  const variants = [original, normalized, states && `${original} ${states}`, states && `${normalized} ${states}`];
  if(/\bbok choy\b/.test(normalized)){
    const alternate=normalized.replace(/\bbok choy\b/g,'pak choi');
    variants.push(alternate,states&&`${alternate} ${states}`);
  }
  // Retrieval alternatives do not change the parsed state or remove confirmation.
  if (request.identity.length === 1 && request.identity[0] === 'egg' && !states) variants.push('egg whole raw', 'egg whole');
  return [...new Set(variants.filter(Boolean))].slice(0, 4);
}

export function matchIngredient(parsed, {foodCatalog = null, foods = [], limit = 5, supportsQuantity} = {}) {
  const request = facts(parsed), requests=matchingRequests(parsed), alternative=parsed.alternatives!==undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Object.assign(new Error('Match limit must be from 1 to 100.'), {status: 400});
  if (!Array.isArray(foods)) throw Object.assign(new Error('Local foods must be an array.'), {status: 400});
  if(supportsQuantity!==undefined&&typeof supportsQuantity!=='function')throw Object.assign(new Error('Quantity support must use the review conversion owner.'),{status:400});
  if (parsed.isGroupHeader) return {candidates: [], selection: null, status: 'header', reasons: [reason('group-header')]};
  if (!request.identity.length) return {candidates: [], selection: null, status: 'unmatched', reasons: [reason('unparsed-identity')]};
  const candidates = new Map();
  const add = (food, kind) => {
    if (!food || typeof food.id !== 'string' || typeof food.name !== 'string') return;
    if (food.sample === true) return;
    const result = assessRequests(requests,food,alternative);
    if (kind === 'library' && !result.identityMatches) return;
    const key = food.id;
    if (candidates.has(key) && candidates.get(key).ref.kind === 'library') return;
    candidates.set(key, {ref: {kind, id: food.id}, name: food.name, serving: food.serving, grams: food.grams, source: source(food), status: result.status, reasons: result.reasons, distance: result.distance, option:result.option,...(result.nameRelation?{nameRelation:result.nameRelation}:{})});
  };
  for (const food of foods) if(isActiveLibraryItem(food))add(food, 'library');
  const variants=requests.map(item=>queries(item.parsed,item.request));
  const retrieval=[...new Set(Array.from({length:4},(_,rank)=>variants.map(list=>list[rank]).filter(Boolean)).flat())].slice(0,4);
  if (foodCatalog?.search) for (const query of retrieval) {
    const result = foodCatalog.search(query, {offset: 0, limit: Math.min(100, Math.max(25, limit * 4))});
    for (const item of result.items) add(item, 'catalog');
  }

  const quality=(a,b)=>matchQuality(a,b)||(a.ref.kind==='library'?0:1)-(b.ref.kind==='library'?0:1);
  const order=(a,b)=>quality(a,b)||a.name.localeCompare(b.name)||a.ref.id.localeCompare(b.ref.id);
  const ranked=[...candidates.values()].sort(order);
  // Portion availability breaks only an existing best-quality tie. It cannot
  // promote an incompatible food, a weaker identity, or a different source
  // alternative. The review owns full records and conversion, not this matcher.
  if(!alternative&&supportsQuantity&&ranked[0]?.status!=='incompatible'){
    const tied=ranked.filter(candidate=>quality(candidate,ranked[0])===0);
    if(tied.length>1){
      const supported=new Set(tied.filter(candidate=>supportsQuantity(candidate.ref)===true));
      ranked.sort((a,b)=>quality(a,b)||(supported.has(b)?1:0)-(supported.has(a)?1:0)||order(a,b));
    }
  }
  const selected = alternative?null:ranked.find(candidate => candidate.status !== 'incompatible'&&!candidate.nameRelation);
  const firstOptions=alternative?requests.map((_,index)=>ranked.find(row=>row.option===index&&row.status!=='incompatible')).filter(Boolean):[];
  const ordered=[...firstOptions,...ranked.filter(row=>!firstOptions.includes(row))];
  const visible=ordered.slice(0,limit),related=ranked.find(row=>row.nameRelation&&row.status!=='incompatible');
  // Keep the preferred literal match, but expose one related name for an
  // explicit choice when the bounded menu has room for both.
  if(!alternative&&related&&!visible.includes(related)&&limit>1)visible[visible.length-1]=related;
  const result = visible.map(({distance,option, ...candidate}) => candidate);
  return {candidates: result, selection: selected?.ref || null, status: alternative&&ranked.some(row=>row.status!=='incompatible')?'review':selected ? selected.status === 'exact' ? 'exact' : 'review' : related?'review':'unmatched',
    reasons: alternative?[reason('choose-alternative')]:selected ? selected.reasons : related?[reason('choose-regional')]:[reason('no-compatible'), ...(ranked[0]?.reasons || [])]};
}
