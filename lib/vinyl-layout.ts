// Every count occupies the full circle, not a fixed arc of slots.
export function vinylPosition(index:number,count:number){
  const a=-Math.PI/2+2*Math.PI*index/Math.max(1,count);
  const x=50+36*Math.cos(a),y=50+36*Math.sin(a);
  // Right-hand sleeves overlap left-hand sleeves, exposing their left edge.
  return {x,y,dx:-14,dy:-5,tilt:-12,depth:Math.round((x*Math.cos(-Math.PI/15)+y*Math.sin(-Math.PI/15))*10)+100};
}

export function shuffledVinyl<T>(items:readonly T[],seed:number):T[]{
  const result=[...items];let state=seed||1;
  for(let i=result.length-1;i>0;i--){state^=state<<13;state^=state>>>17;state^=state<<5;const j=(state>>>0)%(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
