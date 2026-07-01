/*
 * ----------------------------------------------------------------------------
 * Spatioz OS - Quantum Continuous Engine
 * Copyright (C) 2026 Spatioz Project
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
 * KERNEL SPATIOZ OS — intent_anchoring.js
 * Module 10: Intent Anchoring
 * Translating External Intent into Topological Anchors
 * ============================================================
 * Depends on: corekernel.js
 *
 * Intent Anchoring: translates high-level external intent
 *   (e.g. "score a goal", "defend zone", "follow leader")
 *   into persistent topological anchors — valence targets
 *   that continuously pull agent behavior.
 *
 * No if-then: intents are weighted attractors, not commands.
 * Multiple intents coexist and compete via RTD.
 */
import { AgentixKernel, Vector, Semantic } from './corekernel.js';

class IntentAnchoring extends AgentixKernel {
    constructor(config) {
        super(config);
        this._anchors    = {};   // { agentId: { intentName: AnchorDef } }
        this._globalGoals = {};  // system-wide shared goal anchors
    }

    // ─────────────────────────────────────────
    // ANCHOR DEFINITION
    // An anchor is an intent with:
    //   - weight: how strongly it pulls [0, 1]
    //   - target: optional spatial pos [x, y]
    //   - valenceTarget: desired context valence
    //   - decay: rate at which intent fades if not refreshed
    // ─────────────────────────────────────────
    setAnchor(agentId, intentName, {
        weight       = 1.0,
        target       = null,
        valenceTarget = null,
        decay        = 1.0,    // 1.0 = no decay, <1 = fades each tick
        ttl          = Infinity // time-to-live in ticks
    } = {}) {
        if (!this._anchors[agentId]) this._anchors[agentId] = {};
        this._anchors[agentId][intentName] = {
            weight:        Math.max(0, Math.min(1, weight)),
            target:        target ? [...target] : null,
            valenceTarget,
            decay,
            born:          this.iteration,
            ttl,
        };
    }

    clearAnchor(agentId, intentName) {
        if (this._anchors[agentId]) delete this._anchors[agentId][intentName];
    }

    clearAllAnchors(agentId) { this._anchors[agentId] = {}; }

    // ─────────────────────────────────────────
    // RESOLVE ANCHORS — get active anchors for agent
    // Expired (TTL) or decayed anchors are removed
    // ─────────────────────────────────────────
    resolveAnchors(agentId) {
        const anchors = this._anchors[agentId];
        if (!anchors) return {};

        const now = this.iteration;
        const active = {};

        Object.entries(anchors).forEach(([name, a]) => {
            const age       = now - a.born;
            const isAlive   = +(age < a.ttl);
            // Decay weight each tick
            a.weight        = Math.max(0, a.weight * (a.decay ** 1));
            const isValid   = +(a.weight > 1e-4) * isAlive;
            // Array dispatch: keep if valid, skip if not
            active[name]    = isValid ? a : undefined;
        });

        // Remove dead anchors
        Object.keys(active).forEach(name => {
            if (!active[name]) { delete anchors[name]; delete active[name]; }
        });

        return active;
    }

    // ─────────────────────────────────────────
    // INTENT FORCE VECTOR
    // Translates spatial anchors into attraction vector
    // Competes via RTD to produce single net direction
    // ─────────────────────────────────────────
    intentForce(agentId, agentPos) {
        const active = this.resolveAnchors(agentId);
        let net = Vector.zero();

        Object.values(active).forEach(a => {
            if (!a || !a.target) return;
            const diff  = Vector.sub(a.target, agentPos);
            const dist  = Vector.norm(diff) + 1e-12;
            const dir   = Vector.div(diff, dist);
            net = Vector.add(net, Vector.mul(dir, a.weight));
        });

        return net;
    }

    // ─────────────────────────────────────────
    // VALENCE PULL — how much does agent deviate
    // from all active valence targets?
    // Returns [0,1]: 0 = on target, 1 = fully off
    // ─────────────────────────────────────────
    valencePull(agentId, context) {
        const active = this.resolveAnchors(agentId);
        const entries = Object.values(active).filter(a => a && a.valenceTarget !== null);
        if (entries.length === 0) return 0;

        const pulls = entries.map(a => {
            const field = a.valenceTarget.field;
            const tgt   = a.valenceTarget.value;
            const curr  = context[field] || 0;
            return Math.abs(curr - tgt) * a.weight;
        });

        return Math.min(1, pulls.reduce((s, v) => s + v, 0) / entries.length);
    }

    // ─────────────────────────────────────────
    // GLOBAL GOAL — system-wide shared anchor
    // All agents without a specific anchor inherit this
    // ─────────────────────────────────────────
    setGlobalGoal(goalName, target, weight = 0.5) {
        this._globalGoals[goalName] = { target: [...target], weight };
    }

    globalIntentForce(agentPos) {
        let net = Vector.zero();
        Object.values(this._globalGoals).forEach(g => {
            const diff  = Vector.sub(g.target, agentPos);
            const dist  = Vector.norm(diff) + 1e-12;
            const dir   = Vector.div(diff, dist);
            net = Vector.add(net, Vector.mul(dir, g.weight));
        });
        return net;
    }

    // ─────────────────────────────────────────
    // COMPOSITE FORCE — agent anchors + global goals
    // Blended by local weight dominance
    // ─────────────────────────────────────────
    compositeForce(agentId, agentPos, globalBlend = 0.3, attention = 1.0, temperature = 0.0, lSpatial = 1.0, lTemporal = 1.0) {
        const localF  = this.intentForce(agentId, agentPos);
        const globalF = this.globalIntentForce(agentPos);
        
        const hBase = Vector.add(
            Vector.mul(localF,  1 - globalBlend),
            Vector.mul(globalF, globalBlend)
        );
        
        const u1 = Math.random() + 1e-12;
        const u2 = Math.random();
        const mag = temperature * Math.sqrt(-2.0 * Math.log(u1));
        const angle = 2.0 * Math.PI * u2;
        const vStochastic = [mag * Math.cos(angle), mag * Math.sin(angle)];
        
        const term1 = Vector.mul(hBase, attention);
        const term2 = Vector.mul(vStochastic, lSpatial);
        return Vector.mul(Vector.add(term1, term2), lTemporal);
    }

    // ─────────────────────────────────────────
    // ANCHOR SUMMARY — inspect active intents
    // ─────────────────────────────────────────
    anchorSummary(agentId) {
        const active = this.resolveAnchors(agentId);
        return Object.entries(active).map(([name, a]) => ({
            intent: name,
            weight: a?.weight?.toFixed(3),
            hasTarget: !!a?.target,
        }));
    }
}

export { IntentAnchoring };
