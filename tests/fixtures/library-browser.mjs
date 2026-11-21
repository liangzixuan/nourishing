export const libraryBrowserBoot=`
import {initializeDeviceCache} from '/device-cache.js';
import {saveOfflineSnapshot} from '/offline-store.js';
import {startBackgroundWrites} from '/background-writes.js';
import {localLibraryItem} from '/local-engine.js';
const cacheTicket=await initializeDeviceCache('fixture');
await saveOfflineSnapshot(await (await fetch('/api/offline')).json(),cacheTicket);
startBackgroundWrites();
`;
