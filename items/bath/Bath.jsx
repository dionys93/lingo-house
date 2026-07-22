// items/bath/Bath.jsx  — a tub/shower, also room-agnostic
const PORCELAIN = '#f7f7f4';
const CHROME = '#c8ccce';

export function Bath({ length = 1.5, selected = false }) {
  return (
    <group>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[0.7, 0.56, length]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* shower riser at one end */}
      <mesh position={[0, 1.1, -length / 2 + 0.08]}>
        <cylinderGeometry args={[0.02, 0.02, 1.6, 12]} />
        <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.75, 0.6, length + 0.05]} />
          <meshBasicMaterial wireframe color="#99c3fb" />
        </mesh>
      )}
    </group>
  );
}