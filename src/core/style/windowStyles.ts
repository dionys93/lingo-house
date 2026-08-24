// src/core/style/windowStyles.ts
//
// Window appearance, chosen by the ROOM the window faces — a bathroom window
// isn't a kitchen window. The compiler doesn't know or care about style; it just
// emits where the window is and which room it touches, and the shell picks the
// look from here. Same "style follows the room" idea as wall colour, one level up.

import type { WallSide } from '../house/grid';

export interface WindowStyle {
  readonly frame: string;
  readonly glass: string;
  readonly glassOpacity: number; // higher = more private / less see-through
  readonly glassRoughness: number; // higher = more frosted
  readonly mullion: 'none' | 'horizontal' | 'vertical' | 'cross';
}

const STYLES: Record<string, WindowStyle> = {
  // Big, clear, low-silled picture window with a single vertical divide.
  livingRoom: { frame: '#efe9dd', glass: '#bcd6e0', glassOpacity: 0.26, glassRoughness: 0.08, mullion: 'vertical' },
  // Clear, split by a horizontal bar — the over-the-sink look.
  kitchen: { frame: '#cdbfa6', glass: '#c2dbe4', glassOpacity: 0.3, glassRoughness: 0.12, mullion: 'horizontal' },
  // Frosted for privacy: whiter, much more opaque, rough — you can't see through.
  bathroom: { frame: '#eef1ef', glass: '#dce7e6', glassOpacity: 0.68, glassRoughness: 0.55, mullion: 'none' },
};

const DEFAULT_STYLE: WindowStyle = {
  frame: '#ddd6c8',
  glass: '#c2dbe4',
  glassOpacity: 0.3,
  glassRoughness: 0.15,
  mullion: 'none',
};

// The room a window belongs to is the side that isn't the exterior.
export function roomOf(sides: readonly [WallSide, WallSide]): WallSide {
  return sides[0] === 'outside' ? sides[1] : sides[0];
}

export function styleForRoom(room: WallSide): WindowStyle {
  return room === 'outside' ? DEFAULT_STYLE : (STYLES[room] ?? DEFAULT_STYLE);
}