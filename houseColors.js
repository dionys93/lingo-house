// web/src/utils/houseColors.js
//
// Each entry is a full palette for the house. Adding a new color scheme is
// just adding a new entry here — nothing in HouseExplorer.jsx needs to
// change to support it, same idea as WALL_ANIMATIONS.

export const COLOR_SCHEMES = {
  robinsEgg: {
    wall: '#a8dadc',
    wallHover: '#c8e9ea',
    floor: '#c9b896',
    roof: '#4a4a4a',
    item: '#8b4a3c',
    door: '#8b5a2b',
    doorHover: '#a06b3a',
    ground: '#8bc34a',
  },

  sunset: {
    wall: '#f4a261',
    wallHover: '#f8c891',
    floor: '#e9c46a',
    roof: '#264653',
    item: '#e76f51',
    door: '#5c3a21',
    doorHover: '#6f4a2c',
    ground: '#b5a642',
  },

  monochrome: {
    wall: '#d4d4d4',
    wallHover: '#e8e8e8',
    floor: '#a3a3a3',
    roof: '#404040',
    item: '#737373',
    door: '#595959',
    doorHover: '#6b6b6b',
    ground: '#9e9e9e',
  },
};