#!/usr/bin/env node
// Converts the design-handoff prototypes (docs/design-handoff/*.dc.html) into
// Next.js screens under src/screens/<name>/:
//   logic.js  – the prototype's `class Component extends DCLogic` (state, renderVals)
//   view.tsx  – the <x-dc> template compiled to JSX
//   styles.css – the <helmet> styles + style-hover/style-focus pseudo classes
// Re-run with `npm run convert` after updating the handoff files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument } from 'htmlparser2';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'docs/design-handoff');
const OUT = path.join(ROOT, 'src/screens');

// prototype file -> app route
export const ROUTES = {
  'Nixopay Landing': '/',
  auth: '/auth',
  'admin-auth': '/admin/login',
  'admin-panel': '/admin',
  panel: '/panel',
};
const TITLES = {
  'Nixopay Landing': 'نیکسوپی | پرداخت ارزی آسان',
  about: 'درباره ما', contact: 'تماس با ما', terms: 'قوانین و مقررات',
  auth: 'ورود / ثبت‌نام', 'admin-auth': 'ورود مدیران', 'admin-panel': 'پنل مدیریت', panel: 'پنل کاربری',
  'subscription-plans': 'خرید اشتراک',
  'service-subscriptions': 'خرید اشتراک سرویس‌های خارجی', 'service-giftcards': 'خرید گیفت کارت',
  'service-payments': 'پرداخت ارزی', 'service-shopping': 'خرید از سایت‌های خارجی', 'service-travel': 'خدمات سفر',
  'service-direct': 'پرداخت مستقیم', 'service-cards': 'کارت‌های مجازی',
  'payment-embassy': 'پرداخت هزینه سفارت', 'payment-exams': 'پرداخت هزینه آزمون‌ها', 'payment-hotel': 'رزرو هتل خارجی',
  'payment-premium': 'خرید اکانت پریمیوم', 'payment-seo': 'پرداخت ابزارهای سئو', 'payment-shopping': 'خرید از فروشگاه‌های خارجی',
  'payment-tickets': 'خرید بلیت خارجی',
};
const routeFor = (name) => ROUTES[name] ?? '/' + name;
const slug = (name) => (name === 'Nixopay Landing' ? 'landing' : name);

// Rewrite links to other prototypes and to static assets.
function rewriteUrls(str) {
  return str
    .replace(/(?:\.\/)?((?:[\w-]+|Nixopay(?: |%20)Landing))\.dc\.html/g, (_, n) => routeFor(n.replace('%20', ' ')))
    .replace(/(^|["'(\s,])(?:\.\/)?(uploads|logos|assets)\//g, '$1/$2/')
    .replace(/(^|["'(\s,])(?:\.\/)?nikso-fa-white\.svg/g, '$1/nikso-fa-white.svg');
}

const EVENT_MAP = {
  onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit',
  onkeydown: 'onKeyDown', onkeyup: 'onKeyUp', onkeypress: 'onKeyPress', onmousedown: 'onMouseDown',
  onmouseup: 'onMouseUp', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave',
  onfocus: 'onFocus', onblur: 'onBlur', ondoubleclick: 'onDoubleClick', oncontextmenu: 'onContextMenu',
};
const ATTR_MAP = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', maxlength: 'maxLength', minlength: 'minLength',
  readonly: 'readOnly', colspan: 'colSpan', rowspan: 'rowSpan', autocomplete: 'autoComplete',
  autofocus: 'autoFocus', crossorigin: 'crossOrigin', srcset: 'srcSet', enterkeyhint: 'enterKeyHint',
  inputmode: 'inputMode', spellcheck: 'spellCheck', contenteditable: 'contentEditable',
  frameborder: 'frameBorder', allowfullscreen: 'allowFullScreen', 'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace', 'xmlns:xlink': 'xmlnsXlink', datetime: 'dateTime', novalidate: 'noValidate',
};
const BOOL_ATTRS = new Set(['disabled', 'checked', 'readOnly', 'required', 'selected', 'autoFocus', 'multiple', 'hidden', 'noValidate', 'allowFullScreen', 'open']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function cssToObj(css) {
  const o = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    o[prop.startsWith('--') ? prop : camel(prop)] = decl.slice(i + 1).trim();
  }
  return o;
}

function convertFile(file) {
  const name = file.replace(/\.dc\.html$/, '');
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8');
  const open = /<x-dc(?:\s[^>]*)?>/.exec(raw);
  const close = raw.lastIndexOf('</x-dc>');
  let template = raw.slice(open.index + open[0].length, close);

  // --- helmet -> css
  let cssText = '';
  template = template.replace(/<helmet>([\s\S]*?)<\/helmet>/i, (_, inner) => {
    for (const m of inner.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssText += m[1].trim() + '\n';
    return '';
  });
  cssText = cssText.replace(/body\s*\{[^}]*\}/, '').replace(/\*\s*\{\s*box-sizing:\s*border-box;\s*\}/, '');

  // --- logic
  const sm = /<script type="text\/x-dc" data-dc-script(?: data-props="([^"]*)")?>([\s\S]*?)<\/script>/.exec(raw);
  let defaults = {};
  if (sm && sm[1]) {
    const meta = JSON.parse(sm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    for (const [k, v] of Object.entries(meta)) if (k[0] !== '$') defaults[k] = v.default;
  }
  const logicSrc = sm ? sm[2] : 'class Component extends DCLogic { renderVals() { return {}; } }';

  // --- pseudo classes
  const pseudo = new Map();
  const pseudoClass = (kind, cssDecl) => {
    const key = kind + '|' + cssDecl;
    if (!pseudo.has(key)) {
      const cls = 'p' + crypto.createHash('md5').update(key).digest('hex').slice(0, 7);
      const sel = kind === 'before' || kind === 'after' ? `.${cls}::${kind}` : `.${cls}:${kind}`;
      // !important so pseudo-state rules win over the inline base styles, matching the prototype's intent
      const decls = cssDecl.split(';').map((d) => d.trim()).filter(Boolean)
        .map((d) => (/!important/.test(d) ? d : d + ' !important')).join('; ');
      pseudo.set(key, { cls, rule: `${sel} { ${decls}; }` });
    }
    return pseudo.get(key).cls;
  };

  const doc = parseDocument(template, { lowerCaseAttributeNames: false, lowerCaseTags: false, recognizeSelfClosing: true, decodeEntities: true });

  // path "a.b.0.c" -> JS expression, resolving the head against loop scope or v
  const expr = (p, scope) => {
    p = p.trim();
    const parts = p.split('.');
    const head = parts.shift();
    let out = scope.has(head) ? scope.get(head) : `v[${JSON.stringify(head)}]`;
    for (const seg of parts) out += /^\d+$/.test(seg) ? `?.[${seg}]` : `?.${seg}`;
    return out;
  };
  const attrExpr = (value, scope) => {
    const whole = value.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) return { dyn: true, code: expr(whole[1], scope) };
    if (value.includes('{{')) {
      const parts = value.split(/\{\{([\s\S]+?)\}\}/g);
      return { dyn: true, str: true, code: '`' + parts.map((s, i) => (i & 1 ? '${s(' + expr(s, scope) + ')}' : s.replace(/[`\\$]/g, '\\$&'))).join('') + '`' };
    }
    return { dyn: false, code: JSON.stringify(rewriteUrls(value)), raw: rewriteUrls(value) };
  };

  let loopN = 0;
  const walk = (node, scope, ind) => {
    if (node.type === 'text') {
      const txt = node.data;
      if (!txt.includes('{{')) {
        if (!txt.trim() && !txt.includes(' ')) return null;
        return `{${JSON.stringify(txt)}}`;
      }
      return txt.split(/\{\{([\s\S]+?)\}\}/g).map((p, i) => (i & 1 ? `{t(${expr(p, scope)})}` : p ? `{${JSON.stringify(p)}}` : '')).join('');
    }
    if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return null;
    const tag = node.name;
    const attrs = node.attribs || {};
    const kids = (sc) => node.children.map((c) => walk(c, sc, ind + '  ')).filter(Boolean);

    if (tag === 'sc-for') {
      const listCode = attrExpr(attrs.list || '', scope).code;
      const as = attrs.as || 'item';
      const id = ++loopN;
      const sc = new Map(scope);
      sc.set(as, `_${as}${id}`);
      sc.set('$index', `_i${id}`);
      const body = kids(sc);
      return `{arr(${listCode}).map((_${as}${id}: any, _i${id}: number) => (\n${ind}  <React.Fragment key={_i${id}}>\n${ind}    ${body.join(`\n${ind}    `)}\n${ind}  </React.Fragment>\n${ind}))}`;
    }
    if (tag === 'sc-if') {
      const cond = attrExpr(attrs.value || '', scope).code;
      const body = kids(scope);
      if (!body.length) return null;
      return `{${cond} ? (\n${ind}  <>\n${ind}    ${body.join(`\n${ind}    `)}\n${ind}  </>\n${ind}) : null}`;
    }
    if (tag === 'x-import') {
      // <image-slot> design placeholder -> neutral image area
      const st = attrs.style ? cssToObj(attrs.style) : {};
      return `<div style={${JSON.stringify({ ...st, background: 'linear-gradient(135deg,#e9edf5,#f6f8fc)', borderRadius: '20px' })}} aria-hidden="true" />`;
    }

    const props = [];
    const classes = [];
    let classDyn = null;
    const dynClasses = [];
    for (let [k, value] of Object.entries(attrs)) {
      if (k.startsWith('hint-')) continue;
      if (k.startsWith('style-')) {
        if (value.includes('{{')) dynClasses.push(`pc(${JSON.stringify(k.slice(6))}, ${attrExpr(value, scope).code})`);
        else classes.push(pseudoClass(k.slice(6), value));
        continue;
      }
      const lk = k.toLowerCase();
      let key = k;
      if (lk.startsWith('on')) key = EVENT_MAP[lk] || 'on' + k[2].toUpperCase() + k.slice(3);
      else if (ATTR_MAP[lk]) key = ATTR_MAP[lk];
      else if (k.includes('-') && !k.startsWith('data-') && !k.startsWith('aria-')) key = camel(k);
      const a = attrExpr(value, scope);
      if (key === 'style') {
        if (!a.dyn) props.push(`style={${JSON.stringify(cssToObj(a.raw))}}`);
        else props.push(`style={css(${a.code})}`);
        continue;
      }
      if (key === 'className') {
        if (a.dyn) classDyn = a.code; else classes.unshift(a.raw);
        continue;
      }
      if ((key === 'value' || key === 'checked') && a.dyn) {
        props.push(`${key}={${a.code} ?? ${key === 'checked' ? 'false' : "''"}}`);
        continue;
      }
      if (!a.dyn && BOOL_ATTRS.has(key) && (value === '' || value === key.toLowerCase())) { props.push(`${key}={true}`); continue; }
      if (a.dyn) props.push(`${key}={${a.code}}`);
      else props.push(`${key}=${/["{}<>]/.test(a.raw) || a.raw.includes('\n') ? `{${a.code}}` : a.code}`);
    }
    if (classDyn || dynClasses.length) props.push(`className={[${[classDyn, JSON.stringify(classes.join(' ')), ...dynClasses].filter(Boolean).join(', ')}].filter(Boolean).join(' ')}`);
    else if (classes.length) props.push(`className=${JSON.stringify(classes.join(' '))}`);
    // uncontrolled inputs that only set value/checked statically
    const attrStr = props.length ? ' ' + props.join(' ') : '';

    if (tag === 'style' || tag === 'script') {
      const content = node.children.map((c) => c.data || '').join('');
      return `<${tag}${attrStr} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(content)} }} />`;
    }
    if (tag === 'textarea' && !attrs.value) {
      const content = node.children.map((c) => c.data || '').join('');
      return `<textarea${attrStr}${content ? ` defaultValue={${JSON.stringify(content)}}` : ''} />`;
    }
    if (VOID.has(tag)) return `<${tag}${attrStr} />`;
    const body = kids(scope);
    if (!body.length) return `<${tag}${attrStr} />`;
    return `<${tag}${attrStr}>\n${ind}  ${body.join(`\n${ind}  `)}\n${ind}</${tag}>`;
  };

  const top = doc.children.map((c) => walk(c, new Map(), '    ')).filter(Boolean);
  const view = `// @ts-nocheck
// GENERATED by scripts/convert-dc.mjs from docs/design-handoff/${file} — do not edit by hand.
import React from 'react';
import { t, css, s, arr, pc } from '@/dc/runtime';

export default function View(v: Record<string, any>) {
  return (
    <>
      ${top.join('\n      ')}
    </>
  );
}
`;

  // Static inputs with a value but no onChange must be uncontrolled in React.
  const viewFixed = view
    .replace(/<(input|select)((?:(?!\/>|>)[\s\S])*?) value=("[^"]*"|\{"[^"]*"\})/g, (m, tg, rest, val) => `<${tg}${rest} defaultValue=${val}`)
    .replace(/<input((?:(?!\/>)[\s\S])*?) checked=\{true\}/g, (m, rest) => (/onChange=/.test(rest) || /onChange=/.test(m) ? m : `<input${rest} defaultChecked={true}`));

  const logic = `// @ts-nocheck
// GENERATED by scripts/convert-dc.mjs from docs/design-handoff/${file} (prototype logic: state + renderVals).
import React from 'react';
import { DCLogic } from '@/dc/runtime';
${rewriteUrls(logicSrc).trim()}

export default Component;
`;

  const pseudoCss = [...pseudo.values()].map((p) => p.rule).join('\n');
  const styles = `/* GENERATED by scripts/convert-dc.mjs from docs/design-handoff/${file} */\n${cssText.trim()}\n${pseudoCss}\n`;

  const screen = `'use client';
// GENERATED by scripts/convert-dc.mjs — do not edit by hand.
import { createScreen } from '@/dc/runtime';
import Logic from './logic';
import View from './view';
import './styles.css';

const Screen = createScreen(Logic, View, ${JSON.stringify(defaults)});
export default Screen;
`;

  const dir = path.join(OUT, slug(name));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'view.tsx'), viewFixed);
  fs.writeFileSync(path.join(dir, 'logic.js'), logic);
  fs.writeFileSync(path.join(dir, 'styles.css'), styles);
  fs.writeFileSync(path.join(dir, 'index.tsx'), screen);
  return { name, slug: slug(name), route: routeFor(name) };
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.dc.html')).sort();
const out = files.map(convertFile);
fs.writeFileSync(path.join(OUT, 'routes.json'), JSON.stringify(out, null, 2) + '\n');

// App router pages. Screens are rendered client-only: the prototype logic reads
// window/location and simulates a drifting exchange rate.
const APP = path.join(ROOT, 'src/app');
for (const r of out) {
  const dir = path.join(APP, '(screens)', r.route === '/' ? '' : r.route.slice(1));
  fs.mkdirSync(dir, { recursive: true });
  const title = TITLES[r.name] ?? r.name;
  fs.writeFileSync(path.join(dir, 'client.tsx'), `'use client';
// GENERATED by scripts/convert-dc.mjs — do not edit by hand.
import dynamic from 'next/dynamic';

const Screen = dynamic(() => import('@/screens/${r.slug}'), { ssr: false });

export default function Client() {
  return <Screen />;
}
`);
  fs.writeFileSync(path.join(dir, 'page.tsx'), `// GENERATED by scripts/convert-dc.mjs — do not edit by hand.
import type { Metadata } from 'next';
import Client from './client';

export const metadata: Metadata = { title: ${JSON.stringify(title)} };

export default function Page() {
  return <Client />;
}
`);
}
console.log(`converted ${out.length} screens`);
