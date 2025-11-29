import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

// Bloom controls (only for clustered deferred)
const bloomControls = {
    enabled: false,
    strength: 1
};

let bloomEnabledController: any = null;
let bloomStrengthController: any = null;

function updateBloomControls() {
    const isClusteredDeferred = renderer instanceof ClusteredDeferredRenderer;
    
    if (isClusteredDeferred) {
        // Add bloom controls if they don't exist
        if (!bloomEnabledController) {
            bloomEnabledController = gui.add(bloomControls, 'enabled').name('Bloom Enabled');
            bloomEnabledController.onChange(() => {
                updateBloomStrengthVisibility();
                if (renderer instanceof ClusteredDeferredRenderer) {
                    renderer.setBloomEnabled(bloomControls.enabled);
                }
            });
        }
        updateBloomStrengthVisibility();
    } else {
        // Remove bloom controls if they exist
        if (bloomEnabledController) {
            gui.remove(bloomEnabledController);
            bloomEnabledController = null;
        }
        if (bloomStrengthController) {
            gui.remove(bloomStrengthController);
            bloomStrengthController = null;
        }
    }
}

function updateBloomStrengthVisibility() {
    if (bloomControls.enabled) {
        // Add strength slider if it doesn't exist
        if (!bloomStrengthController) {
            bloomStrengthController = gui.add(bloomControls, 'strength').min(1).max(5).step(1).name('Bloom Strength');
            bloomStrengthController.onChange(() => {
                // Round to integer to ensure it's always an integer value
                bloomControls.strength = Math.round(bloomControls.strength);
                if (renderer instanceof ClusteredDeferredRenderer) {
                    renderer.setBloomStrength(bloomControls.strength);
                }
            });
        }
    } else {
        // Remove strength slider if it exists
        if (bloomStrengthController) {
            gui.remove(bloomStrengthController);
            bloomStrengthController = null;
        }
    }
}

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
    }
    
    // Update bloom controls visibility based on renderer
    updateBloomControls();
    
    // Set initial bloom state if clustered deferred
    if (renderer instanceof ClusteredDeferredRenderer) {
        renderer.setBloomEnabled(bloomControls.enabled);
        renderer.setBloomStrength(bloomControls.strength);
    }
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', clusteredDeferred: 'clustered deferred' };
let renderModeController = gui.add({ mode: renderModes.clusteredDeferred }, 'mode', renderModes);
renderModeController.onChange((value: string) => {
    setRenderer(value);
});

setRenderer(renderModeController.getValue());
