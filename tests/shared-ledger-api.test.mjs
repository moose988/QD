import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedLedgerHandler} from '../api/shared-ledger.js';
import {PARTNERS} from '../app/lib/shared-ledger.js';
function fixture() {
 let stored={shares:[5000,5000],entries:[],bills:[]};
 const ref={};
 const db={collection:()=>({doc:()=>ref}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>structuredClone(stored)}),set:(_,value)=>{stored=structuredClone(value)}})};
 const handler=createSharedLedgerHandler({dbProvider:()=>db,authenticate:async()=>({email:PARTNERS[0]})});
 async function post(body) {let status=200,payload;const res={status(n){status=n;return this},json(value){payload=value;return value}};await handler({method:'POST',body},res);return {status,payload};}
 return {post,read:()=>stored};
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
