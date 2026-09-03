/**
 * Horde combat stages — FAR / STRUCTURE / FLOOR / SIGNAL.
 * 전투 캐릭터보다 먼저 튀지 않으면서, 단순 색 배경이 아니라 시설의 구조가
 * 보이도록 기계 패널·타워·배관·신호선을 반복 배치한다.
 */
import { Container, Graphics } from 'pixi.js';

export interface ThemeCtx { arenaW:number; arenaH:number; rnd:()=>number; }
export interface View { x0:number;y0:number;x1:number;y1:number; }
export interface StageTheme {
  id:string; name:string; accent:number;
  far:(g:Graphics,c:ThemeCtx)=>void;
  ground:(g:Graphics,c:ThemeCtx)=>void;
  anim?:(g:Graphics,c:ThemeCtx,t:number,v:View)=>void;
}

const DARK=0x07101d;
function border(g:Graphics,c:ThemeCtx,a:number):void {
  const {arenaW:W,arenaH:H}=c;
  g.rect(0,0,W,H).stroke({color:0x101d30,width:8});
  for(let x=16;x<W-16;x+=48){g.rect(x,3,22,2).fill({color:a,alpha:.55});g.rect(x+6,H-5,18,2).fill({color:a,alpha:.3});}
  for(let y=32;y<H-32;y+=64){g.rect(3,y,2,24).fill({color:a,alpha:.3});g.rect(W-5,y+14,2,24).fill({color:a,alpha:.5});}
  for(const [x,y] of [[12,12],[W-12,12],[12,H-12],[W-12,H-12]] as [number,number][]) {
    g.rect(x-6,y-6,12,12).fill({color:0x0b1728});g.rect(x-4,y-4,8,8).stroke({color:a,width:2});
  }
}
function floor(g:Graphics,c:ThemeCtx,tile:number,plate:number,hi:number,lo:number,line:number,a:number):void {
  const cols=Math.ceil(c.arenaW/tile), rows=Math.ceil(c.arenaH/tile);
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    const px=x*tile,py=y*tile,r=c.rnd();
    g.rect(px,py,tile,tile).fill({color:line});
    if(r<.12){g.rect(px+2,py+2,tile-4,tile-4).fill({color:DARK});g.rect(px+7,py+4,2,tile-8).fill({color:lo});continue;}
    g.rect(px+2,py+2,tile-4,tile-4).fill({color:plate});
    g.rect(px+2,py+2,tile-4,3).fill({color:hi});g.rect(px+2,py+2,3,tile-4).fill({color:hi});
    g.rect(px+2,py+tile-5,tile-4,3).fill({color:lo});g.rect(px+tile-5,py+3,3,tile-5).fill({color:lo});
    if(r>.8){g.rect(px+7,py+7,3,3).fill({color:a,alpha:.7});g.rect(px+tile-10,py+tile-10,3,3).fill({color:hi});}
  }
}
function tower(g:Graphics,x:number,y:number,w:number,h:number,body:number,edge:number,light:number):void {
  g.rect(x,y,w,h).fill({color:body});g.rect(x+4,y+4,w-8,h-8).stroke({color:edge,width:2});
  for(let yy=y+16;yy<y+h-10;yy+=20){g.rect(x+8,yy,w-16,3).fill({color:edge});g.rect(x+12,yy+1,Math.max(4,w-28),1).fill({color:light,alpha:.65});}
  g.rect(x+w/2-2,y-8,4,8).fill({color:light});
}
function pipe(g:Graphics,x:number,y:number,len:number,a:number,vertical=false):void {
  if(vertical){g.rect(x,y,5,len).fill({color:0x162941});g.rect(x+1,y,2,len).fill({color:a,alpha:.55});}
  else {g.rect(x,y,len,5).fill({color:0x162941});g.rect(x,y+1,len,2).fill({color:a,alpha:.55});}
}

const plant:StageTheme={id:'plant',name:'발전 구획',accent:0x55e7ff,
 far:(g,c)=>{g.rect(0,0,c.arenaW,c.arenaH).fill({color:0x050a16});for(let x=24;x<c.arenaW;x+=96){g.rect(x,0,14,c.arenaH).fill({color:0x0b1930});g.rect(x+3,0,3,c.arenaH).fill({color:0x1a3b61});}for(let i=0;i<7;i++)tower(g,80+i*205,90+(i%2)*30,72,360,0x091326,0x173a5d,0x2b78aa);},
 ground:(g,c)=>{floor(g,c,40,0x304d7d,0x638fc8,0x172947,0x070e1d,0x3dcfe9);for(let y=56;y<c.arenaH;y+=160){g.rect(0,y,c.arenaW,8).fill({color:0x091323});g.rect(0,y+2,c.arenaW,2).fill({color:0x255a78});for(let x=24;x<c.arenaW;x+=96)g.rect(x,y-3,14,14).fill({color:0x1b3658});}border(g,c,0x55e7ff);},
 anim:(g,_c,t,v)=>{const off=(t*150)%320;for(let x=Math.floor(v.x0/320)*320-off;x<v.x1+80;x+=320)g.rect(x,v.y0+1,56,4).fill({color:0x9cf7ff,alpha:.8});}
};
const coolant:StageTheme={id:'coolant',name:'냉각 구획',accent:0x8ceaff,
 far:(g,c)=>{g.rect(0,0,c.arenaW,c.arenaH).fill({color:0x061323});for(let x=20;x<c.arenaW;x+=128){g.rect(x,0,28,c.arenaH).fill({color:0x0d2941});g.rect(x+7,0,3,c.arenaH).fill({color:0x245d7d});}for(let i=0;i<18;i++){const x=c.rnd()*c.arenaW,y=40+c.rnd()*(c.arenaH-80);pipe(g,x,y,90+c.rnd()*90,0x4c91ae);}},
 ground:(g,c)=>{floor(g,c,44,0x4c7894,0x94c9df,0x27465d,0x0d1b2a,0x8ceaff);for(let i=0;i<14;i++){const x=70+c.rnd()*(c.arenaW-140),y=60+c.rnd()*(c.arenaH-120);g.circle(x,y,28).fill({color:0x18374e});g.circle(x,y,21).stroke({color:0x5d9fba,width:3});g.circle(x,y,8).fill({color:0x7ee6ff});}border(g,c,0x8ceaff);},
 anim:(g,_c,t,v)=>{const off=(t*90)%220;for(let x=Math.floor(v.x0/220)*220-off;x<v.x1+40;x+=220){g.rect(x,v.y0,2,v.y1-v.y0).fill({color:0x77dcff,alpha:.18});g.rect(x+1,v.y0+((t*80)%80),2,22).fill({color:0xd7f9ff,alpha:.55});}}
};
const furnace:StageTheme={id:'furnace',name:'용해 구획',accent:0xff8a42,
 far:(g,c)=>{g.rect(0,0,c.arenaW,c.arenaH).fill({color:0x120b0a});for(let x=0;x<c.arenaW;x+=110){g.rect(x,0,16,c.arenaH).fill({color:0x241513});g.rect(x+3,0,3,c.arenaH).fill({color:0x4b2920});}for(let i=0;i<6;i++){tower(g,70+i*230,120+(i%2)*40,86,330,0x1a1111,0x54302a,0xb34b2e);}},
 ground:(g,c)=>{floor(g,c,42,0x5b3730,0x9a5b45,0x2d1d1a,0x0d0909,0xff7b36);for(let y=70;y<c.arenaH;y+=126){g.rect(0,y,c.arenaW,7).fill({color:0x21100d});for(let x=0;x<c.arenaW;x+=72)g.rect(x,y+1,34,3).fill({color:0xc14e2d});}border(g,c,0xff8a42);},
 anim:(g,_c,t,v)=>{const p=(Math.sin(t*3)+1)*.5;for(let y=Math.floor(v.y0/126)*126;y<v.y1+30;y+=126)g.rect(v.x0,y+2,v.x1-v.x0,2).fill({color:0xffa34d,alpha:.25+.35*p});}
};
const rift:StageTheme={id:'rift',name:'균열 외곽',accent:0xd36cff,
 far:(g,c)=>{g.rect(0,0,c.arenaW,c.arenaH).fill({color:0x090714});for(let i=0;i<55;i++){const x=c.rnd()*c.arenaW,y=c.rnd()*c.arenaH,s=1+c.rnd()*3;g.rect(x,y,s,s).fill({color:i%4===0?0xa16bff:0x38406b,alpha:.65});}for(let i=0;i<8;i++){const x=60+i*190;g.moveTo(x,40).lineTo(x+70,180).lineTo(x+25,390).lineTo(x-45,240).closePath().fill({color:0x11102a});g.moveTo(x+4,60).lineTo(x+58,184).lineTo(x+28,360).stroke({color:0x3e315f,width:3});}},
 ground:(g,c)=>{floor(g,c,46,0x353354,0x6d66a1,0x24213c,0x0a0915,0xd36cff);for(let i=0;i<16;i++){const x=c.rnd()*c.arenaW,y=c.rnd()*c.arenaH;g.moveTo(x,y).lineTo(x+18,y-7).lineTo(x+31,y+2).lineTo(x+8,y+10).closePath().fill({color:0x4e4279});g.rect(x+7,y+1,10,2).fill({color:0x9f86e8});}border(g,c,0xd36cff);},
 anim:(g,_c,t,v)=>{const p=(Math.sin(t*2.5)+1)*.5;for(let x=Math.floor(v.x0/180)*180;x<v.x1+30;x+=180)g.rect(x,v.y0,2,v.y1-v.y0).fill({color:0xb77cff,alpha:.08+.1*p});}
};
export const THEMES:StageTheme[]=[plant,coolant,furnace,rift];

/** horde.ts의 기존 호출 규약: buildTheme(theme, width, height) */
export function buildTheme(theme:StageTheme, arenaW:number, arenaH:number):{far:Container;ground:Container} {
  let seed=0x5eED;
  const rnd=():number=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
  const c:ThemeCtx={arenaW,arenaH,rnd};
  const farG=new Graphics(), groundG=new Graphics();
  theme.far(farG,c); theme.ground(groundG,c);
  const far=new Container(), ground=new Container();
  far.addChild(farG); ground.addChild(groundG);
  return {far,ground};
}
