import sys
import subprocess
from typing import Any

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code one directory up
# or add the `decky-loader/plugin` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky_plugin
from settings import SettingsManager

def get_all_children(pid: int) -> list[str]:
    pids = []
    tmpPids = [str(pid)]
    try:
        while tmpPids:
            ppid = tmpPids.pop(0)
            lines = []
            with subprocess.Popen(["ps", "--ppid", ppid, "-o", "pid="], stdout=subprocess.PIPE) as p:
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
    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        self.settings = SettingsManager(name="settings", settings_directory=decky_plugin.DECKY_PLUGIN_SETTINGS_DIR)
        self.settings.read()

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        pass

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
    async def _uninstall(self):
        pass

    async def start_timer(self):
        self.loop.create_task(self.long_running())

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        pass

    async def is_paused(self, pid: int) -> bool:
        try:
            with subprocess.Popen(["ps", "--ppid", str(pid), "-o", "stat="], stdout=subprocess.PIPE) as p:
                return p.stdout.readline().lstrip().startswith(b'T')
        except:
            return False

    async def pause(self, pid: int) -> bool:
        pids = get_all_children(pid)
        if pids:
            command = ["kill", "-SIGSTOP"]
            command.extend(pids)
            try:
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout).returncode == 0
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
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout).returncode == 0
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
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout).returncode == 0
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
                return subprocess.run(command, stderr=sys.stderr, stdout=sys.stdout).returncode == 0
            except:
                return False
        else:
            return False

    async def pid_from_appid(self, appid: int) -> int:
        pid = ""
        try:
            with subprocess.Popen(["pgrep", "--full", "--oldest", f"/reaper\\s.*\\bAppId={appid}\\b"], stdout=subprocess.PIPE) as p:
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
                with subprocess.Popen(["ps", "--pid", str(pid), "-o", "ppid="], stdout=subprocess.PIPE) as p:
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
