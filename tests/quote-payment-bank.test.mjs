import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuotePaymentHandler} from '../api/_lib/quote-routes/quote-payment.js';
test('records payment, shared deposit and audit once, and rejects changed retries',async()=>{
 const data=new Map([['quotes/testquote',{quoteNumber:'Q-TEST',customer:{businessName:'Test'},lineItems:[{qty:1,unitPrice:100}],vatInclusive:true,paymentSplit:50,payments:[]}],['adminSharedLedger/main',{shares:[0,0],entries:[],bills:[]}]]);
 const ref=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path),ref:ref(path),id:path.split('/').pop()})});
 const db={collection:name=>({doc:id=>ref(`${name}/${id}`),where:()=>({limit:()=>({get:async()=>({empty:true,docs:[]})})})}),runTransaction:async fn=>{let writes=[]; const result=await fn({get:async r=>r.get(),set:(r,v,o)=>writes.push([r,v,o])}); for(const [r,v,o] of writes)data.set(r.path,o?.merge?{...data.get(r.path),...v}:v);return result}};
 const handler=createQuotePaymentHandler({dbProvider:()=>db,authenticate:async()=>({email:'mdaya0089@gmail.com',uid:'test'})});
 async function post(amount=20){let status=200,result; const res={setHeader(){},status(n){status=n;return this},json(v){result=v;return v}};await handler({method:'POST',body:{quoteRef:'testquote',requestId:'payment-test-1234567890',payment:{itemKey:'milestone:advance',amount,date:'2026-11-03',method:'Cash'}}},res);return {status,result};}
 assert.equal((await post()).status,201); assert.deepEqual(data.get('adminSharedLedger/main').shares,[1000,1000]); assert.equal(data.get('quotes/testquote').payments.length,1); assert.equal(data.get('adminActivityLogs/payment-payment-test-1234567890').action,'recorded_payment');
 assert.equal((await post()).status,201); assert.equal(data.get('quotes/testquote').payments.length,1); assert.deepEqual(data.get('adminSharedLedger/main').shares,[1000,1000]); assert.equal((await post(21)).status,409);
});

test('payment spanning installments allocates excess to the other installment',async()=>{
 const {applyPaymentToQuote,buildQuotePaymentView}=await import('../api/_lib/quote-payments.js');
 const q={paymentSplit:50,lineItems:[{qty:1,unitPrice:100}],payments:[]};
 for (const selected of ['milestone:advance','milestone:final']) {
  const next=applyPaymentToQuote('test',q,{itemKey:selected,amount:70,date:'2026-11-03',method:'Cash'});
  const v=buildQuotePaymentView('test',next); assert.equal(v.paid,70); assert.equal(v.balance,30); assert.equal(v.payments.reduce((sum,p)=>sum+p.amount,0),70); assert.equal(v.payments[0].itemKey,selected); assert.deepEqual(v.payments.map(p=>p.amount),[50,20]);
 }
 assert.throws(()=>applyPaymentToQuote('test',q,{itemKey:'milestone:advance',amount:101,date:'2026-11-03',method:'Cash'}),/remaining quotation balance/);
});
