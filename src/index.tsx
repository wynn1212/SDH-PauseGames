import {
  beforePatch,
  definePlugin,
  staticClasses,
  Button,
  Marquee,
  PanelSection,
  PanelSectionRow,
  Router,
  ServerAPI,
  ToggleField,
} from "decky-frontend-lib";
import { useEffect, useState, VFC } from "react";
import { FaStream, FaPlay, FaPause, FaMoon } from "react-icons/fa";

import * as backend from "./backend";
import * as interop from "./interop";
import { Settings } from "./settings";

const AppItem: VFC<{ app: backend.AppOverviewExt }> = ({ app }) => {
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [hasStickyPauseState, setHasStickyPauseState] =
    useState<boolean>(false);
  const [noAutoPauseSet] = useState<Set<number>>(Settings.data.noAutoPauseSet);

  useEffect(() => {
    backend.getAppMetaData(Number(app.appid)).then((appMD) => {
      setIsPaused(appMD.is_paused);
      setHasStickyPauseState(appMD.sticky_state);
    });
    Settings.load().then(() => {
      Settings.data.noAutoPauseSet.forEach((id) => noAutoPauseSet.add(id));
    })
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

  let onClickPauseButton = async () => {
    {
      console.log("Pause", app.appid);
      const appMD = await backend.getAppMetaData(Number(app.appid));
      if (
        !(await (isPaused
          ? interop.resume(appMD.instanceid)
          : interop.pause(appMD.instanceid)))
      ) {
        return;
      }
      appMD.is_paused = !isPaused;
      setIsPaused(!isPaused);
      if ((!isPaused) && Settings.data.autoPause) {
        backend.setStickyPauseState(Number(app.appid));
        setHasStickyPauseState(true);
      } else if (hasStickyPauseState) {
        backend.resetStickyPauseState(Number(app.appid));
        setHasStickyPauseState(false);
      }
    }
  };

  let getAppIcon = (app: backend.AppOverviewExt) => {
    let iconUrl;
    if (app.icon_data && app.icon_data_format) {
      iconUrl = `data:image/${app.icon_data_format};base64,${app.icon_data}`;
    } else if (app.icon_hash) {
      iconUrl = `/assets/${app.appid}_icon.jpg?v=${app.icon_hash}`;
    }

    if (iconUrl) {
      return `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${iconUrl})`;
    }
    return "none";
  }

  return (
    <ToggleField
      checked={!noAutoPauseSet.has(Number(app.appid))}
      key={app.appid}
      label={
        <div style={{ display: "flex", alignItems: "center", height: "48px" }}>
          <Marquee>{app.display_name}</Marquee>
        </div>
      }
      icon={
        <Button
          style={{ border: "none", background: "none" }}
          onClick={(_) => onClickPauseButton()}
          onOKButton={() => onClickPauseButton()}>
        {
          <div style={{
            background: getAppIcon(app),
            backgroundSize: "cover",
            width: "46px",
            height: "46px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "-6px",
            borderRadius: "2px",
          }}>
            {isPaused ? (
              <FaPlay color={hasStickyPauseState ? "deepskyblue" : "white"} />
            ) : (
              <FaPause color={hasStickyPauseState ? "deepskyblue" : "white"} />
            )}
          </div>
        }
        </Button>
      }
      onChange={async (state) => {
        if (state) {
          noAutoPauseSet.delete(Number(app.appid));
          await Settings.removeNoAutoPauseSet(Number(app.appid));
        } else {
          noAutoPauseSet.add(Number(app.appid));
          await Settings.addNoAutoPauseSet(Number(app.appid));
        }
      }}
    />
  );
};

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const [runningApps, setRunningApps] = useState<backend.AppOverviewExt[]>(
    Router.RunningApps as backend.AppOverviewExt[]
  );
  const [pauseBeforeSuspend, setPauseBeforeSuspend] = useState<boolean>(Settings.data.pauseBeforeSuspend);
  const [autoPause, setAutoPause] = useState<boolean>(Settings.data.autoPause);
  const [overlayPause, setOverlayPause] = useState<boolean>(Settings.data.overlayPause);

  useEffect(() => {
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
            setPauseBeforeSuspend(state);
            await Settings.save("pauseBeforeSuspend", state);
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
            setAutoPause(state);
            backend.resetStickyPauseStates();
            await Settings.save("autoPause", state);
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
              setOverlayPause(state);
              await Settings.save("overlayPause", state);
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
          Manually pausing an app in this mode will put them in sticky state{" "}
          <FaPlay color="deepskyblue" /> <FaPause color="deepskyblue" /> until they
          are manually unpaused.
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
  interop.setServerAPI(serverApi);
  Settings.init();
  let patch = beforePatch(SteamClient.Apps, "TerminateApp", (inputs: any[]) => {
      backend?.resumeApp?.(inputs[0]);
  });

  const unregisterFocusChangeHandler = backend.setupFocusChangeHandler();
  const unregisterSuspendResumeHandler = backend.setupSuspendResumeHandler();

  return {
    title: <div className={staticClasses.Title}>Pause Games</div>,
    content: <Content serverAPI={serverApi} />,
    icon: <FaPause />,
    onDismount() {
      patch.unpatch();
      unregisterFocusChangeHandler();
      unregisterSuspendResumeHandler();
    },
  };
});
