// Top-right of the 3D view: camera presets, floor overlay (traffic / congestion)
// with its legend, and the Demo Mode button.

import { CONGESTION_RED_S, CONGESTION_YELLOW_S } from '../scene/helpers';
import { useStore, type CameraPreset, type Overlay } from '../store';

const CAMERAS: [CameraPreset, string][] = [
  ['overview', 'Overview'],
  ['top', 'Top-down'],
  ['follow', 'Follow picker'],
];
const OVERLAYS: [Overlay, string][] = [
  ['none', 'Off'],
  ['traffic', 'Traffic'],
  ['congestion', 'Congestion'],
];

export function SceneControls({ onDemo }: { onDemo: () => void }) {
  const camera = useStore((s) => s.camera);
  const overlay = useStore((s) => s.overlay);
  const pickers = useStore((s) => s.pickers);
  const demo = useStore((s) => s.demo.active);
  const { setCamera, setOverlay } = useStore.getState();

  return (
    <div className="scene-controls">
      <div className="float-card">
        <div className="float-label">Camera</div>
        <div className="segmented small">
          {CAMERAS.map(([k, label]) => (
            <button key={k} className={camera === k ? 'on' : ''} onClick={() => setCamera(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="float-label">Floor overlay</div>
        <div className="segmented small">
          {OVERLAYS.map(([k, label]) => (
            <button key={k} className={overlay === k ? 'on' : ''} onClick={() => setOverlay(k)}>
              {label}
            </button>
          ))}
        </div>
        {overlay === 'traffic' && (
          <div className="legend">
            <span>quiet</span>
            <div className="legend-bar traffic" />
            <span>busy</span>
          </div>
        )}
        {overlay === 'traffic' && <p className="tiny-note">Steps per floor cell, all orders of the month.</p>}
        {overlay === 'congestion' &&
          (pickers > 1 ? (
            <>
              <div className="legend">
                <span className="swatch" style={{ background: 'hsl(119,80%,50%)' }} /> 0 s
                <span className="swatch" style={{ background: 'hsl(60,80%,50%)' }} /> {CONGESTION_YELLOW_S} s
                <span className="swatch" style={{ background: 'hsl(0,80%,50%)' }} /> ≥{CONGESTION_RED_S} s waiting
              </div>
              <p className="tiny-note">Waiting time per cell so far in this replay (live).</p>
            </>
          ) : (
            <p className="tiny-note">With 1 picker nobody waits. Add pickers in the Dashboard to see congestion.</p>
          ))}
      </div>
      <button className={`demo-button ${demo ? 'on' : ''}`} onClick={onDemo}>
        {demo ? '■ Stop demo' : '▶ Demo mode'}
      </button>
    </div>
  );
}
