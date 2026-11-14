/** Arithmetic recovered from Wzk, vAk and cAk in the public web build.
 * Callers retain measured values and identify any source-zero substitution. */
export function sourceComponentCredit({value,target,maximum,rule='progress'}){
 const input=value??0;
 if(rule==='minimize')return maximum!==null&&maximum>0?Math.max(0,(maximum-input)/maximum):0;
 if(target===null||target<=0)return 0;
 if(rule==='protein'&&maximum!==null&&input>maximum)return 0;
 if(rule==='progress'&&maximum!==null&&input>target&&input>maximum)return 0.9;
 return Math.min(1,input/target);
}

/** Pyk retains every weight. The weight map also owns source summation order.
 * Components are fresh projections, never workspace records. */
export function sourceWeightedScore(components,weights){
 const rows=new Map(components.map(row=>[row.id,row]));let numerator=0,denominator=0;
 for(const [id,weight]of Object.entries(weights)){const row=rows.get(id);if(!row)throw Error('A source score component is missing: '+id);numerator+=(row.progress??0)*weight;denominator+=weight;}
 for(const row of components)if(row.included){row.weight=weights[row.id]/denominator;row.points=row.progress*row.weight*100;}
 return denominator===0?0:100*numerator/denominator;
}

export function sourceMacroTarget(macro,name,maximums){
 const id=name==='carbohydrate'?macro.carbohydrateTargetId:name,raw=macro.targets[name],dynamic=['ratio','keto'].includes(macro.sources[name]);
 const explicit=maximums.get(id),target=raw===null?null:dynamic?Math.round(raw):raw;
 return {target,maximum:explicit?explicit.maximum:raw===null?null:dynamic?Math.round(raw*1.1):raw,origin:explicit?explicit.origin:dynamic?'dynamic':'fixed'};
}
