"""เซิร์ฟเวอร์เล็ก ๆ สำหรับเปิด LinkMap ในเบราว์เซอร์ (local-first ไม่ส่งข้อมูลออกนอกเครื่อง)

ใช้: python serve.py [port]
- เสิร์ฟไฟล์ในโฟลเดอร์นี้ที่ http://127.0.0.1:<port>/ (รับเฉพาะเครื่องนี้)
- เปิดเบราว์เซอร์ให้อัตโนมัติ
- ปิดด้วย Ctrl+C
"""
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8781


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".csv": "text/csv; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # ไม่ให้แคช เพื่อให้แก้ไฟล์แล้วรีเฟรชเห็นผลทันที
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # เงียบ ๆ
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def pick_port(start):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    port = pick_port(want)
    url = f"http://127.0.0.1:{port}/"
    httpd = Server(("127.0.0.1", port), Handler)
    print(f"LinkMap กำลังทำงานที่ {url}  (กด Ctrl+C เพื่อปิด)")
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
