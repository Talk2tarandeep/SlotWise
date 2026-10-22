// The replay clock lives outside React so the 3D loop can advance it every
// frame without re-rendering components. The UI reads `tick` from the store,
// which the 3D loop updates ~10 times per second.
//
// Replays are deterministic: the simulation is recorded once, and the clock
// only chooses which recorded tick to show. Scrubbing never re-runs anything.

export const replayClock = {
  seconds: 0, // current replay time
};
