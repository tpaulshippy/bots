#!/usr/bin/env python3
"""Assert the three places that carry the schedule agree, and that nothing expired.

The rollout date lives in three files at once -- the POSTS.md headers an author
reads, the ROLLOUT.md table they plan from, and the .ics they import. They are
edited separately, so they drift: the October reschedule moved the table and the
calendar but left the POSTS.md headers on the old October 1 and 3 dates, and
nothing complained.

    python3 scripts/check-rollout-schedule.py

Exits non-zero and lists every disagreement. Run it after editing any of the
three, and before treating the schedule as settled.
"""
import datetime
import pathlib
import re
import sys

root = pathlib.Path("docs/marketing/1.0.6")
posts = (root / "POSTS.md").read_text()
roll = (root / "ROLLOUT.md").read_text()
raw = open(root / "rollout-schedule.ics", newline="").read()

# unfold RFC 5545 continuation lines
un = []
for l in raw.split("\r\n"):
    if l.startswith(" "):
        un[-1] += l[1:]
    else:
        un.append(l)

ics = {}
for l in un:
    if l.startswith("DTSTART;TZID"):
        v = l.split(":", 1)[1]
        cur = datetime.date(2026, int(v[4:6]), int(v[6:8]))
        t = v[9:11] + ":" + v[11:13]
    elif l.startswith("SUMMARY:"):
        m = re.match(r"SUMMARY:Syft 1\.0\.6 . ([AB]\d)", l)
        if m:
            ics.setdefault(m.group(1), set()).add((cur, t))

# POSTS.md headers: "### A1 · Wed Oct 7 · 17:00 MST · ..."
hdr = {}
for m in re.finditer(r"^### ([AB]\d) · \w+ Oct (\d+) · ([0-9:, and]+?) MST", posts, re.M):
    aid, day, times = m.group(1), int(m.group(2)), m.group(3)
    hdr[aid] = (datetime.date(2026, 10, day), set(re.findall(r"\d\d:\d\d", times)))

# ROLLOUT.md rows, matched by the post id in the Proposition/Where columns
tbl = {}
for m in re.finditer(r"^\| (?:Wed|Thu|Sat) \| Oct (\d+) \| (\d\d:\d\d) \|.*?([AB]\d) ", roll, re.M):
    tbl.setdefault(m.group(3), set()).add((datetime.date(2026, 10, int(m.group(1))), m.group(2)))

bad = []
for aid in sorted(set(ics) | set(hdr)):
    cal = ics.get(aid)                       # {(date, time)}
    hd, ht = hdr.get(aid, (None, set()))
    cal_d = {d for d, _ in cal} if cal else set()
    cal_t = {t for _, t in cal} if cal else set()
    if not cal:
        bad.append(f"{aid}: in POSTS.md header but not in the calendar")
    if not hd:
        bad.append(f"{aid}: in the calendar but not in a POSTS.md header")
    if cal and hd and cal_d != {hd}:
        bad.append(f"{aid}: calendar has {sorted(cal_d)} but the header says {hd}")
    if cal and ht and cal_t != ht:
        bad.append(f"{aid}: calendar times {sorted(cal_t)} != header {sorted(ht)}")
    if cal and tbl.get(aid) and tbl[aid] != cal:
        bad.append(f"{aid}: calendar {sorted(cal)} != ROLLOUT table {sorted(tbl[aid])}")

today = datetime.date(2026, 10, 6)
expired = sorted({d for s in ics.values() for d, _ in s if d < today})
if expired:
    bad.append(f"expired entries still scheduled: {expired}")

if bad:
    sys.exit("schedule disagreement:\n  " + "\n  ".join(bad))
print(f"OK: {len(ics)} posts agree across POSTS.md, ROLLOUT.md and the .ics")
