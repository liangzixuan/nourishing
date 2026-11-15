import {load} from 'cheerio';
import {readRdfaRecipe} from './recipe-rdfa.mjs';
import {readJsonLdRecipe} from './recipe-jsonld.mjs';
import {recipeSourceFields as fields} from './recipe-source-fields.mjs';

const htmlNamespace='http://www.w3.org/1999/xhtml';
const tokens=value=>(value||'').split(/[\t\n\f\r ]+/).filter(Boolean);
const own=(element,key)=>Object.hasOwn(element.attribs||{},key);
const html=element=>element.namespace===htmlNamespace;
const children=element=>(element.children||[]).filter(child=>typeof child.name==='string');
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const schemaTerm=value=>typeof value==='string'?value.replace(/^https?:\/\/schema\.org\//,''):value;

/** Read only the marked recipe fields. Cheerio owns HTML parsing; scope and
 * itemref traversal follow the HTML Microdata property-association algorithm. */
function microdataRecipe($,source){
  const elements=$('*').toArray(),order=new Map(elements.map((element,index)=>[element,index])),ids=new Map();
  for(const element of elements)if(own(element,'id')&&!ids.has(element.attribs.id))ids.set(element.attribs.id,element);
  const root=elements.find(element=>html(element)&&own(element,'itemscope')&&tokens(element.attribs.itemtype).some(type=>type==='https://schema.org/Recipe'||type==='http://schema.org/Recipe'));
  if(!root)return null;
  let base;try{base=new URL(source);}catch{}
  const baseHref=$('base[href]').first().attr('href');if(baseHref!==undefined)try{base=new URL(baseHref,base);}catch{}
  function properties(scope){
    const memory=new Set([scope]),pending=[...children(scope),...tokens(scope.attribs.itemref).map(id=>ids.get(id)).filter(Boolean)],result=[];
    for(let index=0;index<pending.length;index++){
      const current=pending[index];if(memory.has(current))invalid('Recipe Microdata contains overlapping or cyclic item references.');memory.add(current);
      if(!html(current)||!own(current,'itemscope'))for(const child of children(current))pending.push(child);
      if(html(current)&&tokens(current.attribs.itemprop).length)result.push(current);
    }
    return result.sort((a,b)=>order.get(a)-order.get(b));
  }
  function value(element){
    const tag=element.name,attributes=element.attribs;
    if(tag==='meta')return attributes.content??'';
    if(tag==='data'||tag==='meter')return attributes.value??'';
    if(tag==='time'&&own(element,'datetime'))return attributes.datetime;
    const urlAttribute=['audio','embed','iframe','img','source','track','video'].includes(tag)?'src':['a','area','link'].includes(tag)?'href':tag==='object'?'data':null;
    if(urlAttribute){const raw=attributes[urlAttribute]??'';try{return new URL(raw,base).href;}catch{return raw;}}
    return $(element).text().trim();
  }
  const items=new Map(),queue=[];
  const item=element=>{if(!items.has(element)){items.set(element,{'@type':tokens(element.attribs.itemtype)});queue.push(element);}return items.get(element);};
  const result=item(root),edges=new Map();
  for(let index=0;index<queue.length;index++){
    const scope=queue[index],record=items.get(scope),values=new Map(),nested=[];
    for(const element of properties(scope)){
      const names=tokens(element.attribs.itemprop).map(schemaTerm).filter(name=>fields.has(name));if(!names.length)continue;
      const child=own(element,'itemscope'),content=child?item(element):value(element);if(child)nested.push(element);
      for(const name of names){if(!values.has(name))values.set(name,[]);values.get(name).push(content);}
    }
    for(const [name,entries]of values)record[name]=entries.length===1?entries[0]:entries;
    edges.set(scope,nested);
  }
  // Item references can create a graph even though the HTML tree is acyclic.
  const colors=new Map(),pending=[{element:root,exit:false}];
  while(pending.length){const {element,exit}=pending.pop();if(exit){colors.set(element,2);continue;}if(colors.get(element)===1)invalid('Recipe Microdata contains cyclic nested items.');if(colors.get(element)===2)continue;colors.set(element,1);pending.push({element,exit:true});for(const child of edges.get(element)||[])pending.push({element:child,exit:false});}
  return result;
}

export async function readRecipeSource(input,source){
  let baseIRI='https://nourish.invalid/pasted-recipe';try{const url=new URL(source);if(['http:','https:'].includes(url.protocol))baseIRI=url.href;}catch{}
  let json;try{json=JSON.parse(input);}catch{}
  if(json!==undefined)return readJsonLdRecipe([json],baseIRI);
  const $=load(input);
  const baseHref=$('base[href]').first().attr('href');if(baseHref!==undefined)try{baseIRI=new URL(baseHref,baseIRI).href;}catch{}
  const documents=[];
  for(const element of $('script[type="application/ld+json"]').toArray()){
    let value;try{value=JSON.parse($(element).text());}catch{continue;}
    documents.push(value);
  }
  if(documents.length){const recipe=await readJsonLdRecipe(documents,baseIRI);if(recipe)return recipe;}
  return microdataRecipe($,source)??await readRdfaRecipe(input,source);
}
