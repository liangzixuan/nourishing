export const csvFormatErrors=Object.freeze({"formatterUnavailable":"The CSV formatter is unavailable.","fields":"CSV fields must be an array and rows must be iterable.","row":"Each CSV row must be an array or an object."});
export class CsvFormatError extends TypeError{constructor(code){if(!Object.hasOwn(csvFormatErrors,code))throw new RangeError("Unknown CSV error identity.");super(csvFormatErrors[code]);this.csvCode=code;}}

// Papa applies this policy to text only. Numeric negatives retain their type.
// Leading controls/whitespace and embedded line breaks are included.
const formulaPrefix=/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u;
// A processing batch, not an export row limit. Only this many source rows are
// retained at once; the complete CSV string is still the public return value.
const batchSize=256;
const options={escapeFormulae:formulaPrefix,newline:'\r\n'};
export function createCsvSerializer(unparse){
  if(typeof unparse!=='function')throw new CsvFormatError('formatterUnavailable');
  return function serializeCsv(fields,rows){
    if(!Array.isArray(fields)||!rows||typeof rows[Symbol.iterator]!=='function')throw new CsvFormatError('fields');
    const chunks=[];let batch=[],arrayRows;
    const flush=()=>{
      chunks.push(unparse({fields,data:batch},{...options,header:chunks.length===0}));
      batch=[];
    };
    for(const row of rows){
      if(row===null||typeof row!=='object')throw new CsvFormatError('row');
      if(arrayRows===undefined)arrayRows=Array.isArray(row);
      // Resolve positional or keyed lookup once. Papa receives only array rows
      // and continues to own cell escaping, empty lines and CSV formatting.
      const values=fields.length?(Object.keys(row).length?fields.map((field,index)=>row[arrayRows?index:field]):[]):Array.isArray(row)?row:[];
      batch.push(values);if(batch.length===batchSize)flush();
    }
    if(batch.length)flush();
    return chunks.length?chunks.join('\r\n'):unparse({fields,data:[]},options);
  };
}
