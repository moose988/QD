import test from 'node:test';
import assert from 'node:assert/strict';
import {changeLedger,PARTNERS} from '../app/lib/shared-ledger.js';
const change=(s,type,amount,actor=PARTNERS[0])=>changeLedger({shares:s},{type,amount,actor}).shares;
test('deposit divides the pot and partners can withdraw their own share',()=>{ let s=change([0,0],'deposit',10000); assert.deepEqual(s,[5000,5000]); s=change(s,'withdraw',5000); assert.deepEqual(s,[0,5000]); assert.deepEqual(change(s,'withdraw',5000,PARTNERS[1]),[0,0]); });
test('cannot withdraw someone else’s share or spend beyond the balance',()=>{assert.throws(()=>change([100,5000],'withdraw',101)); assert.throws(()=>change([100,200],'expense',301));});
test('expenses reduce available shares proportionally and preserve cents',()=>{assert.deepEqual(change([2000,4000],'expense',3000),[1000,2000]); assert.deepEqual(change([0,5000],'expense',1000),[0,4000]); assert.deepEqual(change([0,0],'deposit',1),[1,0]);});
test('reject invalid money and unrecognized actions',()=>{for(const n of [0,-1,1.5,Infinity]) assert.throws(()=>change([0,0],'deposit',n)); assert.throws(()=>change([1,1],'bad',1));});
test('explicit override takes only the excess from the partner share',()=>{
 const result=changeLedger({shares:[5000,5000]},{type:'withdraw',amount:7500,actor:PARTNERS[0],allowOverShare:true});
 assert.deepEqual(result.shares,[0,2500]);
 const reverse=changeLedger({shares:[5000,5000]},{type:'withdraw',amount:6500,actor:PARTNERS[1],allowOverShare:true});
 assert.deepEqual(reverse.shares,[3500,0]);
});
test('override never permits withdrawal beyond total or by an unknown partner',()=>{
 assert.throws(()=>changeLedger({shares:[100,200]},{type:'withdraw',amount:301,actor:PARTNERS[0],allowOverShare:true}),/total shared balance/);
 assert.throws(()=>changeLedger({shares:[100,200]},{type:'withdraw',amount:200,actor:'stranger',allowOverShare:true}),/Unknown partner/);
});
