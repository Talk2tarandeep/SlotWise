// Colours and constants for the 3D scene (light "daylight warehouse" theme).
// Kept in one place so the look can be tuned without hunting through files.

export const SCENE = {
  background: '#e9edf2', // also the fog colour, so the far floor fades into it
  fogNear: 60,
  fogFar: 130,
  skyLight: '#ffffff', // hemisphere light, top colour
  groundLight: '#b8c0ca', // hemisphere light, bottom (bounce) colour
  concrete: '#d6dade',
  concreteGrid: '#c5cbd2',
  wall: '#c9ced6',
  wallCap: '#b3bac4',
  safetyYellow: '#f5c518',
  hazardBlack: '#1f2328',
  signBoard: '#2563eb',
  signPost: '#7b8794',
  accent: '#2563eb', // same blue as the UI accent
  warn: '#f97316',
};

// Bundled with the app (public/fonts), so 3D text works offline.
export const FONT_BOLD = '/fonts/Inter-Bold.woff';
