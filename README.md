# Loon 彩云天气：全天检查，少打扰（2026.10-commute-air.1）

原插件 URL 不变：
https://raw.githubusercontent.com/panjin9395/loon-weather/main/CaiyunWeather.plugin

## 实际安排

- 固定 **07:30 / 12:00 / 17:00** 三次摘要，原上班/午间外出/下班格式保留。
- 全天含夜间共24个基础查询slot，**不是24条通知**：
  - `0 0-6,8-23 * * *`：除07:00外23次整点。
  - `30 7 * * *`：07:30一次，包含在24次内；07:00不查询。
- 不保留旧白天半点基础cron，不增加独立摘要cron。其他时段无显著变化不通知；官方预警新增/升级独立去重。
- 条件机动仍是 `15,45 7-20 * * *`，只在最近有效异常窗口内可能查询，和手动共享每天最多3次；夜间由基础整点检查覆盖，不无限追加请求。

**全天检查不等于实时监测**。Loon由iOS后台定时触发，可能延迟或漏跑；一般整点检查，06:00→07:30最长计划间隔90分钟。不能保证天气变化即刻收到、固定摘要必达或全天手机已实际运行。cron使用设备/Loon时区，请保持 Asia/Shanghai。脚本计数和时段用现代上海UTC+08:00，不依宿主DST；不补跑错过slot。

## 什么情况额外提醒

1. **可信观测温变**：同一位置相邻有效样本间隔≤2小时、观测时间严格递增，温差绝对值≥5°C；4.9°C不报，升温/降温分别标明。实时块须status=ok、有效温度及带时区obsTime，观测距查询≤60分钟、不晚于查询5分钟，server_time同时通过检查。缺obsTime不把server_time伪装成观测时间。
2. **预报变天提醒**（独立于观测可用性）：server_time距查询≤60分钟、不晚于查询5分钟、hourly.status=ok、有效带时区未来小时。在 `[当前, 当前+3小时)` 已提供时段温度最大/最小跨度≥5°C，按极值先后标升/降温，并写明时段及“非实时观测”。不补造缺失小时。
3. **预报转雨雪**：下一可用未来小时的可信skycon为雨/雪，且本次当前整点小时明确无雨，或≤2小时内前次有效样本明确无雨；或下一可用小时降水概率≥60%，且≤2小时内前次概率明确<60%。缺字段、未识别skycon、无时区、过期行及无历史低概率均是unknown，不当无雨/0%。只有已有证据的变化才提醒，持续高概率/持续雨雪不刷屏。
4. 同类变化3小时冷却（升温/降温、观测/预报、雨/雪分别计）；持续同类异常即使仍满足阈值，冷却内不重复。官方预警按id+code+发布时间+可选更新时间独立去重，不受温变冷却限制。预警和变天合并一个窗口。生活建议不是官方预警。

正式检查才更新天气锚点/异常去重；固定摘要即使覆盖异常也会记录状态，避免紧接重复通知。手动预览不消费正式异常/预警状态，但仍消费机动请求预算。位置捕获超出3km换锚点时先清除天气比较/冷却/异常窗口，保留次数，避免旅行温差误报；3km内（含边界）继续复用位置及时间。位置脚本仍无法区分苹果天气当前位置与收藏城市；请勿用远处收藏城市刷新定位。不要直接手工改坐标绕过捕获流程。

有效官方预警、有效实况雨雪或满足阈值的预报异常可开启最多2小时机动窗口；实况不越过观测后2小时，预警不越过明确失效时间。失败不重试、不延长窗口，缺数据不会猜成正常；机动仍受共享3次与后续基础slot预留限制，不为凑数调用。

## 官方时间字段核验

[彩云v2.6实况文档](https://docs.caiyunapp.com/weather-api/v2/v2.6/1-realtime.html)的字段表和样例未提供独立观测timestamp/obsTime；综合接口server_time是服务器响应时间，不是观测时间。故通常观测新鲜度为未知，不能声称实时温变已监测。若实际响应明确提供带时区obsTime，按上述严格规则验证；没有时仍独立使用有时间戳的逐小时预报生成**预报变天提醒**，不静默禁用所有变天判断。自动/手动页脚都如实标观测未知或陈旧。

## API、预算和隐私

每次许可只请求一次v2.6综合接口：`weather?lang=zh_CN&dailystart=0&hourlysteps=24&dailysteps=3&alert=true`，同时拿实况、小时、逐日、预警；不拆多个天气接口。测试全为synthetic fixtures，未读取真实Token/坐标、未请求真实天气。

默认基础最多24次 + 手动/条件机动共享最多3次 = 每天最多27次**本地尝试估算**。失败也发出前计数，同日slot顺序去重，无自动重试。先写独立`caiyun_budget_v1`并读回，失败就不请求；预算含累计尝试、当日slot、少量无坐标天气状态。跨日只清当日计数，不清累计，也保留有效比较/冷却。手动预留未运行的后续全部基础slot；低预算优先留07:30/12:00/17:00三摘要，不足3时只能按时间顺序请求可负担部分。

可选本地BoxJS `caiyun.quota` 二选一（示例，必须改为平台真实值，保留token/location）：

```json
{"quota":{"remaining":10000,"expiry":"2027-10-17"}}
```

或

```json
{"quota":{"total":10000,"start":"2026-10-18"}}
```

remaining为首次应用该组配置时的余额快照，之后扣本地新增尝试；配置改变才建新快照。expiry含上海当日。total/start固定365个含首尾日（start+364天），扣全部累计尝试，不年度重置。非法/未来开始/过期/余额0均拒绝请求。日预算`floor(剩余/含今天剩余天数)`上限27，日内稳定，次日重新计算；余额未知，不声称套餐已绑定。

Loon本地存储没有跨脚本进程原子CAS/锁，先写读回不能保证同时启动无竞态。其他设备/脚本、清存储、重装、历史调用和平台计费无法由本机精确追踪；不是平台实际计费数字，不能保证套餐到期恰好用完。更新时不要新建并行副本或保留旧任务。

可选腾讯反查保留：仅本地已有token.tencent才可能另发地图请求，失败冷却1小时；不属于彩云调用，不展示街道，不配置则无地图请求。MITM仅 `weather-data.apple.com, api.weather.com, weatherkit.apple.com`；没有扩大域名。无Token/位置或非法坐标不请求；失败不复用旧天气，不输出原始异常/URL/Token/坐标。

官方预警要求status=ok、有效id/code/发布时间、alerting/预警中、无拒绝/解除/过期记录；按最多200版本保存去重。`content=[]`仅代表本次API无有效记录，不保证当地无预警；缺块、denied、`content=[] && adcodes=null`均未知。概率单位0–100%，缺失不是0。接口陈旧或时间异常不生成预测建议/预警提醒。

## 本次仅增强通勤显示

- 三摘要复用同一次综合响应，新增紧凑一行如 `空气优 国标AQI 25 · 西南风3级`。只读 `aqi.chn` / `description.chn`，0有效；缺失、非法或拒绝权限不填默认值，美标不冒充国标。描述与国标数值等级矛盾时仅保留数值。
- 默认metric/metric:v1/metric:v2风速是km/h，按官方m/s连续边界换算风级；风向为从北顺时针16方位，恰好半边界归前一方位；未识别单位/无有效方向不猜。此脚本未请求SI或英制，意外收到时省略风行。
- 实况UV index≥7且≤11才突出防晒（不混用逐日0–5等级）；湿度≥90%仅在已达到原带伞阈值或风≥6级时突出。普通湿度/弱UV、PM2.5/PM10、日出日落不堆入通勤卡。
- 官方预警仍置顶，通勤建议在前、空气风况在后、小时详情/时间页脚最后；未知观测时间统一保留，空气数值不等于已验证新鲜。温度建议、全天24+3预算、3km锚点、5°C变化、预警去重及所有cron均未更改。无新增API或坐标上传，旧今日天气已由用户禁用，本次不操作它。
- 合成样本和生成脚本见 `preview/commute-details-fixtures.txt` / `commute-details-examples.cjs`；不是实测空气或真机通知。

## 手机更新步骤（一次）

本次从 `2026.10-allday.1` 升级：只在Loon刷新原URL的 **caiyun-weather-v2.js 天气脚本缓存一次**，不需要更换插件/定位脚本、不改cron/Token/quota、不重新禁用旧脚本，不要求截图或新app。下列是完整安装/迁移说明，不是本次额外步骤：

1. 在Loon更新**原URL插件**，不要另建副本；版本应为 `2026.10-commute-air.1`。
2. 同次操作刷新/清除该插件的远程脚本缓存，天气和定位两个v2脚本都需更新。不动手机现有Token、定位和quota，不需要新app。
3. 检查只剩两条基础cron（上面的全天整点+07:30）及一条条件机动cron；删除旧白天半点基础任务及旧独立场景任务。时区保持Asia/Shanghai。
4. 可运行「彩云天气手动测试」一次看能力摘要/本地预算。会消耗一次共享机动，不影响正式通知去重。无须每天更新。

手动默认按上海时段预览上班/午间/下班；指定 `scene=morning&preview=1`、`scene=noon&preview=1`、`scene=evening&preview=1`。`scene=night&preview=1`仅显式明日预览，不发正式晚间摘要。不以今日代明日，不虚构路线或分钟级雨势。

原本地可选配置保留：`scenes`控制固定摘要（false不关闭官方预警），`umbrella_probability_threshold`默认40%，`temp_change_threshold`仅手动明日日均温比较（默认5°C）；全天自动异常阈值固定5°C，不受手动日均温设置影响。night=true不恢复正式明日摘要。原生通知无法自定义深蓝背景/任意布局；未引入Scriptable或新图片服务。保留三摘要标题/副标题/小时行/简洁时间页脚及能力降级格式。

## 验证

```sh
node --test all-day.test.cjs
node --test commute-details.test.cjs
TZ=America/Los_Angeles node --test all-day.test.cjs
```

all-day导入commute→notification→budget→capabilities→scenes→weather，单入口不重复计数。覆盖全天24slot、三摘要、预算/失败/隐私/机动、4.9/5°C与方向/冷却、预报转雨雪/概率变化与unknown、缺观测独立预报、跨午夜/时区、位置重置、手动不吞正式状态及官方预警升级。先红后绿，不代表真机iOS必达/全天运行/计费权限验收。

References: [realtime fields](https://docs.caiyunapp.com/weather-api/v2/v2.6/1-realtime.html), [units](https://docs.caiyunapp.com/weather-api/v2/v2.6/tables/unit.html), [wind](https://docs.caiyunapp.com/weather-api/v2/v2.6/tables/wind.html), [life index](https://docs.caiyunapp.com/weather-api/v2/v2.6/tables/lifeindex.html), [hourly schema](https://docs.caiyunapp.com/weather-api/v2/v2.6/3-hourly.html), [alerts](https://docs.caiyunapp.com/en/weather-api/v2/v2.6/5-alert.html), [Loon arguments](https://nsloon.app/en/docs/Script).
