#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec2 t=uTexel;
  vec3 s = texture(uSrc,vUv).rgb*4.0
    + (texture(uSrc,vUv+t*vec2(-1,0)).rgb+texture(uSrc,vUv+t*vec2(1,0)).rgb+texture(uSrc,vUv+t*vec2(0,1)).rgb+texture(uSrc,vUv+t*vec2(0,-1)).rgb)*2.0
    + texture(uSrc,vUv+t*vec2(-1,-1)).rgb+texture(uSrc,vUv+t*vec2(1,-1)).rgb+texture(uSrc,vUv+t*vec2(-1,1)).rgb+texture(uSrc,vUv+t*vec2(1,1)).rgb;
  o=vec4(s/16.0*0.8,1);
}
