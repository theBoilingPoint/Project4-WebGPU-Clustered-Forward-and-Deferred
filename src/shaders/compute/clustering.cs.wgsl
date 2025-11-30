// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn distanceSquared(a: vec3<f32>, b: vec3<f32>) -> f32 {
    let diff: vec3<f32> = a - b;
    return dot(diff, diff);
}

fn sphere_intersects_aabb(sphere_center: vec3<f32>, sphere_radius: f32, box_min: vec3<f32>, box_max: vec3<f32>) -> bool {
    let closest_point: vec3<f32> = clamp(sphere_center, box_min, box_max);
    let distance_squared: f32 = distanceSquared(sphere_center, closest_point);
    return distance_squared < sphere_radius * sphere_radius;
}

// Pre-compute constants
const dimYTimesDimZ: u32 = CLUSTER_DIMENSIONS.y * CLUSTER_DIMENSIONS.z;
const dimYTimesDimZInv: f32 = 1.0 / f32(dimYTimesDimZ);
const dimZInv: f32 = 1.0 / f32(CLUSTER_DIMENSIONS.z);

@compute
@workgroup_size(${lightCluserWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx: u32 = globalIdx.x;
    if (clusterIdx >= ${numOfClusters}) {
        return;
    }

    /**
     * Optimized 3D index (i, j, k) calculation
     * Uses multiplication by inverse for division and subtraction for modulo,
     * which avoids slow integer division/modulo instructions.
     */
    let clusterIdx_f32 = f32(clusterIdx);

    // i = clusterIdx / dimYTimesDimZ
    let i = u32(floor(clusterIdx_f32 * dimYTimesDimZInv));

    // remainder = clusterIdx % dimYTimesDimZ
    let remainder = clusterIdx - i * dimYTimesDimZ;

    let remainder_f32 = f32(remainder);

    // j = remainder / CLUSTER_DIMENSIONS.z
    let j = u32(floor(remainder_f32 * dimZInv));

    // k = remainder % CLUSTER_DIMENSIONS.z
    let k = remainder - j * CLUSTER_DIMENSIONS.z;
    /******************************************************************************/

    let n = cameraUniforms.nearAndFar.x;
    let f = cameraUniforms.nearAndFar.y;

    // --- Optimization: Direct View-Z Calculation ---
    // Calculate View Z directly from the log formula.
    let logDepthRatio = log(f / n);
    let zNear = -n * exp(logDepthRatio * (f32(k) / f32(CLUSTER_DIMENSIONS.z)));
    let zFar  = -n * exp(logDepthRatio * (f32(k + 1) / f32(CLUSTER_DIMENSIONS.z)));

    // --- Optimization: Ray-Based AABB Generation (4 Transforms) ---
    // Calculate the 4 corners of the tile in NDC space
    let ndc_min_x = (f32(i) / f32(CLUSTER_DIMENSIONS.x)) * 2.0 - 1.0;
    let ndc_max_x = (f32(i + 1) / f32(CLUSTER_DIMENSIONS.x)) * 2.0 - 1.0;
    let ndc_min_y = (f32(j) / f32(CLUSTER_DIMENSIONS.y)) * 2.0 - 1.0;
    let ndc_max_y = (f32(j + 1) / f32(CLUSTER_DIMENSIONS.y)) * 2.0 - 1.0;

    // Unproject only 4 corners (rays) to View Space
    let ndc_corners = array<vec4<f32>, 4>(
        vec4<f32>(ndc_min_x, ndc_min_y, 1.0, 1.0),
        vec4<f32>(ndc_max_x, ndc_min_y, 1.0, 1.0),
        vec4<f32>(ndc_min_x, ndc_max_y, 1.0, 1.0),
        vec4<f32>(ndc_max_x, ndc_max_y, 1.0, 1.0)
    );

    // Get the coordinates for the first corner (index 0)
    let view_vec4_0 = cameraUniforms.invProj * ndc_corners[0];
    let view_ray_0 = view_vec4_0.xyz / view_vec4_0.w;
    let nearPoint_0 = view_ray_0 * (zNear / view_ray_0.z);
    let farPoint_0  = view_ray_0 * (zFar  / view_ray_0.z);

    // INITIALIZATION: Use the first corner's min/max coordinates
    var minCoors = min(nearPoint_0, farPoint_0);
    var maxCoors = max(nearPoint_0, farPoint_0);

    // Iterate over the REMAINING 3 corners (c=1, 2, 3)
    for(var c=1; c<4; c++) {
        // Unproject the ray
        let view_vec4 = cameraUniforms.invProj * ndc_corners[c];
        let view_ray = view_vec4.xyz / view_vec4.w;

        // Scale the ray to intersect the Near and Far Z-planes
        let nearPoint = view_ray * (zNear / view_ray.z);
        let farPoint  = view_ray * (zFar  / view_ray.z);

        // Find the min/max coordinates of this corner, then update the global min/max
        minCoors = min(minCoors, min(nearPoint, farPoint));
        maxCoors = max(maxCoors, max(nearPoint, farPoint));
    }

    let curBbox = AABB(minCoors, maxCoors);
    var curNumLights: u32 = 0u;
    var curLightIdxArr = array<u32, ${maxLightsPerCluster}u>();

    // --- Optimization: Manually Unroll Matrix Transform for Lights ---
    // Cache view matrix columns for manual dot products
    let viewM = cameraUniforms.view;
    let vRow0 = vec3<f32>(viewM[0].x, viewM[1].x, viewM[2].x);
    let vRow1 = vec3<f32>(viewM[0].y, viewM[1].y, viewM[2].y);
    let vRow2 = vec3<f32>(viewM[0].z, viewM[1].z, viewM[2].z);
    // Translation part of view matrix
    let vPos  = vec3<f32>(viewM[3].x, viewM[3].y, viewM[3].z);

    let lightRadiusSq = ${lightRadius} * ${lightRadius};

    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (curNumLights >= ${maxLightsPerCluster}) {
            break;
        }

        let lightPos = lightSet.lights[lightIdx].pos;

        // Manual mat4 * vec4 transform (saves muls/adds compared to standard library call)
        let viewSpaceLightPos = vec3<f32>(
            dot(vRow0, lightPos) + vPos.x,
            dot(vRow1, lightPos) + vPos.y,
            dot(vRow2, lightPos) + vPos.z
        );

        if (sphere_intersects_aabb(viewSpaceLightPos, ${lightRadius}, curBbox.min, curBbox.max)) {
            curLightIdxArr[curNumLights] = lightIdx;
            curNumLights += 1u;
        }
    }

    // Write result directly using pointer
    let clusterPtr = &clusterSet.clusters[clusterIdx];
    (*clusterPtr).viewSpaceBbox = curBbox;
    (*clusterPtr).numLights = curNumLights;
    for (var i = 0u; i < curNumLights; i++) {
        (*clusterPtr).lightIndices[i] = curLightIdxArr[i];
    }
}