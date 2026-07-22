// catalog/bookcase/index.js
import { Bookcase } from './Bookcase'
export default {
  name: 'bookcase',
  prototype: 'items',
  info: { title: 'bookcase', tag: ['furnishings', 'wood'], image: require('./bookcase.png') },
  properties: { altitude: { label: 'altitude', type: 'length-measure',
                            defaultValue: { length: 0, unit: 'm' } } },
  Component: Bookcase,   
}

// in your scene, placing items from floorplan data
/* <Suspense fallback={null}>
  {items.map((el) => {
    const { Component } = catalog[el.name]
    return (
      <group key={el.id} position={[el.x, 0, el.z]} rotation-y={el.rotation}>
        <Component altitude={el.altitude} selected={el.id === selectedId} />
      </group>
    )
  })}
</Suspense> */