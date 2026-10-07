import {readRankerArtifact} from '@/lib/catboost-seed-ranker';
import deployedModel from '@/models/station-ranker.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {'Cache-Control': 'no-store'};
export async function GET() {
  try {
    // Static numeric artifact only: never trace private work/ training files.
    // User-authorized experiment, not a claim of demonstrated quality uplift.
    const artifact = readRankerArtifact(deployedModel);
    if (artifact) return Response.json({status: 'ready', deploymentMode: 'experimental', qualityImprovementVerified: false, artifact}, {headers});
  } catch { /* Missing/invalid/unapproved model is an expected cold start. */ }
  return Response.json({status: 'unavailable', message: 'No approved selected-song CatBoost model. Existing source ranking remains active.'}, {headers});
}
