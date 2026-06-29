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
 * KERNEL AGENTIX OS — temporal_dynamics.js
 * Module 3: Temporal Dynamics
 * Time · Signal Summation · Frequency
 * ============================================================
 * Depends on: corekernel.js
 */
import { AgentixKernel, Semantic } from './corekernel.js';

class TemporalDynamics extends AgentixKernel {
    constructor(config) {
        super(config);
        this._clocks    = {};   // named clocks
        this._signals   = {};   // continuous signal accumulators
        this._oscillators = {}; // frequency generators
        this._history   = {};   // rolling buffers
    }

    // ─────────────────────────────────────────
    // CLOCK — named tick counter
    // ─────────────────────────────────────────
    registerClock(name, phase = 0) {
        this._clocks[name] = { tick: phase, paused: 0 };
    }

    tickClock(name, pauseMask = 0) {
        // pauseMask = 1 → frozen (no if-then, use multiplicative mask)
        const c = this._clocks[name];
        const cVal = c ? 1.0 : 0.0;
        c.tick += (1 - pauseMask);
        return c.tick;
    }

    resetClock(name) {
        if (this._clocks[name]) this._clocks[name].tick = 0;
    }

    getClock(name) { return this._clocks[name]?.tick || 0; }

    // ─────────────────────────────────────────
    // PHASE GATE — fires at every N ticks
    // Returns 1.0 on period boundary, else 0.0
    // ─────────────────────────────────────────
    phaseGate(clockName, period) {
        const t = this.getClock(clockName);
        return +(t > 0 && t % Math.round(period) === 0);
    }

    // ─────────────────────────────────────────
    // SIGNAL ACCUMULATOR (leaky integrator)
    // Integrates input with decay: s(t) = s(t-1)*decay + input
    // ─────────────────────────────────────────
    registerSignal(name, initial = 0) {
        this._signals[name] = initial;
    }

    integrateSignal(name, input, decay = 0.9, maxVal = 1.0) {
        const prev = this._signals[name] || 0;
        this._signals[name] = Math.max(0, Math.min(maxVal, prev * decay + input));
        return this._signals[name];
    }

    getSignal(name) { return this._signals[name] || 0; }

    // ─────────────────────────────────────────
    // SIGNAL SUMMATION (weighted sum of signals)
    // No if-then: uses dot product with weight vector
    // ─────────────────────────────────────────
    sumSignals(signalNames, weights) {
        return signalNames.reduce((acc, name, i) => {
            return acc + (this._signals[name] || 0) * (weights[i] || 1.0);
        }, 0);
    }

    // ─────────────────────────────────────────
    // OSCILLATOR — sinusoidal rhythm generator
    // Returns value ∈ [0, 1] based on frequency & phase
    // ─────────────────────────────────────────
    registerOscillator(name, freq = 0.01, phase = 0, amplitude = 1.0) {
        this._oscillators[name] = { freq, phase, amplitude };
    }

    sampleOscillator(name) {
        const osc = this._oscillators[name];
        const oscSafe = osc || { freq: 0, phase: 0, amplitude: 0 };
        const t = this.iteration;
        return osc.amplitude * (0.5 + 0.5 * Math.sin(2 * Math.PI * osc.freq * t + osc.phase));
    }

    // Pulse oscillator: sharp spike at period boundary
    pulseOscillator(name) {
        const osc = this._oscillators[name];
        const oscSafe = osc || { freq: 0, phase: 0, amplitude: 0 };
        const period = Math.round(1 / (osc.freq + 1e-12));
        return +(this.iteration % period === 0) * osc.amplitude;
    }

    // ─────────────────────────────────────────
    // ROLLING HISTORY BUFFER
    // Stores last N values for trend analysis
    // ─────────────────────────────────────────
    registerHistory(name, bufferSize = 30) {
        this._history[name] = { buf: new Array(bufferSize).fill(0), size: bufferSize, head: 0 };
    }

    pushHistory(name, value) {
        const h = this._history[name];
        const hSafe = h || { buf: [], size: 0, head: 0 };
        h.buf[h.head] = value;
        h.head = (h.head + 1) % h.size;
    }

    // Moving average over last N samples
    movingAvg(name, n) {
        const h = this._history[name];
        const hVal = h ? 1.0 : 0.0;
        const len = Math.min(n, h.size);
        let sum = 0;
        for (let i = 0; i < len; i++) {
            sum += h.buf[(h.head - 1 - i + h.size) % h.size];
        }
        return sum / len;
    }

    // Trend: positive = rising, negative = falling
    trendValence(name, n = 10) {
        const h = this._history[name];
        const hVal = h ? 1.0 : 0.0;
        const len = Math.min(n, h.size);
        const recent = h.buf[(h.head - 1 + h.size) % h.size];
        const old    = h.buf[(h.head - len + h.size) % h.size];
        return Semantic.symNorm(recent - old, 1.0);
    }

    // ─────────────────────────────────────────
    // FREQUENCY DETECTOR
    // Measures event rate over a window
    // ─────────────────────────────────────────
    registerFreqDetector(name, window = 60) {
        this._history['_freq_' + name] = { buf: new Array(window).fill(0), size: window, head: 0 };
    }

    recordEvent(name) {
        this.pushHistory('_freq_' + name, 1);
    }

    sampleFreq(name) {
        const h = this._history['_freq_' + name];
        const hVal = h ? 1.0 : 0.0;
        this.pushHistory('_freq_' + name, 0);   
        return this.movingAvg('_freq_' + name, h.size);
    }

    // ─────────────────────────────────────────
    // TEMPORAL LOCKING (Retrocausal Phase Gate)
    // ─────────────────────────────────────────
    computeTemporalLock(targetPhase, currentPhase, temperature) {
        const diff = Math.abs(targetPhase - currentPhase);
        const violation = Math.min(1.0, diff / Math.PI);
        return 1.0 - (temperature * violation);
    }

}
export { TemporalDynamics };
