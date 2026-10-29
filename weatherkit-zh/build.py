#!/usr/bin/env python3
"""Rebuild Chinese LPX and prefixed bundles from audited v3.3.2 bytes, offline."""
from pathlib import Path
import hashlib
import json
import re
ROOT = Path(__file__).resolve().parent
PINNED = {
    'iRingo.WeatherKit.lpx': 'e994f11d8eb987b81bda0c682e95287d4ee166cabf8a5563d2fa8aa4bdfe3e24',
    'request.bundle.js': 'da05af299dd2172e1c25a2bff349cdda268114ee7fc43340cc48da29c76ea033',
    'response.bundle.js': 'ce1db90d77c44fce972db0c2e319845fc1d6a276d41d772c0294882e59d7f999',
}
def build():
    for name, expected in PINNED.items():
        assert hashlib.sha256((ROOT / 'upstream' / name).read_bytes()).hexdigest() == expected, name
    adapter = (ROOT / 'argument-adapter.js').read_bytes()
    for kind in ('request', 'response'):
        (ROOT / f'{kind}.zh.bundle.js').write_bytes(adapter + b'\n' + (ROOT / 'upstream' / f'{kind}.bundle.js').read_bytes())
    reverse = {value: label for label, value in re.findall(r"'([^']+)'\s*:\s*'([^']+)'", adapter.decode())}
    text = (ROOT / 'upstream' / 'iRingo.WeatherKit.lpx').read_text()
    text = text.replace('#!name =  iRingo: 🌤 WeatherKit', '#!name = 苹果天气增强 · 中文选项（非官方二改）')
    text = '# Modified by panjin9395: Chinese select values and pinned local adapted bundles. Apache-2.0; see weatherkit-zh/NOTICE.\n' + text
    lines = []
    for line in text.splitlines():
        if ' = select,' in line:
            line = re.sub(r'"([^\"]*)"', lambda m: json.dumps(reverse[m[1]], ensure_ascii=False), line)
        line = line.replace('https://github.com/NSRingo/WeatherKit/releases/download/v3.3.2/request.bundle.js', 'https://raw.githubusercontent.com/panjin9395/loon-weather/main/weatherkit-zh/request.zh.bundle.js')
        line = line.replace('https://github.com/NSRingo/WeatherKit/releases/download/v3.3.2/response.bundle.js', 'https://raw.githubusercontent.com/panjin9395/loon-weather/main/weatherkit-zh/response.zh.bundle.js')
        lines.append(line)
    (ROOT / 'WeatherKit.zh.lpx').write_text('\n'.join(lines) + '\n')
    print('BUILD OK: pinned v3.3.2; adapter prefix + byte-identical official bundles')
if __name__ == '__main__':
    build()
