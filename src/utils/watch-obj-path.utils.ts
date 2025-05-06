import { traverseObj } from "./update-obj-path.utils";

import type { ObjectPaths } from "~/types/misc.types";

const listeners = new WeakMap<
  any,
  Map<
    string,
    {
      original: any;
      callbacks: Set<() => void>;
    }
  >
>();

const makeProxy = ({
  obj,
  path,
  toProxy,
}: {
  obj: any;
  path: string;
  toProxy: any;
}) => {
  return new Proxy(toProxy, {
    set(target, prop, value) {
      if (target[prop] !== value) {
        target[prop] = value;
        listeners
          .get(obj)
          ?.get(path)
          ?.callbacks.forEach((cb) => cb());
      } else {
        target[prop] = value;
      }

      return true;
    },
  });
};

export const watchObjPath = <T, P extends ObjectPaths<T>>(
  obj: T,
  path: P,
  callback: () => void,
) => {
  const { current, lastKey } = traverseObj(obj, path);
  const listenersMap = listeners.get(obj);

  // first case we dont have a listener for this object & path
  if (!listenersMap) {
    listeners.set(
      obj,
      new Map().set(path, {
        original: current[lastKey],
        callbacks: new Set([callback]),
      }),
    );

    current[lastKey] = makeProxy({
      obj,
      path,
      toProxy: current[lastKey],
    });
  }
  // second case we have a listener for this object but not this path
  else if (listenersMap && !listenersMap.has(path)) {
    listenersMap.set(path, {
      original: current[lastKey],
      callbacks: new Set([callback]),
    });

    current[lastKey] = makeProxy({
      obj,
      path,
      toProxy: current[lastKey],
    });
  }
  // third case we have a listener for this object & path already
  else if (listenersMap && listenersMap.has(path)) {
    listenersMap.get(path)!.callbacks.add(callback);
  }

  return () => {
    const { original, callbacks } = listeners.get(obj)!.get(path)!;

    callbacks.delete(callback);

    if (callbacks.size === 0) {
      current[lastKey] = original;
      listeners.get(obj)!.delete(path);
    }

    if (listeners.get(obj)!.size === 0) {
      listeners.delete(obj);
    }
  };
};
