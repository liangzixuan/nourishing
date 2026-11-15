import {recipeListEntries} from './recipe-list.mjs';
const invalid=()=>{throw Object.assign(Error('Recipe instructions contain an incomplete or unsupported step. Supply text, HowToStep, HowToSection or ItemList instructions.'),{status:400});};
const typed=(value,name)=>[value?.['@type']].flat().some(t=>[name,'https://schema.org/'+name,'http://schema.org/'+name].includes(t));

/** All source formats use this owner; an unrecognized linked step cannot disappear. */
export function interpretRecipeInstructions(raw){
  if(raw===undefined||raw===null)return '';
  const pending=[raw],lines=[];
  while(pending.length){const value=pending.pop();
    if(Array.isArray(value)){for(let i=value.length-1;i>=0;i--)pending.push(value[i]);continue;}
    if(typeof value==='string'){if(!value.trim())invalid();lines.push(value);continue;}
    if(!value||typeof value!=='object')invalid();
    if(typed(value,'ListItem')){if(value.item===undefined)invalid();pending.push(value.item);continue;}
    if(typed(value,'ItemList')||typed(value,'HowToSection')){
      const entries=recipeListEntries(value);for(let i=entries.length-1;i>=0;i--)pending.push(entries[i]);
      if(value.name!==undefined){if(typeof value.name!=='string'||!value.name.trim())invalid();lines.push(value.name);}continue;
    }
    if(value.itemListElement!==undefined){const entries=recipeListEntries(value);for(let i=entries.length-1;i>=0;i--)pending.push(entries[i]);}
    if(value.text!==undefined){if(typeof value.text!=='string'||!value.text.trim())invalid();lines.push(value.text);}
    else if(value.itemListElement===undefined)invalid();
  }
  return lines.join('\n');
}
