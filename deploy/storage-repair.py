#!/usr/bin/env python3
"""Repairs the kiosk Chromium profile's Local Storage before Chromium starts.

Runs as an ExecStartPre of bedlog-kiosk.service (see install.sh).

Why: a power cut can leave a zero-filled hole in Local Storage's leveldb
log (000NNN.log). On open, leveldb treats a zero record (or any bad record)
as the end of that 32 KB block and skips the rest of it. It then keeps
appending to the same log, so every write that lands after the hole is
lost again at each boot. On WARD5 (2026-10-29) that hid three complete
onboardings, and the device always came up as "not set up".

What it does: when the log has any bytes leveldb would skip, it collects
every intact record (CRC-checked) in the order they were written and
rewrites the log as one clean batch holding the resulting state. A copy of
the damaged files is kept first. It does nothing when the log is clean,
when Chromium holds the database lock, or when anything looks unexpected.
It never stops the kiosk from starting: the unit ignores its exit code.

usage: storage-repair.py [<leveldb dir>]
"""
import fcntl
import glob
import os
import shutil
import struct
import sys
import time

DEFAULT_DIR = "/home/pi/.config/bedlog-chromium/Default/Local Storage/leveldb"
BLOCK = 32768
HEADER = 7
FULL, FIRST, MIDDLE, LAST = 1, 2, 3, 4
MAX_LOG_BYTES = 16 * 1024 * 1024
KEEP_BACKUPS = 5


def log(msg):
    print(f"storage-repair: {msg}", flush=True)


# ── CRC32C (Castagnoli), masked as leveldb stores it ─────────────────────────
_T = []
for _i in range(256):
    _c = _i
    for _ in range(8):
        _c = (_c >> 1) ^ 0x82F63B78 if _c & 1 else _c >> 1
    _T.append(_c)


def crc32c(data):
    c = 0xFFFFFFFF
    for b in data:
        c = _T[(c ^ b) & 0xFF] ^ (c >> 8)
    return c ^ 0xFFFFFFFF


def mask(crc):
    return ((((crc >> 15) | (crc << 17)) & 0xFFFFFFFF) + 0xA282EAD8) & 0xFFFFFFFF


def record_ok(buf, p, block_end):
    """Header at p is a valid physical record ending inside its block."""
    if p + HEADER > block_end:
        return None
    crc, length, typ = struct.unpack_from("<IHB", buf, p)
    if typ not in (FULL, FIRST, MIDDLE, LAST) or p + HEADER + length > block_end:
        return None
    payload = buf[p + HEADER:p + HEADER + length]
    if mask(crc32c(bytes([typ]) + payload)) != crc:
        return None
    return typ, payload


# ── Reading ──────────────────────────────────────────────────────────────────
def strict_read(buf):
    """What leveldb's log::Reader recovers: (batches, dropped_bytes)."""
    batches, dropped, frag = [], 0, None
    for start in range(0, len(buf), BLOCK):
        end = min(start + BLOCK, len(buf))
        p = start
        while end - p >= HEADER:
            rec = record_ok(buf, p, end)
            if rec is None:
                # Zero record, bad checksum or torn record: the rest of the
                # block goes. Even an all-zero tail counts: leveldb appends
                # after it, so the next writes would land in the skipped part.
                dropped += end - p
                break
            typ, payload = rec
            if typ == FULL:
                batches.append(payload)
                frag = None
            elif typ == FIRST:
                frag = payload
            elif typ == MIDDLE and frag is not None:
                frag += payload
            elif typ == LAST and frag is not None:
                batches.append(frag + payload)
                frag = None
            p += HEADER + len(payload)
    return batches, dropped


def salvage_read(buf):
    """Every intact record in file order, resyncing past holes and bad bytes."""
    batches, frag = [], None
    for start in range(0, len(buf), BLOCK):
        end = min(start + BLOCK, len(buf))
        p = start
        while end - p >= HEADER:
            if buf[p] == 0 and not any(buf[p:p + HEADER]):
                p += 1  # inside a zero hole
                continue
            rec = record_ok(buf, p, end)
            if rec is None:
                p += 1
                continue
            typ, payload = rec
            if typ == FULL:
                batches.append(payload)
                frag = None
            elif typ == FIRST:
                frag = payload
            elif typ == MIDDLE and frag is not None:
                frag += payload
            elif typ == LAST and frag is not None:
                batches.append(frag + payload)
                frag = None
            p += HEADER + len(payload)
    return batches


def varint(b, p):
    r = s = 0
    while True:
        c = b[p]
        p += 1
        r |= (c & 0x7F) << s
        s += 7
        if not c & 0x80:
            return r, p


def apply_batches(batches):
    """Final {key: value or None(deleted)} and the highest sequence seen."""
    state, max_seq = {}, 0
    for rec in batches:
        if len(rec) < 12:
            continue
        seq, count = struct.unpack_from("<QI", rec, 0)
        max_seq = max(max_seq, seq + count)
        p = 12
        try:
            for _ in range(count):
                tag = rec[p]
                p += 1
                klen, p = varint(rec, p)
                key = bytes(rec[p:p + klen])
                p += klen
                if tag == 1:
                    vlen, p = varint(rec, p)
                    state[key] = bytes(rec[p:p + vlen])
                    p += vlen
                elif tag == 0:
                    state[key] = None
                else:
                    raise ValueError(f"unknown tag {tag}")
        except (IndexError, ValueError):
            raise ValueError("malformed batch")
    return state, max_seq


# ── Writing (leveldb log::Writer::AddRecord) ─────────────────────────────────
def put_varint(n):
    out = bytearray()
    while n >= 0x80:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)


def encode_batch(state, seq):
    body = bytearray()
    for key in sorted(state):
        val = state[key]
        if val is None:
            body += b"\x00" + put_varint(len(key)) + key
        else:
            body += b"\x01" + put_varint(len(key)) + key + put_varint(len(val)) + val
    return struct.pack("<QI", seq, len(state)) + bytes(body)


def encode_log(record):
    out = bytearray()
    left, ptr, begin = len(record), 0, True
    while True:
        leftover = BLOCK - len(out) % BLOCK
        if leftover < HEADER:
            out += b"\x00" * leftover  # block trailer
            leftover = BLOCK
        avail = leftover - HEADER
        n = min(left, avail)
        end = n == left
        typ = FULL if begin and end else FIRST if begin else LAST if end else MIDDLE
        payload = record[ptr:ptr + n]
        out += struct.pack("<IHB", mask(crc32c(bytes([typ]) + payload)), n, typ) + payload
        ptr += n
        left -= n
        begin = False
        if end:
            return bytes(out)


# ── Main ─────────────────────────────────────────────────────────────────────
def describe(state):
    """Short summary of the Bedlog setup inside a state, for the journal."""
    import json
    for key, val in state.items():
        if val is not None and key.endswith(b"\x00\x01bl_config"):
            try:
                text = val[1:].decode("latin-1") if val[:1] == b"\x01" else val[1:].decode("utf-16-le")
                cfg = json.loads(text)
                wards = ", ".join(w.get("name", "?") for w in cfg.get("wards", []))
                return f"hospital {cfg.get('hospitalId') or 'none'}, wards [{wards}]"
            except Exception:
                return "unreadable bl_config"
    return "no bl_config"


def live(state):
    return {k: v for k, v in state.items() if v is not None}


def main():
    ldb = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR
    if not os.path.isdir(ldb):
        return 0
    logs = sorted(glob.glob(os.path.join(ldb, "*.log")))
    if len(logs) != 1:
        log(f"expected one .log in {ldb}, found {len(logs)}; leaving it alone")
        return 0
    path = logs[0]

    try:
        lock = open(os.path.join(ldb, "LOCK"), "a+")
        fcntl.lockf(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("database is in use (Chromium running?); leaving it alone")
        return 0

    size = os.path.getsize(path)
    if size > MAX_LOG_BYTES:
        log(f"{path} is {size} bytes, over the {MAX_LOG_BYTES} limit; leaving it alone")
        return 0
    buf = open(path, "rb").read()

    strict_batches, dropped = strict_read(buf)
    if dropped == 0:
        return 0  # clean: the normal case, say nothing

    before, _ = apply_batches(strict_batches)
    after, max_seq = apply_batches(salvage_read(buf))
    log(f"{os.path.basename(path)}: leveldb would skip {dropped} of {len(buf)} bytes")
    log(f"setup visible to Chromium now: {describe(before)}")
    log(f"setup after repair:            {describe(after)}")

    new = encode_log(encode_batch(after, max_seq + 1))
    check_batches, check_dropped = strict_read(new)
    check, _ = apply_batches(check_batches)
    if check_dropped or live(check) != live(after):
        log("repaired log failed verification; leaving it alone")
        return 1

    profile = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(ldb))))
    backups = os.path.join(profile, "bedlog-storage-backups")
    os.makedirs(backups, exist_ok=True)
    dest = os.path.join(backups, time.strftime("leveldb-%Y%m%d-%H%M%S"))
    shutil.copytree(ldb, dest, ignore=shutil.ignore_patterns("LOCK"))
    for old in sorted(glob.glob(os.path.join(backups, "leveldb-*")))[:-KEEP_BACKUPS]:
        shutil.rmtree(old, ignore_errors=True)

    tmp = path + ".repair"
    with open(tmp, "wb") as f:
        f.write(new)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    dfd = os.open(ldb, os.O_RDONLY)
    try:
        os.fsync(dfd)
    finally:
        os.close(dfd)
    log(f"repaired: {len(live(after))} keys rewritten; damaged copy kept in {dest}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # never block the kiosk
        log(f"error: {e}")
        sys.exit(1)
