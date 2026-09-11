export const uid = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
