// Every count occupies the full circle, not a fixed arc of slots.
export function vinylPosition(index:number,count:number){
  const a=-Math.PI/2+2*Math.PI*index/Math.max(1,count);
  return {x:50+36*Math.cos(a),y:50+36*Math.sin(a),dx:12*Math.cos(a),dy:12*Math.sin(a),tilt:28*Math.cos(a)};
}
