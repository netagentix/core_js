/*
 * ----------------------------------------------------------------------------
 * Agentix OS - Quantum Continuous Engine
 * Copyright (C) 2026 Agentix Project
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * ----------------------------------------------------------------------------
 */

/**
 * ============================================================
 * KERNEL AGENTIX OS — corekernel.js
 * Quantum Geodesic Framewok (QGF) v2.0
 * ============================================================
 * Gold Rule: No explicit if-then in runtime loops.
 * All logic is mapped through relational tension & YAML config.
 *
 * EXPORTS:
 *   - Vector        : Static 2D vector math
 *   - Semantic      : Perceptory-to-valence converters
 *   - AgentixKernel : Base kernel class (extend this for simulations)
 * ============================================================
 */

// ─────────────────────────────────────────────
// 1. VECTOR — Static 2D Vector Math
// ─────────────────────────────────────────────
class Vector {
    static add(a, b)   { return [a[0]+b[0], a[1]+b[1]]; }
    static sub(a, b)   { return [a[0]-b[0], a[1]-b[1]]; }
    static mul(a, s)   { return [a[0]*s,    a[1]*s   ]; }
    static div(a, s)   { const m = s + 1e-12; return [a[0]/m, a[1]/m]; }
    static norm(a)     { return Math.sqrt(a[0]**2 + a[1]**2); }
    static dist(a, b)  { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2); }
    static normalize(a){ return Vector.div(a, Vector.norm(a)); }
    static dot(a, b)   { return a[0]*b[0] + a[1]*b[1]; }
    static cross(a, b) { return a[0]*b[1] - a[1]*b[0]; }
    static rotate(v, angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return [v[0]*c - v[1]*s, v[0]*s + v[1]*c];
    }
    static lerp(a, b, t) {
        return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
    }
    static clamp(a, min, max) {
        return [Math.max(min, Math.min(max, a[0])),
                Math.max(min, Math.min(max, a[1]))];
    }
    static zero()  { return [0, 0]; }
    static angle(a){ return Math.atan2(a[1], a[0]); }
    static fromAngle(angle, len = 1) {
        return [Math.cos(angle)*len, Math.sin(angle)*len];
    }
}

// ─────────────────────────────────────────────
// 2. SEMANTIC — Perceptory-to-Valence Layer
//    Converts raw sensor data → clean [0,1] or [-1,1]
// ─────────────────────────────────────────────
class Semantic {
    /** Linear normalization → [0, 1] */
    static normalize(raw, maxVal)   { return Math.max(0, Math.min(1, (raw||0)/(maxVal||1))); }
    /** Symmetric normalization → [-1, 1] */
    static symNorm(raw, radius)     { return Math.max(-1, Math.min(1, (raw||0)/(radius||1))); }
    /** Proximity: closer = higher → [0, 1] */
    static proximity(dist, maxDist) { return Math.max(0, 1 - Math.abs(dist||0)/(maxDist||1)); }
    /** Deadzone filter: removes micro-jitter */
    static deadzone(raw, threshold) { return +(Math.abs(raw||0) > threshold) * (raw||0); }
    /** Binary: boolean/existence → 0.0 or 1.0 */
    static binary(cond)             { return +(!!cond); }
    /** Soft threshold via sigmoid */
    static softThresh(raw, center, sharpness = 5.0) {
        return 1 / (1 + Math.exp(-sharpness * ((raw||0) - center)));
    }
    /** Exponential decay (energy falloff) */
    static decay(raw, rate = 0.95)  { return (raw||0) * rate; }
    /** Angle difference normalized to [-1, 1] */
    static angleDiff(a, b) {
        let d = ((b - a) % (2*Math.PI) + 3*Math.PI) % (2*Math.PI) - Math.PI;
        return d / Math.PI;
    }
}

// ─────────────────────────────────────────────
// 3. AGENTIX KERNEL — Base Class
//    Extend this in each simulation
// ─────────────────────────────────────────────
class AgentixKernel {
    constructor(config) {
        this.cfg       = config || {};
        this.iteration = 0;
        this.agents    = {};
        this.objects   = {};
        this.sensors   = {};

        // ── Activation Function Registry ──
        this.activators = {
            sigmoid:  (x, beta = 1.0)       => 1 / (1 + Math.exp(-beta * x)),
            gaussian: (x, sigma = 1.0)      => Math.exp(-(x**2) / (2 * sigma**2)),
            tanh:     (x, alpha = 1.0)      => Math.tanh(x * alpha),
            linear:   (x, scale = 1.0)      => x * scale,
            relu:     (x, leak = 0.0)       => x >= 0 ? x : x * leak,
            clamp:    (x, min = 0, max = 1) => Math.max(min, Math.min(max, x)),
            softplus: (x)                   => Math.log(1 + Math.exp(x)),
            swish:    (x)                   => x / (1 + Math.exp(-x)),
        };
    }

    // ── Node Activation (YAML-driven, no if-then) ──
    // Node format: [bias, scale, [[sensor_key, weight], ...], activator_name]
    _activateNode(node, context) {
        const [bias, scale, inputs, activator] = node;
        let sum = bias;
        inputs.forEach(([key, w]) => { sum += (context[key] || 0) * w; });
        const fn = this.activators[activator || 'sigmoid'];
        return fn(sum) * scale;
    }

    // ── RTD: Relative Tension Distribution ──
    // Normalizes competing intents via RMS → prevents runaway dominance
    _computeRTD(vals, alpha = 2.8) {
        const rms = Math.sqrt(vals.reduce((a, v) => a + v*v, 0) / (vals.length + 1e-12));
        return vals.map(v => Math.tanh((v / (rms + 1e-12)) * alpha));
    }

    // ── Resolve Relational Target Map ──
    // key → { prop: dataContext[sourceKey] }  (no if-then)
    _resolveRelational(key, relationMap, dataContext) {
        const entry = relationMap[key] || {};
        const out = {};
        Object.entries(entry).forEach(([prop, src]) => {
            out[prop] = dataContext[src] !== undefined ? dataContext[src] : src;
        });
        return out;
    }

    // ── Net Force from Attractor Map ──
    _resolveForces(sourcePos, attractors, targets) {
        let net = Vector.zero();
        Object.entries(attractors).forEach(([role, weight]) => {
            const tgt = targets[role] || Vector.zero();
            const diff = Vector.sub(tgt, sourcePos);
            const dist = Vector.norm(diff) + 1e-12;
            net = Vector.add(net, Vector.mul(Vector.div(diff, dist), weight));
        });
        return net;
    }

    // ── Masked Force Application (replaces if-then gate) ──
    _applyMaskedForce(velocity, force, mask) {
        return Vector.add(velocity, Vector.mul(force, +mask));
    }

    // ── Boundary Clip (no if-then) ──
    _boundaryClip(pos, bounds) {
        return [
            Math.max(bounds[0], Math.min(bounds[2], pos[0])),
            Math.max(bounds[1], Math.min(bounds[3], pos[1]))
        ];
    }

    // ── Register custom activator ──
    registerActivator(name, fn) {
        this.activators[name] = fn;
    }

    // ── Tick Pipeline (Override these in subclass) ──
    step() {
        this.iteration++;
        this.perceptoryLayer();
        this.semanticLayer();
        this.decisionLayer();
        this.kineticLayer();
    }

    perceptoryLayer() {
        // Layer 1: Capture raw sensor data
    }

    semanticLayer() {
        // Layer 2: Process raw data into semantic states/valence
    }

    decisionLayer() {
        // Layer 4: Resolve tensions and make decisions
    }

    kineticLayer() {
        // Layer 5: Translate decisions into motor actions (embodiment)
    }
}


    // ── Load Config (Logic Graph) ──
    async loadConfigFromLogicGraph(path) {
        try {
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                const fs = require('fs').promises;
                const content = await fs.readFile(path, 'utf8');
                this.cfg = JSON.parse(content);
            } else {
                const res = await fetch(path);
                this.cfg = await res.json();
            }
            return this.cfg;
        } catch (e) {
            console.error("Error loading config from logic graph:", e);
            throw e;
        }
    }


// ─────────────────────────────────────────────
// VECTOR N-DIMENSIONAL ENRICHMENTS (v02)
// ─────────────────────────────────────────────
class Vector3D {
    static add(a, b)   { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
    static sub(a, b)   { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
    static mul(a, s)   { return [a[0]*s,    a[1]*s,    a[2]*s   ]; }
    static div(a, s)   { const m = s + 1e-12; return [a[0]/m, a[1]/m, a[2]/m]; }
    static norm(a)     { return Math.sqrt(a[0]**2 + a[1]**2 + a[2]**2); }
    static dist(a, b)  { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2); }
    static zero()      { return [0, 0, 0]; }
    static dot(a, b)   { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
    static cross(a, b) { 
        return [
            a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0]
        ];
    }
}

class Vector4D {
    static add(a, b)   { return [a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3]]; }
    static sub(a, b)   { return [a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]]; }
    static mul(a, s)   { return [a[0]*s,    a[1]*s,    a[2]*s,    a[3]*s   ]; }
    static div(a, s)   { const m = s + 1e-12; return [a[0]/m, a[1]/m, a[2]/m, a[3]/m]; }
    static norm(a)     { return Math.sqrt(a[0]**2 + a[1]**2 + a[2]**2 + a[3]**2); }
    static zero()      { return [0, 0, 0, 0]; }
    static dot(a, b)   { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]; }
}

class Vector5D {
    static add(a, b)   { return [a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3], a[4]+b[4]]; }
    static sub(a, b)   { return [a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3], a[4]-b[4]]; }
    static mul(a, s)   { return [a[0]*s,    a[1]*s,    a[2]*s,    a[3]*s,    a[4]*s   ]; }
    static div(a, s)   { const m = s + 1e-12; return [a[0]/m, a[1]/m, a[2]/m, a[3]/m, a[4]/m]; }
    static norm(a)     { return Math.sqrt(a[0]**2 + a[1]**2 + a[2]**2 + a[3]**2 + a[4]**2); }
    static zero()      { return [0, 0, 0, 0, 0]; }
    static dot(a, b)   { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3] + a[4]*b[4]; }
}

class VectorND {
    static add(a, b)   { return a.map((val, i) => val + b[i]); }
    static sub(a, b)   { return a.map((val, i) => val - b[i]); }
    static mul(a, s)   { return a.map(val => val * s); }
    static div(a, s)   { const m = s + 1e-12; return a.map(val => val / m); }
    static norm(a)     { return Math.sqrt(a.reduce((sum, val) => sum + val**2, 0)); }
    static dist(a, b)  { return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i])**2, 0)); }
    static zero(dim)   { return new Array(dim).fill(0); }
    static dot(a, b)   { return a.reduce((sum, val, i) => sum + val * b[i], 0); }
}

// ─────────────────────────────────────────────
// LATENT STATE (Spatio-Temporal Continuous Space)
// ─────────────────────────────────────────────
class LatentState {
    constructor() {
        this.anchors = []; // { coord: VectorND array, state: any array }
    }
    
    insert(coord, state) {
        this.anchors.push({ coord, state });
    }
    
    // Smooth continuous sampling in any dimension using Inverse Distance Weighting
    sample(coord, power = 2.0) {
        // Safe access, assume anchors exist for branchless logic to flow
        let numStateDims = this.anchors[0] ? this.anchors[0].state.length : 1;
        let result = new Array(numStateDims).fill(0);
        let totalWeight = 0;
        
        for (let i = 0; i < this.anchors.length; i++) {
            let anchor = this.anchors[i];
            let d = VectorND.dist(coord, anchor.coord) + 1e-12; 
            
            let weight = 1.0 / Math.pow(d, power);
            totalWeight += weight;
            
            for (let j = 0; j < numStateDims; j++) {
                result[j] += anchor.state[j] * weight;
            }
        }
        
        for (let j = 0; j < numStateDims; j++) {
            result[j] /= (totalWeight + 1e-12);
        }
        return result;
    }
}

// ─────────────────────────────────────────────
// RETROCAUSAL GATE (Continuous Field Tension Lock)
// ─────────────────────────────────────────────
class RetrocausalGate {
    constructor(hwUidVector = null) {
        this.hwUid = hwUidVector;
        this.lockedPayload = null;
        this.equilibriumTension = null;
    }
    
    lock(payload, vPast, vFuture) {
        this.lockedPayload = payload;
        let hw = this.hwUid || VectorND.zero(vPast.length);
        
        // Sum the tensions: past + future + hw
        let tension = VectorND.add(vPast, vFuture);
        tension = VectorND.add(tension, hw);
        
        // The equilibrium point is the exact opposite tension needed to balance to 0
        this.equilibriumTension = VectorND.mul(tension, -1);
    }
    
    unlock(attemptPast, attemptFuture) {
        let hw = this.hwUid || VectorND.zero(attemptPast.length);
        let currentTension = VectorND.add(attemptPast, attemptFuture);
        currentTension = VectorND.add(currentTension, hw);
        
        let netTension = VectorND.add(currentTension, this.equilibriumTension);
        let magnitude = VectorND.norm(netTension);
        
        let accessLevel = Math.exp(-(magnitude**2) / (2 * 0.001**2));
        let accessMask = 1.0 / (1.0 + Math.exp(-1000.0 * (accessLevel - 0.99)));
        
        // If payload is not set, this.lockedPayload might be null, but assuming VectorND operations
        return this.lockedPayload ? VectorND.mul(this.lockedPayload, accessMask) : null;
    }
}

// ─────────────────────────────────────────────
// QUANTUM CONTINUOUS FIELDS & LATENT PLAYGROUND
// ─────────────────────────────────────────────
class QuantumHyperField {
    constructor(anchorA, anchorB, initialBodyState, noiseTolerance = 0.1) {
        this.anchorA = anchorA;
        this.anchorB = anchorB;
        this.bodyState = initialBodyState;
        this.noiseTolerance = noiseTolerance;
        this.decohered = false;
    }
    
    evaluateTension(globalTensionField) {
        let freezeMask = this.decohered === true ? 1.0 : (this.decoherenceMask || 0.0);
        let fluxMask = 1.0 - freezeMask;
        
        let midpoint = VectorND.div(VectorND.add(this.anchorA, this.anchorB), 2.0);
        let interfered = VectorND.add(midpoint, globalTensionField);
        let dist = VectorND.dist(this.bodyState, interfered);
        
        let tunnelMask = 1.0 / (1.0 + Math.exp(-5.0 * (dist - 10.0)));
        let normalMask = 1.0 - tunnelMask;
        
        let pull = VectorND.sub(interfered, this.bodyState);
        let normalUpdate = VectorND.add(this.bodyState, VectorND.mul(pull, this.noiseTolerance));
        let tunnelUpdate = this.anchorB;
        
        let newBody = VectorND.add(VectorND.mul(normalUpdate, normalMask), VectorND.mul(tunnelUpdate, tunnelMask));
        
        this.bodyState = VectorND.add(VectorND.mul(this.bodyState, freezeMask), VectorND.mul(newBody, fluxMask));
        return this.bodyState;
    }
}

class LatentPlayground {
    constructor() {
        this.fields = [];
        this.attractors = {};
    }
    
    declareVariable(name, vectorND) {
        this.attractors[name] = vectorND;
    }
    
    addEntanglement(field) {
        this.fields.push(field);
    }
    
    // SIMF (Single Instruction Multi Fields)
    simfResolve(externalInstructionVector) {
        let globalTension = externalInstructionVector.slice();
        for (let key in this.attractors) {
            globalTension = VectorND.add(globalTension, this.attractors[key]);
        }
        for (let i = 0; i < this.fields.length; i++) {
            this.fields[i].evaluateTension(globalTension);
        }
    }
    
    // Planned Decoherence (Purist Branchless via Signal Vector)
    plannedDecoherence(signalVector) {
        let result = [];
        for (let i = 0; i < this.fields.length; i++) {
            let freezeSignal = signalVector[i] || 0.0;
            let currentFreeze = this.fields[i].decoherenceMask || 0.0;
            // Pure mathematical OR gate for masks
            this.fields[i].decoherenceMask = 1.0 - ((1.0 - currentFreeze) * (1.0 - freezeSignal));
            result.push(this.fields[i].bodyState);
        }
        return result;
    }
}

export { QuantumHyperField, LatentPlayground, RetrocausalGate, LatentState, Vector, Vector3D, Vector4D, Vector5D, VectorND, Semantic, AgentixKernel };
