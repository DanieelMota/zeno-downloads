/* Notas ligadas do Zeno (estilo Obsidian): título, [[links]] e links de volta.
 * Uma nota continua sendo { id, text, tags, created } e ganha um "title" opcional. O título se escreve no começo do texto:
 *     # Título | corpo da nota        (uma linha, serve no celular)
 *     # Título⏎corpo da nota          (várias linhas, serve no computador)
 * e uma nota aponta para outra com [[Título]] ou [[Título|texto que aparece]].
 * Este arquivo é puro (sem DOM, rede nem relógio) e roda no navegador, no Node e (copiado) no servidor.
 * CÓPIAS IDÊNTICAS: mobile/grafo.js (esta), src/renderer/grafo.js; o servidor (extras/ia-agente.mjs) tem uma versão em ESM
 * e o teste test/grafo-tests.js confere que as três se comportam igual. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZenoGrafo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_TITULO = 80;
  var MAX_LINKS = 20;

  // minúsculas, sem acento, espaços juntos: "  Projeto  ÁLFA " e "projeto alfa" são o mesmo título
  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  // "# Título | corpo", "# Título\ncorpo" ou só "# Título" -> { titulo, corpo }. Sem "# " no começo, não tem título.
  function lerTitulo(texto) {
    var t = String(texto == null ? '' : texto).replace(/^\s+/, '');
    var m = t.match(/^#[ \t]+([^\n|]{1,80}?)[ \t]*(?:\|[ \t]*|\n+|$)([\s\S]*)$/);
    if (!m || !m[1].trim()) return { titulo: '', corpo: String(texto == null ? '' : texto).trim() };
    return { titulo: m[1].trim().slice(0, MAX_TITULO), corpo: m[2].trim() };
  }

  // [[Alvo]] e [[Alvo|rótulo]] -> [{ alvo, rotulo }] (sem repetir o mesmo alvo)
  function links(texto) {
    var out = []; var vistos = {};
    var re = /\[\[([^\[\]|\n]{1,80}?)(?:\|([^\[\]\n]{1,80}))?\]\]/g; var m;
    while ((m = re.exec(String(texto == null ? '' : texto))) && out.length < MAX_LINKS) {
      var alvo = m[1].trim(); var k = norm(alvo);
      if (!k || vistos[k]) continue;
      vistos[k] = true; out.push({ alvo: alvo, rotulo: (m[2] || '').trim() || alvo });
    }
    return out;
  }

  // para desenhar o texto com os links como botões, sem innerHTML: [{ t: 'txt', v }, { t: 'link', alvo, rotulo }]
  function partes(texto) {
    var s = String(texto == null ? '' : texto); var out = []; var ult = 0;
    var re = /\[\[([^\[\]|\n]{1,80}?)(?:\|([^\[\]\n]{1,80}))?\]\]/g; var m;
    while ((m = re.exec(s))) {
      var alvo = m[1].trim(); if (!norm(alvo)) continue;
      if (m.index > ult) out.push({ t: 'txt', v: s.slice(ult, m.index) });
      out.push({ t: 'link', alvo: alvo, rotulo: (m[2] || '').trim() || alvo });
      ult = m.index + m[0].length;
    }
    if (ult < s.length) out.push({ t: 'txt', v: s.slice(ult) });
    return out;
  }

  // a nota que tem esse título (a mais antiga, se houver repetidas) ou null
  function resolver(notas, alvo) {
    var k = norm(alvo); if (!k) return null;
    var ach = null;
    (notas || []).forEach(function (n) { if (n && n.title && norm(n.title) === k && (!ach || (n.created || 0) < (ach.created || 0))) ach = n; });
    return ach;
  }

  // { saem: [{ alvo, rotulo, nota|null }], entram: [nota] }: para onde esta nota aponta e quem aponta para ela
  function ligacoes(notas, nota) {
    var lista = notas || [];
    var saem = links(nota && nota.text).map(function (l) { return { alvo: l.alvo, rotulo: l.rotulo, nota: resolver(lista, l.alvo) }; });
    var entram = [];
    var meu = nota && nota.title ? norm(nota.title) : '';
    if (meu) lista.forEach(function (n) {
      if (!n || n.id === nota.id) return;
      if (links(n.text).some(function (l) { return norm(l.alvo) === meu; })) entram.push(n);
    });
    return { saem: saem, entram: entram };
  }

  // o que mostrar como "nome" de uma nota na lista: o título ou o começo do texto
  function nome(nota, max) {
    var t = (nota && nota.title) || String((nota && nota.text) || '').replace(/\s+/g, ' ').trim();
    return t.length > (max || 60) ? t.slice(0, (max || 60) - 1) + '…' : t;
  }

  // uma linha para a IA ler: "Título: texto (liga a: A, B (não existe); citada por: C)"
  function linhaIA(nota, notas, maxTexto) {
    var l = ligacoes(notas, nota);
    var cab = nota.title ? nota.title + ': ' : '';
    var txt = String(nota.text || '').replace(/\s+/g, ' ').trim().slice(0, maxTexto || 200);
    var extra = [];
    if (l.saem.length) extra.push('liga a: ' + l.saem.map(function (x) { return x.alvo + (x.nota ? '' : ' (não existe)'); }).join(', '));
    if (l.entram.length) extra.push('citada por: ' + l.entram.map(function (n) { return nome(n, 40); }).join(', '));
    return cab + txt + (extra.length ? ' (' + extra.join('; ') + ')' : '');
  }

  return { MAX_TITULO: MAX_TITULO, norm: norm, lerTitulo: lerTitulo, links: links, partes: partes, resolver: resolver, ligacoes: ligacoes, nome: nome, linhaIA: linhaIA };
});
