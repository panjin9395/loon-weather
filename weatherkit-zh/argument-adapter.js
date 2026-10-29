/* SPDX-License-Identifier: Apache-2.0
 * Modified by panjin9395: Chinese Loon choices -> upstream WeatherKit enums.
 * Applied before the unchanged, pinned v3.3.2 official bundle. No network/eval.
 */
(() => {
  const providers = { '彩云天气': 'ColorfulClouds', '苹果原始天气': 'WeatherKit', '和风天气': 'QWeather', '和风天气网页': 'QWeatherWeb' };
  const maps = {
    'Weather.Provider': providers,
    'WeatherAlerts.Provider': providers,
    'NextHour.Provider': providers,
    'AirQuality.Current.Pollutants.Provider': providers,
    'AirQuality.Calculate.Algorithm': {
      '欧盟空气质量指数（EU_EAQI）': 'EU_EAQI', '不转换': 'None', '德国空气质量指数（UBA）': 'UBA',
      '美国即时空气指数（WAQI_InstantCast_US）': 'WAQI_InstantCast_US',
      '中国即时空气指数（WAQI_InstantCast_CN）': 'WAQI_InstantCast_CN',
      '中国即时空气指数二〇二五草案（WAQI_InstantCast_CN_25_DRAFT）': 'WAQI_InstantCast_CN_25_DRAFT',
      '加拿大空气健康指数（CA_AQHI）': 'CA_AQHI', '香港空气健康指数（HK_AQHI）': 'HK_AQHI',
      '中国多污染物健康指数（AQHI_Multi_CN）': 'AQHI_Multi_CN',
      '中国及香港多污染物健康指数（AQHI_Multi_CN_HK）': 'AQHI_Multi_CN_HK',
      '中国致死风险健康指数（CN_DEATH_AQHI）': 'CN_DEATH_AQHI',
      '中国及香港致死风险健康指数（CN_DEATH_HK_AQHI）': 'CN_DEATH_HK_AQHI'
    },
    Storage: { '插件参数优先': 'Argument', '持久化配置优先': 'PersistentStore', '内置默认配置': 'database' },
    LogLevel: { '警告': 'WARN', '关闭': 'OFF', '错误': 'ERROR', '信息': 'INFO', '调试': 'DEBUG', '全部': 'ALL' }
  };
  const translate = (key, value) => Object.prototype.hasOwnProperty.call(maps[key] || {}, value) ? maps[key][value] : value;
  const argument = globalThis.$argument;
  if (typeof argument === 'string') {
    // Preserve unknown entries, API tokens and encoding byte-for-byte.
    globalThis.$argument = argument.split('&').map(pair => {
      const index = pair.indexOf('=');
      if (index < 0) return pair;
      try {
        const key = decodeURIComponent(pair.slice(0, index).replace(/\+/g, ' ')).replace(/\[([^\[\]]+)\]/g, '.$1').replace(/^\?/, '');
        const value = decodeURIComponent(pair.slice(index + 1).replace(/\+/g, ' ')).replace(/"/g, '');
        const mapped = translate(key, value);
        return mapped === value ? pair : pair.slice(0, index + 1) + encodeURIComponent(mapped);
      } catch (_) { return pair; }
    }).join('&');
  } else if (argument && typeof argument === 'object' && !Array.isArray(argument)) {
    const visit = (object, prefix) => {
      Object.keys(object).forEach(key => {
        const full = prefix ? prefix + '.' + key : key;
        const value = object[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) visit(value, full);
        else if (typeof value === 'string') object[key] = translate(full, value);
      });
    };
    visit(argument, '');
  }
})();
