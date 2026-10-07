import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {readRankerArtifact} from '@/lib/catboost-seed-ranker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {'Cache-Control': 'no-store'};
export async function GET() {
  try {
    // One fixed deployment artifact. An arbitrary filesystem/env path would
    // make Next trace the entire project, including private experiment files.
    const file = path.join(process.cwd(), 'work', 'station-seed-ranker.json');
    if ((await stat(file)).size > 2_000_000) throw new Error('Too large');
    const artifact = readRankerArtifact(JSON.parse(await readFile(file, 'utf8')));
    if (artifact) return Response.json({status: 'ready', artifact}, {headers});
  } catch { /* Missing/invalid/unapproved model is an expected cold start. */ }
  return Response.json({status: 'unavailable', message: 'No approved seed-pair CatBoost model. Existing source ranking remains active.'}, {headers});
}
