// All warehouse layout and timing constants live here (documented in README).
//
// The floor is modelled as a grid of 1 m x 1 m cells, so every dimension
// below is a whole number of metres = a whole number of cells.

export const CELL_SIZE_M = 1;

export type FloorConfig = {
  aisles: number; // parallel picking aisles
  slotsPerFace: number; // slots along one rack face (one per metre)
  aisleWidth: number; // metres between the two rack faces of an aisle
  rackDepth: number; // metres, depth of one rack
  crossAisleWidth: number; // front and back cross-aisles (metres)
  dock: { x: number; y: number }; // grid cell of the packing dock
};

// 6 aisles, a rack on each side of each aisle, 10 slots per face -> 120 slots.
// Seen from above (x to the right, y going "into" the warehouse):
//
//   back cross-aisle (3 m)
//   R AAA R R AAA R ...   <- 10 slot rows
//   front cross-aisle (3 m), dock at the front-left corner (0,0)
export const FLOOR: FloorConfig = {
  aisles: 6,
  slotsPerFace: 10,
  aisleWidth: 3,
  rackDepth: 1,
  crossAisleWidth: 3,
  dock: { x: 0, y: 0 },
};

export const WALK_SPEED_MPS = 1.2; // metres per second
export const PICK_SECONDS_PER_LINE = 10; // time to pick one order line at the slot
export const PACK_SECONDS_PER_ORDER = 30; // packing time at the dock, once per order
