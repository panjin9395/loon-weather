const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./commute-details.test.cjs');
const {render,sample}=require('./notification.test.cjs');
const {weather,settings}=require('./weather.test.cjs');
const {base}=require('./budget.test.cjs');
test('official warnings include bounded safe original region and Shanghai publish time without guessed expiry or locality',async()=>{
 const s=settings();
 const edit=b=>b.result.alert.content=[{alertId:'frontier',status:'alerting',code:'0202',title:'暴雨预警',location:'测试市邻县',description:'<b>请避免涉水。</b>\u0000 https://evil.invalid/PRIVATE '+ '注意安全。'.repeat(80),pubtimestamp:b.server_time-60}];
 const r=await render('evening','17:00',edit,true,s);
 assert.match(r.text,/暴雨黄色预警/);assert.match(r.text,/发布地区：测试市邻县/);assert.match(r.text,/发布：10-18 16:59（北京时间）/);assert.match(r.text,/官方原文节选：请避免涉水/);assert.match(r.text,/边界附近可能含邻区/);
 assert.doesNotMatch(r.text,/<b>|\u0000|https:\/\/evil|PRIVATE|有效至|与当前位置一致/);assert.ok(r.notices[0][2].length<850);
 assert.equal((await render('evening','17:00',edit,false,s)).notices.length,1);
 assert.match((await render('evening','17:00',edit,true,s)).text,/持续预警/);
 assert.equal(r.requests.length,1);
});
test('failure streak is local private fixed-slot only daily throttled and resets after recovery',async()=>{
 const s=settings();
 for(const t of ['08:00','09:00'])assert.equal((await base(s,t,undefined,'PRIVATE_NETWORK_URL')).notices.length,0);
 let r=await base(s,'12:00',undefined,'PRIVATE_NETWORK_URL');assert.match(r.text,/连续.*失败|连续失败/);assert.match(r.text,/网络/);assert.doesNotMatch(r.text,/PRIVATE/);
 assert.equal((await base(s,'17:00',undefined,'PRIVATE_NETWORK_URL')).notices.length,0);
 await base(s,'18:00',sample('18:00').b);assert.equal(JSON.parse(s.caiyun_health_v1).streak,0);
 assert.equal((await base(s,'19:00',undefined,'PRIVATE')).notices.length,0);
 assert.equal((await base(s,'20:00',undefined,'PRIVATE')).notices.length,0);
});
test('provider failures classify explicit auth quota permission and ambiguous throttling without raw payload',async()=>{
 for(const [error,label,code] of [['token is invalid','认证',400],['Token disabled','认证',403],['quota exhausted','额度',429],['Rate limit exceeded','限流',429],['IP not allowed','权限',403],['unknown PRIVATE_URL','未知',400]]){
  const s=settings(), b={status:'failed',error};
  const now=sample('12:00').now;
  const r=await weather(s,b,false,{now,argument:'mode=base',statusCode:code});
  // A diagnosed auth/quota/permission problem is visible at the fixed slot, no extra HTTP.
  if(code!==400 || error==='token is invalid')assert.match(r.text,new RegExp(label));
  assert.equal(JSON.parse(s.caiyun_health_v1).kind.includes(label),true);
  assert.doesNotMatch(r.text,/PRIVATE_URL|token is invalid|Token disabled/);assert.equal(r.requests.length,1);
 }
});
test('local budget denial stays visible at fixed summaries only and never triggers HTTP',async()=>{
 const s=settings();const c=JSON.parse(s.caiyun);c.quota={remaining:0,expiry:'2026-10-19'};s.caiyun=JSON.stringify(c);
 assert.equal((await base(s,'11:00')).notices.length,0);
 const r=await base(s,'12:00');assert.match(r.text,/预算/);assert.equal(r.requests.length,0);
 assert.equal((await base(s,'17:00')).notices.length,0);
});
test('fixed summaries always include validated apparent humidity UV with unknown fallbacks',async()=>{
 for(const [scene,time] of [['morning','07:30'],['noon','12:00'],['evening','17:00']]){
  const r=await render(scene,time,b=>{b.result.realtime.apparent_temperature=36;b.result.realtime.humidity=0.95;b.result.realtime.life_index.ultraviolet={index:7,desc:'PRIVATE'};});
  assert.match(r.text,/体感36°C（偏热） · 湿度95% · 紫外线7（强）/);assert.equal(r.requests.length,1);assert.doesNotMatch(r.text,/PRIVATE/);
 }
 for(const value of [null,undefined,'20',NaN,Infinity]){
  const r=await render('noon','12:00',b=>{b.result.realtime.apparent_temperature=value;b.result.realtime.humidity=value;b.result.realtime.life_index.ultraviolet={index:value};});assert.match(r.text,/体感未知 · 湿度未知 · 紫外线未知/);
 }
 for(const unit of ['SI','imperial'])assert.match((await render('evening','17:00',b=>b.unit=unit)).text,/体感未知/);
 const zero=await render('noon','12:00',b=>{b.result.realtime.apparent_temperature=0;b.result.realtime.humidity=0;b.result.realtime.life_index.ultraviolet={index:0};});assert.match(zero.text,/体感0°C（偏冷） · 湿度0% · 紫外线0（无）/);
});
test('official prevention sentence remains visible when long forecast precedes it and advice stays separate',async()=>{
 const r=await render('evening','17:00',b=>b.result.alert.content=[{alertId:'long',status:'alerting',code:'0202',title:'暴雨',description:'预计局部地区有较强降雨。'.repeat(30)+'请远离低洼积水路段，注意防范。',pubtimestamp:b.server_time-60}]);
 assert.match(r.text,/官方原文节选：.*请远离低洼积水路段/);assert.match(r.text,/本地出行建议（非官方预警）：/);
});
test('official code table covers white level and newly documented sand warning types',async()=>{
 for(const [code,label] of [['0100','台风白色'],['1701','春季沙尘天气趋势蓝色'],['1802','沙尘黄色']]){
  const r=await render('noon','12:00',b=>b.result.alert.content=[{alertId:code,status:'alerting',code,title:'测试',description:'请注意防范',pubtimestamp:b.server_time-60}]);assert.ok(r.text.includes(label),r.text);
 }
});
test('HTTP failure pages and ambiguous 429 stay classified without token-invalid claims',async()=>{
 for(const code of [400,401,403,429,500]){
  const s=settings();const r=await weather(s,'<html>PRIVATE https://private.invalid/secret</html>',false,{now:sample('12:00').now,argument:'mode=base',statusCode:code,rawBody:true});
  const h=JSON.parse(s.caiyun_health_v1);assert.doesNotMatch(h.kind,/认证/);assert.doesNotMatch(JSON.stringify(s),/PRIVATE|private.invalid/);assert.doesNotMatch(r.text,/PRIVATE|private.invalid/);assert.equal(r.requests.length,1);
 }
});
test('official guidance strips schemes entities bidi markup and bounds multiple warning display',async()=>{
 const r=await render('evening','17:00',b=>b.result.alert.content=Array.from({length:5},(_,i)=>({alertId:'safe'+i,status:'alerting',code:'0202',title:'测试',location:'测试市',description:'请防范 <script>不安全</script><a href="https://private.invalid">不安全</a>&#x202e;\u202e https://private.invalid/secret javascript:alert(1) '+ '防范。'.repeat(100),pubtimestamp:b.server_time-60})));
 assert.match(r.text,/另有2条预警未展开/);assert.doesNotMatch(r.text,/不安全|private.invalid|javascript:|&#|\u202e|<script>/);assert.ok(r.text.length<1200);
});
test('explicit scenes outside fixed clocks never emit automatic health card and manual preserves day marker',async()=>{
 const s=settings(), b={status:'failed',error:'token is invalid'};
 const r=await weather(s,b,false,{now:sample('11:00').now,argument:'scene=morning'});assert.equal(r.notices.filter(n=>n[0]==='⚠️彩云天气服务提示').length,0);
 await weather(s,b,false,{now:sample('12:00').now,argument:'scene=noon&preview=1'});assert.equal(JSON.parse(s.caiyun_health_v1).notifiedDay,undefined);
 const formal=await weather(s,b,false,{now:sample('12:00').now,argument:'mode=base'});assert.match(formal.text,/认证/);
});
test('missing token guides official personal access not Telegram without requests',async()=>{
 const s={caiyun:JSON.stringify({location:{latitude:'0',longitude:'0'}})};
 const r=await weather(s);assert.match(r.text,/官方|开放平台/);assert.doesNotMatch(r.text,/t.me|共享|cool_scripts/);assert.equal(r.requests.length,0);
});
