// items/staircase/index.js
import { Staircase } from './Staircase'
export default {
  name: 'staircase',
  prototype: 'structure',
  info: { title: 'staircase', tag: ['structure', 'circulation'], image: require('./staircase.png') },
  properties: {
    steps:     { label: 'steps',       type: 'number',         defaultValue: 14 },
    totalRise: { label: 'rise',        type: 'length-measure', defaultValue: { length: 2.7, unit: 'm' } },
    totalRun:  { label: 'run',         type: 'length-measure', defaultValue: { length: 3.2, unit: 'm' } },
    width:     { label: 'width',       type: 'length-measure', defaultValue: { length: 1.0, unit: 'm' } },
    direction: { label: 'direction',   type: 'enum', values: { up: 'Up', down: 'Down' }, defaultValue: 'up' },
    to:        { label: 'connects to', type: 'string',         defaultValue: '' },
  },
  Component: Staircase,
}

// const goTo = (locationId) => transitionTo(locationId)  // same entry point the doors use

// // ground floor
// <group position={[gx1, 0, gz1]} rotation-y={rot1}>
//   <Staircase direction="up"   to="upstairs" onNavigate={goTo} />
// </group>
// <group position={[gx2, 0, gz2]} rotation-y={rot2}>
//   <Staircase direction="down" to="basement" onNavigate={goTo} />
// </group>