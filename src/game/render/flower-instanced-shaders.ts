import { GPU_EXPLOSION_INSTANCES, GPU_EXPLOSION_PARTICLES, MAX_GPU_EXPLOSIONS } from "./flower-instanced-types.ts"

export const FLOWER_VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPosition;
layout(location = 2) in float iSize;
layout(location = 3) in vec3 iPetal;
layout(location = 4) in vec3 iCenter;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;

out vec2 vUv;
out vec3 vPetal;
out vec3 vCenter;

void main() {
  vec2 world = iPosition + aCorner * iSize;
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aCorner * 0.5 + 0.5;
  vPetal = iPetal;
  vCenter = iCenter;
}
`

export const FLOWER_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vPetal;
in vec3 vCenter;

uniform sampler2D uPetalMask;
uniform sampler2D uCenterMask;

out vec4 outColor;

void main() {
  float petalA = texture(uPetalMask, vUv).a;
  float centerA = texture(uCenterMask, vUv).a;
  float alpha = max(petalA, centerA);
  if (alpha <= 0.01) {
    discard;
  }

  vec3 color = mix(vPetal, vCenter, centerA);
  outColor = vec4(color, alpha);
}
`

export const QUAD_VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPosition;
layout(location = 2) in float iSize;
layout(location = 3) in float iRotation;
layout(location = 4) in vec3 iColor;
layout(location = 5) in float iAlpha;
layout(location = 6) in float iStyle;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;

out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out float vStyle;

void main() {
  float c = cos(iRotation);
  float s = sin(iRotation);
  vec2 rotated = vec2(
    aCorner.x * c - aCorner.y * s,
    aCorner.x * s + aCorner.y * c
  );
  vec2 world = iPosition + rotated * iSize;
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aCorner * 0.5 + 0.5;
  vColor = iColor;
  vAlpha = iAlpha;
  vStyle = iStyle;
}
`

export const QUAD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in float vStyle;

out vec4 outColor;

void main() {
  if (vStyle > 0.5) {
    vec2 centered = vUv * 2.0 - 1.0;
    float profile = abs(centered.x) * 1.18 + centered.y * centered.y * 0.92;
    float petalMask = 1.0 - smoothstep(0.78, 1.0, profile);
    float tipFade = 1.0 - smoothstep(0.72, 1.0, abs(centered.y));
    float alpha = vAlpha * petalMask * tipFade;
    if (alpha <= 0.01) {
      discard;
    }

    float vein = smoothstep(0.24, 0.0, abs(centered.x));
    vec3 color = mix(vColor * 0.76, min(vec3(1.0), vColor * 1.2), vein * 0.45 + 0.15);
    outColor = vec4(color, alpha);
    return;
  }

  vec3 color = vColor;
  float stripe = smoothstep(0.54, 0.62, vUv.y) * (1.0 - smoothstep(0.76, 0.84, vUv.y));
  color = mix(color, color * 0.52, stripe);
  outColor = vec4(color, vAlpha);
}
`

export const TRAIL_VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPosition;
layout(location = 2) in vec2 iDirection;
layout(location = 3) in float iLength;
layout(location = 4) in float iWidth;
layout(location = 5) in vec3 iColor;
layout(location = 6) in float iAlpha;
layout(location = 7) in float iStyle;
layout(location = 8) in float iGrowth;
layout(location = 9) in float iTurbulence;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;

out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out float vStyle;
out float vGrowth;
out float vTurbulence;

void main() {
  vec2 dir = normalize(iDirection);
  vec2 normal = vec2(-dir.y, dir.x);
  float t = aCorner.x * 0.5 + 0.5;
  vec2 world;
  if (iStyle > 0.5) {
    float puffSize = max(0.02, iWidth * 0.6 + iGrowth * 0.12);
    world = iPosition + aCorner * puffSize;
    vUv = aCorner * 0.5 + 0.5;
  } else {
    vec2 along = dir * ((t - 1.0) * iLength);
    vec2 across = normal * (aCorner.y * iWidth * 0.5);
    world = iPosition + along + across;
    vUv = vec2(t, aCorner.y * 0.5 + 0.5);
  }
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vColor = iColor;
  vAlpha = iAlpha;
  vStyle = iStyle;
  vGrowth = iGrowth;
  vTurbulence = iTurbulence;
}
`

export const TRAIL_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in float vStyle;
in float vGrowth;
in float vTurbulence;

out vec4 outColor;

void main() {
  if (vStyle > 0.5) {
    vec2 centered = vUv * 2.0 - 1.0;
    float dist = length(centered);
    if (dist > 1.0) {
      discard;
    }

    outColor = vec4(vColor, vAlpha);
    return;
  }

  float centered = abs(vUv.y * 2.0 - 1.0);
  float tailTaper = smoothstep(0.0, 0.55, vUv.x);
  float halfWidth = mix(0.18, 1.0, tailTaper);
  float sideFade = 1.0 - smoothstep(halfWidth * 0.72, halfWidth, centered);
  float headFade = smoothstep(1.0, 0.9, vUv.x);
  float tailFade = smoothstep(0.0, 0.28, vUv.x);
  float alpha = vAlpha * sideFade * headFade * tailFade;
  if (alpha <= 0.01) {
    discard;
  }
  outColor = vec4(vColor, alpha);
}
`

export const EXPLOSION_VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 aCorner;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;
uniform int uExplosionCount;
uniform vec4 uExplosions[${MAX_GPU_EXPLOSIONS}];

out vec2 vUv;
out float vAlpha;
out float vHeat;
out float vMode;

float hash(float value) {
  return fract(sin(value * 91.723 + 13.125) * 43758.5453123);
}

void main() {
  int explosionIndex = gl_InstanceID / ${GPU_EXPLOSION_INSTANCES};
  if (explosionIndex >= uExplosionCount) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vUv = vec2(0.0);
    vAlpha = 0.0;
    vHeat = 0.0;
    vMode = 0.0;
    return;
  }

  int localIndex = gl_InstanceID - explosionIndex * ${GPU_EXPLOSION_INSTANCES};
  vec4 explosion = uExplosions[explosionIndex];
  vec2 center = explosion.xy;
  float radius = explosion.z;
  float lifeRatio = clamp(explosion.w, 0.0, 1.0);
  float age = 1.0 - lifeRatio;

  if (localIndex == ${GPU_EXPLOSION_PARTICLES}) {
    float size = radius * (1.04 + age * 0.06);
    vec2 world = center + aCorner * size;
    vec2 screen = (world - uCamera) * uScale + uView * 0.5;
    vec2 clip = screen / uView * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vAlpha = min(1.0, age * 9.0 + 0.2) * lifeRatio * 0.85;
    vHeat = 0.92;
    vMode = 1.0;
    vUv = aCorner * 0.5 + 0.5;
    return;
  }

  int particleIndex = localIndex;

  float idSeed = float(explosionIndex) * 61.0 + float(particleIndex);
  float randAngle = hash(idSeed + 0.17);
  float randSpeed = hash(idSeed + 0.49);
  float randSize = hash(idSeed + 0.93);
  float randLift = hash(idSeed + 1.31);

  float angle = randAngle * 6.28318530718;
  vec2 dir = vec2(cos(angle), sin(angle));
  float burst = (0.28 + randSpeed * 1.24) * radius;
  float drag = mix(1.0, 0.46, age);
  float travel = burst * age * drag;
  vec2 tangent = vec2(-dir.y, dir.x);
  float lateralJitter = (randLift - 0.5) * radius * 0.18;

  vec2 particleCenter = center + dir * travel + tangent * lateralJitter;
  float innerBoost = step(float(particleIndex), 4.0);
  particleCenter = mix(particleCenter, center + dir * radius * age * 0.4, innerBoost * 0.55);

  float baseSize = radius * mix(0.04, 0.17, randSize);
  float shrink = mix(1.28, 0.38, age);
  float size = max(0.028, baseSize * shrink);

  vec2 world = particleCenter + aCorner * size;
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  float fadeOut = lifeRatio * lifeRatio;
  float fadeIn = min(1.0, age * 7.2 + 0.28);
  float density = mix(0.52, 1.0, randSize);
  vAlpha = fadeIn * fadeOut * density;
  vHeat = mix(0.0, 1.0, innerBoost * 0.68 + randLift * 0.52);
  vMode = 0.0;
  vUv = aCorner * 0.5 + 0.5;
}
`

export const EXPLOSION_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 vUv;
in float vAlpha;
in float vHeat;
in float vMode;

out vec4 outColor;

void main() {
  vec2 centered = vUv * 2.0 - 1.0;

  if (vMode > 0.5) {
    float ringRadius = length(centered);
    float outerFade = 1.0 - smoothstep(0.92, 0.99, ringRadius);
    float innerFade = smoothstep(0.72, 0.84, ringRadius);
    float band = outerFade * innerFade;
    float alpha = vAlpha * band;
    if (alpha <= 0.01) {
      discard;
    }

    vec3 outer = vec3(1.0, 0.64, 0.2);
    vec3 inner = vec3(1.0, 0.9, 0.68);
    float blend = 1.0 - smoothstep(0.72, 0.98, ringRadius);
    vec3 color = mix(outer, inner, blend);
    outColor = vec4(color, alpha);
    return;
  }

  float radius = dot(centered, centered);
  float glow = 1.0 - smoothstep(0.12, 1.0, radius);
  float ember = 1.0 - smoothstep(0.0, 0.82, radius);
  float alpha = vAlpha * glow;
  if (alpha <= 0.01) {
    discard;
  }

  vec3 hot = vec3(1.0, 0.94, 0.7);
  vec3 warm = vec3(1.0, 0.54, 0.18);
  vec3 smoke = vec3(0.34, 0.3, 0.28);
  vec3 fire = mix(warm, hot, vHeat);
  vec3 color = mix(smoke, fire, ember);
  outColor = vec4(color, alpha);
}
`
