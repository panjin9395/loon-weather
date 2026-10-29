const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const NOW=Date.parse('2026-10-18T11:17:00+08:00');
function capture(store,url){
 const notices=[],logs=[];let done=0;
 vm.runInNewContext(fs.readFileSync('caiyun-location-v2.js','utf8'),{
  $request:{url},$persistentStore:{read:k=>store[k],write:(v,k)=>(store[k]=v,true)},
  $notification:{post:(...a)=>notices.push(a)},$done:()=>done++,console:{log:s=>logs.push(s)}
 });return {notices,logs,done};
}
const request=(lat,lon=0)=>`https://weatherkit.apple.com/api/v2/weather/en/${lat}/${lon}?timezone=UTC`;
const settings=(location={latitude:'0',longitude:'0'})=>({caiyun:JSON.stringify({location,token:{caiyun:'fixture-not-a-real-token'}})});
const saved=s=>JSON.parse(s.caiyun).location;
test('within 3km retains the saved anchor and timestamp',()=>{
 const s=settings();const old=s.caiyun;capture(s,request(0.01));assert.equal(s.caiyun,old);
});
const fixture=()=>({status:'ok',tzshift:28800,server_time:NOW/1000,result:{
 realtime:{skycon:'CLOUDY',temperature:20,humidity:0.8,apparent_temperature:20,air_quality:{description:{chn:'优'}},life_index:{comfort:{desc:'舒适'},ultraviolet:{desc:'弱'}},wind:{speed:2,direction:0}},
 hourly:{skycon:[]},forecast_keypoint:'fixture'
}});
async function weather(store,body=fixture(),failure=false,options={}){
 const notices=[],logs=[],requests=[];
 const clock=options.now ?? NOW;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
 let complete;const finished=new Promise(r=>complete=r);
 vm.runInNewContext(fs.readFileSync('caiyun-weather-v2.js','utf8'),{
  Date:Clock,$argument:options.argument || '',$loon:{},$persistentStore:{read:k=>store[k],write:(v,k)=>options.failBudgetWrite && k==='caiyun_budget_v1' ? false : (store[k]=v,true)},
  $httpClient:{get:(o,cb)=>{requests.push(o);failure?cb(failure):cb(null,{status:options.statusCode || 200},options.rawBody ? body : JSON.stringify(body));}},
  $notification:{post:(...a)=>notices.push(a)},$done:complete,console:{log:s=>logs.push(s)},setTimeout,clearTimeout
 });await finished;return {notices,logs,requests,text:notices.flat().join('\n')};
}
test('07:20 observation at 11:17 stays 07:20, marked stale, separate query/generation',async()=>{
 const b=fixture();b.result.realtime.obsTime='2026-10-18T07:20:00+08:00';
 const r=await weather(settings(),b);
 assert.match(r.text,/数据更新时间.*07:20/);assert.match(r.text,/查询时间.*11:17/);
 assert.match(r.text,/通知生成时间.*11:17/);assert.match(r.text,/数据陈旧/);
 assert.match(r.text,/237分钟/);
});
test('invalid saved coordinates prompt without making requests',async()=>{
 for(const p of [{latitude:'-91',longitude:'0'},{latitude:'0',longitude:'-181'},{latitude:true,longitude:'0'},{latitude:' ',longitude:'0'}]){
  const r=await weather(settings(p));assert.equal(r.requests.length,0);assert.match(r.text,/定位|经纬度/);
 }
});
test('network errors cannot expose request credentials or coordinates',async()=>{
 const r=await weather(settings(),fixture(),'https://example.invalid/PRIVATE_TOKEN/PRIVATE_COORD');
 assert.doesNotMatch(r.text,/PRIVATE_/);assert.match(r.text,/查询失败/);
});
test('3km boundary and just outside use saved anchor',()=>{
 const edge=3/6371.0088*180/Math.PI;
 for(const km of [2.999,3]){const s=settings(),old=s.caiyun;capture(s,request(edge*km/3));assert.equal(s.caiyun,old);}
 const s=settings();capture(s,request(edge*1.00001));assert.notEqual(saved(s).latitude,'0');
});
test('invalid or missing new position preserves store and queries fresh weather',async()=>{
 for(const url of [request(91),request(-91),request(0,181),'https://weatherkit.apple.com/no-location']){
  const s=settings(),old=s.caiyun;const c=capture(s,url);assert.equal(s.caiyun,old);assert.equal(c.done,1);
  const a=await weather(s),b=await weather(s);assert.equal(a.requests.length,1);assert.equal(b.requests.length,1);
 }
});
test('no saved position prompts instead of requesting weather',async()=>{
 const s=settings();delete JSON.parse(s.caiyun).location;
 s.caiyun=JSON.stringify({token:{caiyun:'fixture-not-a-real-token'}});
 const r=await weather(s);assert.equal(r.requests.length,0);assert.match(r.text,/未找到定位/);
});
test('first valid location persists and negative coordinates remain valid',async()=>{
 const s={};capture(s,request(-1,-1));assert.equal(saved(s).latitude,'-1');
 const r=await weather(settings({latitude:'-1',longitude:'-1'}));assert.equal(r.requests.length,1);
});
test('missing observation time never uses server time as data time',async()=>{
 const b=fixture();b.server_time=Date.parse('2026-10-18T07:20:00+08:00')/1000;
 const r=await weather(settings(),b);assert.match(r.text,/数据更新时间：未知/);assert.match(r.text,/接口响应陈旧/);
 assert.doesNotMatch(r.text,/数据更新时间：[^\n]*07:20/);
});
test('explicit offset is independent of device timezone and timezone-less input is unknown',async()=>{
 const b=fixture();b.result.realtime.obsTime='2026-10-17T23:20:00Z';
 assert.match((await weather(settings(),b)).text,/数据更新时间：2026-10-18 07:20 UTC\+08:00/);
 b.result.realtime.obsTime='2026-10-18T07:20:00';
 assert.match((await weather(settings(),b)).text,/数据更新时间：未知/);
});
test('weather requests explicitly bypass HTTP caches',async()=>{
 const r=await weather(settings());assert.equal(r.requests[0].headers['Cache-Control'],'no-cache, no-store');
 assert.equal(r.requests[0].headers.Pragma,'no-cache');
});
module.exports={capture,request,settings,saved,NOW,weather,fixture};
