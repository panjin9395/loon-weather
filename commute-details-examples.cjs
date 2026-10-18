// Synthetic data only; uses the production script via existing VM harness.
const fs=require('node:fs');
const {render}=require('./notification.test.cjs');
(async()=>{
 const outputs=[];
 for(const [name,aqi,desc,extra] of [['普通空气/风况',25,'优',false],['污染/强UV/高湿',180,'中度污染',true],['缺空气/风况',null,null,false]]){
  const r=await render('evening','17:00',b=>{
   delete b.result.realtime.obsTime;
   b.result.realtime.air_quality=aqi===null?{}:{aqi:{chn:aqi,usa:999},description:{chn:desc}};
   b.result.realtime.wind=aqi===null?{}:{speed:18,direction:225};
   b.result.realtime.humidity=extra?0.95:0.5;
   b.result.realtime.life_index.ultraviolet={index:extra?7:3};
  });
  outputs.push('【合成样本：'+name+'；非手机/真实天气实测】\n'+r.notices[0].slice(0,3).join('\n')+'\n（通知正文'+r.notices[0][2].length+'字符；综合接口请求'+r.requests.length+'次）');
 }
 const output=outputs.join('\n\n');
 fs.writeFileSync('preview/commute-details-fixtures.txt',output+'\n');
 console.log(output);
})();
