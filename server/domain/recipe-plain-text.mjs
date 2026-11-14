import {load} from 'cheerio';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
const heading=line=>line.replace(/^#{1,6}\s+/,'').replace(/\s*:\s*$/,'').trim().toLowerCase();
const ingredientHeading=line=>heading(line)==='ingredients';
const methodHeading=line=>['instructions','directions','method','preparation'].includes(heading(line));
const yieldLine=line=>/^(?:serves|servings|yield|makes)(?:\s*[:\-]\s*|\s+)\S/i.test(line);
const cleanLine=line=>line.replace(/[\t\f\v\u00a0 ]+/g,' ').trim();

/** The source is extracted text, not original HTML bytes or a claim of complete page coverage. */
export function readPlainRecipeText(text){
  if(typeof text!=='string'||text.length>5000000)fail('Recipe text must be below 5 MB.');
  const lines=text.split(/\r\n?|\n/).map(cleanLine).filter(Boolean);
  const ingredients=lines.map((line,index)=>ingredientHeading(line)?index:-1).filter(index=>index>=0);
  const methods=lines.map((line,index)=>methodHeading(line)?index:-1).filter(index=>index>=0);
  if(!ingredients.length&&!methods.length)return null;
  if(ingredients.length!==1||methods.length!==1||methods[0]<=ingredients[0])fail('Plain recipe text needs one Ingredients section followed by one Instructions or Method section. Paste one complete recipe with those headings.');
  const start=ingredients[0],end=methods[0];
  const recipeIngredient=lines.slice(start+1,end).map(line=>line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/,''));
  if(!recipeIngredient.length||!lines.slice(end+1).length)fail('Include the ingredient lines and cooking instructions in the pasted recipe.');
  // Known trailing sections belong to the retained source, not to cooking steps.
  const after=lines.slice(end+1),stop=after.findIndex(line=>['notes','nutrition','nutrition facts','reviews','comments','related recipes','references','see also'].includes(heading(line)));
  const steps=stop<0?after:after.slice(0,stop);
  if(!steps.length)fail('The recipe has no cooking instructions after its heading.');
  const before=lines.slice(0,start),yields=before.filter(yieldLine).map(line=>line.replace(/^(?:serves|servings|yield|makes)\s*[:\-]?\s*/i,''));
  // A bare count after "serves"/"servings" has a stated serving identity; "makes 1 loaf" does not.
  const yieldValues=before.filter(yieldLine).map((line,index)=>/^(?:serves|servings)\b/i.test(line)&&!/[a-z]/i.test(yields[index])?yields[index]+' servings':yields[index]);
  return {'@type':'Recipe',name:before.find(line=>!yieldLine(line))?.replace(/^#{1,6}\s+/,'')||'Imported recipe',
    recipeIngredient,recipeInstructions:steps.join('\n'),recipeYield:yieldValues.length===0?null:yieldValues.length===1?yieldValues[0]:yieldValues};
}

export function extractPlainRecipe(input){
  let format='text',text=input;
  if(/<\/?[a-z][\s\S]*>/i.test(input)){
    format='html-text';const $=load(input);
    $('script,style,noscript,template,nav,header,footer,aside,form,svg,[hidden],[aria-hidden="true"]').remove();
    const articles=$('article'),mains=$('main');
    const root=articles.length===1?articles.first():mains.length===1?mains.first():$('body');
    root.find('br').replaceWith('\n');
    root.find('p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,section,article,table,tr,blockquote').each((_,element)=>{$(element).prepend('\n').append('\n');});
    text=root.text();
  }
  text=text.split(/\r\n?|\n/).map(cleanLine).filter(Boolean).join('\n');
  const recipe=readPlainRecipeText(text);
  return recipe?{...recipe,plainTextSource:{version:1,format,text}}:null;
}

export function validatePlainRecipeSource(value,ingredients){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='format,text,version'||value.version!==1||!['text','html-text'].includes(value.format))fail('Invalid retained plain recipe source.');
  const recipe=readPlainRecipeText(value.text);
  if(!recipe||!Array.isArray(ingredients)||JSON.stringify(recipe.recipeIngredient)!==JSON.stringify(ingredients))fail('Keep every extracted source ingredient with the retained recipe text.');
  return {version:1,format:value.format,text:value.text};
}
