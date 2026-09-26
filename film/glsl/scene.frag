#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
// Falcon 9 night launch from a 39A-style pad, and the ascent into sunlight.
// Units: metres, seconds. y is up. Rocket axis at x=z=0.
in vec2 vUv; out vec4 fragColor;

uniform vec2  uRes, uJitter;
uniform float uSeed, uWeight;
uniform vec3  uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf;
uniform float uShot;                 // 0: pad, 1: high altitude
uniform float uTIgn, uTLift, uRocketY, uThrust, uTime;
uniform float uFlood, uGreen, uTrench;
uniform float uAlt;                  // shot 1: altitude in km
uniform vec3  uSunDir;
uniform float uPlumeX;               // shot 1: plume expansion
uniform float uPitch;                // shot 1: vehicle pitch from vertical (rad), about z
uniform sampler3D uNoise;
uniform sampler2D uLivery;

#define PI 3.14159265
const float R1 = 1.83;
const float NOZ_Y = 5.0;

float gRnd;
vec3  gSmokeGlow;      // accumulated fire-lit smoke, feeds a soft bounce onto surfaces

// ---------------------------------------------------------------- utils
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715)))); }
float sat(float x){ return clamp(x,0.,1.); }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdBox2(vec2 p, vec2 b){ vec2 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,q.y),0.); }
vec2 azRot(vec2 xz, float a){ float c=cos(a), s=sin(a); return vec2(c*xz.x+s*xz.y, -s*xz.x+c*xz.y); }
vec4 N3(vec3 p){ return texture(uNoise,p); }
float smin(float a,float b,float k){ float h=sat(0.5+0.5*(b-a)/k); return mix(b,a,h)-k*h*(1.-h); }

// ---------------------------------------------------------------- vehicle
float bodyR(float h){
  if(h<57.3) return R1;
  if(h<58.5) return R1+(h-57.3)/1.2*0.77;
  if(h<64.0) return 2.6;
  const float L=6.0, R=2.6, rho=(R*R+L*L)/(2.0*R);
  float x=max(70.0-h,0.0);
  return sqrt(max(rho*rho-(L-x)*(L-x),0.))+R-rho;
}

float nozzle(vec3 n){
  float rr=length(n.xz), hh=n.y;
  float s=sat(hh/1.3);
  float R=0.16+0.30*(1.0-pow(s,1.8));
  float d=(abs(rr-R)-0.018)*0.82;
  d=max(d,max(-hh,hh-1.5));
  d=min(d,length(vec2(rr-0.462,hh-0.015))-0.026);          // exit lip
  return d;
}

// q: rocket-local (origin at centre of the nozzle exit plane)
vec2 mapRocket(vec3 q){
  float r=length(q.xz);
  float bd=max(r-3.3,max(-q.y-0.6,q.y-70.8));
  if(bd>1.0) return vec2(bd,0.);
  float h=q.y, a=atan(q.z,q.x);
  float k=(h>57.3&&h<58.5)?0.8:(h>64.0?0.72:1.0);
  vec2 res=vec2(max((r-bodyR(h))*k,max(1.55-h,h-70.0)),1.);

  // octaweb heat shield
  float ow=max(sdBox2(vec2(r,h-1.42),vec2(1.76,0.13))-0.03,0.);
  ow=sdBox2(vec2(max(r-0.9,0.),h-1.42),vec2(0.86,0.12))-0.03;
  if(ow<res.x) res=vec2(ow,6.);

  // Merlins: 8 around, 1 centre
  if(h<1.8){
    float ia=round((a-PI/8.)/(PI/4.)), ang=PI/8.+ia*PI/4.;
    float dn=min(nozzle(q-vec3(cos(ang)*1.26,0.,sin(ang)*1.26)),nozzle(q));
    if(dn<res.x) res=vec2(dn,5.);
  }

  // raceways (cable tunnels)
  for(int i=0;i<2;i++){
    float ph=0.42+float(i)*PI;
    vec2 l=azRot(q.xz,ph);
    float dr=max(sdBox2(l-vec2(R1+0.02,0.),vec2(0.12,0.15))-0.035,abs(h-22.6)-20.8);
    dr=min(dr,max(sdBox2(l-vec2(R1+0.01,0.),vec2(0.08,0.09))-0.02,abs(h-53.6)-3.6));
    if(dr<res.x) res=vec2(dr,1.);
  }

  // landing legs, stowed
  if(h<11.0){
    float ia=round((a-PI/4.)/(PI/2.)), ph=PI/4.+ia*PI/2.;
    vec2 l=azRot(q.xz,ph);
    float t=sat((h-1.0)/9.4);
    float hw=mix(0.54,0.30,t)-0.2*smoothstep(0.86,1.0,t);
    float th=mix(0.44,0.22,t);
    vec2 c2=vec2(l.x-(R1-0.06+th*0.5),l.y);
    c2.y=abs(c2.y)+max(c2.x+th*0.5,0.)*0.32;
    float dl=(sdBox2(c2,vec2(th*0.5,max(hw,0.05)))-0.035)*0.8;
    dl=max(dl,max(0.85-h,h-10.4));
    // hinge / pusher housing at the root
    dl=min(dl,sdBox(vec3(l.x-(R1+0.18),h-1.2,l.y),vec3(0.26,0.42,0.42))-0.05);
    if(dl<res.x) res=vec2(dl,3.);
  }

  // grid fins, stowed flat against the interstage
  if(h>46.0&&h<50.2){
    float ia=round(a/(PI/2.)), ph=ia*PI/2.;
    vec2 l=azRot(q.xz,ph);
    vec3 f=vec3(l.x-(R1+0.2),h-48.75,l.y);
    float box=sdBox(f,vec3(0.11,0.8,0.64));
    float dfin=box;
    if(box<0.2){
      vec2 uv=vec2(f.z+f.y,f.z-f.y)*0.70710678;
      const float c=0.135;
      vec2 cell=(fract(uv/c)-0.5)*c;
      float hole=max(abs(cell.x),abs(cell.y))-(c*0.5-0.012);
      float inner=sdBox2(vec2(f.z,f.y),vec2(0.57,0.73));
      dfin=max(box,-max(hole,inner));
    }
    float act=sdBox(vec3(l.x-(R1+0.08),h-47.5,l.y),vec3(0.12,0.4,0.3))-0.05;
    if(dfin<res.x) res=vec2(dfin,4.);
    if(act<res.x) res=vec2(act,3.);
  }
  return res;
}

// ---------------------------------------------------------------- pad
float trussSq(vec3 p, float hx, float hz, float ch, float m){
  vec2 cq=vec2(abs(p.x)-hx,abs(p.z)-hz);
  float d=sdBox2(cq,vec2(m*1.4));
  float yy=p.y-ch*round(p.y/ch);
  float v=mod(p.y,ch);
  // x faces
  float fx=abs(p.x)-hx;
  float hb=sdBox2(vec2(fx,yy),vec2(m));
  vec2 dd=normalize(vec2(2.*hz,ch));
  float u1=abs((p.z+hz)*dd.y-v*dd.x), u2=abs((-p.z+hz)*dd.y-v*dd.x);
  float dg=length(vec2(fx,min(u1,u2)))-m*0.8;
  d=min(d,max(min(hb,dg),abs(p.z)-hz));
  // z faces
  float fz=abs(p.z)-hz;
  hb=sdBox2(vec2(fz,yy),vec2(m));
  dd=normalize(vec2(2.*hx,ch));
  u1=abs((p.x+hx)*dd.y-v*dd.x); u2=abs((-p.x+hx)*dd.y-v*dd.x);
  dg=length(vec2(fz,min(u1,u2)))-m*0.8;
  d=min(d,max(min(hb,dg),abs(p.x)-hx));
  return d;
}

float groundH(vec2 xz){
  float m=sdBox2(xz-vec2(8.,0.),vec2(58.,50.))-6.;
  float h=-14.0*smoothstep(0.,48.,m);
  float far=smoothstep(200.,500.,length(xz));
  // scrub and tree lines toward the horizon
  h+=far*(N3(vec3(xz*0.0021,0.37)).b-0.45)*22.0;
  h+=far*pow(N3(vec3(xz*0.011,0.71)).a,2.0)*9.0;
  return h;
}

vec2 mapPad(vec3 p){
  vec2 res=vec2(1e9,0.);
  // ground: deck / mound / terrain, ocean far to the east (-z)
  float gh=groundH(p.xz);
  float ocean=-15.0;
  float land=smoothstep(-900.,-700.,p.z);
  float g=mix(ocean,max(gh,ocean),land);
  float dg=(p.y-g)*0.85;
  // flame pit under the mount and trench tunnel to the north (+x)
  dg=max(dg,-sdBox(p-vec3(0.,-7.,0.),vec3(4.8,7.5,4.8)));
  dg=max(dg,-sdBox(p-vec3(45.,-8.,0.),vec3(45.,5.5,8.5)));
  float mat=p.z<-800.?11.:(max(abs(p.x-8.),abs(p.z))<64.?8.:9.);
  res=vec2(dg,mat);

  // launch mount
  vec3 pa=vec3(abs(p.x),p.y,abs(p.z));
  float mnt=sdBox(pa-vec3(4.4,2.2,4.4),vec3(0.95,2.2,0.95));
  mnt=min(mnt,max(sdBox(p-vec3(0.,4.1,0.),vec3(5.4,0.4,5.4)),-(length(p.xz)-2.7)));
  vec3 pc=pa.x>pa.z?pa:pa.zyx;
  mnt=min(mnt,sdBox(pc-vec3(2.75,5.55,0.),vec3(0.95,0.95,0.32))-0.05);
  // transporter-erector: base, strongback truss, retracted clamp arms
  mnt=min(mnt,sdBox(p-vec3(-10.,2.6,0.),vec3(4.6,2.6,5.8)));
  if(sdBox(p-vec3(-7.5,34.,0.),vec3(2.2,34.,3.4))<1.0){
    float te=max(trussSq(p-vec3(-7.5,0.,0.),1.6,2.8,3.4,0.16),abs(p.y-34.)-33.);
    te=min(te,sdBox(p-vec3(-7.5,67.2,0.),vec3(1.9,0.35,3.1)));
    for(int i=0;i<3;i++){ float y=float(i)==0.?30.5:(float(i)==1.?47.:60.5);
      te=min(te,sdBox(p-vec3(-4.9,y,0.),vec3(1.1,0.35,0.55))); }
    mnt=min(mnt,te);
  } else mnt=min(mnt,sdBox(p-vec3(-7.5,34.,0.),vec3(2.2,34.,3.4)));
  if(mnt<res.x) res=vec2(mnt,7.);

  // fixed service structure with lightning mast and crew access arm
  vec3 fp=p-vec3(16.,0.,-26.);
  float fb=sdBox(fp-vec3(0.,41.,0.),vec3(6.5,41.,6.5));
  float fs;
  if(fb<1.0){
    fs=max(trussSq(fp,6.,6.,6.,0.28),abs(fp.y-40.5)-40.5);
    fs=min(fs,max(sdBox2(vec2(abs(fp.x)-0.,abs(fp.z)-6.),vec2(0.35)),abs(fp.y-40.5)-40.5));
    float fy=fp.y-12.*round(fp.y/12.);
    fs=min(fs,max(sdBox(vec3(fp.x,fy,fp.z),vec3(6.,0.18,6.)),abs(fp.y-40.)-40.));
    fs=min(fs,sdBox(fp-vec3(0.,81.5,0.),vec3(6.3,1.0,6.3)));
  } else fs=fb;
  float mast=max(length(fp.xz)-mix(0.9,0.3,sat((fp.y-82.)/28.)),abs(fp.y-96.)-14.);
  fs=min(fs,mast);
  float arm=sdBox(fp-vec3(15.5,65.,4.5),vec3(9.5,1.5,1.5));
  fs=min(fs,arm);
  if(fs<res.x) res=vec2(fs,7.);

  // water tower in the distance
  vec3 wp=p-vec3(-230.,-14.,-150.);
  float wt=min(length(wp-vec3(0.,62.,0.))-10.,max(length(wp.xz)-3.,wp.y-60.));
  if(wt<res.x) res=vec2(wt,10.);
  return res;
}

float rocketBaseY(){ return NOZ_Y+uRocketY; }

vec2 map(vec3 p){
  if(uShot>0.5) return mapRocket(p);
  vec2 a=mapRocket(p-vec3(0.,rocketBaseY(),0.));
  vec2 b=mapPad(p);
  return a.x<b.x?a:b;
}

vec3 calcNormal(vec3 p, float e){
  const vec2 k=vec2(1,-1);
  return normalize(k.xyy*map(p+k.xyy*e).x+k.yyx*map(p+k.yyx*e).x+k.yxy*map(p+k.yxy*e).x+k.xxx*map(p+k.xxx*e).x);
}

float softShadow(vec3 ro, vec3 rd, float tmax, float k){
  float res=1., t=0.04;
  for(int i=0;i<56;i++){
    float h=map(ro+rd*t).x;
    res=min(res,k*h/t);
    t+=clamp(h,0.03,6.0);
    if(res<0.003||t>tmax) break;
  }
  return sat(res);
}

float calcAO(vec3 p, vec3 n){
  float o=0., s=1.;
  for(int i=0;i<5;i++){
    float h=0.08+0.9*float(i*i)*0.35;
    o+=(h-map(p+n*h).x)*s; s*=0.6;
  }
  return sat(1.0-o*0.35);
}

// ---------------------------------------------------------------- sky
vec3 SUN(){ return uShot>0.5?uSunDir:normalize(vec3(0.05,-0.13,-1.0)); }

vec3 stars(vec3 rd){
  vec3 c=vec3(0);
  for(int i=0;i<2;i++){
    float sc=i==0?420.:900.;
    vec3 sp=rd*sc; vec3 id=floor(sp); vec3 f=fract(sp)-0.5;
    float h=hash13(id+float(i)*17.);
    if(h>0.985){
      vec3 o=vec3(hash13(id+1.3),hash13(id+2.7),hash13(id+5.1))-0.5;
      float d=length(f-o*0.6);
      float b=pow((h-0.985)/0.015,6.0)*(i==0?1.0:0.35);
      float temp=hash13(id+9.1);
      vec3 tc=mix(vec3(1.0,0.75,0.55),vec3(0.7,0.82,1.0),temp);
      c+=tc*b*smoothstep(0.09,0.0,d)*2.0;
    }
  }
  return c;
}

vec3 milkyWay(vec3 rd){
  // band tilted across the sky
  vec3 ax=normalize(vec3(0.35,0.55,0.76));
  float b=dot(rd,ax);
  float n=N3(rd*0.9+0.3).r, n2=N3(rd*2.3).g, n3=N3(rd*4.7+1.1).b;
  float band=exp(-b*b*28.0)*(0.5+0.9*n);
  float dust=smoothstep(0.35,0.75,n2)*exp(-b*b*90.0);
  vec3 c=vec3(0.55,0.5,0.45)*band*(0.6+0.6*n3);
  c*=1.0-dust*0.35;
  c+=vec3(0.9,0.7,0.5)*exp(-b*b*60.)*pow(max(dot(rd,normalize(vec3(0.6,0.2,0.6))),0.),6.)*0.8;
  return c*0.012;
}

vec3 cirrus(vec3 ro, vec3 rd, vec3 sd, out float cov){
  cov=0.;
  if(rd.y<0.01) return vec3(0);
  float t=(9000.-ro.y)/rd.y;
  vec2 xz=ro.xz+rd.xz*t;
  vec2 uvc=xz*0.000035+vec2(uTime*0.0004,0.);
  float n=N3(vec3(uvc,0.21)).b*0.65+N3(vec3(uvc*3.1,0.53)).b*0.35;
  float str=N3(vec3(uvc.x*6.,uvc.y*1.2,0.8)).a;
  cov=smoothstep(0.62,0.9,n*0.75+str*0.3)*smoothstep(0.01,0.12,rd.y)*0.45;
  vec2 sdh=normalize(sd.xz);
  float mu=dot(normalize(rd.xz),sdh)*0.5+0.5;
  vec3 lit=mix(vec3(0.20,0.09,0.12),vec3(0.95,0.42,0.22),pow(mu,3.0));
  return lit*cov*0.12;
}

vec3 skyPad(vec3 ro, vec3 rd){
  vec3 sd=SUN();
  float y=rd.y;
  vec2 dh=normalize(rd.xz+1e-5);
  float mu=dot(dh,normalize(sd.xz))*0.5+0.5;
  float yy=max(y,0.);
  vec3 zen=vec3(0.006,0.014,0.044);
  vec3 hor=mix(vec3(0.028,0.046,0.092),vec3(0.056,0.070,0.100),mu);
  vec3 c=mix(hor,zen,pow(sat(yy*1.6),0.55));
  c+=vec3(0.42,0.17,0.05)*pow(mu,8.0)*exp(-yy*14.0);
  c+=vec3(0.06,0.05,0.042)*pow(mu,3.0)*exp(-yy*4.5);
  c+=vec3(0.010,0.010,0.018)*pow(1.-mu,3.)*exp(-abs(yy-0.08)*14.);
  float cov;
  vec3 ci=cirrus(ro,rd,sd,cov);
  c=c*(1.0-cov*0.5)+ci;
  c+=(stars(rd)+milkyWay(rd)*0.3)*smoothstep(0.02,0.3,y)*(1.0-cov)*(1.0-pow(mu,4.0)*0.8);
  return c;
}

// ---------------------------------------------------------------- lights
const vec3 FLOOD0=vec3(90.,4.,95.);
const vec3 FLOOD1=vec3(-105.,4.,62.);
const vec3 FLOOD2=vec3(55.,4.,-115.);
const vec3 FLOODC=vec3(1.0,0.95,0.88);

vec3 floodPos(int i){ return i==0?FLOOD0:(i==1?FLOOD1:FLOOD2); }
float floodI(int i){ return i==0?16000.:(i==1?11000.:9000.); }
float floodSpot(int i, vec3 p){
  vec3 L=floodPos(i);
  vec3 dir=normalize(vec3(0.,32.,0.)-L);
  return smoothstep(0.90,0.99,dot(normalize(p-L),dir));
}

vec3 fireCol(){ return mix(vec3(1.0,0.52,0.19),vec3(0.35,1.0,0.42),uGreen); }

// plume as a set of emitters on the plume surface facing the receiver
float plumeRm(float s){ return 1.75+0.075*s+0.0012*s*s; }
vec3 plumeLightPos(int i, vec3 p, out float I){
  float yN=rocketBaseY();
  float s=i==0?1.5:(i==1?7.0:20.0);
  float yl=yN-s;
  I=(i==0?900.:(i==1?2200.:3500.))*uThrust;
  if(yl<0.6){ I*=0.35*sat(1.0+yl/8.); yl=0.6; }         // plume swallowed by the pit
  vec2 d=p.xz; float l=length(d);
  vec2 off=l>1e-3?d/l*min(plumeRm(s),l):vec2(0);
  return vec3(off.x,yl,off.y);
}
const vec3 TRENCH=vec3(84.,-8.,0.);

// ---------------------------------------------------------------- volumes
float rocketHInv(float Y){        // time since liftoff when the nozzles reached Y
  if(Y<=0.) return 0.;
  float t=sqrt(Y/1.5);
  for(int i=0;i<3;i++){ float f=1.5*t*t+0.1*t*t*t-Y, df=3.*t+0.3*t*t; t-=f/max(df,1e-3); }
  return t;
}

// cloud body: coverage-remapped billows, edges eroded by finer cells
float billow(vec3 pn, float cov, bool full, float drift){
  float n=N3(pn).r;
  float d=sat((n-(1.-cov))/max(cov,0.05));
  if(full&&d>0.){
    float det=N3(pn*3.3+vec3(0.,drift,0.)).g*0.65+N3(pn*8.7+vec3(drift)).a*0.35;
    float e=det*0.42;
    d=sat((d-e)/(1.-e));
  }
  return d;
}

// returns density; sd = conservative distance to any cloud; heat = incandescence
float smokeDensity(vec3 p, out float sd, out float heat, bool full){
  sd=1e9; heat=0.;
  float tI=uTIgn, tL=uTLift;
  float yN=rocketBaseY();
  float dens=0.;

  // --- A: trench exhaust, rolling out of the tunnel mouth to the north
  if(tI>0.){
    float D=150.*(1.-exp(-tI/2.6))+3.0*tI;
    float s=clamp(p.x-TRENCH.x,-18.,D);
    float rA=6.5+0.30*max(s,0.)+2.2*sqrt(tI);
    float cy=TRENCH.y+rA*0.55+0.1*max(s,0.)+1.6*tI;
    vec3 c=vec3(TRENCH.x+s,cy,0.);
    float dd=length((p-c)*vec3(1.0,1.1,0.78))-rA;
    dd=smin(dd,length(p-vec3(TRENCH.x+D,cy+rA*0.25,0.))-rA*1.18,6.);   // bulging head
    dd+=(N3(p*0.011+vec3(0.,-tI*0.004,0.31)).b-0.5)*rA*1.1;             // big lobes
    float amp=smoothstep(0.,0.5,tI)*(1.0-0.35*smoothstep(8.,22.,tI));
    sd=min(sd,dd-rA*0.4);
    if(dd<rA*0.4){
      float cov=sat(0.5-dd/(rA*0.8));
      float yr=clamp((p.y-cy)/rA,-1.,1.);
      vec3 pn=(p-vec3(D*(0.5+0.28*yr),0.12*D,0.))/(14.0+0.06*D)+vec3(0.13,0.,0.);
      float d=billow(pn,cov,full,tI*0.03);
      dens+=d*amp*0.25;
      heat=max(heat,exp(-max(s+10.,0.)/14.)*uTrench*d);
    }
  }

  // --- B: pad cloud, steam from the deluge and the deflected plume around the mount
  if(tI>0.){
    float Rb=3.0+9.0*(1.-exp(-tI/1.2));
    if(tL>0.) Rb+=30.*(1.-exp(-tL/4.));
    float cy=Rb*0.28-1.0;
    float dd=(length(vec3(p.x,(p.y-cy)/0.62,p.z))-Rb)*0.62;
    float Rt=Rb*0.95, rt=Rb*0.32;
    float dT=length(vec2(length(p.xz)-Rt,p.y-rt*0.6))-rt;
    dd=smin(dd,dT,4.);
    dd+=(N3(p*0.016+vec3(0.53,-tI*0.006,0.1)).b-0.5)*Rb*0.9;
    sd=min(sd,dd-Rb*0.35);
    if(dd<Rb*0.35){
      float cov=sat(0.5-dd/(Rb*0.7));
      vec3 pn=(p-vec3(0.,Rb*0.25,0.))/(8.0+Rb*0.28)+vec3(0.47,-tI*0.012,0.29);
      float d=billow(pn,cov,full,-tI*0.03);
      dens+=d*smoothstep(0.,0.4,tI)*0.22;
      heat=max(heat,d*uThrust*exp(-length(p-vec3(0.,1.,0.))/(5.0+0.2*Rb))*(tL>0.?exp(-max(yN-5.,0.)/30.):0.6));
    }
  }

  // --- C: exhaust column left behind by the climbing vehicle
  if(tL>0. && p.y<yN){
    float age=tL-rocketHInv(max(p.y-NOZ_Y,0.));
    float rc=2.0+2.6*pow(max(age,0.),0.85)+0.035*max(yN-p.y,0.);
    float dd=length(p.xz)-rc;
    dd=max(dd,p.y-(yN-1.0));
    sd=min(sd,dd-rc*0.35);
    if(dd<rc*0.35){
      float cov=sat(0.5-dd/(rc*0.7));
      vec3 pn=vec3(p.x,p.y*0.55,p.z)/(5.0+rc*0.45)+vec3(0.71,age*0.015,0.11);
      float n=N3(pn).r;
      if(full) n=n*0.8+N3(pn*3.0).g*0.2;
      float d=sat((n-(1.-cov))/max(cov,0.05));
      dens+=d*0.2*exp(-age*0.04)*smoothstep(0.,0.6,age);
      heat=max(heat,d*exp(-max(yN-p.y-8.,0.)/10.)*0.5*uThrust);
    }
  }

  // --- D: LOX boil-off before ignition (falls along the cold skin, spills at the base)
  float ampD=1.0-smoothstep(0.2,2.0,max(tI,0.)+ (tI<0.?0.:0.));
  if(ampD>0.001){
    vec3 q=p-vec3(0.,yN,0.);
    float r=length(q.xz);
    float sh=r-(R1+1.3);
    float dv=max(sh,max(3.0-q.y,q.y-44.0));
    float db=length(vec3(p.x,p.y*2.2,p.z))-17.;
    sd=min(sd,min(dv,db));
    if(dv<0.){
      float cov=exp(-max(r-R1,0.)/0.4)*smoothstep(10.,22.,q.y)*(1.-smoothstep(42.,43.5,q.y));
      cov+=exp(-max(r-R1,0.)/0.35)*smoothstep(50.,51.,q.y)*(1.-smoothstep(54.,55.,q.y))*0.8;
      float fall=uTime*3.2;
      vec3 pn=vec3(q.x*0.22,(q.y+fall)*0.05,q.z*0.22);
      float n=N3(pn).b*0.7+N3(pn*2.7+0.3).a*0.3;
      float d=pow(sat(n*1.25-0.35),2.0)*cov;
      // streams trailing down from the tank
      float tr=exp(-max(r-R1,0.)/0.6)*smoothstep(3.,14.,q.y)*(1.-smoothstep(22.,30.,q.y));
      d+=pow(sat(N3(vec3(q.x*0.3,(q.y+fall*1.4)*0.04,q.z*0.3)+0.5).b*1.4-0.55),2.)*tr*0.6;
      dens+=d*0.35*ampD;
    }
    if(db<0.){
      vec3 pn=vec3(p.x*0.06+uTime*0.01,p.y*0.12-uTime*0.02,p.z*0.06);
      float n=N3(pn).r*0.65+N3(pn*3.1+0.4).a*0.35;
      float cov=sat(-db/9.)*smoothstep(7.,1.,p.y);
      dens+=pow(sat(n*1.5-(1.25-cov*0.7)),2.)*0.05*ampD;
    }
  }
  return dens;
}

// sea-level plume emission (per metre)
vec3 plumeEmit(vec3 p, out float soot, out float pd){
  soot=0.; pd=1e9;
  if(uThrust<=0.) return vec3(0);
  float yN=rocketBaseY();
  float s=yN-p.y;
  float r=length(p.xz);
  float Rm=plumeRm(max(s,0.));
  pd=max(r-Rm*1.6-0.5,-s-0.5);
  if(s>yN+0.5) pd=max(pd,s-yN-0.5);
  if(pd>0.) return vec3(0);
  if(s<-0.05) return vec3(0);
  vec4 n=N3(vec3(p.x*0.11,(p.y+uTime*70.)*0.018,p.z*0.11)+0.37);
  vec4 n2=N3(vec3(p.x*0.35,(p.y+uTime*90.)*0.05,p.z*0.35));
  float rr=r/Rm;
  rr*=0.75+0.5*n.b+0.15*(n2.a-0.5);
  float core=exp(-rr*rr*2.2);
  float axial=exp(-s/34.0)*smoothstep(0.0,1.6,s);
  float e=core*axial*(0.7+0.6*n.a);
  // nine individual jets with shock diamonds near the exit
  if(s<5.0){
    float a=atan(p.z,p.x);
    float ia=round((a-PI/8.)/(PI/4.)), ang=PI/8.+ia*PI/4.;
    vec2 c1=vec2(cos(ang),sin(ang))*1.26;
    float rj=0.40+0.09*s;
    float dj=min(length(p.xz-c1),r);
    float mach=pow(0.5+0.5*cos(6.2832*s/0.95),3.0)*exp(-s/2.4);
    float jet=exp(-pow(dj/rj,2.0)*2.6)*(0.55+0.9*mach)*exp(-s/3.2);
    e+=jet*1.3;
  }
  // flame spreading over the deck once the vehicle is up
  if(uTLift>0.&&yN<60.){
    float Rs=5.0+yN*0.55;
    float spl=exp(-max(p.y,0.)/(2.5+yN*0.05))*exp(-pow(r/Rs,2.))*exp(-yN/17.)*0.8;
    e+=spl*(0.6+0.8*n.a);
  }
  float t=sat(e*1.1);
  vec3 col=mix(vec3(0.55,0.10,0.02),vec3(1.0,0.36,0.07),smoothstep(0.0,0.3,t));
  col=mix(col,vec3(1.0,0.70,0.33),smoothstep(0.25,0.65,t));
  col=mix(col,vec3(1.0,0.93,0.80),smoothstep(0.6,1.0,t));
  vec3 g=vec3(0.30,1.0,0.40)*(0.4+t);
  col=mix(col,g,uGreen);
  soot=smoothstep(0.5,1.1,rr)*(1.0-smoothstep(1.1,1.7,rr))*axial*0.6;
  return col*e*e*260.0*uThrust*(1.0+uGreen*0.5);
}

float hg(float c, float g){ float g2=g*g; return (1.-g2)/(4.*PI*pow(1.+g2-2.*g*c,1.5)); }

float shadowTau(vec3 p, vec3 lp, float st){
  vec3 ld=lp-p; float maxd=length(ld); ld/=maxd;
  float tau=0., tt=st*(0.5+gRnd*0.5);
  for(int k=0;k<6;k++){
    if(tt>maxd) break;
    float sdd, hh;
    tau+=smokeDensity(p+ld*tt,sdd,hh,false)*st;
    tt+=st; st*=1.8;
  }
  return tau;
}

vec3 volumeLight(vec3 p, vec3 rd, float dens, float heat){
  vec3 L=vec3(0);
  vec3 fc=fireCol();
  // fire: plume emitters and the trench mouth; the strongest one gets a shadow march
  float bestI=0.; vec3 bestP=vec3(0); vec3 fire=vec3(0);
  if(uThrust>0.){
    for(int i=0;i<3;i++){
      float I; vec3 lp=plumeLightPos(i,p,I);
      vec3 d=lp-p; float d2=dot(d,d)+4.;
      float e=I/d2;
      fire+=fc*e*(hg(dot(rd,normalize(d)),0.3)*4.*PI*0.6+0.4);
      if(e>bestI){ bestI=e; bestP=lp; }
    }
    float It=6000.*uTrench*uThrust;
    vec3 tp=TRENCH+vec3(6.,3.,0.);
    vec3 d=tp-p; float d2=dot(d,d)+30.;
    fire+=fc*It/d2;
    if(It/d2>bestI){ bestI=It/d2; bestP=tp; }
  }
  float bestF=0.; vec3 floodP=FLOOD0; vec3 flood=vec3(0);
  if(uFlood>0.){
    for(int i=0;i<3;i++){
      vec3 d=floodPos(i)-p; float d2=dot(d,d);
      float e=floodI(i)*uFlood/d2*floodSpot(i,p);
      flood+=FLOODC*e*(hg(dot(rd,normalize(d)),0.5)*4.*PI*0.6+0.4);
      if(e>bestF){ bestF=e; floodP=floodPos(i); }
    }
  }
  if(bestI>0.){
    float tau=shadowTau(p,bestP,0.7);
    L+=fire*(exp(-tau*1.4)*0.75+exp(-tau*0.25)*0.25);
  }
  if(bestF>0.){
    float tau=shadowTau(p,floodP,1.0);
    L+=flood*(exp(-tau*1.4)*0.75+exp(-tau*0.25)*0.25);
  }
  // skylight from above, occluded by the cloud overhead
  float sdd, hh;
  float tauU=smokeDensity(p+vec3(0.,3.,0.),sdd,hh,false)*3.+smokeDensity(p+vec3(0.,9.,0.),sdd,hh,false)*6.+smokeDensity(p+vec3(0.,20.,0.),sdd,hh,false)*11.;
  L+=vec3(0.020,0.032,0.060)*1.6*exp(-tauU*0.6)+vec3(0.004,0.006,0.01);
  // fire light diffused through the lower cloud
  float glow=uThrust*(700.*uTrench+900.)/(900.+dot(p.xz,p.xz)*0.8+pow(max(p.y,0.),2.)*0.6);
  L+=fc*glow*0.07*exp(-tauU*0.15);
  return L;
}

// march smoke, vapour, plume emission and lit haze inside the pad volume
vec4 marchVolume(vec3 ro, vec3 rd, float tEnd){
  vec3 bmin=vec3(-170.,-20.,-170.), bmax=vec3(260.,160.,170.);
  vec3 inv=1.0/rd;
  vec3 t0v=(bmin-ro)*inv, t1v=(bmax-ro)*inv;
  vec3 tn=min(t0v,t1v), tf=max(t0v,t1v);
  float t0=max(max(tn.x,tn.y),max(tn.z,0.)), t1=min(min(tf.x,tf.y),min(tf.z,tEnd));
  vec3 L=vec3(0); float Tr=1.0;
  if(t1<=t0) return vec4(L,Tr);
  float t=t0;
  float dtj=gRnd;
  bool first=true;
  for(int i=0;i<220;i++){
    if(t>=t1||Tr<0.004) break;
    vec3 p=ro+rd*t;
    float sd, heat;
    float dens=smokeDensity(p,sd,heat,true);
    float soot, pd;
    vec3 em=plumeEmit(p,soot,pd);
    float base=clamp(t*0.008,0.2,5.0);
    float dt=base;
    if(sd>0.&&pd>0.) dt=max(base,min(min(sd,pd)*0.8,uFlood>0.?8.:1e4));
    if(pd<0.) dt=min(dt,0.35+t*0.002);
    if(first){ dt*=dtj; first=false; }
    dt=min(dt,t1-t);
    // haze inside the box: floodlight beams and fire glow
    float haze=0.0022*exp(-max(p.y+14.,0.)/45.)*sat(min(min(p.x-bmin.x,bmax.x-p.x),min(p.z-bmin.z,bmax.z-p.z))/60.);
    vec3 hazeL=vec3(0);
    if(uFlood>0.){
      for(int k=0;k<3;k++){
        vec3 d=floodPos(k)-p; float d2=dot(d,d);
        hazeL+=FLOODC*floodI(k)*uFlood/d2*floodSpot(k,p)*hg(dot(rd,normalize(d)),0.3);
      }
    }
    if(uThrust>0.){
      float I; vec3 lp=plumeLightPos(1,p,I);
      vec3 d=lp-p; hazeL+=fireCol()*I*2.5/(dot(d,d)+9.)*hg(dot(rd,normalize(d)),0.4);
    }
    float sig=dens+soot*0.8;
    vec3 S=vec3(0);
    if(dens>0.002){
      vec3 Lv=volumeLight(p,rd,dens,heat);
      vec3 alb=mix(vec3(0.92,0.92,0.94),vec3(0.55,0.52,0.5),sat(soot*2.));
      S=Lv*alb*dens;
      S+=fireCol()*heat*dens*vec3(1.0,0.75,0.55)*6.*uThrust;
    }
    S+=hazeL*haze;
    float sigT=sig+haze*0.2;
    float Ts=exp(-sigT*dt);
    L+=Tr*(S*(1.-Ts)/max(sigT,1e-4)+em*dt*mix(1.,Ts,0.5));
    if(dens>0.002&&heat>0.) gSmokeGlow+=Tr*dens*dt*heat;
    Tr*=Ts;
    t+=dt;
  }
  return vec4(L,Tr);
}

// ---------------------------------------------------------------- surface shading
vec3 brdf(vec3 n, vec3 v, vec3 l, vec3 alb, float rough, float metal){
  vec3 h=normalize(v+l);
  float nl=max(dot(n,l),0.), nv=max(dot(n,v),1e-3), nh=max(dot(n,h),0.), vh=max(dot(v,h),0.);
  float a=max(rough*rough,0.002), a2=a*a;
  float dd=nh*nh*(a2-1.)+1.; float D=a2/(PI*dd*dd);
  float k=(rough+1.)*(rough+1.)/8.;
  float G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
  vec3 F0=mix(vec3(0.04),alb,metal);
  vec3 F=F0+(1.-F0)*pow(1.-vh,5.);
  vec3 spec=D*G*F/(4.*nv*max(nl,1e-3));
  vec3 kd=(1.-F)*(1.-metal);
  return (kd*alb/PI+spec)*nl;
}

struct Mat { vec3 alb; float rough; float metal; vec3 emit; vec3 n; };

Mat material(float id, vec3 p, vec3 n, vec3 rd){
  Mat m; m.alb=vec3(0.5); m.rough=0.5; m.metal=0.; m.emit=vec3(0); m.n=n;
  float yN=rocketBaseY();
  vec3 q=p-vec3(0.,uShot>0.5?0.:yN,0.);
  if(id<1.5){
    float a=atan(q.z,q.x);
    vec2 uv=vec2(0.5-a/(2.*PI),q.y/72.);
    vec2 dx=dFdx(uv), dy=dFdy(uv);
    dx.x-=round(dx.x); dy.x-=round(dy.x);
    vec4 lv=textureGrad(uLivery,uv,dx,dy);
    m.alb=lv.rgb*0.95; m.rough=lv.a;
    // frost over the LOX tanks while fuelled
    float frostAmt=uShot>0.5?0.:(1.0-smoothstep(0.,6.,uTLift));
    float fz=smoothstep(23.,26.,q.y)*(1.-smoothstep(42.6,43.4,q.y))+smoothstep(50.3,50.8,q.y)*(1.-smoothstep(54.2,54.6,q.y));
    if(fz*frostAmt>0.){
      float fn=N3(vec3(a*0.35,q.y*0.035,0.2)).b;
      float fs=N3(vec3(a*2.2,q.y*0.012,0.6)).a;
      float fr=sat((fn*0.7+fs*0.5-0.45)*3.)*fz*frostAmt;
      m.alb=mix(m.alb,vec3(0.80,0.84,0.88),fr*0.6);
      m.rough=mix(m.rough,0.85,fr);
    }
    // weld seams as a fine groove
    float sy=q.y;
    float seam=0.;
    for(int i=0;i<3;i++){ float hs=i==0?43.5:(i==1?50.0:58.55); seam=max(seam,exp(-pow((sy-hs)/0.02,2.))); }
    m.alb*=1.0-seam*0.5;
  } else if(id<3.5){           // legs, actuator fairings: carbon composite
    m.alb=vec3(0.028,0.028,0.03); m.rough=0.34;
    float sn=N3(vec3(p.x*0.4,p.y*0.08,p.z*0.4)).b;
    m.rough+=sn*0.12;
    // soot creeping up the legs
    m.alb=mix(m.alb,vec3(0.018,0.016,0.015),sat(1.-(q.y-1.)/5.));
  } else if(id<4.5){           // titanium grid fins
    m.alb=vec3(0.36,0.34,0.32); m.metal=1.0; m.rough=0.5;
    float hn=N3(p*0.9).b;
    m.alb*=0.7+0.4*hn;
  } else if(id<5.5){           // Merlin nozzles
    vec3 nc;
    float a=atan(q.z,q.x);
    float ia=round((a-PI/8.)/(PI/4.)), ang=PI/8.+ia*PI/4.;
    vec3 c1=vec3(cos(ang)*1.26,0.,sin(ang)*1.26);
    nc=length(q.xz-c1.xz)<length(q.xz)?c1:vec3(0);
    vec3 lq=q-nc;
    float rr=length(lq.xz);
    float s=sat(lq.y/1.3), R=0.16+0.30*(1.0-pow(s,1.8));
    bool inside=rr<R;
    // regenerative tube striations
    float aa=atan(lq.z,lq.x);
    float tube=0.5+0.5*cos(aa*150.);
    vec3 tang=normalize(vec3(-lq.z,0.,lq.x));
    m.n=normalize(n+tang*(tube-0.5)*0.12);
    m.metal=1.0;
    m.alb=mix(vec3(0.30,0.27,0.25),vec3(0.24,0.19,0.16),s);
    m.rough=0.38+0.15*tube;
    if(inside){ m.alb*=0.5; m.rough=0.6;
      float e=uThrust*(0.4+0.6*(1.-s));
      m.emit=mix(vec3(1.0,0.72,0.42),vec3(0.4,1.0,0.5),uGreen)*e*60.;
    }
    // heat glow on the lip
    m.emit+=vec3(1.0,0.3,0.05)*uThrust*exp(-lq.y/0.12)*1.5;
  } else if(id<6.5){
    m.alb=vec3(0.055,0.052,0.05); m.rough=0.9;
    float qn=N3(vec3(q.x*0.8,0.3,q.z*0.8)).a;
    m.alb*=0.7+0.6*qn;
  } else if(id<7.5){           // steel structures
    m.alb=vec3(0.13,0.13,0.125); m.rough=0.6;
    float rn=N3(p*0.07).b;
    m.alb*=0.75+0.5*rn;
    // plate seams, rain streaks and blast soot on the mount and TE base
    vec3 g=abs(fract(p/vec3(1.5,1.1,1.5))-0.5);
    float seam=smoothstep(0.465,0.49,max(max(g.x*step(0.5,1.-abs(n.x)),g.z*step(0.5,1.-abs(n.z))),g.y*step(0.5,1.-abs(n.y))));
    float streak=N3(vec3(p.x*0.9,p.y*0.04,p.z*0.9)).a;
    float soot=exp(-length(p.xz)/12.)*smoothstep(16.,0.,p.y);
    m.alb*=(1.-0.55*seam)*(0.7+0.45*streak)*(1.-0.7*soot);
    m.rough=mix(0.6,0.85,soot);
  } else if(id<8.5){           // concrete deck
    float cn=N3(vec3(p.xz*0.02,0.5)).b*0.6+N3(vec3(p.xz*0.15,0.1)).a*0.4;
    m.alb=vec3(0.26,0.255,0.24)*(0.6+0.7*cn);
    float burn=exp(-length(p.xz)/22.);
    m.alb*=1.0-burn*0.65;
    m.alb*=mix(1.,0.18,smoothstep(0.,-2.,p.y));   // soot-black flame pit and trench walls
    m.rough=0.9;
  } else if(id<9.5){           // scrub
    float gn=N3(vec3(p.xz*0.01,0.9)).b;
    m.alb=mix(vec3(0.035,0.045,0.025),vec3(0.07,0.065,0.04),gn);
    m.rough=0.95;
  } else if(id<10.5){
    m.alb=vec3(0.55,0.55,0.53); m.rough=0.5;
  } else {                     // ocean
    m.alb=vec3(0.01,0.02,0.025); m.rough=0.06;
    vec2 w=vec2(N3(vec3(p.xz*0.02+uTime*0.01,0.3)).b,N3(vec3(p.xz*0.02-uTime*0.01,0.6)).b)-0.5;
    m.n=normalize(vec3(w.x*0.25,1.,w.y*0.25));
  }
  return m;
}

vec3 shade(vec3 p, vec3 rd, float id, float t){
  float e=max(0.0006*t,0.002);
  vec3 n=calcNormal(p,e);
  Mat m=material(id,p,n,rd);
  n=m.n;
  vec3 v=-rd;
  vec3 po=p+n*max(0.01,t*0.0008);
  float ao=calcAO(p,n);
  vec3 c=m.emit;

  // sky ambient + reflection
  vec3 amb=mix(vec3(0.008,0.009,0.011),vec3(0.020,0.032,0.062),n.y*0.5+0.5);
  c+=m.alb*(1.-m.metal)*amb*ao;
  vec3 r=reflect(rd,n);
  float nv=max(dot(n,v),0.);
  vec3 F0=mix(vec3(0.04),m.alb,m.metal);
  vec3 Fr=F0+(max(vec3(1.-m.rough),F0)-F0)*pow(1.-nv,5.);
  vec3 env=skyPad(p,normalize(vec3(r.x,max(r.y,0.02),r.z)));
  env=mix(env,vec3(0.02,0.03,0.055),sat(m.rough*1.3));
  // glossy surfaces also mirror the fire glow below them
  float glowAmt=uThrust*(1.+uTrench);
  env+=fireCol()*glowAmt*0.6*sat(-r.y*1.5+0.2)*(uShot>0.5?0.:1.);
  c+=env*Fr*ao;

  if(uShot<0.5){
    // floodlights (only shadowed while they dominate)
    if(uFlood>0.){
      for(int i=0;i<3;i++){
        vec3 L=floodPos(i)-p; float d2=dot(L,L); vec3 l=L*inversesqrt(d2);
        float sp=floodSpot(i,p);
        if(sp<=0.) continue;
        float dn=dot(n,l); if(dn<=0.) continue;
        float sh=uThrust<0.3?softShadow(po,l,sqrt(d2),24.):1.;
        c+=brdf(n,v,l,m.alb,m.rough,m.metal)*FLOODC*floodI(i)*uFlood/d2*sp*sh;
      }
    }
    if(uThrust>0.){
      vec3 fc=fireCol();
      for(int i=0;i<3;i++){
        float I; vec3 lp=plumeLightPos(i,p,I);
        vec3 L=lp-p; float d2=dot(L,L)+1.0; vec3 l=L*inversesqrt(d2);
        if(dot(n,l)<=0.) continue;
        float sh=i==1?softShadow(po,l,sqrt(d2)-0.5,6.):1.;
        c+=brdf(n,v,l,m.alb,m.rough,m.metal)*fc*I/d2*sh;
      }
      // trench mouth
      vec3 L=TRENCH+vec3(8.,4.,0.)-p; float d2=dot(L,L)+20.; vec3 l=L*inversesqrt(d2);
      c+=brdf(n,v,l,m.alb,m.rough,m.metal)*fc*5000.*uTrench*uThrust/d2;
      // light bouncing off the glowing cloud around the pad: broad, from below and the sides
      float glow=uThrust*(500.*uTrench+700.)/(700.+dot(p.xz,p.xz)*0.6+pow(max(p.y,0.),2.)*0.35);
      float wrap=sat(0.55-0.45*n.y);
      c+=m.alb*(1.-m.metal)*fc*glow*wrap*ao*0.8;
    }
  }
  return c;
}

// lamp heads on the floodlight towers, and red obstruction lights
vec3 lamps(vec3 ro, vec3 rd, float tHit){
  vec3 c=vec3(0);
  for(int i=0;i<3;i++){
    vec3 lp=floodPos(i)+vec3(0.,2.5,0.);
    vec3 d=lp-ro; float tl=dot(d,rd);
    if(tl<0.||tl>tHit) continue;
    float dist=length(d-rd*tl);
    vec3 fd=normalize(vec3(0.,32.,0.)-lp);
    float facing=pow(max(dot(-rd,fd),0.),4.);
    c+=FLOODC*uFlood*(smoothstep(1.4,0.0,dist)*200.*facing+exp(-dist/3.)*1.5*facing);
  }
  vec3 obs[2]; obs[0]=vec3(16.,110.3,-26.); obs[1]=vec3(-230.,-14.+72.5,-150.);
  float blink=step(0.5,fract(uTime*0.7));
  for(int i=0;i<2;i++){
    vec3 d=obs[i]-ro; float tl=dot(d,rd);
    if(tl<0.||tl>tHit+1.) continue;
    float dist=length(d-rd*tl)/max(tl*0.0012,0.25);
    c+=vec3(1.0,0.06,0.02)*blink*(smoothstep(1.0,0.0,dist)*30.+exp(-dist*0.6)*0.8);
  }
  return c;
}

vec3 heightFog(vec3 ro, vec3 rd, float t, vec3 col){
  float a=0.00045, b=1.0/45.0;
  float y0=ro.y+14.;
  float fogAmt;
  if(abs(rd.y)<1e-4) fogAmt=a*exp(-b*y0)*t;
  else fogAmt=a*exp(-b*y0)*(1.-exp(-b*rd.y*t))/(b*rd.y);
  fogAmt+=t*0.000012;
  float T=exp(-fogAmt);
  vec3 fc=mix(skyPad(ro,normalize(vec3(rd.x,0.05,rd.z))),vec3(0.028,0.036,0.062),0.6);
  fc+=fireCol()*uThrust*(1.+uTrench)*0.04;
  return col*T+fc*(1.-T);
}

// ================================================================ HIGH ALTITUDE (shot 1)
// Rocket-local frame in metres, nose along +y. Planet handled separately in km
// (float32 cannot resolve a 6371 km sphere in metres).
const float RK=6371.0;
const vec3 SUNC=vec3(1.0,0.86,0.70)*7.0;
vec3 rotZ(vec3 v, float a){ float c=cos(a), s=sin(a); return vec3(c*v.x-s*v.y, s*v.x+c*v.y, v.z); }
vec3 toW(vec3 v){ return rotZ(v,-uPitch); }     // rocket frame -> local horizon frame

// transmittance of sunlight grazing past the planet at tangent height ht (km)
vec3 grazeT(float ht){
  if(ht<-1.5) return vec3(0);
  vec3 tau=vec3(0.30,0.85,2.6)*9.0*exp(-max(ht,0.)/6.5);
  return exp(-tau)*smoothstep(-1.5,1.5,ht);
}
// sunlight reaching a point at altitude h (km)
vec3 sunAt(float h, vec3 sd){
  float r=RK+h;
  float ht=sd.y<0.?r*sqrt(1.-sd.y*sd.y)-RK:h+50.;
  return grazeT(ht);
}

// thin shell of air around the limb seen from above, plus twilight arc toward the sun
vec3 limbAir(vec3 rd, float ht, vec3 sd, float H){
  float dip=acos(RK/(RK+H));
  float e=asin(clamp(sd.y,-1.,1.))+dip;                 // sun elevation above the visible limb
  vec2 a=normalize(rd.xz+1e-6), s=normalize(sd.xz+1e-6);
  float mu=dot(a,s)*0.5+0.5;
  float up=smoothstep(-0.16,0.03,e);                     // twilight strengthens as the sun nears the limb
  float hh=max(ht,0.);
  vec3 blue=vec3(0.05,0.14,0.42)*exp(-hh/11.)*(0.25+0.9*pow(mu,2.))*(0.15+0.85*up);
  vec3 band=vec3(1.0,0.36,0.09)*exp(-hh/3.2)*pow(mu,6.)*up*2.4;
  vec3 yel=vec3(1.0,0.72,0.35)*exp(-hh/1.6)*pow(mu,16.)*up*3.;
  vec3 c=blue+band+yel;
  // the far side of the planet stays in night: only a faint airglow line
  c+=vec3(0.10,0.22,0.08)*exp(-pow((ht-95.)/5.,2.))*0.02;
  return c*smoothstep(-2.,0.,ht);
}

vec3 earthSurface(vec3 n, vec3 rd, vec3 sd, float H, float grazing){
  float land=N3(n*38.+0.21).b*0.7+N3(n*140.+0.5).b*0.3;
  float isLand=smoothstep(0.53,0.57,land);
  vec3 alb=mix(vec3(0.012,0.025,0.05),vec3(0.06,0.06,0.04),isLand);
  float cl=N3(n*55.+vec3(0.3,0.1,0.)).r*0.65+N3(n*210.).g*0.35;
  float cloud=smoothstep(0.48,0.72,cl);
  alb=mix(alb,vec3(0.8),cloud);
  float ndl=dot(n,sd);
  // sunlight at the ground grazes through the whole atmosphere
  vec3 Ts=grazeT(ndl<0.?RK*sqrt(1.-ndl*ndl)-RK:60.*ndl);
  vec3 c=alb*max(ndl+0.02,0.)*Ts*SUNC*0.9;
  // city lights on the night side along the coasts
  float coast=1.-smoothstep(0.0,0.05,abs(land-0.55));
  float city=pow(N3(n*900.).a,5.)*(coast*2.5+isLand*0.3)*(1.-cloud*0.85);
  c+=vec3(1.0,0.6,0.28)*city*smoothstep(0.02,-0.1,ndl)*0.08;
  // aerial haze: stronger toward the limb
  c=mix(c,limbAir(rd,0.,sd,H)*0.9,grazing);
  return c;
}

vec3 spaceBg(vec3 rd, vec3 sd, float H){
  vec3 O=vec3(0.,RK+H,0.);
  float b=dot(O,rd);
  float c2=H*(2.*RK+H);
  float disc=b*b-c2;
  vec3 col;
  if(b<0.&&disc>0.){
    float t=-b-sqrt(disc);
    vec3 n=normalize(O+rd*t);
    float grazing=exp(-max(dot(-rd,n),0.)/0.025)*0.7;
    col=earthSurface(n,rd,sd,H,grazing);
  } else {
    float ht=b<0.?sqrt(max(dot(O,O)-b*b,0.))-RK:H;
    col=stars(rd)*1.3+milkyWay(rd)*2.0;
    // stars fade behind the bright twilight air
    vec3 air=limbAir(rd,ht,sd,H);
    col=col*exp(-dot(air,vec3(3.)))+air;
    // sun disc and glare, occluded by the limb
    float sdot=dot(rd,sd);
    vec3 sT=grazeT(sd.y<0.?(RK+H)*sqrt(1.-sd.y*sd.y)-RK:H+50.);
    col+=vec3(1.0,0.92,0.8)*smoothstep(0.99997,0.999992,sdot)*4000.*sT;
  }
  return col;
}

// expanding exhaust in near-vacuum: a huge, faint, sunlit bell ("jellyfish")
float plumeR(float s){ float X=uPlumeX; return 2.0+s*(0.12+0.45*X)+pow(max(s,0.),0.82)*1.2*X; }
float plumeHi(vec3 q, out float emis){
  emis=0.;
  float s=-q.y;
  if(s<-0.3) return 0.;
  float r=length(q.xz);
  float R=plumeR(s);
  float shell=exp(-pow((r-R*0.75)/(R*0.34+0.8),2.));
  float inner=exp(-pow(r/(R*0.55+0.5),2.));
  vec3 pn=vec3(q.x,q.y*0.35+uTime*30.,q.z)/(10.0+s*0.25);
  float n=N3(pn*0.3).r, n2=N3(pn*1.3+0.3).g;
  float d=(shell+inner*0.35)*(0.4+0.9*n)*(0.75+0.5*n2);
  d*=smoothstep(-0.3,5.,s)*exp(-s/900.);
  d*=0.0025/(1.+s*0.03);
  emis=exp(-pow(r/(0.9+s*0.035),2.))*exp(-s/(8.+14.*uPlumeX))+exp(-pow(r/1.1,2.))*exp(-s/1.5)*2.;
  return d;
}

vec3 shadeRocketHi(vec3 p, vec3 rd, float id, float t, vec3 sd, vec3 sdW, vec3 sunL){
  vec3 n=calcNormal(p,max(0.0006*t,0.002));
  Mat m=material(id,p,n,rd);
  n=m.n;
  vec3 v=-rd;
  vec3 c=m.emit*0.03;
  float sh=dot(sunL,vec3(1))>0.?softShadow(p+n*0.02,sd,80.,16.):0.;
  c+=brdf(n,v,sd,m.alb,m.rough,m.metal)*sunL*SUNC*sh;
  // light from the planet below and the twilight limb
  float ao=calcAO(p,n);
  vec3 nW=toW(n);
  vec3 amb=mix(vec3(0.012,0.018,0.035),vec3(0.002,0.003,0.006),nW.y*0.5+0.5);
  amb+=vec3(0.10,0.05,0.02)*sat(dot(nW,normalize(vec3(sdW.x,0.,sdW.z))))*smoothstep(-0.2,0.05,sdW.y+0.14)*1.2;
  c+=m.alb*(1.-m.metal)*amb*ao;
  vec3 r=reflect(rd,n);
  float nv=max(dot(n,v),0.);
  vec3 F0=mix(vec3(0.04),m.alb,m.metal);
  vec3 Fr=F0+(max(vec3(1.-m.rough),F0)-F0)*pow(1.-nv,5.);
  c+=spaceBg(toW(r),sdW,uAlt)*Fr*ao*(1.-m.rough*0.7);
  // exhaust glow licking the engine section
  c+=m.alb*(1.-m.metal)*vec3(1.0,0.55,0.25)*exp(-max(p.y,0.)/3.)*uThrust*2.*sat(0.3-n.y);
  return c;
}

vec3 renderHi(vec3 ro, vec3 rd){
  vec3 sdW=normalize(uSunDir);
  vec3 sd=rotZ(sdW,uPitch);
  vec3 sunL=sunAt(uAlt,sdW);
  vec3 col=spaceBg(toW(rd),sdW,uAlt);

  float tHit=-1., mid=0.;
  {
    float t=0.1;
    for(int i=0;i<220;i++){
      vec2 h=map(ro+rd*t);
      if(h.x<0.0004*t){ tHit=t; mid=h.y; break; }
      t+=h.x; if(t>3000.) break;
    }
  }
  if(tHit>0.) col=shadeRocketHi(ro+rd*tHit,rd,mid,tHit,sd,sdW,sunL);

  // plume volume
  float tEnd=tHit>0.?tHit:6000.;
  float Tr=1.; vec3 L=vec3(0);
  float mu=dot(rd,sd);
  vec3 Ls=sunL*SUNC*(hg(mu,0.45)*0.5+hg(mu,-0.2)*0.4+0.05);
  vec3 Lamb=vec3(0.02,0.03,0.06)+vec3(0.3,0.12,0.04)*smoothstep(-0.2,0.05,sd.y+0.14)*0.1;
  float t=0.3+gRnd*1.0;
  for(int i=0;i<180;i++){
    if(t>tEnd||Tr<0.01) break;
    vec3 p=ro+rd*t;
    float s=-p.y, r=length(p.xz), R=plumeR(max(s,0.));
    float dt=clamp(t*0.012,0.25,25.);
    float out_=max(r-R*1.5-2.,-s-1.);
    if(out_>0.) dt=max(dt,out_*0.7);
    else {
      float em; float d=plumeHi(p,em);
      vec3 E=mix(vec3(1.0,0.45,0.15),vec3(1.0,0.88,0.7),sat(em*0.8))*em*9.*uThrust;
      float Ts=exp(-d*dt);
      L+=Tr*((Ls+Lamb)*(1.-Ts)+E*dt);
      Tr*=Ts;
      dt=min(dt,max(0.25,R*0.12));
    }
    t+=dt;
  }
  return col*Tr+L;
}


// ================================================================ main
void main(){
  vec2 fc=gl_FragCoord.xy+uJitter;
  gRnd=fract(ign(gl_FragCoord.xy+floor(uSeed*997.)*vec2(48.3,31.7))+uSeed);
  vec2 ndc=(fc/uRes)*2.-1.;
  float asp=uRes.x/uRes.y;
  vec3 rd=normalize(uCamFwd+ndc.x*asp*uTanHalf*uCamRight+ndc.y*uTanHalf*uCamUp);
  vec3 ro=uCamPos;
  gSmokeGlow=vec3(0);
  vec3 col;
  if(uShot>0.5){
    col=renderHi(ro,rd);
  } else {
    float t=0.05, tHit=-1., mid=0.;
    for(int i=0;i<300;i++){
      vec3 p=ro+rd*t;
      vec2 h=map(p);
      if(h.x<max(0.0004*t,0.001)){ tHit=t; mid=h.y; break; }
      t+=h.x;
      if(t>6000.||(p.y>115.&&rd.y>0.)) break;
    }
    if(tHit>0.){
      vec3 p=ro+rd*tHit;
      col=shade(p,rd,mid,tHit);
    } else col=skyPad(ro,rd);
    float tEnd=tHit>0.?tHit:1e5;
    col=heightFog(ro,rd,min(tEnd,8000.),col);
    col+=lamps(ro,rd,tEnd);
    vec4 v=marchVolume(ro,rd,tEnd);
    col=col*v.a+v.rgb;
  }
  fragColor=vec4(max(col,0.)*uWeight,1.);
}
