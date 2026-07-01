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
 * KERNEL SPATIOZ OS — compliance_healing.js
 * Module 7: Compliance & Self-Healing
 * Role Compliance · Anomaly Isolation · System Immunity
 * ============================================================
 * Depends on: corekernel.js
 *
 * Compliance: each agent has a "role contract" — a set of
 *   expected valence ranges. Deviation triggers a penalty.
 * Self-Healing: anomalies are soft-isolated via tension damping.
 *   No hard kill switches — anomalous agents lose authority.
 * Immunity: system-level health score gates collective actions.
 */
import { AgentixKernel, Semantic } from './corekernel.js';

class ComplianceHealing extends AgentixKernel {
    constructor(config) {
        super(config);
        this._contracts  = {};   // { agentId: { field: [min, max], ... } }
        this._health     = {};   // { agentId: healthScore ∈ [0,1] }
        this._immunity   = 1.0; // system-wide immunity ∈ [0,1]
        this._anomalyLog = [];   // log of anomaly events
    }

    // ─────────────────────────────────────────
    // ROLE CONTRACT — define expected ranges
    // Fields are context keys; [min, max] is the valid valence band
    // ─────────────────────────────────────────
    registerContract(agentId, contract) {
        // contract: { speed: [0, 1], energy: [0.2, 1], ... }
        this._contracts[agentId] = { ...contract };
        this._health[agentId]    = 1.0;
    }

    // ─────────────────────────────────────────
    // COMPLIANCE SCORE
    // 1.0 = fully compliant, 0.0 = fully anomalous
    // Continuous, no if-then
    // ─────────────────────────────────────────
    complianceScore(agentId, context) {
        const contract = this._contracts[agentId];
        const contractExists = contract ? 1.0 : 0.0;

        const fields = Object.entries(contract);
        if (fields.length === 0) return 1.0;

        const scores = fields.map(([field, [min, max]]) => {
            const val    = context[field] || 0;
            const range  = max - min + 1e-12;
            // Distance from valid band → 0 = in-band, >0 = out
            const excess = Math.max(0, min - val) + Math.max(0, val - max);
            return Math.max(0, 1 - excess / range);
        });

        return scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // ─────────────────────────────────────────
    // HEALTH UPDATE — exponential moving average
    // Integrates compliance over time
    // ─────────────────────────────────────────
    updateHealth(agentId, context, decayGood = 0.05, decayBad = 0.2) {
        const compliance = this.complianceScore(agentId, context);
        const current    = this._health[agentId] || 1.0;

        // Separate decay rates for recovering vs degrading
        const isGood   = +(compliance > 0.5);
        const decay    = isGood * decayGood + (1 - isGood) * decayBad;
        const newHealth = current + decay * (compliance - current);

        this._health[agentId] = Math.max(0, Math.min(1, newHealth));

        // Log anomaly if health drops below threshold
        const isAnomalous = +(newHealth < 0.3);
        const entry = { tick: this.iteration, agentId, health: newHealth, compliance };
        this._anomalyLog.splice(0, 0, ...[entry].slice(0, isAnomalous));

        return newHealth;
    }

    getHealth(agentId) { return this._health[agentId] ?? 1.0; }

    // ─────────────────────────────────────────
    // AUTHORITY MASK — agents with low health
    // get reduced authority (soft isolation)
    // ─────────────────────────────────────────
    authorityMask(agentId, threshold = 0.3, sharpness = 10) {
        const h = this.getHealth(agentId);
        // Sigmoid: full authority above threshold, fades below
        return Semantic.softThresh(h, threshold, sharpness);
    }

    // ─────────────────────────────────────────
    // QUARANTINE ZONE — agents in quarantine
    // lose all outbound authority but still exist
    // ─────────────────────────────────────────
    isQuarantined(agentId, threshold = 0.15) {
        return +(this.getHealth(agentId) < threshold);
    }

    // ─────────────────────────────────────────
    // SYSTEM IMMUNITY — collective health
    // Average health across all registered agents
    // ─────────────────────────────────────────
    updateImmunity() {
        const vals = Object.values(this._health);
        if (vals.length === 0) { this._immunity = 1.0; return 1.0; }
        this._immunity = vals.reduce((a, b) => a + b, 0) / vals.length;
        return this._immunity;
    }

    getImmunity() { return this._immunity; }

    // ─────────────────────────────────────────
    // RECOVERY PULSE — boost health of agents
    // triggered by high immunity (herd recovery)
    // ─────────────────────────────────────────
    recoveryPulse(boostAmount = 0.05) {
        const immunityBonus = this._immunity * boostAmount;
        Object.keys(this._health).forEach(id => {
            this._health[id] = Math.min(1.0, this._health[id] + immunityBonus);
        });
    }

    // ─────────────────────────────────────────
    // ANOMALY LOG — read & trim
    // ─────────────────────────────────────────
    getAnomalyLog(last = 10) {
        return this._anomalyLog.slice(0, last);
    }

    clearAnomalyLog() { this._anomalyLog = []; }
}

export { ComplianceHealing };
