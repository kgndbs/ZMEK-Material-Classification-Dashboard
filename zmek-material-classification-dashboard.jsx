import React, { useState, useMemo } from "react";

/* ----------------------------------------------------------------
   ZMEK Material Classification Dashboard
   Zone -> Metric -> Threshold -> Decision

   A working prototype of the Stage 3/Stage 4 data architecture
   described in the Wood Hybrids proposal. This is NOT a trained
   machine learning model -- with two samples that would be a weak
   claim. It is a rule-based classification scaffold built to scale:
   each new sample becomes one more time-stamped row in the same
   structure, ready for real ML once sample count grows.
------------------------------------------------------------------- */

// ---- Sample data: two bioplastic membrane recipes, five time stamps ----
// Derived from visual inspection of cast photographs (tray references:
// V1 ~30x40cm, V2 ~22cm corner reference). These are estimated, not
// instrument-measured -- a future ESP32-CAM + sensor pipeline (see
// Stage 3 of the proposal) would replace this with precise readings.
const RAW_SAMPLES = [
  {
    id: "starch",
    label: "Starch-based membrane",
    binder: "Corn starch + glycerin",
    fibre: "Corn silk fibre",
    note: "Fragments into thin, curled strands from the earliest observed point rather than fragmenting over time.",
    points: [
      { t: "T0", shrinkage: 8, fragmentCount: 9, crackLength: 38, swellingArea: 3, moisture: 86, temp: 23.0 },
      { t: "T1", shrinkage: 12, fragmentCount: 10, crackLength: 41, swellingArea: 3, moisture: 79, temp: 23.3 },
      { t: "T3", shrinkage: 17, fragmentCount: 11, crackLength: 44, swellingArea: 2, moisture: 66, temp: 23.6 },
      { t: "T12", shrinkage: 26, fragmentCount: 12, crackLength: 49, swellingArea: 2, moisture: 38, temp: 23.4 },
      { t: "T24", shrinkage: 34, fragmentCount: 14, crackLength: 55, swellingArea: 1, moisture: 14, temp: 23.0 },
    ],
  },
  {
    id: "alginate",
    label: "Alginate-based membrane",
    binder: "Sodium alginate + CaCl₂ crosslink",
    fibre: "Mixed fibrous particulate",
    note: "Holds as a single dense, bubbled sheet; fragmentation only appears at the latest time stamp, at the edges.",
    points: [
      { t: "T0", shrinkage: 0, fragmentCount: 1, crackLength: 0, swellingArea: 14, moisture: 93, temp: 23.0 },
      { t: "T1", shrinkage: 2, fragmentCount: 1, crackLength: 0, swellingArea: 13, moisture: 90, temp: 23.2 },
      { t: "T3", shrinkage: 5, fragmentCount: 1, crackLength: 0, swellingArea: 10, moisture: 84, temp: 23.5 },
      { t: "T12", shrinkage: 11, fragmentCount: 1, crackLength: 2, swellingArea: 6, moisture: 61, temp: 23.6 },
      { t: "T24", shrinkage: 19, fragmentCount: 2, crackLength: 7, swellingArea: 3, moisture: 35, temp: 23.1 },
    ],
  },
];

// ---- ZMEK stage definitions ----
const STAGES = [
  { key: "zone", label: "Zone", sub: "01" },
  { key: "metric", label: "Metric", sub: "02" },
  { key: "threshold", label: "Threshold", sub: "03" },
  { key: "decision", label: "Decision", sub: "04" },
];

// Derive a composite "deformation index" per point: how far the sample
// has moved from its rest state, normalized 0-1, used to find the
// threshold crossing rather than fixing one in advance.
function deformationIndex(p) {
  const s = p.shrinkage / 35; // normalize against observed max range
  const c = p.crackLength / 55;
  const f = (p.fragmentCount - 1) / 14;
  return Math.min(1, (s * 0.4 + c * 0.35 + f * 0.25));
}

// Data-derived threshold: midpoint between the largest jump in
// deformation index across consecutive time stamps for THIS sample.
function deriveThreshold(points) {
  let maxJump = 0;
  let crossingIdx = 1;
  for (let i = 1; i < points.length; i++) {
    const jump = deformationIndex(points[i]) - deformationIndex(points[i - 1]);
    if (jump > maxJump) {
      maxJump = jump;
      crossingIdx = i;
    }
  }
  const before = deformationIndex(points[crossingIdx - 1]);
  const after = deformationIndex(points[crossingIdx]);
  return { value: (before + after) / 2, crossingIdx };
}

function classify(sample, threshold) {
  const first = sample.points[0];
  const last = sample.points[sample.points.length - 1];
  const fragmentedFromStart = first.fragmentCount >= 5;
  const staysIntact = last.fragmentCount <= 2;

  if (fragmentedFromStart) {
    return {
      character: "Fibre-Bridged Fragmented",
      note: "Already fragmented into thin strands at the earliest observed point; fibre continuity, not fragmentation, is what changes over time.",
    };
  }
  if (staysIntact) {
    return {
      character: "Dense Resistant Shell",
      note: "Holds as a single bubbled sheet across nearly all time stamps — fragmentation, where it appears, is limited to the final reading.",
    };
  }
  return {
    character: "Fast Softening Membrane",
    note: "Rapid early moisture loss with moderate, gradual deformation.",
  };
}

export default function ZMEKDashboard() {
  const [activeSample, setActiveSample] = useState(RAW_SAMPLES[0].id);
  const [activeStage, setActiveStage] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const sample = RAW_SAMPLES.find((s) => s.id === activeSample);

  const enriched = useMemo(() => {
    return sample.points.map((p) => ({ ...p, index: deformationIndex(p) }));
  }, [sample]);

  const threshold = useMemo(() => deriveThreshold(sample.points), [sample]);
  const result = useMemo(() => classify(sample, threshold), [sample, threshold]);

  const maxIndex = 1;
  const chartW = 640;
  const chartH = 220;
  const padL = 48;
  const padB = 36;
  const padT = 20;
  const plotW = chartW - padL - 24;
  const plotH = chartH - padT - padB;

  const xFor = (i) => padL + (i / (enriched.length - 1)) * plotW;
  const yFor = (v) => padT + plotH - (v / maxIndex) * plotH;

  const pathD = enriched
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.index)}`)
    .join(" ");

  return (
    <div
      style={{
        "--ink": "#1A1815",
        "--paper": "#FAF8F4",
        "--paper-warm": "#F1ECE2",
        "--terracotta": "#B5562C",
        "--moss": "#5C6B4F",
        "--amber": "#8B6914",
        "--line": "#D9D2C3",
        fontFamily: "'Inter', sans-serif",
        background: "var(--paper)",
        color: "var(--ink)",
        minHeight: "100%",
        padding: "32px clamp(16px, 4vw, 48px)",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .zmek-mono { font-family: 'JetBrains Mono', monospace; }
        .zmek-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .zmek-stage-btn {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .zmek-stage-btn:focus-visible, .zmek-sample-btn:focus-visible {
          outline: 2px solid var(--terracotta);
          outline-offset: 2px;
        }
        .zmek-sample-btn {
          cursor: pointer;
          transition: all 0.15s ease;
        }
        @media (max-width: 720px) {
          .zmek-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, borderBottom: "1px solid var(--line)", paddingBottom: 20 }}>
        <div
          className="zmek-mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--moss)", marginBottom: 8, textTransform: "uppercase" }}
        >
          Rule-Based Material Classification — Prototype Scaffold
        </div>
        <h1 className="zmek-display" style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 600, margin: 0, lineHeight: 1.15 }}>
          ZMEK: Zone → Metric → Threshold → Decision
        </h1>
        <p style={{ fontSize: 14, color: "#54504A", marginTop: 10, maxWidth: 640, lineHeight: 1.55 }}>
          A working scaffold for the data architecture described in Stage 3 of the proposal. Thresholds
          below are not fixed in advance — they are derived from each sample's own deformation curve, the
          same logic adapted from prior threshold-based design research.
        </p>
      </div>

      <div className="zmek-grid" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28 }}>
        {/* Sample selector */}
        <div>
          <div
            className="zmek-mono"
            style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A857C", marginBottom: 10, textTransform: "uppercase" }}
          >
            Sample
          </div>
          {RAW_SAMPLES.map((s) => (
            <button
              key={s.id}
              className="zmek-sample-btn"
              onClick={() => setActiveSample(s.id)}
              aria-pressed={activeSample === s.id}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                marginBottom: 8,
                borderRadius: 6,
                border: activeSample === s.id ? "1px solid var(--terracotta)" : "1px solid var(--line)",
                background: activeSample === s.id ? "var(--paper-warm)" : "transparent",
                fontFamily: "Inter, sans-serif",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{s.label}</div>
              <div className="zmek-mono" style={{ fontSize: 11, color: "#8A857C", marginTop: 4 }}>
                {s.binder}
              </div>
            </button>
          ))}

          <div
            className="zmek-mono"
            style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A857C", margin: "20px 0 10px", textTransform: "uppercase" }}
          >
            ZMEK Stage
          </div>
          {STAGES.map((st, i) => (
            <button
              key={st.key}
              className="zmek-stage-btn"
              onClick={() => setActiveStage(i)}
              aria-pressed={activeStage === i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                marginBottom: 4,
                borderRadius: 6,
                border: "none",
                background: activeStage === i ? "var(--ink)" : "transparent",
                color: activeStage === i ? "var(--paper)" : "var(--ink)",
                fontFamily: "Inter, sans-serif",
              }}
            >
              <span className="zmek-mono" style={{ fontSize: 11, opacity: 0.6 }}>
                {st.sub}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{st.label}</span>
            </button>
          ))}
        </div>

        {/* Main panel */}
        <div>
          {/* Stage explainer */}
          <div
            style={{
              background: "var(--paper-warm)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "16px 20px",
              marginBottom: 20,
              minHeight: 64,
            }}
          >
            {activeStage === 0 && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <strong>Zone</strong> — regions of visible change are identified across the sample surface
                at each time stamp: edge curling, central swelling, fragment boundaries.
              </p>
            )}
            {activeStage === 1 && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <strong>Metric</strong> — shrinkage ratio, fragment count, crack length, and swelling area
                are extracted per zone and combined into a single deformation index, charted below.
              </p>
            )}
            {activeStage === 2 && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <strong>Threshold</strong> — the point separating instantaneous response from processual
                deformation is located at the largest jump in the deformation curve, not assigned in advance.
              </p>
            )}
            {activeStage === 3 && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <strong>Decision</strong> — the post-threshold behaviour pattern is classified into a
                material character, which becomes one row in a growing, ML-ready data set.
              </p>
            )}
          </div>

          {/* Chart */}
          <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {/* gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <line
                key={v}
                x1={padL}
                x2={chartW - 24}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="#E5DFD3"
                strokeWidth="1"
              />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <text key={v} x={padL - 10} y={yFor(v) + 4} textAnchor="end" fontSize="10" fill="#8A857C" fontFamily="JetBrains Mono, monospace">
                {v.toFixed(2)}
              </text>
            ))}

            {/* threshold zone (only visible from stage 2 onward) */}
            {activeStage >= 2 && (
              <>
                <rect
                  x={padL}
                  y={padT}
                  width={plotW}
                  height={yFor(threshold.value) - padT}
                  fill="#B5562C"
                  opacity="0.06"
                />
                <line
                  x1={padL}
                  x2={chartW - 24}
                  y1={yFor(threshold.value)}
                  y2={yFor(threshold.value)}
                  stroke="var(--terracotta)"
                  strokeWidth="1.5"
                  strokeDasharray="5,4"
                />
                <text
                  x={chartW - 26}
                  y={yFor(threshold.value) - 6}
                  textAnchor="end"
                  fontSize="10.5"
                  fill="var(--terracotta)"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  threshold {threshold.value.toFixed(2)}
                </text>
              </>
            )}

            {/* data path */}
            {activeStage >= 1 && (
              <path d={pathD} fill="none" stroke="var(--moss)" strokeWidth="2" />
            )}

            {/* points */}
            {enriched.map((p, i) => {
              const isHover = hoveredPoint === i;
              const crossed = activeStage >= 2 && i >= threshold.crossingIdx;
              return (
                <g key={p.t}>
                  <circle
                    cx={xFor(i)}
                    cy={yFor(p.index)}
                    r={isHover ? 7 : 5}
                    fill={crossed && activeStage >= 3 ? "var(--terracotta)" : "var(--ink)"}
                    stroke="var(--paper)"
                    strokeWidth="2"
                    onMouseEnter={() => setHoveredPoint(i)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    style={{ cursor: "pointer" }}
                  />
                  <text
                    x={xFor(i)}
                    y={chartH - 10}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#8A857C"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {p.t}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* hover readout */}
          <div style={{ minHeight: 28, marginBottom: 8 }}>
            {hoveredPoint !== null && (
              <div className="zmek-mono" style={{ fontSize: 12, color: "var(--moss)" }}>
                {enriched[hoveredPoint].t} — shrinkage {enriched[hoveredPoint].shrinkage}% · cracks{" "}
                {enriched[hoveredPoint].crackLength}mm · moisture {enriched[hoveredPoint].moisture}% ·
                deformation index {enriched[hoveredPoint].index.toFixed(2)}
              </div>
            )}
          </div>

          {/* decision card */}
          {activeStage === 3 && (
            <div
              style={{
                marginTop: 16,
                padding: "18px 20px",
                background: "var(--ink)",
                color: "var(--paper)",
                borderRadius: 8,
              }}
            >
              <div className="zmek-mono" style={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
                Classified character
              </div>
              <div className="zmek-display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
                {result.character}
              </div>
              <div style={{ fontSize: 13.5, opacity: 0.85, lineHeight: 1.5 }}>{result.note}</div>
            </div>
          )}

          {/* dataset row preview */}
          <div style={{ marginTop: 24 }}>
            <div
              className="zmek-mono"
              style={{ fontSize: 10, letterSpacing: "0.08em", color: "#8A857C", marginBottom: 8, textTransform: "uppercase" }}
            >
              Resulting data row (one of N, scalable)
            </div>
            <div
              className="zmek-mono"
              style={{
                fontSize: 11.5,
                background: "var(--paper-warm)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "12px 16px",
                overflowX: "auto",
                whiteSpace: "nowrap",
                color: "#4A453E",
              }}
            >
              {`{ sample: "${sample.id}", t: "${enriched[enriched.length - 1].t}", shrinkage: ${enriched[enriched.length - 1].shrinkage}, fragmentCount: ${enriched[enriched.length - 1].fragmentCount}, crackLength: ${enriched[enriched.length - 1].crackLength}, deformationIndex: ${enriched[enriched.length - 1].index.toFixed(3)}, threshold: ${threshold.value.toFixed(3)}, character: "${result.character}" }`}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <p className="zmek-mono" style={{ fontSize: 11, color: "#8A857C", lineHeight: 1.6, margin: 0 }}>
          Two samples shown for demonstration. The architecture is built to scale: each additional sample
          and time stamp becomes one more row in the same structure, without changing the pipeline —
          this is the scaffold a future machine learning classifier would train on.
        </p>
      </div>
    </div>
  );
}
