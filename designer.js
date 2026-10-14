/**
 * designer.js - Ultimate American Football Play Designer Core
 * Implements ALL 8 user requirements completely:
 * 1. Normalized Defense Speed: Same speed as offense, natural pacing for zone drops.
 * 2. Visual Arrows & On-field Popovers: Arrowheads on all routes, on-field left-click menus for preset & freehand routes.
 * 3. Interactive Defense: Zone drag-move & edge-resize handle, Man-coverage draggable target arrow, custom Rush destination route.
 * 4. Pass vs Run Mode: Ball carrier selection, QB handoff movement, custom/preset run routes, blocker routes.
 * 5. Blocker Positioning: T-bar blocking position & route custom/preset selection.
 * 6. Swarm to Ball: All defenders converge towards ball landing spot or ball carrier after throw/handoff.
 * 7. Blocking & Shed Block Physics: OL engages DL, blocks for set duration, wall gap prevention, shed block pursuit.
 * 8. Play Outcome HUD: Shows Complete (+yds), Incomplete, Run Gain (+yds), Sack, Loss, Touchdown at the end.
 */

// Global App State
const state = {
  mode: 'matchup', // 'offense' | 'defense' | 'matchup'
  playType: 'pass', // 'pass' | 'run'
  offensePlay: null,
  defensePlay: null,
  selectedPlayer: null, // { side, id }
  ballCarrierId: 'RB',
  passTargetId: 'WR1',

  // Pass Vector & Throw Timing (Straight arrow from QB to landing spot)
  passTargetPos: { x: 50, y: 30 },
  isDrawingPassLine: false,
  catchReceiverId: null,
  throwTimingSec: 2.0, // user customizable throw timing in seconds (e.g. 2.0s)
  throwTime: 0.40, // t ratio when QB throws (throwTimingSec / duration)
  catchTime: 0.60, // t ratio when ball reaches target ((throwTimingSec + 1.0) / duration)

  // AI Intelligent Vision & Decision Engine
  aiSmartLead: true, // QB自動オープンターゲット判定（最もフリーな選手を見極めて自動投球）
  aiSmartCutback: true, // RB自動カットバック（空いた穴/ギャップを見極めて自動進路変更）
  aiDecisionInfo: null, // Visual HUD feedback info
  smartPassTargetLock: null, // パス投球後（t >= throwTime）に固定されるオープンレシーバー情報
  resolvedPass: null, // フレームごとに事前計算されるパスプレイ同期情報

  // Run Play Multi-step Sequence (up to 3 exchanges)
  runSequence: [
    { from: 'QB', to: 'RB', type: 'handoff', isOption: false, optionType: 'none' }
  ],
  runExchangeTimes: [], // calculated valid exchange timestamps (t)
  runOptionDecisions: [], // ['give' | 'keep' | 'pass']
  defenseOptionAssignments: {}, // { [playerId]: 0 | 1 } - 50/50 assignment per defender
  rpoPassState: null, // RPOパス選択時のパス情報 { throwT, catchT, targetReceiver, targetPos, isCatchable }

  // Pre-Snap Shifts & Motion
  shifts: [], // [{ playerId: 'TE', path: [...], destX: 38, destY: 65 }]
  motion: null, // { playerId: 'WR1', path: [...], destX: 48, destY: 68 }
  isDrawingPresnap: null, // 'shift' | 'motion' | null
  drawingPresnapPlayerId: null,
  drawingPresnapPoints: [],

  // Freehand Drawing Mode (draw smooth continuous lines)
  isDrawingRoute: false,
  drawingPlayerId: null,
  drawingPoints: [],

  // Dragging State
  isDragging: false,
  dragTarget: null, // { type: 'player'|'waypoint'|'zone_center'|'zone_radius'|'man_arrow'|'rush_dest'|'pass_target', side, id, index }
  pointerDownInfo: null, // { startX, startY, side, id, pos, hasDragged }

  // Animation Engine State
  anim: {
    isPlaying: false,
    progress: 0.0,
    duration: 5.0, // default 5.0 seconds
    speed: 1.0,
    lastTimestamp: null,
    frameId: null
  },

  // View Settings
  showRoutes: true,
  showCoverage: true,
  showZoneCircles: true
};


/* ─── Initialization ────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  initFieldSvg();
  initDefaultPlays();
  bindUIEvents();
  renderPresnapUI();
  syncAiToggles();
  renderAll();
});

function initDefaultPlays() {
  const loadReq = sessionStorage.getItem('load_play_request');
  if (loadReq) {
    try {
      const { type, id, isPreset } = JSON.parse(loadReq);
      sessionStorage.removeItem('load_play_request');
      if (type === 'offense') {
        if (isPreset && PRESETS.offense[id]) {
          state.offensePlay = JSON.parse(JSON.stringify(PRESETS.offense[id]));
        } else {
          const pb = getPlaybookData();
          const found = pb.offense.find(x => x.id === id);
          if (found) state.offensePlay = JSON.parse(JSON.stringify(found));
        }
        state.mode = 'offense';
      } else {
        if (isPreset && PRESETS.defense[id]) {
          state.defensePlay = JSON.parse(JSON.stringify(PRESETS.defense[id]));
        } else {
          const pb = getPlaybookData();
          const found = pb.defense.find(x => x.id === id);
          if (found) state.defensePlay = JSON.parse(JSON.stringify(found));
        }
        state.mode = 'defense';
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!state.offensePlay) {
    state.offensePlay = JSON.parse(JSON.stringify(PRESETS.offense['shotgun_spread']));
  }
  if (!state.defensePlay) {
    state.defensePlay = JSON.parse(JSON.stringify(PRESETS.defense['4_3_cover2']));
  }

  const rb = state.offensePlay.players.find(p => p.type === 'RB');
  if (rb) state.ballCarrierId = rb.id;

  updatePresetDropdowns();
}

/* ─── Field SVG Render ──────────────────────────────────────── */
/* ─── Field SVG Render ──────────────────────────────────────── */
function initFieldSvg() {
  const svg = document.getElementById('fieldSvg');
  if (!svg) return;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const ns = 'http://www.w3.org/2000/svg';

  // Defs: Markers for arrowheads
  const defs = document.createElementNS(ns, 'defs');

  // Pass arrow (Gold)
  const markerGold = document.createElementNS(ns, 'marker');
  markerGold.setAttribute('id', 'arrow-gold');
  markerGold.setAttribute('viewBox', '0 0 10 10');
  markerGold.setAttribute('refX', '7');
  markerGold.setAttribute('refY', '5');
  markerGold.setAttribute('markerWidth', '2.0');
  markerGold.setAttribute('markerHeight', '2.0');
  markerGold.setAttribute('orient', 'auto-start-reverse');
  markerGold.innerHTML = '<path d="M 0 2.2 L 8 5 L 0 7.8 z" fill="#fbbf24"/>';
  defs.appendChild(markerGold);

  // Run arrow (Emerald)
  const markerGreen = document.createElementNS(ns, 'marker');
  markerGreen.setAttribute('id', 'arrow-green');
  markerGreen.setAttribute('viewBox', '0 0 10 10');
  markerGreen.setAttribute('refX', '7');
  markerGreen.setAttribute('refY', '5');
  markerGreen.setAttribute('markerWidth', '2.0');
  markerGreen.setAttribute('markerHeight', '2.0');
  markerGreen.setAttribute('orient', 'auto-start-reverse');
  markerGreen.innerHTML = '<path d="M 0 2.2 L 8 5 L 0 7.8 z" fill="#10b981"/>';
  defs.appendChild(markerGreen);

  // Defense arrow (Red)
  const markerRed = document.createElementNS(ns, 'marker');
  markerRed.setAttribute('id', 'arrow-red');
  markerRed.setAttribute('viewBox', '0 0 10 10');
  markerRed.setAttribute('refX', '7');
  markerRed.setAttribute('refY', '5');
  markerRed.setAttribute('markerWidth', '2.0');
  markerRed.setAttribute('markerHeight', '2.0');
  markerRed.setAttribute('orient', 'auto-start-reverse');
  markerRed.innerHTML = '<path d="M 0 2.2 L 8 5 L 0 7.8 z" fill="#ef4444"/>';
  defs.appendChild(markerRed);

  // Shift arrow (Purple)
  const markerPurple = document.createElementNS(ns, 'marker');
  markerPurple.setAttribute('id', 'arrow-purple');
  markerPurple.setAttribute('viewBox', '0 0 10 10');
  markerPurple.setAttribute('refX', '7');
  markerPurple.setAttribute('refY', '5');
  markerPurple.setAttribute('markerWidth', '2.0');
  markerPurple.setAttribute('markerHeight', '2.0');
  markerPurple.setAttribute('orient', 'auto-start-reverse');
  markerPurple.innerHTML = '<path d="M 0 2.2 L 8 5 L 0 7.8 z" fill="#a855f7"/>';
  defs.appendChild(markerPurple);

  // Motion arrow (Cyan)
  const markerCyan = document.createElementNS(ns, 'marker');
  markerCyan.setAttribute('id', 'arrow-cyan');
  markerCyan.setAttribute('viewBox', '0 0 10 10');
  markerCyan.setAttribute('refX', '7');
  markerCyan.setAttribute('refY', '5');
  markerCyan.setAttribute('markerWidth', '2.0');
  markerCyan.setAttribute('markerHeight', '2.0');
  markerCyan.setAttribute('orient', 'auto-start-reverse');
  markerCyan.innerHTML = '<path d="M 0 2.2 L 8 5 L 0 7.8 z" fill="#06b6d4"/>';
  defs.appendChild(markerCyan);

  svg.appendChild(defs);

  // 1. Cut Sidelines: Shaded Bench Turf Margins (Left 0..4%, Right 96..100%)
  const benchL = document.createElementNS(ns, 'rect');
  benchL.setAttribute('x', '0');
  benchL.setAttribute('y', '0');
  benchL.setAttribute('width', '4');
  benchL.setAttribute('height', '100');
  benchL.setAttribute('fill', '#091b0d');
  benchL.setAttribute('opacity', '0.65');
  svg.appendChild(benchL);

  const benchR = document.createElementNS(ns, 'rect');
  benchR.setAttribute('x', '96');
  benchR.setAttribute('y', '0');
  benchR.setAttribute('width', '4');
  benchR.setAttribute('height', '100');
  benchR.setAttribute('fill', '#091b0d');
  benchR.setAttribute('opacity', '0.65');
  svg.appendChild(benchR);

  // 2. White Sideline Chalk Borders (Tight sidelines)
  const sideL = document.createElementNS(ns, 'line');
  sideL.setAttribute('x1', '4');
  sideL.setAttribute('y1', '0');
  sideL.setAttribute('x2', '4');
  sideL.setAttribute('y2', '100');
  sideL.setAttribute('stroke', '#ffffff');
  sideL.setAttribute('stroke-width', '1.6');
  sideL.setAttribute('stroke-opacity', '0.85');
  svg.appendChild(sideL);

  const sideR = document.createElementNS(ns, 'line');
  sideR.setAttribute('x1', '96');
  sideR.setAttribute('y1', '0');
  sideR.setAttribute('x2', '96');
  sideR.setAttribute('y2', '100');
  sideR.setAttribute('stroke', '#ffffff');
  sideR.setAttribute('stroke-width', '1.6');
  sideR.setAttribute('stroke-opacity', '0.85');
  svg.appendChild(sideR);

  // 3. Vertical Yard Range: Snap position (LOS) at 50-yard line (y=65)
  // Lines every 10yd: 10, 20, 30, 40 (1st down), 50 (LOS), 40, 30
  const majorLines = [9, 23, 37, 51, 65, 79, 93];
  majorLines.forEach(y => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('class', 'field-chalk-line');
    line.setAttribute('x1', '4');
    line.setAttribute('y1', `${y}`);
    line.setAttribute('x2', '96');
    line.setAttribute('y2', `${y}`);
    line.setAttribute('stroke', '#ffffff');
    line.setAttribute('stroke-width', (y === 65 || y === 51) ? '0' : '0.9');
    line.setAttribute('stroke-opacity', '0.25');
    svg.appendChild(line);
  });

  // Minor 5-yard dashed lines
  [16, 30, 44, 58, 72, 86].forEach(y => {
    const line5 = document.createElementNS(ns, 'line');
    line5.setAttribute('class', 'field-chalk-line-minor');
    line5.setAttribute('x1', '4');
    line5.setAttribute('y1', `${y}`);
    line5.setAttribute('x2', '96');
    line5.setAttribute('y2', `${y}`);
    line5.setAttribute('stroke', '#ffffff');
    line5.setAttribute('stroke-width', '0.5');
    line5.setAttribute('stroke-dasharray', '2,4');
    line5.setAttribute('stroke-opacity', '0.14');
    svg.appendChild(line5);
  });

  // 4. Hash Marks (x=38, x=62)
  [38, 62].forEach(hashX => {
    [16, 23, 30, 37, 44, 58, 72, 79, 86].forEach(y => {
      const hash = document.createElementNS(ns, 'line');
      hash.setAttribute('x1', `${hashX - 1}`);
      hash.setAttribute('y1', `${y}`);
      hash.setAttribute('x2', `${hashX + 1}`);
      hash.setAttribute('y2', `${y}`);
      hash.setAttribute('stroke', '#ffffff');
      hash.setAttribute('stroke-width', '1.0');
      hash.setAttribute('stroke-opacity', '0.35');
      svg.appendChild(hash);
    });
  });

  // 5. Painted Yard Numbers along sidelines (Snap position = 50 yard line!)
  const yardLabels = [
    { y: 10.5, num: '10' },
    { y: 24.5, num: '20' },
    { y: 38.5, num: '30' },
    { y: 52.5, num: '40' },
    { y: 66.5, num: '50' }, // LOS: 50-yard line
    { y: 80.5, num: '40' },
    { y: 94.5, num: '30' }
  ];
  yardLabels.forEach(yl => {
    [7.5, 92.5].forEach(x => {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('class', 'field-yard-num');
      text.setAttribute('x', `${x}`);
      text.setAttribute('y', `${yl.y}`);
      text.setAttribute('fill', 'rgba(255,255,255,0.28)');
      text.setAttribute('font-family', 'monospace');
      text.setAttribute('font-size', '3.5');
      text.setAttribute('font-weight', '800');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = yl.num;
      svg.appendChild(text);
    });
  });

  // 6. LOS (50yd line) & 1st Down line (40yd line) Prominent markings
  const los = document.createElementNS(ns, 'line');
  los.setAttribute('x1', '4');
  los.setAttribute('y1', '65');
  los.setAttribute('x2', '96');
  los.setAttribute('y2', '65');
  los.setAttribute('stroke', '#38bdf8');
  los.setAttribute('stroke-width', '2.0');
  los.setAttribute('stroke-dasharray', '4,3');
  los.setAttribute('stroke-opacity', '0.9');
  svg.appendChild(los);

  const losText = document.createElementNS(ns, 'text');
  losText.setAttribute('x', '5.5');
  losText.setAttribute('y', '64.2');
  losText.setAttribute('fill', '#38bdf8');
  losText.setAttribute('font-size', '2.6');
  losText.setAttribute('font-family', 'monospace');
  losText.setAttribute('font-weight', 'bold');
  losText.textContent = 'LOS (50)';
  svg.appendChild(losText);

  const fdl = document.createElementNS(ns, 'line');
  fdl.setAttribute('x1', '4');
  fdl.setAttribute('y1', '51');
  fdl.setAttribute('x2', '96');
  fdl.setAttribute('y2', '51');
  fdl.setAttribute('stroke', '#facc15');
  fdl.setAttribute('stroke-width', '2.0');
  fdl.setAttribute('stroke-opacity', '0.85');
  svg.appendChild(fdl);

  const fdlText = document.createElementNS(ns, 'text');
  fdlText.setAttribute('x', '5.5');
  fdlText.setAttribute('y', '50.2');
  fdlText.setAttribute('fill', '#facc15');
  fdlText.setAttribute('font-size', '2.6');
  fdlText.setAttribute('font-family', 'monospace');
  fdlText.setAttribute('font-weight', 'bold');
  fdlText.textContent = '1ST (40)';
  svg.appendChild(fdlText);

  // Groups
  const zoneGroup = document.createElementNS(ns, 'g');
  zoneGroup.setAttribute('id', 'svgZones');
  svg.appendChild(zoneGroup);

  const presnapGroup = document.createElementNS(ns, 'g');
  presnapGroup.setAttribute('id', 'svgPresnap');
  svg.appendChild(presnapGroup);

  const routeGroup = document.createElementNS(ns, 'g');
  routeGroup.setAttribute('id', 'svgRoutes');
  svg.appendChild(routeGroup);

  const coverageGroup = document.createElementNS(ns, 'g');
  coverageGroup.setAttribute('id', 'svgCoverage');
  svg.appendChild(coverageGroup);
}


/* ─── Render All ────────────────────────────────────────────── */
function renderAll() {
  renderRoutesAndCoverage();
  renderPlayerNodes(state.anim.progress);
}

/**
 * Pre-resolve pass play targeting and catch status before drawing offense/defense players.
 * 1. Eliminates 1-frame catch delay / hitch at catch time.
 * 2. Locks smart target on release (t >= throwTime) so destination doesn't jitter or flap mid-flight.
 * 3. Caches result for O(1) defender pursuit lookups.
 */
function resolvePassPlayState(t) {
  if (state.playType === 'run') {
    const rpo = state.rpoPassState;
    if (rpo && rpo.isThrowing) {
      if (t >= rpo.catchT && rpo.targetReceiver) {
        state.catchReceiverId = rpo.targetReceiver.id;
      } else {
        state.catchReceiverId = null;
      }
    } else {
      state.catchReceiverId = null;
    }
    state.resolvedPass = null;
    return null;
  }

  if (!state.offensePlay) {
    state.resolvedPass = null;
    state.catchReceiverId = null;
    return null;
  }

  const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
  const animDur = state.anim.duration || 5.0;
  let throwT = state.throwTime;
  let catchT = state.catchTime;
  if (throwT > 1.0) throwT = Math.min(0.8, throwT / animDur);
  if (!throwT || throwT <= 0) throwT = 0.4;
  if (catchT > 1.0) catchT = Math.min(0.95, catchT / animDur);
  if (!catchT || catchT <= throwT) catchT = Math.min(0.95, throwT + (1.0 / animDur));

  const qbPos = getOffensePosAt(qb, Math.min(t, throwT));
  let targetX = state.passTargetPos.x;
  let targetY = state.passTargetPos.y;
  let nearestReceiver = null;
  let minCatchDist = 999;

  // QB Smart Lead Vision
  if (state.aiSmartLead && state.defensePlay && state.defensePlay.players.length > 0) {
    if (t >= throwT) {
      // Released: use locked target so target and destination never flutter in flight
      if (!state.smartPassTargetLock) {
        state.smartPassTargetLock = getSmartOpenReceiver();
      }
      const locked = state.smartPassTargetLock;
      if (locked && locked.receiver) {
        targetX = locked.posAtCatch.x;
        targetY = locked.posAtCatch.y;
        nearestReceiver = locked.receiver;
        minCatchDist = 0;
        state.aiDecisionInfo = {
          type: 'pass',
          text: `🎯 <b>QBスマートリード:</b> <span>${nearestReceiver.label}</span> へ自動アジャスト！(セパレーション: ${locked.separation.toFixed(1)}yd)`
        };
      }
    } else {
      // Pre-release: dynamically evaluate and show in HUD
      state.smartPassTargetLock = null;
      const smartOpen = getSmartOpenReceiver();
      if (smartOpen && smartOpen.receiver) {
        targetX = smartOpen.posAtCatch.x;
        targetY = smartOpen.posAtCatch.y;
        nearestReceiver = smartOpen.receiver;
        minCatchDist = 0;
        state.aiDecisionInfo = {
          type: 'pass',
          text: `🎯 <b>QBスマートリード:</b> <span>${nearestReceiver.label}</span> へ自動アジャスト！(セパレーション: ${smartOpen.separation.toFixed(1)}yd)`
        };
      }
    }
  } else {
    state.smartPassTargetLock = null;
  }

  if (!nearestReceiver && state.offensePlay) {
    // Manual Target Line Mode: only eligible receivers running active routes (no blockers!)
    const receivers = getEligiblePassReceivers();
    receivers.forEach(r => {
      const rPos = getOffenseBasePosAt(r, catchT);
      const d = Math.hypot(rPos.x - targetX, rPos.y - targetY);
      if (d < minCatchDist) {
        minCatchDist = d;
        nearestReceiver = r;
      }
    });
    if (state.aiDecisionInfo && state.aiDecisionInfo.type === 'pass') {
      state.aiDecisionInfo = null;
    }
  }

  const isCatchable = nearestReceiver && minCatchDist <= 6.5;

  // Synchronize catchReceiverId immediately
  if (t >= catchT && isCatchable) {
    state.catchReceiverId = nearestReceiver.id;
  } else {
    state.catchReceiverId = null;
  }

  state.resolvedPass = {
    t,
    throwT,
    catchT,
    qb,
    qbPos,
    targetX,
    targetY,
    nearestReceiver,
    isCatchable
  };

  return state.resolvedPass;
}

/* ─── Render Player Nodes ───────────────────────────────────── */
function renderPlayerNodes(progress = 0) {
  const container = document.getElementById('playersContainer');
  if (!container) return;
  container.innerHTML = '';

  const preSnapSec = getPreSnapDuration();
  const totalDur = getTotalDuration();
  const curSec = progress * totalDur;
  const isPreSnap = preSnapSec > 0 && curSec < preSnapSec;
  const postT = preSnapSec > 0 
    ? Math.max(0, (curSec - preSnapSec) / state.anim.duration)
    : progress;

  // Pre-resolve pass play state before rendering offense & defense players
  if (!isPreSnap) {
    resolvePassPlayState(postT);
  } else {
    state.resolvedPass = null;
    state.catchReceiverId = null;
    state.smartPassTargetLock = null;
  }

  // 1. Offense Players
  if (state.mode !== 'defense' && state.offensePlay) {
    state.offensePlay.players.forEach(p => {
      let pos;
      if (isPreSnap) {
        pos = getPreSnapPos(p, curSec);
      } else if (progress === 0 && !state.anim.isPlaying) {
        pos = { x: p.x, y: p.y };
      } else {
        pos = getOffensePosAt(p, postT);
      }
      const el = createPlayerNode(p, 'offense', pos);
      container.appendChild(el);
    });
  }

  // 2. Defense Players
  if (state.mode !== 'offense' && state.defensePlay) {
    state.defensePlay.players.forEach(p => {
      let pos;
      if (isPreSnap) {
        pos = getPreSnapPos(p, curSec);
      } else if (progress === 0 && !state.anim.isPlaying) {
        pos = { x: p.x, y: p.y };
      } else {
        pos = getDefensePosAt(p, postT);
      }
      const el = createPlayerNode(p, 'defense', pos);
      container.appendChild(el);
    });
  }

  // 3. Ball Marker
  if (isPreSnap) {
    const c = state.offensePlay ? state.offensePlay.players.find(p => p.type === 'C') : null;
    const cx = c ? c.x : 50;
    const cy = c ? c.y : 65;
    const ball = document.createElement('div');
    ball.className = 'ball-marker';
    ball.style.left = `${cx}%`;
    ball.style.top = `${cy}%`;
    container.appendChild(ball);

    // Pre-snap HUD Badge
    const badge = document.createElement('div');
    badge.className = 'presnap-phase-badge';
    const shiftTime = (state.shifts || []).length * 1.2;
    if (curSec < shiftTime) {
      const activeIdx = Math.floor(curSec / 1.2);
      const s = state.shifts[activeIdx];
      const sp = state.offensePlay ? state.offensePlay.players.find(x => x.id === s.playerId) : null;
      badge.innerHTML = `<span>🔄</span> プレシフト中 [${activeIdx + 1}/${state.shifts.length}]: ${sp ? sp.label : ''}`;
    } else {
      const motP = state.offensePlay ? state.offensePlay.players.find(x => x.id === state.motion.playerId) : null;
      badge.innerHTML = `<span>🏃</span> モーション中: ${motP ? motP.label : ''} (完了でスナップ)`;
    }
    container.appendChild(badge);
  } else {
    renderFootball(postT, container);

    // AI Decision HUD Badge (Shows live AI analysis during play)
    if (state.anim.isPlaying && state.aiDecisionInfo && postT > 0.08) {
      const aiBadge = document.createElement('div');
      aiBadge.className = 'presnap-phase-badge';
      const isPass = state.aiDecisionInfo.type === 'pass';
      aiBadge.style.borderColor = isPass ? '#38bdf8' : '#34d399';
      aiBadge.style.background = 'rgba(15, 23, 42, 0.92)';
      aiBadge.style.color = isPass ? '#38bdf8' : '#34d399';
      aiBadge.innerHTML = state.aiDecisionInfo.text;
      container.appendChild(aiBadge);
    }
  }

  // 4. Interactive Waypoint Handles & Shift / Motion Handles (when idle at progress 0)
  if (!state.anim.isPlaying && progress === 0) {
    renderInteractiveHandles(container);
  }
}

function createPlayerNode(p, side, pos) {
  const el = document.createElement('div');
  const roleClass = (p.type || '').toLowerCase();
  const isSelected = state.selectedPlayer && state.selectedPlayer.side === side && state.selectedPlayer.id === p.id;

  // Determine if this player is currently carrying the football
  let hasBall = false;
  if (side === 'offense') {
    const curT = state.anim.progress || 0;
    if (state.playType === 'run') {
      const carrier = getRunPlayBallCarrierAt(curT);
      if (carrier && carrier.id === p.id) {
        hasBall = true;
      }
    } else {
      const pass = state.resolvedPass || resolvePassPlayState(curT);
      const throwT = pass ? pass.throwT : (state.throwTime || 0.4);
      const catchT = pass ? pass.catchT : (state.catchTime || 0.6);
      if (curT < throwT && p.type === 'QB') {
        hasBall = true;
      } else if (curT >= catchT && state.catchReceiverId === p.id) {
        hasBall = true;
      }
    }
  }

  el.className = `player-node ${side} ${roleClass} ${isSelected ? 'selected' : ''} ${hasBall ? 'ball-carrier' : ''}`;
  el.style.left = `${pos.x}%`;
  el.style.top = `${pos.y}%`;
  el.innerText = p.label;
  el.dataset.id = p.id;
  el.dataset.side = side;

  // Reliable Pointer Down for Click vs Drag
  el.addEventListener('pointerdown', (e) => {
    if (state.anim.isPlaying || state.isDrawingRoute) return;
    state.pointerDownInfo = {
      startX: e.clientX,
      startY: e.clientY,
      side,
      id: p.id,
      pos: { x: p.x, y: p.y },
      hasDragged: false
    };
  });

  return el;
}

/* ─── AI Decision Engine: QB Smart Lead & RB Smart Cutback ───── */
function toggleAiSmartMode(checked) {
  state.aiSmartLead = checked;
  state.aiSmartCutback = checked;
  syncAiToggles();
  renderAll();
}

function syncAiToggles() {
  const chkGlobal = document.getElementById('chkAiSmartMode');
  const chkPass = document.getElementById('chkSmartPass');
  const chkRun = document.getElementById('chkSmartRun');

  if (chkPass) chkPass.checked = !!state.aiSmartLead;
  if (chkRun) chkRun.checked = !!state.aiSmartCutback;
  if (chkGlobal) {
    chkGlobal.checked = !!(state.aiSmartLead || state.aiSmartCutback);
  }
}

/**
 * Calculates distance from point p to line segment AB.
 */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Safely computes defender position for AI vision (QB Lead & RB Cutback)
 * without triggering recursive chase calculations or call stack errors.
 */
function getDefenderVisionPos(d, t) {
  if (!d) return { x: 50, y: 50 };
  let pos;
  if (d.coverage === 'rush') {
    const rushDestX = d.rushX != null ? d.rushX : d.x;
    const rushDestY = d.rushY != null ? d.rushY : 64;
    pos = {
      x: d.x + (rushDestX - d.x) * Math.min(1.0, t * 1.5),
      y: d.y + (rushDestY - d.y) * Math.min(1.0, t * 1.5)
    };
  } else {
    pos = getDefBasePosAt(d, t);
  }
  return {
    x: (pos && isFinite(pos.x)) ? pos.x : d.x,
    y: (pos && isFinite(pos.y)) ? pos.y : d.y
  };
}

/**
 * Checks whether an offensive player is designated as a blocker.
 * Accounts for both routeType === 'block' and isBlocker === true flags.
 */
function isPlayerBlocker(p) {
  if (!p) return false;
  return p.isBlocker === true || p.routeType === 'block';
}

/**
 * Checks whether an offensive player is an eligible pass receiver.
 * Rule:
 * 1. Must be a skill player (not OL, C, OG, OT, QB).
 * 2. If handOffTargetId is provided (in RPO), that runner is excluded.
 * 3. MUST have an active route (p.route && p.route.length > 0).
 * 4. MUST NOT be a blocker (p.routeType !== 'block' && p.isBlocker !== true).
 */
function isEligiblePassReceiver(p, passerOrExcludeId = null) {
  if (!p) return false;
  if (p.type === 'OL' || p.type === 'C' || p.type === 'OG' || p.type === 'OT') return false;
  if (isPlayerBlocker(p)) return false; // ブロッカー指定された選手はレシーバーであっても絶対に除外！

  // パサー自身、または除外対象IDは除外
  if (passerOrExcludeId && p.id === passerOrExcludeId) return false;

  const qb = state.offensePlay ? state.offensePlay.players.find(x => x.type === 'QB') : null;
  const qbId = qb ? qb.id : null;

  // QBがレシーバーになれるか？
  // 「ランのパス時、QB以外がパスを投げるとき（トリックパス）」のみQBもパスターゲットになれる！
  // 通常パスプレイやRPO（QBがパサー）の時は絶対にQBはターゲットになれない。
  if (p.id === qbId || p.type === 'QB') {
    if (state.playType === 'pass') return false;
    // ランプレイ時: トリックパスでQB以外が投げる場合のみQBもターゲット可能
    const isTrickPass = state.runSequence && state.runSequence.some(s => s.type === 'pass' && s.from && s.from !== qbId);
    if (isTrickPass && passerOrExcludeId && passerOrExcludeId !== qbId) {
      return true;
    }
    return false;
  }

  if (!p.route || p.route.length === 0) return false; // ルートがある選手のみ
  return true;
}

function getEligiblePassReceivers(passerOrExcludeId = null) {
  if (!state.offensePlay) return [];
  return state.offensePlay.players.filter(p => isEligiblePassReceiver(p, passerOrExcludeId));
}

/**
 * QB Smart Lead Vision:
 * Dynamically identifies the most open receiver at catch time,
 * factoring in separation from nearest defender, passing lane risk, and downfield depth.
 */
function getSmartOpenReceiver(overrideThrowT, overrideCatchT, handOffTargetId) {
  if (!state.offensePlay) return null;
  // RPOおよび通常パス時、ルートがありブロッカーでないレシーバーのみを対象とする
  const receivers = getEligiblePassReceivers(handOffTargetId);
  if (receivers.length === 0) return null;

  const animDur = state.anim.duration || 5.0;
  let throwT = overrideThrowT != null ? overrideThrowT : (state.throwTime || 0.4);
  let catchT = overrideCatchT != null ? overrideCatchT : (state.catchTime || 0.6);
  if (throwT > 1.0) throwT = Math.min(0.8, throwT / animDur);
  if (catchT > 1.0) catchT = Math.min(0.95, catchT / animDur);
  if (catchT <= throwT) catchT = Math.min(0.95, throwT + 0.2);

  const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
  const qbPos = getOffensePosAt(qb, throwT);

  const defPlayers = state.defensePlay ? state.defensePlay.players : [];

  let bestReceiver = null;
  let bestScore = -9999;
  let bestInfo = null;

  receivers.forEach(r => {
    const rPos = getOffenseBasePosAt(r, catchT);
    let minDefDist = 999;
    let closestDef = null;

    defPlayers.forEach(d => {
      const dPos = getDefenderVisionPos(d, catchT);
      const dist = Math.hypot(rPos.x - dPos.x, rPos.y - dPos.y);
      if (dist < minDefDist) {
        minDefDist = dist;
        closestDef = d;
      }
    });

    // Passing lane risk (check defenders between QB and receiver at mid flight)
    const midT = (throwT + catchT) / 2;
    let laneInterferencePenalty = 0;
    defPlayers.forEach(d => {
      const dMid = getDefenderVisionPos(d, midT);
      const laneDist = distanceToSegment(dMid, qbPos, rPos);
      if (laneDist < 3.2) {
        laneInterferencePenalty += (3.2 - laneDist) * 3.5;
      }
    });

    // Yard gain bonus: downfield progress (y decreases going downfield)
    const scrimmageY = 65;
    const downfieldYards = Math.max(0, (scrimmageY - rPos.y) * 1.0);
    const depthBonus = Math.min(6.0, downfieldYards * 0.25);

    // Final openness score
    const score = minDefDist * 2.0 - laneInterferencePenalty + depthBonus;

    if (score > bestScore) {
      bestScore = score;
      bestReceiver = r;
      bestInfo = {
        receiver: r,
        posAtCatch: rPos,
        separation: minDefDist,
        closestDef: closestDef,
        score: score
      };
    }
  });

  return bestInfo;
}

let isCalculatingCutback = false;

/**
 * RB Smart Cutback Vision:
 * Senses incoming defenders downfield in runner's lane and progressively
 * steers into open gaps or behind lead blocker shields (zero warping, absolutely zero NaNs).
 */
function calculateSmartCutbackOffset(p, t, basePos) {
  if (isCalculatingCutback) return { dx: 0, dy: 0 };
  if (!state.aiSmartCutback || state.playType !== 'run') return { dx: 0, dy: 0 };
  const carrier = getRunPlayBallCarrierAt(t);
  if (!carrier || carrier.id !== p.id) return { dx: 0, dy: 0 };
  if (t < 0.20 || !state.defensePlay || !basePos || !isFinite(basePos.x) || !isFinite(basePos.y)) {
    return { dx: 0, dy: 0 };
  }

  isCalculatingCutback = true;
  try {
    const defPlayers = state.defensePlay.players;
    let directThreat = null;
    let minThreatDist = 999;

    // Scan for imminent defenders blocking current lane using safe vision positions
    defPlayers.forEach(d => {
      const dPos = getDefenderVisionPos(d, t);
      const dy = basePos.y - dPos.y; // positive if defender is downfield ahead of runner
      const dx = dPos.x - basePos.x;
      if (dy > 0.8 && dy < 8.5 && Math.abs(dx) < 4.8) {
        const dist = Math.hypot(dx, dy);
        if (isFinite(dist) && dist < minThreatDist) {
          minThreatDist = dist;
          directThreat = { d, dx, dy, dist: Math.max(0.1, dist) };
        }
      }
    });

    if (!directThreat) {
      return { dx: 0, dy: 0 };
    }

    // Evaluate left vs right gap viability
    let leftThreatWeight = 0;
    let rightThreatWeight = 0;
    defPlayers.forEach(d => {
      const dPos = getDefenderVisionPos(d, t);
      const dy = basePos.y - dPos.y;
      if (dy > 0.5 && dy < 10.0) {
        const dx = dPos.x - basePos.x;
        if (dx < 0 && dx > -7.5) leftThreatWeight += (8.0 - Math.abs(dx));
        if (dx > 0 && dx < 7.5) rightThreatWeight += (8.0 - dx);
      }
    });

    // Evaluate offensive blocker coverage (lead blockers give shield bonus)
    let leftBlockerSupport = 0;
    let rightBlockerSupport = 0;
    if (state.offensePlay) {
      state.offensePlay.players.forEach(ob => {
        if (ob.id === carrier.id) return;
        const obPos = getOffenseBasePosAt(ob, t);
        if (!obPos || !isFinite(obPos.x) || !isFinite(obPos.y)) return;
        const dy = basePos.y - obPos.y;
        if (dy > 0 && dy < 9.0) {
          const dx = obPos.x - basePos.x;
          if (dx < 0 && dx > -6.0) leftBlockerSupport += 3.0;
          if (dx > 0 && dx < 6.0) rightBlockerSupport += 3.0;
        }
      });
    }

    // Choose optimal cut direction (-1 for left cut, +1 for right cut)
    const leftScore = leftBlockerSupport * 1.5 - leftThreatWeight;
    const rightScore = rightBlockerSupport * 1.5 - rightThreatWeight;
    let cutDir = rightScore >= leftScore ? 1 : -1;
    if (Math.abs(directThreat.dx) > 0.5) {
      cutDir = directThreat.dx > 0 ? -1 : 1;
    }

    // Smooth progressive lateral steering without teleports/warps
    const urgency = Math.max(0, (8.5 - directThreat.dist) / 8.5);
    const timeProgress = Math.min(1.0, Math.max(0, (t - 0.20) / 0.35));
    const maxCutYards = 4.2;
    const targetOffset = cutDir * urgency * maxCutYards * timeProgress;

    return {
      dx: isFinite(targetOffset) ? targetOffset : 0,
      dy: 0
    };
  } finally {
    isCalculatingCutback = false;
  }
}

function getRunPlayBallCarrierAt(t) {
  if (!state.offensePlay) return null;
  const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
  let currentHolder = qb;
  const exchangeTimes = (state.runExchangeTimes && state.runExchangeTimes.length === (state.runSequence ? state.runSequence.length : 0))
    ? state.runExchangeTimes
    : calculateEffectiveRunExchangeTimes(false);

  // RPO / Trick Pass Check: if pass was chosen and ball is already caught
  const rpo = state.rpoPassState;
  if (rpo && rpo.isThrowing && t >= rpo.catchT && rpo.targetReceiver) {
    return rpo.targetReceiver;
  }

  for (let i = 0; i < state.runSequence.length; i++) {
    const step = state.runSequence[i];
    const optType = step.optionType || (step.isOption ? 'option' : 'none');
    const decision = state.runOptionDecisions ? state.runOptionDecisions[i] : 'give';
    const exT = exchangeTimes[i] != null ? exchangeTimes[i] : (0.25 + i * 0.25);

    // If step is PASS (Trick Pass / HB Pass):
    if (step.type === 'pass') {
      if (rpo && rpo.isThrowing) {
        if (t >= rpo.catchT && rpo.targetReceiver) {
          return rpo.targetReceiver;
        }
        if (t >= rpo.prevExT) {
          // Ball has reached the passer (waiting to throw or mid-flight)
          return rpo.passer || currentHolder;
        }
        // Ball has NOT reached the passer yet! Return the carrier along prior steps
        return currentHolder;
      }
      break;
    }

    if (optType === 'rpo') {
      if (decision === 'pass') {
        // RPO QB keep -> pass
        if (rpo && rpo.isThrowing) {
          if (t >= rpo.catchT && rpo.targetReceiver) return rpo.targetReceiver;
          return qb;
        }
        break;
      } else {
        // RPO decision === 'give' (50% run): Hand off to step.to
        if (t >= exT) {
          const nextP = state.offensePlay.players.find(p => p.id === step.to);
          if (nextP) currentHolder = nextP;
        }
        break; // 1回目でハンドオフした場合はそのままラン
      }
    }

    if (optType === 'option') {
      if (decision === 'give') {
        if (t >= exT) {
          const nextP = state.offensePlay.players.find(p => p.id === step.to);
          if (nextP) currentHolder = nextP;
        }
        break;
      } else {
        // decision === 'keep': stays with currentHolder and loops to next step
        continue;
      }
    }

    // Normal handoff/toss (optType === 'none'):
    if (t >= exT) {
      const nextP = state.offensePlay.players.find(p => p.id === step.to);
      if (nextP) currentHolder = nextP;
    }
  }

  return currentHolder;
}

function renderFootball(t, container) {
  if (t <= 0 || !state.offensePlay) return;
  const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
  if (!qb) return;

  const ball = document.createElement('div');
  ball.className = 'ball-marker';

  if (state.playType === 'run') {
    // RUN PLAY: Multi-step exchange, Option play, RPO, or QB run
    const rpo = state.rpoPassState;
    if (rpo && rpo.isThrowing && t >= rpo.throwT) {
      const passer = rpo.passer || rpo.qb;
      if (t < rpo.catchT) {
        // In-flight towards receiver
        state.catchReceiverId = null;
        const flyRatio = (t - rpo.throwT) / (rpo.catchT - rpo.throwT);
        const passerPos = getOffensePosAt(passer, rpo.throwT);
        const curX = passerPos.x + (rpo.targetX - passerPos.x) * flyRatio;
        const curY = passerPos.y + (rpo.targetY - passerPos.y) * flyRatio - Math.sin(flyRatio * Math.PI) * 7.0;
        ball.style.left = `${curX}%`;
        ball.style.top = `${curY}%`;
        const recLabel = rpo.targetReceiver ? rpo.targetReceiver.label : 'WR';
        state.aiDecisionInfo = {
          type: 'pass',
          text: rpo.isTrickPass
            ? `🎯 <b>トリックパス (投球中):</b> <span>${passer.label}</span> から <span>${recLabel}</span> へパス！`
            : `⚡ <b>RPO (パス展開):</b> QBキープから <span>${recLabel}</span> へクイックスロー！`
        };
      } else {
        // Caught by receiver!
        state.catchReceiverId = rpo.targetReceiver ? rpo.targetReceiver.id : null;
        const rPos = rpo.targetReceiver ? getOffensePosAt(rpo.targetReceiver, t) : { x: rpo.targetX, y: rpo.targetY };
        ball.style.left = `${rPos.x}%`;
        ball.style.top = `${rPos.y}%`;
        const recLabel = rpo.targetReceiver ? rpo.targetReceiver.label : 'WR';
        state.aiDecisionInfo = {
          type: 'pass',
          text: rpo.isTrickPass
            ? `🎯 <b>トリックパス (捕球成功):</b> <span>${recLabel}</span> がキャッチして進撃！`
            : `⚡ <b>RPO (捕球成功):</b> <span>${recLabel}</span> がキャッチして進撃！`
        };
      }
      container.appendChild(ball);
      return;
    }

    // Exchange animation (Toss flight or Handoff mesh slide)
    const exchangeTimes = (state.runExchangeTimes && state.runExchangeTimes.length === (state.runSequence ? state.runSequence.length : 0))
      ? state.runExchangeTimes
      : calculateEffectiveRunExchangeTimes(false);
    const animDur = state.anim.duration || 5.0;

    let isExchanging = false;
    if (state.runSequence) {
      let curHolder = qb;
      for (let i = 0; i < state.runSequence.length; i++) {
        const step = state.runSequence[i];
        if (step.type === 'pass') break;

        const fromP = state.offensePlay.players.find(p => p.id === step.from) || curHolder;
        const toP = state.offensePlay.players.find(p => p.id === step.to);
        const exT = (exchangeTimes[i] != null) ? exchangeTimes[i] : (0.25 + i * 0.25);

        // Toss Flight: 0.35s flight duration with parabolic arc
        if (step.type === 'toss' && toP && toP.id !== fromP.id) {
          const tossDurT = 0.35 / animDur;
          const tStart = Math.max(0, exT - tossDurT * 0.6);
          const tEnd = Math.min(1.0, exT + tossDurT * 0.4);

          if (t >= tStart && t <= tEnd) {
            const flightRatio = (t - tStart) / (tEnd - tStart);
            const pFrom = getOffensePosAt(fromP, t);
            const pTo = getOffensePosAt(toP, t);
            const curX = pFrom.x + (pTo.x - pFrom.x) * flightRatio;
            const curY = pFrom.y + (pTo.y - pFrom.y) * flightRatio - Math.sin(flightRatio * Math.PI) * 4.0;

            ball.style.left = `${curX}%`;
            ball.style.top = `${curY}%`;
            ball.style.transform = `translate(-50%, -50%) rotate(${flightRatio * 360}deg)`;

            state.aiDecisionInfo = {
              type: 'run',
              text: `🏉 <b>トス (手順 ${i + 1}):</b> <span>${fromP.label}</span> から <span>${toP.label}</span> へトス！`
            };
            isExchanging = true;
            container.appendChild(ball);
            return;
          }
        }

        // Handoff Mesh: 0.18s smooth hand-to-hand slide
        if (step.type === 'handoff' && toP && toP.id !== fromP.id) {
          const meshDurT = 0.18 / animDur;
          const tStart = Math.max(0, exT - meshDurT * 0.5);
          const tEnd = Math.min(1.0, exT + meshDurT * 0.5);

          if (t >= tStart && t <= tEnd) {
            const meshRatio = (t - tStart) / (tEnd - tStart);
            const smoothRatio = 0.5 - 0.5 * Math.cos(meshRatio * Math.PI);
            const pFrom = getOffensePosAt(fromP, t);
            const pTo = getOffensePosAt(toP, t);
            const curX = pFrom.x + (pTo.x - pFrom.x) * smoothRatio;
            const curY = pFrom.y + (pTo.y - pFrom.y) * smoothRatio;

            ball.style.left = `${curX}%`;
            ball.style.top = `${curY}%`;

            state.aiDecisionInfo = {
              type: 'run',
              text: `🤝 <b>ハンドオフ (手順 ${i + 1}):</b> <span>${fromP.label}</span> から <span>${toP.label}</span> へ受け渡し！`
            };
            isExchanging = true;
            container.appendChild(ball);
            return;
          }
        }

        if (toP) curHolder = toP;
      }
    }

    // Normal run ball holder (or RPO/Trick Pass before throw)
    const currentHolder = getRunPlayBallCarrierAt(t) || qb;
    const pos = getOffensePosAt(currentHolder, t);
    ball.style.left = `${pos.x}%`;
    ball.style.top = `${pos.y}%`;

    // Real-time HUD feedback for Option, RPO, Trick Pass, or Smart Cutback
    const firstStep = state.runSequence && state.runSequence[0];
    const optType = firstStep ? (firstStep.optionType || (firstStep.isOption ? 'option' : 'none')) : 'none';
    const dec = state.runOptionDecisions ? state.runOptionDecisions[0] : 'give';
    const exT = (state.runExchangeTimes && state.runExchangeTimes[0] != null) ? state.runExchangeTimes[0] : 0.25;

    if (rpo && rpo.isTrickPass && t >= rpo.prevExT && t < rpo.throwT) {
      const passer = rpo.passer || rpo.qb;
      state.aiDecisionInfo = {
        type: 'pass',
        text: `🎯 <b>トリックパス:</b> ボールを受けた <span>${passer.label}</span> がパス体勢に入った！`
      };
    } else if (optType === 'rpo' && dec === 'give' && t >= exT) {
      const toP = state.offensePlay ? state.offensePlay.players.find(p => p.id === firstStep.to) : null;
      state.aiDecisionInfo = {
        type: 'run',
        text: `⚡ <b>RPO (ラン選択):</b> パス守備の警戒を見て <span>${toP ? toP.label : 'RB'}</span> へハンドオフ！`
      };
    } else if (optType === 'rpo' && dec === 'pass' && t < (rpo ? rpo.throwT : 0.4)) {
      state.aiDecisionInfo = {
        type: 'pass',
        text: `⚡ <b>RPO:</b> QBがランフェイクからキープ！パスの機を窺う...`
      };
    } else if (optType === 'option' && t >= exT) {
      if (dec === 'keep') {
        state.aiDecisionInfo = {
          type: 'run',
          text: `🎲 <b>オプション (キープ):</b> QBがキープしてランを選択！`
        };
      } else {
        const toP = state.offensePlay ? state.offensePlay.players.find(p => p.id === firstStep.to) : null;
        state.aiDecisionInfo = {
          type: 'run',
          text: `🎲 <b>オプション (ピッチ):</b> <span>${toP ? toP.label : 'RB'}</span> へボールを渡してオープンへ！`
        };
      }
    } else if (state.aiSmartCutback && t >= 0.20) {
      const basePos = getOffenseBasePosAt(currentHolder, t);
      const cut = calculateSmartCutbackOffset(currentHolder, t, basePos);
      if (Math.abs(cut.dx) > 0.5) {
        const sideText = cut.dx > 0 ? '右サイドのオープンギャップ' : '左サイドのオープンギャップ';
        state.aiDecisionInfo = {
          type: 'run',
          text: `🏃 <b>RBスマートカットバック:</b> 密集を回避し<span>${sideText}</span>へカット！`
        };
      } else if (state.aiDecisionInfo && state.aiDecisionInfo.type === 'run') {
        state.aiDecisionInfo = null;
      }
    } else if (state.aiDecisionInfo && state.aiDecisionInfo.type === 'run') {
      state.aiDecisionInfo = null;
    }
  } else {
    // PASS PLAY: Straight throw from QB to target
    const pass = state.resolvedPass || resolvePassPlayState(t);
    if (!pass) return;

    const { throwT, catchT, qbPos, targetX, targetY, nearestReceiver, isCatchable } = pass;

    if (t < throwT) {
      // In QB's hands
      ball.style.left = `${qbPos.x}%`;
      ball.style.top = `${qbPos.y}%`;
    } else if (t < catchT) {
      // In mid-air flight towards landing spot
      const flyRatio = (t - throwT) / (catchT - throwT);
      const curX = qbPos.x + (targetX - qbPos.x) * flyRatio;
      const curY = qbPos.y + (targetY - qbPos.y) * flyRatio - Math.sin(flyRatio * Math.PI) * 7.0;
      ball.style.left = `${curX}%`;
      ball.style.top = `${curY}%`;
    } else {
      if (isCatchable && nearestReceiver) {
        // PASS COMPLETE: Caught by receiver, receiver sprints straight
        const rPos = getOffensePosAt(nearestReceiver, t);
        ball.style.left = `${rPos.x}%`;
        ball.style.top = `${rPos.y}%`;
      } else {
        // INCOMPLETE: No receiver nearby! Ball hits ground and rolls slowly forward
        const dx = targetX - qbPos.x;
        const dy = targetY - qbPos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        const rollTimeSec = (t - catchT) * state.anim.duration;
        const rollDist = Math.min(3.5, rollTimeSec * 1.8 * Math.max(0, 1.0 - rollTimeSec / 2.2));
        const curX = targetX + nx * rollDist;
        const curY = targetY + ny * rollDist;

        ball.style.left = `${curX}%`;
        ball.style.top = `${curY}%`;
      }
    }
  }

  container.appendChild(ball);
}


/* ─── Interactive Handles (Waypoints, Pass Target, Defense) ── */
function renderInteractiveHandles(container) {
  // 1. Pass Target Landing Handle (Straight arrow end)
  if (state.playType === 'pass' && state.mode !== 'defense') {
    const ptHandle = document.createElement('div');
    ptHandle.className = 'pass-landing-handle';
    ptHandle.style.left = `${state.passTargetPos.x}%`;
    ptHandle.style.top = `${state.passTargetPos.y}%`;
    ptHandle.innerHTML = '🎯';
    ptHandle.title = 'パス着地点 (ドラッグして移動)';
    ptHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      state.isDragging = true;
      state.dragTarget = { type: 'pass_target' };
    });
    container.appendChild(ptHandle);
  }

  // Pre-Snap Shift Handles
  if (state.mode !== 'defense' && state.offensePlay) {
    (state.shifts || []).forEach((s, idx) => {
      const h = document.createElement('div');
      h.className = 'shift-handle';
      h.style.left = `${s.destX}%`;
      h.style.top = `${s.destY}%`;
      h.innerText = `S${idx + 1}`;
      h.title = `シフト ${idx + 1} 移動先 (ドラッグで変更)`;
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.isDragging = true;
        state.dragTarget = { type: 'shift_dest', index: idx };
      });
      container.appendChild(h);
    });

    // Pre-Snap Motion Handle
    if (state.motion) {
      const h = document.createElement('div');
      h.className = 'motion-handle';
      h.style.left = `${state.motion.destX}%`;
      h.style.top = `${state.motion.destY}%`;
      h.innerText = 'M';
      h.title = 'モーション移動先 (ドラッグで変更)';
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.isDragging = true;
        state.dragTarget = { type: 'motion_dest' };
      });
      container.appendChild(h);
    }
  }

  if (!state.selectedPlayer) return;
  const { side, id } = state.selectedPlayer;

  // 2. Offense Route Handles (Minimal clean handles to keep lines dominant)
  if (side === 'offense' && state.offensePlay) {
    const p = state.offensePlay.players.find(x => x.id === id);
    if (!p || !p.route) return;

    p.route.forEach((wp, idx) => {
      // Only show handle on turns or endpoints to keep lines clean
      const h = document.createElement('div');
      h.className = 'waypoint-handle';
      h.style.left = `${wp.x}%`;
      h.style.top = `${wp.y}%`;
      h.title = p.routeType === 'block' ? 'ブロック位置 (ドラッグで移動)' : `経由点 ${idx + 1}`;
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.isDragging = true;
        state.dragTarget = { type: 'waypoint', side: 'offense', id: p.id, index: idx };
      });
      container.appendChild(h);
    });
  }

  // 3. Defense Interactive Handles
  if (side === 'defense' && state.defensePlay) {
    const p = state.defensePlay.players.find(x => x.id === id);
    if (!p) return;

    // ZONE: Center move handle + Edge resize handle
    if (p.coverage === 'zone' && p.zoneX != null && p.zoneY != null) {
      const zRadius = p.zoneRadius || 7;

      // Center move handle
      const centerH = document.createElement('div');
      centerH.className = 'waypoint-handle';
      centerH.style.backgroundColor = '#38bdf8';
      centerH.style.left = `${p.zoneX}%`;
      centerH.style.top = `${p.zoneY}%`;
      centerH.title = 'ゾーン中心 (ドラッグで移動)';
      centerH.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.isDragging = true;
        state.dragTarget = { type: 'zone_center', side: 'defense', id: p.id };
      });
      container.appendChild(centerH);

      // Edge resize handle
      const edgeH = document.createElement('div');
      edgeH.className = 'waypoint-handle';
      edgeH.style.backgroundColor = '#a855f7';
      edgeH.style.left = `${p.zoneX + zRadius}%`;
      edgeH.style.top = `${p.zoneY}%`;
      edgeH.title = 'ゾーン拡大・縮小ハンドル';
      edgeH.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.isDragging = true;
        state.dragTarget = { type: 'zone_radius', side: 'defense', id: p.id };
      });
      container.appendChild(edgeH);
    }

    // MAN COVERAGE: Draggable target handle
    if (p.coverage === 'man') {
      const targetP = state.offensePlay ? state.offensePlay.players.find(op => op.id === p.target) : null;
      if (targetP) {
        const manH = document.createElement('div');
        manH.className = 'waypoint-handle';
        manH.style.backgroundColor = '#f43f5e';
        manH.style.left = `${targetP.x}%`;
        manH.style.top = `${targetP.y}%`;
        manH.title = 'マンカバー相手変更 (ドラッグして別のオフェンス選手へ)';
        manH.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          state.isDragging = true;
          state.dragTarget = { type: 'man_arrow', side: 'defense', id: p.id };
        });
        container.appendChild(manH);
      }
    }

    // RUSH: Custom destination handle
    if (p.coverage === 'rush') {
      const endX = p.rushX != null ? p.rushX : (p.x + (50 - p.x) * 0.4);
      const endY = p.rushY != null ? p.rushY : (p.y + 12);
      const rushH = document.createElement('div');
      rushH.className = 'waypoint-handle';
      rushH.style.backgroundColor = '#ef4444';
      rushH.style.left = `${endX}%`;
      rushH.style.top = `${endY}%`;
      rushH.title = 'ラッシュ行き先 (ドラッグで変更)';
      rushH.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.isDragging = true;
        state.dragTarget = { type: 'rush_dest', side: 'defense', id: p.id };
      });
      container.appendChild(rushH);
    }
  }
}


/* ─── Route & Coverage SVG ──────────────────────────────────── */
function renderRoutesAndCoverage() {
  const ns = 'http://www.w3.org/2000/svg';
  const routesG = document.getElementById('svgRoutes');
  const covG = document.getElementById('svgCoverage');
  const zonesG = document.getElementById('svgZones');
  const presnapG = document.getElementById('svgPresnap');
  if (!routesG || !covG || !zonesG) return;

  routesG.innerHTML = '';
  covG.innerHTML = '';
  zonesG.innerHTML = '';
  if (presnapG) presnapG.innerHTML = '';

  // 0. Pre-Snap Shift & Motion Trails
  if (presnapG && state.mode !== 'defense' && state.offensePlay) {
    (state.shifts || []).forEach(s => {
      const p = state.offensePlay.players.find(x => x.id === s.playerId);
      if (!p) return;
      const pts = [ { x: p.x, y: p.y }, ...(s.path || [{ x: s.destX, y: s.destY }]) ];
      const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#a855f7');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-dasharray', '3,2');
      path.setAttribute('marker-end', 'url(#arrow-purple)');
      presnapG.appendChild(path);
    });

    if (state.motion) {
      const p = state.offensePlay.players.find(x => x.id === state.motion.playerId);
      if (p) {
        const s = (state.shifts || []).find(x => x.playerId === p.id);
        const startX = s ? s.destX : p.x;
        const startY = s ? s.destY : p.y;
        const pts = [ { x: startX, y: startY }, ...(state.motion.path || [{ x: state.motion.destX, y: state.motion.destY }]) ];
        const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#06b6d4');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-dasharray', '3,2');
        path.setAttribute('marker-end', 'url(#arrow-cyan)');
        presnapG.appendChild(path);
      }
    }

    // Active Pre-Snap Drawing Stroke (live feedback)
    if (state.isDrawingPresnap && state.drawingPresnapPoints && state.drawingPresnapPoints.length > 1) {
      const d = state.drawingPresnapPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
      const stroke = document.createElementNS(ns, 'path');
      stroke.setAttribute('d', d);
      stroke.setAttribute('stroke', state.isDrawingPresnap === 'shift' ? '#c084fc' : '#22d3ee');
      stroke.setAttribute('stroke-width', '2.4');
      stroke.setAttribute('fill', 'none');
      stroke.setAttribute('stroke-linecap', 'round');
      stroke.setAttribute('stroke-dasharray', '4,2');
      presnapG.appendChild(stroke);
    }
  }

  // 1. Offense Routes & Block Lines
  if (state.showRoutes && state.mode !== 'defense' && state.offensePlay) {
    state.offensePlay.players.forEach(p => {
      const isPass = p.routeType === 'pass';
      const isRun = p.routeType === 'run';
      const isBlock = p.routeType === 'block';
      const isSelected = state.selectedPlayer && state.selectedPlayer.id === p.id;

      let strokeColor = '#fbbf24';
      let markerId = 'url(#arrow-gold)';
      if (isRun) {
        strokeColor = '#10b981';
        markerId = 'url(#arrow-green)';
      } else if (isBlock) {
        strokeColor = '#38bdf8';
      }

      const startP = getFinalPreSnapPos(p);
      const dx = startP.x - p.x;
      const dy = startP.y - p.y;

      let pts = [];
      if (p.route && p.route.length > 0) {
        pts = [startP, ...p.route.map(wp => ({ x: wp.x + dx, y: wp.y + dy }))];
      } else if (isBlock) {
        // If blocker has no waypoints, draw a clear default engagement line in front
        pts = [startP, { x: startP.x, y: state.playType === 'run' ? startP.y - 4.5 : startP.y + 2.5 }];
      } else {
        return;
      }

      const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', isSelected ? '2.4' : (isBlock ? '2.0' : '1.4'));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      if (!isBlock) path.setAttribute('marker-end', markerId);
      routesG.appendChild(path);

      // Block T-bar (Bold, clearly visible crossbar)
      if (isBlock && pts.length >= 2) {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
        const barLen = 2.4; // Clearly visible width
        const x1 = last.x + Math.cos(angle + Math.PI / 2) * barLen;
        const y1 = last.y + Math.sin(angle + Math.PI / 2) * barLen;
        const x2 = last.x + Math.cos(angle - Math.PI / 2) * barLen;
        const y2 = last.y + Math.sin(angle - Math.PI / 2) * barLen;

        const tbar = document.createElementNS(ns, 'line');
        tbar.setAttribute('x1', `${x1}`);
        tbar.setAttribute('y1', `${y1}`);
        tbar.setAttribute('x2', `${x2}`);
        tbar.setAttribute('y2', `${y2}`);
        tbar.setAttribute('stroke', strokeColor);
        tbar.setAttribute('stroke-width', '3.0');
        tbar.setAttribute('stroke-linecap', 'square');
        routesG.appendChild(tbar);
      }
    });

    // B. Straight Pass Arrow from QB to passTargetPos (Clean dashed trajectory)
    if (state.playType === 'pass') {
      const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
      if (qb) {
        const qbStart = getFinalPreSnapPos(qb);
        const passArrow = document.createElementNS(ns, 'line');
        passArrow.setAttribute('x1', `${qbStart.x}`);
        passArrow.setAttribute('y1', `${qbStart.y}`);
        passArrow.setAttribute('x2', `${state.passTargetPos.x}`);
        passArrow.setAttribute('y2', `${state.passTargetPos.y}`);
        passArrow.setAttribute('stroke', '#fbbf24');
        passArrow.setAttribute('stroke-width', '1.4');
        passArrow.setAttribute('stroke-dasharray', '3,2');
        passArrow.setAttribute('marker-end', 'url(#arrow-gold)');
        routesG.appendChild(passArrow);
      }
    }
  }

  // 2. Defense Coverage & Zones (Classic clean layout, natural marker sizes)
  if (state.showCoverage && state.mode !== 'offense' && state.defensePlay) {
    state.defensePlay.players.forEach(p => {
      if (p.coverage === 'man') {
        const targetPlayer = state.offensePlay ? state.offensePlay.players.find(op => op.id === p.target) : null;
        if (targetPlayer) {
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', `${p.x}`);
          line.setAttribute('y1', `${p.y}`);
          line.setAttribute('x2', `${targetPlayer.x}`);
          line.setAttribute('y2', `${targetPlayer.y}`);
          line.setAttribute('stroke', '#f43f5e');
          line.setAttribute('stroke-width', '1.2');
          line.setAttribute('stroke-dasharray', '2.5,2.5');
          line.setAttribute('marker-end', 'url(#arrow-red)');
          covG.appendChild(line);
        }
      } else if (p.coverage === 'zone') {
        if (state.showZoneCircles && p.zoneX != null && p.zoneY != null) {
          const zRadius = p.zoneRadius || 7;

          const dropLine = document.createElementNS(ns, 'line');
          dropLine.setAttribute('x1', `${p.x}`);
          dropLine.setAttribute('y1', `${p.y}`);
          dropLine.setAttribute('x2', `${p.zoneX}`);
          dropLine.setAttribute('y2', `${p.zoneY}`);
          dropLine.setAttribute('stroke', '#60a5fa');
          dropLine.setAttribute('stroke-width', '1.0');
          dropLine.setAttribute('stroke-dasharray', '3,2');
          covG.appendChild(dropLine);

          const zoneCircle = document.createElementNS(ns, 'circle');
          zoneCircle.setAttribute('cx', `${p.zoneX}`);
          zoneCircle.setAttribute('cy', `${p.zoneY}`);
          zoneCircle.setAttribute('r', `${zRadius}`);
          zoneCircle.setAttribute('fill', 'rgba(59, 130, 246, 0.12)');
          zoneCircle.setAttribute('stroke', '#3b82f6');
          zoneCircle.setAttribute('stroke-width', '1.0');
          zoneCircle.setAttribute('stroke-dasharray', '2,2');
          zonesG.appendChild(zoneCircle);

          const zoneText = document.createElementNS(ns, 'text');
          zoneText.setAttribute('x', `${p.zoneX}`);
          zoneText.setAttribute('y', `${p.zoneY + 1.5}`);
          zoneText.setAttribute('fill', '#93c5fd');
          zoneText.setAttribute('font-size', '3.0');
          zoneText.setAttribute('text-anchor', 'middle');
          zoneText.setAttribute('font-weight', 'bold');
          zoneText.textContent = p.label;
          zonesG.appendChild(zoneText);
        }
      } else if (p.coverage === 'rush') {
        const endX = p.rushX != null ? p.rushX : (p.x + (50 - p.x) * 0.4);
        const endY = p.rushY != null ? p.rushY : (p.y + 12);
        const arrow = document.createElementNS(ns, 'line');
        arrow.setAttribute('x1', `${p.x}`);
        arrow.setAttribute('y1', `${p.y}`);
        arrow.setAttribute('x2', `${endX}`);
        arrow.setAttribute('y2', `${endY}`);
        arrow.setAttribute('stroke', '#ef4444');
        arrow.setAttribute('stroke-width', '1.4');
        arrow.setAttribute('marker-end', 'url(#arrow-red)');
        covG.appendChild(arrow);
      }
    });
  }
}



/* ─── Physics, Trajectory & Normalized Constant-Speed Engine ─── */
function getPlayerSpeed(player) {
  const type = player.type;
  if (type === 'OL' || type === 'C' || type === 'OG' || type === 'OT') return 4.2; // Slow offensive linemen
  if (type === 'DL' || type === 'DT' || type === 'DE') return 4.5; // Defensive linemen
  if (type === 'QB') {
    if (state.playType === 'run') return 9.5;
    return 5.5; // QB dropback
  }
  if (type === 'LB' || type === 'MLB' || type === 'OLB') return 8.0;
  // WR, RB, TE, CB, S, FS, SS
  return 10.5; // Constant standard speed for skill players
}

/* ─── Pre-Snap Shift & Motion Helpers ───────────────────────── */
function calculatePathDistance(pts) {
  if (!pts || pts.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
  }
  return total;
}

function getPosAlongPathAtDist(pts, targetDist) {
  if (!pts || pts.length === 0) return { x: 50, y: 65 };
  if (pts.length === 1 || targetDist <= 0) return { x: pts[0].x, y: pts[0].y };

  let accumulated = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
    if (accumulated + d >= targetDist) {
      const frac = d > 0 ? (targetDist - accumulated) / d : 0;
      return {
        x: pts[i].x + (pts[i+1].x - pts[i].x) * frac,
        y: pts[i].y + (pts[i+1].y - pts[i].y) * frac
      };
    }
    accumulated += d;
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}

function getShiftStepDuration(shift) {
  const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === shift.playerId) : null;
  const speed = getPlayerSpeed(p || { type: 'WR' });
  const pStart = p ? { x: p.x, y: p.y } : { x: 50, y: 65 };
  const pts = [ pStart, ...(shift.path || [{ x: shift.destX, y: shift.destY }]) ];
  const dist = calculatePathDistance(pts);
  return Math.max(0.6, dist / speed);
}

function getMotionStepDuration(motion) {
  if (!motion) return 0;
  const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === motion.playerId) : null;
  const speed = getPlayerSpeed(p || { type: 'WR' });
  const pShift = (state.shifts || []).find(s => s.playerId === motion.playerId);
  const pStart = pShift ? { x: pShift.destX, y: pShift.destY } : (p ? { x: p.x, y: p.y } : { x: 50, y: 65 });
  const pts = [ pStart, ...(motion.path || [{ x: motion.destX, y: motion.destY }]) ];
  const dist = calculatePathDistance(pts);
  return Math.max(0.6, dist / speed);
}

function getPreSnapDuration() {
  const shifts = state.shifts || [];
  let total = 0;
  for (const s of shifts) {
    total += getShiftStepDuration(s);
  }
  if (state.motion) {
    total += getMotionStepDuration(state.motion);
  }
  return total;
}

function getTotalDuration() {
  return getPreSnapDuration() + state.anim.duration;
}

function getManCoverageTarget(defender) {
  if (!state.offensePlay || !state.offensePlay.players) return null;
  if (defender.target) {
    const found = state.offensePlay.players.find(x => x.id === defender.target);
    if (found) return found;
  }
  // Fallback: Closest skill receiver in initial setup
  const skillPlayers = state.offensePlay.players.filter(op => op.type === 'WR' || op.type === 'TE' || op.type === 'RB');
  if (skillPlayers.length === 0) return null;
  let nearest = skillPlayers[0];
  let minDist = Infinity;
  for (const sp of skillPlayers) {
    const d = Math.hypot(sp.x - defender.x, sp.y - defender.y);
    if (d < minDist) {
      minDist = d;
      nearest = sp;
    }
  }
  return nearest;
}

function getFinalPreSnapPos(player) {
  if (!player) return { x: 50, y: 65 };

  // Man coverage defender tracks receiver's final pre-snap destination strictly in horizontal parallel
  if (player.coverage === 'man') {
    const targetOp = getManCoverageTarget(player);
    if (targetOp) {
      const opFinal = getFinalPreSnapPos(targetOp);
      const deltaX = opFinal.x - targetOp.x;
      const defX = Math.max(3, Math.min(97, player.x + deltaX));
      const defY = Math.min(63.5, player.y); // Never reacts vertically, never crosses LOS
      return { x: defX, y: defY };
    }
  }

  if (state.motion && state.motion.playerId === player.id) {
    return { x: state.motion.destX, y: state.motion.destY };
  }
  if (state.shifts && state.shifts.length > 0) {
    const s = state.shifts.find(x => x.playerId === player.id);
    if (s) {
      return { x: s.destX, y: s.destY };
    }
  }
  return { x: player.x, y: player.y };
}

function getPreSnapPos(player, curSec) {
  if (!player) return { x: 50, y: 65 };

  // 1. Man coverage defender: follows motion and shift in real time with parallel horizontal tracking (no vertical reaction, stays on def side of LOS)
  if (player.coverage === 'man') {
    const targetOp = getManCoverageTarget(player);
    if (targetOp) {
      const opPosNow = getPreSnapPos(targetOp, curSec);
      const deltaX = opPosNow.x - targetOp.x;
      const defX = Math.max(3, Math.min(97, player.x + deltaX));
      const defY = Math.min(63.5, player.y);
      return { x: defX, y: defY };
    }
  }

  // Other defenders (zone, rush) hold their ground pre-snap
  if (player.side === 'defense' || (state.defensePlay && state.defensePlay.players.some(dp => dp.id === player.id))) {
    return { x: player.x, y: player.y };
  }

  // 2. Offense Players: Sequential Shifts, then Motion
  const shifts = state.shifts || [];
  let accumulatedTime = 0;

  for (let i = 0; i < shifts.length; i++) {
    const s = shifts[i];
    const stepDur = getShiftStepDuration(s);
    const stepStartTime = accumulatedTime;
    const stepEndTime = accumulatedTime + stepDur;

    if (curSec < stepEndTime) {
      if (player.id === s.playerId) {
        const elapsed = Math.max(0, curSec - stepStartTime);
        const pStart = { x: player.x, y: player.y };
        const pts = [ pStart, ...(s.path || [{ x: s.destX, y: s.destY }]) ];
        const speed = getPlayerSpeed(player);
        const distTraveled = Math.min(calculatePathDistance(pts), speed * elapsed);
        return getPosAlongPathAtDist(pts, distTraveled);
      }
      const prevShift = shifts.slice(0, i).find(x => x.playerId === player.id);
      if (prevShift) {
        return { x: prevShift.destX, y: prevShift.destY };
      }
      return { x: player.x, y: player.y };
    }

    accumulatedTime = stepEndTime;
  }

  // Base position after all shifts have settled
  let basePos = { x: player.x, y: player.y };
  const s = shifts.find(x => x.playerId === player.id);
  if (s) {
    basePos = { x: s.destX, y: s.destY };
  }

  // 3. Motion Phase
  if (state.motion) {
    const m = state.motion;
    const motionDur = getMotionStepDuration(m);
    const motionStartTime = accumulatedTime;
    const motionEndTime = accumulatedTime + motionDur;

    if (player.id === m.playerId) {
      const elapsed = Math.max(0, curSec - motionStartTime);
      const pts = [ basePos, ...(m.path || [{ x: m.destX, y: m.destY }]) ];
      const speed = getPlayerSpeed(player);
      const distTraveled = Math.min(calculatePathDistance(pts), speed * elapsed);
      return getPosAlongPathAtDist(pts, distTraveled);
    }
  }

  return basePos;
}

/**
 * Calculates offense position at progress t.
 * Pure constant speed movement: moves at fixed distance per second without arbitrary acceleration.
 * After catching a pass, the receiver sprints straight forward towards the endzone.
 */
function getOffensePosAt(p, t) {
  const startP = getFinalPreSnapPos(p);
  if (t <= 0 || !p.route || p.route.length === 0) {
    return { x: startP.x, y: startP.y };
  }

  // 1. Post-catch straight run for the receiver who caught the pass (Pass Play or RPO Pass)
  const isPassCatch = (state.playType === 'pass' && state.catchReceiverId === p.id && t >= state.catchTime);
  const isRpoCatch = (state.playType === 'run' && state.rpoPassState && state.rpoPassState.isThrowing && state.catchReceiverId === p.id && t >= state.rpoPassState.catchT);

  if (isPassCatch || isRpoCatch) {
    const cTime = isRpoCatch ? state.rpoPassState.catchT : state.catchTime;
    const catchPos = getOffenseBasePosAt(p, cTime);
    const speed = getPlayerSpeed(p);
    const postCatchSec = (t - cTime) * state.anim.duration;
    const postCatchDist = speed * postCatchSec;
    return {
      x: catchPos.x,
      y: Math.max(0, catchPos.y - postCatchDist) // Straight up towards endzone
    };
  }

  const basePos = getOffenseBasePosAt(p, t);

  // 2. RB Smart Cutback dynamic steering for ball carrier
  if (state.playType === 'run' && state.aiSmartCutback && !isCalculatingCutback) {
    const carrier = getRunPlayBallCarrierAt(t);
    if (carrier && carrier.id === p.id) {
      const cut = calculateSmartCutbackOffset(p, t, basePos);
      const safeDx = (cut && isFinite(cut.dx)) ? cut.dx : 0;
      const safeDy = (cut && isFinite(cut.dy)) ? cut.dy : 0;
      return {
        x: Math.max(5, Math.min(95, basePos.x + safeDx)),
        y: Math.max(0, Math.min(100, basePos.y + safeDy))
      };
    }
  }

  return {
    x: (basePos && isFinite(basePos.x)) ? basePos.x : startP.x,
    y: (basePos && isFinite(basePos.y)) ? basePos.y : startP.y
  };
}

function getOffenseBasePosAt(p, t) {
  const startP = getFinalPreSnapPos(p);
  if (t <= 0 || !p.route || p.route.length === 0) {
    return { x: startP.x, y: startP.y };
  }

  // If player shifted or motioned, route translates relative to new start point
  const dx = startP.x - p.x;
  const dy = startP.y - p.y;
  const pts = [startP, ...p.route.map(wp => ({ x: wp.x + dx, y: wp.y + dy }))];
  const segDists = [];
  let totalDist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
    segDists.push(d);
    totalDist += d;
  }

  if (totalDist === 0) return { x: p.x, y: p.y };

  const speed = getPlayerSpeed(p);
  const elapsedSec = t * state.anim.duration;
  const distTraveled = speed * elapsedSec;

  if (distTraveled >= totalDist) {
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y };
  }

  let accumulated = 0;
  for (let i = 0; i < segDists.length; i++) {
    const d = segDists[i];
    if (accumulated + d >= distTraveled) {
      const frac = d > 0 ? (distTraveled - accumulated) / d : 0;
      return {
        x: pts[i].x + (pts[i+1].x - pts[i].x) * frac,
        y: pts[i].y + (pts[i+1].y - pts[i].y) * frac
      };
    }
    accumulated += d;
  }

  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}

function findNearestReceiverTo(pos, handOffTargetId = null) {
  if (!state.offensePlay) return null;
  const receivers = getEligiblePassReceivers(handOffTargetId);
  if (receivers.length === 0) return null;
  let best = null;
  let bestDist = 999;
  receivers.forEach(r => {
    // Check receiver location near catch time
    const rPos = getOffenseBasePosAt(r, state.catchTime);
    const d = Math.hypot(rPos.x - pos.x, rPos.y - pos.y);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  });
  return best;
}


/**
 * Helper to determine which rusher is engaged by which offensive blocker.
 * Rule: 1 offensive blocker can block at most ONE rusher (nearest one in front).
 * Excess rushers or rushers from unoccupied gaps are UNBLOCKED and can blitz/penetrate freely!
 */
function getRusherBlockStatus(rusher) {
  if (!state.offensePlay) return { isBlocked: false, blocker: null };

  const blockers = state.offensePlay.players.filter(op => op.routeType === 'block');
  const rushers = (state.defensePlay ? state.defensePlay.players : []).filter(dp => dp.coverage === 'rush');

  // Pair each blocker with their single nearest rusher
  const matchedRushers = new Set();
  // Sort blockers from center outward or by y to match realistic assignment
  blockers.forEach(b => {
    let nearestR = null;
    let minDist = 999;
    rushers.forEach(r => {
      if (matchedRushers.has(r.id)) return; // Already blocked by someone else!
      // Must be in front/near line of engagement
      const dist = Math.hypot(b.x - r.x, b.y - r.y);
      if (dist < 8.0 && r.y <= b.y + 3) {
        if (dist < minDist) {
          minDist = dist;
          nearestR = r;
        }
      }
    });

    if (nearestR) {
      matchedRushers.add(nearestR.id);
    }
  });

  return { isBlocked: matchedRushers.has(rusher.id) };
}

/**
 * Resolves active option or RPO step context during a run play.
 */
function getActiveOptionContext() {
  if (state.playType !== 'run' || !state.runSequence || state.runSequence.length === 0) return null;
  const exchangeTimes = (state.runExchangeTimes && state.runExchangeTimes.length === state.runSequence.length)
    ? state.runExchangeTimes
    : calculateEffectiveRunExchangeTimes(false);
  for (let i = 0; i < state.runSequence.length; i++) {
    const step = state.runSequence[i];
    const optType = step.optionType || (step.isOption ? 'option' : 'none');
    if (optType === 'option' || optType === 'rpo') {
      const qb = state.offensePlay ? state.offensePlay.players.find(p => p.type === 'QB') : null;
      const fromP = state.offensePlay ? state.offensePlay.players.find(p => p.id === step.from) : qb;
      const toP = state.offensePlay ? state.offensePlay.players.find(p => p.id === step.to) : null;
      const exT = (exchangeTimes[i] != null) ? exchangeTimes[i] : 0.25;
      const animDur = state.anim.duration || 5.0;
      // 1.0 second reaction window after mesh/handoff
      const reactEndT = Math.min(1.0, exT + (1.0 / animDur));
      return {
        stepIndex: i,
        optType,
        fromP: fromP || qb,
        toP: toP,
        exT,
        reactEndT
      };
    }
  }
  return null;
}

function getDefenderOptionAssignment(p) {
  if (state.defenseOptionAssignments && state.defenseOptionAssignments[p.id] != null) {
    return state.defenseOptionAssignments[p.id];
  }
  let hash = 0;
  for (let i = 0; i < p.id.length; i++) hash += p.id.charCodeAt(i);
  return hash % 2;
}

/**
 * Calculates continuous, warp-free defender pursuit for Option / RPO / Run plays.
 * Ensures:
 * 1. 50-50 split reaction for the first 1.0 second after mesh/handoff.
 * 2. In RPO: 50% attacks runner, 50% drops into normal pass coverage.
 * 3. In Option: 50% pursues QB, 50% pursues RB.
 * 4. After 1.0s: 100% of defenders converge on the actual ball carrier / thrown ball.
 * 5. Complete physical continuity with zero warping.
 */
function getRunPlayDefenderBaseTrajectory(p, t, speed, getBasePosAtT) {
  const optCtx = getActiveOptionContext();
  if (optCtx) {
    const assign = getDefenderOptionAssignment(p);
    const animDur = state.anim.duration || 5.0;

    // Phase 1: t < optCtx.exT (Before mesh/handoff)
    if (t < optCtx.exT) {
      return getBasePosAtT(t);
    }

    // Phase 2: optCtx.exT <= t < optCtx.reactEndT (50-50 reaction for 1.0s)
    const posAtEx = getBasePosAtT(optCtx.exT);
    if (t < optCtx.reactEndT) {
      if (optCtx.optType === 'rpo') {
        if (assign === 1) {
          // 50% stays in coverage (as if it's a pass play - zone or man)
          return getDefBasePosAt(p, t);
        } else {
          // 50% reacts to runner (RB)
          const runner = optCtx.toP;
          const rPos = runner ? getOffensePosAt(runner, t) : { x: 50, y: 65 };
          const dt = (t - optCtx.exT) * animDur;
          const chaseDist = speed * 0.85 * dt;
          const targetDist = Math.hypot(rPos.x - posAtEx.x, rPos.y - posAtEx.y) || 1;
          const ratio = Math.min(1.0, chaseDist / targetDist);
          return {
            x: posAtEx.x + (rPos.x - posAtEx.x) * ratio,
            y: posAtEx.y + (rPos.y - posAtEx.y) * ratio
          };
        }
      } else {
        // Normal Option (50% QB, 50% RB)
        const targetPlayer = assign === 0 ? optCtx.fromP : (optCtx.toP || optCtx.fromP);
        const tgtPos = targetPlayer ? getOffensePosAt(targetPlayer, t) : { x: 50, y: 65 };
        const dt = (t - optCtx.exT) * animDur;
        const chaseDist = speed * 0.85 * dt;
        const targetDist = Math.hypot(tgtPos.x - posAtEx.x, tgtPos.y - posAtEx.y) || 1;
        const ratio = Math.min(1.0, chaseDist / targetDist);
        return {
          x: posAtEx.x + (tgtPos.x - posAtEx.x) * ratio,
          y: posAtEx.y + (tgtPos.y - posAtEx.y) * ratio
        };
      }
    }

    // Phase 3: t >= optCtx.reactEndT (After 1.0s: ALL defenders converge on actual ball carrier)
    let posAtReactEnd;
    if (optCtx.optType === 'rpo') {
      if (assign === 1) {
        posAtReactEnd = getDefBasePosAt(p, optCtx.reactEndT);
      } else {
        const runner = optCtx.toP;
        const rPos = runner ? getOffensePosAt(runner, optCtx.reactEndT) : { x: 50, y: 65 };
        const dt = (optCtx.reactEndT - optCtx.exT) * animDur;
        const chaseDist = speed * 0.85 * dt;
        const targetDist = Math.hypot(rPos.x - posAtEx.x, rPos.y - posAtEx.y) || 1;
        const ratio = Math.min(1.0, chaseDist / targetDist);
        posAtReactEnd = {
          x: posAtEx.x + (rPos.x - posAtEx.x) * ratio,
          y: posAtEx.y + (rPos.y - posAtEx.y) * ratio
        };
      }
    } else {
      const targetPlayer = assign === 0 ? optCtx.fromP : (optCtx.toP || optCtx.fromP);
      const tgtPos = targetPlayer ? getOffensePosAt(targetPlayer, optCtx.reactEndT) : { x: 50, y: 65 };
      const dt = (optCtx.reactEndT - optCtx.exT) * animDur;
      const chaseDist = speed * 0.85 * dt;
      const targetDist = Math.hypot(tgtPos.x - posAtEx.x, tgtPos.y - posAtEx.y) || 1;
      const ratio = Math.min(1.0, chaseDist / targetDist);
      posAtReactEnd = {
        x: posAtEx.x + (tgtPos.x - posAtEx.x) * ratio,
        y: posAtEx.y + (tgtPos.y - posAtEx.y) * ratio
      };
    }

    // From posAtReactEnd, pursue current actual ball carrier (ground carrier before pass)
    const qb = state.offensePlay ? state.offensePlay.players.find(op => op.type === 'QB') : null;
    const groundCarrier = getRunPlayBallCarrierAt(t) || qb;
    const groundPos = groundCarrier ? getOffensePosAt(groundCarrier, t) : null;
    const ballPos = {
      x: (groundPos && isFinite(groundPos.x)) ? groundPos.x : 50,
      y: (groundPos && isFinite(groundPos.y)) ? groundPos.y : 65
    };

    const postReactSec = (t - optCtx.reactEndT) * animDur;
    const chaseDist = speed * 0.85 * postReactSec;
    const targetDist = Math.hypot(ballPos.x - posAtReactEnd.x, ballPos.y - posAtReactEnd.y) || 1;
    const ratio = Math.min(1.0, chaseDist / targetDist);
    let chaseX = posAtReactEnd.x + (ballPos.x - posAtReactEnd.x) * ratio;
    let chaseY = posAtReactEnd.y + (ballPos.y - posAtReactEnd.y) * ratio;

    // Downfield blocking by skill players
    if (state.offensePlay) {
      const currentCarrier = groundCarrier || getRunPlayBallCarrierAt(t);
      const carrierId = currentCarrier ? currentCarrier.id : state.ballCarrierId;
      const blockers = state.offensePlay.players.filter(op => op.id !== carrierId);
      for (const b of blockers) {
        const bPos = getOffensePosAt(b, t);
        if (bPos && isFinite(bPos.x) && isFinite(bPos.y) && Math.hypot(bPos.x - chaseX, bPos.y - chaseY) < 4.5) {
          chaseX = bPos.x + (chaseX - bPos.x) * 0.25;
          chaseY = bPos.y + (chaseY - bPos.y) * 0.25;
          break;
        }
      }
    }

    return {
      x: isFinite(chaseX) ? chaseX : p.x,
      y: isFinite(chaseY) ? chaseY : p.y
    };
  }

  // Normal non-option run play:
  const releaseTime = (state.runExchangeTimes && state.runExchangeTimes[0]) || 0.28;
  if (t < releaseTime) {
    return getBasePosAtT(t);
  }
  const posAtRelease = getBasePosAtT(releaseTime);
  const qb = state.offensePlay ? state.offensePlay.players.find(op => op.type === 'QB') : null;
  const groundCarrier = getRunPlayBallCarrierAt(t) || qb;
  const groundPos = groundCarrier ? getOffensePosAt(groundCarrier, t) : null;
  const ballPos = {
    x: (groundPos && isFinite(groundPos.x)) ? groundPos.x : 50,
    y: (groundPos && isFinite(groundPos.y)) ? groundPos.y : 65
  };

  const postReleaseSec = Math.max(0, (t - releaseTime) * state.anim.duration);
  const chaseDist = speed * 0.85 * postReleaseSec;
  const targetDist = Math.hypot(ballPos.x - posAtRelease.x, ballPos.y - posAtRelease.y) || 1;
  const ratio = Math.min(1.0, chaseDist / targetDist);

  let chaseX = posAtRelease.x + (ballPos.x - posAtRelease.x) * ratio;
  let chaseY = posAtRelease.y + (ballPos.y - posAtRelease.y) * ratio;

  if (state.offensePlay) {
    const currentCarrier = getRunPlayBallCarrierAt(t);
    const carrierId = currentCarrier ? currentCarrier.id : state.ballCarrierId;
    const blockers = state.offensePlay.players.filter(op => op.id !== carrierId);
    for (const b of blockers) {
      const bPos = getOffensePosAt(b, t);
      if (bPos && isFinite(bPos.x) && isFinite(bPos.y) && Math.hypot(bPos.x - chaseX, bPos.y - chaseY) < 4.5) {
        chaseX = bPos.x + (chaseX - bPos.x) * 0.25;
        chaseY = bPos.y + (chaseY - bPos.y) * 0.25;
        break;
      }
    }
  }

  return {
    x: isFinite(chaseX) ? chaseX : p.x,
    y: isFinite(chaseY) ? chaseY : p.y
  };
}

/**
 * Smooth Cosine S-Curve Easing for Defender Reaction & Transition:
 * Guarantees C1 continuity (zero velocity jerk and zero position warp).
 * At elapsedSec = 0: factor = 0 and d/dt = 0 (perfect zero jump).
 */
function smoothBlendFactor(elapsedSec, blendDuration = 0.35) {
  if (elapsedSec <= 0) return 0;
  if (elapsedSec >= blendDuration) return 1;
  const u = elapsedSec / blendDuration;
  return 0.5 - 0.5 * Math.cos(u * Math.PI);
}

/**
 * Calculates continuous, warp-free defender pursuit for Option / RPO / Run / Trick Pass plays.
 * Ensures:
 * 1. ZERO WARP: Smooth C1 blend from base trajectory ensures zero jump at throwT.
 * 2. 50-50 split reaction for the first 1.0 second after mesh/handoff in Option / RPO.
 * 3. Complete physical continuity with zero coordinate jumps.
 */
function getRunPlayDefenderPos(p, t, speed, getBasePosAtT) {
  // ⭐ ZERO-WARP RPO & TRICK PASS PURSUIT ⭐
  // When a pass is thrown during a run play (RPO or Trick Play),
  // smoothly transition from defender's trajectory to pass pursuit over 0.35s
  const rpo = state.rpoPassState;
  if (rpo && rpo.isThrowing && t >= rpo.throwT) {
    const animDur = state.anim.duration || 5.0;
    const postThrowSec = Math.max(0, (t - rpo.throwT) * animDur);
    const baseTraj = getRunPlayDefenderBaseTrajectory(p, t, speed, getBasePosAtT);
    const posAtThrow = getRunPlayDefenderBaseTrajectory(p, rpo.throwT, speed, getBasePosAtT);
    const targetPos = (t >= rpo.catchT && rpo.targetReceiver)
      ? getOffensePosAt(rpo.targetReceiver, t)
      : { x: rpo.targetX, y: rpo.targetY };

    const chaseDist = speed * 0.85 * postThrowSec;
    const targetDist = Math.hypot(targetPos.x - posAtThrow.x, targetPos.y - posAtThrow.y) || 1;
    const ratio = Math.min(1.0, chaseDist / targetDist);

    let chaseX = posAtThrow.x + (targetPos.x - posAtThrow.x) * ratio;
    let chaseY = posAtThrow.y + (targetPos.y - posAtThrow.y) * ratio;

    // Apply blocking collision
    if (state.offensePlay) {
      const recId = rpo.targetReceiver ? rpo.targetReceiver.id : null;
      const blockers = state.offensePlay.players.filter(op => op.id !== recId);
      for (const b of blockers) {
        const bPos = getOffensePosAt(b, t);
        if (bPos && isFinite(bPos.x) && isFinite(bPos.y) && Math.hypot(bPos.x - chaseX, bPos.y - chaseY) < 4.5) {
          chaseX = bPos.x + (chaseX - bPos.x) * 0.25;
          chaseY = bPos.y + (chaseY - bPos.y) * 0.25;
          break;
        }
      }
    }

    // Smooth C1 blend guarantees 0.000yd jump at throw instant
    const blendFactor = smoothBlendFactor(postThrowSec, 0.35);
    const finalX = baseTraj.x + (chaseX - baseTraj.x) * blendFactor;
    const finalY = baseTraj.y + (chaseY - baseTraj.y) * blendFactor;

    return {
      x: isFinite(finalX) ? finalX : p.x,
      y: isFinite(finalY) ? finalY : p.y
    };
  }

  return getRunPlayDefenderBaseTrajectory(p, t, speed, getBasePosAtT);
}

/**
 * Defensive Movement & Physics Engine:
 * 1. Rushers rush their designated target path (varied per player, not identical).
 *    - Unblocked rushers penetrate smoothly without stopping!
 *    - Blocked rushers are held until block ends (2.5s run / 2.0s pass).
 *    - Before ball is released/thrown, rushers stay on rush lane; they DO NOT magically track ball before throw.
 *    - Rushers smoothly blend from QB rush lane to ball pursuit over 0.35s (no abrupt snapping).
 * 2. Constant speed ball pursuit: Ball carriers are pursued at normalized constant speed (no unrealistic turbo acceleration).
 * 3. Zero-Warp Coverage:
 *    - Off-target man defenders maintain tight coverage while ball is airborne (zero sudden abandonment).
 *    - Smooth C1 cosine easing guarantees absolute continuous zero-warp at throw instant.
 */
function getDefensePosAt(p, t) {
  if (t <= 0) return getFinalPreSnapPos(p);

  const isRun = state.playType === 'run';
  const blockDurationSec = isRun ? 2.5 : 2.0;
  const blockEndT = Math.min(0.85, blockDurationSec / state.anim.duration);
  const optCtx = getActiveOptionContext();
  const isBallReleased = isRun 
    ? (optCtx ? (t >= optCtx.exT) : (t >= ((state.runExchangeTimes && state.runExchangeTimes[0]) || 0.28))) 
    : (t >= state.throwTime);

  // ── 1. Pass Rush / Blitz ──
  if (p.coverage === 'rush') {
    const qb = state.offensePlay ? state.offensePlay.players.find(op => op.type === 'QB') : null;
    const qbX = qb ? qb.x : 50;
    const qbY = qb ? qb.y : 76;

    // Distinct realistic rush targets based on rusher ID & position (not everyone rushing the exact same point)
    let defaultRushX = p.x;
    let defaultRushY = 64;
    if (p.id === 'LDE' || p.id === 'DE1') {
      defaultRushX = Math.min(p.x, qbX - 6.0); // Outside speed rush left
      defaultRushY = qbY - 4;
    } else if (p.id === 'RDE' || p.id === 'DE2') {
      defaultRushX = Math.max(p.x, qbX + 6.0); // Outside speed rush right
      defaultRushY = qbY - 4;
    } else if (p.id === 'LDT' || p.id === 'NT') {
      defaultRushX = p.x + (qbX - p.x) * 0.4 - 1.5; // Inside A/B gap pressure
      defaultRushY = 66;
    } else if (p.id === 'RDT') {
      defaultRushX = p.x + (qbX - p.x) * 0.4 + 1.5;
      defaultRushY = 66;
    } else {
      defaultRushX = p.x + (qbX - p.x) * 0.5;
      defaultRushY = 66;
    }

    const rushDestX = p.rushX != null ? p.rushX : defaultRushX;
    const rushDestY = p.rushY != null ? p.rushY : defaultRushY;

    // Check block assignment (1 OL blocks at most 1 DL)
    const { isBlocked } = getRusherBlockStatus(p);

    if (isBlocked && t < blockEndT) {
      // Rusher is blocked during block window
      const blockProgress = Math.min(t / blockEndT, 1.0);
      if (isRun) {
        // Run drive block pushes DL backwards
        return {
          x: p.x + (rushDestX - p.x) * 0.08 * blockProgress,
          y: p.y - 3.0 * blockProgress
        };
      } else {
        // Pass protection engagement at line of scrimmage
        return {
          x: p.x + (rushDestX - p.x) * 0.15 * blockProgress,
          y: p.y + (64 - p.y) * 0.65 * blockProgress
        };
      }
    }

    // Rusher is NOT blocked OR block has ended!
    const speed = getPlayerSpeed(p); // Constant speed (DL: 4.5, LB: 8.0)
    const elapsedSec = t * state.anim.duration;

    // Exact physical coordinates where the blocker released this rusher
    const posAtBlockEnd = isRun
      ? { x: p.x + (rushDestX - p.x) * 0.08, y: p.y - 3.0 }
      : { x: p.x + (rushDestX - p.x) * 0.15, y: p.y + (64 - p.y) * 0.65 };

    if (!isBallReleased) {
      // PRE-RELEASE / PRE-THROW:
      if (isBlocked) {
        const totalDistAfterBlock = Math.hypot(rushDestX - posAtBlockEnd.x, rushDestY - posAtBlockEnd.y) || 1;
        const postBlockSec = Math.max(0, (t - blockEndT) * state.anim.duration);
        const distTraveled = Math.min(totalDistAfterBlock, speed * postBlockSec);
        const ratio = distTraveled / totalDistAfterBlock;
        return {
          x: posAtBlockEnd.x + (rushDestX - posAtBlockEnd.x) * ratio,
          y: posAtBlockEnd.y + (rushDestY - posAtBlockEnd.y) * ratio
        };
      } else {
        const totalDist = Math.hypot(rushDestX - p.x, rushDestY - p.y) || 1;
        const distTraveled = Math.min(totalDist, speed * elapsedSec);
        const ratio = distTraveled / totalDist;
        return {
          x: p.x + (rushDestX - p.x) * ratio,
          y: p.y + (rushDestY - p.y) * ratio
        };
      }
    } else {
      // BALL RELEASED:
      if (isRun) {
        return getRunPlayDefenderPos(p, t, speed, (time) => getDefRushPreReleasePos(p, time, rushDestX, rushDestY, isBlocked, blockEndT));
      } else {
        // Pass play pursuit for rushers:
        // Rushers smoothly blend from QB rush lane to ball pursuit over 0.35s (no abrupt snapping)
        const releaseTime = state.throwTime;
        const animDur = state.anim.duration || 5.0;
        const postReleaseSec = Math.max(0, (t - releaseTime) * animDur);
        const rushPos = getDefRushPreReleasePos(p, t, rushDestX, rushDestY, isBlocked, blockEndT);
        const posAtRelease = getDefRushPreReleasePos(p, releaseTime, rushDestX, rushDestY, isBlocked, blockEndT);

        const ballPos = getBallCarrierPos(t);
        const chaseDist = speed * postReleaseSec;
        const targetDist = Math.hypot(ballPos.x - posAtRelease.x, ballPos.y - posAtRelease.y) || 1;
        const ratio = Math.min(1.0, chaseDist / targetDist);

        const rawChaseX = posAtRelease.x + (ballPos.x - posAtRelease.x) * ratio;
        const rawChaseY = posAtRelease.y + (ballPos.y - posAtRelease.y) * ratio;

        const blendFactor = smoothBlendFactor(postReleaseSec, 0.35);
        const finalX = rushPos.x + (rawChaseX - rushPos.x) * blendFactor;
        const finalY = rushPos.y + (rawChaseY - rushPos.y) * blendFactor;

        return {
          x: isFinite(finalX) ? finalX : p.x,
          y: isFinite(finalY) ? finalY : p.y
        };
      }
    }
  }

  // ── 2. Coverage Defenders (Zone & Man) After Ball Released ──
  if (isBallReleased) {
    const speed = getPlayerSpeed(p); // Normal speed (DB: 10.5, LB: 8.0)
    if (state.playType === 'pass') {
      const releaseTime = state.throwTime;
      const catchTime = state.catchTime || (releaseTime + 0.25);
      const animDur = state.anim.duration || 5.0;
      const postReleaseSec = Math.max(0, (t - releaseTime) * animDur);
      
      const basePos = getDefBasePosAt(p, t);
      const posAtRelease = getDefBasePosAt(p, releaseTime);

      const targetReceiver = state.catchReceiverId ? state.offensePlay.players.find(op => op.id === state.catchReceiverId) : null;
      const isTargetManMarker = (p.coverage === 'man' && targetReceiver && p.target === targetReceiver.id);

      const ballPos = getBallCarrierPos(t);

      let isBallInZone = false;
      if (p.coverage === 'zone' && p.zoneX != null) {
        const zoneRadius = p.zoneRadius || 7;
        const distToCatch = Math.hypot(p.zoneX - ballPos.x, p.zoneY - ballPos.y);
        if (distToCatch <= zoneRadius + 9) {
          isBallInZone = true;
        }
      }

      // Mid-flight discipline:
      // While ball is in air (t < catchTime), defenders not guarding target receiver
      // or outside ball's flight zone maintain their coverage assignments (ZERO sudden abandonment).
      const shouldPursueInAir = isTargetManMarker || isBallInZone;
      const isAirborne = (t < catchTime);

      if (isAirborne && !shouldPursueInAir) {
        return basePos;
      }

      // Pursuit distance calculation
      const pursuitSec = isAirborne ? postReleaseSec : Math.max(0, (t - catchTime) * animDur);
      const startPos = isAirborne ? posAtRelease : getDefBasePosAt(p, catchTime);
      
      const chaseSpeed = shouldPursueInAir ? speed : (speed * 0.85);
      const chaseDist = chaseSpeed * pursuitSec;
      const targetDist = Math.hypot(ballPos.x - startPos.x, ballPos.y - startPos.y) || 1;
      const ratio = Math.min(1.0, chaseDist / targetDist);

      const rawChaseX = startPos.x + (ballPos.x - startPos.x) * ratio;
      const rawChaseY = startPos.y + (ballPos.y - startPos.y) * ratio;

      // Smooth C1 cosine easing guarantees absolute continuous zero-warp transition
      const blendFactor = smoothBlendFactor(pursuitSec, 0.35);
      const finalX = basePos.x + (rawChaseX - basePos.x) * blendFactor;
      const finalY = basePos.y + (rawChaseY - basePos.y) * blendFactor;

      return {
        x: isFinite(finalX) ? finalX : p.x,
        y: isFinite(finalY) ? finalY : p.y
      };
    } else {
      // Run Play (includes Option and RPO with 50/50 reaction & 1.0s convergence):
      return getRunPlayDefenderPos(p, t, speed, (time) => getDefBasePosAt(p, time));
    }
  }

  // ── 3. Pre-release coverage movement (Zone drop / Man trail) ──
  return getDefBasePosAt(p, t);
}

function getDefRushPreReleasePos(p, t, rushDestX, rushDestY, isBlocked, blockEndT) {
  if (t <= 0) return { x: p.x, y: p.y };
  const isRun = state.playType === 'run';
  if (isBlocked && t < blockEndT) {
    const blockProgress = Math.min(t / blockEndT, 1.0);
    return isRun
      ? { x: p.x + (rushDestX - p.x) * 0.08 * blockProgress, y: p.y - 3.0 * blockProgress }
      : { x: p.x + (rushDestX - p.x) * 0.15 * blockProgress, y: p.y + (64 - p.y) * 0.65 * blockProgress };
  }
  const speed = getPlayerSpeed(p);
  if (isBlocked) {
    // Progresses starting from the exact disengagement point
    const posAtBlockEnd = isRun
      ? { x: p.x + (rushDestX - p.x) * 0.08, y: p.y - 3.0 }
      : { x: p.x + (rushDestX - p.x) * 0.15, y: p.y + (64 - p.y) * 0.65 };
    const totalDistAfter = Math.hypot(rushDestX - posAtBlockEnd.x, rushDestY - posAtBlockEnd.y) || 1;
    const postBlockSec = Math.max(0, (t - blockEndT) * state.anim.duration);
    const distTraveled = Math.min(totalDistAfter, speed * postBlockSec);
    const ratio = distTraveled / totalDistAfter;
    return {
      x: posAtBlockEnd.x + (rushDestX - posAtBlockEnd.x) * ratio,
      y: posAtBlockEnd.y + (rushDestY - posAtBlockEnd.y) * ratio
    };
  } else {
    const totalDist = Math.hypot(rushDestX - p.x, rushDestY - p.y) || 1;
    const distTraveled = Math.min(totalDist, speed * t * state.anim.duration);
    const ratio = distTraveled / totalDist;
    return {
      x: p.x + (rushDestX - p.x) * ratio,
      y: p.y + (rushDestY - p.y) * ratio
    };
  }
}

function getDefBasePosAt(p, t) {
  const startDef = getFinalPreSnapPos(p);

  // MAN COVERAGE: Closes distance aggressively toward the receiver!
  // Uses final pre-snap positions to guarantee absolutely ZERO warping at snap transition (t=0)
  if (p.coverage === 'man') {
    const targetPlayer = getManCoverageTarget(p);
    if (!targetPlayer) return { x: startDef.x, y: startDef.y };

    const startTarget = getFinalPreSnapPos(targetPlayer);
    const targetNow = getOffensePosAt(targetPlayer, t);
    const initialOffX = startDef.x - startTarget.x;
    const initialOffY = startDef.y - startTarget.y;

    // Cushion decreases smoothly over the route (closes distance tight to ~1.2 yards top/side)
    const closeRatio = Math.min(1.0, (t * state.anim.duration) / 1.5);
    const currentOffX = initialOffX * (1.0 - closeRatio * 0.75); // Closes horizontal cushion
    const currentOffY = initialOffY * (1.0 - closeRatio * 0.70); // Closes vertical cushion

    return {
      x: targetNow.x + currentOffX,
      y: targetNow.y + currentOffY
    };
  }

  // ZONE COVERAGE: Steady drop + dynamically switch to ANY receiver in zone (ZERO WARPING GUARANTEED)
  if (p.coverage === 'zone') {
    const dropX = p.zoneX != null ? p.zoneX : startDef.x;
    const dropY = p.zoneY != null ? p.zoneY : startDef.y - 12;

    const speed = getPlayerSpeed(p);
    const zoneRadius = p.zoneRadius != null ? p.zoneRadius : 8.5;
    const receivers = state.offensePlay 
      ? state.offensePlay.players.filter(op => op.type !== 'OL' && op.type !== 'C')
      : [];

    const animDur = state.anim.duration || 5;
    const totalSec = t * animDur;
    if (totalSec <= 0) {
      return { x: startDef.x, y: startDef.y };
    }

    // Continuous steering simulation via sub-step numerical integration
    // Evaluates in-zone threats dynamically; switches smoothly when new receivers enter zone!
    const dt = 0.04; // 40ms integration step
    let curX = startDef.x;
    let curY = startDef.y;

    for (let simSec = 0; simSec < totalSec; simSec += dt) {
      const stepDt = Math.min(dt, totalSec - simSec);
      const stepSimT = (simSec + stepDt * 0.5) / animDur;

      // Find all receivers currently inside defender's zone at this exact moment
      let activeThreat = null;
      let minThreatDist = Infinity;

      for (const rec of receivers) {
        const recPos = getOffensePosAt(rec, stepSimT);
        const distFromDrop = Math.hypot(recPos.x - dropX, recPos.y - dropY);
        if (distFromDrop <= zoneRadius) {
          // Receiver is in zone! Prioritize closest threat or newly entered receiver
          const distToDef = Math.hypot(recPos.x - curX, recPos.y - curY);
          if (distToDef < minThreatDist) {
            minThreatDist = distToDef;
            activeThreat = { x: recPos.x, y: recPos.y - 1.2 };
          }
        }
      }

      // Determine movement target
      let goalX, goalY, stepSpeed;
      if (activeThreat) {
        goalX = activeThreat.x;
        goalY = activeThreat.y;
        stepSpeed = speed * 0.95;
      } else {
        goalX = dropX;
        goalY = dropY;
        stepSpeed = speed;
      }

      const dx = goalX - curX;
      const dy = goalY - curY;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.05) {
        const moveDist = Math.min(dist, stepSpeed * stepDt);
        curX += (dx / dist) * moveDist;
        curY += (dy / dist) * moveDist;
      }
    }

    return { x: curX, y: curY };
  }

  return { x: startDef.x, y: startDef.y };
}

function getBallCarrierPos(t) {
  if (!state.offensePlay) return { x: 50, y: 65 };
  const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];

  if (state.playType === 'run') {
    const rpo = state.rpoPassState;
    if (rpo && rpo.isThrowing) {
      if (t < rpo.throwT) {
        const holder = getRunPlayBallCarrierAt(t) || qb;
        const holderPos = getOffensePosAt(holder, t);
        return {
          x: (holderPos && isFinite(holderPos.x)) ? holderPos.x : 50,
          y: (holderPos && isFinite(holderPos.y)) ? holderPos.y : 76
        };
      } else if (t < rpo.catchT) {
        return {
          x: isFinite(rpo.targetX) ? rpo.targetX : 50,
          y: isFinite(rpo.targetY) ? rpo.targetY : 30
        };
      } else {
        const rPos = rpo.targetReceiver ? getOffensePosAt(rpo.targetReceiver, t) : null;
        return {
          x: (rPos && isFinite(rPos.x)) ? rPos.x : rpo.targetX,
          y: (rPos && isFinite(rPos.y)) ? rPos.y : rpo.targetY
        };
      }
    }

    const currentHolder = getRunPlayBallCarrierAt(t) || qb;
    const pos = getOffensePosAt(currentHolder, t);
    return {
      x: (pos && isFinite(pos.x)) ? pos.x : 50,
      y: (pos && isFinite(pos.y)) ? pos.y : 65
    };
  } else {
    // PASS PLAY:
    // Use pre-resolved pass play state if available (O(1)), avoiding expensive getSmartOpenReceiver() loop per defender!
    const pass = state.resolvedPass || resolvePassPlayState(t);
    const throwT = pass ? pass.throwT : (state.throwTime || 0.4);
    const catchT = pass ? pass.catchT : (state.catchTime || 0.6);
    const targetX = pass ? pass.targetX : state.passTargetPos.x;
    const targetY = pass ? pass.targetY : state.passTargetPos.y;
    const targetRec = pass ? pass.nearestReceiver : null;

    if (t < throwT) {
      // In QB's hands before throw
      const qbPos = (pass && pass.qbPos) ? pass.qbPos : getOffensePosAt(qb, t);
      return {
        x: (qbPos && isFinite(qbPos.x)) ? qbPos.x : (qb ? qb.x : 50),
        y: (qbPos && isFinite(qbPos.y)) ? qbPos.y : (qb ? qb.y : 76)
      };
    } else if (t < catchT) {
      // Mid-flight: defenders converge towards actual landing location!
      return {
        x: isFinite(targetX) ? targetX : 50,
        y: isFinite(targetY) ? targetY : 30
      };
    } else {
      // Post-catch: chase the receiver sprint if caught, or stay at ball landing spot
      if (targetRec && (state.catchReceiverId === targetRec.id || (pass && pass.isCatchable))) {
        const rPos = getOffensePosAt(targetRec, t);
        return {
          x: (rPos && isFinite(rPos.x)) ? rPos.x : targetX,
          y: (rPos && isFinite(rPos.y)) ? rPos.y : targetY
        };
      }
      return {
        x: isFinite(targetX) ? targetX : 50,
        y: isFinite(targetY) ? targetY : 30
      };
    }
  }
}


/* ─── Drag & Drop + Interactive Handle Movement ─────────────── */
window.addEventListener('pointermove', (e) => {
  // Threshold detection: Click vs Drag
  if (state.pointerDownInfo && !state.isDragging) {
    const dist = Math.hypot(e.clientX - state.pointerDownInfo.startX, e.clientY - state.pointerDownInfo.startY);
    if (dist > 6) {
      state.pointerDownInfo.hasDragged = true;
      state.isDragging = true;
      state.selectedPlayer = { side: state.pointerDownInfo.side, id: state.pointerDownInfo.id };
      state.dragTarget = { type: 'player', side: state.pointerDownInfo.side, id: state.pointerDownInfo.id };
      closePopover();
    }
  }

  if (!state.isDragging || !state.dragTarget) return;

  const container = document.getElementById('fieldContainer');
  if (!container) return;
  const rect = container.getBoundingClientRect();

  const xPct = Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100));
  const yPct = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));

  const dt = state.dragTarget;

  // 1. Drag Player Body
  if (dt.type === 'player') {
    const list = dt.side === 'offense' ? state.offensePlay.players : state.defensePlay.players;
    const p = list.find(item => item.id === dt.id);
    if (p) {
      const dx = xPct - p.x;
      const dy = yPct - p.y;
      p.x = Math.round(xPct * 10) / 10;
      p.y = Math.round(yPct * 10) / 10;

      if (p.route && p.route.length > 0) {
        p.route.forEach(wp => {
          wp.x = Math.round(Math.max(3, Math.min(97, wp.x + dx)) * 10) / 10;
          wp.y = Math.round(Math.max(5, Math.min(95, wp.y + dy)) * 10) / 10;
        });
      }
      if (p.zoneX != null) {
        p.zoneX = Math.round(Math.max(3, Math.min(97, p.zoneX + dx)) * 10) / 10;
        p.zoneY = Math.round(Math.max(5, Math.min(95, p.zoneY + dy)) * 10) / 10;
      }
    }
  } 
  // 2. Drag Route Waypoint
  else if (dt.type === 'waypoint') {
    const player = state.offensePlay.players.find(item => item.id === dt.id);
    if (player && player.route && player.route[dt.index]) {
      player.route[dt.index].x = Math.round(xPct * 10) / 10;
      player.route[dt.index].y = Math.round(yPct * 10) / 10;
    }
  } 
  // 3. Drag Zone Center
  else if (dt.type === 'zone_center') {
    const player = state.defensePlay.players.find(item => item.id === dt.id);
    if (player) {
      player.zoneX = Math.round(xPct * 10) / 10;
      player.zoneY = Math.round(yPct * 10) / 10;
    }
  } 
  // 4. Drag Zone Radius (Resize)
  else if (dt.type === 'zone_radius') {
    const player = state.defensePlay.players.find(item => item.id === dt.id);
    if (player && player.zoneX != null) {
      const newRadius = Math.max(3, Math.min(22, Math.abs(xPct - player.zoneX)));
      player.zoneRadius = Math.round(newRadius * 10) / 10;
    }
  }
  // 5. Drag Man Coverage Arrow (Drop onto nearest offense player)
  else if (dt.type === 'man_arrow') {
    const nearestOffense = state.offensePlay.players
      .filter(op => op.type === 'WR' || op.type === 'TE' || op.type === 'RB')
      .find(op => Math.hypot(op.x - xPct, op.y - yPct) < 7.0);

    if (nearestOffense) {
      const defender = state.defensePlay.players.find(dp => dp.id === dt.id);
      if (defender) defender.target = nearestOffense.id;
    }
  }
  // 6. Drag Rush Destination
  else if (dt.type === 'rush_dest') {
    const defender = state.defensePlay.players.find(dp => dp.id === dt.id);
    if (defender) {
      defender.rushX = Math.round(xPct * 10) / 10;
      defender.rushY = Math.round(yPct * 10) / 10;
    }
  }
  // 7. Drag Pass Landing Target
  else if (dt.type === 'pass_target') {
    state.passTargetPos.x = Math.round(xPct * 10) / 10;
    state.passTargetPos.y = Math.round(yPct * 10) / 10;
    const nearest = findNearestReceiverTo(state.passTargetPos);
    if (nearest) state.catchReceiverId = nearest.id;
  }
  // 8. Drag Shift Destination
  else if (dt.type === 'shift_dest') {
    if (state.shifts && state.shifts[dt.index]) {
      state.shifts[dt.index].destX = Math.round(xPct * 10) / 10;
      state.shifts[dt.index].destY = Math.round(yPct * 10) / 10;
      renderPresnapUI();
    }
  }
  // 9. Drag Motion Destination
  else if (dt.type === 'motion_dest') {
    if (state.motion) {
      state.motion.destX = Math.round(xPct * 10) / 10;
      state.motion.destY = Math.round(yPct * 10) / 10;
      renderPresnapUI();
    }
  }

  renderAll();
});

window.addEventListener('pointerup', () => {
  if (state.pointerDownInfo) {
    if (!state.pointerDownInfo.hasDragged) {
      // CLEAN CLICK -> Open Context Popover
      const { side, id, pos } = state.pointerDownInfo;
      state.selectedPlayer = { side, id };
      renderAll();
      openPlayerPopover(side, id, pos);
    }
    state.pointerDownInfo = null;
  }

  if (state.isDragging) {
    state.isDragging = false;
    state.dragTarget = null;
  }
});

/* ─── Field Drag / Click for Freehand Route & Pass Line ──────── */
function setupFieldClickForDrawing() {
  const container = document.getElementById('fieldContainer');
  if (!container) return;

  let isDrawingStroke = false;

  container.addEventListener('pointerdown', (e) => {
    // IGNORE clicks/touches on indicator bar or buttons!
    if (e.target.closest('#drawingIndicator') || e.target.closest('button') || e.target.closest('.field-popover')) {
      return;
    }

    if (state.isDrawingPassLine) {
      const rect = container.getBoundingClientRect();
      const xPct = Math.round(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const yPct = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      state.passTargetPos = { x: xPct, y: yPct };
      const nearest = findNearestReceiverTo(state.passTargetPos);
      if (nearest) state.catchReceiverId = nearest.id;
      finishPassVectorDrawing();
      return;
    }

    if (state.isDrawingPresnap && state.drawingPresnapPlayerId) {
      isDrawingStroke = true;
      const rect = container.getBoundingClientRect();
      const xPct = Math.round(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const yPct = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      state.drawingPresnapPoints = [{ x: xPct, y: yPct }];
      renderAll();
      return;
    }

    if (state.isDrawingRoute && state.drawingPlayerId) {
      isDrawingStroke = true;
      const rect = container.getBoundingClientRect();
      const xPct = Math.round(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const yPct = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      const player = state.offensePlay.players.find(p => p.id === state.drawingPlayerId);
      if (player) {
        player.route = [{ x: xPct, y: yPct }];
        renderAll();
      }
    }
  });

  container.addEventListener('pointermove', (e) => {
    if (state.isDrawingPresnap && state.drawingPresnapPlayerId && isDrawingStroke) {
      const rect = container.getBoundingClientRect();
      const xPct = Math.round(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const yPct = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      const last = state.drawingPresnapPoints[state.drawingPresnapPoints.length - 1];
      if (!last || Math.hypot(last.x - xPct, last.y - yPct) >= 2.0) {
        state.drawingPresnapPoints.push({ x: xPct, y: yPct });
        renderAll();
      }
      return;
    }

    if (state.isDrawingRoute && state.drawingPlayerId && isDrawingStroke) {
      const rect = container.getBoundingClientRect();
      const xPct = Math.round(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const yPct = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      const player = state.offensePlay.players.find(p => p.id === state.drawingPlayerId);
      if (player && player.route) {
        const last = player.route[player.route.length - 1];
        if (!last || Math.hypot(last.x - xPct, last.y - yPct) >= 2.5) {
          player.route.push({ x: xPct, y: yPct });
          renderAll();
        }
      }
    }
  });

  window.addEventListener('pointerup', () => {
    if (isDrawingStroke) {
      isDrawingStroke = false;
    }
  });

  container.addEventListener('click', (e) => {
    const popover = document.getElementById('fieldPopover');
    if (popover && !popover.contains(e.target) && !e.target.closest('#fieldPopover') && !e.target.classList.contains('player-node')) {
      closePopover();
    }
  });
}

function startFreehandPresnapDrawing(playerId, type) {
  closePopover();
  state.isDrawingPresnap = type;
  state.drawingPresnapPlayerId = playerId;
  state.drawingPresnapPoints = [];

  const player = state.offensePlay ? state.offensePlay.players.find(p => p.id === playerId) : null;
  const label = player ? player.label : playerId;
  const typeText = type === 'shift' ? 'プレシフト' : 'モーション';
  showDrawingIndicator(`${label} の${typeText}コースを描画中: フィールド上をドラッグして線を引いてください`);
}

function finishFreehandPresnapDrawing() {
  if (!state.isDrawingPresnap || !state.drawingPresnapPlayerId) return;
  const pts = state.drawingPresnapPoints;
  const playerId = state.drawingPresnapPlayerId;
  const type = state.isDrawingPresnap;

  if (pts && pts.length > 0) {
    const finalDest = pts[pts.length - 1];
    if (type === 'shift') {
      const existingIdx = (state.shifts || []).findIndex(s => s.playerId === playerId);
      const shiftObj = {
        playerId,
        path: pts,
        destX: finalDest.x,
        destY: finalDest.y
      };
      if (existingIdx !== -1) {
        state.shifts[existingIdx] = shiftObj;
      } else {
        if (!state.shifts) state.shifts = [];
        state.shifts.push(shiftObj);
      }
    } else {
      state.motion = {
        playerId,
        path: pts,
        destX: finalDest.x,
        destY: finalDest.y
      };
    }
  }

  state.isDrawingPresnap = null;
  state.drawingPresnapPlayerId = null;
  state.drawingPresnapPoints = [];
  hideDrawingIndicator();
  renderPresnapUI();
  renderAll();
}

function startFreehandDrawing(playerId, routeType = null) {
  closePopover();
  state.isDrawingRoute = true;
  state.drawingPlayerId = playerId;

  const player = state.offensePlay.players.find(p => p.id === playerId);
  if (player) {
    if (routeType) {
      player.routeType = routeType;
    } else {
      player.routeType = state.playType === 'run' ? 'run' : 'pass';
    }
    if (player.routeType === 'block') {
      player.isBlocker = true;
      if (state.catchReceiverId === playerId) state.catchReceiverId = null;
    } else {
      player.isBlocker = false;
    }
    player.route = [];
  }

  const roleText = (player && player.routeType === 'block') ? 'ブロックコース' : 'ルート';
  showDrawingIndicator(`${player ? player.label : ''} の${roleText}を描画中: フィールド上をドラッグして線を引いてください`);
  renderAll();
}

function finishFreehandDrawing() {
  if (state.isDrawingRoute && state.drawingPlayerId) {
    const player = state.offensePlay ? state.offensePlay.players.find(p => p.id === state.drawingPlayerId) : null;
    if (player && (!player.route || player.route.length === 0)) {
      if (player.routeType === 'block') {
        player.route = [{ x: player.x, y: state.playType === 'run' ? player.y - 4.5 : player.y + 2.5 }];
      } else {
        player.route = [{ x: player.x, y: Math.max(15, player.y - 12) }];
      }
    }
  }
  state.isDrawingRoute = false;
  state.drawingPlayerId = null;
  hideDrawingIndicator();
  renderAll();
}

function startPassVectorDrawing() {
  closePopover();
  state.isDrawingPassLine = true;
  showDrawingIndicator('QBからのパス目標地点をクリックしてください（直線の矢印が引かれます）');
}

function finishPassVectorDrawing() {
  state.isDrawingPassLine = false;
  hideDrawingIndicator();
  renderAll();
}

function showDrawingIndicator(msg) {
  let ind = document.getElementById('drawingIndicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'drawingIndicator';
    ind.className = 'drawing-indicator';
    document.getElementById('fieldContainer').appendChild(ind);
  }
  ind.innerHTML = '';
  
  const span = document.createElement('span');
  span.innerText = `✏️ ${msg}`;
  ind.appendChild(span);

  const btn = document.createElement('button');
  btn.className = 'px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold ml-2';
  btn.innerText = '完了';
  btn.style.cursor = 'pointer';
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    finishFreehandDrawing();
    finishPassVectorDrawing();
    finishFreehandPresnapDrawing();
  });
  ind.appendChild(btn);

  ind.style.display = 'flex';
}

function hideDrawingIndicator() {
  const ind = document.getElementById('drawingIndicator');
  if (ind) ind.style.display = 'none';
}



/* ─── On-Field Context Popover (Robust Positioning) ─────────── */
function openPlayerPopover(side, id, pos) {
  closePopover();

  const container = document.getElementById('fieldContainer');
  if (!container) return;

  const player = side === 'offense'
    ? state.offensePlay.players.find(p => p.id === id)
    : state.defensePlay.players.find(p => p.id === id);
  if (!player) return;

  const pop = document.createElement('div');
  pop.id = 'fieldPopover';
  pop.className = 'field-popover';

  const showBelow = pos.y < 35;
  if (showBelow) {
    pop.style.transform = 'translate(-50%, 20px)';
  } else {
    pop.style.transform = 'translate(-50%, -100%) translateY(-14px)';
  }

  const safeX = Math.max(16, Math.min(84, pos.x));
  pop.style.left = `${safeX}%`;
  pop.style.top = `${pos.y}%`;

  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  pop.addEventListener('click', (e) => e.stopPropagation());

  if (side === 'offense') {
    const isBallCarrier = state.playType === 'run' && state.ballCarrierId === player.id;
    const isBlocker = player.routeType === 'block';

    pop.innerHTML = `
      <div class="popover-header">
        <span class="popover-title">🔵 ${player.label} (${player.type})</span>
        <button class="popover-close" onclick="closePopover()">×</button>
      </div>

      <div class="popover-btn-group">
        <button class="popover-btn" style="color:#60a5fa;" onclick="showPositionChangeSubmenu('offense', '${player.id}')">
          <span>🔄 ポジション変更 (WR, QB, RB...)</span>
          <span>▶</span>
        </button>

        ${state.playType === 'run' ? `
          <button class="popover-btn ${isBallCarrier ? 'active' : ''}" onclick="setBallCarrier('${player.id}')">
            <span>🏃 ボールキャリアに指定</span>
            <span>${isBallCarrier ? '✓' : ''}</span>
          </button>
        ` : ''}

        <button class="popover-btn" onclick="showPresetRoutesSubmenu('${player.id}')">
          <span>📐 既存ルートから選ぶ</span>
          <span>▶</span>
        </button>

        <button class="popover-btn" onclick="startFreehandDrawing('${player.id}')">
          <span>✏️ 自由記述でルートを描く</span>
          <span>✎</span>
        </button>

        ${isBlocker ? `
          <button class="popover-btn active" style="color:#38bdf8;" onclick="restorePlayerToRoute('${player.id}')">
            <span>🛡️ ブロッカー解除 (走者に変更)</span>
            <span>✓</span>
          </button>
        ` : `
          <button class="popover-btn" style="color:#38bdf8; font-weight:bold;" onclick="setPlayerAsBlocker('${player.id}')">
            <span>🛡️ ブロッカーに設定 (ワンクリック)</span>
            <span>＋</span>
          </button>
        `}

        <button class="popover-btn" onclick="showBlockSubmenu('${player.id}')">
          <span>🛡️ ブロックコース詳細 (定形/自由)</span>
          <span>▶</span>
        </button>

        <button class="popover-btn" style="color:#f87171;" onclick="clearPlayerRoute('${player.id}')">
          <span>🗑️ ルート消去</span>
        </button>

        <div style="border-top:1px solid var(--border-color); margin:4px 0;"></div>

        ${(state.shifts || []).some(s => s.playerId === player.id) ? `
          <button class="popover-btn active" onclick="removePlayerShift('${player.id}')">
            <span>🔄 シフト解除 [S${state.shifts.findIndex(s => s.playerId === player.id) + 1}]</span>
            <span>✓</span>
          </button>
        ` : `
          <div style="display:flex; gap:4px;">
            <button class="popover-btn" style="flex:1;" onclick="addPlayerShift('${player.id}')">
              <span>🔄 プレシフト</span>
              <span>＋</span>
            </button>
            <button class="popover-btn" style="flex:1; color:#c084fc;" onclick="startFreehandPresnapDrawing('${player.id}', 'shift')">
              <span>✏️ 自由記述</span>
              <span>✎</span>
            </button>
          </div>
        `}

        ${(state.motion && state.motion.playerId === player.id) ? `
          <button class="popover-btn active" onclick="removePlayerMotion()">
            <span>🏃 モーション解除</span>
            <span>✓</span>
          </button>
        ` : `
          <div style="display:flex; gap:4px;">
            <button class="popover-btn" style="flex:1;" onclick="setPlayerMotion('${player.id}')">
              <span>🏃 モーション</span>
              <span>＋</span>
            </button>
            <button class="popover-btn" style="flex:1; color:#22d3ee;" onclick="startFreehandPresnapDrawing('${player.id}', 'motion')">
              <span>✏️ 自由記述</span>
              <span>✎</span>
            </button>
          </div>
        `}
      </div>
    `;
  } else {
    pop.innerHTML = `
      <div class="popover-header">
        <span class="popover-title">🔴 ${player.label} (${player.type})</span>
        <button class="popover-close" onclick="closePopover()">×</button>
      </div>

      <div class="popover-btn-group">
        <button class="popover-btn" style="color:#f87171;" onclick="showPositionChangeSubmenu('defense', '${player.id}')">
          <span>🔄 ポジション変更 (DE, LB, CB...)</span>
          <span>▶</span>
        </button>

        <button class="popover-btn ${player.coverage === 'zone' ? 'active' : ''}" onclick="showZoneSubmenu('${player.id}')">
          <span>🛡️ ゾーンカバー (位置・大きさ)</span>
          <span>▶</span>
        </button>

        <button class="popover-btn ${player.coverage === 'man' ? 'active' : ''}" onclick="setDefenseMan('${player.id}')">
          <span>🎯 マンカバーに設定 (相手選択/変更)</span>
          <span>▶</span>
        </button>

        <button class="popover-btn ${player.coverage === 'rush' ? 'active' : ''}" onclick="setDefenseRush('${player.id}')">
          <span>⚡ パスラッシュ / ブリッツ</span>
        </button>
      </div>
    `;
  }

  container.appendChild(pop);
}

function setPlayerAsBlocker(playerId) {
  const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === playerId) : null;
  if (!p) return;
  p.routeType = 'block';
  p.isBlocker = true;
  if (state.catchReceiverId === playerId) state.catchReceiverId = null;
  const blockDy = state.playType === 'run' ? -4.5 : 2.5;
  p.route = [
    { x: p.x, y: Math.max(10, Math.min(90, Math.round((p.y + blockDy) * 10) / 10)) }
  ];
  closePopover();
  renderAll();
}

function restorePlayerToRoute(playerId) {
  const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === playerId) : null;
  if (!p) return;
  p.routeType = state.playType === 'run' ? 'run' : 'pass';
  p.isBlocker = false;
  p.route = [
    { x: p.x, y: Math.max(10, Math.round((p.y - 14) * 10) / 10) }
  ];
  closePopover();
  renderAll();
}

function showPositionChangeSubmenu(side, playerId) {
  const pop = document.getElementById('fieldPopover');
  if (!pop) return;
  const player = side === 'offense'
    ? state.offensePlay.players.find(p => p.id === playerId)
    : state.defensePlay.players.find(p => p.id === playerId);
  if (!player) return;

  const offPositions = [
    { type: 'QB', label: 'QB' },
    { type: 'RB', label: 'RB' },
    { type: 'FB', label: 'FB' },
    { type: 'WR', label: 'WR' },
    { type: 'TE', label: 'TE' },
    { type: 'OL', label: 'OL' },
    { type: 'C',  label: 'C' }
  ];

  const defPositions = [
    { type: 'DL', label: 'DE', sub: 'DE' },
    { type: 'DL', label: 'DT', sub: 'DT' },
    { type: 'DL', label: 'NT', sub: 'NT' },
    { type: 'LB', label: 'MLB', sub: 'MLB' },
    { type: 'LB', label: 'OLB', sub: 'OLB' },
    { type: 'DB', label: 'CB', sub: 'CB' },
    { type: 'DB', label: 'FS', sub: 'FS' },
    { type: 'DB', label: 'SS', sub: 'SS' }
  ];

  const list = side === 'offense' ? offPositions : defPositions;

  pop.innerHTML = `
    <div class="popover-header">
      <span class="popover-title">ポジション変更: ${player.label}</span>
      <button class="popover-close" onclick="closePopover()">×</button>
    </div>
    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:6px;">
      変更するポジションを選択 (SLは廃止されWR表記に統一されます):
    </div>
    <div class="pos-change-grid">
      ${list.map(pos => `
        <button class="pos-change-btn ${player.label === (pos.sub || pos.label) ? 'active' : ''}" 
          onclick="applyPlayerPositionChange('${side}', '${playerId}', '${pos.type}', '${pos.sub || pos.label}')">
          ${pos.label}
        </button>
      `).join('')}
    </div>
  `;
}

function applyPlayerPositionChange(side, playerId, newType, newLabel) {
  const player = side === 'offense'
    ? state.offensePlay.players.find(p => p.id === playerId)
    : state.defensePlay.players.find(p => p.id === playerId);
  if (!player) return;

  player.type = newType;

  if (side === 'offense') {
    if (newType === 'WR') {
      const existingWRs = state.offensePlay.players.filter(p => p.type === 'WR' && p.id !== playerId);
      player.label = `WR${existingWRs.length + 1}`;
    } else if (newType === 'OL') {
      player.label = newLabel || 'OL';
      player.routeType = 'block';
    } else if (newType === 'C') {
      player.label = 'C';
      player.routeType = 'block';
    } else {
      player.label = newLabel || newType;
    }
  } else {
    player.label = newLabel || newType;
    if (newType === 'DL') {
      player.coverage = 'rush';
    }
  }

  closePopover();
  renderAll();
}

function closePopover() {
  const p = document.getElementById('fieldPopover');
  if (p) p.remove();
}

function showPresetRoutesSubmenu(playerId) {
  const pop = document.getElementById('fieldPopover');
  if (!pop) return;

  const templates = state.playType === 'run' ? PRESETS.runTemplates : PRESETS.routeTemplates;

  pop.innerHTML = `
    <div class="popover-header">
      <span class="popover-title">既存ルートから選択</span>
      <button class="popover-close" onclick="closePopover()">×</button>
    </div>
    <div style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:4px;">
      ${Object.entries(templates).map(([k, t]) => `
        <button class="popover-btn" onclick="applyPresetRouteAndClose('${playerId}', '${k}')">
          <span>${t.name}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function showBlockSubmenu(playerId) {
  const pop = document.getElementById('fieldPopover');
  if (!pop) return;

  pop.innerHTML = `
    <div class="popover-header">
      <span class="popover-title">ブロック指定 (定形 / 自由記述)</span>
      <button class="popover-close" onclick="closePopover()">×</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <button class="popover-btn" style="color:#38bdf8; font-weight:bold;" onclick="startFreehandDrawing('${playerId}', 'block')">
        <span>✏️ 自由記述でブロックルートを描く</span>
        <span>✎</span>
      </button>
      <div style="border-top:1px solid var(--border-color); margin:4px 0;"></div>
      <label class="text-xs text-[var(--text-muted)]">定形ブロック位置から選ぶ:</label>
      ${Object.entries(PRESETS.blockTemplates).map(([k, t]) => `
        <button class="popover-btn" onclick="applyBlockTemplateAndClose('${playerId}', '${k}')">
          <span>${t.name}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function showZoneSubmenu(playerId) {
  const pop = document.getElementById('fieldPopover');
  if (!pop) return;
  const p = state.defensePlay.players.find(x => x.id === playerId);
  if (!p) return;

  pop.innerHTML = `
    <div class="popover-header">
      <span class="popover-title">ゾーンカバー設定</span>
      <button class="popover-close" onclick="closePopover()">×</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      <label class="text-xs text-[var(--text-muted)]">ゾーンの大きさ (半径):</label>
      <div style="display:flex; gap:4px;">
        <button class="popover-btn" onclick="setZoneRadius('${playerId}', 5)">小 (5yd)</button>
        <button class="popover-btn" onclick="setZoneRadius('${playerId}', 8)">中 (8yd)</button>
        <button class="popover-btn" onclick="setZoneRadius('${playerId}', 12)">大 (12yd)</button>
      </div>
      <p class="text-xs text-[var(--text-muted)] mt-1">💡 青い中心丸をドラッグして移動、紫の端ハンドルをドラッグして無段階にサイズ変更できます。</p>
    </div>
  `;
}

function showManSubmenu(playerId) {
  const pop = document.getElementById('fieldPopover');
  if (!pop) return;
  const receivers = (state.offensePlay ? state.offensePlay.players : [])
    .filter(op => op.type === 'WR' || op.type === 'TE' || op.type === 'RB');

  pop.innerHTML = `
    <div class="popover-header">
      <span class="popover-title">マークする相手を選択</span>
      <button class="popover-close" onclick="closePopover()">×</button>
    </div>
    <div style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:4px;">
      ${receivers.map(r => `
        <button class="popover-btn" onclick="setManTargetAndClose('${playerId}', '${r.id}')">
          <span>${r.label} (${r.type})</span>
        </button>
      `).join('')}
    </div>
    <p class="text-xs text-[var(--text-muted)] mt-1">💡 フィールド上の赤い丸ハンドルをドラッグして別のレシーバーの上に重ねるだけでも変更できます。</p>
  `;
}

function setDefenseMan(playerId) {
  const p = state.defensePlay.players.find(x => x.id === playerId);
  if (p) {
    p.coverage = 'man';
    // If not currently assigned to a valid offensive target, find the closest receiver
    if (!p.target && state.offensePlay) {
      const receivers = state.offensePlay.players.filter(op => op.type === 'WR' || op.type === 'TE' || op.type === 'RB');
      let nearest = receivers[0];
      let minDist = 999;
      receivers.forEach(r => {
        const d = Math.hypot(r.x - p.x, r.y - p.y);
        if (d < minDist) {
          minDist = d;
          nearest = r;
        }
      });
      if (nearest) p.target = nearest.id;
    }
  }
  showManSubmenu(playerId);
  renderAll();
}

function applyPresetRouteAndClose(playerId, key) {
  const p = state.offensePlay.players.find(x => x.id === playerId);
  const tmpl = state.playType === 'run' ? PRESETS.runTemplates[key] : PRESETS.routeTemplates[key];
  if (p && tmpl) {
    p.routeType = state.playType === 'run' ? 'run' : 'pass';
    p.route = tmpl.path.map(step => ({
      x: Math.round(Math.max(3, Math.min(97, p.x + step.dx)) * 10) / 10,
      y: Math.round(Math.max(5, Math.min(95, p.y + step.dy)) * 10) / 10
    }));
  }
  closePopover();
  renderAll();
}

function applyBlockTemplateAndClose(playerId, key) {
  const p = state.offensePlay.players.find(x => x.id === playerId);
  const tmpl = PRESETS.blockTemplates[key];
  if (p && tmpl) {
    p.routeType = 'block';
    p.isBlocker = true;
    if (state.catchReceiverId === playerId) state.catchReceiverId = null;
    p.route = tmpl.path.map(step => ({
      x: Math.round(Math.max(3, Math.min(97, p.x + step.dx)) * 10) / 10,
      y: Math.round(Math.max(5, Math.min(95, p.y + step.dy)) * 10) / 10
    }));
  }
  closePopover();
  renderAll();
}

function setZoneRadius(playerId, radius) {
  const p = state.defensePlay.players.find(x => x.id === playerId);
  if (p) {
    p.coverage = 'zone';
    p.zoneRadius = radius;
    if (p.zoneX == null) {
      p.zoneX = p.x;
      p.zoneY = p.y - 12;
    }
  }
  closePopover();
  renderAll();
}

function setManTargetAndClose(playerId, targetId) {
  const p = state.defensePlay.players.find(x => x.id === playerId);
  if (p) {
    p.coverage = 'man';
    p.target = targetId;
  }
  closePopover();
  renderAll();
}

function setDefenseRush(playerId) {
  const p = state.defensePlay.players.find(x => x.id === playerId);
  if (p) {
    p.coverage = 'rush';
    p.rushX = p.x + (50 - p.x) * 0.4;
    p.rushY = p.y + 12;
  }
  closePopover();
  renderAll();
}

function clearPlayerRoute(playerId) {
  const p = state.offensePlay.players.find(x => x.id === playerId);
  if (p) p.route = [];
  closePopover();
  renderAll();
}

function setBallCarrier(playerId) {
  state.ballCarrierId = playerId;
  const qb = state.offensePlay ? state.offensePlay.players.find(p => p.type === 'QB') : null;
  const qbId = qb ? qb.id : 'QB';
  if (playerId === qbId) {
    state.runSequence = [
      { from: qbId, to: qbId, type: 'handoff', isOption: false }
    ];
  } else {
    state.runSequence = [
      { from: qbId, to: playerId, type: 'handoff', isOption: false }
    ];
  }
  renderRunSequenceUI();
  closePopover();
  renderAll();
}

/* ─── Pre-Snap Shift & Motion Management ────────────────────── */
function addPlayerShift(playerId) {
  if (!state.shifts) state.shifts = [];
  const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === playerId) : null;
  if (!p) return;
  // Offset laterally or forward
  const destX = p.x < 50 ? Math.min(85, p.x + 8) : Math.max(15, p.x - 8);
  const destY = p.y;
  state.shifts.push({ playerId, destX, destY });
  closePopover();
  renderPresnapUI();
  renderAll();
}

function removePlayerShift(playerId) {
  state.shifts = (state.shifts || []).filter(s => s.playerId !== playerId);
  closePopover();
  renderPresnapUI();
  renderAll();
}

function setPlayerMotion(playerId) {
  const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === playerId) : null;
  if (!p) return;
  // Motion across formation (e.g. Jet motion)
  const destX = p.x < 50 ? Math.min(80, p.x + 32) : Math.max(20, p.x - 32);
  const destY = Math.min(82, p.y + 2);
  state.motion = { playerId, destX, destY };
  closePopover();
  renderPresnapUI();
  renderAll();
}

function removePlayerMotion() {
  state.motion = null;
  closePopover();
  renderPresnapUI();
  renderAll();
}

function moveShiftOrder(idx, delta) {
  if (!state.shifts) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= state.shifts.length) return;
  const temp = state.shifts[idx];
  state.shifts[idx] = state.shifts[targetIdx];
  state.shifts[targetIdx] = temp;
  renderPresnapUI();
  renderAll();
}

function renderPresnapUI() {
  const countBadge = document.getElementById('presnapCountBadge');
  const shiftContainer = document.getElementById('shiftListContainer');
  const motionContainer = document.getElementById('motionContainer');
  if (!shiftContainer || !motionContainer) return;

  const shifts = state.shifts || [];
  const count = shifts.length + (state.motion ? 1 : 0);
  if (countBadge) countBadge.innerText = `${count}設定`;

  // Render shifts
  if (shifts.length === 0) {
    shiftContainer.innerHTML = '<div style="font-size:0.7rem; color:var(--text-muted); font-style:italic;">なし (選手クリックで指定)</div>';
  } else {
    shiftContainer.innerHTML = shifts.map((s, idx) => {
      const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === s.playerId) : null;
      const label = p ? `${p.label} (${p.type})` : s.playerId;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:4px 8px; border-radius:4px; font-size:0.72rem; border-left:2px solid #a855f7;">
          <span style="font-weight:bold; color:#c084fc;">${idx + 1}. ${label}</span>
          <div style="display:flex; gap:4px; align-items:center;">
            ${idx > 0 ? `<button style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.75rem;" onclick="moveShiftOrder(${idx}, -1)" title="上へ">▲</button>` : ''}
            ${idx < shifts.length - 1 ? `<button style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.75rem;" onclick="moveShiftOrder(${idx}, 1)" title="下へ">▼</button>` : ''}
            <button style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.85rem;" onclick="removePlayerShift('${s.playerId}')" title="削除">×</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render motion
  if (!state.motion) {
    motionContainer.innerHTML = '<div style="font-size:0.7rem; color:var(--text-muted); font-style:italic;">なし (選手クリックで指定)</div>';
  } else {
    const p = state.offensePlay ? state.offensePlay.players.find(x => x.id === state.motion.playerId) : null;
    const label = p ? `${p.label} (${p.type})` : state.motion.playerId;
    motionContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); padding:4px 8px; border-radius:4px; font-size:0.72rem; border-left:2px solid #06b6d4;">
        <span style="font-weight:bold; color:#38bdf8;">🏃 ${label}</span>
        <button style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.85rem;" onclick="removePlayerMotion()" title="削除">×</button>
      </div>
    `;
  }
}

/* ─── Run Sequence Validation & Alert Modal ─────────────────── */

/**
 * Calculates exact physical exchange timestamps along the timeline for all runSequence steps.
 * Identifies the exact closest-approach crossing point (minimum distance) rather than breaking on the first boundary frame.
 */
function calculateEffectiveRunExchangeTimes(reportErrors = false) {
  if (state.playType !== 'run' || !state.offensePlay || !state.runSequence) return [];

  const exchangeTimes = [];
  const animDur = state.anim.duration || 5.0;
  const minIntervalT = 1.0 / animDur; // 1.0 second minimum interval between exchanges

  let currentHolderId = 'QB';
  const qb = state.offensePlay.players.find(p => p.type === 'QB');
  if (qb) currentHolderId = qb.id;

  for (let sIdx = 0; sIdx < state.runSequence.length; sIdx++) {
    const step = state.runSequence[sIdx];
    const fromP = state.offensePlay.players.find(p => p.id === currentHolderId);
    const toP = step.to === 'smart' ? null : state.offensePlay.players.find(p => p.id === step.to);

    if (!fromP) {
      exchangeTimes.push(0.25 + sIdx * 0.25);
      continue;
    }
    if (step.type !== 'pass' && !toP) {
      exchangeTimes.push(0.25 + sIdx * 0.25);
      continue;
    }

    const prevT = exchangeTimes.length > 0 ? exchangeTimes[exchangeTimes.length - 1] : 0.05;

    // Check if step is PASS (Trick Play / HB Pass)
    if (step.type === 'pass') {
      const eligible = getEligiblePassReceivers(fromP.id);
      if (reportErrors) {
        if (toP && isPlayerBlocker(toP)) {
          showAlertModal(
            '⚠️ パス不可（ブロッカー指定エラー）',
            `手順 ${sIdx + 1}: <b>${toP.label}</b> はブロッカーに指定されているためパスのターゲットにできません。<br><br>` +
            `レシーバーを通常ルートに戻すか、他のレシーバーを選択してください。`
          );
          return null;
        }
        if (eligible.length === 0) {
          showAlertModal(
            '⚠️ パス不可（適格レシーバーなし）',
            `パスルートを走っている適格なレシーバーが存在しません。<br>` +
            `最低1人はブロッカーではなくルートを走るレシーバーを設定してください。`
          );
          return null;
        }
      }
      const userThrowT = state.throwTime || (state.throwTimingSec ? state.throwTimingSec / animDur : 0.4);
      const throwT = Math.min(0.88, Math.max(prevT + minIntervalT, userThrowT));
      exchangeTimes.push(throwT);
      currentHolderId = toP ? toP.id : (eligible[0] ? eligible[0].id : 'smart');
      continue;
    }

    // Check if keeper keeps the ball (same person, e.g. QB -> QB): No crossing needed!
    if (toP && (toP.id === fromP.id || toP.id === currentHolderId)) {
      const keepT = Math.min(0.85, prevT + minIntervalT);
      exchangeTimes.push(keepT);
      currentHolderId = toP.id;
      continue;
    }

    let minDistance = 999;
    let bestT = -1;

    // Scan timeline to find the closest approach (crossing/mesh point)
    // For sIdx === 0: scan starting at t = 0.02 to find the exact moment players overlap/cross (e.g. t = 0.10 - 0.14)
    // For sIdx > 0: scan starting at prevT + minIntervalT (guarantees at least 1.0s interval between exchanges)
    const scanStartT = sIdx > 0 ? (prevT + minIntervalT) : 0.02;
    const threshold = step.type === 'handoff' ? 4.8 : 14.0;

    // Find the true minimum distance crossing point
    for (let t = scanStartT; t <= 0.88; t += 0.01) {
      const posFrom = getOffenseBasePosAt(fromP, t);
      const posTo = getOffenseBasePosAt(toP, t);
      const dist = Math.hypot(posFrom.x - posTo.x, posFrom.y - posTo.y);

      if (dist < minDistance) {
        minDistance = dist;
        if (dist <= threshold) {
          bestT = t;
        }
      }
    }

    if (bestT < 0) {
      // If no valid crossing point found within threshold after 1.0s interval,
      // fallback smoothly to prevT + minIntervalT so playback never fails or gets blocked.
      const fallbackT = Math.min(0.85, Math.max(prevT + minIntervalT, sIdx === 0 ? 0.12 : (prevT + 0.20)));
      exchangeTimes.push(Math.round(fallbackT * 100) / 100);
      currentHolderId = toP ? toP.id : 'RB';
      continue;
    }

    exchangeTimes.push(Math.round(bestT * 100) / 100);
    currentHolderId = toP.id;
  }

  return exchangeTimes;
}

function validateRunSequence() {
  if (state.playType !== 'run' || !state.offensePlay) {
    const nearest = findNearestReceiverTo(state.passTargetPos);
    if (nearest) state.catchReceiverId = nearest.id;
    return true;
  }

  const times = calculateEffectiveRunExchangeTimes(true);
  if (!times) {
    state.runExchangeTimes = calculateEffectiveRunExchangeTimes(false);
    return false;
  }
  state.runExchangeTimes = times;
  return true;
}

function showAlertModal(title, msg) {
  const modal = document.getElementById('alertModal');
  const titleEl = document.getElementById('alertModalTitle');
  const msgEl = document.getElementById('alertModalMsg');
  if (titleEl) titleEl.innerHTML = title;
  if (msgEl) msgEl.innerHTML = msg;
  if (modal) modal.classList.add('show');
}

function closeAlertModal() {
  const modal = document.getElementById('alertModal');
  if (modal) modal.classList.remove('show');
}

/* ─── Duration & Throw Timing Controller ────────────────────── */
function setThrowTiming(sec) {
  state.throwTimingSec = Math.max(0.6, Math.min(state.anim.duration - 0.6, Math.round(sec * 10) / 10));
  state.throwTime = state.throwTimingSec / state.anim.duration;
  // Ball takes ~1.0 second to reach landing spot
  state.catchTime = Math.min(1.0, (state.throwTimingSec + 1.0) / state.anim.duration);

  // Sync UI elements (both pass container and run container)
  const labelPass = document.getElementById('throwTimingLabel');
  const sliderPass = document.getElementById('throwTimingSlider');
  const labelRun = document.getElementById('runThrowTimingLabel');
  const sliderRun = document.getElementById('runThrowTimingSlider');

  const text = `${state.throwTimingSec.toFixed(1)}s 後`;
  const maxVal = (state.anim.duration - 0.6).toFixed(1);

  if (labelPass) labelPass.innerText = text;
  if (sliderPass) {
    sliderPass.max = maxVal;
    sliderPass.value = state.throwTimingSec;
  }
  if (labelRun) labelRun.innerText = text;
  if (sliderRun) {
    sliderRun.max = maxVal;
    sliderRun.value = state.throwTimingSec;
  }

  resetPlay();
}

function setPlayDuration(sec) {
  state.anim.duration = sec;
  // Adjust throw timing if needed
  setThrowTiming(Math.min(state.throwTimingSec, sec - 0.8));
  resetPlay();
}


/* ─── Animation Loop & Controls ─────────────────────────────── */
function togglePlay() {
  if (state.anim.isPlaying) {
    pausePlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  closePopover();

  // Validate run sequence before play starts
  if (!validateRunSequence()) {
    pausePlay();
    return; // Do not start if validation failed!
  }

  // Pre-roll defense 50/50 option assignments (persists across playback for smooth, warp-free defense reactions)
  state.defenseOptionAssignments = {};
  if (state.defensePlay && state.defensePlay.players) {
    state.defensePlay.players.forEach(p => {
      state.defenseOptionAssignments[p.id] = Math.random() < 0.5 ? 0 : 1;
    });
  }

  // Pre-roll option & RPO decisions for steps:
  // - option: 50% give (handoff), 50% keep
  // - rpo: 50% give (handoff), 50% pass (0.5s after keep). (If no route runners, 100% give)
  state.rpoPassState = null;
  state.runOptionDecisions = state.runSequence.map((step, idx) => {
    if (step.type === 'pass') {
      const optType = step.optionType || (step.isOption ? 'option' : 'none');
      if (optType === 'option') {
        return Math.random() < 0.5 ? 'pass' : 'keep';
      }
      return 'pass';
    }
    const optType = step.optionType || (step.isOption ? 'option' : 'none');
    if (optType === 'none' || step.from === step.to) {
      return 'give';
    }
    if (optType === 'option') {
      return Math.random() < 0.5 ? 'give' : 'keep';
    }
    if (optType === 'rpo') {
      const eligible = getEligiblePassReceivers(step.to);
      if (eligible.length === 0) {
        // パスルートに出ている人がいなければ100%ラン
        return 'give';
      }
      return Math.random() < 0.5 ? 'give' : 'pass';
    }
    return 'give';
  });

  // If RPO or Trick Pass decision was 'pass', prepare the pass plan
  if (state.playType === 'run') {
    for (let i = 0; i < state.runSequence.length; i++) {
      const step = state.runSequence[i];
      const optType = step.optionType || (step.isOption ? 'option' : 'none');
      const dec = state.runOptionDecisions[i];

      // 1. TRICK PASS (HB Pass, Reverse Pass, etc.)
      if (step.type === 'pass' && dec === 'pass') {
        const passer = state.offensePlay.players.find(p => p.id === step.from) || state.offensePlay.players[0];
        const prevExT = (i > 0 && state.runExchangeTimes && state.runExchangeTimes[i - 1] != null)
          ? state.runExchangeTimes[i - 1]
          : 0.15;
        const userThrowT = state.throwTime || (state.throwTimingSec ? state.throwTimingSec / state.anim.duration : 0.4);
        const minThrowT = prevExT + (1.0 / state.anim.duration);
        const throwT = Math.min(0.88, Math.max(minThrowT, userThrowT));
        const catchT = Math.min(0.95, throwT + (0.9 / state.anim.duration));

        const eligible = getEligiblePassReceivers(step.from);
        if (eligible.length === 0) {
          state.runOptionDecisions[i] = 'keep';
          continue;
        }

        let targetReceiver = null;
        if (step.to === 'smart') {
          const smartOpen = getSmartOpenReceiver(throwT, catchT, step.from);
          targetReceiver = (smartOpen && smartOpen.receiver) ? smartOpen.receiver : eligible[0];
        } else {
          targetReceiver = state.offensePlay.players.find(p => p.id === step.to) || eligible[0];
        }

        const targetPos = getOffenseBasePosAt(targetReceiver, catchT);

        state.rpoPassState = {
          stepIndex: i,
          isTrickPass: true,
          prevExT,
          throwT,
          catchT,
          passer,
          qb: passer, // compatibility
          targetReceiver,
          targetX: targetPos.x,
          targetY: targetPos.y,
          isCatchable: true,
          isThrowing: true,
          separation: 10.0
        };
        break; // Pass takes over the remainder of the play
      }

      // 2. RPO (Run Pass Option from QB)
      if (optType === 'rpo' && dec === 'pass') {
        const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
        const meshT = (state.runExchangeTimes && state.runExchangeTimes[i] != null) ? state.runExchangeTimes[i] : 0.25;
        const userThrowT = state.throwTime || (state.throwTimingSec ? state.throwTimingSec / state.anim.duration : 0.4);
        const minThrowT = meshT + (0.25 / state.anim.duration);
        const throwT = Math.min(0.90, Math.max(minThrowT, userThrowT));
        const catchT = Math.min(0.95, throwT + (1.0 / state.anim.duration));

        const eligible = getEligiblePassReceivers(step.to);
        if (eligible.length === 0) {
          state.runOptionDecisions[i] = 'give';
          continue;
        }
        const smartOpen = getSmartOpenReceiver(throwT, catchT, step.to);
        const targetReceiver = (smartOpen && smartOpen.receiver) ? smartOpen.receiver : eligible[0];
        const targetPos = (smartOpen && smartOpen.posAtCatch) ? smartOpen.posAtCatch : getOffenseBasePosAt(targetReceiver, catchT);

        state.rpoPassState = {
          stepIndex: i,
          isTrickPass: false,
          prevExT: meshT,
          meshT,
          throwT,
          catchT,
          passer: qb,
          qb,
          targetReceiver,
          targetX: targetPos.x,
          targetY: targetPos.y,
          isCatchable: true,
          isThrowing: true,
          separation: smartOpen ? smartOpen.separation : 10.0
        };
        break; // RPO pass takes over play
      }
      if ((optType === 'option' || step.isOption) && dec === 'give') {
        // 1回目でハンドオフした場合はそのままラン
        break;
      }
    }
  }

  if (state.anim.progress >= 1.0) {
    state.anim.progress = 0.0;
  }
  state.anim.isPlaying = true;
  state.anim.lastTimestamp = null;
  updatePlayButtonUI();
  state.anim.frameId = requestAnimationFrame(animStep);
}

function pausePlay() {
  state.anim.isPlaying = false;
  if (state.anim.frameId) cancelAnimationFrame(state.anim.frameId);
  updatePlayButtonUI();
}

function resetPlay() {
  pausePlay();
  state.anim.progress = 0.0;
  state.runOptionDecisions = [];
  state.defenseOptionAssignments = {};
  state.rpoPassState = null;
  state.smartPassTargetLock = null;
  state.catchReceiverId = null;
  state.resolvedPass = null;
  updateSeekerUI();
  renderAll();
}

function setProgress(val) {
  state.anim.progress = Math.max(0, Math.min(1.0, val));
  if (state.throwTime && state.anim.progress < state.throwTime) {
    state.smartPassTargetLock = null;
  }
  updateSeekerUI();
  renderAll();
}

function animStep(timestamp) {
  if (!state.anim.lastTimestamp) state.anim.lastTimestamp = timestamp;
  const dt = (timestamp - state.anim.lastTimestamp) / 1000;
  state.anim.lastTimestamp = timestamp;

  const totalDur = getTotalDuration();
  state.anim.progress += (dt / totalDur) * state.anim.speed;

  if (state.anim.progress >= 1.0) {
    state.anim.progress = 1.0;
    updateSeekerUI();
    renderAll();
    pausePlay();
    return;
  }

  updateSeekerUI();
  renderAll();
  state.anim.frameId = requestAnimationFrame(animStep);
}


function updatePlayButtonUI() {
  const btn = document.getElementById('btnPlay');
  if (!btn) return;
  if (state.anim.isPlaying) {
    btn.className = 'play-btn paused';
    btn.innerHTML = '<span>⏸</span> 一時停止';
  } else {
    btn.className = 'play-btn';
    btn.innerHTML = '<span>▶</span> スナップ！（再生）';
  }
}

function updateSeekerUI() {
  const seeker = document.getElementById('seekerSlider');
  const label = document.getElementById('timeLabel');
  if (seeker) seeker.value = state.anim.progress * 100;
  if (label) {
    const totalDur = getTotalDuration();
    const curSec = state.anim.progress * totalDur;
    const preSnapSec = getPreSnapDuration();
    if (preSnapSec > 0) {
      if (curSec < preSnapSec) {
        label.innerText = `${curSec.toFixed(1)}s (プレ) / ${totalDur.toFixed(1)}s`;
      } else {
        const postSec = curSec - preSnapSec;
        label.innerText = `${postSec.toFixed(1)}s (プレー) / ${state.anim.duration.toFixed(1)}s`;
      }
    } else {
      label.innerText = `${curSec.toFixed(1)}s / ${state.anim.duration.toFixed(1)}s`;
    }
  }
}

/* ─── Run Sequence UI Management ────────────────────────────── */
function renderRunSequenceUI() {
  const container = document.getElementById('runSequenceList');
  if (!container || !state.offensePlay) return;

  container.innerHTML = '';
  const availableReceivers = state.offensePlay.players.filter(p => p.type !== 'OL' && p.type !== 'C');

  let prevCarrier = state.offensePlay.players.find(p => p.type === 'QB') || { id: 'QB', label: 'QB' };

  state.runSequence.forEach((step, idx) => {
    const isPass = step.type === 'pass';
    const isSelfKeep = !isPass && (step.to === prevCarrier.id);
    const item = document.createElement('div');
    item.className = 'run-seq-item';

    // Eligible receiver options for this step
    const passReceivers = getEligiblePassReceivers(prevCarrier.id);

    item.innerHTML = `
      <div class="run-seq-row">
        <span style="font-weight:bold; color:#60a5fa;">${idx + 1}. ${prevCarrier.label} ➔</span>
        <select class="run-seq-select" onchange="updateRunSequenceTarget(${idx}, this.value)">
          ${isPass ? `
            <option value="smart" ${step.to === 'smart' ? 'selected' : ''}>🌟 [自動] オープンな選手へ (スマート)</option>
            ${passReceivers.map(p => `
              <option value="${p.id}" ${p.id === step.to ? 'selected' : ''}>${p.label} (${p.type})</option>
            `).join('')}
          ` : `
            ${availableReceivers.map(p => `
              <option value="${p.id}" ${p.id === step.to ? 'selected' : ''}>${p.label} (${p.type})${p.id === prevCarrier.id ? ' [キープ]' : ''}</option>
            `).join('')}
          `}
        </select>
        ${state.runSequence.length > 1 ? `
          <button style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.9rem;" onclick="removeRunSequenceStep(${idx})" title="削除">×</button>
        ` : ''}
      </div>
      <div class="run-seq-row">
        <span style="color:var(--text-muted); font-size:0.7rem;">受渡方式:</span>
        <div class="run-seq-btn-group">
          ${isSelfKeep ? `
            <button class="run-seq-type-btn active" disabled style="opacity:0.9; cursor:default;">🏃 自身でキープ/走る</button>
          ` : `
            <button class="run-seq-type-btn ${step.type === 'handoff' ? 'active' : ''}" onclick="setRunSequenceType(${idx}, 'handoff')">🤝 ハンドオフ</button>
            <button class="run-seq-type-btn ${step.type === 'toss' ? 'active' : ''}" onclick="setRunSequenceType(${idx}, 'toss')">🏉 トス</button>
            <button class="run-seq-type-btn pass ${step.type === 'pass' ? 'active pass' : ''}" onclick="setRunSequenceType(${idx}, 'pass')">🎯 パス</button>
          `}
        </div>
      </div>
      <div class="run-seq-row" style="margin-top: 4px;">
        <span style="color:var(--text-muted); font-size:0.7rem;">分岐オプション:</span>
        <div class="run-seq-btn-group">
          ${isPass ? `
            <button class="run-seq-opt-btn ${(!step.optionType || step.optionType === 'none') && !step.isOption ? 'active' : ''}" onclick="setRunSequenceOption(${idx}, 'none')">無 (必ずパス)</button>
            <button class="run-seq-opt-btn ${step.optionType === 'option' || (step.isOption && step.optionType !== 'rpo') ? 'active' : ''}" onclick="setRunSequenceOption(${idx}, 'option')">🎲 オプション (50%ラン / 50%パス)</button>
          ` : `
            <button class="run-seq-opt-btn ${(!step.optionType || step.optionType === 'none') && !step.isOption ? 'active' : ''}" onclick="setRunSequenceOption(${idx}, 'none')">無 (通常)</button>
            <button class="run-seq-opt-btn ${step.optionType === 'option' || (step.isOption && step.optionType !== 'rpo') ? 'active' : ''}" onclick="setRunSequenceOption(${idx}, 'option')">🎲 オプション</button>
            <button class="run-seq-opt-btn rpo ${step.optionType === 'rpo' ? 'active rpo' : ''}" onclick="setRunSequenceOption(${idx}, 'rpo')" title="50%でラン、50%でキープ後0.5秒でパス">⚡ RPO</button>
          `}
        </div>
      </div>
    `;

    container.appendChild(item);
    if (!isPass) {
      const curr = state.offensePlay.players.find(p => p.id === step.to);
      if (curr) prevCarrier = curr;
    }
  });

  const addBtn = document.getElementById('btnAddRunSeq');
  if (addBtn) {
    const lastStep = state.runSequence[state.runSequence.length - 1];
    const canAdd = state.runSequence.length < 4 && (!lastStep || lastStep.type !== 'pass');
    addBtn.style.display = canAdd ? 'flex' : 'none';
  }
}

function addRunSequenceStep() {
  if (state.runSequence.length >= 4 || !state.offensePlay) return;
  const lastStep = state.runSequence[state.runSequence.length - 1];
  if (lastStep && lastStep.type === 'pass') return;

  const available = state.offensePlay.players.filter(p => p.type !== 'OL' && p.type !== 'C');
  const usedIds = state.runSequence.map(s => s.to);
  const nextTarget = available.find(p => !usedIds.includes(p.id)) || available[0];

  const prevStep = state.runSequence[state.runSequence.length - 1];
  state.runSequence.push({
    from: prevStep ? prevStep.to : 'QB',
    to: nextTarget ? nextTarget.id : 'RB',
    type: 'handoff',
    isOption: false,
    optionType: 'none'
  });
  renderRunSequenceUI();
  renderAll();
}

function removeRunSequenceStep(idx) {
  if (state.runSequence.length <= 1) return;
  state.runSequence.splice(idx, 1);
  renderRunSequenceUI();
  renderAll();
}

function updateRunSequenceTarget(idx, targetId) {
  if (state.runSequence[idx]) {
    state.runSequence[idx].to = targetId;
    if (state.runSequence[idx].type === 'pass' && targetId !== 'smart') {
      const targetP = state.offensePlay ? state.offensePlay.players.find(p => p.id === targetId) : null;
      if (targetP) {
        if (isPlayerBlocker(targetP)) {
          targetP.routeType = 'pass';
          targetP.isBlocker = false;
        }
        if (targetP.type === 'QB') {
          targetP.routeType = 'pass';
          targetP.isBlocker = false;
          if (!targetP.route || targetP.route.length <= 1) {
            targetP.route = [
              { x: targetP.x, y: targetP.y + 2.5 },
              { x: Math.min(85, targetP.x + 12), y: Math.max(10, targetP.y - 12) }
            ];
          }
        } else if (!targetP.route || targetP.route.length === 0) {
          targetP.route = [{ x: targetP.x, y: Math.max(15, targetP.y - 18) }];
        }
      }
    }
    for (let i = idx + 1; i < state.runSequence.length; i++) {
      state.runSequence[i].from = state.runSequence[i - 1].to;
    }
    renderRunSequenceUI();
    renderAll();
  }
}

function setRunSequenceType(idx, type) {
  if (state.runSequence[idx]) {
    state.runSequence[idx].type = type;
    if (type === 'pass') {
      const fromId = state.runSequence[idx].from;
      if (state.runSequence[idx].to === fromId) {
        state.runSequence[idx].to = 'smart';
      }
      if (state.runSequence[idx].optionType === 'rpo') {
        state.runSequence[idx].optionType = 'none';
        state.runSequence[idx].isOption = false;
      }
      // Pass terminates the handoff sequence
      if (idx < state.runSequence.length - 1) {
        state.runSequence.splice(idx + 1);
      }
      // If all WR/TEs are currently blockers, ensure at least one WR/TE is set to pass route!
      let eligible = getEligiblePassReceivers(fromId);
      if (eligible.length === 0 && state.offensePlay) {
        const wr = state.offensePlay.players.find(p => p.id !== fromId && (p.type === 'WR' || p.type === 'TE'));
        if (wr) {
          wr.routeType = 'pass';
          wr.isBlocker = false;
          wr.route = [{ x: wr.x, y: Math.max(15, wr.y - 18) }];
        }
      }
      // If a specific receiver is selected in step.to and that player is a blocker, restore them to route
      if (state.runSequence[idx].to && state.runSequence[idx].to !== 'smart') {
        const targetP = state.offensePlay.players.find(p => p.id === state.runSequence[idx].to);
        if (targetP) {
          if (isPlayerBlocker(targetP)) {
            targetP.routeType = 'pass';
            targetP.isBlocker = false;
          }
          if (targetP.type === 'QB') {
            targetP.routeType = 'pass';
            targetP.isBlocker = false;
            if (!targetP.route || targetP.route.length <= 1) {
              targetP.route = [
                { x: targetP.x, y: targetP.y + 2.5 },
                { x: Math.min(85, targetP.x + 12), y: Math.max(10, targetP.y - 12) }
              ];
            }
          } else if (!targetP.route || targetP.route.length === 0) {
            targetP.route = [{ x: targetP.x, y: Math.max(15, targetP.y - 18) }];
          }
        }
      }
    }
    renderRunSequenceUI();
    renderAll();
  }
}

function setRunSequenceOption(idx, optionType) {
  if (state.runSequence[idx]) {
    if (typeof optionType === 'boolean') {
      optionType = optionType ? 'option' : 'none';
    }
    state.runSequence[idx].optionType = optionType;
    state.runSequence[idx].isOption = (optionType !== 'none');
    renderRunSequenceUI();
    renderAll();
  }
}

/* ─── Auto Setup for Run Play (RB-QB Crossing & Blockers) ────── */
function setupRunPlayMode() {
  if (!state.offensePlay) return;
  const qb = state.offensePlay.players.find(p => p.type === 'QB') || state.offensePlay.players[0];
  const rb = state.offensePlay.players.find(p => p.type === 'RB') || state.offensePlay.players.find(p => p.id !== qb.id);
  if (!qb || !rb) return;

  state.ballCarrierId = rb.id;

  // 1. Calculate guaranteed handoff mesh intersection point
  const meshX = qb.x;
  const meshY = Math.round((qb.y + 2.5) * 10) / 10;

  // QB: Steps back to mesh handoff point
  qb.routeType = 'pass';
  qb.route = [
    { x: meshX, y: meshY }
  ];

  // RB: Runs through mesh point to cross QB perfectly, then blasts through gap!
  rb.routeType = 'run';
  rb.route = [
    { x: meshX, y: meshY },           // Guaranteed crossing handoff point!
    { x: Math.round((meshX + 4.0) * 10) / 10, y: Math.round((meshY - 14) * 10) / 10 }, // Off-tackle burst
    { x: Math.round((meshX + 4.5) * 10) / 10, y: 15 } // Breakaway sprint
  ];

  // 2. All other players become BLOCKERS and advance to drive block defenders!
  state.offensePlay.players.forEach(p => {
    if (p.id !== qb.id && p.id !== rb.id) {
      p.routeType = 'block';
      if (p.type === 'OL' || p.type === 'C' || p.type === 'OG' || p.type === 'OT') {
        p.route = [{ x: p.x, y: Math.max(58, Math.round((p.y - 4.5) * 10) / 10) }];
      } else {
        // WR, TE: Seal DBs and second-level defenders
        p.route = [{ x: p.x, y: Math.max(48, Math.round((p.y - 8.0) * 10) / 10) }];
      }
    }
  });

  // 3. Sync run sequence
  state.runSequence = [
    { from: qb.id, to: rb.id, type: 'handoff', isOption: false }
  ];
  renderRunSequenceUI();
  resetPlay();
}

/* ─── Restore Pass Preset (Routes & Roles) ──────────────────── */
function restorePassPresetRoutes() {
  if (!state.offensePlay) return;

  // Determine which preset to restore from
  let presetId = state.offensePlay.id;
  const offSel = document.getElementById('offensePresetSelect');
  if (offSel && offSel.value && PRESETS.offense[offSel.value]) {
    presetId = offSel.value;
  }

  const preset = PRESETS.offense[presetId] || PRESETS.offense['shotgun_spread'];
  if (!preset) return;

  // Map preset players by ID or type for restoring routes and routeTypes
  const presetMap = new Map();
  preset.players.forEach(p => presetMap.set(p.id, p));

  state.offensePlay.players.forEach(p => {
    const src = presetMap.get(p.id);
    if (src) {
      p.routeType = src.routeType || 'pass';
      // Deep copy routes
      p.route = JSON.parse(JSON.stringify(src.route || []));
    } else {
      // Fallback based on player type
      if (p.type === 'OL' || p.type === 'C') {
        p.routeType = 'block';
        p.route = [{ x: p.x, y: Math.min(85, p.y + 2) }];
      } else if (p.type === 'QB') {
        p.routeType = 'qb';
        p.route = [{ x: p.x, y: Math.min(85, p.y + 3) }];
      } else {
        p.routeType = 'pass';
        p.route = [{ x: p.x, y: Math.max(10, p.y - 15) }];
      }
    }
  });

  resetPlay();
}

/* ─── UI Bindings & Sidebar ─────────────────────────────────── */
function bindUIEvents() {
  setupFieldClickForDrawing();

  // Mode Tabs
  document.querySelectorAll('.mode-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.remove('active', 'offense', 'defense', 'matchup'));
      const mode = btn.dataset.mode;
      state.mode = mode;
      btn.classList.add('active', mode);
      closePopover();
      renderAll();
    });
  });

  // Play Type Toggle (Pass vs Run)
  const btnPass = document.getElementById('btnTypePass');
  const btnRun = document.getElementById('btnTypeRun');
  const passContainer = document.getElementById('passOptionsContainer');
  const runContainer = document.getElementById('runOptionsContainer');

  if (btnPass && btnRun) {
    btnPass.addEventListener('click', () => {
      state.playType = 'pass';
      btnPass.className = 'play-type-btn active pass';
      btnRun.className = 'play-type-btn';
      if (passContainer) passContainer.style.display = 'block';
      if (runContainer) runContainer.style.display = 'none';
      restorePassPresetRoutes(); // Automatically restores pass preset routes!
      renderAll();
    });
    btnRun.addEventListener('click', () => {
      state.playType = 'run';
      btnRun.className = 'play-type-btn active run';
      btnPass.className = 'play-type-btn';
      if (passContainer) passContainer.style.display = 'none';
      if (runContainer) runContainer.style.display = 'block';
      setupRunPlayMode(); // Automatically sets up crossing run route & blockers!
      renderAll();
    });
  }


  // Seeker
  const seeker = document.getElementById('seekerSlider');
  if (seeker) {
    seeker.addEventListener('input', (e) => {
      setProgress(parseFloat(e.target.value) / 100);
    });
  }

  // Speed
  ['0.5', '1.0', '1.5'].forEach(spd => {
    const b = document.getElementById(`spd_${spd.replace('.', '')}`);
    if (b) {
      b.addEventListener('click', () => {
        state.anim.speed = parseFloat(spd);
        document.querySelectorAll('.spd-btn').forEach(x => x.style.borderColor = 'var(--border-color)');
        b.style.borderColor = 'var(--primary)';
      });
    }
  });

  // Initialize Run Sequence UI
  renderRunSequenceUI();
}

/* ─── 2-Stage Custom Formations System ───────────────────────── */
const STORAGE_KEY_CUSTOM_FORMATIONS = 'football_play_designer_custom_formations_v2';

function getCustomFormations(side) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_FORMATIONS);
    const list = raw ? JSON.parse(raw) : [];
    return side ? list.filter(item => item.side === side) : list;
  } catch (e) {
    return [];
  }
}

let savingFormationSide = 'offense';

function openSaveFormationModal(side) {
  savingFormationSide = side;
  const modal = document.getElementById('formationModal');
  const title = document.getElementById('formationModalTitle');
  const catSel = document.getElementById('modalFormCategorySelect');
  const catCustom = document.getElementById('modalFormCategoryCustomInput');
  const varInput = document.getElementById('modalFormVariationInput');

  if (title) {
    title.innerText = side === 'offense' 
      ? '🔵 オフェンス フォーメーション新規登録 (2段階)' 
      : '🔴 ディフェンス フォーメーション新規登録 (2段階)';
  }

  const existingCustom = getCustomFormations(side);
  const customCategories = Array.from(new Set(existingCustom.map(c => c.category)));

  const defaultCategories = side === 'offense'
    ? ['Shotgun', 'I-Formation', 'Singleback', 'Pistol', 'Spread', 'Wishbone', 'Goal Line']
    : ['4-3 Base', '3-4 Base', 'Nickel (3-3-5)', 'Dime (4-1-6)', 'Goal Line'];

  const allCategories = Array.from(new Set([...defaultCategories, ...customCategories]));

  if (catSel) {
    catSel.innerHTML = allCategories.map(c => `<option value="${c}">${c}</option>`).join('') +
      `<option value="__NEW__">＋ 新規カテゴリを自由入力...</option>`;
  }

  if (catCustom) {
    catCustom.style.display = 'none';
    catCustom.value = '';
  }
  if (varInput) {
    varInput.value = '';
  }
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeSaveFormationModal() {
  const modal = document.getElementById('formationModal');
  if (modal) modal.style.display = 'none';
}

function onModalCategoryChange(val) {
  const customInput = document.getElementById('modalFormCategoryCustomInput');
  if (customInput) {
    customInput.style.display = val === '__NEW__' ? 'block' : 'none';
    if (val === '__NEW__') customInput.focus();
  }
}

function confirmSaveFormation() {
  const catSel = document.getElementById('modalFormCategorySelect');
  const catCustom = document.getElementById('modalFormCategoryCustomInput');
  const varInput = document.getElementById('modalFormVariationInput');

  let category = catSel ? catSel.value : 'Custom';
  if (category === '__NEW__') {
    category = (catCustom && catCustom.value.trim()) || 'Custom';
  }
  const variation = (varInput && varInput.value.trim()) || 'Standard';

  const side = savingFormationSide;
  const currentPlay = side === 'offense' ? state.offensePlay : state.defensePlay;
  if (!currentPlay) return;

  const customList = getCustomFormations();
  const newFormation = {
    id: `cform_${side}_${Date.now()}`,
    side,
    category,
    variation,
    name: `${category} → ${variation}`,
    players: currentPlay.players.map(p => ({
      id: p.id,
      label: p.label,
      type: p.type,
      x: p.x,
      y: p.y,
      routeType: p.routeType || (p.type === 'OL' || p.type === 'C' ? 'block' : 'pass'),
      route: p.route ? JSON.parse(JSON.stringify(p.route)) : [],
      coverage: p.coverage || 'zone',
      target: p.target,
      zoneName: p.zoneName,
      zoneX: p.zoneX,
      zoneY: p.zoneY,
      zoneRadius: p.zoneRadius
    }))
  };

  customList.push(newFormation);
  localStorage.setItem(STORAGE_KEY_CUSTOM_FORMATIONS, JSON.stringify(customList));

  closeSaveFormationModal();
  updatePresetDropdowns();

  const sel = document.getElementById(side === 'offense' ? 'offensePresetSelect' : 'defensePresetSelect');
  if (sel) {
    sel.value = `custom:${newFormation.id}`;
  }

  showToast(`✅ フォーメーション「${category} → ${variation}」を登録しました！`);
}

function loadCustomFormation(id) {
  const customList = getCustomFormations();
  const formation = customList.find(f => f.id === id);
  if (!formation) return;

  if (formation.side === 'offense') {
    state.offensePlay = {
      id: formation.id,
      name: formation.name,
      description: `カスタムフォーメーション: ${formation.name}`,
      players: JSON.parse(JSON.stringify(formation.players))
    };
    state.shifts = [];
    state.motion = null;
    const rb = state.offensePlay.players.find(p => p.type === 'RB');
    if (rb) {
      state.ballCarrierId = rb.id;
      state.runSequence = [{ from: 'QB', to: rb.id, type: 'handoff', isOption: false }];
    }
    renderRunSequenceUI();
    renderPresnapUI();
  } else {
    state.defensePlay = {
      id: formation.id,
      name: formation.name,
      description: `カスタムフォーメーション: ${formation.name}`,
      players: JSON.parse(JSON.stringify(formation.players))
    };
  }

  state.selectedPlayer = null;
  closePopover();
  resetPlay();
}

/**
 * Deletes custom formation with confirmation warning.
 */
function deleteCustomFormation(side, formationId, category, variation) {
  let label = '';
  if (variation) {
    label = `「${category || ''} › ${variation}」`;
  } else if (category) {
    label = `カテゴリ「${category}」`;
  } else if (formationId) {
    const found = getCustomFormations().find(f => f.id === formationId);
    label = found ? `「${found.name || found.category}」` : '';
  }

  const ok = confirm(`⚠️ 警告: フォーメーション${label}を削除しますか？\n\n※この操作は取り消せません。登録した隊形データが完全に削除されます。`);
  if (!ok) return;

  let customList = getCustomFormations();
  if (formationId) {
    customList = customList.filter(f => f.id !== formationId);
  } else if (category && variation) {
    customList = customList.filter(f => !(f.side === side && f.category === category && f.variation === variation));
  } else if (category) {
    customList = customList.filter(f => !(f.side === side && f.category === category));
  }

  localStorage.setItem(STORAGE_KEY_CUSTOM_FORMATIONS, JSON.stringify(customList));
  updatePresetDropdowns();

  // If the deleted formation was currently loaded in active state, revert to default preset
  if (side === 'offense' && state.offensePlay && (state.offensePlay.id === formationId || (state.offensePlay.formationCategory === category && (!variation || state.offensePlay.formationVariation === variation)))) {
    state.offensePlay = JSON.parse(JSON.stringify(PRESETS.offense['shotgun_spread']));
    renderAll();
  } else if (side === 'defense' && state.defensePlay && (state.defensePlay.id === formationId || (state.defensePlay.formationCategory === category && (!variation || state.defensePlay.formationVariation === variation)))) {
    state.defensePlay = JSON.parse(JSON.stringify(PRESETS.defense['cover2_man']));
    renderAll();
  }

  showToast(`🗑 フォーメーション${label}を削除しました`);

  // Re-render playbook browser if open
  const modal = document.getElementById('playbookBrowserModal');
  if (modal && modal.style.display !== 'none') {
    renderPlaybookBrowser();
  }
}

function deleteSelectedCustomFormation(side) {
  const sel = document.getElementById(side === 'offense' ? 'offensePresetSelect' : 'defensePresetSelect');
  if (!sel || !sel.value.startsWith('custom:')) return;
  const id = sel.value.replace('custom:', '');
  deleteCustomFormation(side, id);
}

function updatePresetDropdowns() {
  const offSel = document.getElementById('offensePresetSelect');
  const defSel = document.getElementById('defensePresetSelect');

  const customOff = getCustomFormations('offense');
  const customDef = getCustomFormations('defense');

  if (offSel) {
    let html = '';
    html += `<optgroup label="📋 標準フォーメーション">`;
    Object.values(PRESETS.offense).forEach(p => {
      html += `<option value="preset:${p.id}">${p.name}</option>`;
    });
    html += `</optgroup>`;

    if (customOff.length > 0) {
      const categories = Array.from(new Set(customOff.map(c => c.category)));
      categories.forEach(cat => {
        html += `<optgroup label="📁 ${cat}">`;
        customOff.filter(c => c.category === cat).forEach(c => {
          html += `<option value="custom:${c.id}">↳ ${c.variation} (カスタム)</option>`;
        });
        html += `</optgroup>`;
      });
    }

    offSel.innerHTML = html;
  }

  if (defSel) {
    let html = '';
    html += `<optgroup label="📋 標準フォーメーション">`;
    Object.values(PRESETS.defense).forEach(p => {
      html += `<option value="preset:${p.id}">${p.name}</option>`;
    });
    html += `</optgroup>`;

    if (customDef.length > 0) {
      const categories = Array.from(new Set(customDef.map(c => c.category)));
      categories.forEach(cat => {
        html += `<optgroup label="📁 ${cat}">`;
        customDef.filter(c => c.category === cat).forEach(c => {
          html += `<option value="custom:${c.id}">↳ ${c.variation} (カスタム)</option>`;
        });
        html += `</optgroup>`;
      });
    }

    defSel.innerHTML = html;
  }

  syncCustomFormationDeleteButtons();
}

function syncCustomFormationDeleteButtons() {
  const offSel = document.getElementById('offensePresetSelect');
  const defSel = document.getElementById('defensePresetSelect');
  const offDelBtn = document.getElementById('btnDeleteCustomOffFormation');
  const defDelBtn = document.getElementById('btnDeleteCustomDefFormation');

  if (offDelBtn && offSel) {
    offDelBtn.style.display = (offSel.value && offSel.value.startsWith('custom:')) ? 'inline' : 'none';
  }
  if (defDelBtn && defSel) {
    defDelBtn.style.display = (defSel.value && defSel.value.startsWith('custom:')) ? 'inline' : 'none';
  }
}

function loadOffensePreset(val) {
  if (!val) return;
  syncCustomFormationDeleteButtons();
  if (val.startsWith('custom:')) {
    loadCustomFormation(val.replace('custom:', ''));
    return;
  }
  const id = val.replace('preset:', '');
  if (!PRESETS.offense[id]) return;
  state.offensePlay = JSON.parse(JSON.stringify(PRESETS.offense[id]));
  state.selectedPlayer = null;
  state.shifts = [];
  state.motion = null;
  const rb = state.offensePlay.players.find(p => p.type === 'RB');
  if (rb) {
    state.ballCarrierId = rb.id;
    state.runSequence = [{ from: 'QB', to: rb.id, type: 'handoff', isOption: false }];
  }
  renderRunSequenceUI();
  renderPresnapUI();
  closePopover();
  resetPlay();
}

function loadDefensePreset(val) {
  if (!val) return;
  syncCustomFormationDeleteButtons();
  if (val.startsWith('custom:')) {
    loadCustomFormation(val.replace('custom:', ''));
    return;
  }
  const id = val.replace('preset:', '');
  if (!PRESETS.defense[id]) return;
  state.defensePlay = JSON.parse(JSON.stringify(PRESETS.defense[id]));
  state.selectedPlayer = null;
  closePopover();
  resetPlay();
}

/* ─── Systematic Playbook & Play Save Engine ─────────────────── */
const STORAGE_KEY_PLAYBOOK = 'football_play_designer_playbook_v1';

function getPlaybookData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAYBOOK);
    return raw ? JSON.parse(raw) : { offense: [], defense: [] };
  } catch (e) {
    return { offense: [], defense: [] };
  }
}

function savePlaybookData(data) {
  localStorage.setItem(STORAGE_KEY_PLAYBOOK, JSON.stringify(data));
}

/**
 * Deletes custom play from playbook with confirmation warning.
 */
function deletePlayFromPlaybook(side, id, playName) {
  const nameLabel = playName ? `「${playName}」` : '';
  const ok = confirm(`⚠️ 警告: プレー${nameLabel}をプレーブックから削除しますか？\n\n※この操作は取り消せません。保存されたプレーデータが削除されます。`);
  if (!ok) return;

  const playbook = getPlaybookData();
  if (playbook[side]) {
    playbook[side] = playbook[side].filter(p => p.id !== id);
    savePlaybookData(playbook);
    showToast(`🗑 プレー${nameLabel}を削除しました`);
    renderPlaybookBrowser();
  }
}

// ─── 1. Systematic Play Save Modal ──────────────────────────────
let saveModalState = {
  side: 'offense',
  selectedStyleCat: 'ラン'
};

function openSavePlayModal(side) {
  const currentSide = side || (state.mode === 'defense' ? 'defense' : 'offense');
  saveModalState.side = currentSide;

  const modal = document.getElementById('savePlayModal');
  if (!modal) return;

  const title = document.getElementById('savePlayModalTitle');
  if (title) {
    title.innerHTML = currentSide === 'offense' 
      ? '💾 <span>🔵 オフェンス</span> プレーをプレーブックに登録' 
      : '💾 <span>🔴 ディフェンス</span> プレーをプレーブックに登録';
  }

  // Current play name input default
  const nameInput = document.getElementById('saveModalPlayPlayNameInput') || document.getElementById('saveModalPlayNameInput');
  const globalName = document.getElementById('playNameInput');
  const currentPlay = currentSide === 'offense' ? state.offensePlay : state.defensePlay;
  if (nameInput) {
    nameInput.value = (globalName && globalName.value.trim()) || (currentPlay ? currentPlay.name : '');
  }

  // 1. Formation Category & Sub-variation Options
  const formCatSelect = document.getElementById('saveModalFormCatSelect');
  const formCatCustom = document.getElementById('saveModalFormCatCustom');
  if (formCatCustom) formCatCustom.style.display = 'none';

  if (formCatSelect) {
    formCatSelect.innerHTML = '';
    const taxFormations = PLAYBOOK_TAXONOMY[currentSide].formations;
    Object.keys(taxFormations).forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.text = cat;
      formCatSelect.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.text = '＋ 新規親カテゴリを入力...';
    formCatSelect.appendChild(customOpt);

    // Initial value
    if (currentPlay && currentPlay.formationCategory && taxFormations[currentPlay.formationCategory]) {
      formCatSelect.value = currentPlay.formationCategory;
    } else {
      formCatSelect.selectedIndex = 0;
    }
  }

  // Populate sub-variations dropdown based on parent category
  const initialParent = formCatSelect ? formCatSelect.value : 'General';
  const initialSub = (currentPlay && currentPlay.formationVariation) ? currentPlay.formationVariation : '';
  populateSaveModalSubVariations(initialParent, initialSub);

  // Auto-generate play name with formation prefix
  updateAutoPlayName(true);

  // 2. Play Style Categories (Run/Option/Pass or Zone/Man/Blitz)
  const stylesObj = PLAYBOOK_TAXONOMY[currentSide].styles;
  const styleCatKeys = Object.keys(stylesObj);
  
  // Choose default style category
  let defaultStyleCat = styleCatKeys[0];
  if (currentSide === 'offense') {
    if (state.playType === 'run') {
      const isOption = state.runSequence && state.runSequence.some(s => s.isOption);
      defaultStyleCat = isOption ? 'オプション' : 'ラン';
    } else {
      defaultStyleCat = 'パス';
    }
  } else {
    // Defense default based on coverage
    const hasRush = currentPlay && currentPlay.players && currentPlay.players.filter(p => p.coverage === 'rush').length >= 5;
    const hasMan = currentPlay && currentPlay.players && currentPlay.players.some(p => p.coverage === 'man');
    defaultStyleCat = hasRush ? 'Blitz' : (hasMan ? 'Man' : 'Zone');
  }
  saveModalState.selectedStyleCat = defaultStyleCat;

  renderSaveModalStyleCats();

  // 3. Personnel Detection Display
  const personnelDisplay = document.getElementById('saveModalPersonnelDisplay');
  if (personnelDisplay && currentPlay) {
    const pInfo = detectPersonnel(currentSide, currentPlay.players);
    personnelDisplay.innerHTML = `
      <div style="color:#38bdf8; font-weight:700;">${pInfo.label}</div>
      <div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">※フィールド配置から自動検出されました</div>
    `;
  }

  modal.style.display = 'flex';
}

function closeSavePlayModal() {
  const modal = document.getElementById('savePlayModal');
  if (modal) modal.style.display = 'none';
}

function populateSaveModalSubVariations(parentCat, selectedSub) {
  const varSelect = document.getElementById('saveModalFormVarSelect');
  const varCustom = document.getElementById('saveModalFormVarCustom');
  if (!varSelect) return;

  varSelect.innerHTML = '';
  const currentSide = saveModalState.side;
  const taxFormations = PLAYBOOK_TAXONOMY[currentSide].formations;
  const subs = taxFormations[parentCat] || ['Standard', 'Pro', 'Spread', 'Heavy'];

  let matched = false;
  subs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.text = s;
    if (selectedSub && s.toLowerCase() === selectedSub.toLowerCase()) {
      opt.selected = true;
      matched = true;
    }
    varSelect.appendChild(opt);
  });

  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.text = '＋ 新規サブ隊形を入力 (自由記述)...';
  varSelect.appendChild(customOpt);

  if (selectedSub && !matched) {
    customOpt.selected = true;
    if (varCustom) {
      varCustom.style.display = 'block';
      varCustom.value = selectedSub;
    }
  } else {
    if (varCustom) {
      varCustom.style.display = 'none';
      varCustom.value = '';
    }
  }
}

function onSaveModalFormCatChange(val) {
  const customInput = document.getElementById('saveModalFormCatCustom');
  if (customInput) {
    customInput.style.display = val === '__custom__' ? 'block' : 'none';
    if (val === '__custom__') customInput.focus();
  }
  populateSaveModalSubVariations(val);
  updateAutoPlayName();
}

function onSaveModalFormVarChange(val) {
  const customInput = document.getElementById('saveModalFormVarCustom');
  if (customInput) {
    customInput.style.display = val === '__custom__' ? 'block' : 'none';
    if (val === '__custom__') customInput.focus();
  }
  updateAutoPlayName();
}

function onCustomVariationInput(val) {
  updateAutoPlayName();
}

/**
 * Automatically prepends the formation prefix (e.g. "I-Formation Pro Set - ") to the play name.
 */
function updateAutoPlayName(isInitial = false) {
  const nameInput = document.getElementById('saveModalPlayNameInput');
  if (!nameInput) return;

  const catSelect = document.getElementById('saveModalFormCatSelect');
  const catCustom = document.getElementById('saveModalFormCatCustom');
  let formCat = catSelect ? catSelect.value : '';
  if (formCat === '__custom__' && catCustom) {
    formCat = catCustom.value.trim() || 'Custom';
  }

  const varSelect = document.getElementById('saveModalFormVarSelect');
  const varCustom = document.getElementById('saveModalFormVarCustom');
  let formVar = varSelect ? varSelect.value : '';
  if (formVar === '__custom__' && varCustom) {
    formVar = varCustom.value.trim();
  }

  const prefix = formVar ? `${formCat} ${formVar} - ` : `${formCat} - `;
  const currentVal = nameInput.value.trim();

  if (isInitial) {
    // If opening modal, extract any specific concept name or keep clean
    if (!currentVal) {
      nameInput.value = prefix;
    } else {
      // If currentVal already has a " - ", keep the suffix after "-"
      if (currentVal.includes(' - ')) {
        const parts = currentVal.split(' - ');
        const specificName = parts.slice(1).join(' - ').trim();
        nameInput.value = `${prefix}${specificName}`;
      } else {
        nameInput.value = `${prefix}${currentVal}`;
      }
    }
  } else {
    // Update prefix while preserving user's typed concept name
    let userSpecific = '';
    if (currentVal.includes(' - ')) {
      const parts = currentVal.split(' - ');
      userSpecific = parts.slice(1).join(' - ').trim();
    } else {
      // If user typed without dash, remove old formation words if present
      userSpecific = currentVal;
    }
    nameInput.value = userSpecific ? `${prefix}${userSpecific}` : prefix;
  }
}

function renderSaveModalStyleCats() {
  const container = document.getElementById('saveModalStyleCatContainer');
  const subSelect = document.getElementById('saveModalStyleSubSelect');
  if (!container || !subSelect) return;

  const currentSide = saveModalState.side;
  const stylesObj = PLAYBOOK_TAXONOMY[currentSide].styles;
  const styleCatKeys = Object.keys(stylesObj);

  container.innerHTML = '';
  styleCatKeys.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pb-axis-btn ${saveModalState.selectedStyleCat === cat ? 'active' : ''}`;
    btn.style.padding = '6px 12px';
    btn.style.fontSize = '0.75rem';
    btn.innerText = cat;
    btn.onclick = () => {
      saveModalState.selectedStyleCat = cat;
      renderSaveModalStyleCats();
    };
    container.appendChild(btn);
  });

  // Populate sub styles
  subSelect.innerHTML = '';
  const subs = stylesObj[saveModalState.selectedStyleCat] || [];
  subs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.text = s;
    subSelect.appendChild(opt);
  });
}

function confirmSavePlay() {
  const side = saveModalState.side;
  const nameInput = document.getElementById('saveModalPlayNameInput');
  const playName = nameInput ? nameInput.value.trim() : '';

  if (!playName) {
    showToast('⚠️ プレー名を入力してください');
    if (nameInput) nameInput.focus();
    return;
  }

  // Formation
  const catSelect = document.getElementById('saveModalFormCatSelect');
  const catCustom = document.getElementById('saveModalFormCatCustom');
  let formCat = catSelect ? catSelect.value : 'General';
  if (formCat === '__custom__' && catCustom) {
    formCat = catCustom.value.trim() || 'Custom Formation';
  }

  const varSelect = document.getElementById('saveModalFormVarSelect');
  const varCustom = document.getElementById('saveModalFormVarCustom');
  let formVar = varSelect ? varSelect.value : 'Standard';
  if (formVar === '__custom__' && varCustom) {
    formVar = varCustom.value.trim() || 'Custom Variation';
  }

  // Play Style
  const styleCat = saveModalState.selectedStyleCat;
  const subSelect = document.getElementById('saveModalStyleSubSelect');
  const styleSub = (subSelect && subSelect.value) || '';

  // Memo
  const descInput = document.getElementById('saveModalDescInput');
  const desc = (descInput && descInput.value.trim()) || '';

  // Current play data snapshot
  const baseObj = side === 'offense' ? state.offensePlay : state.defensePlay;
  const playToSave = JSON.parse(JSON.stringify(baseObj));

  playToSave.id = `${side.slice(0,3)}_${Date.now()}`;
  playToSave.name = playName;
  playToSave.formationCategory = formCat;
  playToSave.formationVariation = formVar;
  playToSave.playStyleCategory = styleCat;
  playToSave.playStyleSub = styleSub;
  playToSave.description = desc;
  playToSave.side = side;
  playToSave.savedAt = new Date().toISOString();

  // Attach Offense play-specific properties
  if (side === 'offense') {
    playToSave.playType = state.playType;
    playToSave.throwTime = state.throwTime;
    playToSave.passTargetPos = state.passTargetPos;
    playToSave.catchReceiverId = state.catchReceiverId;
    playToSave.runSequence = state.runSequence;
    playToSave.runOptionDecisions = state.runOptionDecisions;
    playToSave.runExchangeTimes = state.runExchangeTimes;
    playToSave.shifts = state.shifts || [];
    playToSave.motion = state.motion || null;
  }

  // Personnel
  const pInfo = detectPersonnel(side, playToSave.players);
  playToSave.personnel = pInfo;

  // Save to Playbook localStorage
  const playbook = getPlaybookData();
  playbook[side].unshift(playToSave);
  localStorage.setItem(STORAGE_KEY_PLAYBOOK, JSON.stringify(playbook));

  // Sync Global Header Name
  const gName = document.getElementById('playNameInput');
  if (gName) gName.value = playName;

  closeSavePlayModal();
  showToast(`✅ [${formCat} / ${styleCat}] 「${playName}」をプレーブックに登録しました！`);
}

function saveCurrentPlay(type) {
  openSavePlayModal(type);
}


// ─── 2. Systematic Playbook Browser Modal ────────────────────────
let pbBrowserState = {
  side: 'offense',
  axis: 'formation', // 'formation' | 'style' | 'personnel'
  level: 1, // 1: Parent categories, 2: Sub categories, 3: Plays
  selectedCat: null,
  selectedSub: null
};

function openPlaybookBrowser(initialSide) {
  pbBrowserState.side = initialSide || (state.mode === 'defense' ? 'defense' : 'offense');
  pbBrowserState.level = 1;
  pbBrowserState.selectedCat = null;
  pbBrowserState.selectedSub = null;

  const modal = document.getElementById('playbookBrowserModal');
  if (!modal) return;

  updatePlaybookBrowserSideUI();
  updatePlaybookBrowserAxisUI();
  renderPlaybookBrowser();

  modal.style.display = 'flex';
}

function closePlaybookBrowser() {
  const modal = document.getElementById('playbookBrowserModal');
  if (modal) modal.style.display = 'none';
}

function switchPlaybookBrowserSide(side) {
  pbBrowserState.side = side;
  pbBrowserState.level = 1;
  pbBrowserState.selectedCat = null;
  pbBrowserState.selectedSub = null;
  updatePlaybookBrowserSideUI();
  renderPlaybookBrowser();
}

function updatePlaybookBrowserSideUI() {
  const offBtn = document.getElementById('pbSideOffenseBtn');
  const defBtn = document.getElementById('pbSideDefenseBtn');
  if (offBtn && defBtn) {
    offBtn.className = `pb-side-btn ${pbBrowserState.side === 'offense' ? 'active' : ''}`;
    defBtn.className = `pb-side-btn ${pbBrowserState.side === 'defense' ? 'active def' : ''}`;
  }
}

function switchPlaybookAxis(axis) {
  pbBrowserState.axis = axis;
  pbBrowserState.level = 1;
  pbBrowserState.selectedCat = null;
  pbBrowserState.selectedSub = null;
  updatePlaybookBrowserAxisUI();
  renderPlaybookBrowser();
}

function updatePlaybookBrowserAxisUI() {
  const formBtn = document.getElementById('pbAxisFormationBtn');
  const styleBtn = document.getElementById('pbAxisStyleBtn');
  const persBtn = document.getElementById('pbAxisPersonnelBtn');
  if (formBtn) formBtn.className = `pb-axis-btn ${pbBrowserState.axis === 'formation' ? 'active' : ''}`;
  if (styleBtn) styleBtn.className = `pb-axis-btn ${pbBrowserState.axis === 'style' ? 'active' : ''}`;
  if (persBtn) persBtn.className = `pb-axis-btn ${pbBrowserState.axis === 'personnel' ? 'active' : ''}`;
}

/**
 * Returns all plays for the active side (Built-in presets + custom saved plays).
 */
function getAllPlaysForSide(side) {
  const plays = [];
  
  // 1. Built-in presets
  const presets = PRESETS[side] || {};
  Object.values(presets).forEach(p => {
    const enriched = { ...p, isPreset: true, side };
    if (!enriched.personnel) {
      enriched.personnel = detectPersonnel(side, enriched.players);
    }
    plays.push(enriched);
  });

  // 2. Custom plays in localStorage
  const playbook = getPlaybookData();
  const customList = playbook[side] || [];
  customList.forEach(p => {
    const enriched = { ...p, isPreset: false, side };
    if (!enriched.personnel) {
      enriched.personnel = detectPersonnel(side, enriched.players);
    }
    plays.push(enriched);
  });

  return plays;
}

function renderPlaybookBrowser() {
  const container = document.getElementById('playbookBrowserBody');
  const breadcrumbs = document.getElementById('pbBreadcrumbs');
  if (!container || !breadcrumbs) return;

  const side = pbBrowserState.side;
  const axis = pbBrowserState.axis;
  const level = pbBrowserState.level;
  const plays = getAllPlaysForSide(side);

  // Render Breadcrumbs
  renderBreadcrumbs(breadcrumbs);

  container.innerHTML = '';

  // ════════ AXIS 1: FORMATIONS ════════
  if (axis === 'formation') {
    const customForms = getCustomFormations(side);

    if (level === 1) {
      // Level 1: Parent Formation Categories (I-Formation, Shotgun, Singleback, etc.)
      const catCounts = {};
      const taxFormations = PLAYBOOK_TAXONOMY[side].formations;
      Object.keys(taxFormations).forEach(cat => { catCounts[cat] = 0; });
      customForms.forEach(cf => { if (!catCounts[cf.category]) catCounts[cf.category] = 0; });

      plays.forEach(p => {
        const cat = p.formationCategory || 'General';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });

      const grid = document.createElement('div');
      grid.className = 'pb-category-grid';

      const defaultCats = side === 'offense'
        ? ['Shotgun', 'I-Formation', 'Singleback', 'Pistol', 'Spread', 'Wishbone', 'Goal Line']
        : ['4-3 Base', '3-4 Base', 'Nickel (3-3-5)', 'Dime (4-1-6)', 'Goal Line'];

      Object.entries(catCounts).forEach(([cat, count]) => {
        const subList = taxFormations[cat] || customForms.filter(cf => cf.category === cat).map(cf => cf.variation);
        const isCustomCat = !defaultCats.includes(cat) && customForms.some(cf => cf.category === cat);
        const card = document.createElement('div');
        card.className = 'pb-cat-card';
        card.innerHTML = `
          <div>
            ${generatePlayThumbnailSvg(plays.find(p => (p.formationCategory || 'General') === cat), side, { routes: false })}
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div class="pb-cat-title">📐 ${cat}</div>
              ${isCustomCat ? `
                <button class="pb-del-btn" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); color:#f87171; font-size:0.68rem; padding:2px 6px; border-radius:4px; cursor:pointer;" onclick="event.stopPropagation(); deleteCustomFormation('${side}', null, '${cat}', null)">
                  🗑 削除
                </button>
              ` : ''}
            </div>
            <div class="pb-cat-sub">${subList.length > 0 ? subList.slice(0, 3).join(', ') + (subList.length > 3 ? '...' : '') : 'バリエーション隊形'}</div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <span style="font-size:0.75rem; color:#38bdf8; font-weight:700;">${count} プレー登録</span>
            <span style="font-size:0.9rem; color:var(--text-muted);">❯</span>
          </div>
        `;
        card.onclick = () => {
          pbBrowserState.selectedCat = cat;
          pbBrowserState.level = 2;
          renderPlaybookBrowser();
        };
        grid.appendChild(card);
      });

      container.appendChild(grid);

    } else if (level === 2) {
      // Level 2: Sub-Formations (Pro Set, Offset I, Spread 2x2, Trips, etc.)
      const parentCat = pbBrowserState.selectedCat;
      const filteredPlays = plays.filter(p => (p.formationCategory || 'General') === parentCat);
      const taxSubs = (PLAYBOOK_TAXONOMY[side].formations[parentCat] || []);
      const customSubs = customForms.filter(cf => cf.category === parentCat).map(cf => cf.variation);
      const allSubs = Array.from(new Set([...taxSubs, ...customSubs]));

      const subCounts = {};
      allSubs.forEach(s => { subCounts[s] = 0; });
      filteredPlays.forEach(p => {
        const sub = p.formationVariation || 'Standard';
        subCounts[sub] = (subCounts[sub] || 0) + 1;
      });

      const grid = document.createElement('div');
      grid.className = 'pb-category-grid';

      Object.entries(subCounts).forEach(([sub, count]) => {
        const matchedCustom = customForms.find(cf => cf.category === parentCat && cf.variation === sub);
        const card = document.createElement('div');
        card.className = 'pb-cat-card';
        card.innerHTML = `
          <div>
            ${generatePlayThumbnailSvg(filteredPlays.find(p => (p.formationVariation || 'Standard') === sub), side, { routes: false })}
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div class="pb-cat-title">${sub}</div>
              ${matchedCustom ? `
                <button class="pb-del-btn" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); color:#f87171; font-size:0.68rem; padding:2px 6px; border-radius:4px; cursor:pointer;" onclick="event.stopPropagation(); deleteCustomFormation('${side}', '${matchedCustom.id}', '${parentCat}', '${sub}')" title="このフォーメーションを削除">
                  🗑 削除
                </button>
              ` : ''}
            </div>
            <div class="pb-cat-sub">${parentCat} の詳細アライメント</div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <span style="font-size:0.75rem; color:#22c55e; font-weight:700;">${count} プレー</span>
            <span style="font-size:0.9rem; color:var(--text-muted);">❯</span>
          </div>
        `;
        card.onclick = () => {
          pbBrowserState.selectedSub = sub;
          pbBrowserState.level = 3;
          renderPlaybookBrowser();
        };
        grid.appendChild(card);
      });

      // Also option to view "All plays in this formation"
      const allCard = document.createElement('div');
      allCard.className = 'pb-cat-card';
      allCard.style.borderColor = '#38bdf8';
      allCard.innerHTML = `
        <div>
          <div class="pb-cat-title" style="color:#38bdf8;">📂 すべてのプレーを表示</div>
          <div class="pb-cat-sub">${parentCat} 内の全プレーを一括表示</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <span style="font-size:0.75rem; color:#38bdf8; font-weight:700;">合計 ${filteredPlays.length} 件</span>
          <span style="font-size:0.9rem; color:#38bdf8;">❯</span>
        </div>
      `;
      allCard.onclick = () => {
        pbBrowserState.selectedSub = null;
        pbBrowserState.level = 3;
        renderPlaybookBrowser();
      };
      grid.appendChild(allCard);

      container.appendChild(grid);

    } else if (level === 3) {
      // Level 3: Plays list inside this formation
      const parentCat = pbBrowserState.selectedCat;
      const sub = pbBrowserState.selectedSub;
      const matchingPlays = plays.filter(p => {
        const matchCat = (p.formationCategory || 'General') === parentCat;
        if (!sub) return matchCat;
        return matchCat && ((p.formationVariation || 'Standard') === sub);
      });

      const matchedCustom = customForms.find(cf => cf.category === parentCat && (!sub || cf.variation === sub));
      const subList = (PLAYBOOK_TAXONOMY[side].formations[parentCat] || customForms.filter(cf => cf.category === parentCat).map(cf => cf.variation));

      // Formation system banner (体系表示・説明のところ)
      const banner = document.createElement('div');
      banner.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:10px 14px; margin-bottom:12px;';
      banner.innerHTML = `
        <div style="display:flex; gap:14px; align-items:center;">
          <div style="width:180px; flex-shrink:0;">${generatePlayThumbnailSvg(matchingPlays[0], side, { routes: false, height: 100 })}</div>
          <div>
            <div style="font-size:0.95rem; font-weight:800; color:#f8fafc;">📐 ${parentCat}${sub ? ' › ' + sub : ''}</div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">体系: ${parentCat} → ${subList.map(s => s === sub ? '<b style=\'color:#38bdf8\'>' + s + '</b>' : s).join(' / ')}</div>
            <div style="font-size:0.72rem; color:#22c55e; margin-top:4px;">${matchingPlays.length} プレー登録</div>
          </div>
        </div>
        ${matchedCustom ? `
          <button class="btn-secondary" style="color:#f87171; border-color:rgba(239,68,68,0.4); font-size:0.75rem; padding:6px 12px; white-space:nowrap; display:flex; align-items:center; gap:4px;" onclick="deleteCustomFormation('${side}', '${matchedCustom.id}', '${parentCat}', '${sub || matchedCustom.variation}')">
            <span>🗑</span> このフォーメーションを削除
          </button>
        ` : ''}
      `;
      container.appendChild(banner);

      renderPlaysGrid(container, matchingPlays);
    }

  // ════════ AXIS 2: PLAY STYLES ════════
  } else if (axis === 'style') {
    if (level === 1) {
      // Level 1: Major Style Category (Run / Option / Pass or Zone / Man / Blitz)
      const taxStyles = PLAYBOOK_TAXONOMY[side].styles;
      const catCounts = {};
      Object.keys(taxStyles).forEach(cat => { catCounts[cat] = 0; });

      plays.forEach(p => {
        const cat = p.playStyleCategory || (side === 'offense' ? (p.playType === 'run' ? 'ラン' : 'パス') : 'Zone');
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });

      const grid = document.createElement('div');
      grid.className = 'pb-category-grid';

      const icons = {
        'ラン': '🏃', 'オプション': '🔀', 'パス': '🏈',
        'Zone': '🛡️', 'Man': '👤', 'Blitz': '⚡'
      };

      Object.entries(catCounts).forEach(([cat, count]) => {
        const subs = taxStyles[cat] || [];
        const card = document.createElement('div');
        card.className = 'pb-cat-card';
        card.innerHTML = `
          <div>
            <div class="pb-cat-title">${icons[cat] || '⚡'} ${cat}</div>
            <div class="pb-cat-sub">${subs.slice(0, 3).join(', ')}${subs.length > 3 ? '...' : ''}</div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">${count} プレー登録</span>
            <span style="font-size:0.9rem; color:var(--text-muted);">❯</span>
          </div>
        `;
        card.onclick = () => {
          pbBrowserState.selectedCat = cat;
          pbBrowserState.level = 2;
          renderPlaybookBrowser();
        };
        grid.appendChild(card);
      });

      container.appendChild(grid);

    } else if (level === 2) {
      // Level 2: Sub-Styles (Inside, Outside, Toss, QB Run / Cover 2, Cover 3, etc.)
      const cat = pbBrowserState.selectedCat;
      const taxSubs = PLAYBOOK_TAXONOMY[side].styles[cat] || [];
      const subCounts = {};
      taxSubs.forEach(s => { subCounts[s] = 0; });

      const filteredPlays = plays.filter(p => {
        const pCat = p.playStyleCategory || (side === 'offense' ? (p.playType === 'run' ? 'ラン' : 'パス') : 'Zone');
        return pCat === cat;
      });

      filteredPlays.forEach(p => {
        const s = p.playStyleSub || '標準';
        subCounts[s] = (subCounts[s] || 0) + 1;
      });

      const grid = document.createElement('div');
      grid.className = 'pb-category-grid';

      Object.entries(subCounts).forEach(([sub, count]) => {
        const card = document.createElement('div');
        card.className = 'pb-cat-card';
        card.innerHTML = `
          <div>
            <div class="pb-cat-title">${sub}</div>
            <div class="pb-cat-sub">${cat} のタクティクス</div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <span style="font-size:0.75rem; color:#22c55e; font-weight:700;">${count} プレー</span>
            <span style="font-size:0.9rem; color:var(--text-muted);">❯</span>
          </div>
        `;
        card.onclick = () => {
          pbBrowserState.selectedSub = sub;
          pbBrowserState.level = 3;
          renderPlaybookBrowser();
        };
        grid.appendChild(card);
      });

      // View All
      const allCard = document.createElement('div');
      allCard.className = 'pb-cat-card';
      allCard.style.borderColor = '#f59e0b';
      allCard.innerHTML = `
        <div>
          <div class="pb-cat-title" style="color:#f59e0b;">📂 すべてのプレーを表示</div>
          <div class="pb-cat-sub">${cat} の全登録プレーを表示</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">合計 ${filteredPlays.length} 件</span>
          <span style="font-size:0.9rem; color:#f59e0b;">❯</span>
        </div>
      `;
      allCard.onclick = () => {
        pbBrowserState.selectedSub = null;
        pbBrowserState.level = 3;
        renderPlaybookBrowser();
      };
      grid.appendChild(allCard);

      container.appendChild(grid);

    } else if (level === 3) {
      // Level 3: Plays list inside this style
      const cat = pbBrowserState.selectedCat;
      const sub = pbBrowserState.selectedSub;

      const matchingPlays = plays.filter(p => {
        const pCat = p.playStyleCategory || (side === 'offense' ? (p.playType === 'run' ? 'ラン' : 'パス') : 'Zone');
        if (pCat !== cat) return false;
        if (!sub) return true;
        return (p.playStyleSub || '標準') === sub;
      });

      renderPlaysGrid(container, matchingPlays);
    }

  // ════════ AXIS 3: PERSONNEL ════════
  } else if (axis === 'personnel') {
    if (level === 1) {
      // Level 1: Personnel Groupings (e.g. 21 Personnel, 11 Personnel, 4-3-4, 3-4-4, etc.)
      const taxLabels = PLAYBOOK_TAXONOMY[side].personnelLabels;
      const persCounts = {};
      Object.keys(taxLabels).forEach(k => { persCounts[k] = 0; });

      plays.forEach(p => {
        const pInfo = p.personnel || detectPersonnel(side, p.players);
        const code = pInfo.code;
        persCounts[code] = (persCounts[code] || 0) + 1;
      });

      const grid = document.createElement('div');
      grid.className = 'pb-category-grid';

      Object.entries(persCounts).forEach(([code, count]) => {
        const label = taxLabels[code] || `${code} (${side === 'offense' ? 'スキル選手構成' : '守備人数構成'})`;
        const card = document.createElement('div');
        card.className = 'pb-cat-card';
        card.innerHTML = `
          <div>
            <div class="pb-cat-title" style="color:#34d399;">👥 ${code}</div>
            <div class="pb-cat-sub">${label}</div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <span style="font-size:0.75rem; color:#34d399; font-weight:700;">${count} プレー登録</span>
            <span style="font-size:0.9rem; color:var(--text-muted);">❯</span>
          </div>
        `;
        card.onclick = () => {
          pbBrowserState.selectedCat = code;
          pbBrowserState.level = 2;
          renderPlaybookBrowser();
        };
        grid.appendChild(card);
      });

      container.appendChild(grid);

    } else if (level === 2) {
      // Level 2: Plays matching this personnel
      const code = pbBrowserState.selectedCat;
      const matchingPlays = plays.filter(p => {
        const pInfo = p.personnel || detectPersonnel(side, p.players);
        return pInfo.code === code;
      });

      renderPlaysGrid(container, matchingPlays);
    }
  }
}

function renderBreadcrumbs(container) {
  const side = pbBrowserState.side;
  const axis = pbBrowserState.axis;
  const level = pbBrowserState.level;

  const sideLabel = side === 'offense' ? '🔵 オフェンス' : '🔴 ディフェンス';
  const axisLabels = { formation: '📐 フォーメーション', style: '⚡ プレースタイル', personnel: '👥 パーソネル' };

  const items = [];
  items.push({ text: sideLabel, action: () => { pbBrowserState.level = 1; renderPlaybookBrowser(); } });
  items.push({ text: axisLabels[axis], action: () => { pbBrowserState.level = 1; renderPlaybookBrowser(); } });

  if (level >= 2 && pbBrowserState.selectedCat) {
    items.push({ text: pbBrowserState.selectedCat, action: () => { pbBrowserState.level = 2; renderPlaybookBrowser(); } });
  }
  if (level >= 3 && pbBrowserState.selectedSub) {
    items.push({ text: pbBrowserState.selectedSub, action: null });
  }

  container.innerHTML = '';
  items.forEach((item, idx) => {
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.innerText = '❯';
      sep.style.color = '#475569';
      container.appendChild(sep);
    }
    const el = document.createElement('span');
    if (idx === items.length - 1 || !item.action) {
      el.className = 'pb-crumb-current';
      el.innerText = item.text;
    } else {
      el.className = 'pb-crumb-item';
      el.innerText = item.text;
      el.onclick = item.action;
    }
    container.appendChild(el);
  });
}

function renderPlaysGrid(container, plays) {
  if (plays.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.style.cssText = 'text-align:center; padding:40px 20px; color:var(--text-muted);';
    emptyEl.innerHTML = `
      <div style="font-size:2rem; margin-bottom:8px;">📭</div>
      <div style="font-size:0.88rem; font-weight:700;">該当するプレーがまだ登録されていません</div>
      <div style="font-size:0.75rem; margin-top:4px;">フィールドでプレーを作成し、「💾 プレー保存」から登録してください</div>
    `;
    container.appendChild(emptyEl);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'pb-plays-grid';

  plays.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pb-play-card';

    const pInfo = p.personnel || detectPersonnel(p.side, p.players);
    const formLabel = `${p.formationCategory || 'General'} · ${p.formationVariation || 'Standard'}`;
    const styleLabel = `${p.playStyleCategory || ''} ${p.playStyleSub ? '· ' + p.playStyleSub : ''}`;

    const safeName = (p.name || '').replace(/'/g, "\\'");
    card.innerHTML = `
      <div class="pb-play-card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="pb-play-title">${p.name}</div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="pb-play-badge" style="${p.isPreset ? 'background:#1e293b; color:#94a3b8;' : 'background:#1e3a8a; color:#93c5fd;'}">
            ${p.isPreset ? 'プリセット' : 'カスタム'}
          </span>
          ${!p.isPreset ? `
            <button style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); color:#f87171; border-radius:4px; padding:2px 6px; font-size:0.7rem; cursor:pointer;" onclick="deletePlayFromPlaybook('${p.side}', '${p.id}', '${safeName}')" title="このプレーを削除">
              🗑
            </button>
          ` : ''}
        </div>
      </div>
      ${generatePlayThumbnailSvg(p, p.side, { routes: true })}
      <div class="pb-play-desc">${p.description || 'フォーメーションと動き'}</div>
      
      <div class="pb-play-meta">
        <span class="pb-meta-pill" style="color:#93c5fd; border-color:#1e40af;">📐 ${formLabel}</span>
        <span class="pb-meta-pill" style="color:#fcd34d; border-color:#854d0e;">⚡ ${styleLabel}</span>
        <span class="pb-meta-pill" style="color:#86efac; border-color:#166534;">👥 ${pInfo.code}</span>
      </div>

      <div style="margin-top:8px; display:flex; gap:6px;">
        <button class="btn-primary" style="flex:1; padding:6px 12px; font-size:0.75rem;" onclick="loadPlayIntoDesigner(${JSON.stringify(p).replace(/"/g, '&quot;')})">
          ▶ このプレーをロード
        </button>
        ${!p.isPreset ? `
          <button class="btn-secondary" style="padding:6px 10px; font-size:0.75rem; color:#f87171; border-color:rgba(239,68,68,0.4); white-space:nowrap; display:flex; align-items:center; gap:3px;" onclick="deletePlayFromPlaybook('${p.side}', '${p.id}', '${safeName}')">
            <span>🗑</span> 削除
          </button>
        ` : ''}
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

/**
 * Mini field diagram: formation alignment, routes (offense) or coverage shells (defense).
 */
function generatePlayThumbnailSvg(play, side, opts = {}) {
  const h = opts.height || 90;
  const wrap = (inner) => `<div style="width:100%; height:${h}px; background:#14532d; border-radius:6px; overflow:hidden; margin-bottom:6px; border:1px solid #166534;"><svg viewBox="0 12 100 80" preserveAspectRatio="xMidYMid meet" style="width:100%; height:100%; display:block;">${inner}</svg></div>`;
  let s = '';
  for (let y = 15; y <= 90; y += 10) s += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-width="0.4"/>`;
  s += `<line x1="0" y1="64" x2="100" y2="64" stroke="#38bdf8" stroke-width="0.6" stroke-dasharray="2,1.5"/>`;
  if (!play || !play.players) {
    return wrap(s + `<text x="50" y="52" text-anchor="middle" font-size="5" fill="rgba(255,255,255,0.5)">隊形データなし</text>`);
  }
  const isOff = side === 'offense' || play.players.some(p => p.type === 'QB');
  if (isOff) {
    if (opts.routes) {
      play.players.forEach(p => {
        if (!p.route || !p.route.length) return;
        const d = [{ x: p.x, y: p.y }, ...p.route].map((pt, i) => `${i ? 'L' : 'M'}${pt.x} ${pt.y}`).join(' ');
        const col = p.routeType === 'block' ? '#94a3b8' : (p.routeType === 'run' ? '#22c55e' : '#fbbf24');
        s += `<path d="${d}" stroke="${col}" stroke-width="0.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        const last = p.route[p.route.length - 1];
        s += `<circle cx="${last.x}" cy="${last.y}" r="0.9" fill="${col}"/>`;
      });
      if (play.playType === 'pass' && play.passTargetPos) {
        const qb = play.players.find(p => p.type === 'QB');
        if (qb) s += `<line x1="${qb.x}" y1="${qb.y}" x2="${play.passTargetPos.x}" y2="${play.passTargetPos.y}" stroke="#ffffff" stroke-width="0.5" stroke-dasharray="1.2,1"/>`;
      }
    }
    play.players.forEach(p => {
      if (p.type === 'OL') s += `<rect x="${p.x - 1.4}" y="${p.y - 1.4}" width="2.8" height="2.8" fill="#1d4ed8" stroke="#fff" stroke-width="0.3"/>`;
      else s += `<circle cx="${p.x}" cy="${p.y}" r="1.6" fill="${p.type === 'QB' ? '#f59e0b' : '#3b82f6'}" stroke="#fff" stroke-width="0.3"/>`;
    });
  } else {
    play.players.forEach(p => {
      if (p.coverage === 'zone' && p.zoneX != null) {
        const r = p.zoneRadius || 7;
        const deep = p.zoneY < 35;
        s += `<circle cx="${p.zoneX}" cy="${p.zoneY}" r="${r}" fill="${deep ? 'rgba(168,85,247,0.25)' : 'rgba(59,130,246,0.25)'}" stroke="${deep ? '#a855f7' : '#3b82f6'}" stroke-width="0.4"/>`;
        if (opts.routes) s += `<line x1="${p.x}" y1="${p.y}" x2="${p.zoneX}" y2="${p.zoneY}" stroke="#93c5fd" stroke-width="0.5" stroke-dasharray="1,1"/>`;
      } else if (p.coverage === 'rush' && opts.routes) {
        s += `<line x1="${p.x}" y1="${p.y}" x2="${p.rushX != null ? p.rushX : p.x + (50 - p.x) * 0.4}" y2="${p.rushY != null ? p.rushY : 72}" stroke="#f87171" stroke-width="0.7"/>`;
      } else if (p.coverage === 'man' && opts.routes) {
        s += `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${p.y + 5}" stroke="#f43f5e" stroke-width="0.6" stroke-dasharray="1,0.8"/><text x="${p.x}" y="${p.y - 2.5}" text-anchor="middle" font-size="2.6" fill="#fecaca">${p.target || 'M'}</text>`;
      }
    });
    play.players.forEach(p => {
      s += `<circle cx="${p.x}" cy="${p.y}" r="1.6" fill="${p.coverage === 'man' ? '#f43f5e' : (p.coverage === 'rush' ? '#dc2626' : '#ef4444')}" stroke="#fff" stroke-width="0.3"/>`;
    });
  }
  return wrap(s);
}

/**
 * Loads a play object seamlessly into the interactive designer field.
 */
function loadPlayIntoDesigner(play) {
  if (!play) return;
  const side = play.side || (play.players && play.players.some(p => p.type === 'OL' || p.type === 'QB') ? 'offense' : 'defense');

  if (side === 'offense') {
    state.offensePlay = JSON.parse(JSON.stringify(play));
    state.playType = play.playType || 'pass';
    const throwSec = play.throwTimingSec || (play.throwTime > 1.0 ? play.throwTime : (play.throwTime ? play.throwTime * state.anim.duration : 2.0));
    setThrowTiming(throwSec);
    state.passTargetPos = play.passTargetPos || { x: 50, y: 35 };
    state.catchReceiverId = play.catchReceiverId || null;
    state.runSequence = play.runSequence ? JSON.parse(JSON.stringify(play.runSequence)) : [];
    state.runOptionDecisions = play.runOptionDecisions ? JSON.parse(JSON.stringify(play.runOptionDecisions)) : [];
    state.runExchangeTimes = play.runExchangeTimes ? JSON.parse(JSON.stringify(play.runExchangeTimes)) : [0.25];
    state.shifts = play.shifts ? JSON.parse(JSON.stringify(play.shifts)) : [];
    state.motion = play.motion ? JSON.parse(JSON.stringify(play.motion)) : null;

    // Sync play type UI toggles
    const passBtn = document.getElementById('btnTypePass');
    const runBtn = document.getElementById('btnTypeRun');
    const passOpt = document.getElementById('passOptionsContainer');
    const runOpt = document.getElementById('runOptionsContainer');
    if (passBtn && runBtn) {
      if (state.playType === 'run') {
        runBtn.className = 'play-type-btn active run';
        passBtn.className = 'play-type-btn';
        if (passOpt) passOpt.style.display = 'none';
        if (runOpt) runOpt.style.display = 'block';
        if (typeof renderRunSequenceUI === 'function') renderRunSequenceUI();
      } else {
        passBtn.className = 'play-type-btn active pass';
        runBtn.className = 'play-type-btn';
        if (passOpt) passOpt.style.display = 'block';
        if (runOpt) runOpt.style.display = 'none';
      }
    }
    syncAiToggles();
  } else {
    state.defensePlay = JSON.parse(JSON.stringify(play));
  }

  // Sync Global Header Name
  const gName = document.getElementById('playNameInput');
  if (gName) gName.value = play.name || '';

  // Mode & Rendering Reset
  state.selectedPlayer = null;
  closePopover();
  closePlaybookBrowser();
  resetPlay();
  renderAll();

  showToast(`🏈 プレー「${play.name}」をロードしました！`);
}

function showToast(msg) {
  let toast = document.getElementById('playDesignerToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'playDesignerToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '75px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(15, 23, 42, 0.95)';
    toast.style.color = '#38bdf8';
    toast.style.border = '1px solid #38bdf8';
    toast.style.padding = '8px 18px';
    toast.style.borderRadius = '20px';
    toast.style.fontSize = '0.82rem';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.6)';
    toast.style.transition = 'opacity 0.25s';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.style.opacity = '1';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 260);
  }, 2200);
}

