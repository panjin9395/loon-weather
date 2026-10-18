const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./capabilities.test.cjs');
const {weather,settings,fixture}=require('./weather.test.cjs');
const fs=require('node:fs');
const at=t=>Date.parse('2026-10-18T'+t+':00+08:00');
const slots=Array.from({length:24},(_,h)=>h===7?'07:30':String(h).padStart(2,'0')+':00');
async function base(s,t,body=fixture(),failure=false){const now=at(t);body.server_time=now/1000;return weather(s,body,failure,{now,argument:'mode=base'});}
const ledger=s=>JSON.parse(s.caiyun_budget_v1||'{}');
test('base schedule has exactly 24 independent slots and three fixed summaries',async()=>{
 const p=fs.readFileSync('CaiyunWeather.plugin','utf8');
 assert.match(p,/cron "30 7 \* \* \*".*argument="mode=base"/);
 assert.match(p,/cron "0 0-6,8-23 \* \* \*".*argument="mode=base"/);
 const s=settings();let requests=0;const titles=[];
 for(const t of slots){const r=await base(s,t);requests+=r.requests.length;titles.push(...r.notices.map(n=>n[0]));}
 assert.equal(requests,24);assert.deepEqual(titles,['🌅上班通勤','☀️午间外出','🌆下班通勤']);
 assert.equal(ledger(s).day.used,24);assert.equal(Object.keys(ledger(s).day.slots).length,24);
 assert.equal((await base(s,'07:30')).requests.length,0);
 assert.equal((await base(s,'22:30')).requests.length,0);
});
test('manual attempts share estimated daily budget, reserve all future base slots and never claim a formal slot',async()=>{
 const s=settings(),original=s.caiyun;
 for(let i=0;i<3;i++){const r=await weather(s,fixture(),false,{now:at('06:00')});assert.equal(r.requests.length,1);assert.match(r.text,/本地估算/);}
 assert.equal((await weather(s,fixture(),false,{now:at('06:00')})).requests.length,0);
 assert.equal(s.caiyun,original);assert.equal(Object.keys(ledger(s).day.slots).length,0);
 for(const t of slots)assert.equal((await base(s,t)).requests.length,1);
 assert.equal(ledger(s).day.used,27);assert.equal(ledger(s).attempts,27);
});
function quota(s,q){const c=JSON.parse(s.caiyun);c.quota=q;s.caiyun=JSON.stringify(c);return s;}
test('configured remaining/expiry rolls daily cap, zero and expired stop, invalid config fails closed',async()=>{
 for(const q of [{remaining:0,expiry:'2026-10-19'},{remaining:100,expiry:'2026-10-17'},{remaining:100,expiry:'2026-02-30'},{remaining:'100',expiry:'2026-10-19'},{remaining:100}]){
  const s=quota(settings(),q);assert.equal((await base(s,'07:30')).requests.length,0);assert.equal((await weather(s,fixture())).requests.length,0);
 }
 const s=quota(settings(),{remaining:8,expiry:'2026-10-19'});
 assert.equal((await base(s,'06:00')).requests.length,1);
 for(const t of ['07:30','12:00','17:00'])assert.equal((await base(s,t)).requests.length,1);
 assert.equal((await weather(s,fixture(),false,{now:at('21:00')})).requests.length,0);
 assert.equal(ledger(s).attempts,4);
});
test('quota total/start uses fixed inclusive 365 days, no annual reset, deducts local attempts across midnight',async()=>{
 const s=quota(settings(),{total:10000,start:'2026-10-18'});
 assert.equal((await base(s,'07:30')).requests.length,1);
 let r=await weather(s,fixture(),false,{now:Date.parse('2027-10-18T07:30+08:00'),argument:'mode=base'});assert.equal(r.requests.length,0);
 assert.equal(ledger(s).attempts,1);
 const x=quota(settings(),{remaining:2,expiry:'2027-01-01'});
 for(const day of ['2026-12-31','2027-01-01']){r=await weather(x,fixture(),false,{now:Date.parse(day+'T07:30+08:00'),argument:'mode=base'});assert.equal(r.requests.length,1);}
 assert.equal((await weather(x,fixture(),false,{now:Date.parse('2027-01-01T20:30+08:00'),argument:'mode=base'})).requests.length,0);
});
test('extra trigger is quiet without valid recent hazard, bounded with hazard and absent overnight',async()=>{
 const s=settings();let r=await weather(s,fixture(),false,{now:at('10:15'),argument:'mode=extra'});assert.equal(r.requests.length,0);assert.equal(r.notices.length,0);
 const b=fixture();b.result.realtime.status='ok';b.result.realtime.obsTime='2026-10-18T10:00:00+08:00';b.result.realtime.skycon='LIGHT_RAIN';await base(s,'10:00',b);
 for(const t of ['10:45','11:15','11:45']){b.server_time=at(t)/1000;b.result.realtime.obsTime='2026-10-18T'+t+':00+08:00';r=await weather(s,b,false,{now:at(t),argument:'mode=extra'});assert.equal(r.requests.length,1);}
 assert.equal((await weather(s,b,false,{now:at('12:15'),argument:'mode=extra'})).requests.length,0);
 assert.equal((await weather(s,b,false,{now:at('23:15'),argument:'mode=extra'})).requests.length,0);
 assert.equal(ledger(s).day.extra,3);
});
test('failed base attempts are counted once, persist slot and silent failures never notify',async()=>{
 const s=settings();let r=await base(s,'08:00',fixture(),'PRIVATE_TOKEN_COORD');assert.equal(r.requests.length,1);assert.equal(r.notices.length,0);
 r=await base(s,'08:00');assert.equal(r.requests.length,0);assert.equal(ledger(s).day.used,1);
 await weather(s,fixture(),'PRIVATE_TOKEN_COORD',{now:at('08:31')});assert.equal(ledger(s).day.used,2);
 r=await weather(s,fixture(),false,{now:at('07:30'),argument:'scene=morning'});assert.equal(r.requests.length,1);
 assert.equal((await base(s,'07:30')).requests.length,0);
});
test('silent trusted significant temperature change notifies once, untrusted data never does',async()=>{
 const s=settings(),b=fixture();b.result.realtime.status='ok';b.result.realtime.obsTime='2026-10-18T08:00:00+08:00';
 assert.equal((await base(s,'08:00',b)).notices.length,0);
 b.result.realtime.temperature=26;b.result.realtime.obsTime='2026-10-18T09:00:00+08:00';
 assert.match((await base(s,'09:00',b)).text,/可信天气明显变化/);
 b.result.realtime.obsTime='2026-10-18T10:00:00+08:00';assert.equal((await base(s,'10:00',b)).notices.length,0);
 delete b.result.realtime.obsTime;b.result.realtime.temperature=10;assert.equal((await base(s,'10:00',b)).notices.length,0);
});
test('failed persistence blocks request; extra triggers dedupe and manual never consumes formal warnings',async()=>{
 const s=settings();assert.equal((await weather(s,fixture(),false,{argument:'mode=base',now:at('07:30'),failBudgetWrite:true})).requests.length,0);
 s.caiyun_budget_v1=JSON.stringify({day:{date:'2026-10-18',used:0,extra:0,slots:{}},hazardUntil:at('12:00')});
 let r=await weather(s,fixture(),'PRIVATE',{argument:'mode=extra',now:at('10:15')});assert.equal(r.requests.length,1);
 s.caiyun_budget_v1=JSON.stringify({...ledger(s),hazardUntil:at('12:00')});
 assert.equal((await weather(s,fixture(),false,{argument:'mode=extra',now:at('10:15')})).requests.length,0);
});
test('published schedule expands to exact 24 base slots and explicit bounded daytime extra triggers',()=>{
 const p=fs.readFileSync('CaiyunWeather.plugin','utf8');assert.match(p,/cron "15,45 7-20 \* \* \*".*argument="mode=extra"/);
 const lines=p.split('\n').filter(x=>x.startsWith('cron ') && x.includes('mode=base'));
 const found=[];for(const l of lines){const [,m,h]=l.match(/cron "(\S+) (\S+)/);const hours=h.split(',').flatMap(v=>v.includes('-')?Array.from({length:Number(v.split('-')[1])-Number(v.split('-')[0])+1},(_,i)=>Number(v.split('-')[0])+i):[Number(v)]);for(const hour of hours)found.push(String(hour).padStart(2,'0')+':'+m.padStart(2,'0'));}
 assert.equal(found.length,24);assert.deepEqual(found.sort(),slots);
});
test('four scene slots fire at most once including updated noon warning; preview preserves alert state',async()=>{
 const s=settings(),b=fixture();b.result.alert={status:'ok',content:[{alertId:'synthetic',status:'alerting',code:'0202',title:'测试预警',description:'测试',pubtimestamp:at('07:00')/1000,expiretimestamp:at('21:00')/1000}]};
 await weather(s,b,false,{now:at('07:29'),argument:'scene=noon&preview=1'});
 assert.equal(JSON.parse(s.caiyun).scene_alerts_v1,undefined);
 for(const t of ['07:30','12:00','17:00','20:00']){b.result.alert.content[0].pubtimestamp=at(t)/1000;assert.equal((await base(s,t,b)).notices.length,1);assert.equal((await base(s,t,b)).requests.length,0);}
 assert.equal(ledger(s).day.used,5);
});
test('manual exhausted cap never starves scenes, missing config does not annual reset',async()=>{
 const s=settings();s.caiyun_budget_v1=JSON.stringify({attempts:9999,day:{date:'2025-10-18',used:27,extra:3,slots:{}}});
 assert.equal((await base(s,'07:30')).requests.length,1);assert.equal(ledger(s).attempts,10000);
 s.caiyun_budget_v1=JSON.stringify({...ledger(s),day:{date:'2026-10-18',used:27,extra:3,slots:{}}});
 assert.equal((await base(s,'17:00')).requests.length,0);assert.equal((await weather(s,fixture())).requests.length,0);
});
test('release version is present in script and plugin',()=>{const v=fs.readFileSync('VERSION','utf8').trim();assert.equal(v,'2026.10-allday.1');assert.ok(fs.readFileSync('caiyun-weather-v2.js','utf8').includes(v));assert.ok(fs.readFileSync('CaiyunWeather.plugin','utf8').includes(v));});
module.exports={at,slots,base,ledger};
