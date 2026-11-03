/** Runs in the preview: drag a picture to move it, zoom with the buttons or a pinch, double-click to reset. It
 * changes the page live, and tells the app (which owns the framing) once the gesture is done. */
export const MAX_ZOOM = 4

export const FRAME_SCRIPT = `
(function(){
  var MAX=${MAX_ZOOM};
  var clamp=function(v,a,b){return Math.min(b,Math.max(a,v));};
  var read=function(box){var i=box.querySelector('img.fr');
    return {z:parseFloat(i.style.getPropertyValue('--z')),
      cx:parseFloat(i.style.getPropertyValue('--cx')),cy:parseFloat(i.style.getPropertyValue('--cy')),
      rot:parseInt(i.dataset.rot,10)||0};};
  var aspect=function(box,f){var a=parseFloat(box.dataset.ar);return f.rot%180?1/a:a;};
  // Sizes in the page's pixels: the box, the picture filling it (cover) at
  // this zoom, and the least zoom that shows the whole picture.
  var geo=function(box,f){
    var b=box.getBoundingClientRect(),ar=aspect(box,f);
    var cover=Math.max(b.width,b.height*ar),w=cover*f.z;
    return {bw:b.width,bh:b.height,w:w,h:w/ar,zmin:Math.min(b.width,b.height*ar)/cover};};
  // A picture bigger than the box can't leave a gap; a smaller one stays inside.
  var span=function(box,size,c){
    var lo=Math.min(0,box-size),hi=Math.max(0,box-size);
    return clamp(c,(box/2-hi)/size,(box/2-lo)/size);};
  var fix=function(box,f){
    var g=geo(box,f);f.z=clamp(f.z,g.zmin,MAX);g=geo(box,f);
    f.cx=span(g.bw,g.w,f.cx);f.cy=span(g.bh,g.h,f.cy);return f;};
  var refresh=function(box){
    var f=read(box),g=geo(box,f),eps=.001;
    var set=function(a,off){var k=box.querySelector('[data-act="'+a+'"]');if(k)k.disabled=off;};
    set('in',f.z>=MAX-eps);set('out',f.z<=g.zmin+eps);
    set('reset',f.z===1&&f.cx===.5&&f.cy===.5&&f.rot===0);};
  var apply=function(box,f){
    var id=box.dataset.pic;
    document.querySelectorAll('[data-pic]').forEach(function(o){
      if(o.dataset.pic!==id)return;var i=o.querySelector('img.fr');
      i.dataset.rot=f.rot;i.style.setProperty('--ar',aspect(o,f));
      i.style.setProperty('--z',f.z);i.style.setProperty('--cx',f.cx);i.style.setProperty('--cy',f.cy);
      refresh(o);});};
  var post=function(m){parent.postMessage(m,'*');};
  var send=function(box,f){
    parent.postMessage({type:'calendar-frame',id:box.dataset.pic,zoom:f.z,cx:f.cx,cy:f.cy,rot:f.rot},'*');};
  var zoomAt=function(box,f,factor,px,py){
    var g=geo(box,f),b=box.getBoundingClientRect();
    var z=clamp(f.z*factor,g.zmin,MAX),k=z/f.z,w1=g.w*k,h1=g.h*k;
    var rx=px==null?g.bw/2:px-b.left, ry=py==null?g.bh/2:py-b.top;
    var left0=g.bw/2-f.cx*g.w, top0=g.bh/2-f.cy*g.h;
    var left1=rx-(rx-left0)*k, top1=ry-(ry-top0)*k;
    return fix(box,{z:z,cx:(g.bw/2-left1)/w1,cy:(g.bh/2-top1)/h1,rot:f.rot});};
  var drag=null;
  document.addEventListener('pointerdown',function(e){
    if(e.target.closest('.tools'))return;
    var box=e.target.closest('[data-pic]');if(!box||e.button)return;
    var f=read(box);
    drag={box:box,x:e.clientX,y:e.clientY,f:f,g:geo(box,f),moved:false};
    box.setPointerCapture(e.pointerId);});
  document.addEventListener('pointermove',function(e){
    if(!drag)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;
    var f=fix(drag.box,{z:drag.f.z,rot:drag.f.rot,cx:drag.f.cx-dx/drag.g.w,cy:drag.f.cy-dy/drag.g.h});
    drag.now=f;apply(drag.box,f);});
  var end=function(){if(drag&&drag.moved&&drag.now)send(drag.box,drag.now);drag=null;};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  document.addEventListener('dblclick',function(e){
    var box=e.target.closest('[data-pic]');if(!box||e.target.closest('.tools'))return;
    var f={z:1,cx:.5,cy:.5,rot:0};apply(box,f);send(box,f);});
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.tools button');
    if(!btn){var empty=e.target.closest('[data-slot].empty');
      if(empty)post({type:'calendar-add',slot:empty.dataset.slot});
      return;}
    if(btn.disabled)return;
    if(btn.dataset.act==='remove'){post({type:'calendar-remove',slot:btn.closest('[data-slot]').dataset.slot});return;}
    var box=btn.closest('[data-pic]'),f=read(box),act=btn.dataset.act;
    if(act==='reset')f={z:1,cx:.5,cy:.5,rot:0};
    else if(act==='rotate')f={z:1,cx:.5,cy:.5,rot:(f.rot+90)%360};
    else f=zoomAt(box,f,act==='in'?1.25:0.8);
    apply(box,f);send(box,f);});
  // Pictures dropped on a page go on it (an empty one, or one to replace); dropped anywhere else they do nothing, not
  // even open in the frame.
  var over=null;
  var mark=function(el){if(over&&over!==el)over.classList.remove('drop');over=el;if(el)el.classList.add('drop');};
  var hasFiles=function(e){return e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0;};
  document.addEventListener('dragover',function(e){
    if(!hasFiles(e))return;e.preventDefault();
    mark(e.target.closest('[data-slot]'));});
  document.addEventListener('dragleave',function(e){if(!e.relatedTarget)mark(null);});
  document.addEventListener('drop',function(e){
    if(!hasFiles(e))return;e.preventDefault();mark(null);
    var box=e.target.closest('[data-slot]');if(!box)return;
    var files=Array.prototype.filter.call(e.dataTransfer.files,function(f){return /^image\\//.test(f.type);});
    if(files.length)post({type:'calendar-drop',slot:box.dataset.slot,files:files});});
  var timer;
  document.addEventListener('wheel',function(e){
    if(!e.ctrlKey&&!e.metaKey)return;
    var box=e.target.closest('[data-pic]');if(!box)return;
    e.preventDefault();
    var f=zoomAt(box,read(box),Math.exp(-e.deltaY*0.01),e.clientX,e.clientY);apply(box,f);
    clearTimeout(timer);timer=setTimeout(function(){send(box,f);},250);},{passive:false});
  document.querySelectorAll('[data-pic]').forEach(refresh);
})();
`
