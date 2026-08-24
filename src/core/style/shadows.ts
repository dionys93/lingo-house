// src/core/style/shadows.ts
//
// Cast and receive are not one flag. They're a property of what a surface IS,
// and getting them wrong is visible in ways that read as "the renderer is
// broken" rather than "that mesh is misconfigured". Two traps in this codebase
// specifically, both of which a blanket scene.traverse would walk straight into:
//
//   WINDOW GLASS  three's default depth material ignores transparency. A pane at
//                 opacity 0.35 casts a SOLID black rectangle. Every window would
//                 look bricked up.
//
//   ITEM HITBOX   Items.tsx renders an opacity-0 box over each item so it stays
//                 raycastable. Invisible to the camera, fully opaque to the
//                 shadow map — you'd get black slabs hanging in mid-air with
//                 nothing casting them.
//
// Hence named roles rather than a boolean threaded through the tree. Spread them
// onto a mesh the same way `pickable(onPick)` is spread.

export interface ShadowRole {
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

/** Solid geometry with something on both sides: walls, roof, stairs, doors, items. */
export const SOLID: ShadowRole = { castShadow: true, receiveShadow: true };

/** Nothing below it to shade. Ground and floors — a flat tile casting straight
 *  down onto the plane beneath it buys nothing and invites acne. */
export const CATCHES: ShadowRole = { castShadow: false, receiveShadow: true };

/** Blocks the sun but nothing above it casts onto it: ceilings. Keeps the
 *  interior dark even with the roof hidden, which the lab does. */
export const BLOCKS: ShadowRole = { castShadow: true, receiveShadow: false };

/** Transparent or invisible. See the two traps above. */
export const IGNORED: ShadowRole = { castShadow: false, receiveShadow: false };