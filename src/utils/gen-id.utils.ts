export const genId = () => {
  return (
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  );
};

let lastTimestamp = 0;
let counter = 0;

export const genIntId = () => {
  const timestamp = Date.now();

  if (timestamp === lastTimestamp) {
    counter++;
  } else {
    counter = 0;
    lastTimestamp = timestamp;
  }

  // Combine timestamp and counter to ensure uniqueness
  // Multiply by 1000 to leave room for counter (up to 999 calls per millisecond)
  return timestamp * 1000 + counter;
};
