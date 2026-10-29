// SPDX-License-Identifier: Apache-2.0
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=__dirname;
const read=n=>fs.readFileSync(`${root}/${n}`,'utf8');
const adapter=read('argument-adapter.js');
const upstream=read('upstream/iRingo.WeatherKit.lpx');
const plugin=read('WeatherKit.zh.lpx');
const section=(s,name)=>s.split(`[${name}]\n`)[1].split('\n[')[0].trim();
const argumentsOf=s=>Object.fromEntries(section(s,'Argument').split('\n').map(line=>{
 const [key,...rest]=line.split(' = '); const value=rest.join(' = ');
 return [key,{type:value.split(',')[0],values:[...value.matchAll(/"([^"]*)"/g)].map(m=>m[1])}];
}));
const original=argumentsOf(upstream), chinese=argumentsOf(plugin);
function adapt(value){const c={$argument:value};vm.runInNewContext(adapter,c);return c.$argument;}
test('全部下拉候选中文显示，一一还原原枚举，默认及顺序不变',()=>{
 assert.deepEqual(Object.keys(chinese),Object.keys(original));
 let count=0,controls=0;
 for(const [key,entry] of Object.entries(original)){
   const actual=chinese[key]; assert.equal(actual.type,entry.type);
   if(entry.type!=='select'){assert.deepEqual(actual.values,entry.values);continue;}
   controls++;assert.equal(actual.values.length,entry.values.length);
   actual.values.forEach((value,index)=>{
     count++;assert.match(value,/[\u3400-\u9fff]/);
     assert.equal(adapt({[key]:value})[key],entry.values[index]);
     const query=`${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
     assert.equal(new URLSearchParams(adapt(query)).get(key),entry.values[index]);
   });
 }
 assert.equal(controls,7);assert.equal(count,33);
});
test('对象、嵌套对象、旧英文、空值和未知值保持兼容，令牌不变',()=>{
 const c=adapt({Weather:{Provider:'彩云天气'},Storage:'插件参数优先',LogLevel:'警告','API.QWeather.Host':'devapi.qweather.com','API.QWeather.Token':'test+&=值'});
 assert.equal(c.Weather.Provider,'ColorfulClouds');assert.equal(c.Storage,'Argument');assert.equal(c.LogLevel,'WARN');
 assert.equal(c['API.QWeather.Host'],'devapi.qweather.com');assert.equal(c['API.QWeather.Token'],'test+&=值');
 for(const value of [undefined,null,'',{'Weather.Provider':'QWeather'},{'Weather.Provider':'未知数据源'}])
   assert.deepEqual(JSON.parse(JSON.stringify(adapt(value))||'null'),JSON.parse(JSON.stringify(value)||'null'));
 const q='Weather.Provider=%22%E5%BD%A9%E4%BA%91%E5%A4%A9%E6%B0%94%22&API.QWeather.Token=test%2B%26%3D%E5%80%BC&Unknown=%ZZ';
 assert.equal(adapt(q),'Weather.Provider=ColorfulClouds&API.QWeather.Token=test%2B%26%3D%E5%80%BC&Unknown=%ZZ');
 assert.equal(adapt('Weather[Provider]=彩云天气'),'Weather[Provider]=ColorfulClouds');
});
test('规则、解密、脚本匹配及参数传递原样保留，依赖仅改成本仓库固定构建',()=>{
 for(const s of ['Rule','MITM'])assert.equal(section(plugin,s),section(upstream,s));
 assert.equal(section(plugin,'Script').replaceAll('https://raw.githubusercontent.com/panjin9395/loon-weather/main/weatherkit-zh/request.zh.bundle.js','https://github.com/NSRingo/WeatherKit/releases/download/v3.3.2/request.bundle.js').replaceAll('https://raw.githubusercontent.com/panjin9395/loon-weather/main/weatherkit-zh/response.zh.bundle.js','https://github.com/NSRingo/WeatherKit/releases/download/v3.3.2/response.bundle.js'),section(upstream,'Script'));
 assert.ok(plugin.includes('#!author = VirgilClyne'));assert.ok(plugin.includes('devapi.qweather.com'));
 assert.ok(!plugin.includes('releases/latest'));assert.ok(!/\beval\s*\(|\$httpClient|fetch\(/.test(adapter));
});
test('发布脚本为适配器前缀加原始官方bundle，官方字节与已审SHA256一致',()=>{
 const hashes={request:'da05af299dd2172e1c25a2bff349cdda268114ee7fc43340cc48da29c76ea033',response:'ce1db90d77c44fce972db0c2e319845fc1d6a276d41d772c0294882e59d7f999'};
 for(const kind of ['request','response']){
   const official=fs.readFileSync(`${root}/upstream/${kind}.bundle.js`);
   assert.equal(crypto.createHash('sha256').update(official).digest('hex'),hashes[kind]);
   assert.equal(read(`${kind}.zh.bundle.js`),adapter+'\n'+official.toString());
 }
});
for(const format of ['object','string'])for(const kind of ['request','response'])test(`实际执行${kind}官方bundle：${format}中文参数、禁止联网、完成回调`,async()=>{
 const args=Object.fromEntries(Object.entries(chinese).map(([k,v])=>[k,v.values[0]]));
 args.Storage='插件参数优先';args.LogLevel='警告';
 const logs=[];const network=[];let doneCount=0;
 let resolveDone;const completed=new Promise(resolve=>resolveDone=resolve);
 const c={
   $loon:'3.5.1',$script:{startTime:Date.now()},
   $argument:format==='string'?new URLSearchParams(args).toString():args,
   $request:{url:kind==='request'?'https://weatherkit.apple.com/api/v1/airQualityScale/en/US.EPA_NowCast':'https://weatherkit.apple.com/api/v1/availability/37/-122',method:'GET',headers:{}},
   $response:{status:200,headers:{'Content-Type':'application/json'},body:JSON.stringify({availability:[]})},
   $persistentStore:{read:()=>null,write:()=>true},
   $httpClient:Object.fromEntries(['get','post','put','delete'].map(m=>[m,(...a)=>{network.push(m);throw new Error('NETWORK FORBIDDEN');}])),
   $done:result=>{doneCount++;resolveDone(result);},
   console:{log:(...a)=>logs.push(a.join(' '))},URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout
 };
 vm.runInNewContext(read(`${kind}.zh.bundle.js`),c,{timeout:5000});
 let timer;try{await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('no $done')),2000);})]);}finally{clearTimeout(timer);}
 assert.equal(doneCount,1);assert.deepEqual(network,[]);
 assert.equal(c.$argument.Weather.Provider,'ColorfulClouds');
 assert.equal(c.$argument.WeatherAlerts.Provider,'QWeatherWeb');
 assert.equal(c.$argument.AirQuality.Calculate.Algorithm,'EU_EAQI');
 assert.equal(c.$argument.Storage,'Argument');assert.equal(c.$argument.LogLevel,'WARN');
 assert.equal(c.$argument.API.QWeather.Host,'devapi.qweather.com');
 assert.ok(!logs.some(l=>l.includes('❌')),logs.join('\n'));
});
