// Every count occupies the full circle, not a fixed arc of slots.
export function vinylPosition(index:number,count:number){
  const a=-Math.PI/2+2*Math.PI*index/Math.max(1,count);
  const x=50+40*Math.cos(a),y=50+40*Math.sin(a);
  // Sleeve tops face away from the spindle, including upside-down bottom covers.
  return {x,y,dx:12*Math.cos(a),dy:12*Math.sin(a),tilt:360*index/Math.max(1,count),depth:index+1};
}

export function shuffledVinyl<T>(items:readonly T[],seed:number):T[]{
  const result=[...items];let state=seed||1;
  for(let i=result.length-1;i>0;i--){state^=state<<13;state^=state>>>17;state^=state<<5;const j=(state>>>0)%(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
