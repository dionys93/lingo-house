// items/toilet/Toilet.jsx  — knows nothing about the bathroom
const PORCELAIN = '#f7f7f4';

export function Toilet({ selected = false }) {
  return (
    <group>
      {/* bowl */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.18, 0.14, 0.4, 24]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* tank, behind = -z in local space; facing is applied by the placement */}
      <mesh position={[0, 0.35, -0.18]}>
        <boxGeometry args={[0.36, 0.4, 0.14]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.3, -0.05]}>
          <boxGeometry args={[0.4, 0.6, 0.5]} />
          <meshBasicMaterial wireframe color="#99c3fb" />
        </mesh>
      )}
    </group>
  );
}