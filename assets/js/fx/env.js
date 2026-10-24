// Shared environment checks for the 2D effects. Read at call time so runtime changes are seen.
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

export const COARSE_QUERY = '(pointer: coarse)';

export const coarsePointer = () => Boolean(mq(COARSE_QUERY)?.matches);
export const noop = () => {};
