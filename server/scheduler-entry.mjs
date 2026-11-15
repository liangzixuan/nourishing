import {TablesDB} from 'node-appwrite';
import {AccountOperationClient,withinAccountOperation} from './account-operation-context.mjs';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {runCloudScheduler} from './cloud-scheduler.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';

/** Private Appwrite Function entry. Deploy with empty execute permissions and no schedule. */
export default async function schedulerEntry({req, res, log = () => {}, error = () => {}}) {
  if (process.env.SCHEDULER_ENABLED !== 'true') return res.json({ok: true, enabled: false}, 200);
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT, project = process.env.APPWRITE_FUNCTION_PROJECT_ID, key = req?.headers?.['x-appwrite-key'];
    if (!endpoint || !project || typeof key !== 'string' || !key) throw Error('Unavailable scheduler credentials.');
    const client = new AccountOperationClient().setEndpoint(endpoint).setProject(project).setKey(key), db = new TablesDB(client), lifecycle=createAccountLifecycle({db});
    const result = await runCloudScheduler({db, enabled: true, tickWorkspace: (owner, context) => lifecycle.run(owner,'scheduler.fasting',operation=>withinAccountOperation(operation,()=>createWorkspaceStore(db, owner).tickFasting(context)))});
    // Counts only: do not disclose account identities, health records, or credential errors.
    log(JSON.stringify(result));return res.json({ok: result.failed === 0, ...result}, result.failed ? 500 : 200);
  } catch {
    error('Scheduled fasting could not complete.');return res.json({ok: false, error: 'Scheduled fasting could not complete.'}, 500);
  }
}
