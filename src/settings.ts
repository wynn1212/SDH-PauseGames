import { backend_call } from "./backend";

type SettingStruct = {
    pauseBeforeSuspend: boolean;
    autoPause: boolean;
    overlayPause: boolean;
    noAutoPauseSet: Set<number>;
  };

  export class Settings {
    static default: SettingStruct = {
      pauseBeforeSuspend: false,
      autoPause: false,
      overlayPause: false,
      noAutoPauseSet: new Set(),
    } as const;

    static data: SettingStruct = Settings.default;

    static async init(): Promise<void> {
      await Settings.migrate();
      await Settings.load();
    }

    static async load(): Promise<void> {
      try {
        let data = await backend_call<{}, SettingStruct>("load_settings", {});
        Settings.data = { ...Settings.data, ...data };
        Settings.data.noAutoPauseSet = new Set(data.noAutoPauseSet);
      } catch (e) {}

      Settings.saveAll();
    }

    static async save(key: keyof SettingStruct, value: any) {
      Settings.data[key] = value;

      if (value instanceof Set) {
        backend_call<{ key: string; value: Array<number> }, void>("save_setting", {key, value: [...value]});
      } else {
        backend_call<{ key: string; value: SettingStruct[keyof SettingStruct] }, void>("save_setting", {key, value});
      }
    }

    static async saveAll() {
      for (const k in Settings.data) {
        Settings.save(k as keyof SettingStruct, Settings.data[k as keyof SettingStruct]);
      }
    }

    static async migrate() {
      const LOCAL_STORAGE_KEY = "pause-games-settings";
      const strSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (strSettings?.length) {
        try {
          let legacySettings = JSON.parse(strSettings) as SettingStruct;
          Settings.data = { ...Settings.data, ...legacySettings };
          Settings.saveAll();
        } catch (e) {}
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }

    static async addNoAutoPauseSet(appid: number): Promise<void> {
      Settings.data.noAutoPauseSet.add(appid);
      return backend_call<{ appid: number }, void>("add_no_auto_pause_set", { appid });
    }

    static async removeNoAutoPauseSet(appid: number): Promise<void> {
      Settings.data.noAutoPauseSet.delete(appid);
      return backend_call<{ appid: number }, void>("remove_no_auto_pause_set", { appid });
    }
  }