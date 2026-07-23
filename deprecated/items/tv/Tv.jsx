// items/tv/Tv.jsx
import { useGLTF, Clone } from '@react-three/drei'
import { FitToDims } from '../_shared'

// 1.60 x 1.05 x 0.59 ft  ->  meters
const WIDTH = 0.4877, HEIGHT = 0.3200, DEPTH = 0.1798

export function Tv({ altitude = 0, selected = false }) {
  const { scene } = useGLTF(require('./tv.glb'))
  return (
    <FitToDims width={WIDTH} height={HEIGHT} depth={DEPTH}
               altitude={altitude} selected={selected}>
      {/* react-planner faced it away with rotation.y = PI */}
      <group rotation-y={Math.PI}>
        {/* <Clone> deep-clones so each placement is independent,
            replacing the manual cached3DTV + .clone() logic */}
        <Clone object={scene} />
      </group>
    </FitToDims>
  )
}

useGLTF.preload(require('./tv.glb'))