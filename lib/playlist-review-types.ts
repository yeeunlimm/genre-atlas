import type {ReviewSummary} from './review-sentiment';

export type ReviewTrack={title:string;artist:string;primaryArtistName?:string;durationMs?:number};
export type TrackReview={
  key:string;
  status:'ready'|'no-match'|'comments-disabled'|'no-evidence'|'unavailable';
  summary?:ReviewSummary;
  videoId?:string;
  videoTitle?:string;
  videosChecked?:number;
  reason?:string;
};
export type ReviewEvent=
  | {type:'progress';completed:number;total:number;result:TrackReview}
  | {type:'complete';total:number}
  | {type:'heartbeat'};
export type ReviewAvailability={ready:boolean;reason?:string};
