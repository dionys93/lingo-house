// items/bookcase/Bookcase.jsx
import { useMemo } from 'react'
import { useTexture, Detailed } from '@react-three/drei'
import { FitToDims } from '../_shared'

const WIDTH = 0.8, HEIGHT = 2.0, DEPTH = 0.8  // was 80/200/80 cm

function Frame() {
  const wood = useTexture(require('./wood.jpg'))
  return (
    <group>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.03, 2, 0.8]} />
        <meshPhongMaterial map={wood} />
      </mesh>
      <mesh position={[0.15, 1, 0.4]}>
        <boxGeometry args={[0.3, 2, 0.03]} />
        <meshPhongMaterial map={wood} />
      </mesh>
      <mesh position={[0.15, 1, -0.4]}>
        <boxGeometry args={[0.3, 2, 0.03]} />
        <meshPhongMaterial map={wood} />
      </mesh>
      {/* top, bottom, and 4 shelves share one geometry footprint */}
      {[0.015, 2, 0.415, 0.815, 1.215, 1.615].map((y, i) => (
        <mesh key={i} position={[0.15, y, 0]}>
          <boxGeometry args={[0.3, 0.03, 0.8]} />
          <meshPhongMaterial map={wood} />
        </mesh>
      ))}
    </group>
  )
}

function Books() {
  const textures = useTexture([
    require('./bookTexture1.jpg'),
    require('./bookTexture2.jpg'),
    require('./bookTexture3.jpg'),
  ])
  // pick once per mount so it's stable across re-renders
  const books = useMemo(
    () => [0.19, 0.59, 0.99, 1.39, 1.79].map((y) => ({
      y, tex: textures[Math.floor(Math.random() * 3)],
    })),
    [textures]
  )
  return books.map((b, i) => (
    <mesh key={i} position={[0.15, b.y, 0]}>
      <boxGeometry args={[0.24, 0.32, 0.76]} />
      <meshLambertMaterial map={b.tex} />
    </mesh>
  ))
}

export function Bookcase({ altitude = 0, selected = false }) {
  return (
    <FitToDims width={WIDTH} height={HEIGHT} depth={DEPTH}
               altitude={altitude} selected={selected}>
      {/* react-planner rotated y+=PI/2; bake that into the built orientation */}
      <group rotation-y={Math.PI / 2}>
        <Detailed distances={[0, 12]}>
          <group>       {/* near: frame + books */}
            <Frame />
            <Books />
          </group>
          <Frame />     {/* far: carcass only */}
        </Detailed>
      </group>
    </FitToDims>
  )
}