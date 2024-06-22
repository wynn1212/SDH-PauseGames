import {
  definePlugin,
  Button,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  staticClasses,
  ToggleField,
  Router,
  Marquee,
} from "decky-frontend-lib";
import { useEffect, useState, VFC } from "react";
import { FaStream, FaPlay, FaPause, FaMoon } from "react-icons/fa";

import * as backend from "./backend";

const AppItem: VFC<{ app: backend.AppOverviewExt }> = ({ app }) => {
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [hasStickyPauseState, setHasStickyPauseState] =
    useState<boolean>(false);
  const [noAutoPauseSet, setNoAutoPauseSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    backend.getAppMetaData(Number(app.appid)).then((appMD) => {
      setIsPaused(appMD.is_paused);
      setHasStickyPauseState(appMD.sticky_state);
    });
    backend.loadSettings().then((s) => {
      console.log(s);
      setNoAutoPauseSet(s.noAutoPauseSet);
    });
    const unregisterPauseStateChange = backend.registerPauseStateChange(
      Number(app.appid),
      setIsPaused
    );
    const unregisterStickyPauseStateChange =
      backend.registerStickyPauseStateChange(
        Number(app.appid),
        setHasStickyPauseState
      );
    return () => {
      unregisterPauseStateChange();
      unregisterStickyPauseStateChange();
    };
  }, []);

  return (
    <ToggleField
      checked={noAutoPauseSet.has(Number(app.appid))}
      key={app.appid}
      label={
        <div>
          <Marquee>{app.display_name}</Marquee>
          <Button
            style= {{ height: "21px" }}
            onOKButton={async () => {
              const appMD = await backend.getAppMetaData(Number(app.appid));
              if (
                !(await (isPaused
                  ? backend.resume(appMD.instanceid)
                  : backend.pause(appMD.instanceid)))
              ) {
                return;
              }
              appMD.is_paused = !isPaused;
              setIsPaused(!isPaused);
              if ((!isPaused) &&((await backend.loadSettings()).autoPause)) {
                backend.setStickyPauseState(Number(app.appid));
                setHasStickyPauseState(true);
              } else if (hasStickyPauseState) {
                backend.resetStickyPauseState(Number(app.appid));
                setHasStickyPauseState(false);
              }
            }}>
          {isPaused ? (
            <FaPause color={hasStickyPauseState ? "deepskyblue" : undefined} />
          ) : (
            <FaPlay color={hasStickyPauseState ? "deepskyblue" : undefined} />
          )}
          </Button>
        </div>
      }
      icon={
        (app.icon_data && app.icon_data_format) || app.icon_hash ? (
          <img
            style={{ maxWidth: 32, maxHeight: 32 }}
            src={
              app.icon_data
                ? "data:image/" +
                  app.icon_data_format +
                  ";base64," +
                  app.icon_data
                : "/assets/" + app.appid + "_icon.jpg?v=" + app.icon_hash
            }
          />
        ) : null
      }
      onChange={async (state) => {
        if (state) {
          await backend.add_no_auto_pause_set(Number(app.appid));
        } else {
          await backend.remove_no_auto_pause_set(Number(app.appid));
        }
      }}
    />
  );
};

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const [runningApps, setRunningApps] = useState<backend.AppOverviewExt[]>(
    Router.RunningApps as backend.AppOverviewExt[]
  );
  const [pauseBeforeSuspend, setPauseBeforeSuspend] = useState<boolean>(false);
  const [autoPause, setAutoPause] = useState<boolean>(false);
  const [overlayPause, setOverlayPause] = useState<boolean>(false);

  useEffect(() => {
    backend.loadSettings().then((s) => {
      setPauseBeforeSuspend(s.pauseBeforeSuspend);
      setAutoPause(s.autoPause);
      setOverlayPause(s.overlayPause);
    });
    const unregisterRunningAppsChange = backend.registerForRunningAppsChange(
      (runningApps: backend.AppOverviewExt[]) => {
        setRunningApps(runningApps);
      }
    );
    return () => {
      unregisterRunningAppsChange();
    };
  }, []);

  return (
    <PanelSection>
      <PanelSectionRow>
        <ToggleField
          checked={pauseBeforeSuspend}
          label="Pause before Suspend"
          tooltip="Pause all apps before suspend and resume those not explicitely paused."
          icon={<FaMoon />}
          onChange={async (state) => {
            const settings = await backend.loadSettings();
            settings.pauseBeforeSuspend = state;
            await backend.saveSettings(settings);
            setPauseBeforeSuspend(state);
          }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          bottomSeparator={autoPause ? "none" : "standard"}
          checked={autoPause}
          label="Pause on focus loss"
          tooltip="Pauses apps not in focus when switching between them."
          icon={<FaStream />}
          onChange={async (state) => {
            const settings = await backend.loadSettings();
            settings.autoPause = state;
            await backend.saveSettings(settings);
            setAutoPause(state);
            backend.resetStickyPauseStates();
          }}
        />
      </PanelSectionRow>
      {autoPause && (
        <PanelSectionRow>
          <ToggleField
            checked={overlayPause}
            label=" ↳ Also on overlay"
            tooltip="Pause apps when interacting with Steam Overlay."
            onChange={async (state) => {
              const settings = await backend.loadSettings();
              settings.overlayPause = state;
              await backend.saveSettings(settings);
              setOverlayPause(state);
            }}
            disabled={!autoPause}
          />
        </PanelSectionRow>
      )}
      {runningApps.length ? (
        runningApps.map((app) => (
          <PanelSectionRow key={app.appid}>
            <AppItem app={app} />
          </PanelSectionRow>
        ))
      ) : (
        <div style={{ fontSize: "80%" }}>
          <strong>
            <em>- Pause before Suspend</em>
          </strong>
          <br />
          Pauses all apps before system suspend.
          <br />
          May fix audio issues.
          <br />
          <strong>
            <em>- Pause on focus loss</em>
          </strong>
          <br />
          Automatically pauses apps not in focus while switching between them.
          Manually setting the state of an app in this mode will sticky them{" "}
          <FaPlay color="deepskyblue" />, <FaPause color="deepskyblue" />. To
          reset, disable and re-enable <em>Pause on focus loss</em>.
          <br />
          <strong>
            <em>- Also on overlay</em>
          </strong>
          <br />
          Additionally pauses apps while interacting with the Steam Overlay.
          <br />
          <strong>
            <em>Applications will appear here.</em>
          </strong>
        </div>
      )}
    </PanelSection>
  );
};

export default definePlugin((serverApi: ServerAPI) => {
  backend.setServerAPI(serverApi);
  backend.migrateSettings();

  const unregisterFocusChangeHandler = backend.setupFocusChangeHandler();
  const unregisterSuspendResumeHandler = backend.setupSuspendResumeHandler();

  return {
    title: <div className={staticClasses.Title}>Pause Games</div>,
    content: <Content serverAPI={serverApi} />,
    icon: <FaPause />,
    onDismount() {
      unregisterFocusChangeHandler();
      unregisterSuspendResumeHandler();
    },
  };
});
