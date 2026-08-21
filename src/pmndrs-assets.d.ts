// src/pmndrs-assets.d.ts
//
// @pmndrs/assets ships each asset as a base64-encoded JS module with an .exr
// (or .glb, .woff, .webp) extension. TypeScript has no idea what an .exr import
// resolves to, so declare it: the default export is a data URL string.
//
// DELETE THIS FILE if the package already ships its own declarations and tsc
// starts complaining about a duplicate — a wildcard is only insurance.
declare module '@pmndrs/assets/hdri/*.exr' {
  const src: string;
  export default src;
}