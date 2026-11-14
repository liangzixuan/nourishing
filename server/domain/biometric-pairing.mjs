export const readingMinute=time=>time?Number(time.slice(0,2))*60+Number(time.slice(3)):null;

// Each queue advances once per source reading. Timed lookups examine at most
// 21 minute buckets; fallback walks source order without rescanning used rows.
export function createBiometricReadingPool(readings){
  const used=new Set(),all={items:readings,head:0},untimed={items:[],head:0},buckets=new Map();
  for(const row of readings){const at=readingMinute(row.time);if(at===null)untimed.items.push(row);else{if(!buckets.has(at))buckets.set(at,{items:[],head:0});buckets.get(at).items.push(row);}}
  const peek=queue=>{if(!queue)return null;while(queue.head<queue.items.length&&used.has(queue.items[queue.head].sourceOrder))queue.head++;return queue.items[queue.head]??null;};
  const take=row=>{if(row)used.add(row.sourceOrder);return row;};
  return {
    nearest(at){
      let best=null,distance=Infinity;
      for(let candidate=Math.max(0,at-10);candidate<=Math.min(1439,at+10);candidate++){
        const row=peek(buckets.get(candidate)),delta=Math.abs(candidate-at);
        if(row&&(delta<distance||(delta===distance&&row.sourceOrder<best.sourceOrder))){best=row;distance=delta;}
      }
      return take(best);
    },
    fallback(at){return take(peek(at===null?all:untimed));},
    remaining(){return readings.filter(row=>!used.has(row.sourceOrder));}
  };
}
/** Pair one date of validated, uniquely ordered readings without reuse. */
export function pairBiometricReadings(primary,secondary){
  const pool=createBiometricReadingPool(secondary),matched=new Set(),pairs=[];
  const add=(first,second,match)=>{matched.add(first.sourceOrder);pairs.push({primary:first,secondary:second,match,minutes:match==='time'?Math.abs(readingMinute(first.time)-readingMinute(second.time)):null});};
  for(const first of primary)if(first.time){const second=pool.nearest(readingMinute(first.time));if(second)add(first,second,'time');}
  for(const first of primary)if(!matched.has(first.sourceOrder)){const second=pool.fallback(readingMinute(first.time));if(second)add(first,second,'order');}
  pairs.sort((a,b)=>a.primary.sourceOrder-b.primary.sourceOrder);
  return {pairs,unmatchedPrimary:primary.filter(row=>!matched.has(row.sourceOrder)),unmatchedSecondary:pool.remaining()};
}
