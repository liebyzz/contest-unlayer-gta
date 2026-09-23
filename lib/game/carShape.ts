/**
 * The dimensions every car is built from, in metres.
 *
 * Shared rather than private to the model, because two things need them and
 * they have to agree: `createCar` stacks meshes from these, and the bullet
 * trace in `world` decides what a round hits from them. They used to disagree —
 * the trace carried its own table and tested one box standing full height over
 * the whole footprint, so a shot aimed over a bonnet stopped dead on thin air.
 *
 * Local +X runs from the middle of the car towards the nose, +Y is up, +Z is
 * across. `cabOff` and `bed.along` are offsets on that length axis.
 */
import type { CarKind } from "./world";

export interface CarShape {
  length: number;
  width: number;
  /** the lower body, standing on the chassis line */
  bodyH: number;
  /** the greenhouse sitting on top of it */
  cabH: number;
  cabLen: number;
  cabOff: number;
  /** walls standing proud of the hull behind the cab, on anything that has them */
  bed?: { along: number; length: number; height: number; widthScale: number };
}

/** The chassis line: the gap under a car, between its wheels. */
export const HULL_FLOOR = 0.32;
/** A van is one slab, sitting higher and with no greenhouse on it. */
export const VAN_FLOOR = 0.5;
/** The thin panel capping the greenhouse. */
export const ROOF_CAP = 0.035;
/** The greenhouse is drawn narrower than the body it sits on. */
export const CAB_WIDTH_SCALE = 0.9;

export const CAR_SHAPE: Record<CarKind, CarShape> = {
  sedan: { length: 4.5, width: 1.88, bodyH: 0.72, cabH: 0.6, cabLen: 2.2, cabOff: -0.15 },
  hatch: { length: 3.95, width: 1.8, bodyH: 0.7, cabH: 0.62, cabLen: 2.0, cabOff: -0.3 },
  pickup: {
    length: 5.1,
    width: 2.02,
    bodyH: 0.84,
    cabH: 0.7,
    cabLen: 1.8,
    cabOff: 0.75,
    bed: { along: -1.4, length: 2.2, height: 0.44, widthScale: 0.94 },
  },
  van: { length: 5.4, width: 2.12, bodyH: 2.25, cabH: 0, cabLen: 0, cabOff: 0 },
};
