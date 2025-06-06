export const genId = () => {
  return (
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
};

let globalCounter = Date.now();

export const genIntId = () => {
  return ++globalCounter;
};
