# =============================================================================
#  shutdown.py - stop the GA visualizer web server
#  ---------------------------------------------------------------------------
#  Two attempts, in this order:
#
#    1. ask the server to stop itself, by calling POST /api/shutdown
#    2. if that does not work (no answer, or an older server without that
#       endpoint), find whatever python process is listening on the port and
#       stop it
#
#  Run it with:   python shutdown.py
#                 python shutdown.py 5001        (a different port)
#
#  Only 127.0.0.1 is touched, and step 2 only stops a process whose program
#  name looks like python, so it can never take down something unrelated that
#  happens to hold the port.
# =============================================================================

import sys
import socket
import subprocess
import time
import json
import urllib.request
import urllib.error


DEFAULT_PORT = 5000
HOST = "127.0.0.1"


# =============================================================================
#  helpers
# =============================================================================

def is_listening(port):
    """True if something accepts connections on the port right now."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.6)
    try:
        probe.connect((HOST, port))
        return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False
    finally:
        probe.close()


def wait_until_closed(port, seconds):
    """Wait for the port to go quiet. True if it did, False on timeout."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        if not is_listening(port):
            return True
        time.sleep(0.25)
    return not is_listening(port)


# =============================================================================
#  step 1 - the polite way
# =============================================================================

def ask_server_to_stop(port):
    """Call POST /api/shutdown. True if the server accepted the request."""
    url = "http://" + HOST + ":" + str(port) + "/api/shutdown"
    request = urllib.request.Request(url, data=b"{}", method="POST",
                                     headers={"Content-Type": "application/json"})
    try:
        answer = urllib.request.urlopen(request, timeout=3)
        body = answer.read().decode("utf-8", "replace")
        try:
            return bool(json.loads(body).get("stopping"))
        except ValueError:
            return True          # it answered something, close enough
    except urllib.error.HTTPError as error:
        # 404 means an older server that has no shutdown endpoint
        print("  the server answered " + str(error.code) +
              " - it has no shutdown endpoint")
        return False
    except (urllib.error.URLError, socket.timeout, ConnectionResetError, OSError):
        # the connection can also drop exactly while the server exits, which
        # is fine - the port check afterwards decides whether it worked
        return False


# =============================================================================
#  step 2 - find the process holding the port and stop it
# =============================================================================

def pids_on_port(port):
    """Process ids listening on the port, read from the operating system."""
    pids = []

    if sys.platform.startswith("win"):
        # netstat -ano lists:  proto  local  remote  state  pid
        try:
            output = subprocess.run(["netstat", "-ano", "-p", "TCP"],
                                    capture_output=True, text=True).stdout
        except OSError:
            return pids
        for line in output.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            if parts[3] != "LISTENING":
                continue
            if not parts[1].endswith(":" + str(port)):
                continue
            if parts[4].isdigit():
                pids.append(int(parts[4]))
    else:
        # lsof is the usual tool on linux and mac
        try:
            output = subprocess.run(["lsof", "-t", "-i", "TCP:" + str(port),
                                     "-s", "TCP:LISTEN"],
                                    capture_output=True, text=True).stdout
        except OSError:
            return pids
        for line in output.split():
            if line.isdigit():
                pids.append(int(line))

    # remove duplicates but keep the order
    unique = []
    for pid in pids:
        if pid not in unique:
            unique.append(pid)
    return unique


def process_name(pid):
    """The program name of a process id, or an empty string if unknown."""
    if sys.platform.startswith("win"):
        try:
            output = subprocess.run(["tasklist", "/FI", "PID eq " + str(pid),
                                     "/NH", "/FO", "CSV"],
                                    capture_output=True, text=True).stdout
        except OSError:
            return ""
        parts = output.strip().split('","')
        if len(parts) >= 1:
            return parts[0].strip('"').lower()
        return ""
    else:
        try:
            output = subprocess.run(["ps", "-p", str(pid), "-o", "comm="],
                                    capture_output=True, text=True).stdout
        except OSError:
            return ""
        return output.strip().lower()


def stop_process(pid):
    """Ask the operating system to end one process."""
    if sys.platform.startswith("win"):
        result = subprocess.run(["taskkill", "/PID", str(pid), "/F"],
                                capture_output=True, text=True)
        return result.returncode == 0
    result = subprocess.run(["kill", "-9", str(pid)],
                            capture_output=True, text=True)
    return result.returncode == 0


def kill_server(port):
    """Stop every python process listening on the port. True if any was ended."""
    pids = pids_on_port(port)
    if len(pids) == 0:
        print("  could not tell which process is holding port " + str(port))
        return False

    stopped = False
    for pid in pids:
        name = process_name(pid)
        # safety check: never end something that is not a python process
        if "python" not in name and "pythonw" not in name:
            print("  port " + str(port) + " is held by pid " + str(pid) +
                  " (" + (name or "unknown") + ") - not a python process, "
                  "leaving it alone")
            continue
        print("  stopping pid " + str(pid) + " (" + name + ")")
        if stop_process(pid):
            stopped = True
        else:
            print("  could not stop pid " + str(pid) +
                  " - try running this from the terminal that owns it")
    return stopped


# =============================================================================
#  main
# =============================================================================

def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("  '" + sys.argv[1] + "' is not a port number")
            return 2

    print("")
    print("  GA visualizer shutdown  (" + HOST + ":" + str(port) + ")")
    print("  " + "-" * 44)

    if not is_listening(port):
        print("  nothing is running on port " + str(port) + " - already stopped")
        print("")
        return 0

    # ---- step 1: ask nicely ------------------------------------------
    print("  asking the server to stop ...")
    ask_server_to_stop(port)

    if wait_until_closed(port, 4):
        print("  server stopped")
        print("")
        return 0

    # ---- step 2: stop the process ------------------------------------
    print("  still up, stopping the process instead ...")
    kill_server(port)

    if wait_until_closed(port, 4):
        print("  server stopped")
        print("")
        return 0

    print("  port " + str(port) + " is still open - the server did not stop")
    print("")
    return 1


if __name__ == "__main__":
    sys.exit(main())
