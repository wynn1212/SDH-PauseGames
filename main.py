import sys
import subprocess
import os
import asyncio
import re
from typing import Any

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code one directory up
# or add the `decky-loader/plugin` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky_plugin
from settings import SettingsManager

GAMEPAD_NAME_KEYWORDS = [
    "controller", "gamepad", "joystick", "joy-con", "dualsense",
    "dualshock", "xbox", "switch pro", "8bitdo", "wireless controller",
    "wii", "stadia", "luna", "shield"
]

MAC_REGEX = re.compile(r'([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})')

def get_bt_gamepads_from_proc() -> set[str]:
    gamepads = set()
    proc_devices_path = "/proc/bus/input/devices"
    if not os.path.exists(proc_devices_path):
        return gamepads
    try:
        with open(proc_devices_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        blocks = content.split("\n\n")
        for block in blocks:
            if not block.strip():
                continue
            bus_match = re.search(r'I:\s*Bus=([0-9a-fA-F]+)', block)
            if not bus_match or bus_match.group(1).lower() not in ("0005", "5"):
                continue

            name_match = re.search(r'N:\s*Name="([^"]+)"', block)
            name = name_match.group(1) if name_match else ""
            name_lower = name.lower()

            handlers_match = re.search(r'H:\s*Handlers=([^\n]+)', block)
            handlers = handlers_match.group(1) if handlers_match else ""

            ev_match = re.search(r'B:\s*EV=([0-9a-fA-F]+)', block)
            ev_hex = ev_match.group(1) if ev_match else "0"
            try:
                ev_val = int(ev_hex, 16)
            except ValueError:
                ev_val = 0

            is_gamepad = False
            if any(h.startswith("js") for h in handlers.split()):
                is_gamepad = True
            elif (ev_val & 0x08) != 0 and any(kw in name_lower for kw in GAMEPAD_NAME_KEYWORDS):
                is_gamepad = True
            elif any(kw in name_lower for kw in GAMEPAD_NAME_KEYWORDS):
                is_gamepad = True

            if not is_gamepad:
                continue

            mac_id = None
            uniq_match = re.search(r'U:\s*Uniq=([^\n]+)', block)
            if uniq_match:
                uniq_val = uniq_match.group(1).strip()
                mac_m = MAC_REGEX.search(uniq_val)
                if mac_m:
                    mac_id = mac_m.group(1).lower()

            if not mac_id:
                phys_match = re.search(r'P:\s*Phys=([^\n]+)', block)
                if phys_match:
                    phys_val = phys_match.group(1).strip()
                    mac_m = MAC_REGEX.search(phys_val)
                    if mac_m:
                        mac_id = mac_m.group(1).lower()

            if not mac_id:
                sysfs_match = re.search(r'S:\s*Sysfs=([^\n]+)', block)
                if sysfs_match:
                    sysfs_val = sysfs_match.group(1).strip()
                    parent = re.sub(r'/input/input\d+.*', '', sysfs_val)
                    mac_id = parent.lower()

            if not mac_id and name:
                mac_id = name_lower

            if mac_id:
                gamepads.add(mac_id)
    except Exception as e:
        decky_plugin.logger.error(f"Error reading /proc/bus/input/devices: {e}")
    return gamepads

def get_bt_gamepads_from_bluetoothctl() -> set[str]:
    gamepads = set()
    clean_env = os.environ.copy()
    clean_env["LD_LIBRARY_PATH"] = ""
    try:
        res = subprocess.run(
            ["bluetoothctl", "devices", "Connected"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=clean_env,
            text=True,
            timeout=2.0
        )
        if res.returncode != 0 or not res.stdout:
            return gamepads

        for line in res.stdout.strip().split("\n"):
            line = line.strip()
            parts = line.split(" ", 2)
            if len(parts) < 2 or parts[0] != "Device":
                continue
            mac = parts[1].strip().lower()
            name = parts[2].strip() if len(parts) >= 3 else ""
            name_lower = name.lower()

            info_res = subprocess.run(
                ["bluetoothctl", "info", mac],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=clean_env,
                text=True,
                timeout=2.0
            )
            info_out = info_res.stdout if info_res.returncode == 0 else ""
            info_lower = info_out.lower()

            is_gamepad = False
            if "icon: input-gaming" in info_lower:
                is_gamepad = True

            class_match = re.search(r'class:\s*0x([0-9a-fA-F]+)', info_out)
            if class_match:
                try:
                    cls_val = int(class_match.group(1), 16)
                    if (cls_val & 0x1F00) == 0x0500 and (cls_val & 0x3C) in (0x04, 0x08):
                        is_gamepad = True
                except ValueError:
                    pass

            if not is_gamepad and any(kw in name_lower for kw in GAMEPAD_NAME_KEYWORDS):
                if "human interface device" in info_lower or "00001124" in info_lower or not info_out:
                    is_gamepad = True

            if is_gamepad:
                gamepads.add(mac)
    except Exception as e:
        decky_plugin.logger.error(f"Error checking bluetoothctl: {e}")
    return gamepads

def get_connected_bluetooth_gamepads() -> list[str]:
    return list(get_bt_gamepads_from_proc() | get_bt_gamepads_from_bluetoothctl())

def get_all_children(pid: int) -> list[str]:
    pids = []
    tmpPids = [str(pid)]
    try:
        while tmpPids:
            ppid = tmpPids.pop(0)
            lines = []
            clean_env = os.environ.copy()
            clean_env["LD_LIBRARY_PATH"] = ""
            with subprocess.Popen(["ps", "--ppid", ppid, "-o", "pid="], stdout=subprocess.PIPE, env=clean_env) as p:
                lines = p.stdout.readlines()
            for chldPid in lines:
                chldPid = chldPid.strip()
                if not chldPid:
                    continue
                pids.append(chldPid)
                tmpPids.append(chldPid)
        return pids
    except:
        return pids

class Plugin:
    def __init__(self):
        self.cached_bt_gamepads = []
        self._bt_monitor_task = None
        self._initial_bt_checked = False

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        self.settings = SettingsManager(name="settings", settings_directory=decky_plugin.DECKY_PLUGIN_SETTINGS_DIR)
        self.settings.read()
        self._bt_monitor_task = asyncio.create_task(self._bluetooth_monitor())

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        if self._bt_monitor_task:
            self._bt_monitor_task.cancel()
            try:
                await self._bt_monitor_task
            except asyncio.CancelledError:
                pass

    async def _bluetooth_monitor(self):
        last_count = -1
        while True:
            try:
                loop = asyncio.get_running_loop()
                gamepads = await loop.run_in_executor(None, get_connected_bluetooth_gamepads)
                self.cached_bt_gamepads = gamepads
                self._initial_bt_checked = True
                count = len(gamepads)
                if count != last_count:
                    last_count = count
                    try:
                        await decky_plugin.emit("bluetooth_gamepads_changed", count)
                    except Exception as e:
                        decky_plugin.logger.error(f"Error emitting bluetooth event: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                decky_plugin.logger.error(f"Error in bluetooth monitor: {e}")
            await asyncio.sleep(0.5)

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
    async def _uninstall(self):
        pass

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        pass

    async def is_paused(self, pid: int) -> bool:
        try:
            clean_env = os.environ.copy()
            clean_env["LD_LIBRARY_PATH"] = ""
            with subprocess.Popen(["ps", "--ppid", str(pid), "-o", "stat="], stdout=subprocess.PIPE, env=clean_env) as p:
                return p.stdout.readline().lstrip().startswith(b'T')
        except:
            return False

    async def pause(self, pid: int) -> bool:
        pids = get_all_children(pid)
        if pids:
            command = ["kill", "-SIGSTOP"]
            command.extend(pids)
            try:
                clean_env = os.environ.copy()
                clean_env["LD_LIBRARY_PATH"] = ""
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout, env=clean_env).returncode == 0
            except:
                return False
        else:
            return False


    async def resume(self, pid: int) -> bool:
        pids = get_all_children(pid)
        if pids:
            command = ["kill", "-SIGCONT"]
            command.extend(pids)
            try:
                clean_env = os.environ.copy()
                clean_env["LD_LIBRARY_PATH"] = ""
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout, env=clean_env).returncode == 0
            except:
                return False
        else:
            return False

    async def terminate(self, pid: int) -> bool:
        pids = get_all_children(pid)
        if pids:
            command = ["kill", "-SIGTERM"]
            command.extend(pids)
            try:
                clean_env = os.environ.copy()
                clean_env["LD_LIBRARY_PATH"] = ""
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout, env=clean_env).returncode == 0
            except:
                return False
        else:
            return False

    async def kill(self, pid: int) -> bool:
        pids = get_all_children(pid)
        if pids:
            command = ["kill", "-SIGKILL"]
            command.extend(pids)
            try:
                clean_env = os.environ.copy()
                clean_env["LD_LIBRARY_PATH"] = ""
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout, env=clean_env).returncode == 0
            except:
                return False
        else:
            return False

    async def pid_from_appid(self, appid: int) -> int:
        pid = ""
        try:
            clean_env = os.environ.copy()
            clean_env["LD_LIBRARY_PATH"] = ""
            with subprocess.Popen(["pgrep", "--full", "--oldest", f"/reaper\\s.*\\bAppId={appid}\\b"], stdout=subprocess.PIPE, env=clean_env) as p:
                pid = p.stdout.read().strip()
        except:
            return 0
        if not pid:
            return 0
        return int(pid)

    async def appid_from_pid(self, pid: int) -> int:
        # search upwards for the process that has the AppId= command line argument
        while pid and pid != 1:
            try:
                args = []
                with open(f"/proc/{pid}/cmdline", "r") as f:
                    args = f.read().split('\0')
                for arg in args:
                    arg = arg.strip()
                    if arg.startswith("AppId="):
                        arg = arg.lstrip("AppId=")
                        if arg:
                            return int(arg)
            except:
                pass
            try:
                strppid = ""
                clean_env = os.environ.copy()
                clean_env["LD_LIBRARY_PATH"] = ""
                with subprocess.Popen(["ps", "--pid", str(pid), "-o", "ppid="], stdout=subprocess.PIPE, env=clean_env) as p:
                    strppid = p.stdout.read().strip()
                if strppid:
                    pid = int(strppid)
                else:
                    break
            except:
                break
        return 0

    async def load_settings(self) -> dict[str, Any]:
        return self.settings.settings

    async def save_setting(self, key: str, value: Any) -> None:
        self.settings.setSetting(key, value)

    async def add_no_auto_pause_set(self, appid: int) -> None:
        curr = set(self.settings.getSetting("noAutoPauseSet", []))
        curr.add(appid)
        self.settings.setSetting("noAutoPauseSet", list(curr))

    async def remove_no_auto_pause_set(self, appid: int) -> None:
        curr = set(self.settings.getSetting("noAutoPauseSet", []))
        curr.discard(appid)
        self.settings.setSetting("noAutoPauseSet", list(curr))

    async def get_bluetooth_gamepad_count(self) -> int:
        if not getattr(self, "_initial_bt_checked", False):
            loop = asyncio.get_running_loop()
            self.cached_bt_gamepads = await loop.run_in_executor(None, get_connected_bluetooth_gamepads)
            self._initial_bt_checked = True
        return len(self.cached_bt_gamepads)

    async def get_connected_bluetooth_gamepads(self) -> list[str]:
        if not getattr(self, "_initial_bt_checked", False):
            loop = asyncio.get_running_loop()
            self.cached_bt_gamepads = await loop.run_in_executor(None, get_connected_bluetooth_gamepads)
            self._initial_bt_checked = True
        return list(self.cached_bt_gamepads)
