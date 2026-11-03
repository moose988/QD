import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslateHandler} from '../api/_lib/quote-routes/quote-translate.js';
import {renderQuoteTemplate} from '../app/lib/quote-template.js';
const response=()=>{let status=200,body;return {setHeader(){},status(n){status=n;return this},json(x){body=x;return x},get result(){return {status,body}}};};
test('translation preserves order and requires authenticated access',async()=>{
 let payload; const handler=createTranslateHandler({authenticate:async()=>({uid:'admin'}),env:{GROQ_API_KEY:'test'},fetchImpl:async(_url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({texts:['تصميم','استضافة']})}}]})}}});
 const res=response(); await handler({method:'POST',body:{texts:['Design','Hosting']}},res); assert.deepEqual(res.result.body.texts,['تصميم','استضافة']); assert.deepEqual(JSON.parse(payload.messages[1].content).texts,['Design','Hosting']);
 const denied=createTranslateHandler({authenticate:async()=>{throw Error('no')}}),r=response(); await denied({method:'POST',body:{texts:['x']}},r); assert.equal(r.result.status,401);
});
test('invalid and incomplete translations fail instead of silently producing a wrong quote',async()=>{
 const handler=createTranslateHandler({authenticate:async()=>({}),env:{GROQ_API_KEY:'test'},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"texts":[]}'}}]})})}); const r=response(); await handler({method:'POST',body:{texts:['Design']}},r); assert.equal(r.result.status,503);
});
test('inclusions render once, as included, in their chosen language',()=>{
 const q={lineItems:[{name:{en:'Website',ar:'موقع'},includes:['Design','Hosting'],includesAr:['تصميم','استضافة'],qty:2,unitPrice:100}],terms:{en:[],ar:[]}};
 const en=renderQuoteTemplate(q), ar=renderQuoteTemplate(q,{lang:'ar'}); assert.equal((en.match(/Design/g)||[]).length,1); assert.match(en,/AED 200/); assert.match(ar,/تصميم/); assert.match(ar,/استضافة/); assert.doesNotMatch(ar,/>Design</); assert.doesNotMatch(en,/Thank you for the opportunity|class="scope"/);
});
