import { pipeline, env } from '@huggingface/transformers';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MODEL = 'Xenova/twitter-roberta-base-sentiment-latest';
export const REVISION = 'f3ec4d0925f90c3ca7ee7814f52d6ee7cf180445';
// Local CPU inference: no comment text is sent to an inference provider.
env.cacheDir = process.env.SENTIMENT_MODEL_CACHE || join(tmpdir(), 'genre-atlas-sentiment');
let classifier;
export async function sentiment(text) {
  classifier ??= pipeline('text-classification', MODEL, {revision: REVISION, dtype:'q8', device:'cpu'}).catch(error=>{classifier=undefined;throw error;});
  const output = await (await classifier)(text.replace(/https?:\/\/\S+/g,'http').replace(/@\w+/g,'@user'), {top_k:3, truncation:true, max_length:256});
  const scores = Object.fromEntries(output.map(x=>[x.label.toLowerCase(), x.score]));
  if (!['positive','neutral','negative'].every(k=>Number.isFinite(scores[k]))) throw new Error('Unexpected sentiment labels.');
  return {positive:scores.positive, neutral:scores.neutral, negative:scores.negative};
}

// Conservative, auditable rule filter, NOT a learned relevance classifier.
// Supports explicit English music evaluations only; uncertain comments abstain.
export function reviewEligibility(text) {
  if (text.length>1200 || /https?:|subscribe|my channel|who.*(?:202\d|here)|anyone.*listening/i.test(text)) return false;
  if (/[^\p{Script=Latin}\p{M}\p{N}\p{P}\p{S}\p{Z}\s]/u.test(text)) return false;
  return /\b(song|track|beat|vocals?|melody|production|instrumental|chorus|bass|outro|intro|music)\b/i.test(text)
    && /\b(love|like|hate|great|best|worst|beautiful|amazing|boring|bad|good|perfect|incredible|favorite|favourite|masterpiece|overrated|underrated|terrible|fire|enjoy|sounds?|hits?)\b/i.test(text);
}
