'use strict';
// Mascote do Zeno: um robozinho em SVG com humores, cores, formatos de olho e acessórios.
// Dois visuais: "novo" (robozinho de corpo inteiro com tela no rosto e auréola, padrão desde a 1.3)
// e "classico" (a carinha redonda das versões antigas).
// Usado no entalho (topo da tela), no Painel e no app do celular (mesmo arquivo nos dois lugares).
(function (root) {
  const MOODS = {
    idle: 'Repouso', listening: 'Ouvindo', thinking: 'Pensando', speaking: 'Falando', happy: 'Feliz', laugh: 'Rindo',
    love: 'Carinho', cool: 'Descolado', surprised: 'Surpreso', angry: 'Bravo', crying: 'Chorando', sleeping: 'Dormindo', success: 'Comemorando',
  };
  const STYLES = { novo: 'Robô com tela', classico: 'Clássico' };
  const SHAPES = { arco: 'Sorriso', round: 'Redondos', oval: 'Ovais', pixel: 'Pixel', big: 'Grandões', line: 'Tracinho' };
  const ACCESSORIES = {
    none: 'Nenhum', halo: 'Auréola', party: 'Chapéu de festa', crown: 'Coroa', bow: 'Laço', beanie: 'Gorro', cap: 'Boné',
    glasses: 'Óculos', horns: 'Chifrinhos', flower: 'Florzinha', santa: 'Gorro de Natal', headphones: 'Fones',
  };
  const DEFAULTS = { style: 'novo', body: '#8b5cf6', visor: '#0d1120', eyes: '#7ff3ff', eyeShape: 'arco', accessory: 'none' };
  const PALETTE = {
    body: ['#8b5cf6', '#6d5dfc', '#a78bfa', '#ec6fb3', '#38bdf8', '#34d399', '#fbbf24', '#fb7a5b', '#e9ecf5', '#8b90a6'],
    visor: ['#0d1120', '#000000', '#1d1638', '#0f2a30', '#2e1420', '#13220f'],
    eyes: ['#7ff3ff', '#8bdc4f', '#ff6fae', '#ffd45c', '#ffffff', '#ff6b6b', '#c4a8ff'],
  };

  const HEX = /^#[0-9a-f]{6}$/i;
  const color = (c, fb) => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(c || '')) ? String(c) : fb);
  const full = (c) => (c.length === 4 ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c);
  // mistura uma cor com branco (t > 0) ou preto (t < 0)
  function shade(c, t) {
    const hx = full(c); if (!HEX.test(hx)) return c;
    const n = parseInt(hx.slice(1), 16); const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const to = t > 0 ? 255 : 0; const k = Math.abs(t);
    return '#' + ch.map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, '0')).join('');
  }
  let uid = 0;

  // ============================ visual novo ============================
  // Desenho em 100x100: auréola (y≈4), antena, cabeça com tela (y 17–71), corpo, braços e pés (até y≈95).
  const EX = [40.5, 59.5]; const EY = 42;

  function eyesNovo(shape, fill, mood) {
    const both = (fn) => fn(EX[0], 0) + fn(EX[1], 1);
    const st = `stroke="${fill}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    const arch = (x) => `<path d="M${x - 5.2} ${EY + 2} Q${x} ${EY - 5.5} ${x + 5.2} ${EY + 2}" ${st}/>`;
    const cup = (x) => `<path d="M${x - 5.2} ${EY - 1} Q${x} ${EY + 4.8} ${x + 5.2} ${EY - 1}" ${st}/>`;
    switch (mood) {
      case 'happy': case 'laugh': case 'success': return both(arch);
      case 'listening': case 'sleeping': return both(cup);
      case 'thinking': return both((x) => `<ellipse cx="${x}" cy="${EY}" rx="4.6" ry="5.2" fill="none" stroke="${fill}" stroke-width="2.6"/><circle cx="${x + 1.2}" cy="${EY - 2}" r="2.1" fill="${fill}"/>`);
      case 'love': return both((x) => `<path d="M${x} ${EY + 5.5} l-5.8-5.8a3.6 3.6 0 0 1 5.8-4.2 3.6 3.6 0 0 1 5.8 4.2z" fill="#ff7eb6"/>`);
      case 'surprised': return both((x) => `<circle cx="${x}" cy="${EY}" r="5.6" fill="none" stroke="${fill}" stroke-width="2.8"/><circle cx="${x}" cy="${EY}" r="1.8" fill="${fill}"/>`);
      case 'angry': return both((x, i) => `<path d="M${x - 5} ${EY - (i ? 2 : 5)} L${x + 5} ${EY - (i ? 5 : 2)}" ${st}/><circle cx="${x}" cy="${EY + 2.5}" r="2.6" fill="${fill}"/>`);
      case 'crying': return both((x) => `${cup(x)}<path class="zm-tear" d="M${x + 3.5} ${EY + 4} q2.6 4.2 0 6 q-2.6-1.8 0-6z" fill="#7cc7ff"/>`);
      case 'cool': return `<rect x="${EX[0] - 7.5}" y="${EY - 5}" width="15" height="9" rx="3.5" fill="#05060a" stroke="${fill}" stroke-width="1"/><rect x="${EX[1] - 7.5}" y="${EY - 5}" width="15" height="9" rx="3.5" fill="#05060a" stroke="${fill}" stroke-width="1"/><path d="M${EX[0] + 7.5} ${EY - 2} H${EX[1] - 7.5}" stroke="${fill}" stroke-width="1.6"/><path d="M${EX[0] - 4} ${EY - 3} l4 0" stroke="#fff" stroke-width="1.4" opacity=".7"/>`;
      default: break;
    }
    const lid = (inner) => `<g class="lid">${inner}</g>`;
    switch (shape) {
      case 'round': return lid(both((x) => `<circle cx="${x}" cy="${EY}" r="4.3" fill="${fill}"/>`));
      case 'oval': return lid(both((x) => `<ellipse cx="${x}" cy="${EY}" rx="3.4" ry="5.4" fill="${fill}"/>`));
      case 'pixel': return lid(both((x) => `<rect x="${x - 4}" y="${EY - 4}" width="8" height="8" fill="${fill}"/>`));
      case 'big': return lid(both((x) => `<circle cx="${x}" cy="${EY}" r="6" fill="${fill}"/><circle cx="${x + 2}" cy="${EY - 2.2}" r="2" fill="#fff" opacity=".85"/>`));
      case 'line': return lid(both((x) => `<rect x="${x - 5}" y="${EY - 1.5}" width="10" height="3" rx="1.5" fill="${fill}"/>`));
      default: return lid(both(arch));
    }
  }

  function mouthNovo(mood, fill) {
    const st = `stroke="${fill}" stroke-width="3" stroke-linecap="round" fill="none"`;
    switch (mood) {
      case 'speaking': return `<ellipse class="talk" cx="50" cy="53" rx="4.2" ry="2.8" fill="${fill}"/>`;
      case 'laugh': case 'success': return `<path d="M43.5 50.5 Q50 59.5 56.5 50.5z" fill="${fill}"/>`;
      case 'surprised': return `<ellipse cx="50" cy="54" rx="2.6" ry="3.2" fill="none" stroke="${fill}" stroke-width="2.4"/>`;
      case 'thinking': return `<path d="M45 54 q2.5-2.4 5 0 t5 0" stroke="${fill}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`;
      case 'angry': case 'crying': return `<path d="M45 55.5 Q50 51.5 55 55.5" ${st}/>`;
      case 'sleeping': return `<circle cx="50" cy="53.5" r="1.8" fill="${fill}"/>`;
      case 'cool': return `<path d="M46 52 Q51 55.5 55.5 51" ${st}/>`;
      default: return `<path d="M45.5 51.5 Q50 55.5 54.5 51.5" ${st}/>`;
    }
  }

  // braço: ombro no corpo; ângulo 0 = pendurado. Positivo gira para fora.
  function arm(side, angle, bodyGrad, dark, cls) {
    const sx = side < 0 ? 31 : 69; const sy = 69;
    const a = side < 0 ? angle : -angle;
    return `<g class="zm-arm ${side < 0 ? 'l' : 'r'} ${cls || ''}"><g transform="rotate(${a} ${sx} ${sy})">`
      + `<rect x="${sx - 4.3}" y="${sy - 3}" width="8.6" height="18" rx="4.3" fill="${bodyGrad}"/>`
      + `<circle cx="${sx}" cy="${sy + 16.5}" r="4.8" fill="${dark}"/><circle cx="${sx - 1.4}" cy="${sy + 15}" r="1.6" fill="#fff" opacity=".18"/></g></g>`;
  }

  function fxNovo(mood, eyes) {
    switch (mood) {
      case 'thinking':
        return '<g class="zm-fx zm-think"><text x="6" y="30" font-size="17" font-weight="800" fill="#c9cbe6" font-family="system-ui,sans-serif">?</text>'
          + `<g class="zm-gear">${gear(88, 16, 6.5)}</g><g class="zm-gear b">${gear(97, 27, 4.2)}</g></g>`;
      case 'success': case 'laugh': {
        const bits = [[10, 22, '#ffd45c', 0], [20, 10, '#7ff3ff', 1], [84, 8, '#ff9ec7', 2], [93, 24, '#ffd45c', 3], [6, 46, '#ff9ec7', 4], [96, 46, '#a3f07a', 5], [30, 4, '#a3f07a', 6], [72, 3, '#7ff3ff', 7]];
        return '<g class="zm-fx zm-party">' + bits.map(([x, y, c, i]) => (i % 2
          ? `<path class="zm-bit" d="M${x} ${y - 3}l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="${c}"/>`
          : `<rect class="zm-bit" x="${x - 1.4}" y="${y - 2.6}" width="2.8" height="5.2" rx="1" fill="${c}" transform="rotate(${i * 37} ${x} ${y})"/>`)).join('') + '</g>';
      }
      case 'listening':
        return '<g class="zm-fx zm-hear">'
          + `<path class="zm-note" d="M10 28 v-8 l6-2 v8" stroke="#c4a8ff" stroke-width="1.8" fill="none"/><circle class="zm-note" cx="8.6" cy="28.4" r="2" fill="#c4a8ff"/><circle class="zm-note" cx="14.6" cy="26.4" r="2" fill="#c4a8ff"/>`
          + '<path class="zm-wave" d="M2 52 q3-5 6 0 t6 0" stroke="#c4a8ff" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
          + [0, 1, 2, 3, 4].map((i) => `<rect class="zm-barv" x="${87 + i * 2.6}" y="${44 - (i % 3) * 2}" width="1.6" height="${12 + (i % 3) * 4}" rx=".8" fill="#c4a8ff"/>`).join('')
          + '</g>';
      case 'speaking':
        return '<g class="zm-fx zm-say">' + [0, 1, 2].map((i) => `<path class="zm-arc" d="M${86 + i * 4} ${38 - i * 3} q${4 + i} ${6 + i * 3} 0 ${12 + i * 6}" stroke="${eyes}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`).join('') + '</g>';
      case 'sleeping':
        return '<g class="zm-fx zm-zzz"><text class="zm-z" x="76" y="20" font-size="9" font-weight="800" fill="#c9cbe6" font-family="system-ui,sans-serif">z</text><text class="zm-z b" x="84" y="11" font-size="12" font-weight="800" fill="#c9cbe6" font-family="system-ui,sans-serif">Z</text></g>';
      case 'love':
        return '<g class="zm-fx zm-hearts"><path class="zm-heart" d="M88 22 l-4-4a2.5 2.5 0 0 1 4-3 2.5 2.5 0 0 1 4 3z" fill="#ff7eb6"/><path class="zm-heart b" d="M12 30 l-3-3a1.9 1.9 0 0 1 3-2.2 1.9 1.9 0 0 1 3 2.2z" fill="#ff7eb6"/></g>';
      case 'angry':
        return '<g class="zm-fx zm-steam"><path class="zm-puff" d="M14 22 q-3-3 0-6 q3-3 0-6" stroke="#ff8a8a" stroke-width="2" fill="none" stroke-linecap="round"/><path class="zm-puff b" d="M86 22 q3-3 0-6 q-3-3 0-6" stroke="#ff8a8a" stroke-width="2" fill="none" stroke-linecap="round"/></g>';
      case 'surprised':
        return '<g class="zm-fx"><text x="84" y="22" font-size="15" font-weight="900" fill="#ffd45c" font-family="system-ui,sans-serif">!</text></g>';
      default: return '';
    }
  }
  function gear(cx, cy, r) {
    const teeth = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r; return `<rect x="${(x - 1.3).toFixed(2)}" y="${(y - 1.3).toFixed(2)}" width="2.6" height="2.6" rx=".5" fill="#8f93b8" transform="rotate(${i * 45} ${x.toFixed(2)} ${y.toFixed(2)})"/>`; }).join('');
    return `${teeth}<circle cx="${cx}" cy="${cy}" r="${(r * 0.8).toFixed(2)}" fill="#8f93b8"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.32).toFixed(2)}" fill="#1a1c2c"/>`;
  }

  function hatNovo(a, body) {
    // os chapéus antigos foram desenhados para a cabeça em y=24; aqui a cabeça começa em y=17
    const old = accessoryClassic(a, body);
    if (!old || a === 'headphones' || a === 'halo' || a === 'glasses') return '';
    return `<g transform="translate(0 -7)">${old}</g>`;
  }

  function svgNovo(o, mood, id) {
    const body = color(o.body, DEFAULTS.body);
    const visor = color(o.visor, DEFAULTS.visor);
    const eyes = color(o.eyes, DEFAULTS.eyes);
    const light = shade(body, 0.28); const dark = shade(body, -0.32); const darker = shade(body, -0.5);
    const acc = ACCESSORIES[o.accessory] ? o.accessory : 'none';
    const hat = ['party', 'crown', 'beanie', 'cap', 'santa'].includes(acc);
    const halo = acc === 'halo';
    const phones = acc === 'headphones' || mood === 'listening';
    const g = `zg${id}`; const v = `zv${id}`; const gl = `zl${id}`; const hg = `zh${id}`;
    const armsUp = mood === 'success' || mood === 'laugh';
    const wave = mood === 'idle'; const hi = mood === 'happy';
    const L = armsUp ? 128 : hi ? 145 : wave ? 22 : mood === 'crying' ? 4 : 16;
    const R = armsUp ? 128 : mood === 'thinking' ? -98 : mood === 'love' ? 46 : 16;
    const hiArm = `<g class="zm-arm zm-hi"><path d="M31 71 L17 66 L9 52" fill="none" stroke="url(#${g})" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="49" r="4.9" fill="${dark}"/><circle cx="7.2" cy="47.6" r="1.6" fill="#fff" opacity=".2"/></g>`;
    const armL = hi ? hiArm : arm(-1, L, `url(#${g})`, dark, wave ? 'zm-wave-arm' : hi ? 'zm-hi' : armsUp ? 'zm-cheer' : '');
    const armR = arm(1, R, `url(#${g})`, dark, armsUp ? 'zm-cheer b' : mood === 'thinking' ? 'zm-chin' : '');
    const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${body}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`
      + `<linearGradient id="${v}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(visor, 0.1)}"/><stop offset="1" stop-color="${visor}"/></linearGradient>`
      + `<filter id="${gl}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      + `<filter id="${hg}" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    const fill = `url(#${g})`;
    const cheeks = ['happy', 'love', 'laugh', 'success'].includes(mood)
      ? `<ellipse cx="31.5" cy="50" rx="3" ry="1.7" fill="#ff8fc7" opacity=".55"/><ellipse cx="68.5" cy="50" rx="3" ry="1.7" fill="#ff8fc7" opacity=".55"/>` : '';
    const glasses = acc === 'glasses' && mood !== 'cool'
      ? `<g fill="none" stroke="#e9ecf5" stroke-width="1.6" opacity=".9"><circle cx="${EX[0]}" cy="${EY}" r="7.5"/><circle cx="${EX[1]}" cy="${EY}" r="7.5"/><path d="M48 ${EY} H52"/></g>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="zm-svg zm-novo zm-${mood}" aria-hidden="true">${defs}`
      + `<ellipse class="zm-shadow" cx="50" cy="96.5" rx="19" ry="2.6" fill="#000" opacity=".28"/>`
      + `<g class="zm-bot">`
      + `<g class="zm-legs"><rect x="38.5" y="83" width="9.5" height="11.5" rx="4.7" fill="${dark}"/><rect x="52" y="83" width="9.5" height="11.5" rx="4.7" fill="${dark}"/></g>`
      + (armsUp || hi ? '' : armL) + (armsUp || mood === 'thinking' ? '' : armR)
      + `<rect x="31" y="66" width="38" height="22" rx="11" fill="${fill}"/>`
      + `<path d="M35.5 76 h29 a5 5 0 0 1 -5 9 h-19 a5 5 0 0 1 -5 -9z" fill="${light}" opacity=".35"/>`
      + `<g class="zm-head">`
      + (!hat && o.antenna !== false ? `<line x1="50" y1="18" x2="50" y2="9.5" stroke="${darker}" stroke-width="2.2" stroke-linecap="round"/><circle class="ant" cx="50" cy="8.5" r="2.8" fill="#f2b2e4"/>` : '')
      + `<rect x="13.5" y="36" width="6" height="16" rx="3" fill="${dark}"/><rect x="80.5" y="36" width="6" height="16" rx="3" fill="${dark}"/>`
      + `<rect x="17" y="17" width="66" height="55" rx="24" fill="${fill}"/>`
      + `<ellipse cx="34" cy="24.5" rx="11" ry="4" fill="#fff" opacity=".22" transform="rotate(-14 34 24.5)"/>`
      + `<rect x="24" y="25.5" width="52" height="38" rx="15" fill="url(#${v})" stroke="${darker}" stroke-width="1.2"/>`
      + `<rect x="27" y="27.5" width="46" height="9" rx="4.5" fill="#fff" opacity=".05"/>`
      + `<g class="zm-eyes" filter="url(#${gl})">${eyesNovo(o.eyeShape, eyes, mood)}${mouthNovo(mood, eyes)}</g>${cheeks}${glasses}`
      + (phones ? `<g class="zm-phones"><path d="M17 40 Q17 9 50 9 Q83 9 83 40" fill="none" stroke="${darker}" stroke-width="3.6" stroke-linecap="round"/><rect x="9.5" y="33" width="10" height="20" rx="5" fill="${darker}"/><rect x="80.5" y="33" width="10" height="20" rx="5" fill="${darker}"/><rect x="11.5" y="37" width="4" height="12" rx="2" fill="${light}" opacity=".6"/><rect x="84.5" y="37" width="4" height="12" rx="2" fill="${light}" opacity=".6"/></g>` : '')
      + `<g class="zm-acc">${hatNovo(acc, body)}</g>`
      + `</g>` + (armsUp ? armL + armR : mood === 'thinking' ? armR : hi ? armL : '') + `</g>`
      + (halo && !phones ? `<g class="zm-halo" filter="url(#${hg})"><ellipse cx="50" cy="4" rx="16.5" ry="3.6" fill="none" stroke="#ffe45c" stroke-width="2.8"/><ellipse cx="50" cy="4" rx="16.5" ry="3.6" fill="none" stroke="#fffbd6" stroke-width=".9" opacity=".9"/></g>` : '')
      + (halo && phones ? `<g class="zm-halo" filter="url(#${hg})"><ellipse cx="50" cy="1" rx="15" ry="3.2" fill="none" stroke="#ffe45c" stroke-width="2.6"/></g>` : '')
      + fxNovo(mood, eyes)
      + `<circle class="zm-fly" cx="-20" cy="-20" r="1.8" fill="#c9cbe6" opacity="0"/></svg>`;
  }

  // ============================ visual clássico ============================
  function eyePairClassic(shape, fill, mood) {
    const L = 38; const R = 62; const Y = 55;
    const both = (fn) => fn(L) + fn(R);
    const stroke = `stroke="${fill}" stroke-width="4" stroke-linecap="round" fill="none"`;
    switch (mood) {
      case 'happy': case 'laugh': case 'success':
        if (mood === 'success') return both((x) => `<path d="M${x} ${Y - 9} l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="${fill}"/>`);
        return both((x) => `<path d="M${x - 7} ${Y + 3} Q${x} ${Y - 8} ${x + 7} ${Y + 3}" ${stroke}/>`);
      case 'sleeping': return both((x) => `<path d="M${x - 7} ${Y} Q${x} ${Y + 6} ${x + 7} ${Y}" ${stroke}/>`);
      case 'love': return both((x) => `<path d="M${x} ${Y + 7} l-7.5-7.5a4.6 4.6 0 0 1 7.5-5.4 4.6 4.6 0 0 1 7.5 5.4z" fill="${fill}"/>`);
      case 'surprised': return both((x) => `<circle cx="${x}" cy="${Y}" r="8" fill="none" stroke="${fill}" stroke-width="3.5"/>`);
      case 'angry':
        return both((x) => `<circle cx="${x}" cy="${Y + 2}" r="5.5" fill="${fill}"/>`)
          + `<path d="M${L - 8} ${Y - 11} L${L + 6} ${Y - 6}M${R + 8} ${Y - 11} L${R - 6} ${Y - 6}" ${stroke}/>`;
      case 'crying': return both((x) => `<path d="M${x - 7} ${Y - 1} Q${x} ${Y + 5} ${x + 7} ${Y - 1}" ${stroke}/><path d="M${x + 4} ${Y + 6} q3 5 0 7 q-3-2 0-7z" fill="#7cc7ff"/>`);
      case 'cool': return `<rect x="${L - 12}" y="${Y - 8}" width="24" height="14" rx="5" fill="#111"/><rect x="${R - 12}" y="${Y - 8}" width="24" height="14" rx="5" fill="#111"/><path d="M${L + 12} ${Y - 3} H${R - 12}" stroke="#111" stroke-width="3"/><path d="M${L - 7} ${Y - 5} l5 0" stroke="#fff" stroke-width="2" opacity=".6"/>`;
      default: break;
    }
    const lid = '<g class="lid">';
    switch (shape) {
      case 'oval': return lid + both((x) => `<ellipse cx="${x}" cy="${Y}" rx="5.5" ry="8.5" fill="${fill}"/>`) + '</g>';
      case 'pixel': return lid + both((x) => `<rect x="${x - 6}" y="${Y - 6}" width="12" height="12" fill="${fill}"/>`) + '</g>';
      case 'big': return lid + both((x) => `<circle cx="${x}" cy="${Y}" r="9.5" fill="${fill}"/><circle cx="${x + 3}" cy="${Y - 3.5}" r="3" fill="#fff" opacity=".85"/>`) + '</g>';
      case 'line': return lid + both((x) => `<rect x="${x - 7}" y="${Y - 2}" width="14" height="4" rx="2" fill="${fill}"/>`) + '</g>';
      case 'arco': return lid + both((x) => `<path d="M${x - 7} ${Y + 3} Q${x} ${Y - 8} ${x + 7} ${Y + 3}" ${stroke}/>`) + '</g>';
      default: return lid + both((x) => `<circle cx="${x}" cy="${Y}" r="7" fill="${fill}"/>`) + '</g>';
    }
  }
  function mouthClassic(mood, fill) {
    if (mood === 'speaking') return `<ellipse class="talk" cx="50" cy="68" rx="5" ry="3" fill="${fill}"/>`;
    if (mood === 'laugh') return `<path d="M42 65 Q50 75 58 65z" fill="${fill}"/>`;
    if (mood === 'surprised') return `<circle cx="50" cy="69" r="3" fill="${fill}"/>`;
    if (mood === 'thinking') return `<g class="dots" fill="${fill}"><circle cx="43" cy="69" r="1.8"/><circle cx="50" cy="69" r="1.8"/><circle cx="57" cy="69" r="1.8"/></g>`;
    return '';
  }
  function accessoryClassic(a, body) {
    switch (a) {
      case 'party': return '<path d="M50 2 L64 27 H36z" fill="#ff6fae"/><path d="M43 14 l14 6M40 21 l18 5" stroke="#fff" stroke-width="2.5"/><circle cx="50" cy="3" r="3.5" fill="#f4c542"/>';
      case 'crown': return '<path d="M32 26 L34 10 L42 19 L50 6 L58 19 L66 10 L68 26z" fill="#f4c542" stroke="#c99a16" stroke-width="1.5"/><circle cx="50" cy="16" r="2.5" fill="#ff5b5b"/>';
      case 'bow': return '<path d="M70 22 l-12-8v16z M70 22 l12-8v16z" fill="#ff6fae"/><circle cx="70" cy="22" r="3.5" fill="#e04b8f"/>';
      case 'beanie': return '<path d="M22 32 Q22 6 50 6 Q78 6 78 32z" fill="#4f7bdc"/><rect x="19" y="27" width="62" height="9" rx="4.5" fill="#dfe8ff"/><circle cx="50" cy="6" r="5" fill="#dfe8ff"/>';
      case 'cap': return '<path d="M22 32 Q24 8 50 8 Q76 8 78 32z" fill="#3fae5a"/><path d="M70 30 Q92 30 94 36 L74 36z" fill="#2c8a45"/><circle cx="50" cy="9" r="2.5" fill="#2c8a45"/>';
      case 'halo': return '<ellipse cx="50" cy="8" rx="18" ry="4.5" fill="none" stroke="#f4d94a" stroke-width="3.5"/>';
      case 'horns': return '<path d="M28 28 L22 8 L38 24z M72 28 L78 8 L62 24z" fill="#ff5b5b"/>';
      case 'flower': return '<g transform="translate(72 22)"><circle r="4.5" cx="0" cy="-6" fill="#ff9ec7"/><circle r="4.5" cx="6" cy="0" fill="#ff9ec7"/><circle r="4.5" cx="0" cy="6" fill="#ff9ec7"/><circle r="4.5" cx="-6" cy="0" fill="#ff9ec7"/><circle r="3.5" fill="#f4c542"/></g>';
      case 'santa': return '<path d="M20 31 Q30 4 58 6 Q80 8 86 26 L74 22 Q60 14 50 16 Q34 18 28 31z" fill="#e23b3b"/><rect x="17" y="26" width="64" height="9" rx="4.5" fill="#fff"/><circle cx="86" cy="27" r="5" fill="#fff"/>';
      case 'headphones': return `<path d="M14 54 Q14 14 50 14 Q86 14 86 54" fill="none" stroke="#333" stroke-width="5"/><rect x="6" y="46" width="12" height="22" rx="5" fill="#333"/><rect x="82" y="46" width="12" height="22" rx="5" fill="#333"/><rect x="9" y="50" width="6" height="14" rx="3" fill="${body}"/>`;
      default: return '';
    }
  }
  function svgClassic(o, mood) {
    const body = color(o.body, '#e9ecf5');
    const visor = color(o.visor, '#14151f');
    const eyes = color(o.eyes, '#8bdc4f');
    const hat = ['party', 'crown', 'beanie', 'cap', 'santa', 'halo'].includes(o.accessory);
    const antenna = o.antenna !== false && !hat
      ? `<line x1="50" y1="24" x2="50" y2="10" stroke="${body}" stroke-width="3"/><circle class="ant" cx="50" cy="8" r="4.5" fill="${eyes}"/>` : '';
    const cheeks = ['happy', 'love', 'laugh', 'success'].includes(mood)
      ? '<ellipse cx="27" cy="66" rx="4.5" ry="2.6" fill="#ff8fb1" opacity=".75"/><ellipse cx="73" cy="66" rx="4.5" ry="2.6" fill="#ff8fb1" opacity=".75"/>' : '';
    const glasses = o.accessory === 'glasses' && mood !== 'cool'
      ? '<circle cx="38" cy="55" r="11" fill="none" stroke="#222" stroke-width="3"/><circle cx="62" cy="55" r="11" fill="none" stroke="#222" stroke-width="3"/><path d="M49 55 H51" stroke="#222" stroke-width="3"/>' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="zm-svg zm-classico zm-${mood}" aria-hidden="true">${antenna}`
      + `<rect x="12" y="24" width="76" height="64" rx="26" fill="${body}"/>`
      + `<rect x="13" y="25" width="74" height="30" rx="24" fill="#fff" opacity=".18"/>`
      + `<rect x="21" y="36" width="58" height="42" rx="18" fill="${visor}"/>`
      + `<g class="zm-eyes">${eyePairClassic(o.eyeShape, eyes, mood)}</g>${mouthClassic(mood, eyes)}${cheeks}${glasses}`
      + `<g class="zm-acc">${accessoryClassic(o.accessory, body)}</g><circle class="zm-fly" cx="-20" cy="-20" r="2.2" fill="#222" opacity="0"/></svg>`;
  }

  function svg(opts, mood = 'idle') {
    const o = opts || {};
    const m = MOODS[mood] ? mood : 'idle';
    let out = o.style === 'classico' ? svgClassic(o, m) : svgNovo(o, m, ++uid);
    // compacto: só a cabeça (para o entalho pequeno no topo da tela)
    if (o.compact && o.style !== 'classico') out = out.replace('viewBox="0 0 100 100"', 'viewBox="11 -1 78 76"');
    return out;
  }

  // Coloca o desenho num elemento sem usar innerHTML (o SVG é lido como XML e copiado para a página).
  function render(el, opts, mood) {
    const doc = new root.DOMParser().parseFromString(svg(opts, mood), 'image/svg+xml');
    const node = el.ownerDocument.importNode(doc.documentElement, true);
    el.replaceChildren(node);
    return node;
  }

  const live = new Set();
  // Monta o mascote num elemento e cuida de piscar, olhar para o mouse e brincar quando parado.
  function mount(el, opts) {
    let o = { ...(opts || {}) };
    let mood = 'idle';
    let look = { x: 0, y: 0 };
    let lastActivity = Date.now();
    let playing = false;

    function draw() {
      render(el, o, mood);
      el.classList.add('zm-host');
      el.classList.toggle('zm-anim', o.animations !== false);
      el.classList.toggle('zm-blink', o.blink !== false && o.animations !== false);
      applyLook();
    }
    function applyLook() {
      const g = el.querySelector('.zm-eyes');
      const k = o.style === 'classico' ? 1 : 0.62;
      if (g) g.setAttribute('transform', `translate(${(look.x * k).toFixed(1)} ${(look.y * k).toFixed(1)})`);
    }
    function lookAt(dx, dy, strength = 1) {
      const k = Math.max(0, Number(o.follow == null ? 1 : o.follow)) * strength;
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / 400) * 4.5 * k;
      look = { x: (dx / d) * m, y: Math.max(-3, Math.min(3, (dy / d) * m)) };
      applyLook();
    }
    function setMood(m) {
      if (m !== 'sleeping') lastActivity = Date.now();
      const next = MOODS[m] ? m : 'idle';
      if (next === mood) return;
      mood = next;
      draw();
      if (o.animations !== false) { el.classList.remove('zm-swap'); void el.offsetWidth; el.classList.add('zm-swap'); }
    }
    // Brincadeira: uma mosquinha passa e os olhos acompanham.
    function playFly() {
      if (playing || mood !== 'idle' || o.play === false || o.animations === false) return;
      playing = true;
      const fly = el.querySelector('.zm-fly');
      const t0 = performance.now();
      const step = (now) => {
        const t = (now - t0) / 3200;
        if (t >= 1 || mood !== 'idle') { if (fly) { fly.setAttribute('cx', '-20'); fly.setAttribute('opacity', '0'); } playing = false; return; }
        const x = 10 + 80 * t;
        const y = 20 + Math.sin(t * Math.PI * 6) * 10;
        if (fly) { fly.setAttribute('cx', x.toFixed(1)); fly.setAttribute('cy', y.toFixed(1)); fly.setAttribute('opacity', '1'); }
        look = { x: ((x - 50) / 50) * 4.5, y: ((y - 45) / 40) * 3 };
        applyLook();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    const idleTimer = setInterval(() => {
      if (!el.isConnected) { inst.destroy(); return; } // a tela foi redesenhada: este mascote saiu da página
      if (o.play === false || o.animations === false) return;
      const idleFor = Date.now() - lastActivity;
      if (mood === 'idle' && idleFor > 10 * 60000) { mood = 'sleeping'; draw(); return; }
      if (mood === 'idle' && Math.random() < 0.12) playFly();
    }, 15000);

    draw();
    const inst = {
      el,
      setMood,
      get mood() { return mood; },
      get opts() { return o; },
      setOpts(n) { o = { ...o, ...(n || {}) }; draw(); },
      lookAt,
      poke() { lastActivity = Date.now(); if (mood === 'sleeping') { mood = 'idle'; draw(); } },
      play: playFly,
      destroy() { clearInterval(idleTimer); live.delete(inst); },
    };
    live.add(inst);
    return inst;
  }

  // Os olhos de todos os mascotes visíveis seguem o ponteiro dentro da janela.
  function followPointer(x, y) {
    for (const m of live) {
      if (!m.el.isConnected) { live.delete(m); continue; }
      const r = m.el.getBoundingClientRect();
      if (!r.width) continue;
      m.lookAt(x - (r.left + r.width / 2), y - (r.top + r.height * 0.4), 0.9);
    }
  }
  if (root.addEventListener) {
    let raf = 0; let px = 0; let py = 0;
    root.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = root.requestAnimationFrame(() => { raf = 0; followPointer(px, py); }); }, { passive: true });
  }

  // Configuração antiga (corpo branco e olhos verdes de fábrica) passa para o visual novo.
  function upgrade(m) {
    const x = { ...(m || {}) };
    if (!x.style) {
      x.style = 'novo';
      if ((!x.body || x.body === '#e9ecf5') && (!x.eyes || x.eyes === '#8bdc4f')) { x.body = DEFAULTS.body; x.eyes = DEFAULTS.eyes; x.visor = DEFAULTS.visor; if (!x.eyeShape || x.eyeShape === 'round') x.eyeShape = 'arco'; }
    }
    return x;
  }

  const api = { svg, render, mount, upgrade, shade, MOODS, STYLES, SHAPES, ACCESSORIES, PALETTE, DEFAULTS, live };
  root.ZenoMascot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
