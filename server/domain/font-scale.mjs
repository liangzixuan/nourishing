export const defaultFontScale=1;
export function parseFontScale(value=defaultFontScale){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0.75||value>2)throw Object.assign(Error('Choose a font size from 75% to 200%.'),{status:400});
 return value;
}
