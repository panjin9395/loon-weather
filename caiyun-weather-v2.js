// Release 2026.10-frontier.1. Based on Peng-YM caiyun.js; author credit retained.
/**
彩云天气 v0.1 alpha
@author: Peng-YM
更新地址：https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js
 *
功能：
√ 自动定位
√ 异常天气预警
√ 实时天气预报

TODO:
- 降雨提醒
- 通勤外出参考（不推送睡前明日摘要）

配置：
1️⃣ 配置自动定位
根据平台添加如下配置
(1). Quantumult X
[MITM]
hostname=weather-data.apple.com, api.weather.com
[rewrite_local]
https:\/\/((weather-data\.apple)|(api.weather))\.com url script-request-header https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js

(2). Loon
[MITM]
hostname=weather-data.apple.com, api.weather.com
[Script]
http-request https:\/\/((weather-data\.apple)|(api.weather))\.com script-path=https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js, require-body=false

(3). Surge
[MITM]
hostname=weather-data.apple.com, api.weather.com
[Script]
type=http-request, pattern=https:\/\/((weather-data\.apple)|(api.weather))\.com, script-path=https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js, require-body=false
2️⃣ 打开手机设置 > 隐私 > 定位服务
(1) 打开定位服务
(2) 选择天气，设置永远允许天气访问位置信息，并允许使用精确位置。
此时，打开系统天气应用，会提示获取位置成功，如果没有提示，请确认1️⃣是否配置正确。
3️⃣ 配置cron任务如：10 8-22/2 * * *
4️⃣ 打开box.js设置彩云令牌(不是链接！！！）即可。
*/

/********************** SCRIPT START *********************************/
const $ = API("caiyun");
const ERR = MYERR();

let display_location = $.read("display_location");
if (display_location === undefined) {
  display_location = false;
} else {
  display_location = JSON.parse(display_location);
}

if (typeof $request !== "undefined") {
  // get location from request url
  const url = $request.url;
  const res =
    url.match(/weather\/.*?\/(.*)\/(.*)\?/) ||
    url.match(/geocode\/([0-9.]*)\/([0-9.]*)\//) ||
    url.match(/geocode=([0-9.]*),([0-9.]*)/) ||
    url.match(/v2\/availability\/([0-9.]*)\/([0-9.]*)\//);
  if (res === null) {
    $.info(`❌ 正则表达式匹配错误，🥬 无法从URL: ${url} 获取位置。`);
    $.done({ body: $request.body });
  }
  const location = {
    latitude: res[1],
    longitude: res[2],
  };
  if (!$.read("location")) {
    $.notify("[彩云天气]", "", "🎉🎉🎉 获取定位成功。");
  }
  if (display_location) {
    $.info(
      `成功获取当前位置：纬度 ${location.latitude} 经度 ${location.longitude}`
    );
  }

  $.write(res[1], "#latitude");
  $.write(res[2], "#longitude");

  $.write(location, "location");
  $.done({ body: $request.body });
} else {
  // this is a task
  !(async () => {
    const { caiyun, tencent } = $.read("token") || {};

    if (!caiyun) {
      throw new ERR.TokenError("❌ 未找到彩云Token令牌");
    } else if (caiyun.indexOf("http") !== -1) {
      throw new ERR.TokenError("❌ Token令牌 并不是 一个链接！");
    } else if (!$.read("location")) {
      // no location
      if (backgroundQuiet() || typeof $argument === 'string' && $argument === 'scene=noon') return;
      $.notify(
        "[彩云天气]",
        "❌ 未找到定位",
        "🤖 您可能没有正确设置MITM，请检查重写是否成功。"
      );
    } else {
      await scheduler();
    }
  })()
    .catch((err) => {
      recordFailure(err instanceof ERR.TokenError ? '认证配置' : $.failureKind || '网络/服务未知');
      if (backgroundQuiet()) return;
      if (typeof $argument === 'string' && /(?:^|&)scene=noon(?:&|$)/.test($argument) && !/(?:^|&)preview=1(?:&|$)/.test($argument)) return;
      const arg = typeof $argument === 'string' ? $argument : '';
      const manual = /(?:^|&)preview=1(?:&|$)/.test(arg) || !/(?:^|&)scene=(morning|noon|evening|night)(?:&|$)/.test(arg);
      if (manual && $.diagnosticWeather) {
        $.notify('[彩云天气 时间核验版]', '手动能力诊断（天气查询失败）', capabilitySummary($.diagnosticWeather, Date.now()) + '\n本次未使用旧天气；未展示原始接口错误。');
        return;
      }
      if (err instanceof ERR.TokenError)
        $.notify(
          "[彩云天气]",
          err.message,
          "请到彩云官方开放平台申请个人凭证，并确认 v2.6 综合天气及预警权限；预警属于增值服务。凭证仅保存在本机 BoxJS，勿公开。",
          {
            "open-url": "https://platform.caiyunapp.com/",
          }
        );
      else $.notify("[彩云天气]", "❌ 天气查询失败", "请检查网络、令牌权限或已保存经纬度。本次未使用旧天气；位置设置仍保留。为保护隐私，不展示原始接口错误。");
    })
    .finally(() => $.done());
}

// Phone-local health ledger: fixed labels only, no upstream messages or location.
function healthState() {
  try { const s=JSON.parse($.read('#caiyun_health_v1') || '{}'); return s && typeof s==='object' ? s : {}; } catch (_) { return {}; }
}
function recordFailure(kind) {
  const state=healthState();
  state.streak=(Number.isSafeInteger(state.streak) ? state.streak : 0)+1;
  state.kind=kind;
  const arg=typeof $argument==='string' ? $argument : '';
  const time=new Date(Date.now()+28800000).toISOString().slice(11,16);
  const fixed=['07:30','12:00','17:00'].includes(time) &&
    (/(?:^|&)mode=base(?:&|$)/.test(arg) || /(?:^|&)scene=(morning|noon|evening)(?:&|$)/.test(arg));
  const preview=/(?:^|&)preview=1(?:&|$)/.test(arg);
  const day=shanghaiDate(Date.now());
  if (fixed && !preview && state.notifiedDay!==day && (state.streak>=3 || /预算|认证|额度|限流|权限/.test(kind))) {
    state.notifiedDay=day;
    $.notify('⚠️彩云天气服务提示',kind+' · 连续失败'+state.streak+'次',
      '本次未取得可用天气；不使用旧天气。请检查网络、本机预算或彩云官方开放平台的个人凭证、额度与权限。429可能是额度或限流，并不代表令牌失效。每日最多一次，恢复后复位。');
  }
  $.write(JSON.stringify(state),'#caiyun_health_v1');
}
function classifyFailure(code, body) {
  const error=body && typeof body.error==='string' ? body.error.trim().toLowerCase() : '';
  if (error==='token is invalid' || error==='token disabled') return '认证失败';
  if (code===401 || code===403) return '权限/访问限制未知';
  if (code===429) return /quota|credit|balance|额度/.test(error) ? '额度不足' : '额度/限流未知';
  return '响应/权限未知';
}
function backgroundQuiet() {
  const a=typeof $argument === 'string' ? $argument : '';
  return /(?:^|&)mode=(base|extra)(?:&|$)/.test(a) && !/(?:^|&)preview=1(?:&|$)/.test(a);
}
function baseSlots() {
  return Array.from({length:24}, (_,h) => h === 7 ? '07:30' : String(h).padStart(2,'0') + ':00');
}
function budgetState() {
  let state;
  try { state = JSON.parse($.read('#caiyun_budget_v1') || '{}'); } catch (_) { state = {}; }
  const date = shanghaiDate(Date.now());
  if (!state.day || state.day.date !== date) state.day = {date, used:0, extra:0, slots:{}};
  return state;
}
function saveBudget(state) {
  const value=JSON.stringify(state);
  $.write(value, '#caiyun_budget_v1');
  return $.read('#caiyun_budget_v1') === value;
}
function quotaLimit(state) {
  const q = $.read('quota');
  if (q === undefined || q === null) return {cap:27, remaining:Infinity};
  const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    Number.isFinite(Date.parse(x+'T00:00:00+08:00')) && shanghaiDate(Date.parse(x+'T00:00:00+08:00')) === x;
  const count = x => Number.isSafeInteger(x) && x >= 0;
  let amount, expiry;
  if (count(q.remaining) && date(q.expiry)) { amount=q.remaining; expiry=q.expiry; }
  else if (count(q.total) && date(q.start) && !('remaining' in q)) {
    if (q.start > state.day.date) return {cap:0,remaining:0};
    amount=q.total; expiry=shanghaiDate(Date.parse(q.start+'T00:00:00+08:00') + 364*86400000);
  } else return {cap:0,remaining:0};
  const signature=JSON.stringify(q);
  if (!state.quota || state.quota.signature !== signature) {
    state.quota={signature, baseline:('remaining' in q ? state.attempts || 0 : 0)};
  }
  const remaining=Math.max(0,amount - ((state.attempts || 0) - state.quota.baseline));
  const days=Math.round((Date.parse(expiry+'T00:00:00+08:00') - Date.parse(state.day.date+'T00:00:00+08:00'))/86400000)+1;
  if (days <= 0 || !remaining) return {cap:0,remaining:0};
  // Keep today's allocation stable as its attempts are debited; recompute tomorrow.
  if (state.day.quotaSignature !== signature) {
    state.day.quotaSignature=signature;
    state.day.cap=Math.min(27,Math.floor((remaining + state.day.used)/days));
  }
  return {cap:state.day.cap,remaining};
}
function trustedSnapshot() {
  const w=$.weather, r=w.result.realtime, now=Date.now();
  const observed=typeof r.obsTime === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(r.obsTime) ? Date.parse(r.obsTime) : NaN;
  if (r.status !== 'ok' || !Number.isFinite(r.temperature) || !Number.isFinite(observed) || now-observed>3600000 || observed-now>300000 ||
    !Number.isFinite(w.server_time) || Math.abs(now-w.server_time*1000)>3600000) return null;
  return {at:now,observed,temperature:r.temperature,rain:typeof r.skycon === 'string' && /RAIN|SNOW/.test(r.skycon)};
}
function rememberConditions(silent) {
  const state=budgetState(), now=Date.now(), snap=trustedSnapshot();
  const warnings=Number.isFinite($.weather.server_time) && Math.abs(now-$.weather.server_time*1000)<=3600000 ? activeWarnings(now) : null;
  const old=state.condition;
  const notices=[];
  state.changeCooldown=state.changeCooldown || {};
  if (snap && old && now > old.at && now-old.at<=2*3600000 && snap.observed>old.observed && snap.observed-old.observed<=2*3600000) {
    const delta=snap.temperature-old.temperature;
    const kind=delta<0?'observed-cooling':'observed-warming';
    if (Math.abs(delta)>=5 && !(state.changeCooldown[kind]>now-3*3600000)) {
      notices.push(`可信观测较相邻有效样本${delta<0?'降温':'升温'}${displayTemperature(Math.abs(delta))}°C（样本间隔≤2小时）`);
      state.changeCooldown[kind]=now;
    }
  }
  const h=$.weather.result.hourly || {};
  const freshServer=Number.isFinite($.weather.server_time) && now-$.weather.server_time*1000<=3600000 && $.weather.server_time*1000-now<=300000;
  const future=rows => freshServer && h.status==='ok' && Array.isArray(rows) ? rows.filter(x=>x && typeof x.datetime==='string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(x.datetime) && Date.parse(x.datetime)>=now && Date.parse(x.datetime)<now+3*3600000).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime)) : [];
  const temps=future(h.temperature).filter(x=>Number.isFinite(x.value));
  let forecastHazard=false;
  if (temps.length>1) {
    const low=temps.reduce((a,b)=>a.value<b.value?a:b), high=temps.reduce((a,b)=>a.value>b.value?a:b);
    const span=high.value-low.value, cooling=Date.parse(high.datetime)<Date.parse(low.datetime), kind=cooling?'forecast-cooling':'forecast-warming';
    if (span>=5) {
      forecastHazard=true;
      if (!(state.changeCooldown[kind]>now-3*3600000)) {
        notices.push(`预报变天提醒：未来3小时已提供时段预计${cooling?'降温':'升温'}${displayTemperature(span)}°C（${new Date(Math.min(Date.parse(low.datetime),Date.parse(high.datetime))+28800000).toISOString().slice(11,16)}–${new Date(Math.max(Date.parse(low.datetime),Date.parse(high.datetime))+28800000).toISOString().slice(11,16)}；非实时观测）`);
        state.changeCooldown[kind]=now;
      }
    }
  }
  const skies=future(h.skycon).map(x=>({at:Date.parse(x.datetime),kind:mapSkycon(x.value) ? /SNOW/.test(x.value)?'snow':/RAIN/.test(x.value)?'rain':'dry' : 'unknown'}));
  const probs=future(h.precipitation).filter(x=>Number.isFinite(x.probability) && x.probability>=0 && x.probability<=100);
  const nextSky=skies.find(x=>x.at>now), currentSky=skies.find(x=>x.at===now);
  const previous=state.forecastWet, recent=previous && now>previous.at && now-previous.at<=2*3600000;
  let wet='unknown', evidence='';
  if (nextSky) {
    wet=nextSky.kind;
    if (['rain','snow'].includes(wet) && (currentSky && currentSky.kind==='dry' || recent && previous.kind==='dry')) evidence=`逐小时天气由无雨转${wet==='snow'?'雪':'雨'}`;
  } else if (skies[0]) wet=skies[0].kind;
  const nextProbability=probs.find(x=>Date.parse(x.datetime)>now) || probs[0];
  const probability=nextProbability ? nextProbability.probability : null;
  if (!evidence && probability!==null && probability>=60 && recent && previous.probability!==null && previous.probability<60) evidence=`下一可用小时降水概率由${previous.probability}%升至${probability}%（阈值60%）`;
  const wetKind=wet==='snow'?'forecast-snow':'forecast-rain';
  if (evidence) {
    forecastHazard=true;
    if (!(state.changeCooldown[wetKind]>now-3*3600000)) {
      notices.push('预报变天提醒：'+evidence+'（带时区的未来小时；非实时降水）');
      state.changeCooldown[wetKind]=now;
    }
  }
  state.forecastWet={at:now,kind:wet,probability};
  $.changeText=notices.join('\n');
  const change=notices.length>0;
  if (snap) state.condition=snap;
  const untils=(warnings || []).map(a=>Math.min(now+2*3600000,a.expiretimestamp ? a.expiretimestamp*1000 : now+2*3600000));
  if (forecastHazard) untils.push(now+2*3600000);
  if (snap && snap.rain) untils.push(snap.observed+2*3600000);
  state.hazardUntil=untils.length ? Math.max(...untils) : 0;
  saveBudget(state);
  return silent && change;
}
function reserveAttempt() {
  const state = budgetState(), c = $.runContext;
  const formal = !c.preview && c.mode !== 'extra';
  const slot = formal && (c.mode === 'base' || c.scenes[c.time] === c.scene) ? c.time : null;
  if (slot && state.day.slots[slot]) return false;
  if (c.mode === 'extra' && (state.day.extraSlots || {})[c.time]) return false;
  const limit = quotaLimit(state);
  const futureScenes = Object.keys(c.scenes).filter(t => t >= c.time && !state.day.slots[t]);
  const reserved = baseSlots().filter(t => t >= c.time && !state.day.slots[t]).length;
  const priority = !!slot && !!c.scenes[slot];
  const allowed = limit.remaining > 0 && state.day.used < limit.cap &&
    (!formal || state.day.used-state.day.extra < 24) &&
    (priority || formal && limit.cap - state.day.used > futureScenes.length ||
      !formal && state.day.extra < 3 && limit.cap - state.day.used > reserved);
  if (!allowed) {
    recordFailure('本地预算不足');
    if (c.preview) $.notify('[彩云天气 时间核验版]', '本地估算预算不足', '未请求天气；保留正式场景额度。本地估算不等于平台实际计费。');
    return false;
  }
  if (slot) state.day.slots[slot] = true;
  if (c.mode === 'extra') { state.day.extraSlots=state.day.extraSlots || {}; state.day.extraSlots[c.time]=true; }
  if (!formal) state.day.extra++;
  state.day.used++;
  state.attempts = (state.attempts || 0) + 1;
  if (!saveBudget(state)) return false;
  $.budgetText = `本地估算：今日尝试${state.day.used}/${limit.cap}，机动${state.day.extra}/3；非平台计费次数`;
  return true;
}

async function scheduler() {
  const now = new Date();
  $.log(
    `Scheduler activated at ${now.getMonth() + 1
    }月${now.getDate()}日${now.getHours()}时${now.getMinutes()}分`
  );
  const arg = typeof $argument === 'string' ? $argument : '';
  const scene = (arg.match(/(?:^|&)scene=(morning|noon|evening|night)(?:&|$)/) || [])[1];
  const mode = (arg.match(/(?:^|&)mode=(base|extra)(?:&|$)/) || [])[1];
  const time = new Date(Date.now() + 28800000).toISOString().slice(11,16);
  const scenes = {'07:30':'morning','12:00':'noon','17:00':'evening'};
  const preview = /(?:^|&)preview=1(?:&|$)/.test(arg) || !mode && !scene;
  $.runContext = {mode, scene, preview, time, scenes};
  if (mode === 'base' && !preview && !baseSlots().includes(time)) return;
  if (mode === 'extra' && (!['15','45'].includes(time.slice(3)) || time < '06:30' || time > '21:30' || !(budgetState().hazardUntil > Date.now()))) return;
  if (!await query()) return;
  const hour = Number(time.slice(0,2));
  const silent = mode === 'extra' || mode === 'base' && !scenes[time];
  const changed = !preview && rememberConditions(silent);
  if (silent && !preview) {
    sceneWeather('noon', false, changed, true);
  } else if (mode === 'base' && !preview) {
    sceneWeather(scenes[time]);
  } else sceneWeather(scene || (hour < 12 ? 'morning' : hour < 17 ? 'noon' : 'evening'), preview);
  // hourlyForcast();
  // dailyForcast();
}

async function query() {
  const location = $.read("location") || {};
  // Privacy: do not print coordinates.
  const isNumeric = input => (typeof input === 'number' || typeof input === 'string' && input.trim() !== '') && Number.isFinite(Number(input));
  if (!isNumeric(location.latitude) || !isNumeric(location.longitude)) {
    throw new Error("❌ 经纬度设置错误！");
  }

  if (Math.abs(Number(location.latitude)) > 90 || Math.abs(Number(location.longitude)) > 180) {
    throw new Error("❌ 经纬度设置错误，请重新获取有效定位。");
  }
  if (!reserveAttempt()) return false;
  // query API
  const url = `https://api.caiyunapp.com/v2.6/${$.read("token").caiyun}/${$.read("location").longitude
    },${$.read("location").latitude
    }/weather?lang=zh_CN&dailystart=0&hourlysteps=24&dailysteps=3&alert=true`;

  $.queriedAt = Date.now();
  $.log("Query weather...");

  const weather = await $.http.get({
    url,
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache",
      "User-Agent": "ColorfulCloudsPro/5.0.10 (iPhone; iOS 14.0; Scale/3.00)",
    },
  })
    .then((resp) => {
      let body;
      try { body=JSON.parse(resp.body); } catch (_) {
        $.failureKind=classifyFailure(resp.statusCode, null);
        throw new Error('WEATHER_RESPONSE_UNAVAILABLE');
      }
      $.diagnosticWeather = body && typeof body === 'object' ? body : {};
      if (resp.statusCode !== 200 || !body || body.status !== "ok" || !body.result || !body.result.realtime) {
        $.failureKind=classifyFailure(resp.statusCode,body);
        throw new Error("彩云接口未返回可用实时天气，请检查Token权限与接口响应");
      }
      return body;
    })
    .catch((err) => {
      throw err;
    });
  $.weather = weather;
  if (!weather.result.realtime.status || weather.result.realtime.status === 'ok') $.write(JSON.stringify({streak:0}),'#caiyun_health_v1');
  // Partial responses retain existing capability diagnostics; do not add a second card.
  $.alertUnavailable = !weather.result.alert || !Array.isArray(weather.result.alert.content);

  // Optional reverse geocoding; never block weather or reuse a stale street.
  let address = {city:"当前位置", district:"", street:""};
  const now = Date.now(), failedAt = Number($.read("map_failed_at") || 0);
  if (($.read("token") || {}).tencent && now - failedAt > 3600000) {
    try {
      const resp = await $.http.get(`https://apis.map.qq.com/ws/geocoder/v1/?key=${$.read("token").tencent}&location=${$.read("location").latitude},${$.read("location").longitude}`);
      const body = JSON.parse(resp.body);
      if (body.status !== 0 || !body.result || !body.result.address_component) throw new Error("MAP_UNAVAILABLE");
      const c = body.result.address_component;
      address = {city:c.city || "当前位置",district:c.district || "",street:""};
    } catch (_) {
      $.write(now,"map_failed_at");
      $.log("地图地名查询不可用，继续按已保存坐标播报；不代表彩云Token失效。");
    }
  }
  $.address = address;
  return true;
}

// Only official API records, with an identity, active status and explicit validity.
function activeWarnings(now, weather = $.weather) {
  const data = weather.result.alert;
  if (!data || data.status !== 'ok' || !Array.isArray(data.content) || data.content.length === 0 && data.adcodes === null) return null;
  return data.content.filter(a => a && typeof a.alertId === 'string' && a.alertId &&
    ['预警中','alerting'].includes(a.status) && (a.request_status === undefined || a.request_status === 'ok') && typeof a.title === 'string' && typeof a.description === 'string' &&
    /^\d{4}$/.test(a.code) && Number.isFinite(a.pubtimestamp) && a.pubtimestamp * 1000 <= now + 300000 &&
    (a.expiretimestamp === undefined || Number.isFinite(a.expiretimestamp) && a.expiretimestamp * 1000 > now));
}
// Display only, never used for warning identity or local advice. Bound before parsing.
function safeOfficialText(value, limit) {
  if (typeof value !== 'string') return '';
  const text = value.slice(0,12000).replace(/<(script|style|a)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi,' ')
    .replace(/(?:[a-z][a-z0-9+.-]*:\/*|www\.)[^\s<>]+/gi,' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/g,' ')
    .replace(/\s+/g,' ').trim();
  // Non-Chinese unstructured payload is not safe localized official guidance.
  if (!/[\u3400-\u9fff]/.test(text)) return '';
  return Array.from(text).slice(0,limit).join('') + (Array.from(text).length > limit ? '…' : '');
}
function warningSummary(warnings, preview) {
  const seen = $.read('scene_alerts_v1') || [];
  const fresh = (warnings || []).filter(a => !seen.includes(JSON.stringify([a.alertId,a.code,a.pubtimestamp,a.update_time || a.updated || ''])));
  if (!preview && fresh.length) {
    const keys = fresh.map(a => JSON.stringify([a.alertId,a.code,a.pubtimestamp,a.update_time || a.updated || '']));
    $.write(seen.concat(keys).slice(-200), 'scene_alerts_v1');
  }
  const labels = (warnings || []).slice(0,3).map(a => {
    const label = mapAlertCode(a.code);
    const name = label.includes('undefined') ? '官方气象预警（类型/等级未识别）' : label + '预警';
    const region = safeOfficialText(a.location || [a.province,a.city,a.county].filter(x => x && !['无','none'].includes(x)).join(''), 36);
    const published = new Date(a.pubtimestamp * 1000 + 28800000).toISOString().slice(5,16).replace('T',' ');
    const original = safeOfficialText(a.description,12000);
    const prevention = (original.match(/[^。！？]+[。！？]?/g) || []).find(s => /请|避免|远离|防范|防御|注意|停止|减少|不要/.test(s));
    const excerpt = safeOfficialText(prevention || original,100);
    return name + '\n发布地区：' + (region || '未知') + ' · 发布：' + published + '（北京时间）' +
      (excerpt ? '\n官方原文节选：' + excerpt : '\n官方原文节选：未提供可展示文字');
  });
  if (warnings && warnings.length > 3) labels.push('另有' + (warnings.length - 3) + '条预警未展开');
  if (warnings && warnings.length) labels.push('v2边界附近可能含邻区，请核对发布地区。');
  return {fresh, text:warnings === null ? '⚠️ 预警不可用，不能判断是否有预警。' :
    warnings.length ? (fresh.length ? '⚠️ 新增/更新官方预警：' : '⚠️ 持续预警：') + labels.join('；') : '本次未返回有效预警'};
}

function weatherTimes(weather, queriedAt, generatedAt) {
  const shift = Number.isFinite(weather.tzshift) ? weather.tzshift : 28800;
  const format = ms => new Date(ms + shift * 1000).toISOString().slice(0, 16).replace('T', ' ') +
    ' UTC' + (shift >= 0 ? '+' : '-') + String(Math.floor(Math.abs(shift) / 3600)).padStart(2, '0') + ':' + String(Math.floor(Math.abs(shift) % 3600 / 60)).padStart(2, '0');
  // Only explicit observation timestamps count as data time. server_time is NOT observation time.
  const raw = weather.result.realtime.obsTime;
  const observed = typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? Date.parse(raw) : NaN;
  let data = '数据更新时间：未知（上游未提供可验证的观测时间，无法判断新鲜度）';
  if (Number.isFinite(observed)) {
    const age = generatedAt - observed;
    data = '数据更新时间：' + format(observed) + '（上游obsTime）';
    if (age > 60 * 60 * 1000) data += '\n⚠️ 数据陈旧：距观测' + Math.floor(age / 60000) + '分钟（阈值60分钟）';
    if (age < -5 * 60 * 1000) data += '\n⚠️ 数据时间异常：晚于本次查询，请检查上游时间';
  }
  const server = Number(weather.server_time);
  if (Number.isFinite(server) && server > 0) {
    data += '\n接口响应时间：' + format(server * 1000) + '（非观测时间）';
    if (generatedAt - server * 1000 > 3600000) data += '\n⚠️ 接口响应陈旧：可能为上游或HTTP缓存，不能当实时数据';
  }
  return data + '\n查询时间：' + format(queriedAt) + '\n通知生成时间：' + format(generatedAt);
}

function realtimeWeather() {
  const data = $.weather.result;
  const address = $.address;

  const alert = data.alert && Array.isArray(data.alert.content) ? data.alert : { content: [] };
  const alertInfo =
    alert.content.length == 0
      ? ""
      : alert.content.reduce((acc, curr) => {
        if (curr.status === "预警中") {
          return acc + "\n" + mapAlertCode(curr.code) + "预警";
        } else {
          return acc;
        }
      }, "[预警]") + "\n\n";

  const realtime = data.realtime;
  const keypoint = data.forecast_keypoint;

  const hourly = data.hourly || {};

  let hourlySkycon = "[未来3小时]\n";
  for (let i = 0; i < Math.min(3, (hourly.skycon || []).length); i++) {
    const skycon = hourly.skycon[i];
    const dt = new Date(skycon.datetime);
    const now = dt.getHours() + 1;
    dt.setHours(dt.getHours() + 1);
    hourlySkycon +=
      `${now}-${dt.getHours() + 1}时 ${mapSkycon(skycon.value)[0]}` +
      (i == 2 ? "" : "\n");
  }

  $.notify(
    `[彩云天气 时间核验版] ${address.city} ${address.district} ${address.street}`,
    `${mapSkycon(realtime.skycon)[0]} ${realtime.temperature} ℃  🌤 空气质量 ${realtime.air_quality.description.chn
    }`,
    `🕒 ${weatherTimes($.weather, $.queriedAt, Date.now())}\n🔱 ${keypoint}
🌡 体感${realtime.life_index.comfort.desc} ${realtime.apparent_temperature
    } ℃  💧 湿度 ${(realtime.humidity * 100).toFixed(0)}%
🌞 紫外线 ${realtime.life_index.ultraviolet.desc} 💨 ${mapWind(
      realtime.wind.speed,
      realtime.wind.direction
    )}

${$.alertUnavailable ? "⚠️ 接口未提供预警数据，不能判断是否有预警。\n" : ""}${alertInfo}${hourlySkycon}
`,
    {
      "media-url": `${mapSkycon(realtime.skycon)[1]}`,
    }
  );
}

function shanghaiDate(ms) { return Number.isFinite(ms) ? new Date(ms + 28800000).toISOString().slice(0, 10) : ''; }
function forecastTemp(daily, day) {
  return daily.status === 'ok' && Array.isArray(daily.temperature) && daily.temperature.find(x => x &&
    /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(x.date) && shanghaiDate(Date.parse(x.date)) === day &&
    Number.isFinite(x.min) && Number.isFinite(x.max) && x.min <= x.max);
}
// Fixed-label diagnostics only: never echo upstream strings, URLs or locations.
function capabilitySummary(weather, now) {
  const result = weather.result || {};
  const denied = x => x && ['denied', 'permission_denied', 'forbidden'].includes(x.status);
  const state = (block, valid) => denied(weather) || denied(block) ? '缺权限（未知）' :
    weather.status !== 'ok' || !block || block.status !== 'ok' || !valid(block) ? '结构异常（未知；缺字段不等于缺权限）' : '可用';
  const dated = (rows, key, valid) => Array.isArray(rows) && rows.length > 0 && rows.every(x => x &&
    typeof x[key] === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(x[key]) && Number.isFinite(Date.parse(x[key])) && valid(x));
  const temperature = b => dated(b.temperature, 'datetime', x => Number.isFinite(x.value));
  const daily = b => dated(b.temperature, 'date', x => Number.isFinite(x.min) && Number.isFinite(x.max) && x.min <= x.max);
  let alert = state(result.alert, b => Array.isArray(b.content) && !(b.content.length === 0 && b.adcodes === null));
  if (alert === '可用') {
    const warnings = activeWarnings(now, weather);
    if (result.alert.content.length === 0) alert = '当前无有效预警（本次API，不保证当地无预警）';
    else if (!warnings.length) alert = '结构异常（未知；记录未通过有效性校验）';
  }
  return '能力摘要（本次响应，非购买凭证）\n实况：' + state(result.realtime, b => Number.isFinite(b.temperature) && typeof b.skycon === 'string' && !!mapSkycon(b.skycon)) +
    '\n逐小时：' + state(result.hourly, temperature) + '\n逐日：' + state(result.daily, daily) + '\n预警：' + alert;
}
function displayTemperature(value) { return String(Number(value.toFixed(1))); }
function notificationFooter(weather, queriedAt, now) {
  // Reuse the verified timestamp logic; retain every risk, omit redundant clocks.
  return weatherTimes(weather, queriedAt, now).split('\n').filter(line =>
    !line.startsWith('接口响应时间：') && !line.startsWith('通知生成时间：')).map(line =>
      line.startsWith('数据更新时间：未知') ? '观测时间：未知，无法判断新鲜度' :
      line.startsWith('数据更新时间：') ? line.replace('数据更新时间：','观测时间：').replace('（上游obsTime）','') : line).join('\n');
}
// Official metric wind is km/h; compare m/s thresholds in km/h to avoid rounding gaps.
function commuteWind(weather, r) {
  if (weather.unit !== undefined && !['metric','metric:v1','metric:v2'].includes(weather.unit)) return null;
  const w = r.wind;
  if (!w || w.status && w.status !== 'ok' || !Number.isFinite(w.speed) || w.speed < 0 || w.speed > 220.68 || !Number.isFinite(w.direction) || w.direction < 0 || w.direction > 360) return null;
  const thresholds = [0.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7,37,41.5,46.2,51,56.1];
  const grade = thresholds.filter(x => w.speed >= x * 3.6).length;
  const dirs = ['北','北东北','东北','东东北','东','东东南','东南','南东南','南','南西南','西南','西西南','西','西西北','西北','北西北'];
  const direction = dirs[Math.ceil((w.direction - 11.25) / 22.5 + 16) % 16];
  return {grade, text: direction + '风' + grade + '级'};
}
// Display-only: reuse the combined response, never participate in alert/budget state.
function commuteDetails(weather, rainRisk) {
  const r = weather.result.realtime;
  if (!r || r.status !== 'ok') return '';
  const air = r.air_quality, parts = [];
  if (air && (!air.status || air.status === 'ok')) {
    const aqi = air.aqi && air.aqi.chn;
    if (Number.isFinite(aqi) && aqi >= 0 && aqi <= 500) {
      const desc = air.description && air.description.chn;
      const labels = ['优','良','轻度污染','中度污染','重度污染','严重污染'];
      const expected = labels[[50,100,150,200,300,500].findIndex(limit => aqi <= limit)];
      const label = desc === expected ? '空气' + desc + ' ' : '';
      parts.push(label + '国标AQI ' + displayTemperature(aqi));
    }
  }
  const wind = commuteWind(weather, r);
  if (wind) parts.push(wind.text);
  const highlights = [], life = r.life_index;
  const uv = life && (!life.status || life.status === 'ok') && life.ultraviolet;
  if (uv && (!uv.status || uv.status === 'ok') && Number.isFinite(uv.index) && uv.index >= 7 && uv.index <= 11) highlights.push('紫外线强，注意防晒');
  if (Number.isFinite(r.humidity) && r.humidity >= 0.9 && r.humidity <= 1 && (rainRisk || wind && wind.grade >= 6)) highlights.push('高湿' + Math.round(r.humidity * 100) + '%');
  return [parts.join(' · '), highlights.join(' · ')].filter(Boolean).join('\n');
}
function comfortSummary(weather) {
  const r=weather.result.realtime || {}, valid=r.status==='ok';
  const metric=weather.unit===undefined || ['metric','metric:v1','metric:v2'].includes(weather.unit);
  const t=valid && metric && Number.isFinite(r.apparent_temperature) && r.apparent_temperature>=-100 && r.apparent_temperature<=80 ? r.apparent_temperature : null;
  const h=valid && Number.isFinite(r.humidity) && r.humidity>=0 && r.humidity<=1 ? r.humidity : null;
  const life=r.life_index, uv=valid && life && (!life.status || life.status==='ok') && life.ultraviolet;
  const u=uv && (!uv.status || uv.status==='ok') && Number.isInteger(uv.index) && uv.index>=0 && uv.index<=11 ? uv.index : null;
  const label=u===null ? '' : u===0 ? '无' : u<=2 ? '很弱' : u<=4 ? '弱' : u<=6 ? '中等' : u<=9 ? '强' : u<=10 ? '很强' : '极强';
  return (t===null ? '体感未知' : '体感'+displayTemperature(t)+'°C'+(t>=35?'（偏热）':t<=5?'（偏冷）':'')) +
    ' · ' + (h===null?'湿度未知':'湿度'+Math.round(h*100)+'%') + ' · ' + (u===null?'紫外线未知':'紫外线'+displayTemperature(u)+'（'+label+'）');
}
function sceneWeather(scene, manual = false, changed = false, silent = false) {
  const now = Date.now(), result = $.weather.result;
  const preview = manual || /(?:^|&)preview=1(?:&|$)/.test(typeof $argument === 'string' ? $argument : '');
  const diagnostic = preview ? capabilitySummary($.weather, now) + '\n' + ($.budgetText || '') + '\n' : '';
  silent = silent || !preview && (scene === 'night' || ($.read('scenes') || {})[scene] === false);
  const server = Number($.weather.server_time) * 1000;
  const stale = Number.isFinite(server) && server > 0 && (now - server > 3600000 || server - now > 300000);
  const warnings = stale ? null : activeWarnings(now), alert = warningSummary(warnings, preview);
  const footer = preview ? weatherTimes($.weather, $.queriedAt, now) : notificationFooter($.weather, $.queriedAt, now);
  if (silent && !preview) {
    if (alert.fresh.length || changed) $.notify('⚠️通勤天气提醒', alert.fresh.length ? '官方预警更新 · 留意通勤安全' : ($.changeText || '').includes('预报变天提醒') ? '预报变天提醒 · 非实时监测' : '可信天气明显变化 · 通勤参考', `${alert.text}\n${changed ? $.changeText + '\n生活建议，非官方预警。\n' : ''}\n${footer}`);
    return;
  }
  const today = shanghaiDate(now);
  const daily = result.daily || {};
  const temp = !stale && forecastTemp(daily, today);
  const range = temp ? `今日最低/最高：${displayTemperature(temp.min)}～${displayTemperature(temp.max)}°C` : '今日预报不可用（缺数据或权限）';
  const hourly = result.hourly || {};
  const future = rows => !stale && hourly.status === 'ok' && Array.isArray(rows) ? rows.filter(x => {
    if (!x || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(x.datetime)) return false;
    const t = Date.parse(x.datetime); return t >= now && t < now + 3 * 3600000;
  }).sort((a,b) => Date.parse(a.datetime) - Date.parse(b.datetime)) : [];
  const points = future(hourly.precipitation).filter(x => typeof x.probability === 'number' && x.probability >= 0 && x.probability <= 100);
  const p = !stale && points.length ? Math.max(...points.map(x => x.probability)) : null;
  const rainThreshold = Number($.read('umbrella_probability_threshold'));
  const advice = p === null ? '无法判断带伞' : p >= (rainThreshold > 0 && rainThreshold <= 100 ? rainThreshold : 40) ? '建议带伞' : '可不带伞，留意变化';
  const rain = p === null ? '未来3小时降雨概率不可用（缺数据或权限）；无法据此判断带伞' : `未来3小时最高降雨概率：${p}%；${advice}（已提供时段）`;
  const temperatures = future(hourly.temperature).filter(x => Number.isFinite(x.value)).slice(0,3);
  const trend = temperatures.length > 1 ? (temperatures[temperatures.length-1].value < temperatures[0].value ? '降温' : temperatures[temperatures.length-1].value > temperatures[0].value ? '升温' : '温度平稳') : '温度趋势不可用';
  const hours = temperatures.map(x => {
    const sky = future(hourly.skycon).find(s => Date.parse(s.datetime) === Date.parse(x.datetime));
    return new Date(Date.parse(x.datetime) + 28800000).toISOString().slice(11,16) + ` ${displayTemperature(x.value)}°C ${sky && mapSkycon(sky.value) ? mapSkycon(sky.value)[0] : '天气状况未提供'}`;
  });
  const hourlyText = hours.length ? hours.join('\n') : '逐小时温度/天气不可用（缺数据或权限）';
  let body = `${range}\n${rain}\n\n${hourlyText}`;
  if (scene === 'morning' || scene === 'evening' || scene === 'noon') {
    const change = temperatures.length > 1 ? `未来3小时：${displayTemperature(temperatures[0].value)} → ${displayTemperature(temperatures[temperatures.length-1].value)}°C（${trend}；已提供时段）` : '未来3小时温度趋势不可用（缺数据或权限）';
    const details = !stale ? commuteDetails($.weather, p !== null && p >= (rainThreshold > 0 && rainThreshold <= 100 ? rainThreshold : 40)) : '';
    body = `${scene === 'morning' ? range + '\n' : ''}${change}\n${rain}\n${trend === '降温' ? '降温，酌情添衣' : temperatures.length > 1 ? '按体感调整衣着' : '温度趋势不足，无法据此判断添衣'}${details ? '\n' + details : ''}\n\n${hourlyText}`;
    body += '\n' + comfortSummary($.weather);
  }
  if (scene === 'night') {
    const tomorrow = shanghaiDate(now + 86400000);
    const next = !stale && forecastTemp(daily, tomorrow);
    body = next ? `明日最低/最高：${displayTemperature(next.min)}～${displayTemperature(next.max)}°C` : '明日预报不可用（缺数据或权限），不以今日代替';
    if (temp && next) {
      const delta = (next.min + next.max - temp.min - temp.max) / 2;
      const threshold = Number($.read('temp_change_threshold'));
      body += displayTemperature(Math.abs(delta)) === '0' ? '\n日均温（每日最低与最高的均值）较今天基本持平' : `\n日均温（每日最低与最高的均值）较今天${Math.abs(delta) >= (threshold > 0 && threshold <= 30 ? threshold : 5) ? '明显' : ''}${delta < 0 ? '降温' : '升温'}${displayTemperature(Math.abs(delta))}°C`;
    } else body += '\n缺同口径日温度，无法比较升降温';
  }
  if (stale) body = '⚠️ 预报已降级：接口响应陈旧或时间异常，不生成出行/温差建议。';
  const denied = block => block && ['denied','permission_denied','forbidden'].includes(block.status);
  const permissions = [[result.realtime,'实况'],[result.hourly,'逐小时'],[result.daily,'逐日'],[result.alert,'预警']].filter(([block]) => denied(block)).map(([,label]) => label + '缺权限').join('；');
  if (permissions) body += '\n' + permissions + '（未知）';
  const city = $.address && $.address.city;
  const safeCity = typeof city === 'string' && city !== '当前位置' && /^[\u3400-\u9fffA-Za-z· ]{2,24}$/.test(city) ? ' · ' + city : '';
  const title = {morning:'🌅上班通勤',noon:'☀️午间外出',evening:'🌆下班通勤',night:'🌙明日天气'}[scene] + safeCity + (preview ? ' · 预览' : '');
  const subtitle = stale ? '数据陈旧或时间异常 · 预报已降级' : warnings && warnings.length ? '官方预警 · 请留意出行' :
    {morning:'今天出门 · ' + trend + ' · ' + advice,noon:'午间通勤/外出参考 · ' + trend + ' · ' + advice,evening:trend + ' · ' + advice,night:'明日预报 · 同口径温差'}[scene];
  if (warnings && warnings.length) body = '本地出行建议（非官方预警）：\n' + body;
  const warningTop = warnings && warnings.length ? alert.text + '\n\n' : '';
  $.notify(title, subtitle, `${warningTop}${body}${warningTop ? '' : '\n' + alert.text}\n\n${preview ? '手动预览（不写去重状态）\n' + diagnostic : ''}${footer}`);
}

function dailyForcast() { }

/************************** 天气对照表 *********************************/

function mapAlertCode(code) {
  const names = {
    "01": "🌪 台风",
    "02": "⛈ 暴雨",
    "03": "❄️ 暴雪",
    "04": "❄ 寒潮",
    "05": "💨 大风",
    "06": "💨 沙尘暴",
    "07": "☄️ 高温",
    "08": "☄️ 干旱",
    "09": "⚡️ 雷电",
    "10": "💥 冰雹",
    "11": "❄️ 霜冻",
    "12": "💨 大雾",
    "13": "💨 霾",
    "14": "❄️ 道路结冰",
    "15": "🔥 森林火灾",
    "16": "⛈ 雷雨大风",
    "17": "💨 春季沙尘天气趋势",
    "18": "💨 沙尘",
  };

  const intensity = {
    "00": "白色",
    "01": "蓝色",
    "02": "黄色",
    "03": "橙色",
    "04": "红色",
  };

  const res = code.match(/(\d{2})(\d{2})/);
  return `${names[res[1]]}${intensity[res[2]]}`;
}

function mapWind(speed, direction) {
  let description = "";
  let d_description = "";

  if (speed < 1) {
    description = "无风";
    return description;
  } else if (speed <= 5) {
    description = "1级 微风徐徐";
  } else if (speed <= 11) {
    description = "2级 清风";
  } else if (speed <= 19) {
    description = "3级 树叶摇摆";
  } else if (speed <= 28) {
    description = "4级 树枝摇动";
  } else if (speed <= 38) {
    description = "5级 风力强劲";
  } else if (speed <= 49) {
    description = "6级 风力强劲";
  } else if (speed <= 61) {
    description = "7级 风力超强";
  } else if (speed <= 74) {
    description = "8级 狂风大作";
  } else if (speed <= 88) {
    description = "9级 狂风呼啸";
  } else if (speed <= 102) {
    description = "10级 暴风毁树";
  } else if (speed <= 117) {
    description = "11级 暴风毁树";
  } else if (speed <= 133) {
    description = "12级 飓风";
  } else if (speed <= 149) {
    description = "13级 台风";
  } else if (speed <= 166) {
    description = "14级 强台风";
  } else if (speed <= 183) {
    description = "15级 强台风";
  } else if (speed <= 201) {
    description = "16级 超强台风";
  } else if (speed <= 220) {
    description = "17级 超强台风";
  }

  if (direction >= 348.76 || direction <= 11.25) {
    d_description = "北";
  } else if (direction >= 11.26 && direction <= 33.75) {
    d_description = "北东北";
  } else if (direction >= 33.76 && direction <= 56.25) {
    d_description = "东北";
  } else if (direction >= 56.26 && direction <= 78.75) {
    d_description = "东东北";
  } else if (direction >= 78.76 && direction <= 101.25) {
    d_description = "东";
  } else if (direction >= 101.26 && direction <= 123.75) {
    d_description = "东东南";
  } else if (direction >= 123.76 && direction <= 146.25) {
    d_description = "东南";
  } else if (direction >= 146.26 && direction <= 168.75) {
    d_description = "南东南";
  } else if (direction >= 168.76 && direction <= 191.25) {
    d_description = "南";
  } else if (direction >= 191.26 && direction <= 213.75) {
    d_description = "南西南";
  } else if (direction >= 213.76 && direction <= 236.25) {
    d_description = "西南";
  } else if (direction >= 236.26 && direction <= 258.75) {
    d_description = "西西南";
  } else if (direction >= 258.76 && direction <= 281.25) {
    d_description = "西";
  } else if (direction >= 281.26 && direction <= 303.75) {
    d_description = "西西北";
  } else if (direction >= 303.76 && direction <= 326.25) {
    d_description = "西北";
  } else if (direction >= 326.26 && direction <= 348.75) {
    d_description = "北西北";
  }

  return `${d_description}风 ${description}`;
}

// 天气状况 --> 自然语言描述
// icon来源：github@58xinian
function mapSkycon(skycon) {
  const map = {
    CLEAR_DAY: [
      "☀️ 日间晴朗",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_DAY.gif",
    ],
    CLEAR_NIGHT: [
      "✨ 夜间晴朗",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_NIGHT.gif",
    ],
    PARTLY_CLOUDY_DAY: [
      "⛅️ 日间多云",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_DAY.gif",
    ],
    PARTLY_CLOUDY_NIGHT: [
      "☁️ 夜间多云",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_NIGHT.gif",
    ],
    CLOUDY: [
      "☁️ 阴",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLOUDY.gif",
    ],
    LIGHT_HAZE: [
      "😤 轻度雾霾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    MODERATE_HAZE: [
      "😤 中度雾霾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    HEAVY_HAZE: [
      "😤 重度雾霾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    LIGHT_RAIN: [
      "💧 小雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT.gif",
    ],
    MODERATE_RAIN: [
      "💦 中雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_RAIN.gif",
    ],
    HEAVY_RAIN: [
      "🌧 大雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/STORM_RAIN.gif",
    ],
    STORM_RAIN: [
      "⛈ 暴雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/STORM_RAIN.gif",
    ],
    LIGHT_SNOW: [
      "🌨 小雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_SNOW.gif",
    ],
    MODERATE_SNOW: [
      "❄️ 中雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_SNOW.gif",
    ],
    HEAVY_SNOW: [
      "☃️ 大雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_SNOW.gif",
    ],
    STORM_SNOW: [
      "⛄️暴雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_SNOW",
    ],
    FOG: ["🌫️ 雾"],
    DUST: ["💨 浮尘"],
    SAND: ["💨 沙尘"],
    WIND: ["🌪 大风"],
  };
  return map[skycon];
}

// 雷达降 水/雪 强度 --> skycon
function mapPrecipitation(intensity) {
  if (0.031 < intensity && intensity < 0.25) {
    return "LIGHT";
  } else if (intensity < 0.35) {
    return "MODERATE";
  } else if (intensity < 0.48) {
    return "HEADY";
  } else if (intensity >= 0.48) {
    return "STORM";
  }
}

function mapIntensity(breakpoints) { }

/************************** ERROR *********************************/
function MYERR() {
  class TokenError extends Error {
    constructor(message) {
      super(message);
      this.name = "TokenError";
    }
  }

  return {
    TokenError,
  };
}

// prettier-ignore
/*********************************** API *************************************/
function ENV() { const e = "undefined" != typeof $task, t = "undefined" != typeof $loon, s = "undefined" != typeof $httpClient && !t, i = "function" == typeof require && "undefined" != typeof $jsbox; return { isQX: e, isLoon: t, isSurge: s, isNode: "function" == typeof require && !i, isJSBox: i, isRequest: "undefined" != typeof $request, isScriptable: "undefined" != typeof importModule } } function HTTP(e = { baseURL: "" }) { const { isQX: t, isLoon: s, isSurge: i, isScriptable: n, isNode: o } = ENV(), r = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/; const u = {}; return ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(l => u[l.toLowerCase()] = (u => (function (u, l) { l = "string" == typeof l ? { url: l } : l; const h = e.baseURL; h && !r.test(l.url || "") && (l.url = h ? h + l.url : l.url); const a = (l = { ...e, ...l }).timeout, c = { onRequest: () => { }, onResponse: e => e, onTimeout: () => { }, ...l.events }; let f, d; if (c.onRequest(u, l), t) f = $task.fetch({ method: u, ...l }); else if (s || i || o) f = new Promise((e, t) => { (o ? require("request") : $httpClient)[u.toLowerCase()](l, (s, i, n) => { s ? t(s) : e({ statusCode: i.status || i.statusCode, headers: i.headers, body: n }) }) }); else if (n) { const e = new Request(l.url); e.method = u, e.headers = l.headers, e.body = l.body, f = new Promise((t, s) => { e.loadString().then(s => { t({ statusCode: e.response.statusCode, headers: e.response.headers, body: s }) }).catch(e => s(e)) }) } const p = a ? new Promise((e, t) => { d = setTimeout(() => (c.onTimeout(), t(`${u} URL: ${l.url} exceeds the timeout ${a} ms`)), a) }) : null; return (p ? Promise.race([p, f]).then(e => (clearTimeout(d), e)) : f).then(e => c.onResponse(e)) })(l, u))), u } function API(e = "untitled", t = !1) { const { isQX: s, isLoon: i, isSurge: n, isNode: o, isJSBox: r, isScriptable: u } = ENV(); return new class { constructor(e, t) { this.name = e, this.debug = t, this.http = HTTP(), this.env = ENV(), this.node = (() => { if (o) { return { fs: require("fs") } } return null })(), this.initCache(); Promise.prototype.delay = function (e) { return this.then(function (t) { return ((e, t) => new Promise(function (s) { setTimeout(s.bind(null, t), e) }))(e, t) }) } } initCache() { if (s && (this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}")), (i || n) && (this.cache = JSON.parse($persistentStore.read(this.name) || "{}")), o) { let e = "root.json"; this.node.fs.existsSync(e) || this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.root = {}, e = `${this.name}.json`, this.node.fs.existsSync(e) ? this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`)) : (this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.cache = {}) } } persistCache() { const e = JSON.stringify(this.cache, null, 2); s && $prefs.setValueForKey(e, this.name), (i || n) && $persistentStore.write(e, this.name), o && (this.node.fs.writeFileSync(`${this.name}.json`, e, { flag: "w" }, e => console.log(e)), this.node.fs.writeFileSync("root.json", JSON.stringify(this.root, null, 2), { flag: "w" }, e => console.log(e))) } write(e, t) { if (this.log(`SET ${t}`), -1 !== t.indexOf("#")) { if (t = t.substr(1), n || i) return $persistentStore.write(e, t); if (s) return $prefs.setValueForKey(e, t); o && (this.root[t] = e) } else this.cache[t] = e; this.persistCache() } read(e) { return this.log(`READ ${e}`), -1 === e.indexOf("#") ? this.cache[e] : (e = e.substr(1), n || i ? $persistentStore.read(e) : s ? $prefs.valueForKey(e) : o ? this.root[e] : void 0) } delete(e) { if (this.log(`DELETE ${e}`), -1 !== e.indexOf("#")) { if (e = e.substr(1), n || i) return $persistentStore.write(null, e); if (s) return $prefs.removeValueForKey(e); o && delete this.root[e] } else delete this.cache[e]; this.persistCache() } notify(e, t = "", l = "", h = {}) { const a = h["open-url"], c = h["media-url"]; if (s && $notify(e, t, l, h), n && $notification.post(e, t, l + `${c ? "\n多媒体:" + c : ""}`, { url: a }), i) { let s = {}; a && (s.openUrl = a), c && (s.mediaUrl = c), "{}" === JSON.stringify(s) ? $notification.post(e, t, l) : $notification.post(e, t, l, s) } if (o || u) { const s = l + (a ? `\n点击跳转: ${a}` : "") + (c ? `\n多媒体: ${c}` : ""); if (r) { require("push").schedule({ title: e, body: (t ? t + "\n" : "") + s }) } else console.log(`${e}\n${t}\n${s}\n\n`) } } log(e) { this.debug && console.log(`[${this.name}] LOG: ${this.stringify(e)}`) } info(e) { console.log(`[${this.name}] INFO: ${this.stringify(e)}`) } error(e) { console.log(`[${this.name}] ERROR: ${this.stringify(e)}`) } wait(e) { return new Promise(t => setTimeout(t, e)) } done(e = {}) { s || i || n ? $done(e) : o && !r && "undefined" != typeof $context && ($context.headers = e.headers, $context.statusCode = e.statusCode, $context.body = e.body) } stringify(e) { if ("string" == typeof e || e instanceof String) return e; try { return JSON.stringify(e, null, 2) } catch (e) { return "[object Object]" } } }(e, t) }
/*****************************************************************************/

