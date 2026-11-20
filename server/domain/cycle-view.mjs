import {parseCycleRecords} from './cycle-records.mjs';
import {projectCycleView} from './cycle-view-projection.mjs';
export function createCycleView(state,input,clock){return projectCycleView(parseCycleRecords(state.cycleRecords),input,clock);}
