(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mobile menu
  var header = document.querySelector('header.nav');
  var menuBtn = document.querySelector('.menu-btn');
  if (header && menuBtn) {
    var setOpen = function (open) {
      header.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    menuBtn.addEventListener('click', function () { setOpen(!header.classList.contains('open')); });
    header.querySelectorAll('nav a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }

  // Cursor glow on cards
  document.querySelectorAll('.card').forEach(function (c) {
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  // Workflow console: replays the example run step by step (full log is visible without JS or with reduced motion)
  var steps = document.querySelectorAll('#wf li'), bar = document.getElementById('wf-bar');
  if (bar && steps.length) {
    if (reduce) { bar.style.width = '100%'; }
    else {
      var i = 0;
      var tick = function () {
        steps.forEach(function (li, n) { li.classList.toggle('wait', n > i); });
        bar.style.width = ((i + 1) / steps.length * 100) + '%';
        i = i + 1;
        if (i < steps.length) setTimeout(tick, 900);
        else setTimeout(function () { i = 0; tick(); }, 3500);
      };
      tick();
    }
  }

  // Contact form: saves each enquiry to Supabase and emails a copy through Web3Forms.
  // Both keys are public by design: the Supabase key can only insert enquiries, never read them,
  // and the database itself validates every field and rate-limits repeat submissions.
  var SUPABASE_URL = 'https://fyofzskmgbquqahuylcs.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_r7TyIYhZxF7RIRYovkkN-A_HKC7j_ds';
  var WEB3FORMS_KEY = ''; // paste your Web3Forms access key here to get email copies

  var MIN_FILL_MS = 3000;          // bots submit instantly; people take a few seconds
  var COOLDOWN_MS = 60 * 1000;     // one submission per minute from the same browser
  var loadedAt = Date.now();

  var form = document.getElementById('lead-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var button = form.querySelector('button[type="submit"]');

  function clip(v, max) { return String(v || '').trim().slice(0, max); }
  function lastSent() { try { return Number(localStorage.getItem('roots_last_enquiry')) || 0; } catch (e) { return 0; } }
  function markSent() { try { localStorage.setItem('roots_last_enquiry', String(Date.now())); } catch (e) { /* storage blocked */ } }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = clip(form.elements.name.value, 120);
    var email = clip(form.elements.email.value, 200);

    // Honeypot: real visitors never see or fill this field.
    if (form.elements.website && form.elements.website.value) {
      status.textContent = 'Thanks, we\'ll be in touch soon.';
      form.reset();
      return;
    }
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      status.textContent = 'Please add your name and a valid email.';
      return;
    }
    if (Date.now() - loadedAt < MIN_FILL_MS) {
      status.textContent = 'Please take a moment to fill in the form, then send it again.';
      return;
    }
    if (Date.now() - lastSent() < COOLDOWN_MS) {
      status.textContent = 'We\'ve already received your request. Please wait a minute before sending another.';
      return;
    }

    var lead = {
      name: name,
      email: email,
      business: clip(form.elements.business.value, 200) || null,
      interests: Array.prototype.map.call(form.querySelectorAll('input[name="interest"]:checked'), function (c) { return c.value; }).slice(0, 10),
      message: clip(form.elements.message.value, 5000) || null
    };
    button.disabled = true;
    status.textContent = 'Sending…';

    var save = fetch(SUPABASE_URL + '/rest/v1/enquiries', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(lead)
    }).then(function (r) { if (!r.ok) throw new Error('save failed'); });

    var mail = WEB3FORMS_KEY ? fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: 'New Roots enquiry from ' + name,
        from_name: 'Roots website',
        replyto: email,
        name: name, email: email,
        business: lead.business || '-',
        interests: lead.interests.join(', ') || '-',
        message: lead.message || '-',
        botcheck: ''
      })
    }).then(function (r) { if (!r.ok) throw new Error('email failed'); }) : Promise.reject(new Error('no email key'));

    // Count the enquiry as received if either the database or the email went through.
    Promise.allSettled([save, mail]).then(function (results) {
      button.disabled = false;
      if (results.some(function (x) { return x.status === 'fulfilled'; })) {
        markSent();
        status.textContent = 'Thanks, ' + name.split(' ')[0] + '. We\'ll be in touch within one business day.';
        form.reset();
      } else {
        status.textContent = 'Something went wrong sending your request. Please try again in a few minutes.';
      }
    });
  });
})();
