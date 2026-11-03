import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteHandler} from '../api/_lib/quote-routes/quote-create.js';
import {renderQuoteTemplate,normalizeQuoteForTemplate} from '../app/lib/quote-template.js';
import {buildQuotePaymentFields} from '../api/_lib/quote-payments.js';
test('custom quotation creates a draft that supports manual items and matching totals', async()=>{
 let saved; const db={collection:()=>({doc:id=>({set:async data=>{saved={id,...data}}})})};
 const handler=createQuoteHandler({getDb:()=>db,authenticate:async()=>({email:'admin@example.com'}),nextNumber:async()=> 'QD-TEST'});
 let status=200, result; const res={setHeader(){},status(n){status=n;return this},json(x){result=x;return x},end(){}};
 await handler({method:'POST',body:{custom:true,clientName:'Test Client',service:'Wedding invitation'}},res);
 assert.equal(status,201); assert.equal(saved.customer.businessName,'Test Client'); assert.match(saved.notes.en,/Wedding invitation/); assert.equal(saved.careMonthly,0);
 saved.lineItems=[{name:{en:'Invitation'},description:{en:'Design'},qty:2,unitPrice:100},{name:{en:'Add-on'},qty:1,unitPrice:50}];
 assert.equal(normalizeQuoteForTemplate(saved).totals.grandTotal,250); assert.equal(buildQuotePaymentFields(saved.id,saved).buildTotal,250);
 const html=renderQuoteTemplate(saved); assert.match(html,/Test Client/); assert.match(html,/Invitation/); assert.match(html,/250/); assert.ok(result.passcodePlain);
});
test('custom quotation requires client and service',async()=>{
 const handler=createQuoteHandler({authenticate:async()=>({email:'admin@example.com'})}); let status; const res={setHeader(){},status(n){status=n;return this},json(){}};
 await handler({method:'POST',body:{custom:true,clientName:'',service:'Website'}},res); assert.equal(status,400);
});



test('event quote hides web care, supports Arabic text, and removes localhost links',()=>{
 const event={serviceType:'Wedding invitation',customer:{businessName:'عميل'},notes:{en:'Event',ar:'دعوة زفاف'},terms:{en:[],ar:[]},lineItems:[{name:{en:'Invitation',ar:'دعوة'},description:{en:'Design',ar:'تصميم'},qty:1,unitPrice:250}]};
 const html=renderQuoteTemplate(event,{lang:'ar',quoteUrl:'http://localhost:3000/q/test'});
 assert.match(html,/عرض سعر/); assert.match(html,/دعوة/); assert.match(html,/تصميم/); assert.match(html,/الشروط والأحكام/); assert.doesNotMatch(html,/localhost|class="care-box"/);
});

test('new custom quote uses equal milestones and keeps historical schedules unchanged',async()=>{
 const {buildQuotePaymentView}=await import('../api/_lib/quote-payments.js'); const {paymentSchedule}=await import('../app/lib/quote-template.js');
 const base={lineItems:[{qty:1,unitPrice:101}],payments:[],careMonthly:0};
 const fresh=buildQuotePaymentView('new',{...base,paymentSplit:50}); assert.deepEqual(fresh.milestones.map(x=>x.amount),[51,50]); assert.deepEqual(paymentSchedule(101,50).map(x=>x.amount),[51,50]);
 const legacy=buildQuotePaymentView('old',base); assert.deepEqual(legacy.milestones.map(x=>x.amount),[30,71]);
});
test('quotation shows VAT before total and supports empty explicitly edited terms',()=>{
 const html=renderQuoteTemplate({paymentSplit:50,vatInclusive:false,vatPercent:5,terms:{en:[],ar:[],custom:true},lineItems:[{name:{en:'Service'},qty:1,unitPrice:100}]});
 assert.ok(html.indexOf('VAT 5%')<html.indexOf('One-time total')); assert.doesNotMatch(html,/Validity\. This quotation/); assert.match(html,/50% on acceptance/);
});
