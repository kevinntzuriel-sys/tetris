(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://lquomhusqzigepcyjlqy.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_yGYCgVN6HHLmwObhTnLkjw_4Gc8pm0f';

  const hasCredentials =
    SUPABASE_URL.indexOf('TU-PROYECTO') === -1 &&
    SUPABASE_ANON_KEY.indexOf('TU-ANON-KEY') === -1;

  const hasLibrary = !!(global.supabase && typeof global.supabase.createClient === 'function');

  const isConfigured = hasCredentials && hasLibrary;

  const client = isConfigured
    ? global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  if (!hasLibrary) {
    console.warn('[TetrisDB] No se cargó supabase-js desde el CDN. Funciona solo el modo invitado.');
  } else if (!hasCredentials) {
    console.warn('[TetrisDB] Configura SUPABASE_URL y SUPABASE_ANON_KEY en supabase-config.js.');
  }

  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

  const ERROR_TRANSLATIONS = [
    [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo.'],
    [/email not confirmed/i, 'Debes confirmar tu correo antes de iniciar sesión.'],
    [/password should be at least|weak password/i, 'La contraseña debe tener al menos 6 caracteres.'],
    [/unable to validate email|invalid email|email address .* is invalid/i, 'El correo electrónico no es válido.'],
    [/rate limit|too many requests|security purposes/i, 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'],
    [/failed to fetch|networkerror|network request failed/i, 'No se pudo conectar con el servidor. Revisa tu conexión.']
  ];

  function toFriendlyError(error) {
    const message = (error && error.message) ? error.message : String(error);
    for (let i = 0; i < ERROR_TRANSLATIONS.length; i++) {
      if (ERROR_TRANSLATIONS[i][0].test(message)) return new Error(ERROR_TRANSLATIONS[i][1]);
    }
    return new Error(message);
  }

  function requireClient() {
    if (!client) {
      throw new Error('Supabase no está configurado. Edita supabase-config.js con tu URL y tu anon key.');
    }
    return client;
  }

  function sanitizeUsername(raw) {
    let name = String(raw || '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 20);
    while (name.length < 3) name += '_';
    return name;
  }

  async function signUp(params) {
    const sb = requireClient();
    const username = String(params.username || '').trim();
    if (!USERNAME_RE.test(username)) {
      throw new Error('El nombre de usuario debe tener de 3 a 20 caracteres (letras, números o guion bajo).');
    }

    const result = await sb.auth.signUp({
      email: String(params.email || '').trim(),
      password: params.password,
      options: { data: { username: username } }
    });
    if (result.error) throw toFriendlyError(result.error);

    const user = result.data.user;

    if (user && Array.isArray(user.identities) && user.identities.length === 0) {
      throw new Error('Ya existe una cuenta con ese correo.');
    }
    return { user: user, needsConfirmation: !result.data.session };
  }

  async function signIn(params) {
    const sb = requireClient();
    const result = await sb.auth.signInWithPassword({
      email: String(params.email || '').trim(),
      password: params.password
    });
    if (result.error) throw toFriendlyError(result.error);
    return { user: result.data.user };
  }

  async function signOut() {
    const sb = requireClient();
    const result = await sb.auth.signOut();
    if (result.error) throw toFriendlyError(result.error);
  }

  async function getCurrentUser() {
    if (!client) return null;
    const result = await client.auth.getSession();
    return (result.data && result.data.session && result.data.session.user) || null;
  }

  function getUsername(user) {
    if (!user) return null;
    const meta = user.user_metadata && user.user_metadata.username;
    if (meta) return sanitizeUsername(meta);
    return sanitizeUsername(user.email ? user.email.split('@')[0] : 'jugador');
  }

  function onAuthChange(callback) {
    if (!client) return function () {};
    const listener = client.auth.onAuthStateChange(function (event, session) {

      setTimeout(function () {
        callback((session && session.user) || null, event);
      }, 0);
    });
    return function unsubscribe() {
      listener.data.subscription.unsubscribe();
    };
  }

  async function getLeaderboard(limit) {
    const sb = requireClient();
    const result = await sb
      .from('scores')
      .select('username, score')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit || 10);
    if (result.error) throw toFriendlyError(result.error);
    return result.data || [];
  }

  async function getMyBest() {
    const user = await getCurrentUser();
    if (!user) return null;
    const sb = requireClient();
    const result = await sb
      .from('scores')
      .select('score')
      .eq('user_id', user.id)
      .maybeSingle();
    if (result.error) throw toFriendlyError(result.error);
    return result.data ? result.data.score : null;
  }

  async function saveScore(score) {
    const value = Math.floor(Number(score));
    if (!Number.isFinite(value) || value < 0) throw new Error('Puntuación no válida.');

    const user = await getCurrentUser();
    if (!user) return { saved: false, improved: false, best: null, reason: 'guest' };

    const sb = requireClient();
    const previous = await getMyBest();
    if (previous !== null && previous >= value) {
      return { saved: false, improved: false, best: previous };
    }

    const result = await sb
      .from('scores')
      .upsert(
        { user_id: user.id, username: getUsername(user), score: value },
        { onConflict: 'user_id' }
      );
    if (result.error) throw toFriendlyError(result.error);
    return { saved: true, improved: true, best: value };
  }

  global.TetrisDB = {
    isConfigured: isConfigured,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    getUsername: getUsername,
    onAuthChange: onAuthChange,
    getLeaderboard: getLeaderboard,
    getMyBest: getMyBest,
    saveScore: saveScore
  };
})(window);
