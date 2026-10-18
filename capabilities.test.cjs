const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./scenes.test.cjs');
const {weather,fixture,settings}=require('./weather.test.cjs');
const preview=b=>weather(settings(),b,false,{argument:'scene=noon&preview=1'});
test('one manual preview includes private capability summary and empty-ok means no valid alert',async()=>{
 const b=fixture();b.result.realtime.status='ok';
 b.result.hourly={status:'ok',temperature:[{datetime:'2026-10-18T12:00+08:00',value:20}]};
 b.result.daily={status:'ok',temperature:[{date:'2026-10-18T00:00+08:00',min:10,max:20}]};
 b.result.alert={status:'ok',content:[]};b.private='PRIVATE_RESPONSE https://private.invalid/SECRET/11.123,22.456';
 const s=settings(),old=s.caiyun,r=await weather(s,b,false,{argument:'scene=noon&preview=1'});
 assert.match(r.text,/能力摘要/);for(const label of ['实况','逐小时','逐日'])assert.match(r.text,new RegExp(label+'：可用'));
 assert.match(r.text,/预警：当前无有效预警/);assert.equal(s.caiyun,old);assert.equal(r.requests.length,1);
 assert.doesNotMatch(r.text+r.logs.join(''),/PRIVATE_RESPONSE|https:\/\/|SECRET|11\.123|22\.456|fixture-not-a-real-token/);
 assert.doesNotMatch(r.text,/不能判断是否有预警/);
});
test('denied and missing blocks remain unknown; failed response still yields one private manual summary',async()=>{
 for(const b of [
  {status:'permission_denied',error:'PRIVATE_ERROR https://secret.invalid/TOKEN'},
  {status:'ok',result:{hourly:{status:'denied'},daily:{status:'permission_denied'},alert:{status:'denied',content:[]}}},
  {status:'ok',result:{realtime:{},hourly:{status:'ok',temperature:[]},daily:{status:'ok'},alert:{status:'ok'}}}
 ]){const r=await preview(b);assert.equal(r.notices.length,1);assert.match(r.text,/能力摘要/);assert.match(r.text,/实况：(?:缺权限|结构异常).*未知/);assert.doesNotMatch(r.text,/PRIVATE_ERROR|https:\/\/|TOKEN|当前无有效预警/);}
 const b=fixture();b.result.alert={status:'denied',content:[]};const r=await preview(b);assert.match(r.text,/预警：缺权限（未知）/);assert.match(r.text,/不能判断是否有预警/);
});
test('request uses documented token v2.6 combined product and bounded steps; formal runs omit diagnostic',async()=>{
 const b=fixture();b.result.alert={status:'ok',content:[],adcodes:[]};
 const r=await weather(settings(),b,false,{argument:'scene=morning'});
 const u=new URL(r.requests[0].url);assert.equal(u.origin,'https://api.caiyunapp.com');assert.equal(u.pathname,'/v2.6/fixture-not-a-real-token/0,0/weather');
 assert.equal(u.searchParams.get('alert'),'true');assert.equal(u.searchParams.get('dailystart'),'0');assert.equal(u.searchParams.get('dailysteps'),'3');assert.equal(u.searchParams.get('hourlysteps'),'24');assert.equal(u.searchParams.get('lang'),'zh_CN');
 assert.doesNotMatch(r.text,/能力摘要/);
});
test('all four manual scene previews include diagnostics without consuming alert state',async()=>{
 for(const scene of ['morning','noon','evening','night']){const s=settings(),old=s.caiyun,r=await weather(s,fixture(),false,{argument:'scene='+scene+'&preview=1'});assert.match(r.text,/能力摘要/);assert.equal(s.caiyun,old);}
});
test('manual diagnostic survives missing realtime with valid nonempty alert block',async()=>{
 const b=fixture();delete b.result.realtime;b.result.alert={status:'ok',content:[{alertId:'test',status:'alerting',code:'0202',title:'test',description:'test',pubtimestamp:1}]};
 const r=await preview(b);assert.match(r.text,/预警：可用/);assert.match(r.text,/实况：结构异常/);
});
test('official empty alert with null adcodes is unknown, not no valid alerts',async()=>{
 const b=fixture();b.result.alert={status:'ok',content:[],adcodes:null};
 const r=await preview(b);assert.match(r.text,/不能判断是否有预警/);assert.doesNotMatch(r.text,/有效预警记录为空|当前无有效预警/);
});
