import io
import json
import os
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import beitecha  # noqa: E402

KEY = "bk_sec_TESTKEY"
LOG = []
FAIL_NEXT = {"n": 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _handle(self, method):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n).decode("utf-8")) if n else None
        LOG.append({"method": method, "path": self.path, "headers": dict(self.headers), "body": body})
        if self.headers.get("Authorization") != "Bearer " + KEY:
            return self._send(401, {"error": {"code": "unauthorized", "message": "bad key"}})
        if FAIL_NEXT["n"]:
            FAIL_NEXT["n"] -= 1
            self.connection.close()
            return
        p = self.path
        if p.startswith("/v1/shuls/demo/upcoming"):
            return self._send(200, {"events": [{"ref": "shacharis@2026-11-07", "name": "שחרית", "time": "08:30"}]})
        if p.startswith("/v1/shuls/demo/notices") or p.startswith("/v1/shuls/demo/info") or p.startswith("/v1/shuls/demo/changes"):
            return self._send(200, {"ok": True, "changes": []})
        if p.endswith("/undo"):
            return self._send(201, {"status": "reverted", "changeId": "c9"})
        if p == "/v1/shuls/demo/operations":
            if body.get("op") == "yahrzeit.delete":
                return self._send(400, {"error": {"code": "ambiguous", "message": "2 match", "details": {"candidates": [{"id": "a"}, {"id": "b"}]}}})
            if body.get("op") == "change.retime":
                return self._send(201, {"status": "pending", "changeId": "c2", "target": body["ref"], "before": [], "after": [], "reason": "minyan"})
            return self._send(201, {"status": "applied", "changeId": "c1", "target": body.get("ref", "x"), "before": [], "after": [{"list": "notices", "item": {"id": "n1", "sponsoredBy": {"en": body.get("sponsoredBy", "")}}}]})
        self._send(404, {"error": {"code": "not_found", "message": "no"}})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


class Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.dir = tempfile.TemporaryDirectory()
        cls.cfg = os.path.join(cls.dir.name, "config.json")
        with open(cls.cfg, "w", encoding="utf-8") as f:
            json.dump({"apiBase": "http://127.0.0.1:%d/" % cls.srv.server_port, "slug": "demo", "key": KEY, "shulName": "Demo"}, f)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.dir.cleanup()

    def setUp(self):
        LOG.clear()
        FAIL_NEXT["n"] = 0

    def call(self, *args):
        out, err = io.StringIO(), io.StringIO()
        client = beitecha.Client(beitecha.load_config(self.cfg), retry_delay=0)
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = beitecha.run(["--config", self.cfg, *args], client=client)
            except beitecha.ApiError as e:
                code = 1
                err.write(e.message)
        return code, out.getvalue(), err.getvalue()

    def body(self):
        return LOG[-1]["body"]

    def test_upcoming_get_with_bearer_and_hebrew(self):
        code, out, err = self.call("upcoming", "--days", "7")
        self.assertEqual(code, 0)
        self.assertEqual(LOG[0]["path"], "/v1/shuls/demo/upcoming?days=7")
        self.assertEqual(LOG[0]["headers"]["Authorization"], "Bearer " + KEY)
        self.assertIn("שחרית", out)
        self.assertNotIn(KEY, out + err)

    def test_reads(self):
        for c in ("notices", "info"):
            self.call(c)
            self.assertEqual(LOG[-1]["path"], "/v1/shuls/demo/" + c)
        self.call("pending")
        self.assertEqual(LOG[-1]["path"], "/v1/shuls/demo/changes?status=pending")
        self.call("changes", "--status", "applied")
        self.assertEqual(LOG[-1]["path"], "/v1/shuls/demo/changes?status=applied")

    def test_set_sponsor_hebrew_and_idempotency(self):
        code, out, err = self.call("set-sponsor", "--ref", "kiddush@2026-11-07", "--by", "משפחת כהן", "--honor", "Dovid's bar mitzvah", "--replace")
        self.assertEqual(code, 0)
        r = LOG[0]
        self.assertEqual(r["path"], "/v1/shuls/demo/operations")
        self.assertEqual(r["body"], {"op": "sponsor.create", "sponsoredBy": "משפחת כהן", "inHonorOf": "Dovid's bar mitzvah", "ref": "kiddush@2026-11-07", "replace": True})
        self.assertEqual(len(r["headers"]["Idempotency-Key"]), 36)
        self.assertIn("live now", err)
        self.assertIn("משפחת כהן", err)

    def test_fresh_keys_per_write(self):
        self.call("note", "--ref", "a@2026-11-07", "--note", "x")
        self.call("note", "--ref", "a@2026-11-07", "--note", "x")
        self.assertNotEqual(LOG[0]["headers"]["Idempotency-Key"], LOG[1]["headers"]["Idempotency-Key"])

    def test_retry_same_key(self):
        FAIL_NEXT["n"] = 1
        code, _, _ = self.call("note", "--ref", "a@2026-11-07", "--note", "x")
        self.assertEqual(code, 0)
        self.assertEqual(len(LOG), 2)
        self.assertEqual(LOG[0]["headers"]["Idempotency-Key"], LOG[1]["headers"]["Idempotency-Key"])

    def test_bodies(self):
        cases = [
            (["add-notice", "--kind", "announcement", "--text", "Hi", "--title", "T", "--from", "2026-11-01", "--to", "2026-11-10"],
             {"op": "notice.create", "kind": "announcement", "text": "Hi", "title": "T", "from": "2026-11-01", "to": "2026-11-10"}),
            (["edit-notice", "--id", "n1", "--text", "New"], {"op": "notice.update", "id": "n1", "text": "New"}),
            (["remove-notice", "--id", "n1"], {"op": "notice.delete", "id": "n1"}),
            (["cancel", "--ref", "r@2026-11-07", "--note", "snow"], {"op": "change.cancel", "ref": "r@2026-11-07", "note": "snow"}),
            (["note", "--ref", "r@2026-11-07", "--note", "n"], {"op": "change.note", "ref": "r@2026-11-07", "note": "n"}),
            (["create-event", "--name", "Lecture", "--date", "2026-11-12", "--time", "20:00", "--speaker", "Rabbi"],
             {"op": "event.create", "name": "Lecture", "date": "2026-11-12", "time": "20:00", "speaker": "Rabbi"}),
            (["add-yahrzeit", "--name", "Moshe", "--hebrew-name", "משה", "--hebrew-date", "15/8/5700"],
             {"op": "yahrzeit.add", "hebrewName": "משה", "displayName": "Moshe", "hebrew": {"day": 15, "month": 8, "year": 5700}}),
            (["add-birthday", "--name", "Dina", "--date", "2015-03-04"], {"op": "occasion.add", "kind": "birthday", "displayName": "Dina", "gregorian": "2015-03-04"}),
            (["add-anniversary", "--name", "A & B", "--hebrew-date", "3/9", "--by", "hebrew"],
             {"op": "occasion.add", "kind": "anniversary", "by": "hebrew", "displayName": "A & B", "hebrew": {"day": 3, "month": 9}}),
            (["remove-person", "--kind", "birthday", "--match", "Dina"], {"op": "occasion.delete", "kind": "birthday", "match": "Dina"}),
            (["add-refuah", "--name", "רפאל בן שרה"], {"op": "cholim.add", "name": "רפאל בן שרה"}),
            (["remove-refuah", "--id", "c1"], {"op": "cholim.remove", "id": "c1"}),
            (["set-sponsor", "--from", "2026-11-09", "--to", "2026-11-10", "--text", "Learning", "--sponsors", "day"],
             {"op": "sponsor.create", "text": "Learning", "from": "2026-11-09", "to": "2026-11-10", "sponsors": "day"}),
            (["op", "--json", '{"op":"cholim.renew","match":"x"}'], {"op": "cholim.renew", "match": "x"}),
        ]
        for argv, want in cases:
            LOG.clear()
            code, _, err = self.call(*argv)
            self.assertEqual(code, 0, argv)
            self.assertEqual(self.body(), want, argv)

    def test_retime_pending(self):
        code, out, err = self.call("retime", "--ref", "m@2026-11-07", "--time", "09:00")
        self.assertEqual(self.body(), {"op": "change.retime", "time": "09:00", "ref": "m@2026-11-07"})
        self.assertIn("waiting for a gabbai", err)

    def test_undo(self):
        code, out, _ = self.call("undo", "--change", "c1")
        self.assertEqual(LOG[0]["path"], "/v1/shuls/demo/changes/c1/undo")
        self.assertEqual(LOG[0]["method"], "POST")
        self.assertIn("Idempotency-Key", LOG[0]["headers"])

    def test_ambiguous_error_exit(self):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = beitecha.main(["--config", self.cfg, "remove-person", "--kind", "yahrzeit", "--match", "x"])
        self.assertEqual(code, 1)
        self.assertIn("ambiguous", err.getvalue())
        self.assertEqual(json.loads(out.getvalue())["error"]["details"]["candidates"][0]["id"], "a")

    def test_wrong_key(self):
        bad = os.path.join(self.dir.name, "bad.json")
        cfg = json.load(open(self.cfg, encoding="utf-8"))
        cfg["key"] = "bk_sec_WRONG"
        json.dump(cfg, open(bad, "w", encoding="utf-8"))
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = beitecha.main(["--config", bad, "notices"])
        self.assertEqual(code, 1)
        self.assertNotIn("WRONG", out.getvalue() + err.getvalue())


if __name__ == "__main__":
    unittest.main()
