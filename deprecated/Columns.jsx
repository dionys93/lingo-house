// web/src/components/house/Columns.jsx
const COL_T = 0.08;

export function Columns({ columns, colors }) {
  if (!columns?.length) return null;
  return (
    <>
      {columns.map((c, i) => (
        <mesh key={i} position={[c.x, c.height / 2, c.z]}>
          <boxGeometry args={[COL_T, c.height, COL_T]} />
          <meshStandardMaterial color={colors.wall} />
        </mesh>
      ))}
    </>
  );
}