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
 * KERNEL AGENTIX OS — tension_engine.js
 * Module 1: Tension Logic Engine
 * Attractor · Repulsor · Damper · Interference
 * ============================================================
 * Depends on: corekernel.js
 */
import { AgentixKernel, Vector, Semantic } from './corekernel.js';

class TensionEngine extends AgentixKernel {
    constructor(config) {
        super(config);
        this._tensionFields = {};   // named tension fields registry
        this._dampFields    = {};   // damping field registry
    }

    // ─────────────────────────────────────────
    // ATTRACTOR: pulls agent toward target
    // weight > 0 → attract, weight < 0 → repel
    // ─────────────────────────────────────────
    computeAttractor(sourcePos, targetPos, weight, falloff = 1.0) {
        const diff  = Vector.sub(targetPos, sourcePos);
        const dist  = Vector.norm(diff) + 1e-12;
        const dir   = Vector.div(diff, dist);
        // Inverse-square falloff (natural potential field)
        const force = weight / (dist ** falloff + 1e-12);
        return Vector.mul(dir, force);
    }

    // ─────────────────────────────────────────
    // REPULSOR: pushes agent away from source
    // Uses exponential decay (soft wall)
    // ─────────────────────────────────────────
    computeRepulsor(sourcePos, repulsorPos, strength, radius) {
        const diff    = Vector.sub(sourcePos, repulsorPos);
        const dist    = Vector.norm(diff) + 1e-12;
        const dir     = Vector.div(diff, dist);
        // Soft exponential wall: strongest at center, fades at radius
        const valence = strength * Math.exp(-dist / (radius + 1e-12));
        return Vector.mul(dir, valence);
    }

    // ─────────────────────────────────────────
    // DAMPER: applies velocity damping
    // Replaces friction if-else with continuous multiplier
    // ─────────────────────────────────────────
    applyDamper(velocity, dampFactor) {
        // dampFactor ∈ [0,1]: 0=stop, 1=no damping
        return Vector.mul(velocity, Math.max(0, Math.min(1, dampFactor)));
    }

    // ─────────────────────────────────────────
    // INTERFERENSI: superposition of two signals
    // Constructive (+) or Destructive (-) based on phase
    // ─────────────────────────────────────────
    interfereSuperpose(valA, valB, phaseShift = 0.0) {
        // phase ∈ [0, 2π], 0 = constructive, π = destructive
        return valA + valB * Math.cos(phaseShift);
    }

    // ─────────────────────────────────────────
    // TENSION FIELD: named persistent field
    // Accumulates tension from multiple sources
    // ─────────────────────────────────────────
    registerTensionField(name, initialValue = 0) {
        this._tensionFields[name] = initialValue;
    }

    updateTensionField(name, delta, decayRate = 0.95, maxVal = 1.0) {
        const prev = this._tensionFields[name] || 0;
        this._tensionFields[name] = Math.max(0,
            Math.min(maxVal, prev * decayRate + delta)
        );
        return this._tensionFields[name];
    }

    getTension(name) { return this._tensionFields[name] || 0; }

    // ─────────────────────────────────────────
    // SHADOW VARIABLE (Coast / Interference)
    // Prevents abrupt state transitions via competing intents
    // ─────────────────────────────────────────
    resolveShadowIntents(intentsMap, alpha = 2.8) {
        // intentsMap: { gas: 0.3, brake: 0.05, coast: 0.65 }
        const keys = Object.keys(intentsMap);
        const vals = Object.values(intentsMap);
        const rtd  = this._computeRTD(vals, alpha);
        const out  = {};
        keys.forEach((k, i) => { out[k] = rtd[i]; });
        return out;
    }

    // ─────────────────────────────────────────
    // POTENTIAL FIELD: combined attractor+repulsor net force
    // ─────────────────────────────────────────
    computePotentialField(agentPos, attractors = [], repulsors = []) {
        let net = Vector.zero();

        attractors.forEach(({ pos, weight, falloff = 1.0 }) => {
            net = Vector.add(net, this.computeAttractor(agentPos, pos, weight, falloff));
        });

        repulsors.forEach(({ pos, strength, radius }) => {
            net = Vector.add(net, this.computeRepulsor(agentPos, pos, strength, radius));
        });

        return net;
    }

    // ─────────────────────────────────────────
    // DAMPER FIELD: spatial zone-based damping
    // Register named damper zones
    // ─────────────────────────────────────────
    registerDampField(name, center, radius, strength) {
        this._dampFields[name] = { center, radius, strength };
    }

    getDampAtPos(pos) {
        let totalDamp = 1.0;
        Object.values(this._dampFields).forEach(({ center, radius, strength }) => {
            const dist    = Vector.dist(pos, center);
            const valence = Semantic.proximity(dist, radius);   // 1.0 at center
            totalDamp    *= (1 - strength * valence);           // multiplicative damping
        });
        return Math.max(0, totalDamp);
    }

    // ─────────────────────────────────────────
    // VORTEX: angular field for spiral/vortex
    // ─────────────────────────────────────────
    computeVortex(sourcePos, centerPos, strength, radius) {
        const diff    = Vector.sub(sourcePos, centerPos);
        const dist    = Vector.norm(diff) + 1e-12;
        const dir     = Vector.div(diff, dist);
        const perp    = [-dir[1], dir[0]];
        const valence = strength * Math.exp(-dist / (radius + 1e-12));
        return Vector.mul(perp, valence);
    }

    // ─────────────────────────────────────────
    // RING ATTRACTOR: topological constraint
    // ─────────────────────────────────────────
    computeRingAttractor(sourcePos, centerPos, radius, strength) {
        const diff  = Vector.sub(sourcePos, centerPos);
        const dist  = Vector.norm(diff) + 1e-12;
        const dir   = Vector.div(diff, dist);
        const error = dist - radius;
        return Vector.mul(dir, -strength * error);
    }

    // ─────────────────────────────────────────
    // DENSITY FIELD: local density estimation
    // ─────────────────────────────────────────
    computeDensity(pos, neighborPositions, radius) {
        let density = 0;
        neighborPositions.forEach(nPos => {
            const dist = Vector.dist(pos, nPos);
            density += Math.exp(-dist / (radius + 1e-12));
        });
        return density;
    }

    // ─────────────────────────────────────────
    // SHEAR GEOMETRY: force parallel to a plane
    // ─────────────────────────────────────────
    computeShear(sourcePos, centerPos, normalDir, strength) {
        const perp        = [-normalDir[1], normalDir[0]];
        const diff        = Vector.sub(sourcePos, centerPos);
        const distToPlane = Vector.dot(diff, normalDir);
        return Vector.mul(perp, strength * distToPlane);
    }

    // ─────────────────────────────────────────
    // NOISE GEOMETRY: deterministic pseudo-random force
    // ─────────────────────────────────────────
    computeNoiseForce(pos, scale = 1.0) {
        const x  = pos[0] * scale;
        const y  = pos[1] * scale;
        const nx = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const ny = Math.cos(x * 4.898 + y * 23.23) * 23421.631;
        return [nx - Math.floor(nx) - 0.5, ny - Math.floor(ny) - 0.5];
    }

    // ─────────────────────────────────────────
    // SYMMETRY BREAKING: QFT Stochastic Noise
    // ─────────────────────────────────────────
    computeSymmetryBreaking(temperature) {
        const u1 = Math.random() + 1e-12;
        const u2 = Math.random();
        const mag = temperature * Math.sqrt(-2.0 * Math.log(u1));
        const angle = 2.0 * Math.PI * u2;
        return [mag * Math.cos(angle), mag * Math.sin(angle)];
    }
}

export { TensionEngine };
