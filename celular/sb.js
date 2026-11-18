/* Cliente mínimo do Supabase (login, tabelas, funções e arquivos) sem dependências.
 * Usado pelo Zeno do computador (Node/Electron) e pelo app do celular (navegador): é o mesmo arquivo.
 * O login é e-mail + senha ou Google (OAuth com PKCE); a sessão (com refresh) é guardada por quem chama, via storage.get/set. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZenoSB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createClient(opts) {
    var url = String(opts.url || '').replace(/\/+$/, '');
    var key = opts.key;
    var f = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    var storage = opts.storage || { get: function () { return null; }, set: function () {} };
    var session = null;
    var loaded = false;
    var refreshing = null;

    function load() {
      if (loaded) return;
      loaded = true;
      try { var raw = storage.get(); session = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; } catch (_) { session = null; }
    }
    function save(s) {
      session = s;
      loaded = true;
      try { storage.set(s ? JSON.stringify(s) : ''); } catch (_) { /* sem armazenamento */ }
    }
    function pack(j) {
      var now = Math.floor(Date.now() / 1000);
      return {
        access_token: j.access_token, refresh_token: j.refresh_token,
        expires_at: j.expires_at || (now + (j.expires_in || 3600)),
        user: j.user ? { id: j.user.id, email: j.user.email } : (session && session.user) || null,
      };
    }
    function errText(j, status) {
      var m = (j && (j.error_description || j.msg || j.message || j.error)) || ('HTTP ' + status);
      if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
      if (/Email not confirmed/i.test(m)) return 'Falta confirmar o e-mail: abra o link que o Supabase enviou para a sua caixa de entrada.';
      if (/already registered|already been registered/i.test(m)) return 'Esse e-mail já tem conta. Use "Entrar".';
      if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
      if (/rate limit/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
      if (/provider is not enabled|Unsupported provider/i.test(m)) return 'O login com Google ainda não foi ligado no Supabase (Authentication › Sign In / Providers › Google).';
      if (/code verifier|invalid flow state|flow state/i.test(m)) return 'O login com Google expirou ou foi aberto em outro aparelho. Tente de novo.';
      return String(m);
    }
    async function raw(method, path, o) {
      o = o || {};
      var headers = Object.assign({ apikey: key, 'content-type': 'application/json' }, o.headers || {});
      var res;
      try {
        res = await f(url + path, { method: method, headers: headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
      } catch (e) { var err = new Error('Sem internet ou nuvem fora do ar.'); err.offline = true; throw err; }
      var text = await res.text();
      var json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
      if (!res.ok) { var e2 = new Error(errText(json, res.status)); e2.status = res.status; e2.body = json; throw e2; }
      return json;
    }

    var auth = {
      async signUp(email, password) {
        var j = await raw('POST', '/auth/v1/signup', { body: { email: email, password: password } });
        if (j && j.access_token) { save(pack(j)); return { signedIn: true }; }
        return { signedIn: false, needsConfirm: true };
      },
      async signIn(email, password) {
        var j = await raw('POST', '/auth/v1/token?grant_type=password', { body: { email: email, password: password } });
        save(pack(j));
        return { signedIn: true, user: session.user };
      },
      async refresh() {
        load();
        if (!session || !session.refresh_token) throw new Error('Sem login.');
        if (refreshing) return refreshing;
        refreshing = (async function () {
          try {
            var j = await raw('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } });
            save(pack(j));
            return session;
          } catch (e) {
            if (e.status === 400 || e.status === 401) save(null); // refresh inválido: pede login de novo
            throw e;
          } finally { refreshing = null; }
        })();
        return refreshing;
      },
      // Google (1.6): oauthUrl monta o endereço do Google com PKCE; exchangeCode troca o "code" da volta pela sessão.
      oauthUrl(provider, redirectTo, challenge) {
        return url + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) + '&redirect_to=' + encodeURIComponent(redirectTo) +
          '&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=s256';
      },
      async exchangeCode(code, verifier) {
        var j = await raw('POST', '/auth/v1/token?grant_type=pkce', { body: { auth_code: String(code || ''), code_verifier: String(verifier || '') } });
        save(pack(j));
        return { signedIn: true, user: session.user };
      },
      signOut() { save(null); },
      setSession(j) { save(pack(j)); return { signedIn: true, user: session.user }; }, // 1.9.12: sessão vinda do servidor de licenças
      user() { load(); return session ? session.user : null; },
      signedIn() { load(); return !!(session && session.refresh_token); },
      async token() {
        load();
        if (!session) throw new Error('Sem login.');
        if (session.expires_at - 60 < Math.floor(Date.now() / 1000)) await auth.refresh();
        return session.access_token;
      },
    };

    async function authed(method, path, o) {
      o = o || {};
      var run = async function () {
        var t = await auth.token();
        return raw(method, path, { body: o.body, headers: Object.assign({ authorization: 'Bearer ' + t }, o.headers || {}) });
      };
      try { return await run(); } catch (e) {
        if (e.status === 401) { await auth.refresh(); return run(); }
        throw e;
      }
    }

    function qs(query) {
      if (!query) return '';
      var p = Object.keys(query).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); });
      return p.length ? '?' + p.join('&') : '';
    }
    var db = {
      select: function (table, query) { return authed('GET', '/rest/v1/' + table + qs(query)); },
      insert: function (table, row, ret) { return authed('POST', '/rest/v1/' + table, { body: row, headers: { prefer: ret === false ? 'return=minimal' : 'return=representation' } }); },
      update: function (table, query, patch) { return authed('PATCH', '/rest/v1/' + table + qs(query), { body: patch, headers: { prefer: 'return=representation' } }); },
      upsert: function (table, row, onConflict) { return authed('POST', '/rest/v1/' + table + (onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : ''), { body: row, headers: { prefer: 'resolution=merge-duplicates,return=representation' } }); },
      remove: function (table, query) { return authed('DELETE', '/rest/v1/' + table + qs(query)); },
      rpc: function (name, args) { return authed('POST', '/rest/v1/rpc/' + name, { body: args || {} }); },
    };

    var files = {
      // data: Blob/ArrayBuffer/Uint8Array. Retorna o caminho gravado.
      async upload(path, data, contentType) {
        var t = await auth.token();
        var res = await f(url + '/storage/v1/object/zeno-files/' + path.split('/').map(encodeURIComponent).join('/'), {
          method: 'POST', headers: { apikey: key, authorization: 'Bearer ' + t, 'content-type': contentType || 'application/octet-stream', 'x-upsert': 'true' }, body: data,
        });
        if (!res.ok) { var j = null; try { j = await res.json(); } catch (_) { /* vazio */ } throw new Error((j && (j.message || j.error)) || 'Não consegui enviar o arquivo (' + res.status + ').'); }
        return path;
      },
      async download(path) {
        var t = await auth.token();
        var res = await f(url + '/storage/v1/object/authenticated/zeno-files/' + path.split('/').map(encodeURIComponent).join('/'), { headers: { apikey: key, authorization: 'Bearer ' + t } });
        if (!res.ok) throw new Error('Não consegui baixar o arquivo (' + res.status + ').');
        return res;
      },
      remove: function (paths) { return authed('DELETE', '/storage/v1/object/zeno-files', { body: { prefixes: paths } }); },
    };

    return { auth: auth, db: db, files: files, url: url };
  }

  // PKCE: verificador aleatório (43+ letras) e desafio = base64url(SHA-256(verificador)).
  function b64url(bytes) {
    var bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function cryptoObj() { return (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto : require('crypto').webcrypto; }
  async function pkcePair() {
    var c = cryptoObj(); var a = new Uint8Array(32); c.getRandomValues(a);
    var verifier = b64url(a);
    var hash = new Uint8Array(await c.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    return { verifier: verifier, challenge: b64url(hash) };
  }

  return { createClient: createClient, pkcePair: pkcePair };
});
