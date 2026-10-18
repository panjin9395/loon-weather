const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./budget.test.cjs');
const {weather,fixture,settings}=require('./weather.test.cjs');
function sample(time='17:00') {
 const now=Date.parse('2026-10-18T'+time+'+08:00'), b=fixture();b.server_time=now/1000;
 b.result.realtime.status='ok';b.result.realtime.obsTime=new Date(now-600000).toISOString();
 b.result.daily={status:'ok',temperature:[{date:'2026-10-18T00:00+08:00',min:15,max:25.234},{date:'2026-10-19T00:00+08:00',min:10.111,max:20}]};
 b.result.hourly={status:'ok',temperature:[],skycon:[],precipitation:[]};
 for(let i=0;i<3;i++){const datetime=new Date(now+i*3600000).toISOString();b.result.hourly.temperature.push({datetime,value:[22.345,21,19.876][i]});b.result.hourly.skycon.push({datetime,value:'CLOUDY'});b.result.hourly.precipitation.push({datetime,probability:[20,70,40][i]});}
 b.result.alert={status:'ok',content:[],adcodes:[]};return {b,now};
}
async function render(scene='evening',time='17:00',edit=()=>{},preview=false,s=settings()) {const {b,now}=sample(time);edit(b);return weather(s,b,false,{now,argument:'scene='+scene+(preview?'&preview=1':'')});}
test('return notification uses native hierarchy, rounded temperatures and compact footer',async()=>{
 const r=await render();const [title,subtitle,body]=r.notices[0];
 assert.equal(title,'🌆返程天气');assert.match(subtitle,/降温.*建议带伞/);
 assert.match(body,/^未来3小时：22\.3 → 19\.9°C/);
 assert.match(body,/最高降雨概率：70%；建议带伞/);
 assert.match(body,/17:00 22\.3°C.*阴\n18:00 21°C.*阴\n19:00 19\.9°C.*阴/);
 assert.match(body,/查询时间：2026-10-18 17:00/);
 assert.doesNotMatch(body,/能力摘要|通知生成时间|接口响应时间|\.345|\.876|21\.0°C|当地无预警/);
 assert.equal(r.requests.length,1);
});
test('official warnings lead all four scenes without upstream HTML or links; preview preserves dedupe',async()=>{
 for(const [scene,time] of [['morning','07:30'],['noon','12:00'],['evening','17:00'],['night','20:30']]) {
  const s=settings(),original=s.caiyun;
  const edit=b=>b.result.alert.content=[{alertId:'safe',status:'alerting',code:'0202',title:'<a href="https://evil.invalid/SECRET">PRIVATE</a>',description:'https://evil.invalid/PRIVATE',pubtimestamp:b.server_time-60}];
  const r=await render(scene,time,edit,true,s);assert.match(r.notices[0][2],/^⚠️ 新增\/更新官方预警：⛈ 暴雨黄色预警/);assert.doesNotMatch(r.text,/evil|SECRET|PRIVATE|<a/);assert.equal(s.caiyun,original);
  assert.equal((await render(scene,time,edit,false,s)).notices.length,1);
 }
});
test('morning, night and manual retain respective information hierarchy',async()=>{
 let r=await render('morning','07:30');assert.equal(r.notices[0][0],'🌤今日天气');assert.match(r.notices[0][2],/^今日最低\/最高：15～25\.2°C\n未来3小时/);assert.match(r.notices[0][2],/07:30 22\.3°C/);
 r=await render('night','20:30');assert.equal(r.notices[0][0],'🌙明日天气');assert.match(r.notices[0][2],/^明日最低\/最高：10\.1～20°C\n日均温.*明显降温5\.1°C/);
 r=await render('evening','17:00',()=>{},true);assert.match(r.notices[0][0],/预览/);assert.match(r.text,/能力摘要/);assert.match(r.text,/通知生成时间/);assert.match(r.text,/接口响应时间/);
});
test('unknown observation, denied data and stale data remain explicit without formal diagnostic clutter',async()=>{
 let r=await render('evening','17:00',b=>{delete b.result.realtime.obsTime;b.result.hourly.status='permission_denied';});assert.match(r.text,/观测时间：未知/);assert.match(r.text,/逐小时缺权限/);assert.doesNotMatch(r.text,/能力摘要|建议带伞|最高降雨概率：0/);
 r=await render('evening','17:00',b=>b.result.realtime.obsTime='2026-10-18T07:20:00+08:00');assert.match(r.text,/数据陈旧.*580分钟/);
 r=await render('evening','17:00',b=>b.server_time-=7200);assert.match(r.text,/预报已降级.*陈旧/);assert.match(r.text,/接口响应陈旧/);assert.doesNotMatch(r.text,/建议带伞|22\.3/);
});
test('unchanged daily mean is not a spurious warming of zero degrees',async()=>{
 const r=await render('night','20:30',b=>b.result.daily.temperature[1]={date:'2026-10-19T00:00+08:00',min:15,max:25.234});assert.match(r.text,/日均温.*持平/);assert.doesNotMatch(r.text,/升温0|降温0/);
});
test('historical sample retains original half-open window without inventing a third hour',async()=>{
 const old={hours:[{time:'18:00',temperature:22.5},{time:'19:00',temperature:20.69},{time:'20:00',temperature:19.32}]};
 const r=await render('evening','17:00',b=>{
  b.result.hourly.temperature=old.hours.map(x=>({datetime:'2026-10-18T'+x.time+'+08:00',value:x.temperature}));
 });
 assert.match(r.text,/18:00 22\.5°C/);assert.match(r.text,/19:00 20\.7°C/);assert.doesNotMatch(r.text,/20:00 19\.3°C/);
});
test('unrecognized warning code uses a fixed safe fallback instead of raw upstream text',async()=>{
 const r=await render('evening','17:00',b=>b.result.alert.content=[{alertId:'unknown',status:'alerting',code:'9999',title:'PRIVATE https://bad.invalid',description:'PRIVATE',pubtimestamp:b.server_time-60}]);
 assert.match(r.notices[0][2],/^⚠️.*官方气象预警（类型\/等级未识别）/);assert.doesNotMatch(r.text,/undefined|PRIVATE|https:/);
});
module.exports={sample,render};
