// Original icon paths from the local app's app.js iconPaths.
const paths={
  "food": "M8 3v7M5 3v5c0 3 6 3 6 0V3M8 10v11M18 3c-4 4-4 10 0 10V3v18",
  "target": "M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12l9-9M17 3h4v4",
  "spark": "m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z",
  "repeat": "m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  "more": "M4 12h1m6 0h1m6 0h1",
  "plus": "M12 5v14M5 12h14",
  "chevron": "m9 6 6 6-6 6",
  "back": "m15 6-6 6 6 6",
  "search": "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  "star": "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  "export": "M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"
};
export const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]??paths.food}"/></svg>`;
