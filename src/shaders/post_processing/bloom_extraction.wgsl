// clustered_deferred_fullscreen.wgsl is concadenated to this shader
struct FragmentOutput {
    @location(0) baseColor: vec4<f32>,
    @location(1) extractedColor: vec4<f32>,
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    let pixelPos = vec2<u32>(in.fragPos.xy);
    var finalColor = computeOutput(pixelPos);

    var output: FragmentOutput;
    output.baseColor = vec4<f32>(finalColor, 1.0);

    // Standard Luma coefficients for better brightness perception
    let brightness = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
    output.extractedColor = select(
        vec4<f32>(0.0, 0.0, 0.0, 1.0),
        output.baseColor,
        brightness > 0.01 // Threshold
    );

    return output;
}