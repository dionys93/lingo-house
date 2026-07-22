// web/src/components/house/Railings.jsx
import { WALL_HEIGHT } from './roofGeometry.js';

const RAIL_H = Math.min(0.5, WALL_HEIGHT * 0.42);
const RAIL_T = 0.04, POST_T = 0.035, GAP = 0.16;

export function Railings({ runs, colors }) {
  if (!runs?.length) return null;
  return (
    <>
      {runs.map((run, i) => {
        const len = run.hi - run.lo, mid = (run.lo + run.hi) / 2;
        const barPos = run.axis === 'x' ? [run.at, RAIL_H, mid] : [mid, RAIL_H, run.at];
        const barSize = run.axis === 'x' ? [RAIL_T, RAIL_T, len] : [len, RAIL_T, RAIL_T];
        const n = Math.max(2, Math.round(len / GAP));
        return (
          <group key={i}>
            <mesh position={barPos}>
              <boxGeometry args={barSize} />
              <meshStandardMaterial color={colors.wall} />
            </mesh>
            {Array.from({ length: n + 1 }, (_, k) => {
              const t = run.lo + (len * k) / n;
              const p = run.axis === 'x' ? [run.at, RAIL_H / 2, t] : [t, RAIL_H / 2, run.at];
              return (
                <mesh key={k} position={p}>
                  <boxGeometry args={[POST_T, RAIL_H, POST_T]} />
                  <meshStandardMaterial color={colors.wall} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
}