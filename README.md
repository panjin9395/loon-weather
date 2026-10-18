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

## Verification
`node --test weather.test.cjs`
`TZ=America/Los_Angeles node --test weather.test.cjs`

Tests execute the real two scripts in a Node VM with Loon's boundary interfaces. The weather response is an explicit synthetic fixture, not a live API response and not phone acceptance. It reproduces a 07:20 observation at an 11:17 query, checking both original and distinct times plus a 237-minute stale warning. Tests cover exact/inside/outside 3 km, invalid/new/no saved positions, repeated fresh requests on saved-location fallback, negative coordinates, explicit and missing timezone, unavailable observation times, response age, HTTP cache directives and credential-safe errors.

Red-to-green cycles were run for the 3 km anchor, 07:20/11:17 time display, invalid stored-position validation, privacy-safe transport errors and explicit HTTP cache directives. Additional boundary tests verify the resulting implementation.

No global network rules, schedules or MITM hostnames were changed. Phone-side verification and identifying the separate pictured notification are still outstanding.
