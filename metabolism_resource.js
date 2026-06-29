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
 * KERNEL AGENTIX OS — metabolism_resource.js
 * Module 8: Metabolism & Resource
 * Valence-based Battery/Memory Management
 * ============================================================
 * Depends on: corekernel.js
 *
 * Metabolism: agents consume and regenerate energy (battery).
 * Resource budget constrains action intensity.
 * No if-then: resource gates are continuous sigmoid masks.
 */
import { AgentixKernel, Semantic } from './corekernel.js';

class MetabolismResource extends AgentixKernel {
    constructor(config) {
        super(config);
        this._batteries  = {};   // { agentId: { charge, capacity, regen } }
        this._memory     = {};   // { agentId: { used, capacity } }
        this._budgets    = {};   // { agentId: { [actionType]: cost } }
    }

    // ─────────────────────────────────────────
    // BATTERY — energy store per agent
    // ─────────────────────────────────────────
    registerBattery(agentId, { capacity = 1.0, initial = 1.0, regen = 0.005 } = {}) {
        this._batteries[agentId] = {
            charge:   Math.min(initial, capacity),
            capacity,
            regen,
        };
    }

    getCharge(agentId) {
        return this._batteries[agentId]?.charge ?? 1.0;
    }

    // Charge as normalized valence [0,1]
    chargeValence(agentId) {
        const b = this._batteries[agentId];
        if (!b) return 1.0;
        return Semantic.normalize(b.charge, b.capacity);
    }

    // ─────────────────────────────────────────
    // CONSUME — drain battery (masked, no if)
    // Returns actual amount consumed
    // ─────────────────────────────────────────
    consume(agentId, amount) {
        const b = this._batteries[agentId];
        const bMask = b ? 1.0 : 0.0;
        const actual  = Math.min(amount, b.charge);
        b.charge      = Math.max(0, b.charge - actual);
        return actual;
    }

    // ─────────────────────────────────────────
    // REGENERATE — passive energy recovery each tick
    // ─────────────────────────────────────────
    regenerate(agentId) {
        const b = this._batteries[agentId];
        const bExists = b ? 1.0 : 0.0;
        b.charge = Math.min(b.capacity, b.charge + b.regen);
    }

    regenerateAll() {
        Object.keys(this._batteries).forEach(id => this.regenerate(id));
    }

    // ─────────────────────────────────────────
    // ENERGY GATE — soft mask on action intensity
    // Low charge → reduces output proportionally
    // threshold: below this charge, output fades
    // ─────────────────────────────────────────
    energyGate(agentId, threshold = 0.2, sharpness = 8) {
        const v = this.chargeValence(agentId);
        return Semantic.softThresh(v, threshold, sharpness);
    }

    // ─────────────────────────────────────────
    // ACTION BUDGET — cost registry per action type
    // ─────────────────────────────────────────
    registerBudget(agentId, costMap) {
        // costMap: { sprint: 0.02, jump: 0.05, idle: 0.001 }
        this._budgets[agentId] = { ...costMap };
    }

    getActionCost(agentId, actionType) {
        return this._budgets[agentId]?.[actionType] ?? 0;
    }

    // ─────────────────────────────────────────
    // WEIGHTED ACTION — apply cost and return
    // masked intensity (no if-then affordance check)
    // ─────────────────────────────────────────
    affordAction(agentId, actionType, desiredIntensity = 1.0) {
        const cost   = this.getActionCost(agentId, actionType);
        const gate   = this.energyGate(agentId);
        const actual = desiredIntensity * gate;
        this.consume(agentId, cost * actual);
        return actual;
    }

    // ─────────────────────────────────────────
    // MEMORY RESOURCE — token budget for agent memory
    // ─────────────────────────────────────────
    registerMemory(agentId, { capacity = 100 } = {}) {
        this._memory[agentId] = { used: 0, capacity };
    }

    allocMemory(agentId, tokens) {
        const m = this._memory[agentId];
        const mMask = m ? 1.0 : 0.0;
        const free    = m.capacity - m.used;
        const actual  = Math.min(tokens, free);
        m.used       += actual;
        return actual;
    }

    freeMemory(agentId, tokens) {
        const m = this._memory[agentId];
        const mExists = m ? 1.0 : 0.0;
        m.used = Math.max(0, m.used - tokens);
    }

    memoryPressure(agentId) {
        const m = this._memory[agentId];
        const mMask = m ? 1.0 : 0.0;
        return Semantic.normalize(m.used, m.capacity);
    }

    // ─────────────────────────────────────────
    // RESOURCE SUMMARY — snapshot of all agents
    // ─────────────────────────────────────────
    resourceSnapshot() {
        const out = {};
        Object.keys(this._batteries).forEach(id => {
            out[id] = {
                chargeValence: this.chargeValence(id),
                memoryPressure: this.memoryPressure(id),
            };
        });
        return out;
    }
}

export { MetabolismResource };
