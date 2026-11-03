import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedLedgerHandler} from '../api/shared-ledger.js';
import {PARTNERS} from '../app/lib/shared-ledger.js';
function fixture() {
 let stored={shares:[5000,5000],entries:[],bills:[]}, audit=[];
 const ref={get:async()=>({exists:true,data:()=>structuredClone(stored)})};
 const db={collection:name=>({doc:()=>name === 'adminSharedLedger' ? ref : {audit:true}}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>structuredClone(stored)}),set:(target,value)=>{if (target === ref) stored=structuredClone(value); else audit.push(structuredClone(value))}})};
 const handler=createSharedLedgerHandler({dbProvider:()=>db,authenticate:async()=>({email:PARTNERS[0]}),rateProvider:async()=>({rate:3.6725,date:'2026-11-03'})});
 async function post(body) {let status=200,payload;const res={status(n){status=n;return this},json(value){payload=value;return value}};await handler({method:'POST',body},res);return {status,payload};}
 return {post,read:()=>stored,audit:()=>audit};
}
test('over-share withdrawal is rejected unless explicitly overridden',async()=>{
 const f=fixture();const result=await f.post({type:'withdraw',amount:'75.00'});
 assert.equal(result.status,400);assert.match(result.payload.error,/exceeds your available share/);assert.deepEqual(f.read().shares,[5000,5000]);
});
test('confirmed override withdraws excess from the partner and records it',async()=>{
 const f=fixture();const result=await f.post({type:'withdraw',amount:'75.00',allowOverShare:true,expectedShares:[5000,5000]});
 assert.equal(result.status,200);assert.deepEqual(f.read().shares,[0,2500]);assert.equal(f.read().entries[0].takenFromPartner,2500);assert.equal(f.read().entries[0].overShare,true);
});
test('stale approval and overdraw are rejected with no mutation',async()=>{
 const f=fixture();const stale=await f.post({type:'withdraw',amount:'75',allowOverShare:true,expectedShares:[4900,5000]});assert.equal(stale.status,400);assert.match(stale.payload.error,/balance changed/);
 const over=await f.post({type:'withdraw',amount:'101',allowOverShare:true,expectedShares:[5000,5000]});assert.equal(over.status,400);assert.deepEqual(f.read().shares,[5000,5000]);
});

test('USD expense stores original amount and deducts converted AED',async()=>{
 const f=fixture(); const result=await f.post({type:'expense',amount:'10.00',currency:'USD',note:'Subscription'});
 assert.equal(result.status,200); assert.equal(f.read().entries[0].amount,3673); assert.equal(f.read().entries[0].originalAmount,1000); assert.equal(f.read().entries[0].rateDate,'2026-11-03'); assert.equal(f.read().shares[0]+f.read().shares[1],6327);
});
test('USD reminder payment records the rate and original amount',async()=>{
 const f=fixture(); await f.post({type:'bill',amount:'10',currency:'USD',note:'Service',due:'2026-11-03',monthly:'on'}); const bill=f.read().bills[0];
 const result=await f.post({type:'pay-bill',id:bill.id,due:bill.due}); assert.equal(result.status,200); assert.equal(f.read().entries[0].amount,3673); assert.equal(f.read().entries[0].currency,'USD'); assert.equal(f.read().bills[0].due,'2026-12-03');
});

test('reminders repeat at selected intervals and retain the original day',async()=>{
 const f=fixture(); await f.post({type:'bill',amount:'1',note:'Annual',due:'2024-02-29',monthly:'on',repeatMonths:12}); let bill=f.read().bills[0];
 await f.post({type:'pay-bill',id:bill.id,due:bill.due}); bill=f.read().bills[0]; assert.equal(bill.due,'2025-02-28');
 await f.post({type:'pay-bill',id:bill.id,due:bill.due}); bill=f.read().bills[0]; assert.equal(bill.due,'2026-02-28');
 const invalid=await f.post({type:'bill',amount:'1',note:'Bad',due:'2026-01-01',monthly:'on',repeatMonths:13}); assert.equal(invalid.status,400);
});

test('reminder creation and payment are recorded without changing balance on creation',async()=>{
 const f=fixture(); await f.post({type:'bill',amount:'10',note:'Service',due:'2026-11-03',monthly:'on',repeatMonths:3});
 let ledger=f.read(); assert.equal(ledger.entries[0].type,'bill'); assert.equal(ledger.entries[0].repeatMonths,3); assert.deepEqual(ledger.shares,[5000,5000]);
 await f.post({type:'pay-bill',id:ledger.bills[0].id,due:ledger.bills[0].due}); ledger=f.read(); assert.deepEqual(ledger.entries.map(e=>e.type),['pay-bill','bill']);
});
test('paying a reminder at zero records the payment and negative balance', async () => {
 let stored = {shares:[0,0], entries:[], bills:[{id:'bill',note:'Renewal',amount:14500,due:'2027-05-21',monthly:false,paid:false}]};
 const ref={get:async()=>({data:()=>structuredClone(stored)})};
 const db={collection:name=>({doc:()=>name === 'adminSharedLedger' ? ref : {audit:true}}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>structuredClone(stored)}),set:(target,value)=>{if (target === ref) stored=structuredClone(value)}})};
 const handler=createSharedLedgerHandler({dbProvider:()=>db,authenticate:async()=>({email:PARTNERS[0]})});
 let status=200; const res={status(n){status=n;return this},json(value){return value}};
 await handler({method:'POST',body:{type:'pay-bill',id:'bill',due:'2027-05-21'}},res);
 assert.equal(status,200); assert.deepEqual(stored.shares,[-7250,-7250]); assert.equal(stored.entries[0].type,'pay-bill'); assert.equal(stored.entries[0].amount,14500); assert.equal(stored.bills[0].paid,true);
});

test('shared bank actions write an audit entry with actor and amount',async()=>{
 const f=fixture(); await f.post({type:'expense',amount:'12.50',note:'Service'});
 assert.equal(f.audit().length,1); assert.equal(f.audit()[0].action,'bank_expense'); assert.equal(f.audit()[0].actorEmail,PARTNERS[0]); assert.equal(f.audit()[0].metadata.amountAED,'12.50');
});
