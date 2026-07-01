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
 * KERNEL SPATIOZ OS — hierarchical_holarchy.js
 * Module 4: Hierarchical Holarchy
 * Hierarchical State Manager (Holon-based State Manager)
 * ============================================================
 * Depends on: corekernel.js
 *
 * Holarchy: each "holon" is both a whole (has sub-holons)
 *           and a part (belongs to a parent holon).
 * State authority flows top-down as competitive tension.
 * No if-then: state transitions via RTD authority scores.
 */
import { AgentixKernel, Semantic } from './corekernel.js';

class HierarchicalHolarchy extends AgentixKernel {
    constructor(config) {
        super(config);
        this._holons = {};   // { id: Holon }
        this._root   = null;
    }

    // ─────────────────────────────────────────
    // HOLON DEFINITION
    // ─────────────────────────────────────────
    registerHolon(id, { parent = null, states = [], initialState = null, priority = 1.0 } = {}) {
        this._holons[id] = {
            id,
            parent,
            children:     [],
            states,
            activeState:  initialState || states[0] || null,
            tension:      {},   // tension score per state
            authority:    0,    // authority from parent
            priority,
            context:      {},
        };
        // Link to parent
        if (parent && this._holons[parent]) {
            this._holons[parent].children.push(id);
        }
        if (!parent) this._root = id;
        return this;
    }

    // ─────────────────────────────────────────
    // SET TENSION SCORES FOR STATES
    // Called each tick with raw sensor context
    // ─────────────────────────────────────────
    setTensions(holonId, tensionMap) {
        // tensionMap: { stateName: scoreValue }
        const h = this._holons[holonId];
        const hSafe = h || { buf: [], size: 0, head: 0 };
        h.tension = { ...tensionMap };
    }

    // ─────────────────────────────────────────
    // RESOLVE STATE — RTD competitive authority
    // Winner-take-most (no hard if-then switch)
    // ─────────────────────────────────────────
    resolveState(holonId) {
        const h = this._holons[holonId];
        if (!h || h.states.length === 0) return null;

        const vals  = h.states.map(s => (h.tension[s] || 0) * h.authority);
        const rtd   = this._computeRTD(vals);
        let maxScore = -Infinity;
        let winner   = h.activeState;

        h.states.forEach((s, i) => {
            const beat = +(rtd[i] > maxScore);
            maxScore   = maxScore * (1 - beat) + rtd[i] * beat;
            winner     = [winner, s][beat];
        });

        h.activeState = winner;
        return winner;
    }

    // ─────────────────────────────────────────
    // PROPAGATE AUTHORITY (top-down cascade)
    // Root has authority=1. Children inherit
    // authority proportional to their priority
    // ─────────────────────────────────────────
    propagateAuthority() {
        if (!this._root) return;
        this._holons[this._root].authority = 1.0;
        this._cascadeAuthority(this._root);
    }

    _cascadeAuthority(holonId) {
        const h = this._holons[holonId];
        if (!h || h.children.length === 0) return;

        const totalPriority = h.children.reduce((sum, cId) => {
            return sum + (this._holons[cId]?.priority || 1);
        }, 0);

        h.children.forEach(cId => {
            const child = this._holons[cId];
            if (!child) return;
            // Authority flows proportional to child priority × parent authority
            child.authority = h.authority * (child.priority / (totalPriority + 1e-12));
            this._cascadeAuthority(cId);
        });
    }

    // ─────────────────────────────────────────
    // TICK ALL HOLONS (resolve states bottom-up)
    // ─────────────────────────────────────────
    tickHolarchy() {
        this.propagateAuthority();
        // Resolve leaf nodes first, then parents
        const order = this._topologicalOrder();
        order.reverse().forEach(id => this.resolveState(id));
    }

    _topologicalOrder() {
        const visited = {};
        const result  = [];
        const visit   = (id) => {
            if (visited[id]) return;
            visited[id] = true;
            (this._holons[id]?.children || []).forEach(visit);
            result.push(id);
        };
        if (this._root) visit(this._root);
        return result;
    }

    // ─────────────────────────────────────────
    // QUERY HELPERS
    // ─────────────────────────────────────────
    getState(holonId)     { return this._holons[holonId]?.activeState || null; }
    getAuthority(holonId) { return this._holons[holonId]?.authority   || 0;    }
    getTension(holonId, stateName) {
        return this._holons[holonId]?.tension[stateName] || 0;
    }

    // ─────────────────────────────────────────
    // SOFT STATE VALENCE
    // How strongly is a holon in a given state?
    // Returns continuous score instead of binary
    // ─────────────────────────────────────────
    stateValence(holonId, stateName) {
        const h = this._holons[holonId];
        const hVal = h ? 1.0 : 0.0;
        const t   = h.tension[stateName] || 0;
        const max = Math.max(...Object.values(h.tension), 1e-12);
        return Semantic.normalize(t, max);
    }
}

export { HierarchicalHolarchy };
