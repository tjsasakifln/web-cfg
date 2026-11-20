#!/usr/bin/env python3
"""Observe a Linux command without changing its scheduling or its measurements.

Usage: python lighthouse_scheduler_observer.py --output observations.jsonl -- COMMAND ...

The JSONL file is diagnostic evidence, never release qualification. Each record
has CLOCK_MONOTONIC timestamps and explicit read windows. Clock anchors bracket
reads of REALTIME, BOOTTIME and MONOTONIC_RAW; correspondence to a Chrome trace
must be established separately. The fixed cadence is 20 ms. Missed slots are
reported and skipped, rather than followed by a burst of catch-up reads.

Only process/thread leaders in the observed command's descendant tree are
sampled. PID and TID start times identify their lifetime. Raw commands, process
names, executable paths, environments and page contents are not recorded.
stdout, stderr and stdin are inherited by the command. Received termination
signals go only to that direct child; its existing supervisor owns descendant
cleanup. The observer never changes sysctls, affinity, priorities or cgroups.

schedstat values are cumulative nanoseconds/nanoseconds/timeslices. An all-zero
counter is not proof of no delay: the kernel toggle and observed counter activity
are retained. wchan=0 is recorded as hidden/unknown, not as absence of blocking.
PSI and steal describe the host; neither attributes a delay to a particular task.
"""

import argparse
import collections
import errno
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


PERIOD_NS = 20_000_000
SCHEMA = "confenge.lighthouse-scheduler-diagnostic/1.0"
ROLE_NAMES = {
    "CrBrowserMain": "browser_main",
    "CrRendererMain": "renderer_main",
    "CrGpuMain": "gpu_main",
    "node": "node_main",
    "nodejs": "node_main",
    "chrome": "chrome_main",
    "chromium": "chrome_main",
}


def mono():
    return time.clock_gettime_ns(time.CLOCK_MONOTONIC)


def unavailable(reason):
    return {"available": False, "reason": reason}


def read_text(path):
    try:
        return Path(path).read_text(encoding="ascii", errors="replace"), None
    except OSError as exc:
        return None, errno.errorcode.get(exc.errno, "OS_ERROR")


def process_stat(pid, tid=None):
    path = f"/proc/{pid}/stat" if tid is None else f"/proc/{pid}/task/{tid}/stat"
    text, error = read_text(path)
    if error:
        return None, error
    try:
        prefix, tail = text.rsplit(") ", 1)
        name = prefix.split("(", 1)[1]  # Used only for a fixed role label.
        fields = tail.split()
        return {
            "pid": pid, "ppid": int(fields[1]), "starttime_ticks": int(fields[19]),
            "state": fields[0], "role": ROLE_NAMES.get(name, "main_thread"),
        }, None
    except (ValueError, IndexError):
        return None, "PARSE_ERROR"


def identity(stat):
    return stat["pid"], stat["starttime_ticks"]


def clock_anchor():
    before = mono()
    values = {}
    for name in ("CLOCK_REALTIME", "CLOCK_BOOTTIME", "CLOCK_MONOTONIC_RAW"):
        clock_id = getattr(time, name, None)
        if clock_id is None:
            values[name] = unavailable("CLOCK_NOT_EXPOSED")
        else:
            try:
                values[name] = {"available": True, "value_ns": time.clock_gettime_ns(clock_id)}
            except OSError as exc:
                values[name] = unavailable(errno.errorcode.get(exc.errno, "OS_ERROR"))
    after = mono()
    return {
        "monotonic_before_ns": before, "monotonic_after_ns": after,
        "read_window_ns": after - before, "other_clocks": values,
        "chrome_trace_clock_alignment": "UNVERIFIED",
    }


def kernel_schedstats():
    before = mono()
    text, error = read_text("/proc/sys/kernel/sched_schedstats")
    if error:
        result = unavailable(error)
    elif text.strip() in ("0", "1"):
        result = {"available": True, "enabled": text.strip() == "1"}
    else:
        result = unavailable("UNRECOGNIZED_VALUE")
    return {**result, "read_started_ns": before, "read_finished_ns": mono()}


def counters(path, names):
    text, error = read_text(path)
    if error:
        return unavailable(error)
    try:
        parts = text.split()
        if len(parts) != len(names):
            return unavailable("UNEXPECTED_FIELD_COUNT")
        values = dict(zip(names, (int(x) for x in parts)))
        if any(x < 0 for x in values.values()):
            return unavailable("NEGATIVE_COUNTER")
        return {"available": True, "values": values}
    except ValueError:
        return unavailable("PARSE_ERROR")


def status_counters(pid):
    text, error = read_text(f"/proc/{pid}/task/{pid}/status")
    if error:
        return unavailable(error)
    fields = {}
    for line in text.splitlines():
        key, sep, value = line.partition(":")
        if sep and key in ("State", "voluntary_ctxt_switches", "nonvoluntary_ctxt_switches"):
            fields[key] = value.strip()
    try:
        return {
            "available": True, "state": fields["State"].split()[0],
            "values": {
                "voluntary_context_switches": int(fields["voluntary_ctxt_switches"]),
                "nonvoluntary_context_switches": int(fields["nonvoluntary_ctxt_switches"]),
            },
        }
    except (KeyError, ValueError, IndexError):
        return unavailable("MISSING_OR_INVALID_FIELDS")


def wchan(pid):
    text, error = read_text(f"/proc/{pid}/task/{pid}/wchan")
    if error:
        return unavailable(error)
    symbol = text.strip()
    if not symbol or symbol == "0":
        return {"available": True, "symbol_exposed": False, "symbol": None,
                "meaning": "ZERO_OR_HIDDEN_NOT_PROOF_OF_NO_BLOCKING"}
    return {"available": True, "symbol_exposed": True, "symbol": symbol}


def delta(current, previous):
    if not current.get("available"):
        return unavailable("CURRENT_COUNTERS_UNAVAILABLE")
    if not previous or not previous.get("available"):
        return unavailable("NO_VALID_PREVIOUS_READING")
    old, new = previous["values"], current["values"]
    if old.keys() != new.keys() or any(new[k] < old[k] for k in new):
        return unavailable("COUNTER_RESET_OR_FIELD_CHANGE")
    return {"available": True, "values": {k: new[k] - old[k] for k in new}}


def cpu_stat():
    text, error = read_text("/proc/stat")
    if error:
        return unavailable(error)
    try:
        fields = next(line.split()[1:] for line in text.splitlines() if line.startswith("cpu "))
        if len(fields) < 8:
            return unavailable("STEAL_FIELD_ABSENT")
        values = [int(x) for x in fields[:8]]
        if any(x < 0 for x in values):
            return unavailable("NEGATIVE_COUNTER")
        return {"available": True, "values": {
            "steal_ticks": values[7], "total_cpu_ticks_excluding_guest": sum(values),
        }}
    except (ValueError, StopIteration):
        return unavailable("PARSE_ERROR")


def pressure(kind):
    text, error = read_text(f"/proc/pressure/{kind}")
    if error:
        return unavailable(error)
    values = {}
    try:
        for line in text.splitlines():
            fields = line.split()
            if fields and fields[0] in ("some", "full"):
                pairs = dict(part.split("=", 1) for part in fields[1:])
                values[fields[0] + "_total_us"] = int(pairs["total"])
        if "some_total_us" not in values or any(v < 0 for v in values.values()):
            return unavailable("MISSING_OR_INVALID_TOTALS")
        return {"available": True, "values": values, "scope": "system",
                "cpu_full_warning": "SYSTEM_CPU_FULL_UNDEFINED" if kind == "cpu" else None}
    except (ValueError, KeyError):
        return unavailable("PARSE_ERROR")


class Observer:
    def __init__(self, root_identity):
        self.root_identity = root_identity
        self.owned = {root_identity} if root_identity else set()
        self.previous_threads = {}
        self.previous_system = {}

    def discover(self):
        started = mono()
        snapshot, read_errors = {}, collections.Counter()
        try:
            with os.scandir("/proc") as entries:
                pids = [int(entry.name) for entry in entries if entry.name.isdecimal()]
        except OSError as exc:
            return [], {**unavailable(errno.errorcode.get(exc.errno, "OS_ERROR")),
                        "read_started_ns": started, "read_finished_ns": mono()}
        for pid in pids:
            stat, error = process_stat(pid)
            if error:
                read_errors[error] += 1
            else:
                snapshot[pid] = stat
        children = collections.defaultdict(list)
        for stat in snapshot.values():
            children[stat["ppid"]].append(stat["pid"])
        pending = [pid for pid, stat in snapshot.items() if identity(stat) in self.owned]
        selected = set(pending)
        verified_new_links = 0
        while pending:
            parent_pid = pending.pop()
            for pid in children[parent_pid]:
                if pid not in selected:
                    # A /proc census is not atomic. Recheck both lifetimes and
                    # the parent link before claiming a previously unseen PID.
                    current_child, child_error = process_stat(pid)
                    current_parent, parent_error = process_stat(parent_pid)
                    if (child_error or parent_error
                            or identity(current_child) != identity(snapshot[pid])
                            or identity(current_parent) != identity(snapshot[parent_pid])
                            or current_child["ppid"] != parent_pid):
                        read_errors["ANCESTRY_CHANGED_DURING_DISCOVERY"] += 1
                        continue
                    selected.add(pid)
                    pending.append(pid)
                    verified_new_links += 1
        rows = [snapshot[pid] for pid in sorted(selected)]
        self.owned.update(identity(stat) for stat in rows)
        return rows, {
            "available": True, "read_started_ns": started, "read_finished_ns": mono(),
            "proc_entries_examined": len(pids), "stat_read_errors_by_code": dict(read_errors),
            "descendant_processes_present": len(rows),
            "root_included": any(identity(stat) == self.root_identity for stat in rows),
            "new_parent_links_revalidated": verified_new_links,
        }

    def process_kind(self, stat):
        # exec can change the executable without changing PID or starttime.
        try:
            name = os.path.basename(os.readlink(f"/proc/{stat['pid']}/exe"))
            if name in ("node", "nodejs"):
                return "node"
            if name in ("chrome", "chromium", "chromium-browser", "headless_shell",
                        "chrome-headless-shell", "chrome_crashpad_handler"):
                return "chrome"
            return "other"
        except OSError:
            return "unknown"

    def sample_thread(self, expected, toggle):
        started = mono()
        pid = expected["pid"]
        initial, error = process_stat(pid, pid)
        base = {
            "pid": pid, "process_starttime_ticks": expected["starttime_ticks"],
            "tid": pid, "thread_starttime_ticks": initial["starttime_ticks"] if initial else None,
            "parent_pid": expected["ppid"], "kind": self.process_kind(expected),
            "role": initial["role"] if initial else "unknown", "read_started_ns": started,
        }
        if error or identity(initial) != identity(expected):
            return {**base, **unavailable(error or "IDENTITY_CHANGED"), "read_finished_ns": mono()}
        sched = counters(f"/proc/{pid}/task/{pid}/schedstat",
                         ("runtime_ns", "runqueue_wait_ns", "timeslices"))
        status = status_counters(pid)
        wait_channel = wchan(pid)
        final, final_error = process_stat(pid, pid)
        finished = mono()
        if final_error or identity(final) != identity(initial):
            return {**base, **unavailable(final_error or "IDENTITY_CHANGED_DURING_READ"),
                    "read_finished_ns": finished}
        key = (pid, expected["starttime_ticks"], pid, initial["starttime_ticks"])
        previous = self.previous_threads.get(key)
        sched_delta = delta(sched, previous["schedstat"] if previous else None)
        context_delta = delta(status, previous["status"] if previous else None)
        self.previous_threads[key] = {"schedstat": sched, "status": status,
                                      "read_started_ns": started, "read_finished_ns": finished}
        return {
            **base, "available": True, "read_finished_ns": finished,
            "state_before": initial["state"], "state_after": final["state"],
            "schedstat": sched, "schedstat_delta": sched_delta,
            "schedstats_toggle_enabled": toggle.get("enabled"),
            "runqueue_accounting_status": (
                "ENABLED" if toggle.get("enabled") is True else
                "DISABLED" if toggle.get("enabled") is False else "UNKNOWN"
            ),
            "schedstat_counter_activity": {
                k: v > 0 for k, v in sched.get("values", {}).items()
            } if sched.get("available") else None,
            "all_zero_counters_do_not_establish_no_delay": True,
            "status": status, "context_switch_delta": context_delta, "wchan": wait_channel,
            "previous_read_window": {
                "started_ns": previous["read_started_ns"],
                "finished_ns": previous["read_finished_ns"],
            } if previous else None,
        }

    def system_sample(self):
        result = {}
        readers = {"cpu": cpu_stat, **{f"psi_{k}": (lambda k=k: pressure(k))
                                       for k in ("cpu", "io", "memory")}}
        for name, reader in readers.items():
            started = mono()
            current = reader()
            finished = mono()
            old = self.previous_system.get(name)
            result[name] = {
                **current, "read_started_ns": started, "read_finished_ns": finished,
                "delta": delta(current, old),
                "previous_read_window": {
                    "started_ns": old["read_started_ns"], "finished_ns": old["read_finished_ns"],
                } if old else None,
            }
            self.previous_system[name] = {**current, "read_started_ns": started,
                                          "read_finished_ns": finished}
        return result


def write_record(output, record):
    started = mono()
    text = json.dumps(record, ensure_ascii=True, separators=(",", ":")) + "\n"
    output.write(text)
    return {"duration_ns": mono() - started, "bytes": len(text)}


def forward_signal(child, child_identity, pidfd, signum):
    event = {"signal": signum, "monotonic_ns": mono(), "recipient": "direct_child_only"}
    if child.poll() is not None:
        return {**event, "forwarded": False, "reason": "CHILD_ALREADY_EXITED"}
    try:
        if pidfd is not None and hasattr(signal, "pidfd_send_signal"):
            signal.pidfd_send_signal(pidfd, signum)
            return {**event, "forwarded": True, "method": "pidfd"}
        stat, error = process_stat(child.pid)
        if error or child_identity is None or identity(stat) != child_identity:
            return {**event, "forwarded": False, "reason": error or "IDENTITY_NOT_CONFIRMED"}
        child.send_signal(signum)
        return {**event, "forwarded": True, "method": "owned_child_starttime_checked"}
    except OSError as exc:
        return {**event, "forwarded": False, "reason": errno.errorcode.get(exc.errno, "OS_ERROR")}


def run(output, command):
    pending_signals = []
    previous_handlers = {}
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        previous_handlers[signum] = signal.signal(signum, lambda sig, frame: pending_signals.append(sig))
    child, pidfd = None, None
    try:
        write_record(output, {
            "event": "header", "schema": SCHEMA, "release_qualification_eligible": False,
            "clock": "CLOCK_MONOTONIC", "period_ns": PERIOD_NS,
            "clock_ticks_per_second": os.sysconf("SC_CLK_TCK"),
            "observer_pid": os.getpid(), "clock_anchor": clock_anchor(),
            "kernel_sched_schedstats": kernel_schedstats(),
            "kernel_schedstats_note": "Read-only; disabled or absent accounting cannot establish zero queue delay",
            "thread_scope": "leaders_of_command_and_observed_descendants",
            "counter_units": {"schedstat": "nanoseconds,nanoseconds,timeslices",
                              "psi_totals": "microseconds", "proc_stat": "clock_ticks"},
            "availability_policy": "unreadable_or_unidentified_is_unavailable; zero_is_not_proof_of_no_delay",
            "termination_policy": "forward_to_direct_child; child_supervisor_owns_descendants",
            "sampling_policy": "fixed_schedule; missed_slots_recorded_without_catch_up",
        })
        output.flush()
        try:
            child = subprocess.Popen(command, start_new_session=True)
        except OSError as exc:
            write_record(output, {"event": "child_start_failed", "monotonic_ns": mono(),
                                  "reason": errno.errorcode.get(exc.errno, "OS_ERROR")})
            return 127 if exc.errno == errno.ENOENT else 126
        if hasattr(os, "pidfd_open"):
            try:
                pidfd = os.pidfd_open(child.pid)
            except OSError:
                pass
        initial, initial_error = process_stat(child.pid)
        root_identity = identity(initial) if initial else None
        write_record(output, {"event": "child_started", "monotonic_ns": mono(), "pid": child.pid,
                              "starttime_ticks": root_identity[1] if root_identity else None,
                              "identity_error": initial_error, "pidfd_available": pidfd is not None})
        observer = Observer(root_identity)
        due, sequence, skipped_total, errors = mono(), 0, 0, 0
        samples_with_threads = 0
        previous_cost = None
        max_lateness, max_collection_cost, total_collection_cpu = 0, 0, 0
        max_sample_wall_cost, total_sample_cpu = 0, 0
        output_available = True
        while child.poll() is None:
            for signum in pending_signals[:]:
                pending_signals.pop(0)
                event = forward_signal(child, root_identity, pidfd, signum)
                if output_available:
                    try:
                        write_record(output, {"event": "signal", **event})
                    except OSError:
                        output_available = False
                        sys.stderr.write("observer: diagnostic output unavailable; child continues\n")
            if not output_available:
                time.sleep(PERIOD_NS / 1_000_000_000)
                continue
            wait_ns = due - mono()
            if wait_ns > 0:
                time.sleep(wait_ns / 1_000_000_000)
            started, cpu_started = mono(), time.process_time_ns()
            lateness = max(0, started - due)
            max_lateness = max(max_lateness, lateness)
            try:
                toggle = kernel_schedstats()
                processes, discovery = observer.discover()
                threads = [observer.sample_thread(stat, toggle) for stat in processes]
                if any(thread.get("available") for thread in threads):
                    samples_with_threads += 1
                system = observer.system_sample()
                collection_finished = mono()
                cpu_cost = time.process_time_ns() - cpu_started
                total_collection_cpu += cpu_cost
                collection_cost = collection_finished - started
                max_collection_cost = max(max_collection_cost, collection_cost)
                record = {
                    "event": "sample", "sequence": sequence, "scheduled_ns": due,
                    "started_ns": started, "collection_finished_ns": collection_finished,
                    "lateness_ns": lateness, "collection_cost_ns": collection_cost,
                    "collection_cpu_ns": cpu_cost, "previous_sample_cost": previous_cost,
                    "kernel_sched_schedstats": toggle, "discovery": discovery,
                    "threads": threads, "system": system,
                }
                if sequence % 50 == 0:
                    record["clock_anchor"] = clock_anchor()
            except Exception as exc:
                errors += 1
                record = {"event": "sample_error", "sequence": sequence,
                          "started_ns": started, "finished_ns": mono(),
                          "exception_type": type(exc).__name__}
            output_cost = None
            if output_available:
                try:
                    output_cost = write_record(output, record)
                except OSError:
                    output_available = False
                    sys.stderr.write("observer: diagnostic output unavailable; child continues\n")
            finished = mono()
            next_due = due + PERIOD_NS
            skipped = max(0, (finished - next_due) // PERIOD_NS + 1) if finished >= next_due else 0
            skipped_total += skipped
            previous_cost = {
                "sequence": sequence, "finished_ns": finished,
                "wall_cost_ns": finished - started,
                "cpu_cost_ns": time.process_time_ns() - cpu_started,
                "output_cost": output_cost, "skipped_slots_after_sample": skipped,
            }
            max_sample_wall_cost = max(max_sample_wall_cost, previous_cost["wall_cost_ns"])
            total_sample_cpu += previous_cost["cpu_cost_ns"]
            due = next_due + skipped * PERIOD_NS
            sequence += 1
        returncode = child.wait()
        if output_available:
            try:
                write_record(output, {
                    "event": "end", "schema": SCHEMA, "monotonic_ns": mono(),
                    "release_qualification_eligible": False, "child_returncode": returncode,
                    "samples": sequence, "sample_errors": errors,
                    "root_identity_observed": root_identity is not None,
                    "samples_with_available_threads": samples_with_threads,
                    "skipped_slots": skipped_total, "max_lateness_ns": max_lateness,
                    "max_collection_cost_ns": max_collection_cost,
                    "collection_cpu_ns_total": total_collection_cpu,
                    "max_sample_wall_cost_ns": max_sample_wall_cost,
                    "sample_cpu_ns_total": total_sample_cpu,
                    "last_sample_cost": previous_cost, "clock_anchor": clock_anchor(),
                    "collection_completed": errors == 0,
                    "thread_observations_available": samples_with_threads > 0,
                })
                output.flush()
            except OSError:
                sys.stderr.write("observer: final diagnostic record unavailable\n")
        return returncode
    except Exception:
        if child is None:
            raise
        # An observer failure must not orphan the command or replace its status.
        # No exception messages are emitted: they can contain command arguments.
        sys.stderr.write("observer: collection interrupted; waiting for the original child\n")
        while child.poll() is None:
            for signum in pending_signals[:]:
                pending_signals.pop(0)
                forward_signal(child, locals().get("root_identity"), pidfd, signum)
            time.sleep(PERIOD_NS / 1_000_000_000)
        return child.wait()
    finally:
        if pidfd is not None:
            os.close(pidfd)
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        self.exit(2, "observer: invalid arguments\n")


def main():
    parser = Parser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", required=True, help="New JSONL path; existing files are preserved")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Command after --")
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or not sys.platform.startswith("linux"):
        parser.error("Linux and a command are required")
    try:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        output = os.fdopen(fd, "w", encoding="ascii", buffering=65536)
    except OSError:
        sys.stderr.write("observer: could not create diagnostic output\n")
        return 2
    try:
        status = run(output, command)
    except Exception:
        sys.stderr.write("observer: could not start collection\n")
        status = 2
    try:
        output.close()
    except OSError:
        sys.stderr.write("observer: diagnostic output could not be finalized\n")
    return status


if __name__ == "__main__":
    status = main()
    if status < 0:
        signum = -status
        try:
            signal.signal(signum, signal.SIG_DFL)
        except (OSError, ValueError):
            pass
        os.kill(os.getpid(), signum)
        os._exit(128 + signum)
    raise SystemExit(status)
