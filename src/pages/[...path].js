import {createWebHandler} from '../../server/http.mjs';
import {readConfig} from '../../server/config.mjs';
import {createAppwriteService} from '../../server/appwrite-service.mjs';
import html from '../../public/index.html?raw';
const assets=new Map([['/',{type:'text/html; charset=utf-8',body:html}]]);
export const prerender=false;
export function ALL({request}) {
  const config=readConfig(process.env);
  return createWebHandler({config,assets,serviceForRequest:req=>createAppwriteService(config,process.env.APPWRITE_API_KEY||req.headers.get('x-appwrite-key'),req.headers.get('user-agent')??'')})(request);
}
