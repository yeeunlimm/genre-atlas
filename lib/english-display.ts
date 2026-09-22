// Display only. Source names, IDs and queries must retain their original values.
// Prefer a source-provided Latin name before calling this deterministic fallback.
const initial=["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const medial=["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const final=["","k","k","k","n","n","n","t","l","k","m","l","l","l","p","l","m","p","p","t","t","ng","t","t","k","t","p","t"];
const jamo:Record<string,string>={"ㄱ":"g","ㄲ":"kk","ㄴ":"n","ㄷ":"d","ㄸ":"tt","ㄹ":"r","ㅁ":"m","ㅂ":"b","ㅃ":"pp","ㅅ":"s","ㅆ":"ss","ㅇ":"ng","ㅈ":"j","ㅉ":"jj","ㅊ":"ch","ㅋ":"k","ㅌ":"t","ㅍ":"p","ㅎ":"h","ㅏ":"a","ㅐ":"ae","ㅑ":"ya","ㅒ":"yae","ㅓ":"eo","ㅔ":"e","ㅕ":"yeo","ㅖ":"ye","ㅗ":"o","ㅘ":"wa","ㅙ":"wae","ㅚ":"oe","ㅛ":"yo","ㅜ":"u","ㅝ":"wo","ㅞ":"we","ㅟ":"wi","ㅠ":"yu","ㅡ":"eu","ㅢ":"ui","ㅣ":"i"};
export const hasKorean=(value:string)=>/[\p{Script=Hangul}]/u.test(value);
export const isLatinName=(value:string)=>/[\p{Script=Latin}0-9]/u.test(value)&&!/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
export function englishText(value:string|undefined|null,fallback="Unavailable"):string {
 if(!value)return fallback;
 const romanized=value.normalize("NFC").replace(/[가-힣]+/g,word=>{
  const result=[...word].map(char=>{
   const code=char.charCodeAt(0)-0xac00;
   return initial[Math.floor(code/588)]+medial[Math.floor(code/28)%21]+final[code%28];
  }).join("");
  return result[0].toUpperCase()+result.slice(1);
 }).replace(/[ㄱ-ㅣ]/g,char=>jamo[char]||"");
 // Isolated archaic/jamo marks are not artist names; never leak Hangul into UI.
 return romanized.replace(/[\p{Script=Hangul}]/gu,"").trim()||fallback;
}
