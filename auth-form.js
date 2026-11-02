(function () {
  'use strict';

  const root = document.getElementById('auth-app');

  if (!window.Vue) {
    if (root) {
      root.removeAttribute('v-cloak');
      root.textContent = 'No se pudo cargar el formulario de acceso. Revisa tu conexión y recarga la página.';
    }
    window.AuthForm = {
      setMode: function () {},
      reset: function () {},
      focusFirst: function () {}
    };
    return;
  }

  const Vue = window.Vue;

  const USERNAME_MIN = 3;
  const USERNAME_MAX = 20;
  const PASSWORD_MIN = 6;
  const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const STRENGTH_LABELS = { weak: 'Débil', medium: 'Media', strong: 'Fuerte' };

  function missingChars(count) {
    return count === 1 ? 'Falta 1 carácter' : 'Faltan ' + count + ' caracteres';
  }

  function evaluateStrength(password) {
    if (!password) return { level: 'weak', label: STRENGTH_LABELS.weak, percent: 0 };

    let points = 0;
    if (password.length >= PASSWORD_MIN) points += 1;
    if (password.length >= 10) points += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
    if (/\d/.test(password)) points += 1;
    if (/[^A-Za-z0-9]/.test(password)) points += 1;
    if (password.length < PASSWORD_MIN) points = Math.min(points, 1);

    const level = points >= 4 ? 'strong' : points === 3 ? 'medium' : 'weak';
    return {
      level: level,
      label: STRENGTH_LABELS[level],
      percent: Math.max(points, 1) * 20
    };
  }

  const app = Vue.createApp({
    setup: function () {
      const mode = Vue.ref('login');
      const form = Vue.reactive({ username: '', email: '', password: '', confirm: '' });
      const touched = Vue.reactive({ username: false, email: false, password: false, confirm: false });
      const showPassword = Vue.ref(false);
      const submitting = Vue.ref(false);
      const message = Vue.reactive({ text: '', kind: '' });
      const usernameInput = Vue.ref(null);
      const emailInput = Vue.ref(null);

      const isRegister = Vue.computed(function () { return mode.value === 'register'; });

      const fields = Vue.computed(function () {
        return isRegister.value
          ? ['username', 'email', 'password', 'confirm']
          : ['email', 'password'];
      });

      const errors = Vue.computed(function () {
        const result = { username: '', email: '', password: '', confirm: '' };

        if (isRegister.value) {
          const username = form.username.trim();
          if (!username) result.username = 'Escribe un nombre de usuario.';
          else if (username.length < USERNAME_MIN) result.username = missingChars(USERNAME_MIN - username.length) + ' (mínimo ' + USERNAME_MIN + ').';
          else if (username.length > USERNAME_MAX) result.username = 'Máximo ' + USERNAME_MAX + ' caracteres.';
          else if (!USERNAME_PATTERN.test(username)) result.username = 'Solo letras, números y guion bajo (_), sin espacios.';
        }

        const email = form.email.trim();
        if (!email) result.email = 'Escribe tu correo electrónico.';
        else if (!EMAIL_PATTERN.test(email)) result.email = 'El correo no tiene un formato válido (ej. nombre@correo.com).';

        if (!form.password) result.password = 'Escribe tu contraseña.';
        else if (isRegister.value && form.password.length < PASSWORD_MIN) result.password = missingChars(PASSWORD_MIN - form.password.length) + ' (mínimo ' + PASSWORD_MIN + ').';

        if (isRegister.value) {
          if (!form.confirm) result.confirm = 'Confirma tu contraseña.';
          else if (form.confirm !== form.password) result.confirm = 'Las contraseñas no coinciden.';
        }

        return result;
      });

      const formValid = Vue.computed(function () {
        return fields.value.every(function (field) { return !errors.value[field]; });
      });

      const canSubmit = Vue.computed(function () { return formValid.value && !submitting.value; });

      const strength = Vue.computed(function () { return evaluateStrength(form.password); });

      const submitLabel = Vue.computed(function () {
        if (submitting.value) return 'Procesando...';
        return isRegister.value ? 'Crear cuenta' : 'Iniciar sesión';
      });

      function touch(field) { touched[field] = true; }

      function resetTouched() {
        Object.keys(touched).forEach(function (field) { touched[field] = false; });
      }

      function showError(field) { return touched[field] && !!errors.value[field]; }

      function stateClass(field) {
        if (showError(field)) return 'is-invalid';
        if (form[field] && !errors.value[field]) return 'is-valid';
        return '';
      }

      function setMessage(text, kind) {
        message.text = text || '';
        message.kind = kind || '';
      }

      function setMode(next) {
        mode.value = next === 'register' ? 'register' : 'login';
        form.confirm = '';
        showPassword.value = false;
        resetTouched();
        setMessage('');
      }

      function reset() {
        form.password = '';
        form.confirm = '';
        showPassword.value = false;
        resetTouched();
        setMessage('');
      }

      function focusFirst() {
        Vue.nextTick(function () {
          const target = isRegister.value ? usernameInput.value : emailInput.value;
          if (target) target.focus();
        });
      }

      function finish() {
        document.dispatchEvent(new CustomEvent('authform:done'));
      }

      async function submit() {
        setMessage('');
        const DB = window.TetrisDB;

        if (!DB || !DB.isConfigured) {
          setMessage('Las cuentas no están disponibles: falta configurar Supabase en supabase-config.js.', 'error');
          return;
        }
        if (!formValid.value) {
          fields.value.forEach(touch);
          return;
        }

        const email = form.email.trim();
        const password = form.password;

        submitting.value = true;
        try {
          if (isRegister.value) {
            const result = await DB.signUp({
              email: email,
              password: password,
              username: form.username.trim()
            });
            if (result.needsConfirmation) {
              setMode('login');
              setMessage('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.', 'success');
            } else {
              finish();
            }
          } else {
            await DB.signIn({ email: email, password: password });
            finish();
          }
        } catch (err) {
          setMessage(err.message, 'error');
        } finally {
          submitting.value = false;
        }
      }

      return {
        USERNAME_MAX: USERNAME_MAX,
        mode: mode,
        form: form,
        showPassword: showPassword,
        submitting: submitting,
        message: message,
        usernameInput: usernameInput,
        emailInput: emailInput,
        isRegister: isRegister,
        errors: errors,
        canSubmit: canSubmit,
        strength: strength,
        submitLabel: submitLabel,
        touch: touch,
        showError: showError,
        stateClass: stateClass,
        setMode: setMode,
        reset: reset,
        focusFirst: focusFirst,
        submit: submit
      };
    }
  });

  const vm = app.mount('#auth-app');

  window.AuthForm = {
    setMode: vm.setMode,
    reset: vm.reset,
    focusFirst: vm.focusFirst
  };
})();

