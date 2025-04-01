import { sleep } from "./sleep.utils";

export const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      await sleep(100);
      throw error;
    }
    return retry(fn, retries - 1);
  }
};
