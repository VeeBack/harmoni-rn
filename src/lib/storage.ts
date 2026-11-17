import Storage from "expo-sqlite/kv-store";

/** Small synchronous key-value store for settings and cached JSON. */
export const kv = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = Storage.getItemSync(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value === undefined) Storage.removeItemSync(key);
      else Storage.setItemSync(key, JSON.stringify(value));
    } catch {
      // storage is best-effort
    }
  },
  remove(key: string) {
    try {
      Storage.removeItemSync(key);
    } catch {}
  },
  getRaw(key: string): string | null {
    try {
      return Storage.getItemSync(key);
    } catch {
      return null;
    }
  },
  setRaw(key: string, value: string) {
    try {
      Storage.setItemSync(key, value);
    } catch {}
  },
};
