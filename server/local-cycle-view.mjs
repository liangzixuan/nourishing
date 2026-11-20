import {projectCycleView} from './domain/cycle-view-projection.mjs';
// The local chart entry validates records and SHA-256 identities with WebCrypto
// before calling any chart producer. This adapter consumes those parsed records.
export function createCycleView(state,input,clock){return projectCycleView(state.cycleRecords,input,clock);}
