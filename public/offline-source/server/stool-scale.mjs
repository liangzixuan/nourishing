// The public client defines seven categories. This unit label is local;
// its original server-supplied unit identifier is not established.
export const stoolUnit='Bristol type';
export const stoolTypes=Object.freeze([
 {value:1,label:'Severe constipation',description:'Small, separate hard pieces.'},
 {value:2,label:'Mild constipation',description:'A lumpy, sausage-shaped stool.'},
 {value:3,label:'Normal',description:'A formed stool with cracks on its surface.'},
 {value:4,label:'Normal',description:'Smooth, soft and sausage-shaped.'},
 {value:5,label:'Lacking fibre',description:'Soft pieces with clearly defined edges.'},
 {value:6,label:'Mild diarrhea',description:'Mushy pieces with ragged edges.'},
 {value:7,label:'Severe diarrhea',description:'Liquid with no solid pieces.'}
].map(Object.freeze));
export const isStoolScaleMetric=(type,unit)=>type==='stool'&&unit===stoolUnit;
export const usesStoolScale=(metric,custom=false)=>!custom&&metric?.selection.kind==='catalog'&&metric.selection.id==='stool';
export function parseStoolType(value){
 if(!Number.isInteger(value)||value<1||value>7)throw Object.assign(Error('Choose a Bristol stool type from 1 to 7.'),{status:400});
 return value;
}
