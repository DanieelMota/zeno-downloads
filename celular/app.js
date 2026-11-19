/* Zeno no celular (PWA). Fala com o Zeno do computador pela nuvem (Supabase).
* Sem frameworks: tudo é montado com h() e texto puro (nunca HTML montado com dados da nuvem). */
(function () {
  'use strict';

  var CFG = {
    // 1.9.12: cada assinante entra com a conta da compra (e-mail + código do pedido) e vê só o próprio PC
    url: 'https://rpembmhynbnywmmlrezv.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwZW1ibWh5bmJueXdtbWxyZXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDg0MjcsImV4cCI6MjExMDA4NDQyN30.vE8NRIK1OoV6pKYhXURpwjT7yD6q8mPpbGA3xHt2DKA',
    conta: 'https://rpembmhynbnywmmlrezv.supabase.co/functions/v1/zeno-licencas/conta',
    vapid: 'BPVoIM6xQmDAbOv4bXvF2ba9D79aHkYR8uphX1uj9UKJAMZm2FopE_hxu0uzy4gq-ji9_mmBu55JKAS2GhAjXSA', // chave pública do Web Push
  };
  var MAX_FILE = 25 * 1024 * 1024;
  var CONFIRM_TTL = 125000;
  var PC_ONLINE_MS = 100000;

  // ---------- utilidades ----------
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(el, k); }); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* cheio */ } },
  };
  function uuid() { return (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function today() { var d = new Date(); var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function safeName(n) { return String(n || 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.{2,}/g, '_').slice(0, 100); }
  var toastT;
  function toast(text) {
    var t = document.getElementById('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function hhmm(ts) { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

  // ---------- nuvem ----------
  var sb = ZenoSB.createClient({
    url: CFG.url, key: CFG.key,
    storage: {
      get: function () { try { return localStorage.getItem('zeno.sessao2'); } catch (_) { return null; } },
      set: function (v) { try { if (v) localStorage.setItem('zeno.sessao2', v); else localStorage.removeItem('zeno.sessao2'); } catch (_) { /* ok */ } },
    },
  });
  var DEV = LS.get('zeno.device', null);
  if (!DEV) { DEV = uuid(); LS.set('zeno.device', DEV); }

  // ---------- estado ----------
  var S = {
    tab: 'chat', pcOnline: false, pcSeen: 0, msgs: LS.get('zeno.msgs', []), alerts: LS.get('zeno.alerts', []), inbox: LS.get('zeno.inbox', []),
    tasks: [], memory: [], routines: [], shortcuts: [], notes: [], waiting: [], projects: [], painel: [], listTab: 'tasks', confirms: [], answered: LS.get('zeno.answered', []),
    speak: LS.get('zeno.speak', false), loc: LS.get('zeno.loc', false), since: null, unread: 0, listening: false, busy: 0,
  };
  var pend = {}; // id do pedido -> como mostrar a resposta
  var seenSync = {}; // chave -> updated_at já aplicado
  var tickN = 0;
  var app = document.getElementById('app');
  var views, chatBox, tabsEl, topPill, composerTa, micBtn;
  // 1.3: o mascote do Zeno (mesmo desenho do computador) no topo, no login e na conversa vazia
  var ZM = window.ZenoMascot;
  var MASC = { o: ZM ? ZM.DEFAULTS : null, top: null, back: null };
  function mascotEl(cls, mood) {
    var el = h('div', { class: 'zmasc ' + (cls || '') });
    if (ZM) { var m = ZM.mount(el, Object.assign({}, MASC.o, { follow: 0.6 })); m.setMood(mood || 'idle'); el.zm = m; }
    return el;
  }
  function botMood(m, ms) {
    if (!MASC.top || !MASC.top.zm) return;
    clearTimeout(MASC.back);
    MASC.top.zm.setMood(m);
    if (ms) MASC.back = setTimeout(function () { botMood(S.pcOnline ? 'idle' : 'sleeping'); }, ms);
  }

  function saveMsgs() { LS.set('zeno.msgs', S.msgs.slice(-80)); }

  // ---------- login ----------
  // 1.9.12: a conta é a da compra. Nada de senha: e-mail + código do pedido (o mesmo da licença no PC).
  var SO = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : '';
  var instalado = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); pedidoInstalar = ev; var b = document.getElementById('instalarBtn'); if (b) b.hidden = false; });
  function dicaInstalar() {
    if (instalado) return null;
    if (SO === 'ios') return h('p', { class: 'hint', text: 'Depois de entrar, toque em Compartilhar ⬆︎ › Adicionar à Tela de Início para ter o Zeno como app.' });
    var btn = h('button', { class: 'btn alt', id: 'instalarBtn', hidden: !pedidoInstalar, onclick: function () { if (pedidoInstalar) { pedidoInstalar.prompt(); pedidoInstalar = null; btn.hidden = true; } } }, 'Instalar o app');
    return h('div', { class: 'stack' }, btn, h('p', { class: 'hint', text: 'No Chrome: menu ⋮ › Instalar app (ou Adicionar à tela inicial).' }));
  }
  // 1.9.13: o login fica salvo. A sessão mora no aparelho e, se ela se perder (o iPhone limpou, o token venceu),
  // o app entra de novo sozinho com o e-mail + código guardados aqui. Só "Sair" apaga.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) { /* opcional */ }
  async function pedirSessao(e, p) {
    var r = await fetch(CFG.conta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, pedido: p }) });
    var j = await r.json().catch(function () { return {}; });
    if (!j.ok || !j.sessao) { var err = new Error(j.mensagem || 'Não consegui entrar. Tente de novo.'); err.codigo = j.codigo || ''; throw err; }
    sb.auth.setSession(j.sessao);
    LS.set('zeno.conta', { e: e, p: p });
  }
  async function reentrar() {
    var c = LS.get('zeno.conta', null);
    if (!c || !c.e || !c.p) return false;
    try { await pedirSessao(c.e, c.p); return true; }
    catch (err) {
      if (/nao_encontrada|inativa|bloqueada/.test(err.codigo)) LS.set('zeno.conta', null); // compra cancelada: aí sim pede de novo
      return false;
    }
  }
  function renderLogin(msg, kind) {
    clear(app);
    var email = h('input', { type: 'email', placeholder: 'e-mail da compra', autocomplete: 'email', autocapitalize: 'off', value: LS.get('zeno.email', '') });
    var pedido = h('input', { type: 'text', placeholder: 'código do pedido (ex.: ZENO-…)', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
    var note = h('p', { class: 'hint ' + (kind || '') }, msg || '');
    var botao = h('button', { class: 'btn', onclick: function () { go(); } }, 'Entrar');
    var go = async function () {
      var e = email.value.trim(); var p = pedido.value.trim();
      if (!e || !p) { note.textContent = 'Digite o e-mail e o código do pedido.'; note.className = 'hint err'; return; }
      note.textContent = 'Entrando…'; note.className = 'hint'; botao.disabled = true;
      try {
        LS.set('zeno.email', e);
        await pedirSessao(e, p);
        start();
      } catch (err) { note.textContent = /Failed to fetch|NetworkError/i.test(err.message) ? 'Sem internet. Confira a conexão e tente de novo.' : err.message; note.className = 'hint err'; botao.disabled = false; }
    };
    pedido.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    app.append(h('div', { class: 'login' },
      mascotEl('big', 'happy'), h('h1', { text: 'Zeno' }),
      h('p', { text: 'Entre com o e-mail da compra e o código do pedido. Eles aparecem no Zeno do computador, em Ajustes › Celular.' }),
      email, pedido, note,
      h('div', { class: 'row' }, botao),
      dicaInstalar()));
  }

  // 1.6: volta do Google. O endereço do app (sem ?code) precisa estar nas Redirect URLs do Supabase.
  function backUrl() { return location.origin + location.pathname; }
  function googleG() {
    var NS = 'http://www.w3.org/2000/svg'; var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('class', 'g-ic'); s.setAttribute('aria-hidden', 'true');
    [['M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z', '#FFC107'],
      ['M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z', '#FF3D00'],
      ['M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z', '#4CAF50'],
      ['M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z', '#1976D2']].forEach(function (x) {
      var p = document.createElementNS(NS, 'path'); p.setAttribute('d', x[0]); p.setAttribute('fill', x[1]); s.append(p);
    });
    return s;
  }
  async function finishGoogle() {
    var q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return false;
    history.replaceState(null, '', backUrl()); // tira o código do endereço
    var verifier = LS.get('zeno.pkce', ''); LS.set('zeno.pkce', '');
    if (q.has('error')) { renderLogin(/access_denied/.test(q.get('error')) ? 'Login cancelado.' : (q.get('error_description') || q.get('error')), 'err'); return true; }
    try { await sb.auth.exchangeCode(q.get('code'), verifier); start(); }
    catch (err) { renderLogin(err.message, 'err'); }
    return true;
  }

  // ---------- estrutura principal ----------
  // 1.12: ícones desenhados (traço fino) no lugar dos emojis; Arquivos foi para dentro de "Mais" e entrou o Dinheiro
  var ICONES = {
    chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z',
    day: 'M7 3v3M17 3v3M4.5 8.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 12.5h3v3H8z',
    fin: 'M3.5 7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5zM3.5 10h17M15.5 14.5h2',
    lists: 'M9 6.5h11M9 12h11M9 17.5h11M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2',
    ctl: 'M5 4v6M5 14v6M12 4v3M12 11v9M19 4v9M19 17v3M3 10h4M10 7h4M17 13h4',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    files: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  };
  function icone(id) {
    var NS = 'http://www.w3.org/2000/svg'; var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONES[id] || ICONES.more); s.append(p); return s;
  }
  var TABS = [['chat', 'Conversa'], ['day', 'Hoje'], ['fin', 'Dinheiro'], ['lists', 'Listas'], ['ctl', 'Controle'], ['more', 'Mais']];
  function buildShell() {
    clear(app);
    topPill = h('div', { class: 'pill' }, h('i'), h('span', { text: '…' }));
    views = h('div', { class: 'views' });
    tabsEl = h('div', { class: 'tabs' });
    TABS.forEach(function (t) {
      tabsEl.append(h('button', { 'data-tab': t[0], 'aria-label': t[1], onclick: function () { go(t[0]); } }, h('span', { class: 'tab-ic' }, icone(t[0])), h('em', { text: t[1] })));
    });
    MASC.top = mascotEl('logo', 'idle');
    MASC.top.addEventListener('click', function () { botMood(['love', 'laugh', 'cool', 'surprised'][Math.floor(Math.random() * 4)], 1800); });
    var hora = new Date().getHours(); var oi = hora < 5 ? 'Boa noite' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    app.append(h('div', { class: 'top' }, MASC.top, h('div', { class: 'top-t' }, h('span', { class: 'top-sub', id: 'topSub', text: oi + ' 👋' }), h('h1', { id: 'topTitulo', text: 'Zeno' })), topPill), h('div', { id: 'bannerSlot' }), views, tabsEl);
    buildChat();
    go(S.tab);
  }
  function updateTabs() {
    Array.prototype.forEach.call(tabsEl.children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === S.tab);
      var old = b.querySelector('.badge'); if (old) old.remove();
      if (b.getAttribute('data-tab') === 'chat' && S.unread > 0 && S.tab !== 'chat') b.append(h('div', { class: 'badge', text: String(S.unread) }));
    });
  }
  function updateTop() {
    topPill.className = 'pill ' + (S.pcOnline ? 'on' : 'off');
    topPill.lastChild.textContent = S.pcOnline ? 'PC conectado' : 'PC desligado';
    if (MASC.top && MASC.top.zm && ['idle', 'sleeping'].indexOf(MASC.top.zm.mood) >= 0) MASC.top.zm.setMood(S.pcOnline ? 'idle' : 'sleeping');
    var slot = document.getElementById('bannerSlot');
    if (!slot) return;
    clear(slot);
    if (!S.pcOnline) slot.append(h('div', { class: 'banner' }, S.pcSeen ? 'O computador está desligado (visto às ' + hhmm(S.pcSeen) + '). Pedidos ficam guardados por 1 hora e rodam quando ele ligar.' : 'O Zeno do computador ainda não apareceu. Abra o Zeno no PC e entre com esta mesma conta.'));
  }
  function go(tab) {
    S.tab = tab;
    setTimeout(function () { beat(); if (tab === 'ctl') pollPlayer().catch(function () { /* próximo ciclo */ }); }, 0);
    if (tab === 'chat') S.unread = 0;
    updateTabs();
    Array.prototype.forEach.call(views.children, function (v) { v.hidden = true; });
    if (tab === 'chat') { var tt0 = document.getElementById('topTitulo'); if (tt0) tt0.textContent = 'Zeno'; chatBox.hidden = false; scrollChat(); return; }
    renderView();
  }
  var viewEl = null;
  function renderView() {
    if (S.tab === 'chat') return;
    if (DAYLIVE.t) { clearInterval(DAYLIVE.t); DAYLIVE.t = null; }
    if (viewEl) viewEl.remove();
    viewEl = h('div', { class: 'view' });
    var fn = { ctl: viewControl, day: viewDay, lists: viewLists, files: viewFiles, more: viewMore, fin: viewFin }[S.tab];
    var tt = document.getElementById('topTitulo'); if (tt) tt.textContent = { chat: 'Zeno', day: 'Hoje', fin: 'Dinheiro', lists: 'Listas', ctl: 'Controle', more: 'Mais', files: 'Arquivos' }[S.tab] || 'Zeno';
    fn(viewEl);
    views.append(viewEl);
  }
  function typing() { var a = document.activeElement; return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && viewEl && viewEl.contains(a)); }
  function refreshView() { if (S.tab !== 'chat' && !typing()) { var y = viewEl ? viewEl.scrollTop : 0; renderView(); if (viewEl) viewEl.scrollTop = y; } }

  // ---------- conversa ----------
  var SUGGEST = ['O que está tocando?', 'Resumo do meu dia', 'Modo foco de 25 minutos', 'Como está meu PC?', 'Me lembra de beber água em 30 minutos'];
  function buildChat() {
    var list = h('div', { class: 'msgs', id: 'msgs' });
    composerTa = h('textarea', { rows: '1', placeholder: 'Fale com o Zeno…', enterkeyhint: 'send' });
    composerTa.addEventListener('input', function () { composerTa.style.height = 'auto'; composerTa.style.height = Math.min(120, composerTa.scrollHeight) + 'px'; });
    composerTa.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    micBtn = h('button', { class: 'round mic', 'aria-label': 'Falar', onclick: toggleMic }, '🎤');
    chatBox = h('div', { class: 'view chat', hidden: true }, list,
      h('div', { class: 'composer' }, micBtn, composerTa, h('button', { class: 'round', 'aria-label': 'Enviar', onclick: function () { submit(); } }, '➤')));
    views.append(chatBox);
    drawChat();
  }
  function drawChat() {
    var list = document.getElementById('msgs');
    clear(list);
    if (!S.msgs.length && !S.confirms.length) {
      list.append(h('div', { class: 'empty' }, mascotEl('big', 'happy'), h('b', { class: 'hi', text: 'Oi! Eu sou o Zeno.' }), 'Peça o que quiser, como se estivesse na frente do PC.',
        h('div', { class: 'chips' }, SUGGEST.map(function (s) { return h('button', { class: 'chip', onclick: function () { submit(s); } }, s); }))));
      return;
    }
    S.msgs.forEach(function (m) { list.append(bubble(m)); });
    S.confirms.forEach(function (c) { list.append(confirmCard(c)); });
    scrollChat();
  }
  function bubble(m) {
    var el = h('div', { class: 'bub ' + m.who + (m.wait ? ' wait' : ''), 'data-id': m.id || '' });
    if (m.wait) el.append(h('span', { class: 'dots' }, h('span'), h('span'), h('span')));
    else el.textContent = m.text;
    if (m.who === 'bot' && !m.wait && Array.isArray(m.acoes) && m.acoes.length) {
      var box = h('div', { class: 'acoes' });
      m.acoes.forEach(function (a) {
        if (!ACOES_OK.test(a.url)) return;
        var b = h('a', { class: 'btn sm acao', href: a.url, rel: 'noopener noreferrer', target: /^https/.test(a.url) ? '_blank' : null }, a.rotulo || 'Abrir');
        b.addEventListener('click', function (ev) { ev.stopPropagation(); });
        box.append(b);
      });
      el.append(box);
    }
    if (m.who === 'bot' && !m.wait) el.addEventListener('click', function () { speakText(m.text, true); });
    return el;
  }
  function scrollChat() { var l = document.getElementById('msgs'); if (l) requestAnimationFrame(function () { l.scrollTop = l.scrollHeight; }); }
  // 1.14: botões prontos que o PC deixa no fim da resposta (⟦link|rótulo⟧): ligar, SMS, WhatsApp, YouTube, Spotify, Mapas.
  // Só os tipos desta lista viram botão; qualquer outra coisa é ignorada.
  var ACOES_OK = /^(tel:[+\d*#]{3,20}|sms:[+\d]{3,20}(\?body=[^\s⟦⟧|]{0,1500})?|https:\/\/wa\.me\/\d{10,15}(\?text=[^\s⟦⟧|]{0,1500})?|whatsapp:\/\/send\?[^\s⟦⟧|]{1,1600}|https:\/\/(www\.|m\.|music\.)?youtube\.com\/[^\s⟦⟧|]{0,300}|https:\/\/youtu\.be\/[^\s⟦⟧|]{1,100}|https:\/\/open\.spotify\.com\/[^\s⟦⟧|]{0,300}|spotify:[a-z]+:[A-Za-z0-9]{1,40}|https:\/\/(www\.)?google\.com\/maps\/[^\s⟦⟧|]{0,400}|geo:[-\d.,]{3,40}(\?q=[^\s⟦⟧|]{0,200})?|tg:\/\/resolve\?domain=[A-Za-z0-9_]{3,40}|instagram:\/\/app)$/;
  function separaAcoes(text) {
    var acoes = [];
    var limpo = String(text == null ? '' : text).replace(/⟦([^|⟧]*)\|([^⟧]*)⟧/g, function (_m, url, rotulo) {
      if (ACOES_OK.test(url) && acoes.length < 4) acoes.push({ url: url, rotulo: String(rotulo).slice(0, 60) || 'Abrir' });
      return '';
    }).replace(/⟦[^⟧]*⟧/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return { texto: limpo, acoes: acoes };
  }
  function semMarcas(text) { return separaAcoes(text).texto; }

  // 1.14: onde o celular está (só se o usuário ligou "Compartilhar localização"; vai junto do pedido quando a pergunta é sobre lugar)
  var PEDE_LUGAR = /\b(onde|perto|aqui|daqui|rota|caminho|chegar|transito|trânsito|clima|tempo|estou|pertinho|proximo|próximo)\b/i;
  function posicao() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      var feito = false;
      var fim = function (v) { if (!feito) { feito = true; resolve(v); } };
      setTimeout(function () { fim(null); }, 7000);
      try {
        navigator.geolocation.getCurrentPosition(function (p) { fim({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); }, function () { fim(null); }, { enableHighAccuracy: false, maximumAge: 120000, timeout: 6000 });
      } catch (_) { fim(null); }
    });
  }

  function pushMsg(m) {
    if (m.who === 'bot' && !m.wait && m.text && m.text.indexOf('⟦') >= 0) { var sp = separaAcoes(m.text); m.text = sp.texto; m.acoes = sp.acoes; }
    m.at = Date.now();
    S.msgs.push(m);
    if (S.msgs.length > 80) S.msgs.shift();
    saveMsgs();
    if (S.tab !== 'chat' && m.who === 'bot') S.unread++;
    drawChat(); updateTabs();
  }
  function confirmCard(c) {
    var q = function (allow) { return async function () {
      S.confirms = S.confirms.filter(function (x) { return x.id !== c.id; });
      S.answered.push(c.id); LS.set('zeno.answered', S.answered.slice(-60));
      drawChat();
      try { await cmd('confirm', { id: c.id, allow: allow }, { ttl: 120 }); toast(allow ? 'Autorizado ✔' : 'Negado ✖'); } catch (e) { toast(e.message); }
    }; };
    return h('div', { class: 'confirm' }, h('b', { text: '⚠️ ' + c.title }), h('p', { text: c.body || '' }),
      h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: q(true) }, 'Permitir'), h('button', { class: 'btn alt', onclick: q(false) }, 'Negar')));
  }

  async function cmd(kind, payload, extra) {
    var p = Object.assign({ ttl: 3600 }, payload || {}, extra || {});
    var r = await sb.db.insert('zeno_commands', { from_device: DEV, kind: kind, payload: p });
    return Array.isArray(r) ? r[0] : r;
  }
  async function submit(text, viaVoice) {
    text = String(text != null ? text : composerTa.value).trim();
    if (!text) return;
    composerTa.value = ''; composerTa.style.height = 'auto';
    if (S.tab !== 'chat') go('chat');
    pushMsg({ who: 'me', text: text.slice(0, 2000) });
    var wait = { who: 'bot', wait: true, id: 'w' + Date.now() };
    pushMsg(wait);
    botMood('thinking');
    try {
      var extra = {};
      if (S.loc && PEDE_LUGAR.test(text)) { var pos = await posicao(); if (pos) extra.loc = pos; }
      var c = await cmd('ask', Object.assign({ text: text.slice(0, 2000) }, extra));
      pend[c.id] = { mode: 'chat', waitId: wait.id, voice: !!viaVoice };
      if (!S.pcOnline) pushSys('O PC está desligado. Guardei o pedido: ele responde quando ligar (vale por 1 hora).');
    } catch (e) {
      dropWait(wait.id);
      botMood('crying', 2500);
      pushMsg({ who: 'sys', text: e.offline ? 'Sem internet. Tente de novo quando voltar.' : 'Não consegui enviar: ' + e.message });
    }
  }
  function pushSys(text) { pushMsg({ who: 'sys', text: text }); }
  function dropWait(id) { S.msgs = S.msgs.filter(function (m) { return m.id !== id; }); saveMsgs(); }

  // ---------- voz ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  function toggleMic() {
    if (!SR) { toast('Este navegador não tem ditado aqui. Use o 🎤 do teclado.'); composerTa.focus(); return; }
    if (S.listening && rec) { rec.stop(); return; }
    try {
      rec = new SR();
      rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
      var finalText = '';
      rec.onresult = function (ev) {
        var t = '';
        for (var i = 0; i < ev.results.length; i++) { t += ev.results[i][0].transcript; if (ev.results[i].isFinal) finalText = t; }
        composerTa.value = t;
      };
      rec.onerror = function (ev) { toast(ev.error === 'not-allowed' ? 'Libere o microfone nos ajustes do Safari para falar.' : 'Não consegui ouvir (' + ev.error + ').'); };
      rec.onend = function () {
        S.listening = false; micBtn.classList.remove('rec'); micBtn.textContent = '🎤'; botMood(S.pcOnline ? 'idle' : 'sleeping');
        var t = (finalText || composerTa.value).trim();
        if (t) submit(t, true);
      };
      rec.start();
      S.listening = true; micBtn.classList.add('rec'); micBtn.textContent = '⏹'; botMood('listening');
      go('chat');
    } catch (e) { toast('Não consegui abrir o microfone.'); }
  }
  function speakText(text, force) {
    if (!(S.speak || force) || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(semMarcas(text).slice(0, 600)); u.lang = 'pt-BR'; speechSynthesis.speak(u); } catch (_) { /* sem voz */ }
  }

  // ---------- controle ----------
  async function tool(name, args, label, quiet) {
    try {
      var c = await cmd('tool', { name: name, args: args || {} }, name === 'power' ? { ttl: 120 } : quiet ? { ttl: 60 } : {});
      pend[c.id] = { mode: quiet ? 'quiet' : name === 'screenshot' ? 'shot' : 'toast' };
      if (!quiet) toast(S.pcOnline ? (label || 'Enviado ao PC…') : 'PC desligado: guardei o pedido por 1 hora.');
      else if (!S.pcOnline) toast('PC desligado.');
    } catch (e) { toast(e.offline ? 'Sem internet.' : e.message); }
  }
  function tile(icon, label, fn) { return h('button', { class: 'tile', onclick: fn }, h('span', { text: icon }), label); }
  function sliderRow(label, init, onset) {
    var out = h('b', { text: init + '%' });
    var r = h('input', { type: 'range', min: '0', max: '100', value: String(init), 'aria-label': label });
    r.addEventListener('input', function () { out.textContent = r.value + '%'; });
    r.addEventListener('change', function () { onset(+r.value); });
    return h('div', { class: 'slider' }, h('span', { text: label }), r, out);
  }
  function viewControl(el) {
    var play = h('input', { type: 'text', placeholder: 'Música, artista ou playlist', enterkeyhint: 'go' });
    var doPlay = function () { var q = play.value.trim(); if (q) { tool('spotify_play', { query: q }, 'Procurando no Spotify…'); play.value = ''; } };
    play.addEventListener('keydown', function (e) { if (e.key === 'Enter') doPlay(); });
    var openT = h('input', { type: 'text', placeholder: 'Programa, pasta ou site', autocapitalize: 'off', enterkeyhint: 'go' });
    var doOpen = function () { var q = openT.value.trim(); if (q) { tool('open_app', { target: q }, 'Abrindo…'); openT.value = ''; } };
    openT.addEventListener('keydown', function (e) { if (e.key === 'Enter') doOpen(); });
    var remLabel = h('input', { type: 'text', placeholder: 'Lembrar de… (opcional)' });
    var remind = function (sec) { tool('timer_set', { seconds: sec, label: remLabel.value.trim() }, 'Lembrete criado'); remLabel.value = ''; };
    el.append(
      playerCard(),
      h('div', { class: 'sec', text: 'Spotify' }),
      h('div', { class: 'card' },
        sliderRow('🔊', 50, function (v) { tool('spotify_control', { action: 'volume', value: v }, 'Volume do Spotify ' + v + '%'); }),
        h('div', { class: 'add', style: 'margin-top:10px' }, play, h('button', { class: 'btn sm', onclick: doPlay }, 'Tocar'))),
      h('button', { class: 'remote-btn', onclick: openRemote }, h('span', { text: '🖥️' }), h('div', {}, h('b', { text: 'Controlar o PC' }), h('div', { class: 'muted small', text: 'Ver a tela ao vivo, tocar, rolar e digitar' }))),
      h('div', { class: 'sec', text: 'Computador' }),
      h('div', { class: 'card' },
        sliderRow('🔈', 40, function (v) { tool('pc_volume', { action: 'set', value: v }, 'Volume do PC ' + v + '%'); }),
        h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn alt sm', onclick: function () { tool('pc_volume', { action: 'mute' }); } }, '🔇 Mudo'), h('button', { class: 'btn alt sm', onclick: function () { tool('media_key', { action: 'playpause' }); } }, '⏯ Mídia'))),
      h('div', { class: 'grid' },
        tile('📸', 'Ver a tela', function () { tool('screenshot', {}, 'Tirando foto da tela…'); }),
        tile('🩺', 'Verificar o PC', function () { tool('pc_checkup', {}, 'Verificando…'); }),
        tile('🧹', 'Limpar temporários', function () { tool('clean_temp', {}, 'Limpando…'); }),
        tile('⚡', 'Liberar memória', function () { tool('free_memory', {}, 'Liberando…'); }),
        tile('ℹ️', 'Info do PC', function () { tool('system_info', {}); }),
        tile('💧', '+1 copo d’água', function () { tool('water_add', { cups: 1 }); })),
      h('div', { class: 'sec', text: 'Abrir no PC' }),
      h('div', { class: 'card' }, h('div', { class: 'add', style: 'margin:0' }, openT, h('button', { class: 'btn sm', onclick: doOpen }, 'Abrir'))),
      h('div', { class: 'sec', text: 'Lembrete' }),
      h('div', { class: 'card' }, remLabel,
        h('div', { class: 'chips', style: 'margin-top:10px' }, [['5 min', 300], ['15 min', 900], ['30 min', 1800], ['1 hora', 3600], ['2 horas', 7200]].map(function (x) { return h('button', { class: 'chip', onclick: function () { remind(x[1]); } }, x[0]); }))),
      h('div', { class: 'sec', text: 'Energia (pede confirmação aqui no celular)' }),
      h('div', { class: 'grid' },
        tile('🔒', 'Bloquear', function () { tool('power', { action: 'lock' }); }),
        tile('😴', 'Suspender', function () { tool('power', { action: 'sleep' }); }),
        tile('🔄', 'Reiniciar', function () { tool('power', { action: 'restart' }); }),
        tile('⏻', 'Desligar', function () { tool('power', { action: 'shutdown' }); })),
      h('button', { class: 'btn alt', style: 'width:100%;margin-top:10px', onclick: function () { tool('power', { action: 'cancel' }); } }, '✋ Cancelar desligamento'));
  }

  // ---------- "estou olhando": o PC só envia o player/a tela enquanto o celular está com eles abertos ----------
  var VW = { player: false, screen: false, at: 0 };
  async function beat(force) {
    var vis = document.visibilityState === 'visible';
    var w = { player: vis && S.tab === 'ctl' && !RC.open, screen: vis && RC.open };
    var changed = w.player !== VW.player || w.screen !== VW.screen;
    var now = Date.now();
    if (!changed && (!(w.player || w.screen) || (!force && now - VW.at < 7000))) return;
    VW = { player: w.player, screen: w.screen, at: now };
    try { await sb.db.upsert('zeno_live', { key: 'viewer', value: { player: w.player, screen: w.screen }, seq: now }, 'user_id,key'); } catch (e) { VW.at = 0; }
  }

  // ---------- ícones (SVG fixo, nunca montado com dados) ----------
  function ico(inner, fill) {
    var d = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>', 'image/svg+xml');
    return document.importNode(d.documentElement, true);
  }
  var IC = {
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    prev: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
    next: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play: '<polygon points="7 4 20 12 7 20 7 4"/>',
    plus: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  };
  function spotifyLogo() {
    var d = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1ed760"/><g fill="none" stroke="#000" stroke-linecap="round" stroke-width="1.7"><path d="M5.6 8.9c4.2-1.2 8.9-.8 12.8 1.5"/><path d="M6.2 12.2c3.5-1 7.4-.7 10.7 1.2"/><path d="M6.8 15.2c2.9-.8 5.9-.6 8.6.9"/></g></svg>', 'image/svg+xml');
    var el = document.importNode(d.documentElement, true); el.setAttribute('class', 'pl-logo'); return el;
  }

  // ---------- player do Spotify (capa do álbum, barra com onda, controles) ----------
  var PL = { v: null, at: 0, upd: '', el: null, R: null, hue: 100, img: '', seeking: null, raf: 0, timers: [], colorTried: false };
  var COVER_OK = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//i;
  function fmtTime(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function curPos() {
    var v = PL.v; if (!v || !v.on) return 0;
    if (PL.seeking != null) return PL.seeking;
    var p = v.progress + (v.playing ? Math.max(0, Date.now() - PL.at) : 0);
    return Math.max(0, Math.min(v.duration || p, p));
  }
  function plAct(action, value) {
    tool('spotify_control', value === undefined ? { action: action } : { action: action, value: value }, null, true);
    bumpPlayer();
  }
  function bumpPlayer() {
    PL.timers.forEach(clearTimeout);
    PL.timers = [1200, 2600, 4500].map(function (ms) { return setTimeout(function () { pollPlayer().catch(function () { /* tenta no próximo */ }); }, ms); });
  }
  function plBtn(cls, icon, label, fn) { return h('button', { class: cls, 'aria-label': label, onclick: fn }, ico(IC[icon], icon === 'pause' || icon === 'play')); }
  function playerCard() {
    if (PL.el) { startPlayerAnim(); return PL.el; }
    var R = PL.R = {};
    R.bg = h('img', { class: 'pl-bg', alt: '', decoding: 'async' });
    R.dev = h('span', { class: 'pl-dev', text: 'Este computador' });
    R.tin = h('span', { class: 'pl-tin' });
    R.tw = h('div', { class: 'pl-tw' }, R.tin);
    R.artist = h('div', { class: 'pl-artist' });
    R.cv = h('canvas', { class: 'pl-cv' });
    R.thumb = h('div', { class: 'pl-thumb' });
    R.bar = h('div', { class: 'pl-bar' }, R.cv, R.thumb);
    R.cur = h('span', { text: '00:00' }); R.tot = h('span', { text: '00:00' });
    R.msg = h('div', { class: 'pl-msg', text: 'Buscando o que está tocando…' });
    R.shuf = plBtn('pl-b', 'shuffle', 'Aleatório', function () { var v = PL.v; if (!v || !v.on) return; v.shuffle = !v.shuffle; paintPlayer(); plAct('shuffle', v.shuffle); });
    R.prev = plBtn('pl-b big', 'prev', 'Anterior', function () { plAct('previous'); });
    R.play = plBtn('pl-b main', 'pause', 'Tocar ou pausar', function () {
      var v = PL.v;
      if (!v || !v.on) { plAct('resume'); return; }
      v.progress = curPos(); PL.at = Date.now(); v.playing = !v.playing; paintPlayer(); plAct(v.playing ? 'resume' : 'pause');
    });
    R.next = plBtn('pl-b big', 'next', 'Próxima', function () { plAct('next'); });
    R.like = plBtn('pl-b', 'plus', 'Curtir', function () {
      var v = PL.v; if (!v || !v.on) return;
      if (v.liked === true) v.liked = false; else if (v.liked === false) v.liked = true;
      paintPlayer(); plAct('like');
    });
    PL.el = h('div', { class: 'pl empty' }, R.bg, h('div', { class: 'pl-shade' }),
      h('div', { class: 'pl-top' }, R.dev, ico(IC.speaker)),
      h('div', { class: 'pl-title' }, spotifyLogo(), R.tw), R.artist, R.bar,
      h('div', { class: 'pl-times' }, R.cur, R.tot),
      h('div', { class: 'pl-ctl' }, R.shuf, R.prev, R.play, R.next, R.like), R.msg);
    // arrastar na barra = ir para outro ponto da música
    var posOf = function (e) { var r = R.bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ((PL.v && PL.v.duration) || 0); };
    R.bar.addEventListener('pointerdown', function (e) { if (!PL.v || !PL.v.on) return; try { R.bar.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } PL.seeking = posOf(e); });
    R.bar.addEventListener('pointermove', function (e) { if (PL.seeking != null) PL.seeking = posOf(e); });
    var endSeek = function (e) {
      if (PL.seeking == null) return;
      var ms = Math.round(posOf(e)); PL.seeking = null;
      PL.v.progress = ms; PL.at = Date.now();
      plAct('seek', ms);
    };
    R.bar.addEventListener('pointerup', endSeek);
    R.bar.addEventListener('pointercancel', function () { PL.seeking = null; });
    paintPlayer(); startPlayerAnim();
    return PL.el;
  }
  function setCover(url) {
    var R = PL.R;
    url = COVER_OK.test(url || '') ? url : '';
    if (url === PL.img) return;
    PL.img = url; PL.colorTried = false;
    if (!url) { R.bg.removeAttribute('src'); return; }
    R.bg.crossOrigin = 'anonymous'; // permite ler as cores da capa; se o servidor não deixar, tenta sem
    R.bg.onload = function () { sampleColor(); };
    R.bg.onerror = function () { if (!PL.colorTried) { PL.colorTried = true; R.bg.removeAttribute('crossorigin'); R.bg.src = url; } };
    R.bg.src = url;
  }
  function sampleColor() {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 12;
      var g = c.getContext('2d'); g.drawImage(PL.R.bg, 0, 0, 12, 12);
      var d = g.getImageData(0, 0, 12, 12).data; var r = 0, gr = 0, b = 0, w = 0;
      for (var i = 0; i < d.length; i += 4) { var mx = Math.max(d[i], d[i + 1], d[i + 2]); var mn = Math.min(d[i], d[i + 1], d[i + 2]); var k = (mx - mn) + 8; r += d[i] * k; gr += d[i + 1] * k; b += d[i + 2] * k; w += k; }
      r /= w; gr /= w; b /= w;
      var mx2 = Math.max(r, gr, b), mn2 = Math.min(r, gr, b), hue = 0;
      if (mx2 !== mn2) { var dd = mx2 - mn2; hue = mx2 === r ? ((gr - b) / dd) % 6 : mx2 === gr ? (b - r) / dd + 2 : (r - gr) / dd + 4; hue = Math.round(hue * 60); if (hue < 0) hue += 360; } else hue = 130;
      PL.hue = hue; paintColor();
    } catch (_) { /* sem permissão para ler a imagem: fica com a cor padrão */ }
  }
  function paintColor() {
    var R = PL.R; if (!R) return;
    var col = 'hsl(' + PL.hue + ',85%,62%)';
    R.thumb.style.background = col; R.thumb.style.boxShadow = '0 0 16px 3px hsla(' + PL.hue + ',90%,60%,.65)';
    PL.el.style.setProperty('--pl', col);
  }
  function paintPlayer() {
    var R = PL.R; var v = PL.v; if (!R) return;
    var live = !!(v && v.on);
    PL.el.classList.toggle('empty', !live);
    R.msg.textContent = !v ? (S.pcOnline ? 'Buscando o que está tocando…' : 'O PC está desligado.') : v.notConnected ? 'Conecte o Spotify no Zeno do PC (Ajustes > Conectar Spotify).' : v.error ? 'Spotify: ' + v.error : 'Nada tocando agora. Escolha uma música aqui embaixo ou no Spotify.';
    if (!live) return;
    setCover(v.image); paintColor();
    var title = v.name || 'Sem título';
    if (R.tin.getAttribute('data-t') !== title) {
      R.tin.setAttribute('data-t', title); R.tin.textContent = title; R.tw.classList.remove('marq');
      requestAnimationFrame(function () { // título comprido: rola de um lado para o outro
        if (R.tin.scrollWidth > R.tw.clientWidth + 2) { R.tin.textContent = title + '   •   ' + title + '   •   '; R.tw.classList.add('marq'); }
      });
    }
    R.artist.textContent = [v.artist, v.album].filter(Boolean).join(' · ');
    R.dev.textContent = v.device || 'Este computador';
    R.tot.textContent = fmtTime(v.duration);
    R.play.replaceChildren(ico(v.playing ? IC.pause : IC.play, true));
    R.shuf.classList.toggle('on', !!v.shuffle);
    R.like.classList.toggle('on', v.liked === true);
    R.like.replaceChildren(ico(v.liked === true ? IC.heart : IC.plus, v.liked === true));
  }
  function drawWave(ts) {
    var R = PL.R; var v = PL.v; var c = R.cv;
    var w = c.clientWidth; var hh = c.clientHeight; if (!w || !hh) return;
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    var pad = 8; var usable = w - pad * 2; var frac = v.duration ? Math.min(1, curPos() / v.duration) : 0; var tx = pad + frac * usable; var mid = hh - 9;
    g.lineCap = 'round'; g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.moveTo(pad, mid); g.lineTo(w - pad, mid); g.stroke();
    // onda colorida logo antes do ponto atual (mexe enquanto toca)
    var span = Math.min(usable * 0.5, 170); var t = ts / 1000; var amp = v.playing ? 17 : 6;
    var x0 = Math.max(pad, tx - span); var peak = tx - span * 0.38;
    var grad = g.createLinearGradient(x0, 0, tx, 0);
    [[-60, 0], [-15, .35], [30, .7], [85, 1]].forEach(function (s) { grad.addColorStop(s[1], 'hsla(' + ((PL.hue + s[0] + 360) % 360) + ',88%,64%,.95)'); });
    g.beginPath(); g.moveTo(x0, mid);
    for (var x = x0; x <= tx; x += 2) {
      var e = Math.exp(-Math.pow((x - peak) / (span * 0.42), 2));
      var y = mid - e * amp * (0.55 + 0.45 * Math.sin(x * 0.075 - t * 3.2)) * (0.7 + 0.3 * Math.sin(x * 0.031 + t * 1.7));
      g.lineTo(x, y);
    }
    g.lineTo(tx, mid); g.closePath(); g.globalAlpha = .9; g.fillStyle = grad; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(pad, mid); g.lineTo(tx, mid); g.stroke();
    R.thumb.style.left = tx + 'px';
  }
  function startPlayerAnim() {
    if (PL.raf) return;
    var last = 0;
    var step = function (ts) {
      if (!PL.el || !PL.el.isConnected) { PL.raf = 0; return; }
      PL.raf = requestAnimationFrame(step);
      var v = PL.v;
      if (!v || !v.on || document.visibilityState !== 'visible') return;
      if (ts - last < (v.playing ? 33 : 500)) return;
      last = ts;
      PL.R.cur.textContent = fmtTime(curPos());
      drawWave(ts);
    };
    PL.raf = requestAnimationFrame(step);
  }
  async function pollPlayer() {
    var rows = await sb.db.select('zeno_live', { key: 'eq.player', select: 'value,updated_at' });
    var r = rows && rows[0];
    if (!r || !r.value) return;
    if (PL.upd === r.updated_at && PL.v) return;
    PL.upd = r.updated_at;
    var at = Date.parse(r.updated_at);
    PL.at = isNaN(at) || Math.abs(Date.now() - at) > 90000 ? Date.now() : at; // relógio do celular muito fora: usa a hora de chegada
    PL.v = r.value;
    if (PL.seeking == null) paintPlayer();
  }

  // ---------- controle remoto: ver a tela ao vivo, tocar, rolar, digitar ----------
  var RC = { open: false, denied: false, seq: 0, zoom: 1, drag: false, kb: false, el: null, t: null, last: 0, lastInput: 0, tap: null, tapT: null };
  var rcQ = Promise.resolve();
  function rcSend(acts) {
    if (!RC.open || !acts.length) return;
    RC.lastInput = Date.now();
    rcQ = rcQ.then(function () { return cmd('input', { acts: acts, ttl: 8 }); }).catch(function (e) { toast(e.offline ? 'Sem internet.' : e.message); });
  }
  var QUICK = [['Enter', 'enter'], ['Esc', 'esc'], ['Tab', 'tab'], ['⌫', 'backspace'], ['Del', 'delete'], ['←', 'left'], ['↑', 'up'], ['↓', 'down'], ['→', 'right'], ['Windows / ⌘', 'win'], ['Alt+Tab', 'alt+tab'],
    ['Copiar', 'mod+c'], ['Colar', 'mod+v'], ['Selecionar tudo', 'mod+a'], ['Desfazer', 'mod+z'], ['Nova aba', 'mod+t'], ['Fechar aba', 'mod+w'], ['F5', 'f5'], ['Fechar janela', 'alt+f4']];
  function ripple(x, y, cls) {
    var d = h('div', { class: 'rc-rip ' + (cls || ''), style: 'left:' + x + 'px;top:' + y + 'px' });
    RC.el.append(d); setTimeout(function () { d.remove(); }, 600);
  }
  function openRemote() {
    if (RC.open) return;
    if (!S.pcOnline) { toast('O PC está desligado.'); return; }
    RC.open = true; RC.denied = false; RC.seq = 0; RC.zoom = 1; RC.drag = false; RC.kb = false; RC.last = 0;
    var img = h('img', { class: 'rc-img', alt: 'Tela do computador', draggable: 'false' });
    var cur = h('div', { class: 'rc-cur' });
    var wrap = h('div', { class: 'rc-wrap rc-fit' }, img, cur);
    var stage = h('div', { class: 'rc-stage' }, wrap);
    var msg = h('div', { class: 'rc-msg', text: 'Conectando ao PC…' });
    var status = h('span', { class: 'rc-status', text: 'Conectando…' });
    var zoomB = h('button', { class: 'rc-b', 'aria-label': 'Aproximar', onclick: function () { RC.zoom = RC.zoom === 1 ? 2 : RC.zoom === 2 ? 3.5 : 1; applyZoom(); } }, '🔍 1×');
    var dragB = h('button', { class: 'rc-b', 'aria-label': 'Arrastar', onclick: function () { RC.drag = !RC.drag; dragB.classList.toggle('on', RC.drag); toast(RC.drag ? 'Arrastar ligado: o dedo arrasta o mouse (janelas, seleção).' : 'Arrastar desligado: o dedo rola a página.'); } }, '✋ Arrastar');
    var kbB = h('button', { class: 'rc-b', 'aria-label': 'Teclado', onclick: function () { RC.kb = !RC.kb; kbB.classList.toggle('on', RC.kb); kb.hidden = !RC.kb; if (RC.kb) txt.focus(); } }, '⌨️');
    var txt = h('input', { type: 'text', placeholder: 'Digite aqui e envie ao PC', autocapitalize: 'off', autocomplete: 'off', enterkeyhint: 'send' });
    var sendTxt = function (enter) { var v = txt.value; if (!v && !enter) return; var a = []; if (v) a.push({ t: 'text', s: v }); if (enter) a.push({ t: 'key', k: 'enter' }); rcSend(a); txt.value = ''; };
    txt.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendTxt(false); } });
    var kb = h('div', { class: 'rc-kb', hidden: true },
      h('div', { class: 'add' }, txt, h('button', { class: 'btn sm', onclick: function () { sendTxt(false); } }, 'Enviar'), h('button', { class: 'btn alt sm', onclick: function () { sendTxt(true); } }, '⏎')),
      h('div', { class: 'rc-keys' }, QUICK.map(function (q) { return h('button', { class: 'chip', onclick: function () { rcSend([{ t: 'key', k: q[1] }]); } }, q[0]); })));
    RC.el = h('div', { class: 'rc' },
      h('div', { class: 'rc-top' }, h('button', { class: 'rc-b', 'aria-label': 'Fechar', onclick: closeRemote }, '✕'), status, zoomB, dragB, kbB),
      stage, msg, kb);
    RC.img = img; RC.cur = cur; RC.wrap = wrap; RC.msg = msg; RC.status = status; RC.zoomB = zoomB; RC.stage = stage;
    bindGestures(wrap);
    document.body.append(RC.el);
    if (window.innerHeight > window.innerWidth) toast('Dica: gire o celular para ver a tela maior.');
    beat(true); rcLoop();
  }
  function applyZoom() {
    RC.wrap.style.width = RC.zoom === 1 ? '' : (RC.zoom * 100) + '%';
    RC.stage.classList.toggle('zoom', RC.zoom !== 1);
    RC.wrap.classList.toggle('rc-fit', RC.zoom === 1); RC.wrap.classList.toggle('rc-zoom', RC.zoom !== 1);
    RC.zoomB.textContent = '🔍 ' + (RC.zoom === 3.5 ? '3.5' : RC.zoom) + '×';
  }
  function closeRemote() {
    if (!RC.open) return;
    RC.open = false; clearTimeout(RC.t); clearTimeout(RC.tapT);
    if (RC.el) RC.el.remove(); RC.el = null;
    beat(true);
  }
  function applyFrame(v, updated) {
    var age = Date.now() - Date.parse(updated);
    RC.denied = !!(v && v.denied);
    if (v && v.denied) { RC.msg.textContent = 'O controle remoto está desligado no PC. No Zeno do computador, abra Ajustes > Celular e ligue "Deixar o celular controlar a tela".'; RC.msg.hidden = false; RC.status.textContent = 'Desligado no PC'; return; }
    if (!v || !v.img) return;
    RC.img.src = 'data:image/jpeg;base64,' + v.img;
    RC.cur.style.left = ((v.cx || 0) * 100) + '%'; RC.cur.style.top = ((v.cy || 0) * 100) + '%';
    RC.msg.hidden = true; RC.msg.textContent = '';
    RC.lastFrame = Date.now();
    void age;
  }
  async function rcLoop() {
    if (!RC.open) return;
    var delay = Date.now() - RC.lastInput < 4000 ? 350 : 600;
    if (document.visibilityState !== 'visible') delay = 3000;
    else {
      try {
        var rows = await sb.db.select('zeno_live', { key: 'eq.screen', seq: 'gt.' + RC.seq, select: 'value,seq,updated_at' });
        var r = rows && rows[0];
        if (r) { RC.seq = r.seq; if (Date.now() - Date.parse(r.updated_at) < 20000 || (r.value && r.value.denied)) applyFrame(r.value, r.updated_at); }
        if (RC.msg && !RC.msg.hidden && !RC.denied) RC.msg.textContent = S.pcOnline ? 'Pedindo a tela ao PC…' : 'O PC está desligado.';
        if (RC.status && !RC.denied) {
          var fresh = RC.lastFrame && Date.now() - RC.lastFrame < 8000;
          RC.status.textContent = fresh ? '● Ao vivo' : 'Esperando o PC…';
          RC.status.classList.toggle('live', !!fresh);
        }
        beat();
      } catch (e) { if (RC.status) RC.status.textContent = e.offline ? 'Sem internet' : 'Erro: ' + e.message; }
    }
    if (RC.open) RC.t = setTimeout(rcLoop, delay);
  }
  function bindGestures(wrap) {
    var g = null;
    var norm = function (cx, cy) { var r = RC.img.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (cx - r.left) / r.width)), y: Math.max(0, Math.min(1, (cy - r.top) / r.height)) }; };
    var flushDrag = function () { if (!g || !g.buf.length) return; var pts = g.buf.splice(0).slice(-12); rcSend(pts.map(function (p) { return { t: 'move', x: p.x, y: p.y }; })); g.sent = Date.now(); };
    wrap.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (g) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, y: e.clientY, moved: false, long: false, drag: false, acc: 0, buf: [], sent: 0 };
      g.timer = setTimeout(function () {
        if (!g || g.moved) return;
        g.long = true; var p = norm(g.x0, g.y0);
        rcSend([{ t: 'click', x: p.x, y: p.y, b: 'right' }]); ripple(g.x0, g.y0, 'right');
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (_) { /* sem vibração */ }
      }, 550);
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 9) {
        g.moved = true; clearTimeout(g.timer);
        if (RC.zoom === 1 && RC.drag && !g.long) { g.drag = true; var p0 = norm(g.x0, g.y0); rcSend([{ t: 'down', x: p0.x, y: p0.y, b: 'left' }]); }
      }
      if (!g.moved || RC.zoom !== 1) return; // aproximado: o próprio navegador move a imagem
      if (g.drag) { g.buf.push(norm(e.clientX, e.clientY)); if (Date.now() - g.sent > 160) flushDrag(); return; }
      g.acc += e.clientY - g.y; g.y = e.clientY;
      var lines = Math.trunc(-g.acc / 14);
      if (lines && Date.now() - g.sent > 120) { g.acc += lines * 14; g.sent = Date.now(); var p = norm(e.clientX, e.clientY); rcSend([{ t: 'wheel', x: p.x, y: p.y, dy: Math.max(-20, Math.min(20, lines)) }]); }
    });
    var end = function (e) {
      if (!g || e.pointerId !== g.id) return;
      clearTimeout(g.timer);
      var cur = g; g = null;
      if (cur.drag) { var p = norm(e.clientX, e.clientY); cur.buf.push(p); rcSend(cur.buf.slice(-12).map(function (q) { return { t: 'move', x: q.x, y: q.y }; }).concat([{ t: 'up', x: p.x, y: p.y, b: 'left' }])); return; }
      if (cur.moved || cur.long) return;
      var pt = norm(e.clientX, e.clientY); ripple(e.clientX, e.clientY);
      if (RC.tapT && RC.tap && Math.hypot(pt.x - RC.tap.x, pt.y - RC.tap.y) < 0.04) { clearTimeout(RC.tapT); RC.tapT = null; rcSend([{ t: 'click', x: RC.tap.x, y: RC.tap.y, b: 'left', n: 2 }]); RC.tap = null; return; }
      RC.tap = pt;
      RC.tapT = setTimeout(function () { RC.tapT = null; rcSend([{ t: 'click', x: pt.x, y: pt.y, b: 'left', n: 1 }]); }, 240);
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', function () { if (g) { clearTimeout(g.timer); if (g.drag) rcSend([{ t: 'up', x: 0.5, y: 0.5, b: 'left' }]); g = null; } });
  }

  // ---------- listas (tarefas, memória, rotinas) ----------
  // Cada alteração é aplicada sobre a versão MAIS NOVA da nuvem (não sobre a cópia antiga do celular).
  async function mutate(key, fn) {
    try {
      var rows = await sb.db.select('zeno_sync', { key: 'eq.' + key, select: 'value' });
      var cur = rows && rows[0] && Array.isArray(rows[0].value) ? rows[0].value : [];
      var next = fn(cur.slice());
      var saved = await sb.db.upsert('zeno_sync', { key: key, value: next, device: DEV, updated_at: new Date().toISOString() }, 'user_id,key');
      S[key] = next;
      if (saved && saved[0]) seenSync[key] = saved[0].updated_at;
      refreshView();
    } catch (e) { toast(e.offline ? 'Sem internet.' : e.message); }
  }
  function addRow(placeholder, onadd, extra) {
    var i = h('input', { type: 'text', placeholder: placeholder, enterkeyhint: 'done' });
    var go1 = function () { var v = i.value.trim(); if (v) { onadd(v); i.value = ''; } };
    i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go1(); });
    return h('div', { class: 'add' }, i, h('button', { class: 'btn sm', onclick: go1 }, '＋'));
  }
  function viewLists(el) {
    var seg = h('div', { class: 'seg' }, [['tasks', 'Tarefas'], ['notes', 'Notas'], ['waiting', 'Espera'], ['memory', 'Memória'], ['routines', 'Rotinas']].map(function (t) {
      return h('button', { class: S.listTab === t[0] ? 'on' : '', onclick: function () { S.listTab = t[0]; renderView(); } }, t[1]);
    }));
    el.append(seg);
    if (S.listTab === 'tasks') {
      el.append(addRow('Nova tarefa…', function (v) { mutate('tasks', function (a) { a.push({ id: newId(), title: v.slice(0, 300), done: false, created: today() }); return a; }); }));
      var pend_ = S.tasks.filter(function (t) { return !t.done; }); var done_ = S.tasks.filter(function (t) { return t.done; });
      if (!S.tasks.length) el.append(h('p', { class: 'hint', text: 'Nenhuma tarefa. As do computador aparecem aqui e as suas vão para lá.' }));
      pend_.concat(done_).forEach(function (t) {
        el.append(h('div', { class: 'item' + (t.done ? ' done' : '') },
          h('button', { class: 'check' + (t.done ? ' on' : ''), 'aria-label': 'Concluir', onclick: function () { mutate('tasks', function (a) { a.forEach(function (x) { if (x.id === t.id) x.done = !x.done; }); return a; }); } }, '✓'),
          h('div', { class: 't', text: t.title || t.text || '' }),
          h('button', { class: 'x', 'aria-label': 'Apagar', onclick: function () { mutate('tasks', function (a) { return a.filter(function (x) { return x.id !== t.id; }); }); } }, '✕')));
      });
    } else if (S.listTab === 'notes') {
      listNotes(el);
    } else if (S.listTab === 'waiting') {
      listWaiting(el);
    } else if (S.listTab === 'memory') {
      el.append(addRow('O que o Zeno deve lembrar…', function (v) { mutate('memory', function (a) { a.push({ id: newId(), text: v.slice(0, 300), cat: 'outras', created: today() }); return a; }); }));
      if (!S.memory.length) el.append(h('p', { class: 'hint', text: 'O Zeno ainda não guardou nada.' }));
      S.memory.slice().reverse().forEach(function (m) {
        el.append(h('div', { class: 'item' }, h('div', { class: 't' }, m.text, h('div', { class: 'muted small', text: m.cat || '' })),
          h('button', { class: 'x', 'aria-label': 'Esquecer', onclick: function () { mutate('memory', function (a) { return a.filter(function (x) { return x.id !== m.id; }); }); } }, '✕')));
      });
    } else {
      var nm = h('input', { type: 'text', placeholder: 'Nome da rotina (ex.: bom dia)' });
      var steps = h('textarea', { rows: '3', placeholder: 'Um comando por linha (ex.: toca uma música calma)' });
      el.append(h('div', { class: 'card' }, nm, h('div', { style: 'height:8px' }), steps,
        h('button', { class: 'btn', style: 'width:100%;margin-top:10px', onclick: function () {
          var n = nm.value.trim(); var st = steps.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 30);
          if (!n || !st.length) { toast('Dê um nome e pelo menos um comando.'); return; }
          mutate('routines', function (a) { a.push({ id: newId(), name: n.slice(0, 60), steps: st }); return a; });
        } }, 'Criar rotina')));
      if (!S.routines.length) el.append(h('p', { class: 'hint', text: 'Ainda não há rotinas.' }));
      S.routines.forEach(function (r) {
        el.append(h('div', { class: 'item' }, h('div', { class: 't' }, r.name, h('div', { class: 'muted small', text: (r.steps || []).length + ' passo(s)' })),
          h('button', { class: 'btn sm', onclick: function () { tool('routine_run', { name: r.name }, 'Rodando a rotina…'); } }, '▶ Rodar'),
          h('button', { class: 'x', 'aria-label': 'Apagar', onclick: function () { mutate('routines', function (a) { return a.filter(function (x) { return x.id !== r.id; }); }); } }, '✕')));
      });
    }
  }

  // ---------- dia (0.7): agenda, foco, cronômetro, notas e espera ----------
  var DAYLIVE = { t: null };
  function pnl() { return (S.painel && S.painel[0]) || null; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtClock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); }
  function fmtMin(ms) { var m = Math.round(ms / 60000); if (m < 60) return m + ' min'; return Math.floor(m / 60) + 'h' + (m % 60 ? pad2(m % 60) : ''); }
  function agendaTime(e) { if (e.allDay) return 'Dia todo'; var a = new Date(e.start); var t = pad2(a.getHours()) + ':' + pad2(a.getMinutes()); return t; }
  // depois de um pedido ao PC a foto do dia demora alguns segundos para voltar: busca de novo
  function dtool(name, args, label) {
    tool(name, args, label);
    [2500, 6000, 12000].forEach(function (ms) { setTimeout(function () { if (running) pullSync().catch(function () { /* próximo ciclo */ }); }, ms); });
  }
  function dayLiveSet(fn) { DAYLIVE.fn = fn; fn(); if (DAYLIVE.t) clearInterval(DAYLIVE.t); DAYLIVE.t = setInterval(fn, 1000); }

  function focusCard(P) {
    var f = (P && P.focus) || { mode: 'idle' };
    var cfg = f.cfg || { focusMin: 25, breakMin: 5 };
    if (f.mode === 'idle') {
      var label = h('input', { type: 'text', placeholder: 'Em quê vai focar? (opcional)' });
      var proj = h('input', { type: 'text', placeholder: 'Projeto (opcional)', list: 'projlist' });
      var dl = h('datalist', { id: 'projlist' }, ((P && P.projects) || []).map(function (n) { return h('option', { value: n }); }));
      return h('div', { class: 'card' }, h('h3', { text: '🍅 Foco' }),
        h('p', { class: 'hint', text: 'Rodadas de ' + cfg.focusMin + ' min com pausa de ' + cfg.breakMin + ' min.' }), label, h('div', { style: 'height:8px' }), proj, dl,
        h('button', { class: 'btn', style: 'width:100%;margin-top:10px', onclick: function () {
          var a = { action: 'start' }; if (label.value.trim()) a.label = label.value.trim(); if (proj.value.trim()) a.project = proj.value.trim();
          dtool('focus_control', a, 'Iniciando o foco…');
        } }, '▶ Começar ' + cfg.focusMin + ' min'));
    }
    var clockEl = h('div', { class: 'bigclock', text: '--:--' });
    var bar = h('i');
    var title = (f.mode === 'focus' ? 'Foco' : f.long ? 'Pausa longa' : 'Pausa') + (f.paused ? ' (pausado)' : '');
    var card = h('div', { class: 'card focuscard ' + f.mode }, h('h3', { text: (f.mode === 'focus' ? '🍅 ' : '☕ ') + title }),
      clockEl, h('div', { class: 'pbar' }, bar),
      h('div', { class: 'muted small', text: [f.label, f.project ? 'projeto ' + f.project : '', 'rodada ' + (f.mode === 'focus' ? f.cycle + 1 : Math.max(1, f.cycle))].filter(Boolean).join(' · ') }),
      h('div', { class: 'row', style: 'margin-top:12px' },
        f.paused ? h('button', { class: 'btn', onclick: function () { dtool('focus_control', { action: 'resume' }); } }, '▶ Continuar') : h('button', { class: 'btn alt', onclick: function () { dtool('focus_control', { action: 'pause' }); } }, '⏸ Pausar'),
        h('button', { class: 'btn alt', onclick: function () { dtool('focus_control', { action: 'skip' }); } }, '⏭ Pular'),
        h('button', { class: 'btn danger', onclick: function () { dtool('focus_control', { action: 'stop' }); } }, '■')));
    card.__live = function () {
      var left = f.paused ? f.leftMs : Math.max(0, (f.endsAt || 0) - Date.now());
      clockEl.textContent = fmtClock(left);
      var total = f.total || 0;
      bar.style.width = total ? Math.max(0, Math.min(100, 100 - (left / total) * 100)) + '%' : '0%';
    };
    return card;
  }

  function trackCard(P) {
    var tr = P && P.track;
    var by = ((P && P.today && P.today.byProject) || []).map(function (x) { return { project: x.project, ms: x.ms }; });
    var liveEl = null;
    var list = h('div', { class: 'bars' });
    var card;
    function drawList() {
      clear(list);
      var rows = by.map(function (x) { return { project: x.project, ms: x.ms + (tr && tr.project === x.project ? Math.max(0, Date.now() - tr.start) : 0) }; });
      if (tr && !rows.some(function (x) { return x.project === tr.project; })) rows.push({ project: tr.project, ms: Math.max(0, Date.now() - tr.start) });
      rows.sort(function (a, b) { return b.ms - a.ms; });
      var max = rows.length ? rows[0].ms || 1 : 1;
      rows.forEach(function (r) { list.append(h('div', { class: 'barrow' }, h('span', { text: r.project }), h('div', { class: 'pbar' }, h('i', { style: 'width:' + Math.round((r.ms / max) * 100) + '%' })), h('b', { text: fmtMin(r.ms) }))); });
      if (!rows.length) list.append(h('p', { class: 'hint', text: 'Nada registrado hoje.' }));
    }
    if (tr) {
      liveEl = h('div', { class: 'bigclock sm', text: '0 min' });
      card = h('div', { class: 'card' }, h('h3', { text: '⏱ Trabalhando em ' + tr.project }), liveEl,
        h('button', { class: 'btn danger', style: 'width:100%;margin-top:8px', onclick: function () { dtool('track_control', { action: 'stop' }, 'Parando…'); } }, '■ Parar cronômetro'), h('div', { class: 'sec', text: 'Hoje' }), list);
      card.__live = function () { liveEl.textContent = fmtMin(Math.max(0, Date.now() - tr.start)); drawList(); };
    } else {
      var inp = h('input', { type: 'text', placeholder: 'Projeto (ex.: Site novo)', list: 'projlist2', autocapitalize: 'sentences' });
      var dl = h('datalist', { id: 'projlist2' }, ((P && P.projects) || []).map(function (n) { return h('option', { value: n }); }));
      var go1 = function () { var v = inp.value.trim(); if (v) { dtool('track_control', { action: 'start', project: v }, 'Cronômetro ligado…'); inp.value = ''; } };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go1(); });
      drawList();
      card = h('div', { class: 'card' }, h('h3', { text: '⏱ Tempo por projeto' }), h('div', { class: 'add' }, inp, h('button', { class: 'btn sm', onclick: go1 }, '▶')), dl, h('div', { class: 'sec', text: 'Hoje' }), list);
    }
    return card;
  }

  function agendaCard(P) {
    var ag = P && P.agenda;
    var card = h('div', { class: 'card' }, h('h3', { text: '📅 Agenda de hoje' }));
    if (!ag || !ag.connected) {
      card.append(h('p', { class: 'hint', text: ag && ag.error ? ag.error : 'O Google Agenda ainda não está conectado. No computador: Painel › Agenda › Conectar.' }));
      return card;
    }
    if (ag.error) card.append(h('p', { class: 'hint err', text: ag.error }));
    if (!ag.events.length) card.append(h('p', { class: 'hint', text: 'Nenhum compromisso hoje.' }));
    ag.events.forEach(function (e) {
      card.append(h('div', { class: 'item' }, h('div', { class: 'evtime', text: agendaTime(e) }),
        h('div', { class: 't' }, e.title || '(sem título)', e.location ? h('div', { class: 'muted small', text: '📍 ' + e.location }) : null),
        h('button', { class: 'x', 'aria-label': 'Apagar', onclick: function () { if (confirm('Apagar "' + (e.title || 'compromisso') + '" da agenda?')) dtool('agenda_delete', { match: e.title }, 'Pedindo para apagar…'); } }, '✕')));
    });
    var title = h('input', { type: 'text', placeholder: 'Novo compromisso…' });
    var d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
    var when = h('input', { type: 'datetime-local', value: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':00' });
    var dur = h('select', {}, [30, 45, 60, 90, 120].map(function (m) { return h('option', { value: String(m), selected: m === 60 ? true : null, text: m + ' min' }); }));
    card.append(h('div', { class: 'sec', text: 'Marcar' }), title, h('div', { style: 'height:8px' }), when,
      h('div', { class: 'row', style: 'margin-top:8px' }, dur,
        h('button', { class: 'btn', onclick: function () {
          var t = title.value.trim(); if (!t || !when.value) { toast('Dê um título e escolha o horário.'); return; }
          dtool('agenda_add', { title: t, start: when.value, duration_min: +dur.value }, 'Marcando na agenda…'); title.value = '';
        } }, 'Marcar')));
    return card;
  }

  function viewDay(el) {
    var P = pnl();
    if (!P) {
      el.append(h('div', { class: 'card' }, h('h3', { text: '📅 Seu dia' }), h('p', { class: 'hint', text: 'Ainda não chegou nada do computador. Abra o Zeno no PC (versão 0.7 ou mais nova) com a mesma conta; o resumo do dia, a agenda e o foco aparecem aqui em alguns segundos.' })));
      return;
    }
    var lives = [];
    var add2 = function (c) { if (c.__live) lives.push(c.__live); el.append(c); };
    if (P.weather && P.weather.summary) el.append(h('div', { class: 'card' }, h('h3', { text: '🌤 Clima' }), h('p', { style: 'margin:4px 0 0', text: P.weather.summary })));
    add2(focusCard(P));
    add2(trackCard(P));
    add2(agendaCard(P));
    var sums = [];
    if (P.morning && P.morning.text) sums.push(h('details', { class: 'sumry' }, h('summary', { text: '☀️ Resumo da manhã' }), h('p', { text: P.morning.text })));
    if (P.week && P.week.text) sums.push(h('details', { class: 'sumry' }, h('summary', { text: '📊 Resumo da semana' }), h('p', { text: P.week.text })));
    if (sums.length) el.append(h('div', { class: 'card' }, sums));
    el.append(h('div', { class: 'row', style: 'margin-bottom:10px' },
      h('button', { class: 'btn alt sm', onclick: function () { dtool('morning_summary', {}, 'Montando o resumo…'); } }, '☀️ Resumo do dia'),
      h('button', { class: 'btn alt sm', onclick: function () { dtool('week_summary', {}, 'Montando o resumo…'); } }, '📊 Da semana')),
      h('p', { class: 'hint', text: 'Atualizado às ' + hhmm(P.at || Date.now()) + (S.pcOnline ? '' : ' · o PC está desligado, então isto pode estar desatualizado') + '.' }));
    if (lives.length) dayLiveSet(function () { lives.forEach(function (f) { f(); }); });
  }

  function listNotes(el) {
    var q = h('input', { type: 'text', placeholder: 'Procurar nas notas…', 'aria-label': 'Procurar' });
    var box = h('div', {});
    var inp = h('input', { type: 'text', placeholder: 'Nova nota (use #tags)…', enterkeyhint: 'done' });
    var go1 = function () {
      var v = inp.value.trim(); if (!v) return;
      var tags = []; var text = v.replace(/#([\p{L}\p{N}_-]{1,24})/gu, function (_, t) { t = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (tags.indexOf(t) < 0 && tags.length < 6) tags.push(t); return ''; }).replace(/\s+/g, ' ').trim() || v;
      inp.value = '';
      mutate('notes', function (a) { a.push({ id: newId(), text: text.slice(0, 1000), tags: tags, created: Date.now() }); return a.slice(-1000); });
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go1(); });
    el.append(h('div', { class: 'add' }, inp, h('button', { class: 'btn sm', onclick: go1 }, '＋')), q, box);
    function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function draw() {
      clear(box);
      var words = norm(q.value).split(/\s+/).filter(Boolean);
      var list = S.notes.slice().sort(function (a, b) { return b.created - a.created; }).filter(function (n) {
        var hay = norm(n.text + ' ' + (n.tags || []).join(' ')); return words.every(function (w) { return hay.indexOf(w) >= 0; });
      });
      if (!list.length) { box.append(h('p', { class: 'hint', text: S.notes.length ? 'Nenhuma nota com isso.' : 'Nenhuma nota ainda. Diga ao Zeno: “anota: …” ou escreva aqui.' })); return; }
      list.slice(0, 80).forEach(function (n) {
        box.append(h('div', { class: 'item' }, h('div', { class: 't' }, n.text,
          h('div', { class: 'muted small' }, new Date(n.created).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), (n.tags || []).map(function (t) { return h('span', { class: 'tag', text: '#' + t }); }))),
          h('button', { class: 'x', 'aria-label': 'Apagar', onclick: function () { mutate('notes', function (a) { return a.filter(function (x) { return x.id !== n.id; }); }); } }, '✕')));
      });
    }
    q.addEventListener('input', draw);
    draw();
  }

  function listWaiting(el) {
    var who = h('input', { type: 'text', placeholder: 'Quem?' });
    var what = h('input', { type: 'text', placeholder: 'Sobre o quê? (opcional)', enterkeyhint: 'done' });
    var go1 = function () {
      var w = who.value.trim(); if (!w) { toast('Diga de quem você espera resposta.'); return; }
      var o = what.value.trim(); who.value = ''; what.value = '';
      mutate('waiting', function (a) { a.push({ id: newId(), who: w.slice(0, 60), what: o.slice(0, 200), since: today(), done: false }); return a; });
    };
    what.addEventListener('keydown', function (e) { if (e.key === 'Enter') go1(); });
    el.append(h('div', { class: 'card' }, who, h('div', { style: 'height:8px' }), what, h('button', { class: 'btn', style: 'width:100%;margin-top:10px', onclick: go1 }, 'Anotar que estou esperando')));
    var open = S.waiting.filter(function (x) { return !x.done; }).sort(function (a, b) { return String(a.since).localeCompare(String(b.since)); });
    var done = S.waiting.filter(function (x) { return x.done; }).slice(-5).reverse();
    if (!open.length) el.append(h('p', { class: 'hint', text: 'Você não está esperando resposta de ninguém.' }));
    function days(s) { var n = Math.max(0, Math.round((new Date(today()) - new Date(s)) / 86400000)); return n === 0 ? 'desde hoje' : n === 1 ? 'há 1 dia' : 'há ' + n + ' dias'; }
    open.concat(done).forEach(function (x) {
      el.append(h('div', { class: 'item' + (x.done ? ' done' : '') },
        h('button', { class: 'check' + (x.done ? ' on' : ''), 'aria-label': 'Respondeu', onclick: function () { mutate('waiting', function (a) { a.forEach(function (y) { if (y.id === x.id) { y.done = !y.done; y.doneAt = y.done ? Date.now() : 0; } }); return a; }); } }, '✓'),
        h('div', { class: 't' }, x.who + (x.what ? ' · ' + x.what : ''), h('div', { class: 'muted small', text: x.done ? 'respondeu' : days(x.since) })),
        h('button', { class: 'x', 'aria-label': 'Apagar', onclick: function () { mutate('waiting', function (a) { return a.filter(function (y) { return y.id !== x.id; }); }); } }, '✕')));
    });
  }

  async function pullSync() {
    var rows = await sb.db.select('zeno_sync', { select: 'key,value,updated_at' });
    var changed = false;
    (rows || []).forEach(function (r) {
      if (seenSync[r.key] === r.updated_at) return;
      seenSync[r.key] = r.updated_at;
      if (Array.isArray(r.value)) { S[r.key] = r.value; changed = true; }
      else if (r.key === 'financas' && r.value && typeof r.value === 'object') { S.financas = r.value; changed = true; }
    });
    if (changed) refreshView();
  }

  // ---------- arquivos ----------
  function viewFiles(el) {
    var pick = h('input', { type: 'file', multiple: true, style: 'display:none' });
    pick.addEventListener('change', function () { Array.prototype.forEach.call(pick.files, sendFile); pick.value = ''; });
    var photo = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: 'display:none' });
    photo.addEventListener('change', function () { Array.prototype.forEach.call(photo.files, sendFile); photo.value = ''; });
    el.append(
      h('div', { class: 'sec', text: 'Enviar para o PC' }),
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { photo.click(); } }, '🖼️ Fotos'), h('button', { class: 'btn alt', onclick: function () { pick.click(); } }, '📁 Arquivos')),
        h('p', { class: 'hint', text: 'Chegam na pasta Downloads/Zeno do computador (até 25 MB cada).' }), pick, photo),
      h('div', { class: 'sec', text: 'Vindos do PC' }));
    if (!S.inbox.length) el.append(h('p', { class: 'hint', text: 'Peça no chat: “manda o arquivo relatório para o meu celular”.' }));
    S.inbox.slice().reverse().forEach(function (f) {
      el.append(h('div', { class: 'item' }, h('div', { class: 't' }, f.name, h('div', { class: 'muted small', text: fmtSize(f.size || 0) + ' · ' + hhmm(f.at) })),
        h('button', { class: 'btn sm', onclick: function () { openFile(f); } }, 'Abrir'),
        h('button', { class: 'x', 'aria-label': 'Remover', onclick: function () { S.inbox = S.inbox.filter(function (x) { return x.path !== f.path; }); LS.set('zeno.inbox', S.inbox); refreshView(); } }, '✕')));
    });
  }
  async function sendFile(file) {
    if (file.size > MAX_FILE) { toast(file.name + ' passa de 25 MB.'); return; }
    var uid = sb.auth.user().id;
    var path = uid + '/in/' + Date.now() + '-' + safeName(file.name);
    toast('Enviando ' + file.name + '…');
    try {
      await sb.files.upload(path, file, file.type || 'application/octet-stream');
      var c = await cmd('tool', { name: 'receive_file', path: path, fname: safeName(file.name) });
      pend[c.id] = { mode: 'toast' };
      toast(S.pcOnline ? 'Enviado! O PC já vai receber.' : 'PC desligado: ele recebe quando ligar (até 1 hora).');
    } catch (e) { toast(e.offline ? 'Sem internet.' : e.message); }
  }
  async function openFile(f) {
    try {
      toast('Baixando…');
      var res = await sb.files.download(f.path);
      var blob = await res.blob();
      var file = new File([blob], f.name, { type: f.mime || blob.type || 'application/octet-stream' });
      if (/^image\//.test(file.type)) { showImage(blob, f.name); return; }
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: f.name }); return; }
      var a = h('a', { href: URL.createObjectURL(blob), download: f.name }); document.body.append(a); a.click(); a.remove();
    } catch (e) { if (e && e.name !== 'AbortError') toast(e.message || 'Não consegui abrir.'); }
  }
  function showImage(blob, name) {
    var url = URL.createObjectURL(blob);
    var m = h('div', { class: 'modal' }, h('img', { src: url, alt: name }),
      h('div', { class: 'row', style: 'width:100%;max-width:420px' },
        h('button', { class: 'btn alt', onclick: function () { m.remove(); URL.revokeObjectURL(url); } }, 'Fechar'),
        h('button', { class: 'btn', onclick: async function () {
          try { var f = new File([blob], name, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] }); else { var a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); } } catch (_) { /* cancelou */ }
        } }, 'Salvar')));
    document.body.append(m);
  }

  // ---------- mais ----------
  // ---------- 1.12: Dinheiro (gestor financeiro, sincronizado com o PC) ----------
  var FIN_CATS = [
    ['mercado', '🛒', '#34d399', /mercado|supermercado|padaria|feira|hortifruti|acougue|atacadao/],
    ['alimentação', '🍔', '#fb923c', /restaurante|lanche|ifood|pizza|hamburguer|almoco|jantar|cafe|sorvete|bar\b|churrasco|delivery|comida/],
    ['transporte', '🚗', '#60a5fa', /uber|99\b|taxi|gasolina|combustivel|etanol|onibus|passagem|metro|estacionamento|pedagio|oficina|carro|moto/],
    ['moradia', '🏠', '#a78bfa', /aluguel|condominio|luz|energia|agua|internet|gas\b|iptu|reforma|casa/],
    ['saúde', '💊', '#f472b6', /farmacia|remedio|medico|consulta|dentista|exame|plano de saude|academia/],
    ['lazer', '🎬', '#facc15', /cinema|netflix|spotify|show|viagem|jogo|game|streaming|hotel|passeio|festa/],
    ['educação', '📚', '#22d3ee', /curso|livro|escola|faculdade|mensalidade|aula|udemy/],
    ['trabalho', '💼', '#94a3b8', /dominio|hospedagem|vercel|supabase|anuncio|ferramenta|software|assinatura|api\b|servidor|imposto|das\b|mei\b/],
    ['roupas', '👕', '#e879f9', /roupa|tenis|sapato|camisa|calca|vestido/],
    ['outros', '📦', '#9ca3af', /./],
  ];
  var FIN_REC = [['salário', '💰', '#4ade80', /salario|pagamento|holerite/], ['vendas', '🤝', '#2dd4bf', /venda|vendi|cliente|carro|revenda|comissao/], ['outros', '✨', '#86efac', /./]];
  var FIN = { tipo: 'gasto', mes: today().slice(0, 7), cat: '', valor: '', desc: '', orcAberto: false };
  function foldTxt(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function finCat(nome, tipo) { var l = tipo === 'receita' ? FIN_REC : FIN_CATS; for (var i = 0; i < l.length; i++) if (l[i][0] === nome) return l[i]; var o = FIN_CATS.concat(FIN_REC); for (var j = 0; j < o.length; j++) if (o[j][0] === nome) return o[j]; return ['outros', '📦', '#9ca3af']; }
  function adivinhaCat(desc, tipo) { var t = foldTxt(desc); var l = tipo === 'receita' ? FIN_REC : FIN_CATS; for (var i = 0; i < l.length; i++) if (l[i][3].test(t)) return l[i][0]; return 'outros'; }
  function centavos(v) { var s = String(v || '').replace(/[^\d,.]/g, ''); if (!s) return 0; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); var n = parseFloat(s); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; }
  function reais(c, sinal) { var neg = c < 0; var n = Math.abs(Math.round(c)); var r = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (neg ? '-' : sinal && c > 0 ? '+' : '') + 'R$ ' + r + ',' + String(n % 100).padStart(2, '0'); }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function nomeMes(ym) { var p = ym.split('-'); return MESES[+p[1] - 1] + (p[0] !== today().slice(0, 4) ? ' de ' + p[0] : ''); }
  function mudaMes(d) { var p = FIN.mes.split('-').map(Number); var x = new Date(p[0], p[1] - 1 + d, 1); FIN.mes = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); refreshView(); }
  function finDados() { var f = S.financas && typeof S.financas === 'object' ? S.financas : {}; return { itens: Array.isArray(f.itens) ? f.itens : [], orcamentos: f.orcamentos && typeof f.orcamentos === 'object' ? f.orcamentos : {}, removidos: Array.isArray(f.removidos) ? f.removidos : [] }; }
  async function mutateFin(fn) {
    try {
      var rows = await sb.db.select('zeno_sync', { key: 'eq.financas', select: 'value' });
      var v = rows && rows[0] && rows[0].value && typeof rows[0].value === 'object' ? rows[0].value : {};
      var cur = { itens: Array.isArray(v.itens) ? v.itens.slice() : [], orcamentos: Object.assign({}, v.orcamentos || {}), removidos: Array.isArray(v.removidos) ? v.removidos.slice() : [] };
      var next = fn(cur);
      await sb.db.upsert('zeno_sync', { key: 'financas', value: next, device: DEV, updated_at: new Date().toISOString() }, 'user_id,key');
      S.financas = next; refreshView(); return true;
    } catch (e) { toast(/row-level|42501/i.test(e.message) ? 'Sua assinatura não está ativa.' : 'Sem internet. Tente de novo.'); return false; }
  }
  function viewFin(el) {
    var f = finDados();
    var doMes = f.itens.filter(function (i) { return String(i.data).slice(0, 7) === FIN.mes; });
    var gastos = 0, receitas = 0, porCat = {};
    doMes.forEach(function (i) { if (i.tipo === 'receita') receitas += i.valor; else { gastos += i.valor; porCat[i.cat || 'outros'] = (porCat[i.cat || 'outros'] || 0) + i.valor; } });
    var saldo = receitas - gastos;
    var hojeG = f.itens.filter(function (i) { return i.data === today() && i.tipo !== 'receita'; }).reduce(function (a, i) { return a + i.valor; }, 0);
    // mês
    el.append(h('div', { class: 'fin-mes' }, h('button', { class: 'fin-seta', 'aria-label': 'Mês anterior', onclick: function () { mudaMes(-1); } }, '‹'), h('b', { text: nomeMes(FIN.mes) }),
      h('button', { class: 'fin-seta', 'aria-label': 'Próximo mês', disabled: FIN.mes >= today().slice(0, 7), onclick: function () { mudaMes(1); } }, '›')));
    // saldo
    el.append(h('div', { class: 'fin-hero' + (saldo < 0 ? ' neg' : '') },
      h('span', { class: 'fin-hero-l', text: 'Saldo do mês' }), h('div', { class: 'fin-hero-v', text: reais(saldo) }),
      h('div', { class: 'fin-hero-row' },
        h('div', { class: 'fin-mini rec' }, h('i', { text: '↑' }), h('div', {}, h('span', { text: 'Entrou' }), h('b', { text: reais(receitas) }))),
        h('div', { class: 'fin-mini gas' }, h('i', { text: '↓' }), h('div', {}, h('span', { text: 'Saiu' }), h('b', { text: reais(gastos) })))),
      FIN.mes === today().slice(0, 7) ? h('div', { class: 'fin-hoje', text: 'Hoje você gastou ' + reais(hojeG) }) : null));
    // anotar
    var valor = h('input', { class: 'fin-valor', type: 'text', inputmode: 'decimal', placeholder: '0,00', value: FIN.valor, 'aria-label': 'Valor' });
    var desc = h('input', { type: 'text', placeholder: FIN.tipo === 'receita' ? 'De onde veio? (ex: venda, salário)' : 'Com o quê? (ex: mercado, uber, luz)', value: FIN.desc, enterkeyhint: 'done', 'aria-label': 'Descrição' });
    var chips = h('div', { class: 'fin-cats' });
    function pintaChips() {
      clear(chips); var sug = FIN.cat || adivinhaCat(desc.value, FIN.tipo);
      (FIN.tipo === 'receita' ? FIN_REC : FIN_CATS).forEach(function (c) {
        var b = h('button', { class: 'fin-cat' + (c[0] === sug ? ' on' : ''), onclick: function () { FIN.cat = c[0]; pintaChips(); } }, h('span', { text: c[1] }), c[0]); b.style.setProperty('--cc', c[2]); chips.append(b);
      });
    }
    valor.addEventListener('input', function () { FIN.valor = valor.value; });
    desc.addEventListener('input', function () { FIN.desc = desc.value; if (!FIN.cat) pintaChips(); });
    pintaChips();
    var anotar = async function () {
      var c = centavos(valor.value); if (!c) { toast('Digite o valor.'); valor.focus(); return; }
      if (c > 100000000) { toast('Valor grande demais.'); return; }
      var d = desc.value.trim().slice(0, 80); var tipo = FIN.tipo; var cat = FIN.cat || adivinhaCat(d, tipo);
      var item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), data: today(), tipo: tipo, valor: c, desc: d, cat: cat, criado: Date.now() };
      FIN.valor = ''; FIN.desc = ''; FIN.cat = '';
      if (await mutateFin(function (v) { v.itens.push(item); if (v.itens.length > 5000) v.itens.splice(0, v.itens.length - 5000); return v; })) {
        toast((tipo === 'receita' ? 'Receita' : 'Gasto') + ' anotado ✔');
        var o = f.orcamentos[cat]; if (tipo === 'gasto' && o) { var tot = (porCat[cat] || 0) + c; if (tot > o) toast('⚠ Passou do limite de ' + cat + ' (' + reais(o) + ')'); }
      }
    };
    desc.addEventListener('keydown', function (e) { if (e.key === 'Enter') anotar(); });
    el.append(h('div', { class: 'card fin-add' },
      h('div', { class: 'seg' }, [['gasto', '↓ Gasto'], ['receita', '↑ Receita']].map(function (t) { return h('button', { class: FIN.tipo === t[0] ? 'on ' + t[0] : '', onclick: function () { FIN.tipo = t[0]; FIN.cat = ''; refreshView(); } }, t[1]); })),
      h('label', { class: 'fin-valor-w' }, h('span', { text: 'R$' }), valor),
      desc, chips,
      h('button', { class: 'btn big', onclick: anotar }, FIN.tipo === 'receita' ? 'Anotar receita' : 'Anotar gasto'),
      h('p', { class: 'hint small', text: 'Dica: no chat ou por voz, diga "gastei 35 no mercado".' })));
    // para onde foi
    var cats = Object.keys(porCat).map(function (k) { return [k, porCat[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (cats.length) {
      var max = cats[0][1];
      el.append(h('div', { class: 'sec', text: 'Para onde foi' }), h('div', { class: 'card fin-dist' },
        h('div', { class: 'fin-stack' }, cats.map(function (c) { var i = h('i'); i.style.flex = String(c[1]); i.style.background = finCat(c[0], 'gasto')[2]; return i; })),
        cats.map(function (c) {
          var k = finCat(c[0], 'gasto'); var bar = h('i'); bar.style.width = Math.max(4, c[1] / max * 100) + '%'; bar.style.background = k[2];
          return h('div', { class: 'fin-catrow' }, h('span', { class: 'fin-ico', text: k[1] }), h('div', { class: 'fin-catinfo' }, h('div', { class: 'fin-catl' }, h('span', { text: c[0] }), h('b', { text: reais(c[1]) })), h('div', { class: 'fin-bar' }, bar)), h('span', { class: 'muted small fin-pct', text: Math.round(c[1] / gastos * 100) + '%' }));
        })));
    }
    // orçamentos
    var orcs = Object.keys(f.orcamentos).filter(function (k) { return f.orcamentos[k] > 0; });
    var oc = h('input', { type: 'text', placeholder: 'Categoria (ex: mercado)' }); var ov = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Limite por mês (ex: 800)' });
    el.append(h('div', { class: 'sec', text: 'Limites do mês' }), h('div', { class: 'card fin-orc' },
      orcs.length ? orcs.map(function (k) {
        var g = porCat[k] || 0; var lim = f.orcamentos[k]; var pct = Math.round(g / lim * 100); var bar = h('i', { class: pct > 100 ? 'bad' : pct >= 80 ? 'warn' : '' }); bar.style.width = Math.min(100, Math.max(3, pct)) + '%';
        return h('div', { class: 'fin-orcrow' }, h('div', { class: 'fin-catl' }, h('span', {}, finCat(k, 'gasto')[1] + ' ' + k), h('span', { class: 'muted small', text: reais(g) + ' de ' + reais(lim) })), h('div', { class: 'fin-bar' }, bar),
          h('button', { class: 'x', 'aria-label': 'Tirar limite de ' + k, onclick: function () { mutateFin(function (v) { delete v.orcamentos[k]; return v; }); } }, '✕'));
      }) : h('p', { class: 'hint', text: 'Defina um limite por categoria e o Zeno avisa quando chegar perto.' }),
      FIN.orcAberto ? h('div', { class: 'fin-orcform' }, oc, ov, h('button', { class: 'btn', onclick: function () { var k = foldTxt(oc.value).trim(); var c = centavos(ov.value); if (!k || !c) { toast('Diga a categoria e o valor.'); return; } FIN.orcAberto = false; mutateFin(function (v) { v.orcamentos[k] = c; return v; }); } }, 'Salvar limite'))
        : h('button', { class: 'btn alt', onclick: function () { FIN.orcAberto = true; refreshView(); } }, '+ Novo limite')));
    // lançamentos
    el.append(h('div', { class: 'sec', text: 'Lançamentos' }));
    if (!doMes.length) { el.append(h('p', { class: 'hint', text: S.financas ? 'Nada anotado em ' + nomeMes(FIN.mes) + '.' : 'Ainda não chegou nada do PC. Abra o Zeno no computador (versão 1.12 ou mais nova).' })); return; }
    var porDia = {}; doMes.forEach(function (i) { (porDia[i.data] = porDia[i.data] || []).push(i); });
    Object.keys(porDia).sort().reverse().forEach(function (d) {
      var dt = new Date(d + 'T12:00:00'); var rot = d === today() ? 'Hoje' : dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }); rot = rot.charAt(0).toUpperCase() + rot.slice(1);
      el.append(h('div', { class: 'fin-dia', text: rot }), h('div', { class: 'card fin-lista' }, porDia[d].slice().reverse().map(function (i) {
        var k = finCat(i.cat, i.tipo); var ic = h('span', { class: 'fin-ico', text: k[1] }); ic.style.setProperty('--cc', k[2]);
        return h('div', { class: 'fin-item' }, ic, h('div', { class: 't' }, h('b', { text: i.desc || i.cat }), h('div', { class: 'muted small', text: i.cat })),
          h('b', { class: 'fin-v ' + (i.tipo === 'receita' ? 'rec' : 'gas'), text: (i.tipo === 'receita' ? '+' : '-') + reais(i.valor).replace('-', '') }),
          h('button', { class: 'x', 'aria-label': 'Apagar', onclick: function () { if (!confirm('Apagar "' + (i.desc || i.cat) + '"?')) return; mutateFin(function (v) { v.itens = v.itens.filter(function (x) { return x.id !== i.id; }); v.removidos.push(i.id); if (v.removidos.length > 3000) v.removidos.splice(0, v.removidos.length - 3000); return v; }); } }, '✕'));
      })));
    });
  }

  function viewMore(el) {
    var perm = 'Notification' in window ? Notification.permission : 'unsupported';
    el.append(
      h('button', { class: 'card linkcard', onclick: function () { go('files'); } }, h('span', { class: 'lc-ic' }, icone('files')), h('div', { class: 't' }, h('b', { text: 'Arquivos' }), h('div', { class: 'muted small', text: 'Mande do celular para o PC e baixe o que o PC mandou.' })), h('span', { class: 'lc-seta', text: '›' })),
      h('div', { class: 'sec', text: 'Alertas do PC' }),
      S.alerts.length ? h('div', {}, S.alerts.slice().reverse().slice(0, 30).map(function (a) {
        return h('div', { class: 'card alertItem' }, h('b', { text: a.title || 'Zeno' }), h('div', { text: a.body || '' }), h('div', { class: 'muted small', text: hhmm(a.at) }));
      })) : h('p', { class: 'hint', text: 'Quando um timer do computador tocar, ele avisa aqui.' }),
      h('div', { class: 'sec', text: 'Ajustes' }),
      h('div', { class: 'card' },
        h('div', { class: 'item' }, h('div', { class: 't' }, 'Zeno fala as respostas', h('div', { class: 'muted small', text: 'Sempre que responder. Por voz, ele já fala sozinho. Toque numa resposta para ouvir.' })),
          h('button', { class: 'btn sm' + (S.speak ? '' : ' alt'), onclick: function () { S.speak = !S.speak; LS.set('zeno.speak', S.speak); refreshView(); } }, S.speak ? 'Ligado' : 'Desligado')),
        h('div', { class: 'item' }, h('div', { class: 't' }, 'Compartilhar minha localização', h('div', { class: 'muted small', text: 'Só quando você pergunta de lugar ("onde estou", "perto de mim", rota). Vai direto para o seu PC.' })),
          h('button', { class: 'btn sm' + (S.loc ? '' : ' alt'), onclick: async function () {
            S.loc = !S.loc; LS.set('zeno.loc', S.loc);
            if (S.loc) { var p = await posicao(); if (!p) toast('Libere a localização para este app nos ajustes do celular.'); }
            refreshView();
          } }, S.loc ? 'Ligado' : 'Desligado')),
        h('div', { class: 'item' }, h('div', { class: 't' }, 'Notificações', h('div', { class: 'muted small', text: perm === 'granted' ? 'Ativadas.' : perm === 'denied' ? 'Bloqueadas nos ajustes do iPhone.' : perm === 'unsupported' ? 'No iPhone, primeiro use Compartilhar > Adicionar à Tela de Início.' : 'Avisa mesmo com o app fechado.' })),
          perm === 'default' ? h('button', { class: 'btn sm', onclick: enableNotifications }, 'Ativar') : null),
        h('div', { class: 'item' }, h('div', { class: 't' }, 'Conta', h('div', { class: 'muted small', text: (sb.auth.user() || {}).email || '' })),
          h('button', { class: 'btn alt sm', onclick: logout }, 'Sair'))),
      h('p', { class: 'hint', text: 'Zeno no celular 1.12 · O PC precisa estar ligado com o Zeno aberto.' }));
  }
  async function enableNotifications() {
    try {
      var p = await Notification.requestPermission();
      if (p === 'granted') await subscribePush();
      toast(p === 'granted' ? 'Notificações ativadas ✔' : 'Notificações não liberadas.');
    } catch (e) { toast(e.message); }
    refreshView();
  }
  function b64ToBytes(s) { var p = '='.repeat((4 - s.length % 4) % 4); var r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); var o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
  function b64Url(buf) { var s = ''; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  async function subscribePush() {
    if (!CFG.vapid || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapid) });
    var j = sub.toJSON();
    await sb.db.upsert('zeno_push', { endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: DEV }, 'endpoint');
    return true;
  }
  async function logout() {
    try { await sb.db.remove('zeno_push', { device: 'eq.' + DEV }); } catch (_) { /* sem internet */ }
    sb.auth.signOut(); LS.set('zeno.conta', null); stop(); renderLogin('Você saiu.');
  }

  // ---------- eventos do PC ----------
  function notifyOS(title, body) {
    if (document.visibilityState === 'visible') return;
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body, icon: 'icons/icon-192.png' }); } catch (_) { /* sem permissão */ }
  }
  var seenEv = {};
  function onEvent(ev, initial) {
    if (ev.id) { if (seenEv[ev.id]) return; seenEv[ev.id] = 1; }
    var d = ev.data || {};
    var age = Date.now() - Date.parse(ev.created_at);
    if (ev.kind === 'reply') {
      var p = pend[d.command];
      if (p) {
        delete pend[d.command];
        if (p.mode === 'chat') { dropWait(p.waitId); botMood('success', 2600); pushMsg({ who: 'bot', text: ev.body || '(sem resposta)' }); if (p.voice || S.speak) speakText(ev.body); }
        else if (p.mode === 'quiet') { if (d.ok === false) toast(semMarcas(ev.body || '').slice(0, 140)); return; }
        else toast(semMarcas(ev.body || '').slice(0, 140));
        notifyOS('Zeno', semMarcas(ev.body || ''));
      } else if (!initial && age < 60000 && ev.body) {
        pushMsg({ who: 'bot', text: ev.body });
      }
    } else if (ev.kind === 'alert') {
      if (S.alerts.some(function (a) { return a.id === ev.id; })) return;
      S.alerts.push({ id: ev.id, title: ev.title, body: ev.body, at: Date.parse(ev.created_at) });
      S.alerts = S.alerts.slice(-60); LS.set('zeno.alerts', S.alerts);
      if (!initial) { toast('🔔 ' + (ev.body || ev.title)); notifyOS(ev.title || 'Zeno', ev.body || ''); speakText(ev.body); refreshView(); }
    } else if (ev.kind === 'confirm') {
      if (initial && age > CONFIRM_TTL) return;
      if (age > CONFIRM_TTL || S.answered.indexOf(d.id) >= 0 || S.confirms.some(function (c) { return c.id === d.id; })) return;
      S.confirms.push({ id: d.id, title: ev.title, body: ev.body, at: Date.parse(ev.created_at) });
      if (S.tab !== 'chat') S.unread++;
      drawChat(); updateTabs(); notifyOS('Zeno pede permissão', ev.title || '');
      try { if (navigator.vibrate) navigator.vibrate(120); } catch (_) { /* sem vibração */ }
    } else if (ev.kind === 'file') {
      if (S.inbox.some(function (f) { return f.path === d.path; })) return;
      var f = { path: d.path, name: d.name || ev.title || 'arquivo', size: d.size || 0, mime: d.mime || '', at: Date.parse(ev.created_at) };
      var wasShot = d.command && pend[d.command] && pend[d.command].mode === 'shot';
      if (wasShot) delete pend[d.command];
      else { S.inbox.push(f); S.inbox = S.inbox.slice(-30); LS.set('zeno.inbox', S.inbox); }
      if (!initial && age < 120000) { if (wasShot) openFile(f); else { toast('📎 Arquivo do PC: ' + f.name); refreshView(); } }
    }
  }
  async function pollEvents() {
    var initial = !S.since;
    var since = S.since || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    var rows = await sb.db.select('zeno_events', { created_at: 'gt.' + since, order: 'created_at.asc', limit: '60' });
    (rows || []).forEach(function (ev) { try { onEvent(ev, initial); } catch (e) { console.error('evento', e && e.message); } });
    S.since = rows && rows.length ? rows[rows.length - 1].created_at : (S.since || new Date().toISOString());
    // confirmações que ninguém respondeu expiram sozinhas
    var n = S.confirms.length;
    S.confirms = S.confirms.filter(function (c) { return Date.now() - c.at < CONFIRM_TTL; });
    if (S.confirms.length !== n) drawChat();
  }
  async function pollPc() {
    var rows = await sb.db.select('zeno_devices', { kind: 'eq.pc', select: 'last_seen', order: 'last_seen.desc', limit: '1' });
    var t = rows && rows[0] ? Date.parse(rows[0].last_seen) : 0;
    S.pcSeen = t;
    S.pcOnline = !!t && Date.now() - t < PC_ONLINE_MS;
    updateTop();
  }
  async function heartbeat() {
    await sb.db.upsert('zeno_devices', { id: DEV, kind: 'phone', name: SO === 'android' ? 'Android' : SO === 'ios' ? 'iPhone' : 'Celular', platform: SO || 'web', last_seen: new Date().toISOString() }, 'id');
  }

  // ---------- laço ----------
  var loopT = null; var running = false; var inflight = false;
  async function tick() {
    if (!running || inflight) return;
    inflight = true;
    tickN++;
    try {
      await pollEvents();
      if (tickN === 1 || tickN % 4 === 0) { await pollPc(); await pullSync(); }
      if (S.tab === 'ctl') await pollPlayer();
      if (S.tab === 'day' && tickN % 2 === 0 && tickN % 4 !== 0) await pullSync();
      if (S.tab === 'fin' && tickN % 2 === 0 && tickN % 4 !== 0) await pullSync();
      await beat();
      if (tickN === 1 || tickN % 24 === 0) await heartbeat();
      var slot = document.getElementById('offline'); if (slot) slot.remove();
    } catch (e) {
      if (e.offline) { if (!document.getElementById('offline')) { var b = h('div', { class: 'banner info', id: 'offline', text: 'Sem internet no celular. Tentando de novo…' }); var s = document.getElementById('bannerSlot'); if (s) s.append(b); } }
      else if (/Sem login|Invalid Refresh|incorretos/i.test(e.message) || !sb.auth.signedIn()) {
        inflight = false;
        if (await reentrar()) return;
        stop(); renderLogin('Sua sessão expirou. Entre de novo.', 'err');
      }
      else if (/row-level security|42501/i.test(e.message)) { stop(); sb.auth.signOut(); LS.set('zeno.conta', null); renderLogin('Sua assinatura do Zeno não está ativa. Renove para usar o celular.', 'err'); }
    }
    inflight = false;
  }
  function loop() { if (!running) return; tick(); loopT = setTimeout(loop, document.visibilityState === 'visible' ? 2500 : 15000); }
  function stop() { running = false; clearTimeout(loopT); }
  function start() {
    S.since = null; tickN = 0;
    buildShell(); updateTop();
    running = true; loop();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribePush().catch(function () { /* sem push */ });
  }
  document.addEventListener('visibilitychange', function () { if (running) beat(); if (document.visibilityState === 'visible' && running) { clearTimeout(loopT); loop(); } });

  // ---------- início ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* sem cache offline */ });
  finishGoogle().then(async function (handled) {
    if (handled) return;
    if (sb.auth.signedIn()) { start(); return; }
    if (LS.get('zeno.conta', null)) { clear(app); app.append(h('div', { class: 'login' }, mascotEl('big', 'happy'), h('p', { text: 'Entrando…' }))); if (await reentrar()) { start(); return; } }
    renderLogin();
  });
  window.__zeno = { S: S, sb: sb, tick: tick, onEvent: onEvent }; // para testes
})();
