// This shader is concadenated to any shader that needs to read from light clusters and compute color
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

fn computeColor(pos: vec3<f32>, nor: vec3<f32>, diffuseColor: vec4<f32>) -> vec3f {
    // OPTIMIZATION: Single Matrix Multiply
    // We calculate Clip Space once.
    // 'pos_ndc.w' in a standard perspective matrix IS the View Space Z (negated).
    // This allows us to skip calculating 'pos_view = view * pos' entirely.
    var pos_ndc = cameraUniforms.viewProj * vec4<f32>(pos, 1.0);

    // Perspective division to get NDC (0 to 1 range logic)
    // We strictly use this for X/Y to match the light-culling grid exactly.
    let scaledPos_ndc = (pos_ndc.xy / pos_ndc.w) * 0.5 + 0.5;

    let i = u32(floor(scaledPos_ndc.x * f32(CLUSTER_DIMENSIONS.x)));
    let j = u32(floor(scaledPos_ndc.y * f32(CLUSTER_DIMENSIONS.y)));

    // Re-use pos_ndc.w to get Linear View Z.
    // Note: In standard GL/WebGPU projection, Clip.w = -View.z.
    // We use abs() or negation to ensure it's positive for the log calculation.
    let viewZ = clamp(pos_ndc.w, cameraUniforms.nearAndFar.x, cameraUniforms.nearAndFar.y);

    let n = cameraUniforms.nearAndFar.x;
    let f = cameraUniforms.nearAndFar.y;
    let logDepthRatio = log(f / n);
    let clusterZf = (log(viewZ / n) / logDepthRatio) * f32(CLUSTER_DIMENSIONS.z);
    let k = clamp(u32(floor(clusterZf)), 0u, CLUSTER_DIMENSIONS.z - 1u);

    let clusterIdx = clamp(i * CLUSTER_DIMENSIONS.y * CLUSTER_DIMENSIONS.z + j * CLUSTER_DIMENSIONS.z + k, 0u, ${numOfClusters}u);
    let clusterPtr = &clusterSet.clusters[clusterIdx];
    let numLightsInCluster = (*clusterPtr).numLights;
    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < numLightsInCluster; lightIdx++) {
        let lightIndex = (*clusterPtr).lightIndices[lightIdx];
        let lightPtr = &lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(lightPtr, pos, nor);
    }

   return diffuseColor.rgb * totalLightContrib.rgb;
}