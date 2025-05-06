import { traverseObj } from "./update-obj-path.utils";

import type { ObjectPaths } from "~/types/misc.types";

const listeners = new WeakMap<any, Map<string, Set<() => void>>>();
const originalObjects = new WeakMap<any, Map<string, any>>();

export const watchObjPath = <T, P extends ObjectPaths<T>>(
  obj: T,
  path: P,
  callback: () => void,
) => {
  const { current, lastKey } = traverseObj(obj, path);
  const listenersMap = listeners.get(obj);

  // first case: we already have a listener for this object & path
  if (listenersMap) {
    listenersMap.get(path)!.add(callback);
  }

  // second case: we don't have a listener for this object & path
  if (!listenersMap) {
    const original = current[lastKey];

    listeners.set(obj, new Map().set(path, new Set([callback])));
    originalObjects.set(obj, new Map().set(path, original));

    const proxy = new Proxy(current[lastKey], {
      set(target, prop, value) {
        if (target[prop] !== value) {
          target[prop] = value;
          listeners
            .get(obj)
            ?.get(path)
            ?.forEach((cb) => cb());
        } else {
          target[prop] = value;
        }

        return true;
      },
    });

    current[lastKey] = proxy;
  }

  return () => {
    listeners.get(obj)?.get(path)?.delete(callback);

    if (listeners.get(obj)?.get(path)?.size === 0) {
      listeners.get(obj)?.delete(path);
      current[lastKey] = originalObjects.get(obj)?.get(path);
      originalObjects.get(obj)?.delete(path);
    }

    if (listeners.get(obj)?.size === 0) {
      listeners.delete(obj);
      originalObjects.delete(obj);
    }
  };
};
