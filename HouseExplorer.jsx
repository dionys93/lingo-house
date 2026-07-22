// web/src/components/HouseExplorer.jsx
import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { Roof } from './house/Roof.jsx';
import { Ground } from './house/Ground.jsx';
import { Room } from './house/Room.jsx';
import { Walls } from './house/Walls.jsx';
import { FrontFacade } from './house/FrontFacade.jsx';
import { Door } from './house/Door.jsx';
import { InteriorDoorway } from './house/InteriorDoorway.jsx';
import { GableEnd } from './house/GableEnd.jsx';
import { CameraRig } from './house/CameraRig.jsx';
import { RoomBounds } from './house/RoomBounds.jsx';
import { ridgeHeight, WALL_HEIGHT } from './house/roofGeometry.js';
import { Railings } from './house/Railings.jsx';
import { Columns } from './house/Columns.jsx';
import { Stairs } from './house/Stairs.jsx';
import {
  ROOMS, DOORWAYS, PLACED_ITEMS,
  UPSTAIRS, UPSTAIRS_COLUMNS, STAIRWAYS, stairHolesFor,
  roomById, roomFloorLevel,
  parentOf, pathTo,
  RIDGE_AXIS, GABLE_SPAN,
  HOUSE_CENTER_X, HOUSE_CENTER_Z,
  HOUSE_LEFT_X, HOUSE_RIGHT_X,
  FRONT_WALL_Z, HOUSE_BACK_Z,
  EXTERIOR, EXTERIOR_CAMERA,
  EXTERIOR_MIN_DISTANCE, EXTERIOR_MAX_DISTANCE,
  INTERIOR_MIN_DISTANCE, INTERIOR_MAX_DISTANCE,
} from './house/constants.js';
import { ITEM_COMPONENTS } from './house/items';

export default function HouseExplorer({ colorScheme = 'robinsEgg' }) {
  const colors = COLOR_SCHEMES[colorScheme];
  const controlsRef = useRef();

  const [settledLocation, setSettledLocation] = useState(EXTERIOR);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [showExitArrow, setShowExitArrow] = useState(false);

  const isTransitioning = transitionTarget !== null;
  const isInterior = (isTransitioning ? transitionTarget : settledLocation) !== EXTERIOR;

  const isDoorOpen = (roomId) => {
    const onSettledPath = pathTo(settledLocation).includes(roomId);
    const onTargetPath = isTransitioning && pathTo(transitionTarget).includes(roomId);
    return onSettledPath || onTargetPath;
  };

  const goTo = (locationId) => {
    if (isTransitioning) return;
    setTransitionTarget(locationId);
  };
  const handleArrived = (locationId) => {
    setSettledLocation(locationId);
    setTransitionTarget(null);
  };
  const toggleRoom = (roomId) => () =>
    goTo(settledLocation === roomId ? parentOf(roomId) : roomId);

  const renderDoorway = (doorway) => (
    <group
      key={`door-${doorway.child}`}
      position={[doorway.wallCenter[0], 0, doorway.wallCenter[2]]}
      rotation={[0, doorway.rotationY, 0]}
    >
      {doorway.isExterior ? (
        <>
          <FrontFacade colors={colors} span={doorway.span} offset={doorway.offset} />
          <Door colors={colors} centerX={doorway.offset} animation={doorway.animation}
                open={isDoorOpen(doorway.child)} onToggle={toggleRoom(doorway.child)} />
        </>
      ) : (
        <InteriorDoorway colors={colors} span={doorway.span} offset={doorway.offset}
          animation={doorway.animation} open={isDoorOpen(doorway.child)}
          onToggle={toggleRoom(doorway.child)}
          interiorColor={roomById(doorway.child).interiorWallColor} />
      )}
    </group>
  );

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      <Canvas camera={{ position: EXTERIOR_CAMERA.position, fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Ground colors={colors} />
        <Roof colors={colors} />

        {/* Gable ends still use the single-roof globals — pre-existing seam,
            being replaced in the roof/gable pass. */}
        {RIDGE_AXIS === 'z' ? (
          <>
            <group position={[HOUSE_CENTER_X, 0, FRONT_WALL_Z]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={1} interiorColor={colors.wall} />
            </group>
            <group position={[HOUSE_CENTER_X, 0, HOUSE_BACK_Z]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={-1} interiorColor={colors.wall} />
            </group>
          </>
        ) : (
          <>
            <group position={[HOUSE_RIGHT_X, 0, HOUSE_CENTER_Z]} rotation={[0, Math.PI / 2, 0]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={1} interiorColor={colors.wall} />
            </group>
            <group position={[HOUSE_LEFT_X, 0, HOUSE_CENTER_Z]} rotation={[0, Math.PI / 2, 0]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={-1} interiorColor={colors.wall} />
            </group>
          </>
        )}

        {/* Ground floor — everything at y=0. */}
        <Walls colors={colors} />
        {DOORWAYS.filter((d) => d.level === 0).map(renderDoorway)}
        {ROOMS.filter((r) => roomFloorLevel(r.id) === 0).map((room) => (
          <Room key={room.id} roomId={room.id} colors={colors} />
        ))}

        {/* Second storey — deck-relative, inside one baseY group. The bedroom
            floor gets a hole cut where the stair lands. */}
        <group position={[0, UPSTAIRS.baseY, 0]}>
          {UPSTAIRS.roomRect && (
            <Room roomId="bedroom" colors={colors} rect={UPSTAIRS.roomRect}
                  ceilingColor={UPSTAIRS.ceilingColor} holes={stairHolesFor('bedroom')} />
          )}
          {UPSTAIRS.balconyRect && (
            <Room roomId="balcony" colors={colors} rect={UPSTAIRS.balconyRect} ceiling={false} />
          )}
          <Walls colors={colors} runs={UPSTAIRS.walls} />
          {DOORWAYS.filter((d) => d.level > 0).map(renderDoorway)}
          <Railings runs={UPSTAIRS.railings} colors={colors} />
        </group>

        {/* Bridge-floor elements render at absolute Y. */}
        <Columns columns={UPSTAIRS_COLUMNS} colors={colors} />
        {STAIRWAYS.map((stair) => (
          <Stairs key={`stair-${stair.child}`} stair={stair} colors={colors} onNavigate={toggleRoom(stair.child)} />
        ))}

        {PLACED_ITEMS.map((item, i) => {
          const Item = ITEM_COMPONENTS[item.type];
          if (!Item) return null;
          return (
            <group key={i} position={[item.x, 0, item.z]} rotation={[0, item.rotationY ?? 0, 0]}>
              <Item length={item.length} />
            </group>
          );
        })}

        <CameraRig fromLocation={settledLocation} transitionTarget={transitionTarget} controlsRef={controlsRef} onArrived={handleArrived} />
        <OrbitControls
          ref={controlsRef}
          enabled={!isTransitioning}
          enablePan={false}
          minDistance={isTransitioning ? 0 : isInterior ? INTERIOR_MIN_DISTANCE : EXTERIOR_MIN_DISTANCE}
          maxDistance={isTransitioning ? 50 : isInterior ? INTERIOR_MAX_DISTANCE : EXTERIOR_MAX_DISTANCE}
          maxPolarAngle={isTransitioning ? Math.PI : Math.PI / 2 - 0.05}
        />
        <RoomBounds controlsRef={controlsRef} settledLocation={settledLocation} active={!isTransitioning} />
      </Canvas>

      {isInterior && (
        <div
          onMouseEnter={() => setShowExitArrow(true)}
          onMouseLeave={() => setShowExitArrow(false)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '18px' }}
        >
          <button onClick={() => goTo(parentOf(settledLocation))} aria-label="Go back"
            style={{ width: '48px', height: '48px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(17, 24, 39, 0.6)', color: '#ffffff', fontSize: '1.3rem', cursor: 'pointer', opacity: showExitArrow ? 1 : 0, transition: 'opacity 0.25s ease', pointerEvents: showExitArrow ? 'auto' : 'none' }}>
            ←
          </button>
        </div>
      )}
    </div>
  );
}