import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import {canvasFormat} from "../renderer";

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    /** Bind Group Variables **/
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    bloomBindGroupLayout: GPUBindGroupLayout;
    bloomBindGroup: GPUBindGroup;
    gaussianBlurBindGroupLayout: GPUBindGroupLayout;
    gaussianBlurHorizontalBindGroup: GPUBindGroup;
    gaussianBlurVerticalBindGroup: GPUBindGroup;
    /***************************************/

    /** Texture Variables **/
    depthTexture: GPUTexture;
    gBufferPositionTexture: GPUTexture;
    gBufferNormalTexture: GPUTexture;
    gBufferAlbedoTexture: GPUTexture;
    fullScreenTexture: GPUTexture;
    bloomBlurTexture1: GPUTexture;
    bloomBlurTexture2: GPUTexture;

    depthTextureView: GPUTextureView;
    gBufferPositionTextureView: GPUTextureView;
    gBufferNormalTextureView: GPUTextureView;
    gBufferAlbedoTextureView: GPUTextureView;
    fullScreenTextureView: GPUTextureView;
    bloomBlurTexture1View: GPUTextureView;
    bloomBlurTexture2View: GPUTextureView;
    /***************************************/

    /** Pipeline Variables **/
    gBufferPass: GPURenderPipeline; // the pass to populate g buffers
    finalPass: GPURenderPipeline;
    // passes for bloom post processing effect
    bloomExtractionPass: GPURenderPipeline; // the pass to render to both a fullscreen texture and a bright pixel texture
    gaussianBlurHorizontalPass: GPURenderPipeline; // the pass to blur the bright pixel texture
    gaussianBlurVerticalPass: GPURenderPipeline; // the pass to blur the bright pixel texture
    bloomFinalPass: GPURenderPipeline; // the pass the combine the fullscreen texture and the blurred bright pixel texture
    /***************************************/

    /** Bloom State **/
    bloomEnabled: boolean = false;
    bloomStrength: number = 1.0;
    /***************************************/

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        /** General Bind Group **/
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout for forward+",
            entries: [
                // Add an entry for camera uniforms at binding 0, visible to the vertex and compute shader, and of type "uniform"
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group for forward+",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }, 
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });
        /***************************************************************************/

        /** Initialise Textures **/
        const gBufferTextureFormat = "rgba16float";
        const canvasWidth = Math.max(1, renderer.canvas.width);
        const canvasHeight = Math.max(1, renderer.canvas.height);

        this.depthTexture = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.gBufferPositionTexture = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: gBufferTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferNormalTexture = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: gBufferTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferAlbedoTexture = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: gBufferTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.fullScreenTexture = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: gBufferTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.bloomBlurTexture1 = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: gBufferTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.bloomBlurTexture2 = renderer.device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
                depthOrArrayLayers: 1
            },
            format: gBufferTextureFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.depthTextureView = this.depthTexture.createView();
        this.gBufferPositionTextureView = this.gBufferPositionTexture.createView();
        this.gBufferNormalTextureView = this.gBufferNormalTexture.createView();
        this.gBufferAlbedoTextureView = this.gBufferAlbedoTexture.createView();
        this.fullScreenTextureView = this.fullScreenTexture.createView();
        this.bloomBlurTexture1View = this.bloomBlurTexture1.createView();
        this.bloomBlurTexture2View = this.bloomBlurTexture2.createView();
        /***************************************************************************/

        /** Define G-Buffer Bind Group **/
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer bind group layout",
            entries: [
                // Position Texture
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                },
                // Normal Texture
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                },
                // Albedo Texture
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                }
            ]
        });
        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferPositionTextureView
                },
                {
                    binding: 1,
                    resource: this.gBufferNormalTextureView
                },
                {
                    binding: 2,
                    resource: this.gBufferAlbedoTextureView
                }
            ]
        });
        /***************************************************************************/

        /** Define Bloom Bind Group **/
        this.bloomBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "bloom bind group layout",
            entries: [
                // base render (i.e. the final render without bloom)
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                },
                // blurred extracted bright parts
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                }
            ]
        });
        this.bloomBindGroup = renderer.device.createBindGroup({
            label: "bloom bind group",
            layout: this.bloomBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.fullScreenTextureView
                },
                {
                    binding: 1,
                    resource: this.bloomBlurTexture1View
                }
            ]
        });
        /***************************************************************************/

        /** Define Gaussian Blur Bind Groups **/
        this.gaussianBlurBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gaussian blur horizontal bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                }
            ]
        });
        this.gaussianBlurHorizontalBindGroup = renderer.device.createBindGroup({
            label: "gaussian blur horizontal bind group",
            layout: this.gaussianBlurBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.bloomBlurTexture1View
                }
            ]
        });
        this.gaussianBlurVerticalBindGroup = renderer.device.createBindGroup({
            label: "gaussian blur vertical bind group",
            layout: this.gaussianBlurBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.bloomBlurTexture2View
                }
            ]
        });
        /***************************************************************************/

        /** Define G-Buffer Pass **/
        this.gBufferPass = renderer.device.createRenderPipeline({
            label: "G-buffer pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pass pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer pass vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer pass frag shader",
                    code: shaders.gBufferFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    { format: gBufferTextureFormat },
                    { format: gBufferTextureFormat },
                    { format: gBufferTextureFormat }
                ]
            }
        });
        /***************************************************************************/

        /** Define Final Pass (without any post-processing) **/
        this.finalPass = renderer.device.createRenderPipeline({
            label: "final pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "final pass pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "final pass vert shader",
                    code: shaders.fullscreenTriangleVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "final pass frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    { format: canvasFormat }
                ]
            }
        });
        /***************************************************************************/

        /** Define Bloom Extraction Pass **/
        this.bloomExtractionPass = renderer.device.createRenderPipeline({
            label: "Bloom extraction pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "Bloom extraction pass pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Bloom extraction pass vert shader",
                    code: shaders.fullscreenTriangleVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Bloom extraction pass frag shader",
                    code: shaders.bloomExtractionFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    { format: gBufferTextureFormat },
                    { format: gBufferTextureFormat }
                ]
            }
        });
        /***************************************************************************/

        /** Define Gaussian Blur Passes **/
        this.gaussianBlurHorizontalPass = renderer.device.createRenderPipeline({
            label: "gaussian blur horizontal pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "gaussian blur horizontal pass pipeline layout",
                bindGroupLayouts: [
                    this.gaussianBlurBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Gaussian blur horizontal pass vert shader",
                    code: shaders.fullscreenTriangleVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Gaussian blur horizontal pass frag shader",
                    code: shaders.gaussianBlurHorizontalFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: gBufferTextureFormat },
                ]
            }
        });
        this.gaussianBlurVerticalPass = renderer.device.createRenderPipeline({
            label: "gaussian blur vertical pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "gaussian blur vertical pass pipeline layout",
                bindGroupLayouts: [
                    this.gaussianBlurBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Gaussian blur vertical pass vert shader",
                    code: shaders.fullscreenTriangleVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Gaussian blur vertical pass frag shader",
                    code: shaders.gaussianBlurVerticalFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: gBufferTextureFormat },
                ]
            }
        });
        /***************************************************************************/

        /** Define Final Pass **/
        this.bloomFinalPass = renderer.device.createRenderPipeline({
            label: "bloom final pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "bloom final pipeline layout",
                bindGroupLayouts: [
                    this.bloomBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "bloom final pass vert shader",
                    code: shaders.fullscreenTriangleVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "bloom final pass frag shader",
                    code: shaders.bloomCombineFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        })
    }

    /** Public functions **/
    setBloomEnabled(enabled: boolean) {
        this.bloomEnabled = enabled;
    }

    setBloomStrength(strength: number) {
        this.bloomStrength = strength;
    }
    /***************************************/

    // Pass submission
    runGBufferPass() {
        // Create G-buffer render pass descriptor
        const gBufferPassDescriptor: GPURenderPassDescriptor = {
            label: "Clustered Deferred G-buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufferPositionTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.gBufferNormalTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.gBufferAlbedoTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        };

        const commandEncoder = renderer.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(gBufferPassDescriptor);

        passEncoder.setPipeline(this.gBufferPass);
        passEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(
            node => {
                passEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            material => {
                passEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            primitive => {
                passEncoder.setVertexBuffer(0, primitive.vertexBuffer);
                passEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
                passEncoder.drawIndexed(primitive.numIndices);
            }
        );

        passEncoder.end();
        renderer.device.queue.submit([commandEncoder.finish()]);
    }

    runFinalPass() {
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const fullScreenPassDescriptor: GPURenderPassDescriptor = {
            label: "Clustered Deferred fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        };

        const commandEncoder = renderer.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(fullScreenPassDescriptor);

        passEncoder.setPipeline(this.finalPass);

        passEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        passEncoder.setBindGroup(1, this.gBufferBindGroup);

        passEncoder.draw(3);

        passEncoder.end();
        renderer.device.queue.submit([commandEncoder.finish()]);
    }

    runBloomExtractionPass() {
        const bloomExtractionDescriptor: GPURenderPassDescriptor = {
            label: "bloom extraction render pass",
            colorAttachments: [
                {
                    view: this.fullScreenTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.bloomBlurTexture1View,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        };

        const commandEncoder = renderer.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(bloomExtractionDescriptor);

        passEncoder.setPipeline(this.bloomExtractionPass);
        
        passEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        passEncoder.setBindGroup(1, this.gBufferBindGroup);

        passEncoder.draw(3);

        passEncoder.end();
        renderer.device.queue.submit([commandEncoder.finish()]);
    }

    runGaussianBlurPass() {
        const gaussianHorizontalDescriptor : GPURenderPassDescriptor = {
            label: "gaussian blur horizontal render pass",
            colorAttachments: [
                {
                    view: this.bloomBlurTexture2View,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        }

        const gaussianVerticalDescriptor : GPURenderPassDescriptor = {
            label: "gaussian blur vertical render pass",
            colorAttachments: [
                {
                    view: this.bloomBlurTexture1View,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        }

        for (var i = 0; i < this.bloomStrength; ++i) {
            const commandEncoder1 = renderer.device.createCommandEncoder();
            const commandEncoder2 = renderer.device.createCommandEncoder();
            const passEncoder1 = commandEncoder1.beginRenderPass(gaussianHorizontalDescriptor);
            const passEncoder2 = commandEncoder2.beginRenderPass(gaussianVerticalDescriptor);

            passEncoder1.setPipeline(this.gaussianBlurHorizontalPass);
            passEncoder2.setPipeline(this.gaussianBlurVerticalPass);

            passEncoder1.setBindGroup(0, this.gaussianBlurHorizontalBindGroup);
            passEncoder2.setBindGroup(0, this.gaussianBlurVerticalBindGroup);

            passEncoder1.draw(3);
            passEncoder1.end();
            renderer.device.queue.submit([commandEncoder1.finish()]);

            passEncoder2.draw(3);
            passEncoder2.end();
            renderer.device.queue.submit([commandEncoder2.finish()]);
        }
    }

    runBloomFinalPass() {
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const fullScreenPassDescriptor: GPURenderPassDescriptor = {
            label: "bloom combine render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        };

        const commandEncoder = renderer.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(fullScreenPassDescriptor);

        passEncoder.setPipeline(this.bloomFinalPass);
        passEncoder.setBindGroup(0, this.bloomBindGroup);

        passEncoder.draw(3);

        passEncoder.end();
        renderer.device.queue.submit([commandEncoder.finish()]);
    }

    override draw() {
        // TODO-3: run the clustered deferred rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        this.runGBufferPass();
        if (this.bloomEnabled) {
            this.runBloomExtractionPass();
            this.runGaussianBlurPass();
            this.runBloomFinalPass();
        }
        else {
            this.runFinalPass();
        }
    }
}
