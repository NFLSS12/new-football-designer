/**
 * presets.js - American Football Formations, Plays & Systematic Playbook Taxonomy
 */

// ─── Playbook Taxonomy (オフェンス / ディフェンスの分類体系) ─────────
const PLAYBOOK_TAXONOMY = {
  offense: {
    // 1. フォーメーション階層 (親カテゴリ -> サブバリエーション)
    formations: {
      'I-Formation': ['Pro Set', 'Offset I', 'Tight I', 'Twin WR'],
      'Shotgun': ['Spread (2x2)', 'Trips Right (3x1)', 'Trips Left (3x1)', 'Bunch', 'Empty (0x5)'],
      'Singleback': ['Ace (2TE)', 'Spread', 'Bunch', 'Wing / Heavy'],
      'Pistol': ['Strong', 'Weak', 'Full House'],
      'Under Center Pro': ['Standard Pro', 'Twin TE']
    },
    // 2. プレースタイル階層 (大スタイル -> 小スタイル)
    styles: {
      'ラン': ['Inside Run', 'Outside / Sweep', 'Toss', 'QB Run', 'Counter / Misdirection', 'Draw'],
      'オプション': ['Read Option', 'Triple Option', 'Speed Option', 'RPO (Run-Pass Option)'],
      'パス': ['Quick Pass (Slant/Out)', 'Dropback / Intermediate', 'Deep Pass (Shot)', 'Screen Pass', 'Play Action']
    },
    // 3. パーソネル (RB-TE-WR)
    personnelLabels: {
      '21': '21 Personnel (2 RB, 1 TE, 2 WR)',
      '11': '11 Personnel (1 RB, 1 TE, 3 WR)',
      '12': '12 Personnel (1 RB, 2 TE, 2 WR)',
      '10': '10 Personnel (1 RB, 0 TE, 4 WR)',
      '22': '22 Personnel (2 RB, 2 TE, 1 WR)',
      '20': '20 Personnel (2 RB, 0 TE, 3 WR)',
      '01': '01 Personnel (0 RB, 1 TE, 4 WR)',
      '00': '00 Personnel (0 RB, 0 TE, 5 WR)'
    }
  },
  defense: {
    // 1. フォーメーション階層 (親カテゴリ -> サブバリエーション)
    formations: {
      '4-3 Base': ['Even', 'Over', 'Under', 'Wide 9'],
      '3-4 Base': ['Okie', 'Under', 'Over', 'Solid'],
      'Nickel': ['Nickel 4-2-5', 'Nickel 3-3-5', 'Nickel 2-4-5'],
      'Dime': ['Dime 4-1-6', 'Dime 3-2-6'],
      'Goal Line / Heavy': ['5-3-3', '6-2-3']
    },
    // 2. プレースタイル階層 (大スタイル -> 小スタイル)
    styles: {
      'Zone': ['Cover 2', 'Cover 3', 'Cover 4 (Quarters)', 'Cover 6', 'Tampa 2'],
      'Man': ['Cover 0 (Zero Man)', 'Cover 1 (Man Free)', '2-Man (Cover 2 Man Under)'],
      'Blitz': ['Zone Blitz (Fire Zone)', 'Man Blitz (Cover 0/1 Blitz)', 'Overload / Cross Dog', 'Corner / DB Blitz']
    },
    // 3. パーソネル (DL-LB-DB)
    personnelLabels: {
      '4-3-4': '4-3 Base (4 DL, 3 LB, 4 DB)',
      '3-4-4': '3-4 Base (3 DL, 4 LB, 4 DB)',
      '4-2-5': 'Nickel (4 DL, 2 LB, 5 DB)',
      '3-3-5': 'Nickel (3 DL, 3 LB, 5 DB)',
      '4-1-6': 'Dime (4 DL, 1 LB, 6 DB)',
      '3-2-6': 'Dime (3 DL, 2 LB, 6 DB)',
      '5-3-3': 'Heavy / Goal Line (5 DL, 3 LB, 3 DB)'
    }
  }
};

/**
 * Calculates current personnel breakdown from an array of players.
 */
function detectPersonnel(side, players) {
  if (!players || players.length === 0) {
    return { code: 'unknown', label: '未定義', details: '' };
  }
  if (side === 'offense') {
    let rb = 0, te = 0, wr = 0;
    players.forEach(p => {
      const type = (p.type || '').toUpperCase();
      if (type === 'RB' || type === 'FB') rb++;
      else if (type === 'TE') te++;
      else if (type === 'WR') wr++;
    });
    const code = `${rb}${te}`;
    const desc = `${rb} RB, ${te} TE, ${wr} WR`;
    const label = `${code} Personnel (${desc})`;
    return { code, label, details: desc, rb, te, wr };
  } else {
    let dl = 0, lb = 0, db = 0;
    players.forEach(p => {
      const type = (p.type || '').toUpperCase();
      if (type === 'DL') dl++;
      else if (type === 'LB') lb++;
      else if (type === 'DB') db++;
    });
    const code = `${dl}-${lb}-${db}`;
    const desc = `${dl} DL, ${lb} LB, ${db} DB`;
    const label = `${code} (${desc})`;
    return { code, label, details: desc, dl, lb, db };
  }
}

// ─── Play Presets Database ──────────────────────────────────────────
const PRESETS = {
  offense: {
    // ── Shotgun Spread Plays ──
    'shotgun_spread': {
      id: 'shotgun_spread',
      name: 'Shotgun Spread - Quick Slant / Out',
      formationCategory: 'Shotgun',
      formationVariation: 'Spread (2x2)',
      playStyleCategory: 'パス',
      playStyleSub: 'Quick Pass (Slant/Out)',
      playType: 'pass',
      throwTime: 1.8,
      passTargetPos: { x: 30, y: 44 },
      catchReceiverId: 'WR1',
      description: '左右に2人ずつWRを配置した2x2。WR1のクイックスラントを狙う高速パスプレー',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 42, y: 67 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 46, y: 67 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 67 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 54, y: 67 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 58, y: 67 }] },
        { id: 'QB', label: 'QB', x: 50, y: 76, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 79 }, { x: 50, y: 78 }] },
        { id: 'RB', label: 'RB', x: 44, y: 77, type: 'RB', routeType: 'pass', route: [{ x: 35, y: 74 }, { x: 22, y: 66 }, { x: 12, y: 62 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 14, y: 52 }, { x: 30, y: 44 }, { x: 48, y: 38 }] },
        { id: 'WR2', label: 'WR2', x: 26, y: 67, type: 'WR', routeType: 'pass', route: [{ x: 26, y: 55 }, { x: 18, y: 52 }, { x: 10, y: 50 }] },
        { id: 'WR3', label: 'WR3', x: 74, y: 67, type: 'WR', routeType: 'pass', route: [{ x: 74, y: 50 }, { x: 60, y: 44 }] },
        { id: 'WR4', label: 'WR4', x: 88, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 88, y: 45 }, { x: 88, y: 25 }, { x: 88, y: 10 }] }
      ]
    },
    'shotgun_inside_zone_read': {
      id: 'shotgun_inside_zone_read',
      name: 'Shotgun Spread - Zone Read Option',
      formationCategory: 'Shotgun',
      formationVariation: 'Spread (2x2)',
      playStyleCategory: 'オプション',
      playStyleSub: 'Read Option',
      playType: 'run',
      runSequence: [{ from: 'QB', to: 'RB', type: 'handoff', isOption: true }],
      runOptionDecisions: [false], // 50% keep chance in simulation
      runExchangeTimes: [0.28],
      description: 'DEの動きを読んでQBキープまたはRBダイブを選択する王道リードオプション',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 40, y: 60 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 45, y: 59 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 49, y: 59 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 55, y: 60 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 59, y: 60 }] },
        { id: 'QB', label: 'QB', x: 50, y: 76, type: 'QB', routeType: 'qb', route: [{ x: 48, y: 74 }, { x: 62, y: 65 }, { x: 65, y: 48 }] },
        { id: 'RB', label: 'RB', x: 44, y: 77, type: 'RB', routeType: 'run', route: [{ x: 49, y: 74 }, { x: 52, y: 62 }, { x: 52, y: 45 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'block', route: [{ x: 14, y: 56 }] },
        { id: 'WR2', label: 'WR2', x: 26, y: 67, type: 'WR', routeType: 'block', route: [{ x: 28, y: 56 }] },
        { id: 'WR3', label: 'WR3', x: 74, y: 67, type: 'WR', routeType: 'block', route: [{ x: 72, y: 56 }] },
        { id: 'WR4', label: 'WR4', x: 88, y: 66, type: 'WR', routeType: 'block', route: [{ x: 86, y: 56 }] }
      ]
    },
    'shotgun_qb_draw': {
      id: 'shotgun_qb_draw',
      name: 'Shotgun Spread - QB Draw',
      formationCategory: 'Shotgun',
      formationVariation: 'Spread (2x2)',
      playStyleCategory: 'ラン',
      playStyleSub: 'QB Run',
      playType: 'run',
      runSequence: [{ from: 'QB', to: 'QB', type: 'qb_run' }],
      runExchangeTimes: [0.2],
      description: 'パスプロテクションのフェイクからQBが中央を突くQBドローラン',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 40, y: 67 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 44, y: 66 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 66 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 56, y: 66 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 60, y: 67 }] },
        { id: 'QB', label: 'QB', x: 50, y: 76, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 78 }, { x: 50, y: 68 }, { x: 50, y: 48 }] },
        { id: 'RB', label: 'RB', x: 44, y: 77, type: 'RB', routeType: 'block', route: [{ x: 38, y: 70 }, { x: 38, y: 62 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 12, y: 45 }] },
        { id: 'WR2', label: 'WR2', x: 26, y: 67, type: 'WR', routeType: 'pass', route: [{ x: 26, y: 45 }] },
        { id: 'WR3', label: 'WR3', x: 74, y: 67, type: 'WR', routeType: 'pass', route: [{ x: 74, y: 45 }] },
        { id: 'WR4', label: 'WR4', x: 88, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 88, y: 45 }] }
      ]
    },

    // ── Shotgun Trips Plays ──
    'shotgun_trips': {
      id: 'shotgun_trips',
      name: 'Shotgun Trips - Flood Concept',
      formationCategory: 'Shotgun',
      formationVariation: 'Trips Right (3x1)',
      playStyleCategory: 'パス',
      playStyleSub: 'Dropback / Intermediate',
      playType: 'pass',
      throwTime: 2.2,
      passTargetPos: { x: 88, y: 42 },
      catchReceiverId: 'WR3',
      description: '右サイドに3人を走らせディフェンスのゾーンを崩すフラッドコンセプト',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 42, y: 67 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 46, y: 67 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 67 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 54, y: 67 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 58, y: 67 }] },
        { id: 'QB', label: 'QB', x: 50, y: 76, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 79 }] },
        { id: 'RB', label: 'RB', x: 44, y: 77, type: 'RB', routeType: 'block', route: [{ x: 44, y: 72 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 12, y: 40 }, { x: 12, y: 15 }] },
        { id: 'WR2', label: 'WR2', x: 68, y: 67, type: 'WR', routeType: 'pass', route: [{ x: 68, y: 60 }, { x: 82, y: 58 }] },
        { id: 'WR3', label: 'WR3', x: 77, y: 67, type: 'WR', routeType: 'pass', route: [{ x: 77, y: 50 }, { x: 88, y: 42 }] },
        { id: 'WR4', label: 'WR4', x: 88, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 88, y: 35 }, { x: 88, y: 15 }] }
      ]
    },
    'shotgun_trips_outside_zone': {
      id: 'shotgun_trips_outside_zone',
      name: 'Shotgun Trips - Outside Zone Stretch',
      formationCategory: 'Shotgun',
      formationVariation: 'Trips Right (3x1)',
      playStyleCategory: 'ラン',
      playStyleSub: 'Outside / Sweep',
      playType: 'run',
      runSequence: [{ from: 'QB', to: 'RB', type: 'handoff' }],
      runExchangeTimes: [0.26],
      description: '右サイドの数的優位を活かして外側を駆け上がるアウトサイドゾーンラン',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 45, y: 62 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 61 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 55, y: 61 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 60, y: 61 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 65, y: 61 }] },
        { id: 'QB', label: 'QB', x: 50, y: 76, type: 'QB', routeType: 'qb', route: [{ x: 53, y: 75 }] },
        { id: 'RB', label: 'RB', x: 44, y: 77, type: 'RB', routeType: 'run', route: [{ x: 52, y: 75 }, { x: 68, y: 66 }, { x: 74, y: 50 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 12, y: 50 }] },
        { id: 'WR2', label: 'WR2', x: 68, y: 67, type: 'WR', routeType: 'block', route: [{ x: 70, y: 58 }] },
        { id: 'WR3', label: 'WR3', x: 77, y: 67, type: 'WR', routeType: 'block', route: [{ x: 80, y: 58 }] },
        { id: 'WR4', label: 'WR4', x: 88, y: 66, type: 'WR', routeType: 'block', route: [{ x: 88, y: 56 }] }
      ]
    },

    // ── I-Formation Plays ──
    'i_formation': {
      id: 'i_formation',
      name: 'I-Formation Pro - Power Lead',
      formationCategory: 'I-Formation',
      formationVariation: 'Pro Set',
      playStyleCategory: 'ラン',
      playStyleSub: 'Inside Run',
      playType: 'run',
      runSequence: [{ from: 'QB', to: 'RB', type: 'handoff' }],
      runExchangeTimes: [0.26],
      description: 'FBが先導して走路を切り開き、RBがオフタックルを力強く突く王道パワーラン',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 43, y: 62 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 47, y: 61 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 61 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 56, y: 61 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 60, y: 62 }] },
        { id: 'TE', label: 'TE', x: 63, y: 65, type: 'TE', routeType: 'block', route: [{ x: 65, y: 61 }] },
        { id: 'QB', label: 'QB', x: 50, y: 68, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 73 }, { x: 54, y: 73 }] },
        { id: 'FB', label: 'FB', x: 50, y: 75, type: 'RB', routeType: 'block', route: [{ x: 54, y: 66 }, { x: 56, y: 58 }] },
        { id: 'RB', label: 'RB', x: 50, y: 82, type: 'RB', routeType: 'run', route: [{ x: 50, y: 74 }, { x: 55, y: 64 }, { x: 57, y: 48 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 12, y: 50 }, { x: 28, y: 40 }] },
        { id: 'WR2', label: 'WR2', x: 88, y: 66, type: 'WR', routeType: 'block', route: [{ x: 86, y: 58 }] }
      ]
    },
    'i_formation_hb_toss': {
      id: 'i_formation_hb_toss',
      name: 'I-Formation Offset - HB Toss Sweep',
      formationCategory: 'I-Formation',
      formationVariation: 'Offset I',
      playStyleCategory: 'ラン',
      playStyleSub: 'Toss',
      playType: 'run',
      runSequence: [{ from: 'QB', to: 'RB', type: 'toss' }],
      runExchangeTimes: [0.24],
      description: 'オフセット配置のFBとRGが外側にプルし、RBへクイックトスを放つ外側突破ラン',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 42, y: 63 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 47, y: 62 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 51, y: 62 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 68, y: 63 }, { x: 74, y: 58 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 62, y: 61 }] },
        { id: 'TE', label: 'TE', x: 63, y: 65, type: 'TE', routeType: 'block', route: [{ x: 68, y: 59 }] },
        { id: 'QB', label: 'QB', x: 50, y: 68, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 72 }, { x: 55, y: 72 }] },
        { id: 'FB', label: 'FB', x: 54, y: 74, type: 'RB', routeType: 'block', route: [{ x: 70, y: 68 }, { x: 76, y: 56 }] },
        { id: 'RB', label: 'RB', x: 50, y: 82, type: 'RB', routeType: 'run', route: [{ x: 64, y: 76 }, { x: 78, y: 68 }, { x: 80, y: 46 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 12, y: 45 }] },
        { id: 'WR2', label: 'WR2', x: 88, y: 66, type: 'WR', routeType: 'block', route: [{ x: 85, y: 58 }] }
      ]
    },
    'i_formation_pa_deep': {
      id: 'i_formation_pa_deep',
      name: 'I-Formation Pro - Play Action Deep Post',
      formationCategory: 'I-Formation',
      formationVariation: 'Pro Set',
      playStyleCategory: 'パス',
      playStyleSub: 'Play Action',
      playType: 'pass',
      throwTime: 2.6,
      passTargetPos: { x: 42, y: 32 },
      catchReceiverId: 'WR1',
      description: '強力ランを警戒させた後に、WR1が奥深くのポストルートへ切り込むロングパス',
      players: [
        { id: 'LT', label: 'LT', x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 42, y: 67 }] },
        { id: 'LG', label: 'LG', x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 46, y: 67 }] },
        { id: 'C',  label: 'C',  x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 67 }] },
        { id: 'RG', label: 'RG', x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 54, y: 67 }] },
        { id: 'RT', label: 'RT', x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 58, y: 67 }] },
        { id: 'TE', label: 'TE', x: 63, y: 65, type: 'TE', routeType: 'pass', route: [{ x: 63, y: 54 }, { x: 75, y: 46 }] },
        { id: 'QB', label: 'QB', x: 50, y: 68, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 74 }, { x: 50, y: 73 }] },
        { id: 'FB', label: 'FB', x: 50, y: 75, type: 'RB', routeType: 'block', route: [{ x: 44, y: 70 }] },
        { id: 'RB', label: 'RB', x: 50, y: 82, type: 'RB', routeType: 'block', route: [{ x: 52, y: 74 }, { x: 58, y: 70 }] },
        { id: 'WR1', label: 'WR1', x: 12, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 12, y: 48 }, { x: 42, y: 32 }] },
        { id: 'WR2', label: 'WR2', x: 88, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 88, y: 35 }, { x: 88, y: 15 }] }
      ]
    },

    // ── Singleback Plays ──
    'singleback_ace': {
      id: 'singleback_ace',
      name: 'Singleback Ace - 2TE Seam & Dig',
      formationCategory: 'Singleback',
      formationVariation: 'Ace (2TE)',
      playStyleCategory: 'パス',
      playStyleSub: 'Dropback / Intermediate',
      playType: 'pass',
      throwTime: 2.2,
      passTargetPos: { x: 37, y: 45 },
      catchReceiverId: 'TE1',
      description: '両サイドにTEを配置し、中央シームとアウトサイドを攻略する2TEパスプレー',
      players: [
        { id: 'TE1', label: 'TE1', x: 37, y: 65, type: 'TE', routeType: 'pass', route: [{ x: 37, y: 52 }, { x: 25, y: 45 }] },
        { id: 'LT',  label: 'LT',  x: 42, y: 65, type: 'OL', routeType: 'block', route: [{ x: 42, y: 67 }] },
        { id: 'LG',  label: 'LG',  x: 46, y: 65, type: 'OL', routeType: 'block', route: [{ x: 46, y: 67 }] },
        { id: 'C',   label: 'C',   x: 50, y: 65, type: 'OL', routeType: 'block', route: [{ x: 50, y: 67 }] },
        { id: 'RG',  label: 'RG',  x: 54, y: 65, type: 'OL', routeType: 'block', route: [{ x: 54, y: 67 }] },
        { id: 'RT',  label: 'RT',  x: 58, y: 65, type: 'OL', routeType: 'block', route: [{ x: 58, y: 67 }] },
        { id: 'TE2', label: 'TE2', x: 63, y: 65, type: 'TE', routeType: 'pass', route: [{ x: 63, y: 50 }, { x: 75, y: 45 }] },
        { id: 'QB',  label: 'QB',  x: 50, y: 68, type: 'QB', routeType: 'qb', route: [{ x: 50, y: 74 }] },
        { id: 'RB',  label: 'RB',  x: 50, y: 79, type: 'RB', routeType: 'block', route: [{ x: 54, y: 72 }] },
        { id: 'WR1', label: 'WR1', x: 10, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 10, y: 40 }, { x: 10, y: 15 }] },
        { id: 'WR2', label: 'WR2', x: 90, y: 66, type: 'WR', routeType: 'pass', route: [{ x: 90, y: 40 }, { x: 90, y: 15 }] }
      ]
    }
  },

  defense: {
    // ── 4-3 Base Plays ──
    '4_3_cover2': {
      id: '4_3_cover2',
      name: '4-3 Base - Cover 2 Zone',
      formationCategory: '4-3 Base',
      formationVariation: 'Even',
      playStyleCategory: 'Zone',
      playStyleSub: 'Cover 2',
      description: '4DL, 3LBの王道隊形。2人のセイフティが奥半分ずつを守るクラシックゾーン',
      players: [
        { id: 'LDE', label: 'DE', x: 40, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'LDT', label: 'DT', x: 47, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDT', label: 'DT', x: 53, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDE', label: 'DE', x: 60, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'WLB', label: 'WLB', x: 35, y: 53, type: 'LB', coverage: 'zone', zoneName: 'Hook/Curl (Left)', zoneX: 30, zoneY: 48 },
        { id: 'MLB', label: 'MLB', x: 50, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Middle Read', zoneX: 50, zoneY: 46 },
        { id: 'SLB', label: 'SLB', x: 65, y: 53, type: 'LB', coverage: 'zone', zoneName: 'Hook/Curl (Right)', zoneX: 70, zoneY: 48 },
        { id: 'LCB', label: 'CB',  x: 14, y: 56, type: 'DB', coverage: 'zone', zoneName: 'Flat (Left)', zoneX: 12, zoneY: 52 },
        { id: 'RCB', label: 'CB',  x: 86, y: 56, type: 'DB', coverage: 'zone', zoneName: 'Flat (Right)', zoneX: 88, zoneY: 52 },
        { id: 'FS',  label: 'FS',  x: 35, y: 32, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/2 (Left)', zoneX: 30, zoneY: 22 },
        { id: 'SS',  label: 'SS',  x: 65, y: 32, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/2 (Right)', zoneX: 70, zoneY: 22 }
      ]
    },
    '4_3_cover1_man': {
      id: '4_3_cover1_man',
      name: '4-3 Base - Cover 1 Man Free',
      formationCategory: '4-3 Base',
      formationVariation: 'Even',
      playStyleCategory: 'Man',
      playStyleSub: 'Cover 1 (Man Free)',
      description: 'FSが中央奥をパトロールし、他は全員マンツーマンでタイトに張り付く守備',
      players: [
        { id: 'LDE', label: 'DE', x: 40, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'LDT', label: 'DT', x: 47, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDT', label: 'DT', x: 53, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDE', label: 'DE', x: 60, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'WLB', label: 'WLB', x: 35, y: 54, type: 'LB', coverage: 'man', target: 'RB' },
        { id: 'MLB', label: 'MLB', x: 50, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Hole / Spy', zoneX: 50, zoneY: 48 },
        { id: 'SLB', label: 'SLB', x: 65, y: 54, type: 'LB', coverage: 'man', target: 'WR3' },
        { id: 'LCB', label: 'CB',  x: 12, y: 57, type: 'DB', coverage: 'man', target: 'WR1' },
        { id: 'RCB', label: 'CB',  x: 88, y: 57, type: 'DB', coverage: 'man', target: 'WR4' },
        { id: 'SS',  label: 'SS',  x: 58, y: 45, type: 'DB', coverage: 'man', target: 'WR2' },
        { id: 'FS',  label: 'FS',  x: 50, y: 28, type: 'DB', coverage: 'zone', zoneName: 'Deep Middle (1/3)', zoneX: 50, zoneY: 18 }
      ]
    },
    '4_3_fire_zone': {
      id: '4_3_fire_zone',
      name: '4-3 Over - Fire Zone Blitz',
      formationCategory: '4-3 Base',
      formationVariation: 'Over',
      playStyleCategory: 'Blitz',
      playStyleSub: 'Zone Blitz (Fire Zone)',
      description: 'WLBがブリッツに参加し、DEがフラットへドロップする5人ラッシュ3-Deepゾーンブリッツ',
      players: [
        { id: 'LDE', label: 'DE', x: 38, y: 61, type: 'DL', coverage: 'zone', zoneName: 'Drop Flat', zoneX: 25, zoneY: 54 },
        { id: 'LDT', label: 'DT', x: 46, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDT', label: 'DT', x: 52, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDE', label: 'DE', x: 61, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'WLB', label: 'WLB', x: 32, y: 56, type: 'LB', coverage: 'rush', target: 'QB' },
        { id: 'MLB', label: 'MLB', x: 48, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Middle Hook', zoneX: 45, zoneY: 46 },
        { id: 'SLB', label: 'SLB', x: 64, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Right Hook', zoneX: 62, zoneY: 46 },
        { id: 'LCB', label: 'CB',  x: 12, y: 56, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/3 (Left)', zoneX: 16, zoneY: 20 },
        { id: 'RCB', label: 'CB',  x: 88, y: 56, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/3 (Right)', zoneX: 84, zoneY: 20 },
        { id: 'SS',  label: 'SS',  x: 68, y: 48, type: 'DB', coverage: 'zone', zoneName: 'Flat (Right)', zoneX: 78, zoneY: 50 },
        { id: 'FS',  label: 'FS',  x: 50, y: 28, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/3 (Middle)', zoneX: 50, zoneY: 18 }
      ]
    },

    // ── 3-4 Base Plays ──
    '3_4_cover3': {
      id: '3_4_cover3',
      name: '3-4 Base - Cover 3 Zone',
      formationCategory: '3-4 Base',
      formationVariation: 'Okie',
      playStyleCategory: 'Zone',
      playStyleSub: 'Cover 3',
      description: '3DL, 4LB。奥を3分割し、手前4エリアを分担する鉄壁ゾーンディフェンス',
      players: [
        { id: 'NT',  label: 'NT',  x: 50, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'LDE', label: 'DE',  x: 44, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDE', label: 'DE',  x: 56, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'LOLB', label: 'OLB', x: 36, y: 61, type: 'LB', coverage: 'rush', target: 'QB' },
        { id: 'LILB', label: 'ILB', x: 45, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Hook (Left)', zoneX: 40, zoneY: 46 },
        { id: 'RILB', label: 'ILB', x: 55, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Hook (Right)', zoneX: 60, zoneY: 46 },
        { id: 'ROLB', label: 'OLB', x: 64, y: 54, type: 'LB', coverage: 'zone', zoneName: 'Flat (Right)', zoneX: 74, zoneY: 50 },
        { id: 'LCB', label: 'CB',   x: 13, y: 55, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/3 (Left)', zoneX: 16, zoneY: 20 },
        { id: 'RCB', label: 'CB',   x: 87, y: 55, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/3 (Right)', zoneX: 84, zoneY: 20 },
        { id: 'SS',  label: 'SS',   x: 34, y: 50, type: 'DB', coverage: 'zone', zoneName: 'Flat (Left)', zoneX: 24, zoneY: 50 },
        { id: 'FS',  label: 'FS',   x: 50, y: 30, type: 'DB', coverage: 'zone', zoneName: 'Deep 1/3 (Middle)', zoneX: 50, zoneY: 18 }
      ]
    },

    // ── Nickel Plays ──
    'nickel_425_quarters': {
      id: 'nickel_425_quarters',
      name: 'Nickel 4-2-5 - Cover 4 Quarters',
      formationCategory: 'Nickel',
      formationVariation: 'Nickel 4-2-5',
      playStyleCategory: 'Zone',
      playStyleSub: 'Cover 4 (Quarters)',
      description: '4人のDBがフィールド奥を4分割して縦のロングパスを完全に遮断するゾーン守備',
      players: [
        { id: 'LDE', label: 'DE', x: 40, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'LDT', label: 'DT', x: 47, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDT', label: 'DT', x: 53, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'RDE', label: 'DE', x: 60, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'WLB', label: 'WLB', x: 42, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Hook (Left)', zoneX: 38, zoneY: 46 },
        { id: 'MLB', label: 'MLB', x: 58, y: 52, type: 'LB', coverage: 'zone', zoneName: 'Hook (Right)', zoneX: 62, zoneY: 46 },
        { id: 'NCB', label: 'NCB', x: 26, y: 55, type: 'DB', coverage: 'zone', zoneName: 'Flat (Left)', zoneX: 20, zoneY: 50 },
        { id: 'LCB', label: 'CB',  x: 12, y: 54, type: 'DB', coverage: 'zone', zoneName: 'Quarter 1/4', zoneX: 14, zoneY: 18 },
        { id: 'FS',  label: 'FS',  x: 36, y: 30, type: 'DB', coverage: 'zone', zoneName: 'Quarter 1/4', zoneX: 36, zoneY: 18 },
        { id: 'SS',  label: 'SS',  x: 64, y: 30, type: 'DB', coverage: 'zone', zoneName: 'Quarter 1/4', zoneX: 64, zoneY: 18 },
        { id: 'RCB', label: 'CB',  x: 88, y: 54, type: 'DB', coverage: 'zone', zoneName: 'Quarter 1/4', zoneX: 86, zoneY: 18 }
      ]
    },
    'nickel_335_blitz': {
      id: 'nickel_335_blitz',
      name: 'Nickel 3-3-5 - Cover 0 All-Out Blitz',
      formationCategory: 'Nickel',
      formationVariation: 'Nickel 3-3-5',
      playStyleCategory: 'Blitz',
      playStyleSub: 'Man Blitz (Cover 0/1 Blitz)',
      description: '5人のDBが完全1対1勝負し、6人が一斉にQBへ猛烈に襲いかかるオールアウトブリッツ',
      players: [
        { id: 'DE1', label: 'DE', x: 44, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'NT',  label: 'NT', x: 50, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'DE2', label: 'DE', x: 56, y: 61, type: 'DL', coverage: 'rush', target: 'QB' },
        { id: 'LB1', label: 'LB', x: 38, y: 58, type: 'LB', coverage: 'rush', target: 'QB' },
        { id: 'MLB', label: 'MLB', x: 50, y: 55, type: 'LB', coverage: 'rush', target: 'QB' },
        { id: 'LB2', label: 'LB', x: 62, y: 58, type: 'LB', coverage: 'rush', target: 'QB' },
        { id: 'LCB', label: 'CB', x: 12, y: 57, type: 'DB', coverage: 'man', target: 'WR1' },
        { id: 'NCB', label: 'NCB', x: 26, y: 58, type: 'DB', coverage: 'man', target: 'WR2' },
        { id: 'RCB', label: 'CB', x: 88, y: 57, type: 'DB', coverage: 'man', target: 'WR4' },
        { id: 'SS',  label: 'SS', x: 74, y: 58, type: 'DB', coverage: 'man', target: 'WR3' },
        { id: 'FS',  label: 'FS', x: 44, y: 52, type: 'DB', coverage: 'man', target: 'RB' }
      ]
    }
  },

  // 定番パスルートのテンプレート
  routeTemplates: {
    slant: { name: 'Slant (斜めカット)', path: [{ dx: 2, dy: -12 }, { dx: 18, dy: -20 }] },
    out:   { name: 'Out (外側直角)', path: [{ dx: 0, dy: -14 }, { dx: -12, dy: -14 }] },
    in_dig:{ name: 'In / Dig (内側直角)', path: [{ dx: 0, dy: -15 }, { dx: 15, dy: -15 }] },
    post:  { name: 'Post (ゴールポスト方向)', path: [{ dx: 0, dy: -16 }, { dx: 16, dy: -32 }] },
    corner:{ name: 'Corner (コーナー方向)', path: [{ dx: 0, dy: -16 }, { dx: -16, dy: -32 }] },
    fly:   { name: 'Fly / Go (縦突破)', path: [{ dx: 0, dy: -22 }, { dx: 0, dy: -45 }] },
    hitch: { name: 'Hitch / Curl (ストップ)', path: [{ dx: 0, dy: -15 }, { dx: 0, dy: -12 }] },
    flat:  { name: 'Flat (サイドライン浅い)', path: [{ dx: 5, dy: -4 }, { dx: 18, dy: -6 }] },
    wheel: { name: 'Wheel (外から縦へ)', path: [{ dx: 8, dy: -4 }, { dx: 10, dy: -16 }, { dx: 10, dy: -38 }] }
  },

  // 定番ランルートのテンプレート
  runTemplates: {
    inside_zone: { name: 'Inside Zone (中央カット)', path: [{ dx: 3, dy: -5 }, { dx: 2, dy: -15 }, { dx: 0, dy: -35 }] },
    outside_zone:{ name: 'Outside Zone / Sweep (外回り)', path: [{ dx: 14, dy: -3 }, { dx: 24, dy: -12 }, { dx: 24, dy: -35 }] },
    power_lead:  { name: 'Power / Off-Tackle (FB追従)', path: [{ dx: 6, dy: -6 }, { dx: 8, dy: -18 }, { dx: 6, dy: -35 }] },
    counter:     { name: 'Counter (逆サイド反転)', path: [{ dx: -5, dy: 1 }, { dx: 8, dy: -8 }, { dx: 12, dy: -28 }] },
    draw:        { name: 'Draw (パスフェイク後の中央)', path: [{ dx: 0, dy: 2 }, { dx: 0, dy: -12 }, { dx: -2, dy: -32 }] }
  },

  // ブロックテンプレート
  blockTemplates: {
    pass_pro:    { name: 'Pass Protection (後退ブロック)', path: [{ dx: 0, dy: 3 }] },
    run_drive:   { name: 'Drive Block (前進ブロック)', path: [{ dx: 0, dy: -6 }] },
    lead_block:  { name: 'Lead Block (先行リード)', path: [{ dx: 6, dy: -10 }] },
    pull_right:  { name: 'Pull Right (右へ引っ張り)', path: [{ dx: 12, dy: 2 }, { dx: 16, dy: -8 }] },
    pull_left:   { name: 'Pull Left (左へ引っ張り)', path: [{ dx: -12, dy: 2 }, { dx: -16, dy: -8 }] }
  }
};
