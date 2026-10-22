'use client';
// Minimal runtime for screens generated from the design handoff (*.dc.html).
// Each screen = a logic class (state + renderVals) + a generated JSX view.
import React from 'react';

export class DCLogic<P = any, S = any> {
  props: P;
  state: S = {} as S;
  __host: any;
  constructor(props: P) {
    this.props = props || ({} as P);
  }
  setState(update: any, cb?: () => void) {
    this.__host && this.__host.setLogicState(update, cb);
  }
  forceUpdate() {
    this.__host && this.__host.forceUpdate();
  }
  componentDidMount() {}
  componentDidUpdate(_prevProps: P) {}
  componentWillUnmount() {}
  renderVals(): Record<string, any> {
    return {};
  }
}

type ViewFn = (v: Record<string, any>) => React.ReactNode;

export function createScreen(Logic: any, View: ViewFn, defaults: Record<string, any> = {}) {
  return class Screen extends React.Component<any> {
    logic: any;
    constructor(props: any) {
      super(props);
      this.logic = new Logic({ ...defaults, ...props });
      this.logic.__host = this;
      this.state = { v: 0 };
    }
    setLogicState(update: any, cb?: () => void) {
      const prev = this.logic.state;
      const patch = typeof update === 'function' ? update(prev, this.logic.props) : update;
      if (patch == null) return;
      this.logic.state = { ...prev, ...patch };
      this.setState((s: any) => ({ v: s.v + 1 }), cb);
    }
    componentDidMount() {
      this.logic.componentDidMount();
    }
    componentDidUpdate(prevProps: any) {
      this.logic.props = { ...defaults, ...this.props };
      this.logic.componentDidUpdate(prevProps);
    }
    componentWillUnmount() {
      this.logic.componentWillUnmount();
    }
    render() {
      const props = { ...defaults, ...this.props };
      this.logic.props = props;
      return View({ ...props, ...(this.logic.renderVals() || {}) });
    }
  };
}

// Helpers used by generated views.
export function t(v: any): React.ReactNode {
  if (v === undefined || v === null || typeof v === 'boolean') return null;
  if (React.isValidElement(v) || Array.isArray(v)) return v as any;
  return String(v);
}

function kebabToCamel(s: string) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function css(v: any): React.CSSProperties | undefined {
  if (v == null || v === false) return undefined;
  if (typeof v !== 'string') return v;
  const o: Record<string, string> = {};
  for (const decl of v.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith('--') ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
  }
  return o as React.CSSProperties;
}

export function s(v: any): string {
  return v == null ? '' : String(v);
}

export function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

// Runtime pseudo-class rules for style-hover/style-focus values bound to data.
const pseudoCache = new Map<string, string>();
let pseudoSheet: CSSStyleSheet | null = null;
export function pc(kind: string, decl: any): string {
  if (typeof document === 'undefined' || !decl || typeof decl !== 'string') return '';
  const key = kind + '|' + decl;
  const hit = pseudoCache.get(key);
  if (hit) return hit;
  if (!pseudoSheet) {
    const el = document.createElement('style');
    document.head.appendChild(el);
    pseudoSheet = el.sheet;
  }
  const cls = 'pd' + pseudoCache.size.toString(36);
  const sel = kind === 'before' || kind === 'after' ? `.${cls}::${kind}` : `.${cls}:${kind}`;
  const body = decl.split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => (/!important/.test(d) ? d : d + ' !important')).join('; ');
  try {
    pseudoSheet!.insertRule(`${sel} { ${body}; }`, pseudoSheet!.cssRules.length);
  } catch {
    return '';
  }
  pseudoCache.set(key, cls);
  return cls;
}
