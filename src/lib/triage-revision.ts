/** Invalidate cached integration counts after a triage decision in this process. */
let revision = 0;
export const triageRevision = () => revision;
export const invalidateTriageCounts = () => { revision++; };
