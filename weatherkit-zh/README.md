# 苹果天气增强：中文选项版（独立、非官方二改）

订阅地址：

```text
https://raw.githubusercontent.com/panjin9395/loon-weather/main/weatherkit-zh/WeatherKit.zh.lpx
```

在 Loon 的插件列表单独添加；不要与官方 WeatherKit 插件或 Rewrite 版同时启用。本目录不修改本仓库原有彩云天气通知插件，也不自动修改手机配置。移除本插件即可撤销新增的规则和脚本；需要原版时重新添加官方插件。

## 改了什么

基于 **NSRingo/WeatherKit v3.3.2**，上游提交 `c40e8f8a13c8304a7ef500cb74acc5948af14b3f`。7 个下拉控件的 33 个候选值均含中文，不只是翻译标签：

- `ColorfulClouds` → 彩云天气；`WeatherKit` → 苹果原始天气；`QWeather` → 和风天气；`QWeatherWeb` → 和风天气网页。
- `EU_EAQI` → 欧盟空气质量指数（EU_EAQI）；其余算法也加中文名称并括注原标识。
- `Argument` → 插件参数优先；`PersistentStore` → 持久化配置优先；`database` → 内置默认配置。
- `WARN/OFF/ERROR/INFO/DEBUG/ALL` → 警告／关闭／错误／信息／调试／全部。

原参数键、候选顺序、默认含义、数据集输入框、三个空令牌默认值及 `devapi.qweather.com` 全部保留。数据集是自由输入而非下拉，仍使用官方英文数据集标识。BoxJS 界面及其中配置不修改。选择持久化配置时，实际数据源仍由上游 BoxJS 优先级控制。

## 为什么要适配器

已核对 [Loon 官方插件参数文档](https://nsloon.app/docs/Plugin/)：`select` 直接列候选值，首项为默认值，文档没有 label/value 映射语法。本版不发明额外语法，而使用上游 LPX 同款 `argument=[{参数名},…]` 传参形式。

`argument-adapter.js` 在官方 bundle 执行前仅把已知中文枚举映射回官方英文枚举，兼容 `$argument` 对象（扁平或嵌套）和查询字符串；未知值及密钥不主动改写。然后由官方自身参数解析器和原逻辑执行。**不是只把枚举改成中文交给不认识中文的脚本。**

为避免运行时下载、eval、额外脚本网络失败与 latest 漂移，将适配器作为前缀拼接到固定 v3.3.2 官方发布 bundle。`upstream/` 保存原始发行字节以供审计；`build.py` 校验已固定 SHA256 后离线生成 `request.zh.bundle.js`、`response.zh.bundle.js` 及 LPX，不从 latest 拉取。运行时依赖本仓库生成的脚本；官方版本不会自动升级。上游修复需人工复核更新。main 订阅会随本仓库将来提交更新，欲冻结可把插件及其两条 script-path 的 main 同时替换为同一发布提交号。

## 原功能、权限和安全边界

- 原 Rule、MITM、5 条脚本匹配、body/binary-body 标志与参数传递不变；MITM 主机仍只有 `weatherkit.apple.com`。MITM 可解密此主机的 HTTPS，请确保理解且自行配置可信证书。
- 适配器没有网络请求、动态执行、存储读写或密钥日志；官方请求/响应脚本保留自身网络及持久化行为。选择第三方源仍会向相应服务发送天气位置等必要数据，不新增中转服务。
- 三项个人令牌默认空；请只在手机私有插件设置填写，不提交到 GitHub。官方 bundle 的内置能力保持原样，不复制到文档或提取传播内置凭据。普通彩云开发者 Token 不保证分钟降水接口权限。
- 基础系统兼容性跟随上游：iOS/iPadOS 18、macOS 15、watchOS 11 等；证书、脚本命中、上游 API 可用性及套餐权限需要手机验证。
- 原署名、主页、BoxJS 入口保留；Apache-2.0 见 `LICENSE`，改动声明见 `NOTICE`。不代表官方认可本二改。

## 可重复验证

无需 npm 安装或网络：

```sh
python3 weatherkit-zh/build.py
node --test weatherkit-zh/adapter.test.cjs
```

已实跑 8 项测试：逐项检查 33 个中文候选与官方枚举及默认顺序；对象、嵌套对象、查询字符串、引号、空/未知值、编码和令牌保留；Rule/MITM/脚本属性对照；原始 bundle 哈希和拼接字节对照；在 Node VM 中分别以对象及字符串参数实际运行 request/response 官方 bundle，禁用网络并验证 `$done`、无错误日志及官方最终英文参数。

VM 使用本地合成 availability 空列表及 airQualityScale 路由作为非联网烟测，不是实时天气数据或手机流量证据。**尚未做 Loon 原生导入、iPhone 天气显示、真实 API 请求和降水通知实机测试。**

来源：[官方发行版](https://github.com/NSRingo/WeatherKit/releases/tag/v3.3.2) · [上游说明](https://nsringo.github.io/guide/Weather/weather-kit.html)。
