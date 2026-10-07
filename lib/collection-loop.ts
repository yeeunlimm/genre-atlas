export function wrapAlbumIndex(index:number,count:number):number{
 return count>0?((index%count)+count)%count:0;
}

// Three identical shelves keep native wheel/touch scrolling continuous. Rebase
// to the middle copy without changing which covers are visible.
export function loopScrollTop(top:number,span:number):number{
 if(!Number.isFinite(top)||!Number.isFinite(span)||span<=0)return 0;
 return span+((top-span)%span+span)%span;
}
