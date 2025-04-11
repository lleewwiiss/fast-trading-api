export const chunk = <T>(arr: T[], size: number) => {
  const chunkedArr: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    chunkedArr.push(arr.slice(i, i + size));
  }

  return chunkedArr;
};
