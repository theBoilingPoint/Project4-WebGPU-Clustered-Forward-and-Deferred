@group(0) @binding(0) var fullscreenTex: texture_2d<f32>;
@group(0) @binding(1) var blurredBrightnessTex: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pixelPos: vec2<u32> = vec2<u32>(in.fragPos.xy);
    let baseColor = textureLoad(fullscreenTex, pixelPos, 0);
    let brightColor = textureLoad(blurredBrightnessTex, pixelPos, 0);

    return vec4(baseColor.rgb + brightColor.rgb, 1.0);
}