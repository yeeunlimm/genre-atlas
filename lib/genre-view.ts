export type Genre = {name: string; title: string};
const labels: Record<string, string> = {
  "사이키델릭 록":"Psychedelic Rock", "사이키델릭 팝":"Psychedelic Pop",
  "네오 사이키델리아":"Neo-Psychedelia", "인디 록":"Indie Rock", "인디 팝":"Indie Pop",
  "얼터너티브 록":"Alternative Rock", "아트 록":"Art Rock", "익스페리멘탈 록":"Experimental Rock",
  "프로그레시브 록":"Progressive Rock", "전자 음악":"Electronic", "일렉트로니카":"Electronica",
  "신스팝":"Synth-Pop", "신스 팝":"Synth-Pop", "드림 팝":"Dream Pop",
  "브릿팝":"Britpop", "포스트 록":"Post-Rock", "록 음악":"Rock", "록":"Rock",
  "팝 음악":"Pop", "팝":"Pop", "힙합":"Hip-Hop", "힙합 음악":"Hip-Hop",
  "트랩":"Trap", "트랩(음악)":"Trap", "힙합(음악)":"Hip-Hop", "남부 힙합":"Southern Hip-Hop", "서부 힙합":"West Coast Hip-Hop", "동부 힙합":"East Coast Hip-Hop", "얼터너티브 힙합":"Alternative Hip-Hop", "클라우드 랩":"Cloud Rap",
  "재즈":"Jazz", "솔 음악":"Soul", "소울":"Soul", "리듬 앤 블루스":"R&B",
  "컨템퍼러리 R&B":"Contemporary R&B", "얼터너티브 R&B":"Alternative R&B",
  "펑크 록":"Punk Rock", "디스코":"Disco", "누 디스코":"Nu-Disco", "댄스 팝":"Dance-Pop",
  "발라드":"Ballad", "포크 음악":"Folk", "포크":"Folk", "포크 록":"Folk Rock",
  "슈게이징":"Shoegaze", "앰비언트":"Ambient", "트립합":"Trip-Hop",
  "하우스 음악":"House", "하우스":"House", "일렉트로팝":"Electropop", "케이팝":"K-Pop",
};
// Translate display labels only; source titles still drive exact genre matching.
export function genreLabel(g: Genre) { return labels[g.name] || labels[g.title] || g.name; }
export function genreOutcome(total: number, matched: number, unknown: number, label: string) {
  if (matched > 0) return {
    fallback: false,
    note: matched + " of " + total + " related artists verified as " + label +
      (unknown ? ". " + unknown + " could not be checked." : "."),
  };
  return {
    fallback: true,
    note: unknown === total && total > 0
      ? "Genre data is unavailable for these artists. Showing all related artists."
      : "No verified " + label + " matches in this recommendation set." +
        (unknown ? " " + unknown + " artists could not be checked." : "") +
        " Showing all related artists.",
  };
}
