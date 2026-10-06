export type Genre = {name: string; title: string; englishName?:string|null};
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
  "슈게이즈":"Shoegaze", "그런지":"Grunge", "펑크":"Funk", "포스트 펑크":"Post-Punk",
  "하드 록":"Hard Rock", "하드록":"Hard Rock", "헤비메탈":"Heavy Metal", "블루스":"Blues",
  "블루스 록":"Blues Rock", "컨트리":"Country", "컨트리 음악":"Country",
  "레게":"Reggae", "스카":"Ska", "덥스텝":"Dubstep", "테크노":"Techno",
  "드럼 앤 베이스":"Drum and Bass", "클래식 음악":"Classical", "클래식":"Classical",
  "가스펠":"Gospel", "트로트":"Trot", "국악":"Korean Traditional Music",
  "얼터너티브 팝":"Alternative Pop", "팝 록":"Pop Rock", "팝 펑크":"Pop Punk",
  "랩 록":"Rap Rock", "랩 메탈":"Rap Metal", "뉴 메탈":"Nu Metal", "네오 소울":"Neo-Soul",
  "쟁글 팝":"Jangle Pop", "트위 팝":"Twee Pop", "파워 팝":"Power Pop",
  "영국 힙합":"UK Hip-Hop", "UK 힙합":"UK Hip-Hop", "UK 드릴":"UK Drill", "드릴":"Drill", "시카고 드릴":"Chicago Drill",
  "재즈 랩":"Jazz Rap", "붐뱁":"Boom Bap", "붐 뱁":"Boom Bap", "갱스터 랩":"Gangsta Rap", "컨셔스 힙합":"Conscious Hip-Hop",
  "멈블 랩":"Mumble Rap", "이모 랩":"Emo Rap", "레이지":"Rage", "플러그앤비":"PluggNB", "저지 클럽":"Jersey Club",
  "글램 록":"Glam Rock", "개러지 록":"Garage Rock", "노이즈 록":"Noise Rock", "매스 록":"Math Rock", "이모":"Emo",
  "슬래커 록":"Slacker Rock", "소프트 록":"Soft Rock", "서프 록":"Surf Rock", "포스트 하드코어":"Post-Hardcore",
  "뉴 웨이브":"New Wave", "뉴웨이브":"New Wave", "콜드 웨이브":"Coldwave", "다크웨이브":"Darkwave",
  "베드룸 팝":"Bedroom Pop", "챔버 팝":"Chamber Pop", "바로크 팝":"Baroque Pop", "아트 팝":"Art Pop", "하이퍼팝":"Hyperpop",
  "일렉트로닉 록":"Electronic Rock", "인더스트리얼 록":"Industrial Rock", "인더스트리얼":"Industrial",
  "테크 하우스":"Tech House", "딥 하우스":"Deep House", "프렌치 하우스":"French House", "퓨처 베이스":"Future Bass",
  "UK 개러지":"UK Garage", "브레이크비트":"Breakbeat", "정글":"Jungle", "풋워크":"Footwork", "트랜스":"Trance",
  "신스웨이브":"Synthwave", "베이퍼웨이브":"Vaporwave", "칠웨이브":"Chillwave", "다운템포":"Downtempo",
  "애시드 재즈":"Acid Jazz", "재즈 퓨전":"Jazz Fusion", "스무스 재즈":"Smooth Jazz", "보사노바":"Bossa Nova",
  "시티 팝":"City Pop", "시티팝":"City Pop", "로파이 힙합":"Lo-Fi Hip-Hop", "로파이":"Lo-Fi",
};
const key=(s:string)=>s.normalize("NFKC").replace(/\((?:음악|장르)\)$/g,"").replace(/\s+/g,"").toLowerCase();
const indexed=new Map(Object.entries(labels).map(([k,v])=>[key(k),v]));
const isEnglish=(s:string|undefined|null):s is string=>!!s&&/[A-Za-z]/.test(s)&&!/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s)&&s.length<100;
export function knownGenreLabel(g:Genre):string|null{
  // Actual bilingual source heading wins. Never romanize genre names.
  if(isEnglish(g.englishName))return g.englishName;
  return indexed.get(key(g.name))||indexed.get(key(g.title))||(isEnglish(g.name)?g.name:isEnglish(g.title)?g.title:null);
}
// Translate display labels only; source titles still drive exact genre matching.
export function genreLabel(g: Genre) { return knownGenreLabel(g)||g.name; }
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
