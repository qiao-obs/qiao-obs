#version 300 es
precision highp float;
// Tileable 3D noise volume. R: billowy Perlin-Worley, G: Worley fbm (erosion),
// B: Perlin fbm, A: fine Perlin. Period of the texture = 1.
in vec2 vUv; out vec4 o;
uniform float uZ, uN;

vec3 hash33(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123);
}
vec3 grad(vec3 i, float per){ return normalize(hash33(mod(i,per))*2.0-1.0); }
float perlin(vec3 x, float per){
  vec3 i=floor(x), f=fract(x);
  vec3 u=f*f*f*(f*(f*6.-15.)+10.);
  float n000=dot(grad(i+vec3(0,0,0),per),f-vec3(0,0,0));
  float n100=dot(grad(i+vec3(1,0,0),per),f-vec3(1,0,0));
  float n010=dot(grad(i+vec3(0,1,0),per),f-vec3(0,1,0));
  float n110=dot(grad(i+vec3(1,1,0),per),f-vec3(1,1,0));
  float n001=dot(grad(i+vec3(0,0,1),per),f-vec3(0,0,1));
  float n101=dot(grad(i+vec3(1,0,1),per),f-vec3(1,0,1));
  float n011=dot(grad(i+vec3(0,1,1),per),f-vec3(0,1,1));
  float n111=dot(grad(i+vec3(1,1,1),per),f-vec3(1,1,1));
  return mix(mix(mix(n000,n100,u.x),mix(n010,n110,u.x),u.y),mix(mix(n001,n101,u.x),mix(n011,n111,u.x),u.y),u.z);
}
float worley(vec3 x, float per){
  vec3 i=floor(x), f=fract(x); float d=1e9;
  for(int a=-1;a<=1;a++)for(int b=-1;b<=1;b++)for(int c=-1;c<=1;c++){
    vec3 g=vec3(a,b,c); vec3 r=g+hash33(mod(i+g,per))-f; d=min(d,dot(r,r));
  }
  return sqrt(d);
}
float pfbm(vec3 p, float per, int oct){
  float s=0., a=0.5, n=0.;
  for(int k=0;k<8;k++){ if(k>=oct)break; s+=a*perlin(p*exp2(float(k)),per*exp2(float(k))); n+=a; a*=0.5; }
  return s/n;
}
float wfbm(vec3 p, float per){
  return 1.0-(worley(p,per)*0.625+worley(p*2.,per*2.)*0.25+worley(p*4.,per*4.)*0.125);
}
float remap(float v,float a,float b,float c,float d){ return c+(v-a)/(b-a)*(d-c); }
void main(){
  vec3 p = vec3(gl_FragCoord.xy/uN, uZ);
  float pf = pfbm(p*4.,4.,5)*0.5+0.5;
  float w = wfbm(p*4.,4.);
  float pw = clamp(remap(pf, w-1.0, 1.0, 0.0, 1.0),0.,1.);
  float we = wfbm(p*8.,8.);
  float pb = pfbm(p*8.,8.,5)*0.5+0.5;
  float pa = perlin(p*16.,16.)*0.5+0.5;
  o = vec4(pw, we, clamp(pb,0.,1.), clamp(pa,0.,1.));
}
