// Release 2026.10-budget.1. Based on Peng-YM caiyun.js; author credit retained.
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
- 每日睡前预报

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
          "🤖 由于API Token具有时效性，请前往\nhttps://t.me/cool_scripts\n获取最新Token。",
          {
            "open-url": "https://t.me/cool_scripts",
          }
        );
      else $.notify("[彩云天气]", "❌ 天气查询失败", "请检查网络、令牌权限或已保存经纬度。本次未使用旧天气；位置设置仍保留。为保护隐私，不展示原始接口错误。");
    })
    .finally(() => $.done());
}

function backgroundQuiet() {
  const a=typeof $argument === 'string' ? $argument : '';
  return /(?:^|&)mode=(base|extra)(?:&|$)/.test(a) && !/(?:^|&)preview=1(?:&|$)/.test(a);
}
function baseSlots() {
  return Array.from({length:16}, (_,i) => String(i+6).padStart(2,'0') + ':30')
    .concat([7,8,9,12,16,17,18,20].map(h => String(h).padStart(2,'0') + ':00')).sort();
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
  const change=snap && old && now-old.at<=3*3600000 && (Math.abs(snap.temperature-old.temperature)>=5 || snap.rain!==old.rain);
  if (snap) state.condition=snap;
  const untils=(warnings || []).map(a=>Math.min(now+2*3600000,a.expiretimestamp ? a.expiretimestamp*1000 : now+2*3600000));
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
    (priority || formal && limit.cap - state.day.used > futureScenes.length ||
      !formal && state.day.extra < 3 && limit.cap - state.day.used > reserved);
  if (!allowed) {
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
  const scenes = {'07:30':'morning','12:00':'noon','17:00':'evening','20:30':'night'};
  const preview = /(?:^|&)preview=1(?:&|$)/.test(arg) || !mode && !scene;
  $.runContext = {mode, scene, preview, time, scenes};
  if (mode === 'base' && !preview && !baseSlots().includes(time)) return;
  if (mode === 'extra' && (!['15','45'].includes(time.slice(3)) || time < '06:30' || time > '21:30' || !(budgetState().hazardUntil > Date.now()))) return;
  if (!await query()) return;
  const hour = Number(time.slice(0,2));
  const silent = mode === 'extra' || mode === 'base' && !scenes[time];
  const changed = !preview && rememberConditions(silent);
  if (silent && !preview) {
    sceneWeather('noon', false, changed);
  } else if (mode === 'base' && !preview) {
    sceneWeather(scenes[time]);
  } else sceneWeather(scene || (hour < 12 ? 'morning' : hour < 17 ? 'noon' : hour < 20 ? 'evening' : 'night'), preview);
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
      const body = JSON.parse(resp.body);
      $.diagnosticWeather = body && typeof body === 'object' ? body : {};
      if (!body || body.status !== "ok" || !body.result || !body.result.realtime) {
        throw new Error("彩云接口未返回可用实时天气，请检查Token权限与接口响应");
      }
      return body;
    })
    .catch((err) => {
      throw err;
    });
  $.weather = weather;
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
function warningSummary(warnings, preview) {
  const seen = $.read('scene_alerts_v1') || [];
  const fresh = (warnings || []).filter(a => !seen.includes(JSON.stringify([a.alertId,a.code,a.pubtimestamp,a.update_time || a.updated || ''])));
  if (!preview && fresh.length) {
    const keys = fresh.map(a => JSON.stringify([a.alertId,a.code,a.pubtimestamp,a.update_time || a.updated || '']));
    $.write(seen.concat(keys).slice(-200), 'scene_alerts_v1');
  }
  return {fresh, text:warnings === null ? '⚠️ 接口未提供有效预警数据，不能判断是否有预警。' :
    warnings.length ? (fresh.length ? '新增/更新官方预警：' : '持续预警：') + warnings.map(a => a.title).join('；') : '本次API有效预警记录为空（不保证当地无预警）'};
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
function sceneWeather(scene, manual = false, changed = false) {
  const now = Date.now(), result = $.weather.result;
  const preview = manual || /(?:^|&)preview=1(?:&|$)/.test(typeof $argument === 'string' ? $argument : '');
  const diagnostic = preview ? capabilitySummary($.weather, now) + '\n' + ($.budgetText || '') + '\n' : '';
  if (($.read('scenes') || {})[scene] === false && !preview) return;
  const server = Number($.weather.server_time) * 1000;
  const stale = Number.isFinite(server) && server > 0 && (now - server > 3600000 || server - now > 300000);
  const warnings = stale ? null : activeWarnings(now), alert = warningSummary(warnings, preview);
  if (scene === 'noon') {
    if (alert.fresh.length || preview || changed) $.notify('[彩云天气 时间核验版]', preview ? '午间预览（不写去重状态）' : changed ? '可信天气明显变化' : '午间官方预警更新', `${diagnostic}${changed ? '可信观测较上次变化≥5°C或雨雪状态改变；请留意出行。\n' : ''}${alert.text}\n${alert.fresh.map(a => a.description).join('\n')}\n${weatherTimes($.weather, $.queriedAt, now)}`);
    return;
  }
  const today = shanghaiDate(now);
  const daily = result.daily || {};
  const temp = !stale && forecastTemp(daily, today);
  const range = temp ? `今日最低/最高：${temp.min}～${temp.max}°C` : '今日预报不可用（缺数据或权限）';
  const hourly = result.hourly || {};
  const future = rows => !stale && hourly.status === 'ok' && Array.isArray(rows) ? rows.filter(x => {
    if (!x || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(x.datetime)) return false;
    const t = Date.parse(x.datetime); return t >= now && t < now + 3 * 3600000;
  }).sort((a,b) => Date.parse(a.datetime) - Date.parse(b.datetime)) : [];
  const points = future(hourly.precipitation).filter(x => typeof x.probability === 'number' && x.probability >= 0 && x.probability <= 100);
  const p = !stale && points.length ? Math.max(...points.map(x => x.probability)) : null;
  const rainThreshold = Number($.read('umbrella_probability_threshold'));
  const rain = p === null ? '未来3小时降雨概率不可用（缺数据或权限）；无法据此判断带伞' : `未来3小时（已提供时段）最高降雨概率：${p}%；${p >= (rainThreshold > 0 && rainThreshold <= 100 ? rainThreshold : 40) ? '建议带伞' : '按已提供概率可不带伞，仍留意变化'}`;
  let body = `${range}\n${rain}`;
  if (scene === 'evening') {
    const hours = future(hourly.temperature).filter(x => Number.isFinite(x.value)).slice(0,3).map(x => {
      const sky = future(hourly.skycon).find(s => Date.parse(s.datetime) === Date.parse(x.datetime));
      return new Date(Date.parse(x.datetime) + 28800000).toISOString().slice(11,16) + ` ${x.value}°C ${sky && mapSkycon(sky.value) ? mapSkycon(sky.value)[0] : '天气状况未提供'}`;
    });
    body += '\n' + (hours.length ? '未来3小时（Asia/Shanghai）\n' + hours.join('\n') : '逐小时温度/天气不可用（缺数据或权限）');
  }
  if (scene === 'night') {
    const tomorrow = shanghaiDate(now + 86400000);
    const next = !stale && forecastTemp(daily, tomorrow);
    body = next ? `明日最低/最高：${next.min}～${next.max}°C` : '明日预报不可用（缺数据或权限），不以今日代替';
    if (temp && next) {
      const delta = (next.min + next.max - temp.min - temp.max) / 2;
      const threshold = Number($.read('temp_change_threshold'));
      body += `\n日均温（每日最低与最高的均值）较今天${Math.abs(delta) >= (threshold > 0 && threshold <= 30 ? threshold : 5) ? '明显' : ''}${delta < 0 ? '降温' : '升温'}${Math.abs(delta)}°C`;
    } else body += '\n缺同口径日温度，无法比较升降温';
  }
  if (stale) body = '⚠️ 预报已降级：接口响应陈旧或时间异常，不生成出行/温差建议。';
  $.notify('[彩云天气 时间核验版]', {morning:'今天出门',evening:'回家/出行',night:'明日预报'}[scene], `${preview ? '手动预览（不写去重状态）\n' : ''}${diagnostic}${body}\n${alert.text}\n${weatherTimes($.weather, $.queriedAt, now)}`);
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
  };

  const intensity = {
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

