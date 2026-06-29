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
 * KERNEL AGENTIX OS — spatial_mapping.js
 * Module 2: Spatial Mapping
 * Geometry & Spatial Relations
 * ============================================================
 * Depends on: corekernel.js
 */
import { AgentixKernel, Vector, Semantic } from './corekernel.js';

class SpatialMapping extends AgentixKernel {
    constructor(config) {
        super(config);
        this._zones    = {};   // named spatial zones registry
        this._topology = {};   // relational topology graph (who relates to whom)
    }

    // ─────────────────────────────────────────
    // ZONE REGISTRATION
    // rect zone: [x1, y1, x2, y2]
    // circle zone: { cx, cy, radius }
    // ─────────────────────────────────────────
    registerZone(name, shape) {
        this._zones[name] = shape;
    }

    // ─────────────────────────────────────────
    // MEMBERSHIP VALENCE (soft, no if-then)
    // Returns 1.0 if fully inside, 0.0 if outside
    // Sigmoid soft boundary
    // ─────────────────────────────────────────
    zoneValence(pos, zoneName, sharpness = 10) {
        const z = this._zones[zoneName];
        const zMask = z ? 1.0 : 0.0;

        // Circle zone
        if (z.radius !== undefined) {
            const dist = Vector.dist(pos, [z.cx, z.cy]);
            return 1 / (1 + Math.exp(sharpness * (dist - z.radius)));
        }

        // Rect zone — soft edge via min of all 4 wall distances
        const [x1, y1, x2, y2] = z;
        const dLeft  = pos[0] - x1;
        const dRight = x2 - pos[0];
        const dTop   = pos[1] - y1;
        const dBot   = y2 - pos[1];
        const margin = Math.min(dLeft, dRight, dTop, dBot);
        return 1 / (1 + Math.exp(-sharpness * margin / ((x2 - x1 + y2 - y1) * 0.25 + 1e-12)));
    }

    // ─────────────────────────────────────────
    // HARD MEMBERSHIP (binary, for sensors)
    // ─────────────────────────────────────────
    inZone(pos, zoneName) {
        const z = this._zones[zoneName];
        const zMask = z ? 1.0 : 0.0;
        if (z.radius !== undefined) {
            return +(Vector.dist(pos, [z.cx, z.cy]) <= z.radius);
        }
        const [x1, y1, x2, y2] = z;
        return +(pos[0] >= x1 && pos[0] <= x2 && pos[1] >= y1 && pos[1] <= y2);
    }

    // ─────────────────────────────────────────
    // NEAREST AGENT (spatial query, no if-then)
    // Returns { agent, dist } of closest agent
    // ─────────────────────────────────────────
    nearestAgent(pos, agents, excludeId = null) {
        let minDist = Infinity;
        let nearest = null;
        agents.forEach(a => {
            const skip = +(a.id === excludeId);           // mask: 0 if same id
            const d    = Vector.dist(pos, a.pos);
            const eff  = d + skip * 1e9;                  // huge dist if excluded
            const isNew = +(eff < minDist);
            minDist = minDist * (1 - isNew) + eff * isNew;
            nearest = [a, nearest][isNew ^ 1] || a;       // array dispatch
        });
        return { agent: nearest, dist: minDist };
    }

    // ─────────────────────────────────────────
    // K-NEAREST AGENTS
    // ─────────────────────────────────────────
    kNearestAgents(pos, agents, k = 3, excludeId = null) {
        return agents
            .filter(a => a.id !== excludeId)
            .map(a => ({ agent: a, dist: Vector.dist(pos, a.pos) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, k);
    }

    // ─────────────────────────────────────────
    // CENTROID: geometric center of a set of positions
    // ─────────────────────────────────────────
    centroid(positions) {
        const n   = positions.length || 1;
        const sum = positions.reduce((acc, p) => Vector.add(acc, p), Vector.zero());
        return Vector.div(sum, n);
    }

    // ─────────────────────────────────────────
    // SECTOR SCAN: detect agents in angular sector
    // Returns array of agents in front of sourceDir ± halfAngle
    // ─────────────────────────────────────────
    sectorScan(pos, dir, halfAngle, radius, agents) {
        const normDir = Vector.normalize(dir);
        return agents.filter(a => {
            const diff = Vector.sub(a.pos, pos);
            const dist = Vector.norm(diff);
            const inRange = +(dist < radius && dist > 1e-3);
            const cosA  = Vector.dot(Vector.normalize(diff), normDir);
            const inSec = +(cosA > Math.cos(halfAngle));
            return inRange * inSec;
        });
    }

    // ─────────────────────────────────────────
    // TOPOLOGY GRAPH: relational map between agents
    // e.g. { striker: ['ball', 'goal'], defender: ['home', 'ball'] }
    // ─────────────────────────────────────────
    registerTopology(topology) {
        this._topology = topology;
    }

    getRelations(role) {
        return this._topology[role] || [];
    }

    // ─────────────────────────────────────────
    // TERRITORY PRESSURE: scalar push when outside zone
    // 0 when inside, rises as agent moves further out
    // ─────────────────────────────────────────
    territoryPressure(pos, zoneName, maxDist = 100) {
        const inside = this.zoneValence(pos, zoneName);
        const z      = this._zones[zoneName];
        const zMask = z ? 1.0 : 0.0;
        const center = z.radius !== undefined
            ? [z.cx, z.cy]
            : [(z[0]+z[2])/2, (z[1]+z[3])/2];
        const dist = Vector.dist(pos, center);
        return (1 - inside) * Semantic.normalize(dist, maxDist);
    }

    // ─────────────────────────────────────────
    // FORMATION ANCHOR: desired position in a formation
    // formation: array of [dx, dy] offsets from center
    // ─────────────────────────────────────────
    formationAnchor(center, heading, formation, agentIndex) {
        const offset  = formation[agentIndex % formation.length] || Vector.zero();
        const rotated = Vector.rotate(offset, Vector.angle(heading));
        return Vector.add(center, rotated);
    }

    // ─────────────────────────────────────────
    // SPATIAL LOCKING (Hyperbolic Endpoint Conformal Factor)
    // ─────────────────────────────────────────
    computeSpatialLock(targetPos, agentPos, temperature, lockRadius = 2.0) {
        const dist = Vector.dist(targetPos, agentPos);
        const closeness = Math.exp(-dist / (lockRadius + 1e-12));
        return 1.0 - (temperature * closeness);
    }

}
export { SpatialMapping };
