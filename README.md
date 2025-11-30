WebGPU Clustered Forward and Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Xinran Tao
* Tested on: **Google Chrome 130.0.6723.59** on
  Windows 11 Enterprise, AMD Ryzen 7 7800X3D 8 Core Processor @ 4.201GHz, RTX 2080Ti (Personal PC)

# Live Demo

[![](imgs/cover.png)](https://theboilingpoint.github.io/Project4-WebGPU-Clustered-Forward-and-Deferred/)

# Demo Video/GIF

![Demo](imgs/cover.gif)

# Introduction
## A bit about Forward and Deferred Rendering
In a classic forward renderer, the scene is drawn by iterating over visible geometry and issuing a draw call for each object. For each fragment, the shader directly computes the final color by evaluating all relevant lights (either in a single pass with a small light list, or via multiple passes with additive blending). As the number of lights grows, the amount of work and the number of draw calls can increase quickly, and each draw call incurs CPU overhead for pipeline state transitions, resource bindings, and parameter updates.

Deferred rendering was introduced to decouple geometry processing from lighting. Instead of computing lighting while drawing geometry, a geometry pass first renders all visible objects into a set of screen-sized textures (the G-buffer), storing attributes such as albedo, normals, depth, and material parameters. A subsequent lighting pass runs in screen space: for each pixel, it reads these stored attributes and loops over lights to accumulate the final shaded color. This approach significantly reduces per-light draw-call overhead, because lighting is computed in a small number of full-screen or light-volume passes rather than re-drawing every object per light. However, it increases memory and bandwidth usage due to the G-buffer, and introduces challenges such as handling transparency (the G-buffer typically stores only the nearest surface) and supporting very diverse material models within a fixed set of stored attributes.

With modern low-level graphics APIs like Vulkan and Direct3D 12, and features such as command buffers and indirect draws, the relative cost of issuing draw calls has been reduced. As a result, the trade-off between forward and deferred rendering is no longer one-sided; the “best” approach depends heavily on the application’s requirements. Many modern engines use hybrid techniques.

This project focuses on a common scenario: many small, localized lights in a mostly dark scene. In such cases, each light only affects a small region of the view, so testing every pixel against every light is wasteful. Instead, we partition the camera frustum into a 3D grid of clusters and assign (or “bin”) each light to the clusters it influences. During shading, each pixel determines which cluster it belongs to and only evaluates the lights associated with that cluster. This clustered approach can be applied to both forward and deferred pipelines, and it greatly reduces the number of light evaluations per pixel when lights are spatially sparse.

# Project Overview
This project implements naive, Clustered Forward and Deferred Shading methods using WebGPU. The project uses the Sponza atrium model and a large number of point lights (500 - 5000). 

## Contents
- `src/` contains all the TypeScript and WGSL code for this project. This contains several subdirectories:
  - `renderers/` defines the different renderers in which the naive, Clustered Forward and Deferred pipelines are setup;
  - `shaders/` contains the WGSL files that are interpreted as shader programs at runtime, as well as a `shaders.ts` file which preprocesses the shaders;
  - `stage/` includes basic components such as camera controls, scene loading, and lights;
  - `scenes/` contains the Sponza Atrium model used in the test scene.

## Running the Code
Follow these steps to install and view the project:
1. Clone this repository;
2. Download and install [Node.js](https://nodejs.org/en/);
3. Run `npm install` in the root directory of this project to download and install dependencies;
4. Run `npm run dev`, which will open the project in your browser.
   - The project will automatically reload when you edit any of the files.

## Methods Overview
### Naive
The fragment shader samples the diffuse texture using the provided texture coordinates. If the alpha is less than 0.5, the fragment is discarded. The shader then iterates over all lights in the `LightSet`. For each light, it computes the contribution using the fragment’s world position and normal. The contributions are accumulated into a total. The final color is the diffuse color multiplied by the total light contribution, and the shader returns an RGBA vector with alpha 1.0.

### Clustered Forward Pipeline
Before rendering, a compute shader divides the view frustum into a 3D grid of clusters. For each cluster, it builds an axis-aligned bounding box in view space and tests each light’s influence sphere against it, storing only intersecting lights per cluster. During rendering, the fragment shader samples the diffuse texture and discards fragments with alpha less than 0.5. It then determines the fragment’s cluster by converting its world position to normalized device coordinates and computing the 3D cluster index (X, Y from screen position, Z from logarithmic depth). The shader reads the cluster’s light list and iterates only over those lights, computing each contribution and accumulating them. The final color is the diffuse color multiplied by the accumulated contribution, returned as an RGBA vector with alpha 1.0.

### Clustered Deferred Pipeline
The pipeline runs in multiple passes. First, a compute shader performs light clustering (same as Forward+), dividing the view frustum into a 3D grid and storing intersecting lights per cluster. The G-buffer pass renders all geometry and writes to three textures: world position, world normal, and albedo. The fragment shader samples the diffuse texture, discards fragments with alpha less than 0.5, and outputs position, normalized normal, and albedo to the respective render targets. The fullscreen pass renders a fullscreen triangle. For each pixel, it reads position, normal, and albedo from the G-buffer textures. It determines the pixel’s cluster index from the position (same method as Clustered Forward), retrieves the cluster’s light list, and iterates only over those lights, computing and accumulating contributions. The final color is the albedo multiplied by the accumulated contribution, returned as an RGBA vector with alpha 1.0.

# Performance Analysis
For this part, [WebGPU Inspector](https://github.com/brendan-duncan/webgpu_inspector) is used. The canvas size is fixed at 1906 x 1578.

- **Setting 1:** maxLightsPerCluster = 500, clusterDimensions = [16, 16, 16]
  - ![](imgs/performance/Lights%20Count%20-%20Average%20Frame%20Time%20Per%20Method.png)

- **Setting 2:** maxLightsPerCluster = 100, numLights = 2000, Dimensions in Each Axis = cube root of numLights
  - ![](imgs/performance/Cluster%20Count%20-%20Average%20Frame%20Time%20for%20Forward+%20and%20Clustered%20Def.png)
  - ![](imgs/performance/Cluster%20Count%20-%20Buffer%20Memory%20for%20Forward+%20and%20Clustered%20Def.png)

## Performance Comparison (First Graph - Lights Count vs. Average Frame Time)
The first graph compares the **Naive**, **Forward+**, and **Clustered Deferred** shading methods. It is clear that **Clustered Deferred** performs significantly better than both **Naive** and **Forward+** as the number of lights increases.

The **Naive fragment shader** shows the worst performance, with frame time increasing rapidly as the light count grows. Starting at 467 ms with 500 lights, the frame time grows to over 1551 ms at 5000 lights, indicating that it does not scale well with more lights. This is because the naive shader iterates over **all lights** for every fragment, making it highly inefficient as the scene becomes more complex. By 5000 lights, it is about 2.5 times slower than **Forward+** and more than 13 times slower than **Clustered Deferred**.

**Forward+**, in comparison, starts at 467 ms for 500 lights but increases more gradually, reaching 617.2 ms at 5000 lights. This shows that Forward+ handles increasing light counts better than Naive shading but still suffers from performance degradation as more lights are added. This is because while **Forward+** clusters the scene and limits the number of lights considered per fragment, it still processes all lights in the forward pass, making it less efficient in very large lighting setups.

The **Clustered Deferred shader** consistently outperforms both methods. It maintains a steady frame time of around 116.7 ms from 500 lights up to 3000 lights, and even at 5000 lights, its frame time only increases to 133.5 ms. This massive performance gain is due to its **deferred shading technique**, where lighting calculations are separated from the geometry pass, and lighting is only applied to visible fragments. Clustered Deferred’s use of clusters to minimize the number of lights processed per fragment ensures that even with large numbers of lights, performance remains steady.

## Scalability
The **Clustered Deferred** method clearly excels in scalability compared to **Naive** and **Forward+**. As the number of lights increases, the **Naive shader** becomes impractically slow, while **Forward+** struggles with larger light counts but remains usable. **Clustered Deferred** handles large numbers of lights with minimal performance degradation, making it the best choice for scenes with many lights.

## Memory Usage (Third Graph - Cluster Count vs. Buffer Memory)
In terms of memory usage, both **Forward+** and **Clustered Deferred** show a similar memory footprint at lower cluster counts. As the cluster count increases, **Clustered Deferred** consumes slightly more memory than **Forward+**. At 8000 clusters, **Clustered Deferred** uses around 13.1 MB of memory, compared to **Forward+** at 11.3 MB. This higher memory usage is due to **Clustered Deferred's** need for a **G-buffer** to store intermediate data like positions, normals, and albedo, which is not required in **Forward+**.

## Benefits and Tradeoffs
- **Clustered Deferred** provides the best performance in scenes with a high number of lights, especially as the lighting calculations are deferred until after the geometry pass, focusing only on visible fragments. However, this comes at the cost of higher memory usage due to the G-buffer.
- **Forward+** is simpler and uses less memory, but it scales poorly in scenes with many lights, leading to increased frame times as the light count grows.
- **Naive shading** is the least efficient method, especially as the number of lights increases, due to its brute-force approach of processing all lights for each fragment. It is not suited for complex lighting setups.

## Explanation for Performance Differences
The **Naive shader** suffers from poor performance because it does not cull or limit the number of lights considered for each fragment, resulting in a direct increase in frame time with more lights. **Forward+** improves on this by clustering the scene and limiting the lights affecting each fragment, but since all lighting is still done in a forward pass, it becomes inefficient in large light counts. **Clustered Deferred** avoids this problem by deferring lighting calculations to a separate pass, applying lighting only to visible fragments and using clusters to minimize the lights per fragment. This results in far more stable performance across different light counts.

## Feature Analysis and Impact on Performance

1. **Dynamic Lighting**:
   - **Naive**: Performance degrades severely with more lights.
   - **Forward+**: Manages light counts better than Naive, but still suffers at higher light counts due to the forward pass.
   - **Clustered Deferred**: Handles dynamic lighting much better, maintaining consistent performance across different light counts by deferring lighting calculations and using clusters.

2. **Cluster Count**:
   - **Naive**: Does not use clustering, hence its poor performance scalability.
   - **Forward+**: Increasing cluster count slightly reduces performance but remains more efficient than Naive.
   - **Clustered Deferred**: Easily handles more clusters without significant performance drops, making it highly efficient in complex scenes.

3. **Buffer Memory Usage**:
   - **Forward+** uses less memory, making it more suitable for memory-constrained systems, but at the cost of reduced performance with more lights.
   - **Clustered Deferred** consumes more memory due to the G-buffer, but the tradeoff is its superior performance in handling large lighting workloads.

## Conclusion
In summary, **Clustered Deferred Shading** is the most efficient method for handling complex scenes with numerous lights, as it scales well with both light counts and cluster counts while maintaining low frame times. **Forward+** offers a middle ground between the simplicity of Naive shading and the advanced performance of Clustered Deferred, but it struggles with higher light counts. **Naive shading**, while functional, is highly inefficient for scenes with many lights, making it impractical for large-scale lighting setups.

# Future Improvements
Both **Forward+** and **Clustered Deferred** methods can be improved by addressing performance bottlenecks and further optimizing lighting calculations.

For **Forward+**, one improvement could be **dynamic clustering** where cluster sizes are adjusted based on scene complexity, minimizing empty clusters. For **Clustered Deferred**, improvements can focus on reducing **G-buffer memory usage** by encoding data more efficiently, such as using **compressed formats** or **packed data structures**. Additionally, implementing **tile-based or per-cluster light culling** during the lighting pass can significantly reduce the number of lights evaluated, optimizing the shader for scenes with many lights or complex geometries.

# Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
- [WebGPU Inspector](https://github.com/brendan-duncan/webgpu_inspector)
