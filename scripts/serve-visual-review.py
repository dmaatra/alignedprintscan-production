"""Read-only local APS visual review. Backend transport is blocked by CSP."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class ReviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path, sep, query = self.path.partition('?')
        if path in ('/neighborhood', '/team', '/doneisha'):
            self.path = path + '.html' + (sep + query if sep else '')
        elif path == '/review' or path == '/review/':
            self.send_response(302)
            self.send_header('Location', '/output/owner-acceptance/index.html')
            self.end_headers()
            return
        super().do_GET()
    def end_headers(self):
        self.send_header('Content-Security-Policy', "connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'")
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_POST(self):
        self.send_error(405, 'Visual review does not persist submissions')
ThreadingHTTPServer(('127.0.0.1', 8032), ReviewHandler).serve_forever()
