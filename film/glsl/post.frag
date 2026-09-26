#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uHdr, uBloom;
uniform vec2 uRes; uniform float uSeed;
uniform float uExposure, uBloomAmt, uFade, uGrain, uVignette, uFlash;

vec3 aces(vec3 v){
  const mat3 i=mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  const mat3 oo=mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  v=i*v; vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return clamp(oo*(a/b),0.,1.);
}
float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
void main(){
  vec2 uv=vUv, d=uv-0.5;
  // slight lateral chromatic aberration toward the frame edges
  float ca = 0.0016*dot(d,d)*4.0;
  vec3 hdr = vec3(texture(uHdr,uv-d*ca).r, texture(uHdr,uv).g, texture(uHdr,uv+d*ca).b);
  vec3 bl = texture(uBloom,uv).rgb;
  vec3 c = hdr + bl*uBloomAmt;
  // halation: warm glow from the wide bloom, like light scattering in film base
  c += bl*vec3(0.06,0.015,0.0)*uBloomAmt*4.0;
  c *= uExposure;
  c += uFlash;
  float v = 1.0 - uVignette*pow(length(d*vec2(1.0,0.8))*1.35, 2.6);
  c *= max(v,0.0);
  c = aces(c);
  c = srgb(c);
  // luminance-weighted grain
  float g = (h12(gl_FragCoord.xy+uSeed*917.)+h12(gl_FragCoord.xy*1.37+uSeed*311.)-1.0);
  float lum = dot(c,vec3(0.3,0.6,0.1));
  c += g*uGrain*(0.35+0.65*sqrt(lum))*(1.0-lum*0.6);
  c *= uFade;
  // triangular dither before 8-bit quantisation
  c += (h12(gl_FragCoord.xy+uSeed*53.)+h12(gl_FragCoord.xy+uSeed*97.+7.)-1.0)/255.;
  o=vec4(clamp(c,0.,1.),1);
}
