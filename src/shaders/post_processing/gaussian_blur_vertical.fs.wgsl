@group(0) @binding(0) var blurTex: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pixelPos: vec2<i32> = vec2<i32>(in.fragPos.xy);
    var result = textureLoad(blurTex, pixelPos, 0).rgb * gaussianBlurWeights[0];

    for(var i = 1; i < 5; i++) {
        result += textureLoad(blurTex, pixelPos + vec2<i32>(0, i), 0).rgb * gaussianBlurWeights[i];
        result += textureLoad(blurTex, pixelPos - vec2<i32>(0, i), 0).rgb * gaussianBlurWeights[i];
    }

    return vec4(result, 1.0);
}