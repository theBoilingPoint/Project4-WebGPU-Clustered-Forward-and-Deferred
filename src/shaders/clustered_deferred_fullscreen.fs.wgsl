// clustered_deferred_fullscreen.wgsl is concadenated to this shader
@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pixelPos = vec2<u32>(in.fragPos.xy);
    var finalColor = computeOutput(pixelPos);

    return vec4<f32>(finalColor, 1.0);
}