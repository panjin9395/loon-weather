const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./all-day.test.cjs');
const {render}=require('./notification.test.cjs');
const air=(b,n,desc='优')=>{b.result.realtime.air_quality={aqi:{chn:n,usa:999},description:{chn:desc,usa:'PRIVATE'}};};
test('commute compact air uses valid Chinese AQI including zero; poor air is not called good',async()=>{
 for(const [n,desc] of [[25,'优'],[0,'优'],[180,'中度污染']]){
  const r=await render('evening','17:00',b=>air(b,n,desc));
  assert.match(r.text,new RegExp('空气'+desc+' 国标AQI '+n));
  assert.doesNotMatch(r.text,/999|PRIVATE|PM2.5|PM10/);assert.equal(r.requests.length,1);
 }
});
test('missing malformed denied or US-only AQI never fabricates Chinese air quality',async()=>{
 for(const n of [undefined,null,-1,501,'25',true,NaN,Infinity]){
  const r=await render('evening','17:00',b=>air(b,n));assert.doesNotMatch(r.text,/空气优|国标AQI|999/);
 }
 for(const edit of [b=>delete b.result.realtime.air_quality,b=>{air(b,25);b.result.realtime.status='permission_denied';},b=>{air(b,25);b.result.realtime.air_quality.status='denied';},b=>{air(b,25);b.server_time-=7200;}])assert.doesNotMatch((await render('evening','17:00',edit)).text,/空气优|国标AQI/);
});
test('air descriptions are bounded known labels, never upstream text or assumed good',async()=>{
 for(const desc of [undefined,'<b>PRIVATE</b>','优'.repeat(200)]){
  const r=await render('evening','17:00',b=>air(b,180,desc));assert.match(r.text,/国标AQI 180/);assert.doesNotMatch(r.text,/空气优|PRIVATE|<b>/);
 }
});
test('wind uses official default km/h converted to m/s grade and clockwise 16-point direction',async()=>{
 for(const [speed,direction,expected,unit] of [[18,225,'西南风3级',undefined],[0,0,'北风0级','metric'],[18,360,'北风3级','metric:v2'],[18,11.25,'北风3级','metric:v1'],[18,11.251,'北东北风3级','metric'],[18,348.75,'北西北风3级','metric'],[18,348.751,'北风3级','metric']]){
  const r=await render('evening','17:00',b=>{b.unit=unit;b.result.realtime.wind={speed,direction};});assert.ok(r.text.includes(expected),r.text);
 }
 const bounds=[0.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7,37,41.5,46.2,51,56.1];
 for(const [i,v] of bounds.entries())for(const delta of [-0.00001,0,0.00001]){
  const r=await render('evening','17:00',b=>{b.result.realtime.wind={speed:(v+delta)*3.6,direction:225};});assert.ok(r.text.includes('西南风'+(delta<0?i:i+1)+'级'),r.text);
 }
});
test('invalid wind or unsupported units omit wind rather than invent calm or direction',async()=>{
 for(const wind of [undefined,{}, {speed:null,direction:0},{speed:-1,direction:0},{speed:'18',direction:225},{speed:18,direction:361},{speed:18,direction:-1},{speed:18},{speed:Infinity,direction:0}]){
  const r=await render('evening','17:00',b=>b.result.realtime.wind=wind);assert.doesNotMatch(r.text,/风\d+级|无风/);
 }
 for(const unit of ['SI','imperial','unknown'])assert.doesNotMatch((await render('evening','17:00',b=>b.unit=unit)).text,/风\d+级|无风/);
});
test('UV only highlights documented strong realtime index at 7, missing invalid or daily-like 4 stays quiet',async()=>{
 for(const [index,show] of [[6.99,false],[7,true],[10,true],[11,true],[0,false],[null,false],['7',false],[undefined,false],[-1,false],[12,false]]){
  const r=await render('noon','12:00',b=>b.result.realtime.life_index.ultraviolet={index,desc:'PRIVATE'});
  if(show)assert.match(r.text,/紫外线强，注意防晒/);else assert.doesNotMatch(r.text,/紫外线强，注意防晒/);assert.doesNotMatch(r.text,/PRIVATE/);
 }
 for(const edit of [b=>delete b.result.realtime.life_index,b=>b.result.realtime.life_index={status:'denied',ultraviolet:{index:7}},b=>b.result.realtime.life_index.ultraviolet={status:'denied',index:7}])assert.doesNotMatch((await render('noon','12:00',edit)).text,/紫外线强/);
});
test('high humidity is contextual at 90 percent with rain or strong wind, not routine clutter',async()=>{
 for(const [humidity,probability,speed,show] of [[0.9,70,18,true],[0.899,70,18,false],[0.9,0,18,false],[0.9,0,39,true],[0,70,18,false],[1,70,18,true],[1.1,70,18,false],[null,70,18,false],['0.95',70,18,false]]){
  const r=await render('evening','17:00',b=>{b.result.realtime.humidity=humidity;b.result.realtime.wind={speed,direction:225};b.result.hourly.precipitation.forEach(x=>x.probability=probability);});
  if(show)assert.match(r.text,/高湿\d+%/);else assert.doesNotMatch(r.text,/高湿/);
 }
});
test('display remains layered compact warning-first and observation-unknown without extra APIs or night changes',async()=>{
 for(const [scene,time] of [['morning','07:30'],['noon','12:00'],['evening','17:00']]){
  const r=await render(scene,time,b=>{air(b,25);delete b.result.realtime.obsTime;b.result.realtime.wind={speed:18,direction:225};b.result.realtime.humidity=0.95;b.result.realtime.life_index.ultraviolet={index:7};b.result.alert.content=[{alertId:'safe',status:'alerting',code:'0202',title:'测试',description:'测试',pubtimestamp:b.server_time-60}];});
  const body=r.notices[0][2];assert.match(body,/^⚠️.*官方预警/);assert.match(body,/空气优 国标AQI 25 · 西南风3级\n紫外线强，注意防晒 · 高湿95%/);assert.ok(body.indexOf('建议带伞')<body.indexOf('国标AQI'));assert.ok(body.indexOf('国标AQI')<body.indexOf(time+' 22.3'));assert.match(body,/观测时间：未知，无法判断新鲜度/);assert.doesNotMatch(body,/PM2.5|PM10|日出|日落|实时验证/);assert.ok(body.length<550,body.length);assert.equal(r.requests.length,1);
 }
 const night=await render('night','20:30',b=>{air(b,25);b.result.realtime.life_index.ultraviolet={index:7};},true);assert.doesNotMatch(night.text,/国标AQI|紫外线强/);
});
