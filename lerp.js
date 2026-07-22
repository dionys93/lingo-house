// web/src/utils/lerp.js
//
// A small shared helper for the "glide toward a destination" pattern used
// in a couple of places (door panels swinging open/closed, the camera
// flying between exterior/interior). Exponential ease: moves `vec` a
// fraction `speed` of the remaining distance toward `target` each call.

export function lerpVec3(vec, target, speed) {
  vec.x += (target[0] - vec.x) * speed;
  vec.y += (target[1] - vec.y) * speed;
  vec.z += (target[2] - vec.z) * speed;
}