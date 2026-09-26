#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uFirst;
// 13-tap downsample (CoD: AW), with Karis average on the first level to tame fireflies
vec3 k(vec3 c){ return c/(1.0+max(max(c.r,c.g),c.b)*0.25); }
void main(){
  vec2 t=uTexel;
  vec3 a=texture(uSrc,vUv+t*vec2(-2,2)).rgb, b=texture(uSrc,vUv+t*vec2(0,2)).rgb, c=texture(uSrc,vUv+t*vec2(2,2)).rgb;
  vec3 d=texture(uSrc,vUv+t*vec2(-2,0)).rgb, e=texture(uSrc,vUv).rgb, f=texture(uSrc,vUv+t*vec2(2,0)).rgb;
  vec3 g=texture(uSrc,vUv+t*vec2(-2,-2)).rgb, h=texture(uSrc,vUv+t*vec2(0,-2)).rgb, i=texture(uSrc,vUv+t*vec2(2,-2)).rgb;
  vec3 j=texture(uSrc,vUv+t*vec2(-1,1)).rgb, l=texture(uSrc,vUv+t*vec2(1,1)).rgb;
  vec3 m=texture(uSrc,vUv+t*vec2(-1,-1)).rgb, n=texture(uSrc,vUv+t*vec2(1,-1)).rgb;
  vec3 r;
  if(uFirst>0.5){
    r = k((j+l+m+n)*0.25)*0.5 + k((a+b+d+e)*0.25)*0.125 + k((b+c+e+f)*0.25)*0.125 + k((d+e+g+h)*0.25)*0.125 + k((e+f+h+i)*0.25)*0.125;
    r = r/(1.0-min(max(max(r.r,r.g),r.b)*0.25,0.99));
  } else {
    r = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+l+m+n)*0.125;
  }
  o=vec4(r,1);
}
