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
 * KERNEL SPATIOZ OS — communication.js
 * Module 6: Communication Interface
 * Inter-Agent Valence Transmission (Valence Bus)
 * ============================================================
 * Depends on: corekernel.js
 *
 * Model: Agents broadcast "valence packets" to a shared bus.
 * Recipients read the bus and integrate signals.
 * No direct agent-to-agent calls → pure relational broadcast.
 */
import { AgentixKernel, Vector, Semantic } from './corekernel.js';

class CommunicationInterface extends AgentixKernel {
    constructor(config) {
        super(config);
        this._bus       = [];       // global valence packet bus
        this._channels  = {};       // named channels { chName: [packets] }
        this._inbox     = {};       // per-agent inbox { agentId: [packets] }
        this._maxAge    = config?.comm?.maxAge || 30;  // ticks before packet expires
    }

    // ─────────────────────────────────────────
    // BROADCAST — agent emits a valence packet
    // packet: { senderId, channel, valence, pos, data, born }
    // ─────────────────────────────────────────
    broadcast(senderId, channel, valence, pos = null, data = {}) {
        const packet = {
            senderId,
            channel,
            valence: Math.max(-1, Math.min(1, valence)),
            pos:     pos ? [...pos] : null,
            data:    { ...data },
            born:    this.iteration,
        };
        this._bus.push(packet);

        if (!this._channels[channel]) this._channels[channel] = [];
        this._channels[channel].push(packet);
    }

    // ─────────────────────────────────────────
    // DIRECTED SEND — targeted agent inbox
    // ─────────────────────────────────────────
    send(senderId, targetId, valence, data = {}) {
        if (!this._inbox[targetId]) this._inbox[targetId] = [];
        this._inbox[targetId].push({
            senderId, valence, data, born: this.iteration
        });
    }

    // ─────────────────────────────────────────
    // READ INBOX — retrieve & clear messages for agent
    // ─────────────────────────────────────────
    readInbox(agentId) {
        const msgs = this._inbox[agentId] || [];
        this._inbox[agentId] = [];
        return msgs;
    }

    // ─────────────────────────────────────────
    // CHANNEL SCAN — read all packets on a channel
    // Filters by age (expired packets return 0 weight)
    // ─────────────────────────────────────────
    scanChannel(channel, readerPos = null, radius = Infinity) {
        return (this._channels[channel] || []).map(p => {
            const age      = this.iteration - p.born;
            const ageMask  = +(age <= this._maxAge);
            const freshness = Semantic.decay(1.0, 0.97 ** age);

            let spatialW = 1.0;
            if (readerPos && p.pos) {
                const dist = Vector.dist(readerPos, p.pos);
                spatialW   = Semantic.proximity(dist, radius);
            }

            return {
                ...p,
                weight: ageMask * freshness * spatialW,
            };
        }).filter(p => p.weight > 1e-4);
    }

    // ─────────────────────────────────────────
    // CHANNEL AGGREGATE — weighted sum of valences
    // ─────────────────────────────────────────
    aggregateChannel(channel, readerPos = null, radius = Infinity) {
        const packets = this.scanChannel(channel, readerPos, radius);
        if (packets.length === 0) return 0;
        const totalW  = packets.reduce((s, p) => s + p.weight, 0) + 1e-12;
        const sumVal  = packets.reduce((s, p) => s + p.valence * p.weight, 0);
        return sumVal / totalW;
    }

    // ─────────────────────────────────────────
    // CONSENSUS — majority valence direction on channel
    // Returns +1, -1, or 0
    // ─────────────────────────────────────────
    channelConsensus(channel) {
        const agg = this.aggregateChannel(channel);
        return Math.sign(agg);
    }

    // ─────────────────────────────────────────
    // PROXIMITY BROADCAST SCAN
    // Agent reads all nearby broadcasts regardless of channel
    // ─────────────────────────────────────────
    proximityScan(readerPos, radius) {
        return this._bus
            .filter(p => {
                const age     = this.iteration - p.born;
                const alive   = age <= this._maxAge;
                const inRange = !p.pos || Vector.dist(readerPos, p.pos) <= radius;
                return alive && inRange;
            })
            .map(p => ({
                ...p,
                dist: p.pos ? Vector.dist(readerPos, p.pos) : 0,
            }));
    }

    // ─────────────────────────────────────────
    // FLUSH — remove expired packets each tick
    // ─────────────────────────────────────────
    flushExpired() {
        const maxAge = this._maxAge;
        const now    = this.iteration;
        this._bus = this._bus.filter(p => (now - p.born) <= maxAge);
        Object.keys(this._channels).forEach(ch => {
            this._channels[ch] = this._channels[ch].filter(p => (now - p.born) <= maxAge);
        });
    }

    // ─────────────────────────────────────────
    // TOPOLOGY RELAY — relay packet to neighbors
    // Useful for mesh/chain propagation
    // ─────────────────────────────────────────
    relay(packet, relayerId, decay = 0.8) {
        this.broadcast(
            relayerId,
            packet.channel,
            packet.valence * decay,
            packet.pos,
            { ...packet.data, relayed: true }
        );
    }
}

export { CommunicationInterface };
