#!/usr/bin/env python3
"""Beitecha: update a shul's notices, sponsorships, changes and lists from the command line.

Standard library only (Python 3.9+). Reads config.json beside this file:
  { "apiBase": "https://beitecha.baderech.app", "slug": "...", "key": "bk_sec_...", "shulName": "..." }

Output: the API's JSON response on stdout, a one-line summary on stderr. Errors exit non-zero.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))


class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def load_config(path=None):
    path = path or os.environ.get("BEITECHA_CONFIG") or os.path.join(HERE, "config.json")
    try:
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        raise SystemExit("config.json not found beside beitecha.py (expected at %s)" % path)
    except ValueError:
        raise SystemExit("config.json is not valid JSON")
    for k in ("apiBase", "slug", "key"):
        if not cfg.get(k):
            raise SystemExit("config.json is missing %r" % k)
    return cfg


class Client:
    def __init__(self, cfg, retry_delay=0.5):
        self.base = "%s/v1/shuls/%s" % (cfg["apiBase"].rstrip("/"), urllib.parse.quote(cfg["slug"], safe=""))
        self.key = cfg["key"]
        self.shul = cfg.get("shulName") or cfg["slug"]
        self.retry_delay = retry_delay

    def request(self, method, path, body=None, query=None, idempotency_key=None):
        url = self.base + path
        if query:
            q = {k: v for k, v in query.items() if v is not None}
            if q:
                url += "?" + urllib.parse.urlencode(q)
        headers = {"Authorization": "Bearer " + self.key, "Accept": "application/json", "User-Agent": "beitecha-skill/1"}
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        last = None
        for attempt in (1, 2):  # one retry on network error, with the SAME idempotency key
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode("utf-8") or "null")
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", "replace")
                try:
                    err = json.loads(raw).get("error", {})
                except Exception:
                    err = {}
                raise ApiError(e.code, err.get("code", "http_%d" % e.code), err.get("message") or raw[:200] or e.reason, err.get("details"))
            except (urllib.error.URLError, OSError) as e:
                last = e
                if attempt == 1:
                    time.sleep(self.retry_delay)
        raise ApiError(0, "network", "Could not reach %s (%s). If this is Claude, allow network access to the site in Settings > Capabilities." % (self.base.split("/v1")[0], getattr(last, "reason", last)))

    def get(self, path, query=None):
        return self.request("GET", path, query=query)

    def op(self, operation):
        return self.request("POST", "/operations", body=operation, idempotency_key=str(uuid.uuid4()))

    def undo(self, change_id):
        return self.request("POST", "/changes/%s/undo" % urllib.parse.quote(change_id, safe=""), idempotency_key=str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# Building operations from arguments

def put(d, **kw):
    d.update({k: v for k, v in kw.items() if v is not None})
    return d


def target(a):
    """A ref, or an event id and date."""
    t = {}
    if getattr(a, "ref", None):
        t["ref"] = a.ref
    if getattr(a, "event_id", None):
        t["eventId"] = a.event_id
    if getattr(a, "date", None):
        t["date"] = a.date
    return t


def person_fields(a, op):
    put(op, hebrewName=a.hebrew_name, displayName=a.name)
    if a.hebrew_date:
        parts = a.hebrew_date.split("/")
        if len(parts) not in (2, 3) or not all(p.strip().lstrip("-").isdigit() for p in parts):
            raise SystemExit("--hebrew-date must be DAY/MONTH or DAY/MONTH/YEAR (month 1 Nisan ... 6 Elul, 7 Tishrei ... 12 Adar, 13 Adar II)")
        h = {"day": int(parts[0]), "month": int(parts[1])}
        if len(parts) == 3:
            h["year"] = int(parts[2])
        op["hebrew"] = h
    put(op, gregorian=a.date)
    if a.hide_from_bulletin:
        op["hideFromBulletin"] = True
    return op


def person_ref(a, op):
    if a.id:
        op["id"] = a.id
    elif a.match:
        op["match"] = a.match
    else:
        raise SystemExit("give --id or --match")
    return op


def build(a):
    c = a.cmd
    if c == "set-sponsor":
        op = put({"op": "sponsor.create"}, **{"sponsoredBy": a.by, "inHonorOf": a.honor, "text": a.text})
        op.update(target(a))
        put(op, **{"from": a.from_, "to": a.to, "sponsors": a.sponsors})
        if a.replace:
            op["replace"] = True
        return op
    if c == "remove-sponsor":
        op = {"op": "sponsor.delete"}
        put(op, id=a.id)
        op.update(target(a))
        return op
    if c == "add-notice":
        return put({"op": "notice.create", "kind": a.kind, "text": a.text}, title=a.title, **{"from": a.from_, "to": a.to}, link=a.link, category=a.category)
    if c == "edit-notice":
        return put({"op": "notice.update", "id": a.id}, title=a.title, text=a.text, **{"from": a.from_, "to": a.to}, link=a.link)
    if c == "remove-notice":
        return {"op": "notice.delete", "id": a.id}
    if c == "cancel":
        return put({"op": "change.cancel", **target(a)}, note=a.note)
    if c == "retime":
        return put({"op": "change.retime", "time": a.time, **target(a)}, note=a.note)
    if c == "note":
        return {"op": "change.note", "note": a.note, **target(a)}
    if c == "undo-change":
        return put({"op": "change.delete", **target(a)}, type=a.type)
    if c == "create-event":
        op = {"op": "event.create", "name": a.name, "date": a.date, "time": a.time}
        return put(op, end=a.end, kind=a.kind, category=a.category, audience=a.audience, speaker=a.speaker, topic=a.topic, description=a.description, room=a.room, location=a.location, link=a.link, note=a.note)
    if c == "add-yahrzeit":
        return person_fields(a, {"op": "yahrzeit.add"})
    if c in ("add-birthday", "add-anniversary"):
        op = {"op": "occasion.add", "kind": "birthday" if c == "add-birthday" else "anniversary"}
        put(op, by=a.by)
        return person_fields(a, op)
    if c == "remove-person":
        if a.kind == "yahrzeit":
            return person_ref(a, {"op": "yahrzeit.delete"})
        return person_ref(a, {"op": "occasion.delete", "kind": a.kind})
    if c == "add-refuah":
        return {"op": "cholim.add", "name": a.name}
    if c == "remove-refuah":
        return person_ref(a, {"op": "cholim.remove"})
    if c == "renew-refuah":
        return person_ref(a, {"op": "cholim.renew"})
    if c == "op":
        try:
            op = json.loads(a.json)
        except ValueError as e:
            raise SystemExit("--json is not valid JSON: %s" % e)
        if not isinstance(op, dict) or "op" not in op:
            raise SystemExit('--json must be an object with an "op" field')
        return op
    raise SystemExit("unknown command " + c)


# ---------------------------------------------------------------------------
# Output

def label(entry):
    item = entry.get("item", {}) if isinstance(entry, dict) else {}
    def txt(v):
        return (v.get("en") or v.get("he") or "") if isinstance(v, dict) else (v or "")
    return (txt(item.get("sponsoredBy")) or txt(item.get("title")) or txt(item.get("text")) or txt(item.get("displayName")) or item.get("hebrewName") or txt(item.get("name")) or item.get("id", "")).strip()


def summarize(op, res):
    name = op.get("op", "")
    what = res.get("target") or ""
    if res.get("status") == "pending":
        why = res.get("reason")
        return "%s %s: waiting for a gabbai to approve%s (change %s)" % (name, what, " (%s)" % why if why else "", res.get("changeId"))
    after = res.get("after") or []
    extra = (" [%s]" % label(after[0])) if after else ""
    return "%s %s%s: live now (change %s)" % (name, what, extra, res.get("changeId"))


def day_line(e):
    return "%s  %s  %s" % (e.get("ref", ""), e.get("name", ""), e.get("time", ""))


def emit(obj, summary=None):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    if summary:
        sys.stderr.write(summary + "\n")


# ---------------------------------------------------------------------------
# CLI

def parser():
    p = argparse.ArgumentParser(prog="beitecha.py", description="Update a shul's schedule through Beitecha.")
    p.add_argument("--config", help="path to config.json (default: beside this script)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def cmd(name, help_):
        return sub.add_parser(name, help=help_)

    def ref_args(s, required=True):
        g = s.add_argument_group("which event")
        g.add_argument("--ref", help="ref from `upcoming`, like minchah@2026-11-07")
        g.add_argument("--event-id")
        g.add_argument("--date", help="YYYY-MM-DD (with --event-id)")

    s = cmd("upcoming", "event instances with their refs"); s.add_argument("--days", type=int, default=14)
    cmd("notices", "current notices and sponsorships (with ids)")
    cmd("info", "the shul's name, address, time zone")
    cmd("cholim", "refuah names (needs the cholim permission)")
    s = cmd("pending", "changes waiting for a gabbai"); s.add_argument("--status", default="pending", help="pending, applied, rejected, expired, reverted or 'all'")
    s = cmd("changes", "recent changes made with this key"); s.add_argument("--status")

    s = cmd("set-sponsor", "sponsor an event, or a run of days"); ref_args(s)
    s.add_argument("--by", help="sponsored by"); s.add_argument("--honor", help="in honor of / in memory of")
    s.add_argument("--text"); s.add_argument("--from", dest="from_"); s.add_argument("--to")
    s.add_argument("--sponsors", choices=["day", "notices"]); s.add_argument("--replace", action="store_true")
    s = cmd("remove-sponsor", "remove a sponsorship"); ref_args(s); s.add_argument("--id")

    s = cmd("add-notice", "add an announcement, reminder, simcha or condolence")
    s.add_argument("--kind", required=True, choices=["announcement", "reminder", "simcha", "condolence"])
    s.add_argument("--text", required=True); s.add_argument("--title"); s.add_argument("--from", dest="from_")
    s.add_argument("--to"); s.add_argument("--link"); s.add_argument("--category")
    s = cmd("edit-notice", "change a notice"); s.add_argument("--id", required=True); s.add_argument("--title")
    s.add_argument("--text"); s.add_argument("--from", dest="from_"); s.add_argument("--to"); s.add_argument("--link")
    s = cmd("remove-notice", "remove a notice"); s.add_argument("--id", required=True)

    s = cmd("cancel", "cancel one occurrence (minyanim go to a gabbai)"); ref_args(s); s.add_argument("--note")
    s = cmd("retime", "move one occurrence to HH:MM (minyanim go to a gabbai)"); ref_args(s)
    s.add_argument("--time", required=True); s.add_argument("--note")
    s = cmd("note", "put a note on one occurrence"); ref_args(s); s.add_argument("--note", required=True)
    s = cmd("undo-change", "remove a cancel/retime/note from an occurrence"); ref_args(s)
    s.add_argument("--type", choices=["cancel", "retime", "note"])

    s = cmd("create-event", "create a one-time event")
    s.add_argument("--name", required=True); s.add_argument("--date", required=True); s.add_argument("--time", required=True)
    for f in ("end", "kind", "category", "audience", "speaker", "topic", "description", "room", "location", "link", "note"):
        s.add_argument("--" + f)

    def person(name, help_, occasion=False):
        s = cmd(name, help_)
        s.add_argument("--name", help="display name (English)"); s.add_argument("--hebrew-name")
        s.add_argument("--date", help="civil date YYYY-MM-DD")
        s.add_argument("--hebrew-date", help="DAY/MONTH or DAY/MONTH/YEAR (month 1 Nisan ... 6 Elul, 7 Tishrei ... 12 Adar, 13 Adar II)")
        s.add_argument("--hide-from-bulletin", action="store_true")
        if occasion:
            s.add_argument("--by", choices=["hebrew", "gregorian"])
    person("add-yahrzeit", "add a yahrzeit")
    person("add-birthday", "add a birthday", True)
    person("add-anniversary", "add an anniversary", True)
    s = cmd("remove-person", "remove a yahrzeit, birthday or anniversary")
    s.add_argument("--kind", required=True, choices=["yahrzeit", "birthday", "anniversary"])
    s.add_argument("--id"); s.add_argument("--match")

    s = cmd("add-refuah", "add a name for refuah shleimah"); s.add_argument("--name", required=True)
    for n in ("remove-refuah", "renew-refuah"):
        s = cmd(n, n.replace("-", " ")); s.add_argument("--id"); s.add_argument("--match")

    s = cmd("undo", "undo a change made with this key"); s.add_argument("--change", required=True)
    s = cmd("op", "send any operation as JSON"); s.add_argument("--json", required=True)
    return p


def run(argv=None, client=None):
    a = parser().parse_args(argv)
    if client is None:
        client = Client(load_config(a.config))
    c = a.cmd
    if c == "upcoming":
        res = client.get("/upcoming", {"days": a.days})
        events = res.get("events") if isinstance(res, dict) else res
        emit(res, "%d upcoming events for %s" % (len(events or []), client.shul) if isinstance(events, list) else None)
    elif c in ("notices", "info", "cholim"):
        emit(client.get("/" + c))
    elif c in ("pending", "changes"):
        st = a.status
        res = client.get("/changes", {"status": None if st == "all" else st})
        n = len(res.get("changes", [])) if isinstance(res, dict) else 0
        emit(res, "%d change(s)" % n)
    elif c == "undo":
        res = client.undo(a.change)
        emit(res, "undone: change %s" % a.change)
    else:
        op = build(a)
        res = client.op(op)
        emit(res, summarize(op, res))
    return 0


def main(argv=None):
    try:
        return run(argv)
    except ApiError as e:
        out = {"error": {"code": e.code, "message": e.message}}
        if e.details is not None:
            out["error"]["details"] = e.details
        sys.stdout.write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        sys.stderr.write("Error (%s): %s\n" % (e.code, e.message))
        return 1


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    sys.exit(main())
