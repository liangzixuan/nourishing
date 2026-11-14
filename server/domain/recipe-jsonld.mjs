import {isDeepStrictEqual} from 'node:util';
import {expandRecipeJsonLd} from './recipe-jsonld-expand.mjs';
import {recipeSourceFields} from './recipe-source-fields.mjs';
import {interpretRecipeIngredients} from './recipe-ingredient-source.mjs';

const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const schema=value=>typeof value==='string'&&/^https?:\/\/schema\.org\//.test(value)?value.replace(/^https?:\/\/schema\.org\//,''):null;
const limit=5000000;
function bounded(value){let text;try{text=JSON.stringify(value);}catch{invalid('Recipe JSON-LD source must be finite JSON.');}if(!text||Buffer.byteLength(text)>limit)invalid('Retained recipe JSON-LD exceeds 5 MB.');}

/** Index expanded facts without RDF set conversion: repeated literals and list order matter here. */
function index(expanded){
  if(!Array.isArray(expanded))invalid('Invalid expanded recipe JSON-LD.');
  const ids=new Set(),scan=[expanded];
  while(scan.length){const value=scan.pop();if(Array.isArray(value)){for(const child of value)scan.push(child);}else if(object(value)){if(typeof value['@id']==='string')ids.add(value['@id']);for(const child of Object.values(value))if(child&&typeof child==='object')scan.push(child);}}
  let serial=0;const anonymous=()=>{let id;do{id='_:nourish'+serial++;}while(ids.has(id));ids.add(id);return id;};
  const graphs=new Map(),recipes=[],pending=[];
  const graphFor=name=>{if(!graphs.has(name))graphs.set(name,new Map());return graphs.get(name);};
  for(let i=expanded.length-1;i>=0;i--)pending.push({value:expanded[i],graph:'',assign:()=>{}});
  while(pending.length){
    const {value,graph,assign}=pending.pop();
    if(!object(value))invalid('Invalid expanded recipe JSON-LD value.');
    if(Object.hasOwn(value,'@value')){assign({literal:value});continue;}
    if(Object.hasOwn(value,'@list')){
      if(!Array.isArray(value['@list']))invalid('Invalid expanded recipe JSON-LD list.');
      const entries=[];assign({list:entries});for(let i=value['@list'].length-1;i>=0;i--)pending.push({value:value['@list'][i],graph,assign:v=>{entries[i]=v;}});continue;
    }
    const id=value['@id']??anonymous();if(typeof id!=='string')invalid('Invalid recipe JSON-LD node identity.');
    const nodes=graphFor(graph);if(!nodes.has(id))nodes.set(id,{id,types:[],fields:new Map(),defined:false,reverse:false});
    const node=nodes.get(id);assign({ref:id});
    if(value['@type']!==undefined){if(!Array.isArray(value['@type'])||value['@type'].some(t=>typeof t!=='string'))invalid('Invalid expanded recipe JSON-LD type.');for(const type of value['@type'])if(!node.types.includes(type))node.types.push(type);node.defined=true;if(value['@type'].some(t=>schema(t)==='Recipe'))recipes.push({graph,root:id});}
    const children=[];
    for(const [key,raw]of Object.entries(value)){
      if(key==='@reverse'){node.reverse=true;continue;}
      if(key==='@graph'||key==='@included'){
        if(!Array.isArray(raw))invalid('Invalid expanded recipe JSON-LD graph.');
        for(const child of raw)children.push({value:child,graph:key==='@graph'?id:graph,assign:()=>{}});continue;
      }
      if(key.startsWith('@')){if(!['@id','@type','@index'].includes(key))invalid('Unsupported expanded recipe JSON-LD keyword: '+key);continue;}
      if(!Array.isArray(raw))invalid('Invalid expanded recipe JSON-LD property.');
      node.defined=true;const name=schema(key);
      // Unused properties can still define nodes referenced by recipe fields.
      const target=name&&recipeSourceFields.has(name)?node.fields.get(name)??[]:null;
      if(target)node.fields.set(name,target);
      const offset=target?.length??0;if(target)target.length+=raw.length;
      raw.forEach((child,i)=>children.push({value:child,graph,assign:target?v=>{target[offset+i]=v;}:()=>{}}));
    }
    for(let i=children.length-1;i>=0;i--)pending.push(children[i]);
  }
  return {graphs,recipes};
}

function literal(value){
  const type=value['@type'];
  if(type===undefined||type==='http://www.w3.org/2001/XMLSchema#string')return value['@value'];
  if(['integer','decimal','double','float'].some(t=>type==='http://www.w3.org/2001/XMLSchema#'+t)&&['string','number'].includes(typeof value['@value']))return value['@value'];
  return value;
}

function project(indexed,selection){
  const nodes=indexed.graphs.get(selection.graph),cache=new Map(),colors=new Map();
  const root=nodes?.get(selection.root);if(!root?.types.some(t=>schema(t)==='Recipe'))invalid('Retained JSON-LD root is not a Recipe in its selected graph.');
  const vocabulary=field=>field==='unitCode'||field==='itemListOrder';
  const pending=[{id:root.id,exit:false}];
  function converted(value,field){
    const tasks=[{value,exit:false}],results=new Map();
    while(tasks.length){const task=tasks.pop(),current=task.value;
      if(current.list&&!task.exit){tasks.push({value:current,exit:true});for(let i=current.list.length-1;i>=0;i--)tasks.push({value:current.list[i],exit:false});continue;}
      let result,size;
      if(current.list){result=current.list.map(v=>results.get(v).result);size=2+current.list.reduce((n,v)=>n+results.get(v).size+1,0);}
      else if(current.literal){result=literal(current.literal);size=Buffer.byteLength(JSON.stringify(result));}
      else if(vocabulary(field)){result=current.ref;size=Buffer.byteLength(JSON.stringify(result));}
      else {const cached=cache.get(current.ref);if(!cached)invalid('Unresolved recipe JSON-LD reference in '+field+': '+current.ref);({result,size}=cached);}
      if(size>limit)invalid('Projected recipe JSON-LD exceeds 5 MB.');results.set(current,{result,size});
    }
    return results.get(value);
  }
  while(pending.length){
    const {id,exit}=pending.pop(),node=nodes.get(id);
    if(!node?.defined)invalid('Unresolved recipe JSON-LD reference in the selected graph: '+id);
    if(exit){
      const types=node.types.map(t=>schema(t)??t),result=types.length?{'@type':types.length===1?types[0]:types}:{},fields=[...node.fields];let size=Buffer.byteLength(JSON.stringify(result));
      for(const [field,values]of fields){const mapped=values.map(v=>converted(v,field));size+=Buffer.byteLength(JSON.stringify(field))+3+mapped.reduce((n,v)=>n+v.size+1,0);if(size>limit)invalid('Projected recipe JSON-LD exceeds 5 MB.');result[field]=mapped.length===1?mapped[0].result:mapped.map(v=>v.result);}
      cache.set(id,{result,size});colors.set(id,2);continue;
    }
    if(colors.get(id)===1)invalid('Recipe JSON-LD contains cyclic recipe references.');if(colors.get(id)===2)continue;
    if(node.reverse)invalid('Reverse recipe JSON-LD properties are not supported. Paste explicit ingredient and instruction fields.');
    colors.set(id,1);pending.push({id,exit:true});
    const references=[];for(const [field,values]of node.fields){if(vocabulary(field))continue;const queue=[...values];while(queue.length){const value=queue.pop();if(value.list){for(const child of value.list)queue.push(child);}else if(value.ref)references.push(value.ref);}}
    for(const ref of references)pending.push({id:ref,exit:false});
  }
  return cache.get(root.id).result;
}

export async function readJsonLdRecipe(documents,baseIRI){
  const result=await expandRecipeJsonLd(documents,baseIRI);bounded(result.expanded);
  const indexed=index(result.expanded),selection=indexed.recipes[0];if(!selection)return null;
  const source={version:1,baseIRI,...selection,expanded:result.expanded,contexts:result.contexts};bounded(source);
  return {...project(indexed,selection),jsonldSource:source};
}

/** Reinterpret retained normalized facts, not client-supplied ingredient display text. */
export function validateJsonLdSource(source,originals,ingredientSource){
  bounded(source);
  if(!object(source)||source.version!==1||typeof source.baseIRI!=='string'||typeof source.root!=='string'||typeof source.graph!=='string'||!Array.isArray(source.contexts)||Object.keys(source).some(k=>!['version','baseIRI','root','graph','expanded','contexts'].includes(k)))invalid('Invalid retained recipe JSON-LD source.');
  for(const context of source.contexts)if(!object(context)||typeof context.url!=='string'||typeof context.sourceUrl!=='string'||typeof context.sha256!=='string'||!/^[a-f0-9]{64}$/.test(context.sha256))invalid('Invalid retained recipe JSON-LD context identity.');
  const recipe=project(index(source.expanded),source),parsed=interpretRecipeIngredients(recipe.recipeIngredient??[]);
  if(!isDeepStrictEqual(parsed.ingredients,originals)||!isDeepStrictEqual(parsed.ingredientSource,ingredientSource))invalid('Retained JSON-LD ingredient facts do not match the source review rows.');
  return structuredClone(source);
}
