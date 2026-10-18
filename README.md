# Loon weather: local location anchor and truthful times

Existing plugin URL (unchanged):
https://raw.githubusercontent.com/panjin9395/loon-weather/main/CaiyunWeather.plugin

## Behavior
- `caiyun.location` remains in phone-local BoxJS / persistent storage. Keys and actual coordinates never belong in this repository.
- Valid captured positions within **3 km inclusive** of the saved anchor leave that anchor and its timestamp unchanged. Outside 3 km, a valid new position replaces it after a read-back check. The threshold is calculated with a spherical great-circle distance.
- Unrecognized/invalid requests keep the previous position. Scheduled/manual weather runs always make a new weather request using that position; no stored weather is replayed. No prior position means a prompt instead of a request.
- Apple Weather URLs do not prove whether the location is current or a saved city. Opening a saved city more than 3 km away can update the anchor. This pre-existing limitation is not solved by the distance rule.
- Notifications have the marker `彩云天气 时间核验版`. Data time is only shown from an explicit, timezone-bearing upstream `result.realtime.obsTime`, when present. The documented Caiyun schema normally does not include observation time; in that case it is **unknown**, not the local clock or `server_time`.
- `server_time` is separately labeled API response time, not observation time. Query start and notification generation are independently labeled. Times use the response `tzshift`, with UTC+08:00 as the existing China-targeted fallback.
- Observation or response ages over 60 minutes are explicitly warned about. Requests ask HTTP caches not to serve stored results; the server may still return old data, and a fresh server time does not prove a fresh observation.
- Generic failure notifications do not expose transport errors, which may include a token-bearing URL. Network failure does not replay old weather.

## Investigation of the screenshot
The supplied screenshot says `天气通知`, `更新时间：07:20`, daily high/low, PM2.5/PM10, sunrise/sunset and Tips. The pre-change repository script instead emits `[彩云天气]`, instantaneous/feels-like temperature, UV, a forecast keypoint and a 3-hour forecast. It has **no `更新时间` field**, no `obsTime` rendering and no persisted-weather replay. Its plugin schedules 07:30, 12:00, 17:00 and 20:30, not 11:17.

Therefore this repository's inspected version cannot generate the pictured card. There is not enough evidence to choose an upstream observation time, upstream cache, formatting bug, or delayed/other notification as the source of **that** 07:20. The installed script configuration and raw weather timestamps (with credentials and coordinates removed) remain necessary to close that specific diagnosis. Do not claim an upstream problem or delayed notification as confirmed.

## 按场景提醒（原 URL 更新）

| Loon 定时 | 参数 | 实际行为 |
|---|---|---|
| 07:30 | `scene=morning` | 今天最低/最高；从查询时刻起未来 3 小时已提供时段的最高降雨概率与带伞建议 |
| 12:00 | `scene=noon` | 仅新增、级别或发布时间/更新时间改变的有效官方预警；无变化、权限不足、接口陈旧或网络失败均安静 |
| 17:00 | `scene=evening` | 未来 3 小时已提供时段的温度、天气和降雨概率，回家/出行参考 |
| 20:30 | `scene=night` | 明日最低/最高；比较明日与今天各自 `(最低+最高)/2` 的差，绝对差 **≥5°C** 才标明显升/降温，不混用当前实况 |

- 仅保留每天四次触发，没有全天高频轮询。不是实时预警系统，不承诺分钟级提醒；本版本不使用分钟级预报，缺逐小时权限就明说不可用，不能拿实况或今日替代。
- **cron 触发跟随 Loon/设备时区**，以上中国时间需设备为 Asia/Shanghai。脚本日期选择固定按现代 Asia/Shanghai（UTC+08:00，无 DST），按每条带时区的日期查找，不依宿主时区或数组下标；跨月、跨年、闰日可用。若旅行改变设备时区，请自行调整 cron；不会偷偷改系统时区。
- 请求改为有公开字段文档的 Caiyun **v2.6**，仅请求 24 小时/3 天；Token 必须具备对应权限，不会代申请权限。概率按官方单位 **0–100%**，0 是有效值，缺失绝不当 0。窗口只覆盖已返回的未来时段，不声称是整日概率。
- 官方预警要求 alert.status=ok、active `alerting`/`预警中`、有效 id/code/发布时间；显式失效或解除的记录不通知。上游无失效时间时仅依本次 API 的有效预警状态，不自行编造有效期。按 id+code+发布时间+可选更新时间去重，本地最多 200 个版本。摘要中提及持续预警，不另弹重复窗口；新预警合入场景摘要，午间只发变化。不提供有效预警数据时明确不能判断，而不说“无预警”。
- API 响应时间超过 60 分钟或明显在未来时，停用出行/温差建议和预警触发，展示降级信息；明确 obsTime 的实况超过 60 分钟仍标陈旧。缺 obsTime 就不知道观测新鲜度，不能用 server_time 冒充。上游未提供预报发布时间时，只能依响应时间检查缓存风险，不保证预报更新时间。
- 手动“彩云天气手动测试”无参数时，按中国小时段自动预览：00–11 早间、12–16 午间、17–19 回家、20–23 明日。自定义脚本可用 `argument="scene=night&preview=1"` 指定场景。**手动预览不写预警去重状态**，不吞下一次正式通知；不要用无 preview 的定时参数手动模拟正式执行，除非本来就要消耗正式去重。

### 手机本地可选设置

继续使用现有 BoxJS `caiyun` 本地存储，不新增订阅或上传配置。在原对象中合并以下字段（保留原 `token`、`location` 等字段；不要把实际值发到聊天或提交仓库）：

```json
{
  "scenes": {"morning": true, "noon": true, "evening": true, "night": true},
  "temp_change_threshold": 5,
  "umbrella_probability_threshold": 40
}
```

场景字段为布尔值；false 关闭该场景正式通知（手动预览仍可检查）。温差阈值有效范围 `(0,30]` °C；带伞概率阈值 `(0,100]` %，无效值回默认。未新增 BoxJS UI：本仓库原本无 BoxJS 订阅架构，只复用已有本地对象。

### 升级与核验

手机只需**更新一次现有插件，再刷新/清除该插件的远程脚本缓存**，保持同一 URL。MITM 域名、全局网络规则、位置捕获脚本与 3 km 锚点均未改。确认脚本任务变成上述四个场景后，可点手动测试预览。服务器不读取用户 Token 或坐标。

### 购买后一次手机手动核验

更新原插件并刷新远程脚本缓存后，点现有 **彩云天气手动测试** 一次即可；无需新增任务、权限或 MITM。所有手动场景预览都会附上「能力摘要（本次响应，非购买凭证）」：实况、逐小时、逐日、预警分别为可用、当前无有效预警、缺权限（未知）或结构异常（未知）。摘要只输出固定文案，不输出原响应、URL、令牌、经纬度；不额外请求天气、不消费正式预警去重。缺字段本身不证明缺权限；逐小时/逐日可用指本次温度序列通过结构检查，不代表所有变量或新鲜度都可用。网络失败仍显示脱敏查询失败。

- `alert.status=ok` 且 `content=[]` 正常表示本次当前无有效预警，不是程序错误，也不保证当地无预警。官方明确的例外 `content=[]` 且 `adcodes=null` 是上游异常，仍保留未知；缺块、缺字段、denied 也不能当无预警。此前代码已正确区分普通空数组与缺块，这次修复的是 `adcodes=null` 例外，不能凭截图推断手机实际走了哪条分支。
- [官方实况字段](https://docs.caiyunapp.com/weather-api/v2/v2.6/1-realtime.html)没有可验证的观测时间，因此「数据更新时间：未知」通常是正确结果；`server_time` 只是服务器时间，不能伪装成观测时间。
- 当前使用手机本地 `token.caiyun` 的 **v2.6 综合 weather**，经度在前，参数为 `lang=zh_CN&dailystart=0&hourlysteps=24&dailysteps=3&alert=true`；不是 v3，也未改成 App Key/Secret 签名认证。若应用强制签名，现有 token 模式不能据购买自动兼容。
- 已购买 25 元/万次不证明手机里该令牌的权限已生效；如平台仍显示旧额度，需在平台本地核对套餐与应用绑定是否对应当前使用的应用。无需分享令牌、密钥、坐标或包含秘密的截图。**服务器未读取或调用真实付费令牌，购买生效与真机结果尚待这一次手机运行核验。**

## Verification

```sh
node --test capabilities.test.cjs
TZ=America/Los_Angeles node --test capabilities.test.cjs
```

`capabilities.test.cjs` 导入 `scenes.test.cjs`，后者再导入 `weather.test.cjs`；单跑 capabilities 就是完整套件，不重复运行文件来扩大计数。新增普通空预警、上游异常 adcodes=null、缺字段/denied、失败响应摘要、四场景手动诊断和请求 endpoint 参数检查。测试使用 Node VM 执行真实 Loon 脚本，HTTP 和持久化边界由显式 synthetic fixture 提供，没有调用用户天气 API。覆盖四场景、3 km、预警去重/升级/失效、手动不消耗、权限与 0 概率、5°C 边界、缺明日、跨日期与宿主 DST、陈旧时间、网络隐私和缓存指令。新行为先红测试再实现，概率单位通过官方文档校正为 0–100%。

**尚未真机验收**：无法在本环境确认 Loon/iOS 实际定时投递、系统通知权限和个人 Token 权限；这些不是 Node fixture 测试能证明的。

References: [Caiyun hourly schema](https://docs.caiyunapp.com/weather-api/v2/v2.6/3-hourly.html), [official alert schema](https://docs.caiyunapp.com/en/weather-api/v2/v2.6/5-alert.html), [Loon legacy argument syntax](https://nsloon.app/en/docs/Script).
