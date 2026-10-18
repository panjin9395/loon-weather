const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sample,render}=require('./notification.test.cjs');
const {weather,settings}=require('./weather.test.cjs');
const {base,ledger}=require('./budget.test.cjs');
test('20:30 remains a queried silent slot except new valid official warning or trusted change',async()=>{
 const s=settings();let r=await base(s,'20:30',sample('20:30').b);assert.equal(r.requests.length,1);assert.equal(r.notices.length,0);
 const b=sample('20:30').b;b.result.alert.content=[{alertId:'severe',status:'alerting',code:'0204',title:'测试',description:'测试',pubtimestamp:b.server_time-60}];
 const x=settings();r=await base(x,'20:30',b);assert.equal(r.notices.length,1);assert.match(r.text,/官方预警.*暴雨红色/);assert.doesNotMatch(r.text,/明日最低|明日天气/);
 r=await weather(x,b,false,{now:Date.parse('2026-10-18T21:30+08:00'),argument:'mode=base'});assert.equal(r.notices.length,0);
 const z=settings(),before=sample('20:00').b;before.result.realtime.temperature=26;await base(z,'20:00',before);const after=sample('20:30').b;after.result.realtime.temperature=20;r=await base(z,'20:30',after);assert.equal(r.notices.length,1);assert.match(r.text,/可信天气明显变化.*通勤参考/);assert.match(r.text,/生活建议，非官方预警/);assert.doesNotMatch(r.text,/明日最低/);
 for(const scene of ['noon','night']){const y=settings(),c=JSON.parse(y.caiyun);c.scenes={[scene]:false};y.caiyun=JSON.stringify(c);assert.equal((await weather(y,b,false,{now:Date.parse('2026-10-18T20:30+08:00'),argument:'scene='+scene})).notices.length,1);}
});
test('commute titles and three-hour umbrella/clothing advice work for formal and manual previews',async()=>{
 for(const [scene,time,title] of [['morning','07:30','🌅上班通勤'],['evening','17:00','🌆下班通勤']])for(const preview of [false,true]){
  const r=await render(scene,time,()=>{},preview);assert.equal(r.notices[0][0],title+(preview?' · 预览':''));assert.match(r.text,/未来3小时：22\.3 → 19\.9°C/);assert.match(r.text,/70%.*建议带伞/);assert.match(r.text,/降温.*添衣/);assert.doesNotMatch(r.text,/路线|路况|到达|分钟后.*雨|睡前/);
 }
});
test('low quota reserves three summaries and no longer reserves 20:30',async()=>{
 const s=settings(),c=JSON.parse(s.caiyun);c.quota={remaining:6,expiry:'2026-10-19'};s.caiyun=JSON.stringify(c);
 assert.equal((await base(s,'06:30')).requests.length,0);
 for(const t of ['07:30','12:00','17:00'])assert.equal((await base(s,t)).notices.length,1);
 assert.equal((await base(s,'20:30')).requests.length,0);assert.equal(ledger(s).attempts,3);
});
test('missing forecast data degrades all three summaries without invented advice',async()=>{
 for(const [scene,time] of [['morning','07:30'],['noon','12:00'],['evening','17:00']]){const r=await render(scene,time,b=>{b.result.hourly={status:'permission_denied'};delete b.result.realtime.obsTime;});assert.equal(r.notices.length,1);assert.match(r.text,/概率不可用/);assert.match(r.text,/无法据此判断添衣/);assert.match(r.text,/观测时间：未知/);assert.doesNotMatch(r.text,/建议带伞|降温，酌情添衣|最高降雨概率：0/);}
});
test('default late manual preview is commute rather than tomorrow; explicit night remains available',async()=>{
 const {b,now}=sample('20:30');const r=await weather(settings(),b,false,{now});assert.match(r.notices[0][0],/下班通勤.*预览/);assert.doesNotMatch(r.text,/明日最低/);
});
test('12:00 sends one fixed midday outing summary without warnings; manual does not swallow formal',async()=>{
 const s=settings(),{b,now}=sample('12:00');
 const p=await weather(s,b,false,{now,argument:'scene=noon&preview=1'});assert.match(p.text,/预览/);
 let r=await base(s,'12:00',b);assert.equal(r.notices.length,1);assert.equal(r.notices[0][0],'☀️午间外出');assert.match(r.text,/未来3小时.*22\.3.*19\.9/);assert.match(r.text,/70%.*建议带伞/);assert.match(r.text,/降温.*添衣/);
 assert.equal((await base(s,'12:00',b)).notices.length,0);assert.equal(ledger(s).day.extra,1);
});
