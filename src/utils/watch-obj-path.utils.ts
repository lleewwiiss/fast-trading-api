import { traverseObj } from "./update-obj-path.utils";

import type { ObjectPaths } from "~/types/misc.types";

export const watchObjPath = <T, P extends ObjectPaths<T>>(
  obj: T,
  path: P,
  callback: () => void,
) => {
  const { current, lastKey } = traverseObj(obj, path);

  const original = current[lastKey];
  const proxy = new Proxy(current[lastKey], {
    set(target, prop, value) {
      if (target[prop] !== value) {
        target[prop] = value;
        callback();
      } else {
        target[prop] = value;
      }

      return true;
    },
  });

  current[lastKey] = proxy;

  return () => {
    current[lastKey] = original;
  };
};
