/* Loon-only location capture. No network, no coordinate/token logging.
 * Storage compatible with Peng-YM Caiyun BoxJS (caiyun.location).
 * Does not distinguish current location from saved Weather app cities.
 */
(function () {
  const VERSION = 'location-v2';
  const load = key => { try { return JSON.parse($persistentStore.read(key) || '{}'); } catch (_) { return {}; } };
  const stamp = () => new Date().toISOString();
  const safePath = url => {
    const m = url.match(/^https:\/\/([^/?#]+)([^?#]*)/i);
    if (!m) return 'URL格式异常';
    const allowed = /^(?:api|v1|v2|v3|weather|geocode|availability|zh-Hans|zh-Hant|en|en-US)$/;
    const parts = m[2].split('/').filter(Boolean).map(x => allowed.test(x) ? x : /^-?\d+(?:\.\d+)?$/.test(x) ? '<数字>' : '<字段>');
    return m[1] + '/' + parts.join('/') + (url.includes('?') ? '?<参数已隐藏>' : '');
  };
  const say = text => console.log('[彩云定位 ' + VERSION + '] ' + text);
  const notify = (title, text) => $notification.post('彩云天气定位', title, text);
  try {
    say('脚本已触发');
    if (typeof $request === 'undefined') {
      const d = load('caiyun_location_diag_v2');
      const success = load('caiyun_location_success_v2');
      const text = '版本：' + VERSION + '\n最近HTTP触发：' + (d.at || '无') + '\n结果：' + (d.result || '尚未触发新版定位规则') + '\n路径：' + (d.path || '无') + '\n最后成功保存：' + (success.at || '无');
      say(text);
      notify('定位诊断', text);
      return;
    }
    const url = String($request.url || '');
    if (!/^https:\/\/(?:weatherkit\.apple\.com|weather-data\.apple\.com|api\.weather\.com)(?:\/|$)/i.test(url)) {
      say('跳过非目标域名'); return;
    }
    const diagnostic = {at:stamp(),path:safePath(url),result:'收到天气请求'};
    $persistentStore.write(JSON.stringify(diagnostic), 'caiyun_location_diag_v2');
    const record = result => { diagnostic.result=result; $persistentStore.write(JSON.stringify(diagnostic), 'caiyun_location_diag_v2'); };
    const n = '(-?\\d+(?:\\.\\d+)?)';
    const expressions = [
      new RegExp('/api/v\\d+/weather/[^/?]+/' + n + '/' + n + '(?:[/?]|$)'),
      new RegExp('/weather/[^/?]+/' + n + '/' + n + '(?:[/?]|$)'),
      new RegExp('/geocode/' + n + '/' + n + '(?:[/?]|$)'),
      new RegExp('[?&]geocode=' + n + '(?:,|%2[cC])' + n + '(?:&|$)'),
      new RegExp('/v2/availability/' + n + '/' + n + '(?:[/?]|$)')
    ];
    const match = expressions.map(r => url.match(r)).find(Boolean);
    if (!match) {
      record('未识别坐标；已保留之前成功的位置');
      $persistentStore.write('脚本已触发，但此请求没有可识别的位置。', 'caiyun_location_diagnostic');
      say('跳过无坐标请求'); return;
    }
    const lat = Number(match[1]), lon = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      record('坐标越界，未保存');
      $persistentStore.write('脚本已触发，但位置数值越界，未保存。', 'caiyun_location_diagnostic');
      say('拒绝越界坐标'); return;
    }
    const raw = $persistentStore.read('caiyun');
    let settings = {};
    if (raw) {
      try { settings = JSON.parse(raw); }
      catch (_) { throw new Error('BoxJS彩云数据不是有效JSON，未覆盖原设置'); }
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('BoxJS彩云数据结构异常，未覆盖原设置');
      }
    }
    const old = settings.location || {};
    const first = old.latitude === undefined || old.longitude === undefined ||
      String(old.latitude).trim() === '' || String(old.longitude).trim() === '';
    settings.location = { latitude: String(lat), longitude: String(lon) };
    settings.location_updated = Date.now();
    if (!$persistentStore.write(JSON.stringify(settings), 'caiyun')) throw new Error('本地写入失败');
    const check = JSON.parse($persistentStore.read('caiyun') || '{}');
    if (check.location?.latitude !== String(lat) || check.location?.longitude !== String(lon)) {
      throw new Error('本地保存回读不一致');
    }
    record('位置已保存并回读确认');
    $persistentStore.write(JSON.stringify({at:stamp(),version:VERSION}), 'caiyun_location_success_v2');
    const result = '位置已保存并回读确认。来源：苹果天气；版本：' + VERSION;
    $persistentStore.write(result, 'caiyun_location_diagnostic');
    say(result);
    const last = Number($persistentStore.read('caiyun_location_notice') || 0);
    if (first || !last || Date.now() - last > 24 * 60 * 60 * 1000) {
      notify('获取定位成功', '已更新BoxJS彩云经纬度。未展示坐标；旅行后请刷新当前位置。');
      $persistentStore.write(String(Date.now()), 'caiyun_location_notice');
    }
  } catch (error) {
    // Never log error objects or request URLs: those may contain private data.
    const reason = ['BoxJS彩云数据不是有效JSON，未覆盖原设置', 'BoxJS彩云数据结构异常，未覆盖原设置', '本地写入失败', '本地保存回读不一致'].includes(error.message) ? error.message : '运行异常，请检查Loon脚本权限与版本';
    say(reason);
    $persistentStore.write(reason, 'caiyun_location_diagnostic');
    notify('定位未保存', reason);
  } finally {
    $done({});
  }
})();
