// catalog/_shared.jsx
import * as THREE from 'three'
import { useLayoutEffect, useRef, useState } from 'react'
import { Edges } from '@react-three/drei'

// Draws a bounding outline when the item is selected — the r3f
// equivalent of react-planner's `new Three.BoxHelper(...)`.
function SelectionBox({ width, height, depth }) {
  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial visible={false} />
      <Edges color="#99c3fb" />
    </mesh>
  )
}

// Measures children, non-uniformly rescales them to (width,height,depth),
// seats them on the floor, and lifts by altitude. This is the exact dance
// the tv/bookcase render3D functions do inline — extracted once.
export function FitToDims({ width, height, depth, altitude = 0, selected, children }) {
  const inner = useRef()
  const [scale, setScale] = useState([1, 1, 1])
  const [floor, setFloor] = useState(0)

  useLayoutEffect(() => {
    const g = inner.current
    g.scale.set(1, 1, 1)                 // reset before measuring to avoid feedback
    g.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(g)
    const size = new THREE.Vector3()
    box.getSize(size)
    setScale([width / size.x, height / size.y, depth / size.z])
    setFloor(-box.min.y * (height / size.y)) // sit base on y=0 after scaling
  }, [width, height, depth, children])

  return (
    <group position={[0, altitude, 0]}>
      <group ref={inner} position={[0, floor, 0]} scale={scale}>
        {children}
      </group>
      {selected && <SelectionBox width={width} height={height} depth={depth} />}
    </group>
  )
}