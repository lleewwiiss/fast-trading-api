import type {
  ObjectPaths,
  ValueAtPath,
  Split,
  ObjectChangeCommand,
} from "~/types/misc.types";

export const traverseObj = <T>(obj: T, path: string) => {
  const keys = path.split(".");

  let current: any = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    let key: string | number = keys[i];
    if (!isNaN(Number(key))) key = Number(key);
    current = current[key];
  }

  let lastKey: string | number = keys[keys.length - 1];
  if (!isNaN(Number(lastKey))) lastKey = Number(lastKey);

  return { current, lastKey };
};

export const updateObjectPath = <T, P extends ObjectPaths<T>>({
  obj,
  path,
  value,
}: {
  obj: T;
  path: P;
  value: ValueAtPath<T, Split<P, ".">>;
}): void => {
  const { current, lastKey } = traverseObj(obj, path);
  current[lastKey] = value;
};

export const removeArrayElementAtPath = <T, P extends ObjectPaths<T>>({
  obj,
  path,
  index,
}: {
  obj: T;
  path: P & (ValueAtPath<T, Split<P, ".">> extends any[] ? unknown : never);
  index: number;
}): void => {
  const { current, lastKey } = traverseObj(obj, path);
  current[lastKey].splice(index, 1);
};

export const applyChanges = <T, P extends ObjectPaths<T>>({
  obj,
  changes,
}: {
  obj: T;
  changes: ObjectChangeCommand<T, P>[];
}) => {
  for (const change of changes) {
    if (change.type === "update") {
      updateObjectPath({ obj, path: change.path, value: change.value });
    } else if (change.type === "removeArrayElement") {
      removeArrayElementAtPath({ obj, path: change.path, index: change.index });
    }
  }
};
