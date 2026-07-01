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
 * KERNEL SPATIOZ OS — memory_condensation.js
 * Module 9: Memory Condensation
 * Equilibrium Pattern Storage / State Persistence
 * ============================================================
 * Depends on: corekernel.js
 *
 * Memory Condensation: instead of storing raw history,
 *   we condense patterns into weighted "engrams" —
 *   compressed attractors in valence space.
 * Retrieval: by similarity (dot-product / cosine match).
 * Persistence: engrams decay unless reinforced.
 */
import { AgentixKernel, Vector, Semantic } from './corekernel.js';

class MemoryCondensation extends AgentixKernel {
    constructor(config) {
        super(config);
        this._engrams   = {};   // { namespace: [{ key, vector, weight, born }] }
        this._snapshots = {};   // { slotName: stateObject } — hard state saves
        this._maxEngrams = config?.memory?.maxEngrams || 64;
    }

    // ─────────────────────────────────────────
    // ENGRAM — condensed pattern vector
    // vector: flat array of valences (feature vector)
    // weight: salience / reinforcement strength
    // ─────────────────────────────────────────
    condense(namespace, key, vector, weight = 1.0) {
        if (!this._engrams[namespace]) this._engrams[namespace] = [];

        // Check for existing engram with same key → reinforce
        const existing = this._engrams[namespace].find(e => e.key === key);
        if (existing) {
            // Hebbian-style update: blend toward new vector
            existing.vector = existing.vector.map((v, i) =>
                v * 0.8 + (vector[i] || 0) * 0.2
            );
            existing.weight = Math.min(1.0, existing.weight + weight * 0.1);
            existing.born   = this.iteration;
            return;
        }

        this._engrams[namespace].push({
            key,
            vector: [...vector],
            weight: Math.min(1.0, weight),
            born:   this.iteration,
        });

        // Prune weakest if over capacity
        if (this._engrams[namespace].length > this._maxEngrams) {
            this._engrams[namespace].sort((a, b) => a.weight - b.weight);
            this._engrams[namespace].shift();
        }
    }

    // ─────────────────────────────────────────
    // RECALL — retrieve engrams by cosine similarity
    // Returns sorted matches: [{ key, similarity, weight }]
    // ─────────────────────────────────────────
    recall(namespace, queryVector, topK = 3) {
        const engrams = this._engrams[namespace] || [];
        return engrams
            .map(e => ({
                key:        e.key,
                weight:     e.weight,
                similarity: this._cosineSim(queryVector, e.vector) * e.weight,
                engram:     e,
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
    }

    _cosineSim(a, b) {
        const dot  = a.reduce((s, v, i) => s + v * (b[i] || 0), 0);
        const normA = Math.sqrt(a.reduce((s, v) => s + v*v, 0)) + 1e-12;
        const normB = Math.sqrt(b.reduce((s, v) => s + v*v, 0)) + 1e-12;
        return dot / (normA * normB);
    }

    // ─────────────────────────────────────────
    // BEST MATCH VALENCE
    // How well does current state match any engram?
    // ─────────────────────────────────────────
    bestMatchValence(namespace, queryVector) {
        const matches = this.recall(namespace, queryVector, 1);
        return matches.length > 0 ? Math.max(0, matches[0].similarity) : 0;
    }

    // ─────────────────────────────────────────
    // DECAY — weaken engrams over time
    // Engrams not reinforced fade and are pruned
    // ─────────────────────────────────────────
    decayEngrams(namespace, decayRate = 0.995, minWeight = 0.05) {
        const engrams = this._engrams[namespace];
        if (!engrams) return;
        this._engrams[namespace] = engrams
            .map(e => ({ ...e, weight: e.weight * decayRate }))
            .filter(e => e.weight >= minWeight);
    }

    decayAll(decayRate = 0.995) {
        Object.keys(this._engrams).forEach(ns => this.decayEngrams(ns, decayRate));
    }

    // ─────────────────────────────────────────
    // SNAPSHOT — hard save/load of state objects
    // For resuming simulations between sessions
    // ─────────────────────────────────────────
    saveSnapshot(slotName, stateObject) {
        this._snapshots[slotName] = JSON.parse(JSON.stringify(stateObject));
    }

    loadSnapshot(slotName) {
        return this._snapshots[slotName] ? JSON.parse(JSON.stringify(this._snapshots[slotName])) : null;
    }

    hasSnapshot(slotName) { return slotName in this._snapshots; }

    listSnapshots() { return Object.keys(this._snapshots); }

    // ─────────────────────────────────────────
    // EQUILIBRIUM DETECTOR
    // Is the system near a known stable engram?
    // ─────────────────────────────────────────
    isEquilibrium(namespace, queryVector, threshold = 0.85) {
        return +(this.bestMatchValence(namespace, queryVector) >= threshold);
    }

    // ─────────────────────────────────────────
    // MEMORY STATS
    // ─────────────────────────────────────────
    stats(namespace) {
        const engrams = this._engrams[namespace] || [];
        return {
            count:     engrams.length,
            avgWeight: engrams.reduce((s, e) => s + e.weight, 0) / (engrams.length || 1),
            snapshots: this.listSnapshots().length,
        };
    }
}

export { MemoryCondensation };
