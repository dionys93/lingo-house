// items/staircase/Staircase.jsx
import { useMemo, useState } from 'react'
import { useCursor } from '@react-three/drei'

export function Staircase({
  steps = 14,
  totalRise = 2.7,     // floor-to-floor height, meters
  totalRun = 3.2,      // horizontal depth the run occupies
  width = 1.0,
  direction = 'up',    // 'up' | 'down'
  rails = true,
  to,                  // destination id, e.g. 'upstairs' / 'basement'
  onNavigate,
  selected = false,
}) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && !!onNavigate)          // pointer cursor only when it goes somewhere

  const dir  = direction === 'down' ? -1 : 1
  const stepH = totalRise / steps
  const stepD = totalRun  / steps

  // one tread block per step, stacked into a staircase profile
  const treads = useMemo(
    () => Array.from({ length: steps }, (_, i) => ({
      key: i,
      y: dir * (i * stepH + stepH / 2),
      z: i * stepD + stepD / 2,
    })),
    [steps, stepH, stepD, dir]
  )

  const pitch   = Math.atan2(totalRise, totalRun)   // rake angle for the rails
  const railLen = Math.hypot(totalRise, totalRun)

  return (
    <group
      onClick={(e) => { if (onNavigate) { e.stopPropagation(); onNavigate(to) } }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      {treads.map((t) => (
        <mesh key={t.key} position={[0, t.y, t.z]} castShadow receiveShadow>
          <boxGeometry args={[width, stepH, stepD]} />
          <meshStandardMaterial
            color="#c9b79c"
            emissive={hovered ? '#3a6ea5' : '#000'}
            emissiveIntensity={hovered ? 0.35 : 0}
          />
        </mesh>
      ))}

      {rails && [-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (width / 2 - 0.03), dir * totalRise / 2 + 0.9, totalRun / 2]}
          rotation={[-dir * pitch, 0, 0]}
        >
          <boxGeometry args={[0.05, 0.05, railLen]} />
          <meshStandardMaterial color="#8a7a5c" />
        </mesh>
      ))}

      {selected && (
        <mesh position={[0, dir * totalRise / 2, totalRun / 2]}>
          <boxGeometry args={[width, totalRise, totalRun]} />
          <meshBasicMaterial wireframe color="#99c3fb" />
        </mesh>
      )}
    </group>
  )
}