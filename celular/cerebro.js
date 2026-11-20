/* Cérebro do Zeno no celular (1.16.7): conversa com a IA direto do aparelho, sem o computador ligado.
 * A chave é a do próprio cliente e fica só neste aparelho. Claude usa o formato da Anthropic; ChatGPT, Gemini e Groq usam o formato "compatível com OpenAI".
 * O mesmo arquivo roda no navegador do celular e no Node (para os testes). Quem chama dá as ferramentas (tarefas, notas, finanças…). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZenoCerebro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // mesmos modelos padrão do Zeno do computador (src/main/store.js)
  var PROVS = {
    anthropic: { nome: 'Claude', modelo: 'claude-sonnet-5-5', prefixo: 'sk-ant-' },
    openai: { nome: 'ChatGPT', base: 'https://api.openai.com/v1', modelo: 'gpt-4.1-mini', prefixo: 'sk-' },
    gemini: { nome: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modelo: 'gemini-3.6-flash', prefixo: 'AIza' },
    groq: { nome: 'Groq', base: 'https://api.groq.com/openai/v1', modelo: 'openai/gpt-oss-120b', prefixo: 'gsk_' },
    // 1.16.8: a IA incluída na assinatura (roda no servidor do Zeno, sem chave do cliente, com limite por dia e por semana).
    // Aqui a "chave" é a sessão do cliente no Supabase e o endereço (base) é dado por quem chama.
    zenoia: { nome: 'IA do Zeno', modelo: 'zeno', prefixo: '', servidor: true },
  };
  var MAX_PASSOS = 6;
  var TEMPO_MS = 60000;
  var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // erros em português curto (nunca o JSON cru do provedor)
  function erroAmigavel(prov, status, rede) {
    var n = (PROVS[prov] || {}).nome || 'a IA';
    var e;
    if (rede) e = new Error('Sem conexão com a internet. Tente de novo quando voltar.');
    else if (status === 401 || status === 403) e = new Error('A chave do ' + n + ' foi recusada. Confira em Mais › IA do celular.');
    else if (status === 429) e = new Error('O ' + n + ' chegou no limite de uso agora. Tente de novo em instantes.');
    else if (status === 400 || status === 404) e = new Error('O ' + n + ' não aceitou o pedido (modelo ou chave com problema). Confira em Mais › IA do celular.');
    else e = new Error('O ' + n + ' está instável agora (erro ' + status + '). Tente de novo em instantes.');
    e.status = status; e.rede = !!rede;
    return e;
  }

  async function postar(f, prov, url, headers, body) {
    var ult = null;
    for (var tent = 0; tent < 2; tent++) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, TEMPO_MS) : null;
      var res;
      try {
        res = await f(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      } catch (_) { if (t) clearTimeout(t); throw erroAmigavel(prov, 0, true); }
      if (t) clearTimeout(t);
      var json = null;
      try { json = await res.json(); } catch (_) { json = null; }
      if (res.ok) return json || {};
      ult = erroAmigavel(prov, res.status, false);
      var tenta = res.status === 429 || res.status >= 500;
      if (PROVS[prov] && PROVS[prov].servidor) {
        // a IA do Zeno explica sozinha (limite do dia/semana, assinatura, preparando…) e já devolveu o gasto se o modelo falhou
        if (json && json.mensagem) { ult = new Error(json.mensagem); ult.status = res.status; ult.codigo = json.codigo || ''; ult.volta = json.volta || null; ult.zeno = { uso: json.uso, limites: json.limites }; }
        tenta = res.status >= 500 && res.status !== 503;
      }
      if (!tenta || tent === 1) throw ult;
      await espera(1500);
    }
    throw ult;
  }

  async function rodarFerramenta(tools, nome, args) {
    var t = null;
    for (var i = 0; i < tools.length; i++) if (tools[i].name === nome) t = tools[i];
    if (!t) return 'Erro: ferramenta desconhecida (' + nome + ').';
    try { var r = await t.run(args || {}); return String(r == null ? 'ok' : r).slice(0, 6000); }
    catch (e) { return 'Erro: ' + (e && e.message ? e.message : 'falhou'); }
  }

  // ---------- Claude (Anthropic) ----------
  async function viaAnthropic(o) {
    var f = o.fetch;
    var msgs = o.historico.slice(); msgs.push({ role: 'user', content: o.texto });
    var defs = o.tools.map(function (t) { return { name: t.name, description: t.description, input_schema: t.input_schema }; });
    for (var passo = 0; passo < (o.maxPassos || MAX_PASSOS); passo++) {
      var corpo = { model: o.modelo, max_tokens: 1024, system: o.system, messages: msgs };
      if (defs.length) corpo.tools = defs;
      var j = await postar(f, 'anthropic', 'https://api.anthropic.com/v1/messages', {
        'x-api-key': o.chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true', // a chave é do próprio cliente, usada no aparelho dele
      }, corpo);
      var cont = Array.isArray(j.content) ? j.content : [];
      msgs.push({ role: 'assistant', content: cont });
      var usos = cont.filter(function (b) { return b.type === 'tool_use'; });
      if (!usos.length || j.stop_reason !== 'tool_use') return cont.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(' ').trim();
      var resultados = [];
      for (var i = 0; i < usos.length; i++) {
        if (o.aoUsar) o.aoUsar(usos[i].name);
        resultados.push({ type: 'tool_result', tool_use_id: usos[i].id, content: await rodarFerramenta(o.tools, usos[i].name, usos[i].input) });
      }
      msgs.push({ role: 'user', content: resultados });
    }
    return 'Não consegui terminar esse pedido. Tente de novo de um jeito mais simples.';
  }

  // ---------- ChatGPT, Gemini e Groq (formato compatível com OpenAI) ----------
  async function viaCompat(o) {
    var f = o.fetch; var P = PROVS[o.prov]; var base = o.base || P.base;
    var msgs = [{ role: 'system', content: o.system }].concat(o.historico, [{ role: 'user', content: o.texto }]);
    var defs = o.tools.map(function (t) { return { type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }; });
    for (var passo = 0; passo < (o.maxPassos || MAX_PASSOS); passo++) {
      var corpo = { model: o.modelo, messages: msgs, max_tokens: 1024 };
      if (defs.length) corpo.tools = defs;
      var j = await postar(f, o.prov, base + '/chat/completions', { authorization: 'Bearer ' + o.chave, 'content-type': 'application/json' }, corpo);
      var m = j.choices && j.choices[0] && j.choices[0].message;
      if (!m) throw erroAmigavel(o.prov, 502, false);
      if (j.zeno && o.aoUso) { try { o.aoUso(j.zeno); } catch (_) { /* medidor é só enfeite */ } }
      msgs.push(m);
      var chamadas = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      if (!chamadas.length) return String(m.content || '').trim();
      for (var i = 0; i < chamadas.length; i++) {
        var c = chamadas[i]; var args = {};
        try { args = JSON.parse((c.function && c.function.arguments) || '{}'); } catch (_) { args = {}; }
        if (o.aoUsar) o.aoUsar(c.function.name);
        msgs.push({ role: 'tool', tool_call_id: c.id, content: await rodarFerramenta(o.tools, c.function.name, args) });
      }
    }
    return 'Não consegui terminar esse pedido. Tente de novo de um jeito mais simples.';
  }

  // o: { prov, chave, modelo?, system, historico:[{role,content}], texto, tools:[{name,description,input_schema,run}], fetch, aoUsar? }
  async function conversar(o) {
    var P = PROVS[o.prov];
    if (!P) throw new Error('IA desconhecida.');
    if (!o.chave) throw new Error(P.servidor ? 'Entre de novo no app do Zeno para usar a IA do Zeno.' : 'Falta a chave do ' + P.nome + '. Coloque em Mais › IA do celular.');
    if (P.servidor && !o.base) throw new Error('IA do Zeno sem endereço.');
    var x = { prov: o.prov, chave: String(o.chave).trim(), modelo: o.modelo || P.modelo, system: o.system || '', historico: o.historico || [], texto: String(o.texto || ''),
      tools: o.tools || [], fetch: o.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), aoUsar: o.aoUsar, aoUso: o.aoUso, base: o.base, maxPassos: o.maxPassos };
    if (!x.fetch) throw erroAmigavel(o.prov, 0, true);
    return o.prov === 'anthropic' ? viaAnthropic(x) : viaCompat(x);
  }

  // conversa do celular → histórico para a IA: só você/Zeno, começando por você, sem papéis repetidos
  function historicoDe(msgs, max) {
    var out = [];
    (msgs || []).forEach(function (m) {
      if (!m || m.wait || (m.who !== 'me' && m.who !== 'bot')) return;
      var texto = String(m.text || '').trim(); if (!texto) return;
      var role = m.who === 'me' ? 'user' : 'assistant';
      if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + texto;
      else out.push({ role: role, content: texto.slice(0, 2000) });
    });
    out = out.slice(-(max || 12));
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  return { conversar: conversar, historicoDe: historicoDe, PROVS: PROVS, erroAmigavel: erroAmigavel };
});
