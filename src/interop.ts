import { ServerAPI } from "decky-frontend-lib";

var serverAPI: ServerAPI | undefined = undefined;

export function setServerAPI(s: ServerAPI) {
  serverAPI = s;
}

export async function backend_call<I, O>(name: string, params: I): Promise<O> {
  try {
    const res = await serverAPI!.callPluginMethod<I, O>(name, params);
    if (res.success) return res.result;
    else {
      console.error(res.result);
      throw res.result;
    }
  } catch (e) {
    console.error(e);
    throw e;
  }
}

export async function is_paused(pid: number): Promise<boolean> {
  return backend_call<{ pid: number }, boolean>("is_paused", { pid });
}

export async function pause(pid: number): Promise<boolean> {
  return backend_call<{ pid: number }, boolean>("pause", { pid });
}

export async function resume(pid: number): Promise<boolean> {
  return backend_call<{ pid: number }, boolean>("resume", { pid });
}

export async function terminate(pid: number): Promise<boolean> {
  return backend_call<{ pid: number }, boolean>("terminate", { pid });
}

export async function kill(pid: number): Promise<boolean> {
  return backend_call<{ pid: number }, boolean>("kill", { pid });
}

export async function pid_from_appid(appid: number): Promise<number> {
  return backend_call<{ appid: number }, number>("pid_from_appid", { appid });
}

export async function appid_from_pid(pid: number): Promise<number> {
  return backend_call<{ pid: number }, number>("appid_from_pid", { pid });
}