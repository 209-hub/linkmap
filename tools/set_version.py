"""ตั้งเลขเวอร์ชันให้ตรงกันทุกที่ (index.html, src/version.js, sw.js)
ใช้: python tools/set_version.py            → ใช้วันที่-เวลาปัจจุบัน เช่น 2026-10-11.1430
     python tools/set_version.py 1.2.0      → ระบุเอง
เรียกก่อน commit ทุกครั้งที่จะดีพลอย เพื่อให้เบราว์เซอร์ของผู้ใช้รู้ว่ามีเวอร์ชันใหม่และโหลดใหม่เอง
"""
import io, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ver = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime('%Y-%m-%d.%H%M')

def sub(path, pattern, repl):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding='utf-8').read()
    s2, n = re.subn(pattern, repl, s)
    if n == 0:
        raise SystemExit(f'ไม่พบรูปแบบใน {path}')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s2)

sub('index.html', r'<meta name="app-version" content="[^"]*">', f'<meta name="app-version" content="{ver}">')
sub('index.html', r'src="src/main\.js(\?v=[^"]*)?"', f'src="src/main.js?v={ver}"')
sub('src/version.js', r"APP_VERSION = '[^']*'", f"APP_VERSION = '{ver}'")
sub('sw.js', r"const CACHE = '[^']*'", f"const CACHE = 'linkmap-{ver}'")
print('version =', ver)
