var Me = (s, e) => () => (e || (s((e = { exports: {} }).exports, e), s = null), e.exports);
function Hi(s) {
  return Math.pow(10, s / 20);
}
function Qi(s) {
  return 20 * (Math.log(s) / Math.LN10);
}
function Yi(s) {
  return Math.pow(2, s / 12);
}
var yn = 440;
function Ji() {
  return yn;
}
function Ki(s) {
  yn = s;
}
function at(s) {
  return Math.round(ea(s));
}
function ea(s) {
  return 69 + 12 * Math.log2(s / yn);
}
function Dr(s) {
  return yn * Math.pow(2, (s - 69) / 12);
}
var ta = /* @__PURE__ */ Me(((s, e) => {
  function t(n) {
    if (Array.isArray(n)) return n;
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), na = /* @__PURE__ */ Me(((s, e) => {
  function t(n, r) {
    var i = n == null ? null : typeof Symbol < "u" && n[Symbol.iterator] || n["@@iterator"];
    if (i != null) {
      var o, a, c, l, u = [], h = !0, d = !1;
      try {
        if (c = (i = i.call(n)).next, r === 0) {
          if (Object(i) !== i) return;
          h = !1;
        } else for (; !(h = (o = c.call(i)).done) && (u.push(o.value), u.length !== r); h = !0) ;
      } catch (f) {
        d = !0, a = f;
      } finally {
        try {
          if (!h && i.return != null && (l = i.return(), Object(l) !== l)) return;
        } finally {
          if (d) throw a;
        }
      }
      return u;
    }
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), sa = /* @__PURE__ */ Me(((s, e) => {
  function t(n, r) {
    (r == null || r > n.length) && (r = n.length);
    for (var i = 0, o = Array(r); i < r; i++) o[i] = n[i];
    return o;
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ra = /* @__PURE__ */ Me(((s, e) => {
  var t = sa();
  function n(r, i) {
    if (r) {
      if (typeof r == "string") return t(r, i);
      var o = {}.toString.call(r).slice(8, -1);
      return o === "Object" && r.constructor && (o = r.constructor.name), o === "Map" || o === "Set" ? Array.from(r) : o === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o) ? t(r, i) : void 0;
    }
  }
  e.exports = n, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ia = /* @__PURE__ */ Me(((s, e) => {
  function t() {
    throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), aa = /* @__PURE__ */ Me(((s, e) => {
  var t = ta(), n = na(), r = ra(), i = ia();
  function o(a, c) {
    return t(a) || n(a, c) || r(a, c) || i();
  }
  e.exports = o, e.exports.__esModule = !0, e.exports.default = e.exports;
})), oa = /* @__PURE__ */ Me(((s, e) => {
  function t(n, r) {
    if (!(n instanceof r)) throw new TypeError("Cannot call a class as a function");
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Er = /* @__PURE__ */ Me(((s, e) => {
  function t(n) {
    "@babel/helpers - typeof";
    return e.exports = t = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(r) {
      return typeof r;
    } : function(r) {
      return r && typeof Symbol == "function" && r.constructor === Symbol && r !== Symbol.prototype ? "symbol" : typeof r;
    }, e.exports.__esModule = !0, e.exports.default = e.exports, t(n);
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ca = /* @__PURE__ */ Me(((s, e) => {
  var t = Er().default;
  function n(r, i) {
    if (t(r) != "object" || !r) return r;
    var o = r[Symbol.toPrimitive];
    if (o !== void 0) {
      var a = o.call(r, i || "default");
      if (t(a) != "object") return a;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (i === "string" ? String : Number)(r);
  }
  e.exports = n, e.exports.__esModule = !0, e.exports.default = e.exports;
})), la = /* @__PURE__ */ Me(((s, e) => {
  var t = Er().default, n = ca();
  function r(i) {
    var o = n(i, "string");
    return t(o) == "symbol" ? o : o + "";
  }
  e.exports = r, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ua = /* @__PURE__ */ Me(((s, e) => {
  var t = la();
  function n(i, o) {
    for (var a = 0; a < o.length; a++) {
      var c = o[a];
      c.enumerable = c.enumerable || !1, c.configurable = !0, "value" in c && (c.writable = !0), Object.defineProperty(i, t(c.key), c);
    }
  }
  function r(i, o, a) {
    return o && n(i.prototype, o), a && n(i, a), Object.defineProperty(i, "prototype", { writable: !1 }), i;
  }
  e.exports = r, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ha = /* @__PURE__ */ Me(((s, e) => {
  (function(t, n) {
    typeof s == "object" && typeof e < "u" ? n(s, aa(), oa(), ua()) : typeof define == "function" && define.amd ? define([
      "exports",
      "@babel/runtime/helpers/slicedToArray",
      "@babel/runtime/helpers/classCallCheck",
      "@babel/runtime/helpers/createClass"
    ], n) : (t = typeof globalThis < "u" ? globalThis : t || self, n(t.automationEvents = {}, t._slicedToArray, t._classCallCheck, t._createClass));
  })(s, (function(t, n, r, i) {
    "use strict";
    var o = function(A, C, x) {
      return {
        endTime: C,
        insertTime: x,
        type: "exponentialRampToValue",
        value: A
      };
    }, a = function(A, C, x) {
      return {
        endTime: C,
        insertTime: x,
        type: "linearRampToValue",
        value: A
      };
    }, c = function(A, C) {
      return {
        startTime: C,
        type: "setValue",
        value: A
      };
    }, l = function(A, C, x) {
      return {
        duration: x,
        startTime: C,
        type: "setValueCurve",
        values: A
      };
    }, u = function(A, C, x) {
      var D = x.startTime, R = x.target, V = x.timeConstant;
      return R + (C - R) * Math.exp((D - A) / V);
    }, h = function(A) {
      return A.type === "exponentialRampToValue";
    }, d = function(A) {
      return A.type === "linearRampToValue";
    }, f = function(A) {
      return h(A) || d(A);
    }, p = function(A) {
      return A.type === "setValue";
    }, m = function(A) {
      return A.type === "setValueCurve";
    }, _ = function(A, C, x, D) {
      var R = A[C];
      return R === void 0 ? D : f(R) || p(R) ? R.value : m(R) ? R.values[R.values.length - 1] : u(x, _(A, C - 1, R.startTime, D), R);
    }, v = function(A, C, x, D, R) {
      return x === void 0 ? [D.insertTime, R] : f(x) ? [x.endTime, x.value] : p(x) ? [x.startTime, x.value] : m(x) ? [x.startTime + x.duration, x.values[x.values.length - 1]] : [x.startTime, _(A, C - 1, x.startTime, R)];
    }, b = function(A) {
      return A.type === "cancelAndHold";
    }, S = function(A) {
      return A.type === "cancelScheduledValues";
    }, k = function(A) {
      return b(A) || S(A) ? A.cancelTime : h(A) || d(A) ? A.endTime : A.startTime;
    }, g = function(A, C, x, D) {
      var R = D.endTime, V = D.value;
      return x === V ? V : 0 < x && 0 < V || x < 0 && V < 0 ? x * Math.pow(V / x, (A - C) / (R - C)) : A < R ? x : V;
    }, T = function(A, C, x, D) {
      var R = D.endTime, V = D.value;
      return x + (A - C) / (R - C) * (V - x);
    }, y = function(A, C) {
      var x = Math.floor(C);
      if (x === C) return A[x];
      var D = Math.ceil(C);
      return (1 - (C - x)) * A[x] + (1 - (D - C)) * A[D];
    }, w = function(A, C) {
      var x = C.duration, D = C.startTime, R = C.values;
      return y(R, (A - D) / x * (R.length - 1));
    }, I = function(A, C, x) {
      for (var D = A.length, R = Math.max(1, Math.floor(x / C * D)) + 1, V = A instanceof Float32Array ? new Float32Array(R) : A.slice(0, R), re = 0; re < R; re += 1) V[re] = y(A, re / (R - 1) * x / C * (D - 1));
      return V;
    }, E = function(A) {
      return A.type === "setTarget";
    }, O = /* @__PURE__ */ (function() {
      function F(A) {
        r(this, F), this._automationEvents = [], this._currenTime = 0, this._defaultValue = A;
      }
      return i(F, [
        {
          key: Symbol.iterator,
          value: function() {
            return this._automationEvents[Symbol.iterator]();
          }
        },
        {
          key: "add",
          value: function(C) {
            var x = k(C);
            if (b(C) || S(C)) {
              var D = this._automationEvents.findIndex(function(Oe) {
                return S(C) && m(Oe) ? Oe.startTime + Oe.duration >= x : k(Oe) >= x;
              }), R = this._automationEvents[D];
              if (D !== -1 && (this._automationEvents = this._automationEvents.slice(0, D)), b(C)) {
                var V = this._automationEvents[this._automationEvents.length - 1];
                if (R !== void 0 && f(R)) {
                  if (V !== void 0 && E(V)) throw new Error("The internal list is malformed.");
                  var re = V === void 0 ? R.insertTime : m(V) ? V.startTime + V.duration : k(V), z = V === void 0 ? this._defaultValue : m(V) ? V.values[V.values.length - 1] : V.value, J = h(R) ? g(x, re, z, R) : T(x, re, z, R), ie = h(R) ? o(J, x, this._currenTime) : a(J, x, this._currenTime);
                  this._automationEvents.push(ie);
                }
                if (V !== void 0 && E(V) && this._automationEvents.push(c(this.getValue(x), x)), V !== void 0 && m(V) && V.startTime + V.duration > x) {
                  var W = x - V.startTime;
                  this._automationEvents[this._automationEvents.length - 1] = l(I(V.values, V.duration, W), V.startTime, W);
                }
              }
            } else {
              var Te = this._automationEvents.findIndex(function(Oe) {
                return k(Oe) > x;
              }), Se = Te === -1 ? this._automationEvents[this._automationEvents.length - 1] : this._automationEvents[Te - 1];
              if (Se !== void 0 && m(Se) && k(Se) + Se.duration > x) return !1;
              var Ue = h(C) ? o(C.value, C.endTime, this._currenTime) : d(C) ? a(C.value, x, this._currenTime) : C;
              if (Te === -1) this._automationEvents.push(Ue);
              else {
                if (m(C) && x + C.duration > k(this._automationEvents[Te])) return !1;
                this._automationEvents.splice(Te, 0, Ue);
              }
            }
            return !0;
          }
        },
        {
          key: "flush",
          value: function(C) {
            var x = this._automationEvents.findIndex(function(V) {
              return k(V) > C;
            });
            if (x > 1) {
              var D = this._automationEvents.slice(x - 1), R = D[0];
              E(R) && D.unshift(c(_(this._automationEvents, x - 2, R.startTime, this._defaultValue), R.startTime)), this._automationEvents = D;
            }
          }
        },
        {
          key: "getValue",
          value: function(C) {
            if (this._automationEvents.length === 0) return this._defaultValue;
            var x = this._automationEvents.findIndex(function(Se) {
              return k(Se) > C;
            }), D = this._automationEvents[x], R = (x === -1 ? this._automationEvents.length : x) - 1, V = this._automationEvents[R];
            if (V !== void 0 && E(V) && (D === void 0 || !f(D) || D.insertTime > C)) return u(C, _(this._automationEvents, R - 1, V.startTime, this._defaultValue), V);
            if (V !== void 0 && p(V) && (D === void 0 || !f(D))) return V.value;
            if (V !== void 0 && m(V) && (D === void 0 || !f(D) || V.startTime + V.duration > C))
              return C < V.startTime + V.duration ? w(C, V) : V.values[V.values.length - 1];
            if (V !== void 0 && f(V) && (D === void 0 || !f(D))) return V.value;
            if (D !== void 0 && h(D)) {
              var re = n(v(this._automationEvents, R, V, D, this._defaultValue), 2), z = re[0], J = re[1];
              return g(C, z, J, D);
            }
            if (D !== void 0 && d(D)) {
              var ie = n(v(this._automationEvents, R, V, D, this._defaultValue), 2), W = ie[0], Te = ie[1];
              return T(C, W, Te, D);
            }
            return this._defaultValue;
          }
        }
      ]);
    })(), N = function(A) {
      return {
        cancelTime: A,
        type: "cancelAndHold"
      };
    }, q = function(A) {
      return {
        cancelTime: A,
        type: "cancelScheduledValues"
      };
    }, P = function(A, C) {
      return {
        endTime: C,
        type: "exponentialRampToValue",
        value: A
      };
    }, U = function(A, C) {
      return {
        endTime: C,
        type: "linearRampToValue",
        value: A
      };
    }, j = function(A, C, x) {
      return {
        startTime: C,
        target: A,
        timeConstant: x,
        type: "setTarget"
      };
    };
    t.AutomationEventList = O, t.createCancelAndHoldAutomationEvent = N, t.createCancelScheduledValuesAutomationEvent = q, t.createExponentialRampToValueAutomationEvent = P, t.createLinearRampToValueAutomationEvent = U, t.createSetTargetAutomationEvent = j, t.createSetValueAutomationEvent = c, t.createSetValueCurveAutomationEvent = l;
  }));
})), Ye = ha(), da = () => new DOMException("", "AbortError"), pa = (s) => (e, t, [n, r, i], o) => {
  s(e[r], [
    t,
    n,
    i
  ], (a) => a[0] === t && a[1] === n, o);
}, fa = (s) => (e, t, n) => {
  const r = [];
  for (let i = 0; i < n.numberOfInputs; i += 1) r.push(/* @__PURE__ */ new Set());
  s.set(e, {
    activeInputs: r,
    outputs: /* @__PURE__ */ new Set(),
    passiveInputs: /* @__PURE__ */ new WeakMap(),
    renderer: t
  });
}, ma = (s) => (e, t) => {
  s.set(e, {
    activeInputs: /* @__PURE__ */ new Set(),
    passiveInputs: /* @__PURE__ */ new WeakMap(),
    renderer: t
  });
}, St = /* @__PURE__ */ new WeakSet(), Ir = /* @__PURE__ */ new WeakMap(), As = /* @__PURE__ */ new WeakMap(), Rr = /* @__PURE__ */ new WeakMap(), ks = /* @__PURE__ */ new WeakMap(), Tn = /* @__PURE__ */ new WeakMap(), Vr = /* @__PURE__ */ new WeakMap(), Nn = /* @__PURE__ */ new WeakMap(), Mn = /* @__PURE__ */ new WeakMap(), Dn = /* @__PURE__ */ new WeakMap(), Pr = { construct() {
  return Pr;
} }, _a = (s) => {
  try {
    new new Proxy(s, Pr)();
  } catch {
    return !1;
  }
  return !0;
}, tr = /^import(?:(?:[\s]+[\w]+|(?:[\s]+[\w]+[\s]*,)?[\s]*\{[\s]*[\w]+(?:[\s]+as[\s]+[\w]+)?(?:[\s]*,[\s]*[\w]+(?:[\s]+as[\s]+[\w]+)?)*[\s]*}|(?:[\s]+[\w]+[\s]*,)?[\s]*\*[\s]+as[\s]+[\w]+)[\s]+from)?(?:[\s]*)("([^"\\]|\\.)+"|'([^'\\]|\\.)+')(?:[\s]*);?/, nr = (s, e) => {
  const t = [];
  let n = s.replace(/^[\s]+/, ""), r = n.match(tr);
  for (; r !== null; ) {
    const i = r[1].slice(1, -1), o = r[0].replace(/([\s]+)?;?$/, "").replace(i, new URL(i, e).toString());
    t.push(o), n = n.slice(r[0].length).replace(/^[\s]+/, ""), r = n.match(tr);
  }
  return [t.join(";"), n];
}, sr = (s) => {
  if (s !== void 0 && !Array.isArray(s)) throw new TypeError("The parameterDescriptors property of given value for processorCtor is not an array.");
}, rr = (s) => {
  if (!_a(s)) throw new TypeError("The given value for processorCtor should be a constructor.");
  if (s.prototype === null || typeof s.prototype != "object") throw new TypeError("The given value for processorCtor should have a prototype.");
}, ga = (s, e, t, n, r, i, o, a, c, l, u, h, d) => {
  let f = 0;
  return (p, m, _ = { credentials: "omit" }) => {
    const v = u.get(p);
    if (v !== void 0 && v.has(m)) return Promise.resolve();
    const b = l.get(p);
    if (b !== void 0) {
      const g = b.get(m);
      if (g !== void 0) return g;
    }
    const S = i(p), k = S.audioWorklet === void 0 ? r(m).then(([g, T]) => {
      const [y, w] = nr(g, T);
      return t(`${y};((a,b)=>{(a[b]=a[b]||[]).push((AudioWorkletProcessor,global,registerProcessor,sampleRate,self,window)=>{${w}
})})(window,'_AWGS')`);
    }).then(() => {
      const g = d._AWGS.pop();
      if (g === void 0) throw new SyntaxError();
      n(S.currentTime, S.sampleRate, () => g(class {
      }, void 0, (T, y) => {
        if (T.trim() === "") throw e();
        const w = Mn.get(S);
        if (w !== void 0) {
          if (w.has(T)) throw e();
          rr(y), sr(y.parameterDescriptors), w.set(T, y);
        } else
          rr(y), sr(y.parameterDescriptors), Mn.set(S, /* @__PURE__ */ new Map([[T, y]]));
      }, S.sampleRate, void 0, void 0));
    }) : Promise.all([r(m), Promise.resolve(s(h, h))]).then(([[g, T], y]) => {
      const w = f + 1;
      f = w;
      const [I, E] = nr(g, T), O = `${I};((AudioWorkletProcessor,registerProcessor)=>{${E}
})(${y ? "AudioWorkletProcessor" : "class extends AudioWorkletProcessor {__b=new WeakSet();constructor(){super();(p=>p.postMessage=(q=>(m,t)=>q.call(p,m,t?t.filter(u=>!this.__b.has(u)):t))(p.postMessage))(this.port)}}"},(n,p)=>registerProcessor(n,class extends p{${y ? "" : "__c = (a) => a.forEach(e=>this.__b.add(e.buffer));"}process(i,o,p){${y ? "" : "i.forEach(this.__c);o.forEach(this.__c);this.__c(Object.values(p));"}return super.process(i.map(j=>j.some(k=>k.length===0)?[]:j),o,p)}}));registerProcessor('__sac${w}',class extends AudioWorkletProcessor{process(){return !1}})`, N = new Blob([O], { type: "application/javascript; charset=utf-8" }), q = URL.createObjectURL(N);
      return S.audioWorklet.addModule(q, _).then(() => {
        if (a(S)) return S;
        const P = o(S);
        return P.audioWorklet.addModule(q, _).then(() => P);
      }).then((P) => {
        if (c === null) throw new SyntaxError();
        try {
          new c(P, `__sac${w}`);
        } catch {
          throw new SyntaxError();
        }
      }).finally(() => URL.revokeObjectURL(q));
    });
    return b === void 0 ? l.set(p, /* @__PURE__ */ new Map([[m, k]])) : b.set(m, k), k.then(() => {
      const g = u.get(p);
      g === void 0 ? u.set(p, /* @__PURE__ */ new Set([m])) : g.add(m);
    }).finally(() => {
      const g = l.get(p);
      g !== void 0 && g.delete(m);
    }), k;
  };
}, Ve = (s, e) => {
  const t = s.get(e);
  if (t === void 0) throw new Error("A value with the given key could not be found.");
  return t;
}, wn = (s, e) => {
  const t = Array.from(s).filter(e);
  if (t.length > 1) throw Error("More than one element was found.");
  if (t.length === 0) throw Error("No element was found.");
  const [n] = t;
  return s.delete(n), n;
}, Fr = (s, e, t, n) => {
  const r = Ve(s, e), i = wn(r, (o) => o[0] === t && o[1] === n);
  return r.size === 0 && s.delete(e), i;
}, Gt = (s) => Ve(Vr, s), At = (s) => {
  if (St.has(s)) throw new Error("The AudioNode is already stored.");
  St.add(s), Gt(s).forEach((e) => e(!0));
}, qr = (s) => "port" in s, zt = (s) => {
  if (!St.has(s)) throw new Error("The AudioNode is not stored.");
  St.delete(s), Gt(s).forEach((e) => e(!1));
}, En = (s, e) => {
  !qr(s) && e.every((t) => t.size === 0) && zt(s);
}, va = (s, e, t, n, r, i, o, a, c, l, u, h, d) => {
  const f = /* @__PURE__ */ new WeakMap();
  return (p, m, _, v, b) => {
    const { activeInputs: S, passiveInputs: k } = i(m), { outputs: g } = i(p), T = a(p), y = (w) => {
      const I = c(m), E = c(p);
      if (w) {
        const O = Fr(k, p, _, v);
        s(S, p, O, !1), !b && !h(p) && t(E, I, _, v), d(m) && At(m);
      } else {
        const O = n(S, p, _, v);
        e(k, v, O, !1), !b && !h(p) && r(E, I, _, v);
        const N = o(m);
        if (N === 0)
          u(m) && En(m, S);
        else {
          const q = f.get(m);
          q !== void 0 && clearTimeout(q), f.set(m, setTimeout(() => {
            u(m) && En(m, S);
          }, N * 1e3));
        }
      }
    };
    return l(g, [
      m,
      _,
      v
    ], (w) => w[0] === m && w[1] === _ && w[2] === v, !0) ? (T.add(y), u(p) ? s(S, p, [
      _,
      v,
      y
    ], !0) : e(k, v, [
      p,
      _,
      y
    ], !0), !0) : !1;
  };
}, ya = (s) => (e, t, [n, r, i], o) => {
  const a = e.get(n);
  a === void 0 ? e.set(n, /* @__PURE__ */ new Set([[
    r,
    t,
    i
  ]])) : s(a, [
    r,
    t,
    i
  ], (c) => c[0] === r && c[1] === t, o);
}, Ta = (s) => (e, t) => {
  const n = s(e, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  });
  t.connect(n).connect(e.destination);
  const r = () => {
    t.removeEventListener("ended", r), t.disconnect(n), n.disconnect();
  };
  t.addEventListener("ended", r);
}, wa = (s) => (e, t) => {
  s(e).add(t);
}, ba = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  fftSize: 2048,
  maxDecibels: -30,
  minDecibels: -100,
  smoothingTimeConstant: 0.8
}, Ca = (s, e, t, n, r, i) => class extends s {
  constructor(a, c) {
    const l = r(a), u = n(l, {
      ...ba,
      ...c
    }), h = i(l) ? e() : null;
    super(a, !1, u, h), this._nativeAnalyserNode = u;
  }
  get fftSize() {
    return this._nativeAnalyserNode.fftSize;
  }
  set fftSize(a) {
    this._nativeAnalyserNode.fftSize = a;
  }
  get frequencyBinCount() {
    return this._nativeAnalyserNode.frequencyBinCount;
  }
  get maxDecibels() {
    return this._nativeAnalyserNode.maxDecibels;
  }
  set maxDecibels(a) {
    const c = this._nativeAnalyserNode.maxDecibels;
    if (this._nativeAnalyserNode.maxDecibels = a, !(a > this._nativeAnalyserNode.minDecibels))
      throw this._nativeAnalyserNode.maxDecibels = c, t();
  }
  get minDecibels() {
    return this._nativeAnalyserNode.minDecibels;
  }
  set minDecibels(a) {
    const c = this._nativeAnalyserNode.minDecibels;
    if (this._nativeAnalyserNode.minDecibels = a, !(this._nativeAnalyserNode.maxDecibels > a))
      throw this._nativeAnalyserNode.minDecibels = c, t();
  }
  get smoothingTimeConstant() {
    return this._nativeAnalyserNode.smoothingTimeConstant;
  }
  set smoothingTimeConstant(a) {
    this._nativeAnalyserNode.smoothingTimeConstant = a;
  }
  getByteFrequencyData(a) {
    this._nativeAnalyserNode.getByteFrequencyData(a);
  }
  getByteTimeDomainData(a) {
    this._nativeAnalyserNode.getByteTimeDomainData(a);
  }
  getFloatFrequencyData(a) {
    this._nativeAnalyserNode.getFloatFrequencyData(a);
  }
  getFloatTimeDomainData(a) {
    this._nativeAnalyserNode.getFloatTimeDomainData(a);
  }
}, ye = (s, e) => s.context === e, xa = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), r = async (i, o) => {
    let a = e(i);
    return ye(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      fftSize: a.fftSize,
      maxDecibels: a.maxDecibels,
      minDecibels: a.minDecibels,
      smoothingTimeConstant: a.smoothingTimeConstant
    })), n.set(o, a), await t(i, o, a), a;
  };
  return { render(i, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : r(i, o);
  } };
}, on = (s) => {
  try {
    s.copyToChannel(/* @__PURE__ */ new Float32Array(1), 0, -1);
  } catch {
    return !1;
  }
  return !0;
}, We = () => new DOMException("", "IndexSizeError"), Os = (s) => {
  s.getChannelData = /* @__PURE__ */ ((e) => (t) => {
    try {
      return e.call(s, t);
    } catch (n) {
      throw n.code === 12 ? We() : n;
    }
  })(s.getChannelData);
}, Sa = { numberOfChannels: 1 }, Aa = (s, e, t, n, r, i, o, a) => {
  let c = null;
  return class Lr {
    constructor(u) {
      if (r === null) throw new Error("Missing the native OfflineAudioContext constructor.");
      const { length: h, numberOfChannels: d, sampleRate: f } = {
        ...Sa,
        ...u
      };
      c === null && (c = new r(1, 1, 44100));
      const p = n !== null && e(i, i) ? new n({
        length: h,
        numberOfChannels: d,
        sampleRate: f
      }) : c.createBuffer(d, h, f);
      if (p.numberOfChannels === 0) throw t();
      return typeof p.copyFromChannel != "function" ? (o(p), Os(p)) : e(on, () => on(p)) || a(p), s.add(p), p;
    }
    static [Symbol.hasInstance](u) {
      return u !== null && typeof u == "object" && Object.getPrototypeOf(u) === Lr.prototype || s.has(u);
    }
  };
}, Ae = -34028234663852886e22, we = 34028234663852886e22, ze = (s) => St.has(s), ka = {
  buffer: null,
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  loop: !1,
  loopEnd: 0,
  loopStart: 0,
  playbackRate: 1
}, Oa = (s, e, t, n, r, i, o, a) => class extends s {
  constructor(l, u) {
    const h = i(l), d = {
      ...ka,
      ...u
    }, f = r(h, d), p = o(h), m = p ? e() : null;
    super(l, !1, f, m), this._audioBufferSourceNodeRenderer = m, this._isBufferNullified = !1, this._isBufferSet = d.buffer !== null, this._nativeAudioBufferSourceNode = f, this._onended = null, this._playbackRate = t(this, p, f.playbackRate, we, Ae);
  }
  get buffer() {
    return this._isBufferNullified ? null : this._nativeAudioBufferSourceNode.buffer;
  }
  set buffer(l) {
    if (this._nativeAudioBufferSourceNode.buffer = l, l !== null) {
      if (this._isBufferSet) throw n();
      this._isBufferSet = !0;
    }
  }
  get loop() {
    return this._nativeAudioBufferSourceNode.loop;
  }
  set loop(l) {
    this._nativeAudioBufferSourceNode.loop = l;
  }
  get loopEnd() {
    return this._nativeAudioBufferSourceNode.loopEnd;
  }
  set loopEnd(l) {
    this._nativeAudioBufferSourceNode.loopEnd = l;
  }
  get loopStart() {
    return this._nativeAudioBufferSourceNode.loopStart;
  }
  set loopStart(l) {
    this._nativeAudioBufferSourceNode.loopStart = l;
  }
  get onended() {
    return this._onended;
  }
  set onended(l) {
    const u = typeof l == "function" ? a(this, l) : null;
    this._nativeAudioBufferSourceNode.onended = u;
    const h = this._nativeAudioBufferSourceNode.onended;
    this._onended = h !== null && h === u ? l : h;
  }
  get playbackRate() {
    return this._playbackRate;
  }
  start(l = 0, u = 0, h) {
    if (this._nativeAudioBufferSourceNode.start(l, u, h), this._audioBufferSourceNodeRenderer !== null && (this._audioBufferSourceNodeRenderer.start = h === void 0 ? [l, u] : [
      l,
      u,
      h
    ]), this.context.state !== "closed") {
      At(this);
      const d = () => {
        this._nativeAudioBufferSourceNode.removeEventListener("ended", d), ze(this) && zt(this);
      };
      this._nativeAudioBufferSourceNode.addEventListener("ended", d);
    }
  }
  stop(l = 0) {
    this._nativeAudioBufferSourceNode.stop(l), this._audioBufferSourceNodeRenderer !== null && (this._audioBufferSourceNodeRenderer.stop = l);
  }
}, Na = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap();
  let o = null, a = null;
  const c = async (l, u) => {
    let h = t(l);
    const d = ye(h, u);
    return d || (h = e(u, {
      buffer: h.buffer,
      channelCount: h.channelCount,
      channelCountMode: h.channelCountMode,
      channelInterpretation: h.channelInterpretation,
      loop: h.loop,
      loopEnd: h.loopEnd,
      loopStart: h.loopStart,
      playbackRate: h.playbackRate.value
    }), o !== null && h.start(...o), a !== null && h.stop(a)), i.set(u, h), d ? await s(u, l.playbackRate, h.playbackRate) : await n(u, l.playbackRate, h.playbackRate), await r(l, u, h), h;
  };
  return {
    set start(l) {
      o = l;
    },
    set stop(l) {
      a = l;
    },
    render(l, u) {
      const h = i.get(u);
      return h !== void 0 ? Promise.resolve(h) : c(l, u);
    }
  };
}, Ma = (s) => "playbackRate" in s, Da = (s) => "frequency" in s && "gain" in s, Ea = (s) => "offset" in s, Ia = (s) => !("frequency" in s) && "gain" in s, Ra = (s) => "detune" in s && "frequency" in s && !("gain" in s), Va = (s) => "pan" in s, be = (s) => Ve(Ir, s), $t = (s) => Ve(Rr, s), In = (s, e) => {
  const { activeInputs: t } = be(s);
  t.forEach((r) => r.forEach(([i]) => {
    e.includes(s) || In(i, [...e, s]);
  }));
  const n = Ma(s) ? [s.playbackRate] : qr(s) ? Array.from(s.parameters.values()) : Da(s) ? [
    s.Q,
    s.detune,
    s.frequency,
    s.gain
  ] : Ea(s) ? [s.offset] : Ia(s) ? [s.gain] : Ra(s) ? [s.detune, s.frequency] : Va(s) ? [s.pan] : [];
  for (const r of n) {
    const i = $t(r);
    i !== void 0 && i.activeInputs.forEach(([o]) => In(o, e));
  }
  ze(s) && zt(s);
}, bn = (s) => {
  In(s.destination, []);
}, Wr = (s) => s === void 0 || typeof s == "number" || typeof s == "string" && (s === "balanced" || s === "interactive" || s === "playback"), Pa = (s, e, t, n, r, i, o, a, c) => class extends s {
  constructor(u = {}) {
    if (c === null) throw new Error("Missing the native AudioContext constructor.");
    let h;
    try {
      h = new c(u);
    } catch (p) {
      throw p.code === 12 && p.message === "sampleRate is not in range" ? t() : p;
    }
    if (h === null) throw n();
    if (!Wr(u.latencyHint)) throw new TypeError(`The provided value '${u.latencyHint}' is not a valid enum value of type AudioContextLatencyCategory.`);
    if (u.sampleRate !== void 0 && h.sampleRate !== u.sampleRate) throw t();
    super(h, 2);
    const { latencyHint: d } = u, { sampleRate: f } = h;
    if (this._baseLatency = typeof h.baseLatency == "number" ? h.baseLatency : d === "balanced" ? 512 / f : d === "interactive" || d === void 0 ? 256 / f : d === "playback" ? 1024 / f : Math.max(2, Math.min(128, Math.round(d * f / 128))) * 128 / f, this._nativeAudioContext = h, c.name === "webkitAudioContext" ? (this._nativeGainNode = h.createGain(), this._nativeOscillatorNode = h.createOscillator(), this._nativeGainNode.gain.value = 1e-37, this._nativeOscillatorNode.connect(this._nativeGainNode).connect(h.destination), this._nativeOscillatorNode.start()) : (this._nativeGainNode = null, this._nativeOscillatorNode = null), this._state = null, h.state === "running") {
      this._state = "suspended";
      const p = () => {
        this._state === "suspended" && (this._state = null), h.removeEventListener("statechange", p);
      };
      h.addEventListener("statechange", p);
    }
  }
  get baseLatency() {
    return this._baseLatency;
  }
  get state() {
    return this._state !== null ? this._state : this._nativeAudioContext.state;
  }
  close() {
    return this.state === "closed" ? this._nativeAudioContext.close().then(() => {
      throw e();
    }) : (this._state === "suspended" && (this._state = null), this._nativeAudioContext.close().then(() => {
      this._nativeGainNode !== null && this._nativeOscillatorNode !== null && (this._nativeOscillatorNode.stop(), this._nativeGainNode.disconnect(), this._nativeOscillatorNode.disconnect()), bn(this);
    }));
  }
  createMediaElementSource(u) {
    return new r(this, { mediaElement: u });
  }
  createMediaStreamDestination() {
    return new i(this);
  }
  createMediaStreamSource(u) {
    return new o(this, { mediaStream: u });
  }
  createMediaStreamTrackSource(u) {
    return new a(this, { mediaStreamTrack: u });
  }
  resume() {
    return this._state === "suspended" ? new Promise((u, h) => {
      const d = () => {
        this._nativeAudioContext.removeEventListener("statechange", d), this._nativeAudioContext.state === "running" ? u() : this.resume().then(u, h);
      };
      this._nativeAudioContext.addEventListener("statechange", d);
    }) : this._nativeAudioContext.resume().catch((u) => {
      throw u === void 0 || u.code === 15 ? e() : u;
    });
  }
  suspend() {
    return this._nativeAudioContext.suspend().catch((u) => {
      throw u === void 0 ? e() : u;
    });
  }
}, Fa = (s, e, t, n, r, i, o, a) => class extends s {
  constructor(l, u) {
    const h = i(l), d = o(h), f = r(h, u, d), p = d ? e(a) : null;
    super(l, !1, f, p), this._isNodeOfNativeOfflineAudioContext = d, this._nativeAudioDestinationNode = f;
  }
  get channelCount() {
    return this._nativeAudioDestinationNode.channelCount;
  }
  set channelCount(l) {
    if (this._isNodeOfNativeOfflineAudioContext) throw n();
    if (l > this._nativeAudioDestinationNode.maxChannelCount) throw t();
    this._nativeAudioDestinationNode.channelCount = l;
  }
  get channelCountMode() {
    return this._nativeAudioDestinationNode.channelCountMode;
  }
  set channelCountMode(l) {
    if (this._isNodeOfNativeOfflineAudioContext) throw n();
    this._nativeAudioDestinationNode.channelCountMode = l;
  }
  get maxChannelCount() {
    return this._nativeAudioDestinationNode.maxChannelCount;
  }
}, qa = (s) => {
  const e = /* @__PURE__ */ new WeakMap(), t = async (n, r) => {
    const i = r.destination;
    return e.set(r, i), await s(n, r, i), i;
  };
  return { render(n, r) {
    const i = e.get(r);
    return i !== void 0 ? Promise.resolve(i) : t(n, r);
  } };
}, La = (s, e, t, n, r, i, o, a) => (c, l) => {
  const u = l.listener, h = () => {
    const g = /* @__PURE__ */ new Float32Array(1), T = e(l, {
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      numberOfInputs: 9
    }), y = o(l);
    let w = !1, I = [
      0,
      0,
      -1,
      0,
      1,
      0
    ], E = [
      0,
      0,
      0
    ];
    const O = () => {
      if (w) return;
      w = !0;
      const U = n(l, 256, 9, 0);
      U.onaudioprocess = ({ inputBuffer: j }) => {
        const F = [
          i(j, g, 0),
          i(j, g, 1),
          i(j, g, 2),
          i(j, g, 3),
          i(j, g, 4),
          i(j, g, 5)
        ];
        F.some((C, x) => C !== I[x]) && (u.setOrientation(...F), I = F);
        const A = [
          i(j, g, 6),
          i(j, g, 7),
          i(j, g, 8)
        ];
        A.some((C, x) => C !== E[x]) && (u.setPosition(...A), E = A);
      }, T.connect(U);
    }, N = (U) => (j) => {
      j !== I[U] && (I[U] = j, u.setOrientation(...I));
    }, q = (U) => (j) => {
      j !== E[U] && (E[U] = j, u.setPosition(...E));
    }, P = (U, j, F) => {
      const A = t(l, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        offset: j
      });
      A.connect(T, 0, U), A.start(), Object.defineProperty(A.offset, "defaultValue", { get() {
        return j;
      } });
      const C = s({ context: c }, y, A.offset, we, Ae);
      return a(C, "value", (x) => () => x.call(C), (x) => (D) => {
        try {
          x.call(C, D);
        } catch (R) {
          if (R.code !== 9) throw R;
        }
        O(), y && F(D);
      }), C.cancelAndHoldAtTime = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.cancelAndHoldAtTime), C.cancelScheduledValues = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.cancelScheduledValues), C.exponentialRampToValueAtTime = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.exponentialRampToValueAtTime), C.linearRampToValueAtTime = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.linearRampToValueAtTime), C.setTargetAtTime = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.setTargetAtTime), C.setValueAtTime = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.setValueAtTime), C.setValueCurveAtTime = /* @__PURE__ */ ((x) => y ? () => {
        throw r();
      } : (...D) => {
        const R = x.apply(C, D);
        return O(), R;
      })(C.setValueCurveAtTime), C;
    };
    return {
      forwardX: P(0, 0, N(0)),
      forwardY: P(1, 0, N(1)),
      forwardZ: P(2, -1, N(2)),
      positionX: P(6, 0, q(0)),
      positionY: P(7, 0, q(1)),
      positionZ: P(8, 0, q(2)),
      upX: P(3, 0, N(3)),
      upY: P(4, 1, N(4)),
      upZ: P(5, 0, N(5))
    };
  }, { forwardX: d, forwardY: f, forwardZ: p, positionX: m, positionY: _, positionZ: v, upX: b, upY: S, upZ: k } = u.forwardX === void 0 ? h() : u;
  return {
    get forwardX() {
      return d;
    },
    get forwardY() {
      return f;
    },
    get forwardZ() {
      return p;
    },
    get positionX() {
      return m;
    },
    get positionY() {
      return _;
    },
    get positionZ() {
      return v;
    },
    get upX() {
      return b;
    },
    get upY() {
      return S;
    },
    get upZ() {
      return k;
    }
  };
}, cn = (s) => "context" in s, Zt = (s) => cn(s[0]), gt = (s, e, t, n) => {
  for (const r of s) if (t(r)) {
    if (n) return !1;
    throw Error("The set contains at least one similar element.");
  }
  return s.add(e), !0;
}, ir = (s, e, [t, n], r) => {
  gt(s, [
    e,
    t,
    n
  ], (i) => i[0] === e && i[1] === t, r);
}, ar = (s, [e, t, n], r) => {
  const i = s.get(e);
  i === void 0 ? s.set(e, /* @__PURE__ */ new Set([[t, n]])) : gt(i, [t, n], (o) => o[0] === t, r);
}, Et = (s) => "inputs" in s, ln = (s, e, t, n) => {
  if (Et(e)) {
    const r = e.inputs[n];
    return s.connect(r, t, 0), [
      r,
      t,
      0
    ];
  }
  return s.connect(e, t, n), [
    e,
    t,
    n
  ];
}, jr = (s, e, t) => {
  for (const n of s) if (n[0] === e && n[1] === t)
    return s.delete(n), n;
  return null;
}, Wa = (s, e, t) => wn(s, (n) => n[0] === e && n[1] === t), Br = (s, e) => {
  if (!Gt(s).delete(e)) throw new Error("Missing the expected event listener.");
}, Ur = (s, e, t) => {
  const n = Ve(s, e), r = wn(n, (i) => i[0] === t);
  return n.size === 0 && s.delete(e), r;
}, un = (s, e, t, n) => {
  Et(e) ? s.disconnect(e.inputs[n], t, 0) : s.disconnect(e, t, n);
}, te = (s) => Ve(As, s), Lt = (s) => Ve(ks, s), ht = (s) => Nn.has(s), en = (s) => !St.has(s), or = (s, e) => new Promise((t) => {
  if (e !== null) t(!0);
  else {
    const n = s.createScriptProcessor(256, 1, 1), r = s.createGain(), i = s.createBuffer(1, 2, 44100), o = i.getChannelData(0);
    o[0] = 1, o[1] = 1;
    const a = s.createBufferSource();
    a.buffer = i, a.loop = !0, a.connect(n).connect(s.destination), a.connect(r), a.disconnect(r), n.onaudioprocess = (c) => {
      const l = c.inputBuffer.getChannelData(0);
      Array.prototype.some.call(l, (u) => u === 1) ? t(!0) : t(!1), a.stop(), n.onaudioprocess = null, a.disconnect(n), n.disconnect(s.destination);
    }, a.start();
  }
}), kn = (s, e) => {
  const t = /* @__PURE__ */ new Map();
  for (const n of s) for (const r of n) {
    const i = t.get(r);
    t.set(r, i === void 0 ? 1 : i + 1);
  }
  t.forEach((n, r) => e(r, n));
}, hn = (s) => "context" in s, ja = (s) => {
  const e = /* @__PURE__ */ new Map();
  s.connect = /* @__PURE__ */ ((t) => (n, r = 0, i = 0) => {
    const o = hn(n) ? t(n, r, i) : t(n, r), a = e.get(n);
    return a === void 0 ? e.set(n, [{
      input: i,
      output: r
    }]) : a.every((c) => c.input !== i || c.output !== r) && a.push({
      input: i,
      output: r
    }), o;
  })(s.connect.bind(s)), s.disconnect = /* @__PURE__ */ ((t) => (n, r, i) => {
    if (t.apply(s), n === void 0) e.clear();
    else if (typeof n == "number") for (const [o, a] of e) {
      const c = a.filter((l) => l.output !== n);
      c.length === 0 ? e.delete(o) : e.set(o, c);
    }
    else if (e.has(n)) if (r === void 0) e.delete(n);
    else {
      const o = e.get(n);
      if (o !== void 0) {
        const a = o.filter((c) => c.output !== r && (c.input !== i || i === void 0));
        a.length === 0 ? e.delete(n) : e.set(n, a);
      }
    }
    for (const [o, a] of e) a.forEach((c) => {
      hn(o) ? s.connect(o, c.output, c.input) : s.connect(o, c.output);
    });
  })(s.disconnect);
}, Ba = (s, e, t, n) => {
  const { activeInputs: r, passiveInputs: i } = $t(e), { outputs: o } = be(s), a = Gt(s), c = (l) => {
    const u = te(s), h = Lt(e);
    if (l) {
      const d = Ur(i, s, t);
      ir(r, s, d, !1), !n && !ht(s) && u.connect(h, t);
    } else {
      const d = Wa(r, s, t);
      ar(i, d, !1), !n && !ht(s) && u.disconnect(h, t);
    }
  };
  return gt(o, [e, t], (l) => l[0] === e && l[1] === t, !0) ? (a.add(c), ze(s) ? ir(r, s, [t, c], !0) : ar(i, [
    s,
    t,
    c
  ], !0), !0) : !1;
}, Ua = (s, e, t, n) => {
  const { activeInputs: r, passiveInputs: i } = be(e), o = jr(r[n], s, t);
  return o === null ? [Fr(i, s, t, n)[2], !1] : [o[2], !0];
}, Ga = (s, e, t) => {
  const { activeInputs: n, passiveInputs: r } = $t(e), i = jr(n, s, t);
  return i === null ? [Ur(r, s, t)[1], !1] : [i[2], !0];
}, Ns = (s, e, t, n, r) => {
  const [i, o] = Ua(s, t, n, r);
  if (i !== null && (Br(s, i), o && !e && !ht(s) && un(te(s), te(t), n, r)), ze(t)) {
    const { activeInputs: a } = be(t);
    En(t, a);
  }
}, Ms = (s, e, t, n) => {
  const [r, i] = Ga(s, t, n);
  r !== null && (Br(s, r), i && !e && !ht(s) && te(s).disconnect(Lt(t), n));
}, za = (s, e) => {
  const t = be(s), n = [];
  for (const r of t.outputs)
    Zt(r) ? Ns(s, e, ...r) : Ms(s, e, ...r), n.push(r[0]);
  return t.outputs.clear(), n;
}, $a = (s, e, t) => {
  const n = be(s), r = [];
  for (const i of n.outputs) i[1] === t && (Zt(i) ? Ns(s, e, ...i) : Ms(s, e, ...i), r.push(i[0]), n.outputs.delete(i));
  return r;
}, Za = (s, e, t, n, r) => {
  const i = be(s);
  return Array.from(i.outputs).filter((o) => o[0] === t && (n === void 0 || o[1] === n) && (r === void 0 || o[2] === r)).map((o) => (Zt(o) ? Ns(s, e, ...o) : Ms(s, e, ...o), i.outputs.delete(o), o[0]));
}, Xa = (s, e, t, n, r, i, o, a, c, l, u, h, d, f, p, m) => class extends l {
  constructor(v, b, S, k) {
    super(S), this._context = v, this._nativeAudioNode = S;
    const g = u(v);
    h(g) && t(or, () => or(g, m)) !== !0 && ja(S), As.set(this, S), Vr.set(this, /* @__PURE__ */ new Set()), v.state !== "closed" && b && At(this), s(this, k, S);
  }
  get channelCount() {
    return this._nativeAudioNode.channelCount;
  }
  set channelCount(v) {
    this._nativeAudioNode.channelCount = v;
  }
  get channelCountMode() {
    return this._nativeAudioNode.channelCountMode;
  }
  set channelCountMode(v) {
    this._nativeAudioNode.channelCountMode = v;
  }
  get channelInterpretation() {
    return this._nativeAudioNode.channelInterpretation;
  }
  set channelInterpretation(v) {
    this._nativeAudioNode.channelInterpretation = v;
  }
  get context() {
    return this._context;
  }
  get numberOfInputs() {
    return this._nativeAudioNode.numberOfInputs;
  }
  get numberOfOutputs() {
    return this._nativeAudioNode.numberOfOutputs;
  }
  connect(v, b = 0, S = 0) {
    if (b < 0 || b >= this._nativeAudioNode.numberOfOutputs) throw r();
    const k = p(u(this._context));
    if (d(v) || f(v)) throw i();
    if (cn(v)) {
      const T = te(v);
      try {
        const y = ln(this._nativeAudioNode, T, b, S), w = en(this);
        (k || w) && this._nativeAudioNode.disconnect(...y), this.context.state !== "closed" && !w && en(v) && At(v);
      } catch (y) {
        throw y.code === 12 ? i() : y;
      }
      return e(this, v, b, S, k) && kn(c([this], v), n(k)), v;
    }
    const g = Lt(v);
    if (g.name === "playbackRate" && g.maxValue === 1024) throw o();
    try {
      this._nativeAudioNode.connect(g, b), (k || en(this)) && this._nativeAudioNode.disconnect(g, b);
    } catch (T) {
      throw T.code === 12 ? i() : T;
    }
    Ba(this, v, b, k) && kn(c([this], v), n(k));
  }
  disconnect(v, b, S) {
    let k;
    const g = p(u(this._context));
    if (v === void 0) k = za(this, g);
    else if (typeof v == "number") {
      if (v < 0 || v >= this.numberOfOutputs) throw r();
      k = $a(this, g, v);
    } else {
      if (b !== void 0 && (b < 0 || b >= this.numberOfOutputs) || cn(v) && S !== void 0 && (S < 0 || S >= v.numberOfInputs)) throw r();
      if (k = Za(this, g, v, b, S), k.length === 0) throw i();
    }
    for (const T of k) kn(c([this], T), a);
  }
}, Ha = (s, e, t, n, r, i, o, a, c, l, u, h, d) => (f, p, m, _ = null, v = null) => {
  const b = m.value, S = new Ye.AutomationEventList(b), k = p ? n(S) : null, g = {
    get defaultValue() {
      return b;
    },
    get maxValue() {
      return _ === null ? m.maxValue : _;
    },
    get minValue() {
      return v === null ? m.minValue : v;
    },
    get value() {
      return m.value;
    },
    set value(T) {
      m.value = T, g.setValueAtTime(T, f.context.currentTime);
    },
    cancelAndHoldAtTime(T) {
      if (typeof m.cancelAndHoldAtTime == "function")
        k === null && S.flush(f.context.currentTime), S.add(r(T)), m.cancelAndHoldAtTime(T);
      else {
        const y = Array.from(S).pop();
        k === null && S.flush(f.context.currentTime), S.add(r(T));
        const w = Array.from(S).pop();
        m.cancelScheduledValues(T), y !== w && w !== void 0 && (w.type === "exponentialRampToValue" ? m.exponentialRampToValueAtTime(w.value, w.endTime) : w.type === "linearRampToValue" ? m.linearRampToValueAtTime(w.value, w.endTime) : w.type === "setValue" ? m.setValueAtTime(w.value, w.startTime) : w.type === "setValueCurve" && m.setValueCurveAtTime(w.values, w.startTime, w.duration));
      }
      return g;
    },
    cancelScheduledValues(T) {
      return k === null && S.flush(f.context.currentTime), S.add(i(T)), m.cancelScheduledValues(T), g;
    },
    exponentialRampToValueAtTime(T, y) {
      if (T === 0) throw new RangeError();
      if (!Number.isFinite(y) || y < 0) throw new RangeError();
      const w = f.context.currentTime;
      return k === null && S.flush(w), Array.from(S).length === 0 && (S.add(l(b, w)), m.setValueAtTime(b, w)), S.add(o(T, y)), m.exponentialRampToValueAtTime(T, y), g;
    },
    linearRampToValueAtTime(T, y) {
      const w = f.context.currentTime;
      return k === null && S.flush(w), Array.from(S).length === 0 && (S.add(l(b, w)), m.setValueAtTime(b, w)), S.add(a(T, y)), m.linearRampToValueAtTime(T, y), g;
    },
    setTargetAtTime(T, y, w) {
      return k === null && S.flush(f.context.currentTime), S.add(c(T, y, w)), m.setTargetAtTime(T, y, w), g;
    },
    setValueAtTime(T, y) {
      return k === null && S.flush(f.context.currentTime), S.add(l(T, y)), m.setValueAtTime(T, y), g;
    },
    setValueCurveAtTime(T, y, w) {
      const I = T instanceof Float32Array ? T : new Float32Array(T);
      if (h !== null && h.name === "webkitAudioContext") {
        const E = y + w, O = f.context.sampleRate, N = Math.ceil(y * O), q = Math.floor(E * O), P = q - N, U = new Float32Array(P);
        for (let F = 0; F < P; F += 1) {
          const A = (I.length - 1) / w * ((N + F) / O - y), C = Math.floor(A), x = Math.ceil(A);
          U[F] = C === x ? I[C] : (1 - (A - C)) * I[C] + (1 - (x - A)) * I[x];
        }
        k === null && S.flush(f.context.currentTime), S.add(u(U, y, w)), m.setValueCurveAtTime(U, y, w);
        const j = q / O;
        j < E && d(g, U[U.length - 1], j), d(g, I[I.length - 1], E);
      } else
        k === null && S.flush(f.context.currentTime), S.add(u(I, y, w)), m.setValueCurveAtTime(I, y, w);
      return g;
    }
  };
  return t.set(g, m), e.set(g, f), s(g, k), g;
}, Qa = (s) => ({ replay(e) {
  for (const t of s) if (t.type === "exponentialRampToValue") {
    const { endTime: n, value: r } = t;
    e.exponentialRampToValueAtTime(r, n);
  } else if (t.type === "linearRampToValue") {
    const { endTime: n, value: r } = t;
    e.linearRampToValueAtTime(r, n);
  } else if (t.type === "setTarget") {
    const { startTime: n, target: r, timeConstant: i } = t;
    e.setTargetAtTime(r, n, i);
  } else if (t.type === "setValue") {
    const { startTime: n, value: r } = t;
    e.setValueAtTime(r, n);
  } else if (t.type === "setValueCurve") {
    const { duration: n, startTime: r, values: i } = t;
    e.setValueCurveAtTime(i, r, n);
  } else throw new Error("Can't apply an unknown automation.");
} }), Gr = class {
  constructor(s) {
    this._map = new Map(s);
  }
  get size() {
    return this._map.size;
  }
  entries() {
    return this._map.entries();
  }
  forEach(s, e = null) {
    return this._map.forEach((t, n) => s.call(e, t, n, this));
  }
  get(s) {
    return this._map.get(s);
  }
  has(s) {
    return this._map.has(s);
  }
  keys() {
    return this._map.keys();
  }
  values() {
    return this._map.values();
  }
}, Ya = {
  channelCount: 2,
  channelCountMode: "explicit",
  channelInterpretation: "speakers",
  numberOfInputs: 1,
  numberOfOutputs: 1,
  parameterData: {},
  processorOptions: {}
}, Ja = (s, e, t, n, r, i, o, a, c, l, u, h, d, f) => class extends e {
  constructor(m, _, v) {
    var b;
    const S = a(m), k = c(S), g = u({
      ...Ya,
      ...v
    });
    d(g);
    const T = Mn.get(S), y = T?.get(_), w = r(k || S.state !== "closed" ? S : (b = o(S)) !== null && b !== void 0 ? b : S, k ? null : m.baseLatency, l, _, y, g), I = k ? n(_, g, y) : null;
    super(m, !0, w, I);
    const E = [];
    w.parameters.forEach((N, q) => {
      const P = t(this, k, N);
      E.push([q, P]);
    }), this._nativeAudioWorkletNode = w, this._onprocessorerror = null, this._parameters = new Gr(E), k && s(S, this);
    const { activeInputs: O } = i(this);
    h(w, O);
  }
  get onprocessorerror() {
    return this._onprocessorerror;
  }
  set onprocessorerror(m) {
    const _ = typeof m == "function" ? f(this, m) : null;
    this._nativeAudioWorkletNode.onprocessorerror = _;
    const v = this._nativeAudioWorkletNode.onprocessorerror;
    this._onprocessorerror = v !== null && v === _ ? m : v;
  }
  get parameters() {
    return this._parameters === null ? this._nativeAudioWorkletNode.parameters : this._parameters;
  }
  get port() {
    return this._nativeAudioWorkletNode.port;
  }
};
function dn(s, e, t, n, r) {
  if (typeof s.copyFromChannel == "function")
    e[t].byteLength === 0 && (e[t] = /* @__PURE__ */ new Float32Array(128)), s.copyFromChannel(e[t], n, r);
  else {
    const i = s.getChannelData(n);
    if (e[t].byteLength === 0) e[t] = i.slice(r, r + 128);
    else {
      const o = new Float32Array(i.buffer, r * Float32Array.BYTES_PER_ELEMENT, 128);
      e[t].set(o);
    }
  }
}
var zr = (s, e, t, n, r) => {
  typeof s.copyToChannel == "function" ? e[t].byteLength !== 0 && s.copyToChannel(e[t], n, r) : e[t].byteLength !== 0 && s.getChannelData(n).set(e[t], r);
}, pn = (s, e) => {
  const t = [];
  for (let n = 0; n < s; n += 1) {
    const r = [], i = typeof e == "number" ? e : e[n];
    for (let o = 0; o < i; o += 1) r.push(/* @__PURE__ */ new Float32Array(128));
    t.push(r);
  }
  return t;
}, Ka = (s, e) => Ve(Ve(Dn, s), te(e)), eo = async (s, e, t, n, r, i, o) => {
  const a = e === null ? Math.ceil(s.context.length / 128) * 128 : e.length, c = n.channelCount * n.numberOfInputs, l = r.reduce((_, v) => _ + v, 0), u = l === 0 ? null : t.createBuffer(l, a, t.sampleRate);
  if (i === void 0) throw new Error("Missing the processor constructor.");
  const h = be(s), d = await Ka(t, s), f = pn(n.numberOfInputs, n.channelCount), p = pn(n.numberOfOutputs, r), m = Array.from(s.parameters.keys()).reduce((_, v) => ({
    ..._,
    [v]: /* @__PURE__ */ new Float32Array(128)
  }), {});
  for (let _ = 0; _ < a; _ += 128) {
    if (n.numberOfInputs > 0 && e !== null) for (let v = 0; v < n.numberOfInputs; v += 1) for (let b = 0; b < n.channelCount; b += 1) dn(e, f[v], b, b, _);
    i.parameterDescriptors !== void 0 && e !== null && i.parameterDescriptors.forEach(({ name: v }, b) => {
      dn(e, m, v, c + b, _);
    });
    for (let v = 0; v < n.numberOfInputs; v += 1) for (let b = 0; b < r[v]; b += 1) p[v][b].byteLength === 0 && (p[v][b] = /* @__PURE__ */ new Float32Array(128));
    try {
      const v = f.map((S, k) => h.activeInputs[k].size === 0 ? [] : S), b = o(_ / t.sampleRate, t.sampleRate, () => d.process(v, p, m));
      if (u !== null) for (let S = 0, k = 0; S < n.numberOfOutputs; S += 1) {
        for (let g = 0; g < r[S]; g += 1) zr(u, p[S], g, k + g, _);
        k += r[S];
      }
      if (!b) break;
    } catch (v) {
      s.dispatchEvent(new ErrorEvent("processorerror", {
        colno: v.colno,
        filename: v.filename,
        lineno: v.lineno,
        message: v.message
      }));
      break;
    }
  }
  return u;
}, to = (s, e, t, n, r, i, o, a, c, l, u, h, d, f, p, m) => (_, v, b) => {
  const S = /* @__PURE__ */ new WeakMap();
  let k = null;
  const g = async (T, y) => {
    let w = u(T), I = null;
    const E = ye(w, y), O = Array.isArray(v.outputChannelCount) ? v.outputChannelCount : Array.from(v.outputChannelCount);
    if (h === null) {
      const N = O.reduce((j, F) => j + F, 0), q = r(y, {
        channelCount: Math.max(1, N),
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        numberOfOutputs: Math.max(1, N)
      }), P = [];
      for (let j = 0; j < T.numberOfOutputs; j += 1) P.push(n(y, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
        numberOfInputs: O[j]
      }));
      const U = o(y, {
        channelCount: v.channelCount,
        channelCountMode: v.channelCountMode,
        channelInterpretation: v.channelInterpretation,
        gain: 1
      });
      U.connect = e.bind(null, P), U.disconnect = c.bind(null, P), I = [
        q,
        P,
        U
      ];
    } else E || (w = new h(y, _));
    if (S.set(y, I === null ? w : I[2]), I !== null) {
      if (k === null) {
        if (b === void 0) throw new Error("Missing the processor constructor.");
        if (d === null) throw new Error("Missing the native OfflineAudioContext constructor.");
        const F = T.channelCount * T.numberOfInputs, A = b.parameterDescriptors === void 0 ? 0 : b.parameterDescriptors.length, C = F + A;
        k = eo(T, C === 0 ? null : await (async () => {
          const D = new d(C, Math.ceil(T.context.length / 128) * 128, y.sampleRate), R = [], V = [];
          for (let J = 0; J < v.numberOfInputs; J += 1)
            R.push(o(D, {
              channelCount: v.channelCount,
              channelCountMode: v.channelCountMode,
              channelInterpretation: v.channelInterpretation,
              gain: 1
            })), V.push(r(D, {
              channelCount: v.channelCount,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
              numberOfOutputs: v.channelCount
            }));
          const re = await Promise.all(Array.from(T.parameters.values()).map(async (J) => {
            const ie = i(D, {
              channelCount: 1,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
              offset: J.value
            });
            return await f(D, J, ie.offset), ie;
          })), z = n(D, {
            channelCount: 1,
            channelCountMode: "explicit",
            channelInterpretation: "speakers",
            numberOfInputs: Math.max(1, F + A)
          });
          for (let J = 0; J < v.numberOfInputs; J += 1) {
            R[J].connect(V[J]);
            for (let ie = 0; ie < v.channelCount; ie += 1) V[J].connect(z, ie, J * v.channelCount + ie);
          }
          for (const [J, ie] of re.entries())
            ie.connect(z, 0, F + J), ie.start(0);
          return z.connect(D.destination), await Promise.all(R.map((J) => p(T, D, J))), m(D);
        })(), y, v, O, b, l);
      }
      const N = await k, q = t(y, {
        buffer: null,
        channelCount: 2,
        channelCountMode: "max",
        channelInterpretation: "speakers",
        loop: !1,
        loopEnd: 0,
        loopStart: 0,
        playbackRate: 1
      }), [P, U, j] = I;
      N !== null && (q.buffer = N, q.start(0)), q.connect(P);
      for (let F = 0, A = 0; F < T.numberOfOutputs; F += 1) {
        const C = U[F];
        for (let x = 0; x < O[F]; x += 1) P.connect(C, A + x, x);
        A += O[F];
      }
      return j;
    }
    if (E) for (const [N, q] of T.parameters.entries()) await s(y, q, w.parameters.get(N));
    else for (const [N, q] of T.parameters.entries()) await f(y, q, w.parameters.get(N));
    return await p(T, y, w), w;
  };
  return { render(T, y) {
    a(y, T);
    const w = S.get(y);
    return w !== void 0 ? Promise.resolve(w) : g(T, y);
  } };
}, no = (s, e, t, n, r, i, o, a, c, l, u, h, d, f, p, m, _, v, b, S) => class extends p {
  constructor(g, T) {
    super(g, T), this._nativeContext = g, this._audioWorklet = s === void 0 ? void 0 : { addModule: (y, w) => s(this, y, w) };
  }
  get audioWorklet() {
    return this._audioWorklet;
  }
  createAnalyser() {
    return new e(this);
  }
  createBiquadFilter() {
    return new r(this);
  }
  createBuffer(g, T, y) {
    return new t({
      length: T,
      numberOfChannels: g,
      sampleRate: y
    });
  }
  createBufferSource() {
    return new n(this);
  }
  createChannelMerger(g = 6) {
    return new i(this, { numberOfInputs: g });
  }
  createChannelSplitter(g = 6) {
    return new o(this, { numberOfOutputs: g });
  }
  createConstantSource() {
    return new a(this);
  }
  createConvolver() {
    return new c(this);
  }
  createDelay(g = 1) {
    return new u(this, { maxDelayTime: g });
  }
  createDynamicsCompressor() {
    return new h(this);
  }
  createGain() {
    return new d(this);
  }
  createIIRFilter(g, T) {
    return new f(this, {
      feedback: T,
      feedforward: g
    });
  }
  createOscillator() {
    return new m(this);
  }
  createPanner() {
    return new _(this);
  }
  createPeriodicWave(g, T, y = { disableNormalization: !1 }) {
    return new v(this, {
      ...y,
      imag: T,
      real: g
    });
  }
  createStereoPanner() {
    return new b(this);
  }
  createWaveShaper() {
    return new S(this);
  }
  decodeAudioData(g, T, y) {
    return l(this._nativeContext, g).then((w) => (typeof T == "function" && T(w), w), (w) => {
      throw typeof y == "function" && y(w), w;
    });
  }
}, so = {
  Q: 1,
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  detune: 0,
  frequency: 350,
  gain: 0,
  type: "lowpass"
}, ro = (s, e, t, n, r, i, o, a) => class extends s {
  constructor(l, u) {
    const h = i(l), d = r(h, {
      ...so,
      ...u
    }), f = o(h), p = f ? t() : null;
    super(l, !1, d, p), this._Q = e(this, f, d.Q, we, Ae), this._detune = e(this, f, d.detune, 1200 * Math.log2(we), -1200 * Math.log2(we)), this._frequency = e(this, f, d.frequency, l.sampleRate / 2, 0), this._gain = e(this, f, d.gain, 40 * Math.log10(we), Ae), this._nativeBiquadFilterNode = d, a(this, 1);
  }
  get detune() {
    return this._detune;
  }
  get frequency() {
    return this._frequency;
  }
  get gain() {
    return this._gain;
  }
  get Q() {
    return this._Q;
  }
  get type() {
    return this._nativeBiquadFilterNode.type;
  }
  set type(l) {
    this._nativeBiquadFilterNode.type = l;
  }
  getFrequencyResponse(l, u, h) {
    try {
      this._nativeBiquadFilterNode.getFrequencyResponse(l, u, h);
    } catch (d) {
      throw d.code === 11 ? n() : d;
    }
    if (l.length !== u.length || u.length !== h.length) throw n();
  }
}, io = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = ye(l, c);
    return u || (l = e(c, {
      Q: l.Q.value,
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      detune: l.detune.value,
      frequency: l.frequency.value,
      gain: l.gain.value,
      type: l.type
    })), i.set(c, l), u ? (await s(c, a.Q, l.Q), await s(c, a.detune, l.detune), await s(c, a.frequency, l.frequency), await s(c, a.gain, l.gain)) : (await n(c, a.Q, l.Q), await n(c, a.detune, l.detune), await n(c, a.frequency, l.frequency), await n(c, a.gain, l.gain)), await r(a, c, l), l;
  };
  return { render(a, c) {
    const l = i.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, ao = (s, e) => (t, n) => {
  const r = e.get(t);
  if (r !== void 0) return r;
  const i = s.get(t);
  if (i !== void 0) return i;
  try {
    const o = n();
    return o instanceof Promise ? (s.set(t, o), o.catch(() => !1).then((a) => (s.delete(t), e.set(t, a), a))) : (e.set(t, o), o);
  } catch {
    return e.set(t, !1), !1;
  }
}, oo = {
  channelCount: 1,
  channelCountMode: "explicit",
  channelInterpretation: "speakers",
  numberOfInputs: 6
}, co = (s, e, t, n, r) => class extends s {
  constructor(o, a) {
    const c = n(o), l = t(c, {
      ...oo,
      ...a
    }), u = r(c) ? e() : null;
    super(o, !1, l, u);
  }
}, lo = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), r = async (i, o) => {
    let a = e(i);
    return ye(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      numberOfInputs: a.numberOfInputs
    })), n.set(o, a), await t(i, o, a), a;
  };
  return { render(i, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : r(i, o);
  } };
}, uo = {
  channelCount: 6,
  channelCountMode: "explicit",
  channelInterpretation: "discrete",
  numberOfOutputs: 6
}, ho = (s, e, t, n, r, i) => class extends s {
  constructor(a, c) {
    const l = n(a), u = t(l, i({
      ...uo,
      ...c
    })), h = r(l) ? e() : null;
    super(a, !1, u, h);
  }
}, po = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), r = async (i, o) => {
    let a = e(i);
    return ye(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      numberOfOutputs: a.numberOfOutputs
    })), n.set(o, a), await t(i, o, a), a;
  };
  return { render(i, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : r(i, o);
  } };
}, fo = (s) => (e, t, n) => s(t, e, n), mo = (s) => (e, t, n = 0, r = 0) => {
  const i = e[n];
  if (i === void 0) throw s();
  return hn(t) ? i.connect(t, 0, r) : i.connect(t, 0);
}, _o = (s) => (e, t) => {
  const n = s(e, {
    buffer: null,
    channelCount: 2,
    channelCountMode: "max",
    channelInterpretation: "speakers",
    loop: !1,
    loopEnd: 0,
    loopStart: 0,
    playbackRate: 1
  });
  return n.buffer = e.createBuffer(1, 2, 44100), n.loop = !0, n.connect(t), n.start(), () => {
    n.stop(), n.disconnect(t);
  };
}, go = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  offset: 1
}, vo = (s, e, t, n, r, i, o) => class extends s {
  constructor(c, l) {
    const u = r(c), h = n(u, {
      ...go,
      ...l
    }), d = i(u), f = d ? t() : null;
    super(c, !1, h, f), this._constantSourceNodeRenderer = f, this._nativeConstantSourceNode = h, this._offset = e(this, d, h.offset, we, Ae), this._onended = null;
  }
  get offset() {
    return this._offset;
  }
  get onended() {
    return this._onended;
  }
  set onended(c) {
    const l = typeof c == "function" ? o(this, c) : null;
    this._nativeConstantSourceNode.onended = l;
    const u = this._nativeConstantSourceNode.onended;
    this._onended = u !== null && u === l ? c : u;
  }
  start(c = 0) {
    if (this._nativeConstantSourceNode.start(c), this._constantSourceNodeRenderer !== null && (this._constantSourceNodeRenderer.start = c), this.context.state !== "closed") {
      At(this);
      const l = () => {
        this._nativeConstantSourceNode.removeEventListener("ended", l), ze(this) && zt(this);
      };
      this._nativeConstantSourceNode.addEventListener("ended", l);
    }
  }
  stop(c = 0) {
    this._nativeConstantSourceNode.stop(c), this._constantSourceNodeRenderer !== null && (this._constantSourceNodeRenderer.stop = c);
  }
}, yo = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap();
  let o = null, a = null;
  const c = async (l, u) => {
    let h = t(l);
    const d = ye(h, u);
    return d || (h = e(u, {
      channelCount: h.channelCount,
      channelCountMode: h.channelCountMode,
      channelInterpretation: h.channelInterpretation,
      offset: h.offset.value
    }), o !== null && h.start(o), a !== null && h.stop(a)), i.set(u, h), d ? await s(u, l.offset, h.offset) : await n(u, l.offset, h.offset), await r(l, u, h), h;
  };
  return {
    set start(l) {
      o = l;
    },
    set stop(l) {
      a = l;
    },
    render(l, u) {
      const h = i.get(u);
      return h !== void 0 ? Promise.resolve(h) : c(l, u);
    }
  };
}, To = (s) => (e) => (s[0] = e, s[0]), wo = {
  buffer: null,
  channelCount: 2,
  channelCountMode: "clamped-max",
  channelInterpretation: "speakers",
  disableNormalization: !1
}, bo = (s, e, t, n, r, i) => class extends s {
  constructor(a, c) {
    const l = n(a), u = {
      ...wo,
      ...c
    }, h = t(l, u), d = r(l) ? e() : null;
    super(a, !1, h, d), this._isBufferNullified = !1, this._nativeConvolverNode = h, u.buffer !== null && i(this, u.buffer.duration);
  }
  get buffer() {
    return this._isBufferNullified ? null : this._nativeConvolverNode.buffer;
  }
  set buffer(a) {
    if (this._nativeConvolverNode.buffer = a, a === null && this._nativeConvolverNode.buffer !== null) {
      const c = this._nativeConvolverNode.context;
      this._nativeConvolverNode.buffer = c.createBuffer(1, 1, c.sampleRate), this._isBufferNullified = !0, i(this, 0);
    } else
      this._isBufferNullified = !1, i(this, this._nativeConvolverNode.buffer === null ? 0 : this._nativeConvolverNode.buffer.duration);
  }
  get normalize() {
    return this._nativeConvolverNode.normalize;
  }
  set normalize(a) {
    this._nativeConvolverNode.normalize = a;
  }
}, Co = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), r = async (i, o) => {
    let a = e(i);
    return ye(a, o) || (a = s(o, {
      buffer: a.buffer,
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      disableNormalization: !a.normalize
    })), n.set(o, a), Et(a) ? await t(i, o, a.inputs[0]) : await t(i, o, a), a;
  };
  return { render(i, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : r(i, o);
  } };
}, xo = (s, e) => (t, n, r) => {
  if (e === null) throw new Error("Missing the native OfflineAudioContext constructor.");
  try {
    return new e(t, n, r);
  } catch (i) {
    throw i.name === "SyntaxError" ? s() : i;
  }
}, So = () => new DOMException("", "DataCloneError"), cr = (s) => {
  const { port1: e, port2: t } = new MessageChannel();
  return new Promise((n) => {
    const r = () => {
      t.onmessage = null, e.close(), t.close(), n();
    };
    t.onmessage = () => r();
    try {
      e.postMessage(s, [s]);
    } catch {
    } finally {
      r();
    }
  });
}, Ao = (s, e, t, n, r, i, o, a, c, l, u) => (h, d) => {
  const f = o(h) ? h : i(h);
  if (r.has(d)) {
    const p = t();
    return Promise.reject(p);
  }
  try {
    r.add(d);
  } catch {
  }
  return e(c, () => c(f)) ? f.decodeAudioData(d).then((p) => (cr(d).catch(() => {
  }), e(a, () => a(p)) || u(p), s.add(p), p)) : new Promise((p, m) => {
    const _ = async () => {
      try {
        await cr(d);
      } catch {
      }
    }, v = (b) => {
      m(b), _();
    };
    try {
      f.decodeAudioData(d, (b) => {
        typeof b.copyFromChannel != "function" && (l(b), Os(b)), s.add(b), _().then(() => p(b));
      }, (b) => {
        v(b === null ? n() : b);
      });
    } catch (b) {
      v(b);
    }
  });
}, ko = (s, e, t, n, r, i, o, a) => (c, l) => {
  const u = e.get(c);
  if (u === void 0) throw new Error("Missing the expected cycle count.");
  const h = a(i(c.context));
  if (u === l) {
    if (e.delete(c), !h && o(c)) {
      const d = n(c), { outputs: f } = t(c);
      for (const p of f) if (Zt(p)) s(d, n(p[0]), p[1], p[2]);
      else {
        const m = r(p[0]);
        d.connect(m, p[1]);
      }
    }
  } else e.set(c, u - l);
}, Oo = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  delayTime: 0,
  maxDelayTime: 1
}, No = (s, e, t, n, r, i, o) => class extends s {
  constructor(c, l) {
    const u = r(c), h = {
      ...Oo,
      ...l
    }, d = n(u, h), f = i(u), p = f ? t(h.maxDelayTime) : null;
    super(c, !1, d, p), this._delayTime = e(this, f, d.delayTime), o(this, h.maxDelayTime);
  }
  get delayTime() {
    return this._delayTime;
  }
}, Mo = (s, e, t, n, r) => (i) => {
  const o = /* @__PURE__ */ new WeakMap(), a = async (c, l) => {
    let u = t(c);
    const h = ye(u, l);
    return h || (u = e(l, {
      channelCount: u.channelCount,
      channelCountMode: u.channelCountMode,
      channelInterpretation: u.channelInterpretation,
      delayTime: u.delayTime.value,
      maxDelayTime: i
    })), o.set(l, u), h ? await s(l, c.delayTime, u.delayTime) : await n(l, c.delayTime, u.delayTime), await r(c, l, u), u;
  };
  return { render(c, l) {
    const u = o.get(l);
    return u !== void 0 ? Promise.resolve(u) : a(c, l);
  } };
}, Do = (s) => (e, t, n, r) => s(e[r], (i) => i[0] === t && i[1] === n), Eo = (s) => (e, t) => {
  s(e).delete(t);
}, Io = (s) => "delayTime" in s, Ro = (s, e, t) => function n(r, i) {
  const o = cn(i) ? i : t(s, i);
  if (Io(o)) return [];
  if (r[0] === o) return [r];
  if (r.includes(o)) return [];
  const { outputs: a } = e(o);
  return Array.from(a).map((c) => n([...r, o], c[0])).reduce((c, l) => c.concat(l), []);
}, Jt = (s, e, t) => {
  const n = e[t];
  if (n === void 0) throw s();
  return n;
}, Vo = (s) => (e, t = void 0, n = void 0, r = 0) => t === void 0 ? e.forEach((i) => i.disconnect()) : typeof t == "number" ? Jt(s, e, t).disconnect() : hn(t) ? n === void 0 ? e.forEach((i) => i.disconnect(t)) : r === void 0 ? Jt(s, e, n).disconnect(t, 0) : Jt(s, e, n).disconnect(t, 0, r) : n === void 0 ? e.forEach((i) => i.disconnect(t)) : Jt(s, e, n).disconnect(t, 0), Po = {
  attack: 3e-3,
  channelCount: 2,
  channelCountMode: "clamped-max",
  channelInterpretation: "speakers",
  knee: 30,
  ratio: 12,
  release: 0.25,
  threshold: -24
}, Fo = (s, e, t, n, r, i, o, a) => class extends s {
  constructor(l, u) {
    const h = i(l), d = n(h, {
      ...Po,
      ...u
    }), f = o(h), p = f ? t() : null;
    super(l, !1, d, p), this._attack = e(this, f, d.attack), this._knee = e(this, f, d.knee), this._nativeDynamicsCompressorNode = d, this._ratio = e(this, f, d.ratio), this._release = e(this, f, d.release), this._threshold = e(this, f, d.threshold), a(this, 6e-3);
  }
  get attack() {
    return this._attack;
  }
  get channelCount() {
    return this._nativeDynamicsCompressorNode.channelCount;
  }
  set channelCount(l) {
    const u = this._nativeDynamicsCompressorNode.channelCount;
    if (this._nativeDynamicsCompressorNode.channelCount = l, l > 2)
      throw this._nativeDynamicsCompressorNode.channelCount = u, r();
  }
  get channelCountMode() {
    return this._nativeDynamicsCompressorNode.channelCountMode;
  }
  set channelCountMode(l) {
    const u = this._nativeDynamicsCompressorNode.channelCountMode;
    if (this._nativeDynamicsCompressorNode.channelCountMode = l, l === "max")
      throw this._nativeDynamicsCompressorNode.channelCountMode = u, r();
  }
  get knee() {
    return this._knee;
  }
  get ratio() {
    return this._ratio;
  }
  get reduction() {
    return typeof this._nativeDynamicsCompressorNode.reduction.value == "number" ? this._nativeDynamicsCompressorNode.reduction.value : this._nativeDynamicsCompressorNode.reduction;
  }
  get release() {
    return this._release;
  }
  get threshold() {
    return this._threshold;
  }
}, qo = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = ye(l, c);
    return u || (l = e(c, {
      attack: l.attack.value,
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      knee: l.knee.value,
      ratio: l.ratio.value,
      release: l.release.value,
      threshold: l.threshold.value
    })), i.set(c, l), u ? (await s(c, a.attack, l.attack), await s(c, a.knee, l.knee), await s(c, a.ratio, l.ratio), await s(c, a.release, l.release), await s(c, a.threshold, l.threshold)) : (await n(c, a.attack, l.attack), await n(c, a.knee, l.knee), await n(c, a.ratio, l.ratio), await n(c, a.release, l.release), await n(c, a.threshold, l.threshold)), await r(a, c, l), l;
  };
  return { render(a, c) {
    const l = i.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, Lo = () => new DOMException("", "EncodingError"), Wo = (s) => (e) => new Promise((t, n) => {
  if (s === null) {
    n(/* @__PURE__ */ new SyntaxError());
    return;
  }
  const r = s.document.head;
  if (r === null) n(/* @__PURE__ */ new SyntaxError());
  else {
    const i = s.document.createElement("script"), o = new Blob([e], { type: "application/javascript" }), a = URL.createObjectURL(o), c = s.onerror, l = () => {
      s.onerror = c, URL.revokeObjectURL(a);
    };
    s.onerror = (u, h, d, f, p) => {
      if (h === a || h === s.location.href && d === 1 && f === 1)
        return l(), n(p), !1;
      if (c !== null) return c(u, h, d, f, p);
    }, i.onerror = () => {
      l(), n(/* @__PURE__ */ new SyntaxError());
    }, i.onload = () => {
      l(), t();
    }, i.src = a, i.type = "module", r.appendChild(i);
  }
}), jo = (s) => class {
  constructor(t) {
    this._nativeEventTarget = t, this._listeners = /* @__PURE__ */ new WeakMap();
  }
  addEventListener(t, n, r) {
    if (n !== null) {
      let i = this._listeners.get(n);
      i === void 0 && (i = s(this, n), typeof n == "function" && this._listeners.set(n, i)), this._nativeEventTarget.addEventListener(t, i, r);
    }
  }
  dispatchEvent(t) {
    return this._nativeEventTarget.dispatchEvent(t);
  }
  removeEventListener(t, n, r) {
    const i = n === null ? void 0 : this._listeners.get(n);
    this._nativeEventTarget.removeEventListener(t, i === void 0 ? null : i, r);
  }
}, Bo = (s) => (e, t, n) => {
  Object.defineProperties(s, {
    currentFrame: {
      configurable: !0,
      get() {
        return Math.round(e * t);
      }
    },
    currentTime: {
      configurable: !0,
      get() {
        return e;
      }
    }
  });
  try {
    return n();
  } finally {
    s !== null && (delete s.currentFrame, delete s.currentTime);
  }
}, Uo = (s) => async (e) => {
  try {
    const t = await fetch(e);
    if (t.ok) return [await t.text(), t.url];
  } catch {
  }
  throw s();
}, Go = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  gain: 1
}, zo = (s, e, t, n, r, i) => class extends s {
  constructor(a, c) {
    const l = r(a), u = n(l, {
      ...Go,
      ...c
    }), h = i(l), d = h ? t() : null;
    super(a, !1, u, d), this._gain = e(this, h, u.gain, we, Ae);
  }
  get gain() {
    return this._gain;
  }
}, $o = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = ye(l, c);
    return u || (l = e(c, {
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      gain: l.gain.value
    })), i.set(c, l), u ? await s(c, a.gain, l.gain) : await n(c, a.gain, l.gain), await r(a, c, l), l;
  };
  return { render(a, c) {
    const l = i.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, Zo = (s, e) => (t) => e(s, t), Xo = (s) => (e) => {
  const t = s(e);
  if (t.renderer === null) throw new Error("Missing the renderer of the given AudioNode in the audio graph.");
  return t.renderer;
}, Ho = (s) => (e) => {
  var t;
  return (t = s.get(e)) !== null && t !== void 0 ? t : 0;
}, Qo = (s) => (e) => {
  const t = s(e);
  if (t.renderer === null) throw new Error("Missing the renderer of the given AudioParam in the audio graph.");
  return t.renderer;
}, Yo = (s) => (e) => s.get(e), he = () => new DOMException("", "InvalidStateError"), Jo = (s) => (e) => {
  const t = s.get(e);
  if (t === void 0) throw he();
  return t;
}, Ko = (s, e) => (t) => {
  let n = s.get(t);
  if (n !== void 0) return n;
  if (e === null) throw new Error("Missing the native OfflineAudioContext constructor.");
  return n = new e(1, 1, 44100), s.set(t, n), n;
}, ec = (s) => (e) => {
  const t = s.get(e);
  if (t === void 0) throw new Error("The context has no set of AudioWorkletNodes.");
  return t;
}, Cn = () => new DOMException("", "InvalidAccessError"), tc = (s) => {
  s.getFrequencyResponse = /* @__PURE__ */ ((e) => (t, n, r) => {
    if (t.length !== n.length || n.length !== r.length) throw Cn();
    return e.call(s, t, n, r);
  })(s.getFrequencyResponse);
}, nc = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers"
}, sc = (s, e, t, n, r, i) => class extends s {
  constructor(a, c) {
    const l = n(a), u = r(l), h = {
      ...nc,
      ...c
    }, d = e(l, u ? null : a.baseLatency, h), f = u ? t(h.feedback, h.feedforward) : null;
    super(a, !1, d, f), tc(d), this._nativeIIRFilterNode = d, i(this, 1);
  }
  getFrequencyResponse(a, c, l) {
    return this._nativeIIRFilterNode.getFrequencyResponse(a, c, l);
  }
}, $r = (s, e, t, n, r, i, o, a, c, l, u) => {
  const h = l.length;
  let d = a;
  for (let f = 0; f < h; f += 1) {
    let p = t[0] * l[f];
    for (let m = 1; m < r; m += 1) {
      const _ = d - m & c - 1;
      p += t[m] * i[_], p -= s[m] * o[_];
    }
    for (let m = r; m < n; m += 1) p += t[m] * i[d - m & c - 1];
    for (let m = r; m < e; m += 1) p -= s[m] * o[d - m & c - 1];
    i[d] = l[f], o[d] = p, d = d + 1 & c - 1, u[f] = p;
  }
  return d;
}, rc = (s, e, t, n) => {
  const r = t instanceof Float64Array ? t : new Float64Array(t), i = n instanceof Float64Array ? n : new Float64Array(n), o = r.length, a = i.length, c = Math.min(o, a);
  if (r[0] !== 1) {
    for (let p = 0; p < o; p += 1) i[p] /= r[0];
    for (let p = 1; p < a; p += 1) r[p] /= r[0];
  }
  const l = 32, u = new Float32Array(l), h = new Float32Array(l), d = e.createBuffer(s.numberOfChannels, s.length, s.sampleRate), f = s.numberOfChannels;
  for (let p = 0; p < f; p += 1) {
    const m = s.getChannelData(p), _ = d.getChannelData(p);
    u.fill(0), h.fill(0), $r(r, o, i, a, c, u, h, 0, l, m, _);
  }
  return d;
}, ic = (s, e, t, n, r) => (i, o) => {
  const a = /* @__PURE__ */ new WeakMap();
  let c = null;
  const l = async (u, h) => {
    let d = null, f = e(u);
    const p = ye(f, h);
    if (h.createIIRFilter === void 0 ? d = s(h, {
      buffer: null,
      channelCount: 2,
      channelCountMode: "max",
      channelInterpretation: "speakers",
      loop: !1,
      loopEnd: 0,
      loopStart: 0,
      playbackRate: 1
    }) : p || (f = h.createIIRFilter(o, i)), a.set(h, d === null ? f : d), d !== null) {
      if (c === null) {
        if (t === null) throw new Error("Missing the native OfflineAudioContext constructor.");
        const _ = new t(u.context.destination.channelCount, u.context.length, h.sampleRate);
        c = (async () => {
          await n(u, _, _.destination);
          const v = await r(_);
          return rc(v, h, i, o);
        })();
      }
      const m = await c;
      return d.buffer = m, d.start(0), d;
    }
    return await n(u, h, f), f;
  };
  return { render(u, h) {
    const d = a.get(h);
    return d !== void 0 ? Promise.resolve(d) : l(u, h);
  } };
}, ac = (s, e, t, n, r, i) => (o) => (a, c) => {
  const l = s.get(a);
  if (l === void 0) {
    if (!o && i(a)) {
      const u = n(a), { outputs: h } = t(a);
      for (const d of h) if (Zt(d)) e(u, n(d[0]), d[1], d[2]);
      else {
        const f = r(d[0]);
        u.disconnect(f, d[1]);
      }
    }
    s.set(a, c);
  } else s.set(a, l + c);
}, oc = (s, e) => (t) => e(s.get(t)) || e(t), cc = (s, e) => (t) => s.has(t) || e(t), lc = (s, e) => (t) => s.has(t) || e(t), uc = (s, e) => (t) => e(s.get(t)) || e(t), hc = (s) => (e) => s !== null && e instanceof s, dc = (s) => (e) => s !== null && typeof s.AudioNode == "function" && e instanceof s.AudioNode, pc = (s) => (e) => s !== null && typeof s.AudioParam == "function" && e instanceof s.AudioParam, fc = (s, e) => (t) => s(t) || e(t), mc = (s) => (e) => s !== null && e instanceof s, _c = (s) => s !== null && s.isSecureContext, gc = (s, e, t, n) => class extends s {
  constructor(i, o) {
    const a = t(i), c = e(a, o);
    if (n(a)) throw TypeError();
    super(i, !0, c, null), this._nativeMediaElementAudioSourceNode = c;
  }
  get mediaElement() {
    return this._nativeMediaElementAudioSourceNode.mediaElement;
  }
}, vc = {
  channelCount: 2,
  channelCountMode: "explicit",
  channelInterpretation: "speakers"
}, yc = (s, e, t, n) => class extends s {
  constructor(i, o) {
    const a = t(i);
    if (n(a)) throw new TypeError();
    const c = e(a, {
      ...vc,
      ...o
    });
    super(i, !1, c, null), this._nativeMediaStreamAudioDestinationNode = c;
  }
  get stream() {
    return this._nativeMediaStreamAudioDestinationNode.stream;
  }
}, Tc = (s, e, t, n) => class extends s {
  constructor(i, o) {
    const a = t(i), c = e(a, o);
    if (n(a)) throw new TypeError();
    super(i, !0, c, null), this._nativeMediaStreamAudioSourceNode = c;
  }
  get mediaStream() {
    return this._nativeMediaStreamAudioSourceNode.mediaStream;
  }
}, wc = (s, e, t) => class extends s {
  constructor(r, i) {
    const o = e(t(r), i);
    super(r, !0, o, null);
  }
}, bc = (s, e, t, n, r) => class extends n {
  constructor(o = {}) {
    if (r === null) throw new Error("Missing the native AudioContext constructor.");
    let a;
    try {
      a = new r(o);
    } catch (u) {
      throw u.code === 12 && u.message === "sampleRate is not in range" ? e() : u;
    }
    if (a === null) throw t();
    if (!Wr(o.latencyHint)) throw new TypeError(`The provided value '${o.latencyHint}' is not a valid enum value of type AudioContextLatencyCategory.`);
    if (o.sampleRate !== void 0 && a.sampleRate !== o.sampleRate) throw e();
    super(a, 2);
    const { latencyHint: c } = o, { sampleRate: l } = a;
    if (this._baseLatency = typeof a.baseLatency == "number" ? a.baseLatency : c === "balanced" ? 512 / l : c === "interactive" || c === void 0 ? 256 / l : c === "playback" ? 1024 / l : Math.max(2, Math.min(128, Math.round(c * l / 128))) * 128 / l, this._nativeAudioContext = a, r.name === "webkitAudioContext" ? (this._nativeGainNode = a.createGain(), this._nativeOscillatorNode = a.createOscillator(), this._nativeGainNode.gain.value = 1e-37, this._nativeOscillatorNode.connect(this._nativeGainNode).connect(a.destination), this._nativeOscillatorNode.start()) : (this._nativeGainNode = null, this._nativeOscillatorNode = null), this._state = null, a.state === "running") {
      this._state = "suspended";
      const u = () => {
        this._state === "suspended" && (this._state = null), a.removeEventListener("statechange", u);
      };
      a.addEventListener("statechange", u);
    }
  }
  get baseLatency() {
    return this._baseLatency;
  }
  get state() {
    return this._state !== null ? this._state : this._nativeAudioContext.state;
  }
  close() {
    return this.state === "closed" ? this._nativeAudioContext.close().then(() => {
      throw s();
    }) : (this._state === "suspended" && (this._state = null), this._nativeAudioContext.close().then(() => {
      this._nativeGainNode !== null && this._nativeOscillatorNode !== null && (this._nativeOscillatorNode.stop(), this._nativeGainNode.disconnect(), this._nativeOscillatorNode.disconnect()), bn(this);
    }));
  }
  resume() {
    return this._state === "suspended" ? new Promise((o, a) => {
      const c = () => {
        this._nativeAudioContext.removeEventListener("statechange", c), this._nativeAudioContext.state === "running" ? o() : this.resume().then(o, a);
      };
      this._nativeAudioContext.addEventListener("statechange", c);
    }) : this._nativeAudioContext.resume().catch((o) => {
      throw o === void 0 || o.code === 15 ? s() : o;
    });
  }
  suspend() {
    return this._nativeAudioContext.suspend().catch((o) => {
      throw o === void 0 ? s() : o;
    });
  }
}, Cc = (s, e, t, n, r, i) => class extends t {
  constructor(a, c) {
    super(a), this._nativeContext = a, Tn.set(this, a), n(a) && r.set(a, /* @__PURE__ */ new Set()), this._destination = new s(this, c), this._listener = e(this, a), this._onstatechange = null;
  }
  get currentTime() {
    return this._nativeContext.currentTime;
  }
  get destination() {
    return this._destination;
  }
  get listener() {
    return this._listener;
  }
  get onstatechange() {
    return this._onstatechange;
  }
  set onstatechange(a) {
    const c = typeof a == "function" ? i(this, a) : null;
    this._nativeContext.onstatechange = c;
    const l = this._nativeContext.onstatechange;
    this._onstatechange = l !== null && l === c ? a : l;
  }
  get sampleRate() {
    return this._nativeContext.sampleRate;
  }
  get state() {
    return this._nativeContext.state;
  }
}, dt = (s) => {
  const e = new Uint32Array([
    1179011410,
    40,
    1163280727,
    544501094,
    16,
    131073,
    44100,
    176400,
    1048580,
    1635017060,
    4,
    0
  ]);
  try {
    const t = s.decodeAudioData(e.buffer, () => {
    });
    return t === void 0 ? !1 : (t.catch(() => {
    }), !0);
  } catch {
  }
  return !1;
}, xc = { numberOfChannels: 1 }, Sc = (s, e, t, n, r) => class extends n {
  constructor(o) {
    const { length: a, numberOfChannels: c, sampleRate: l } = {
      ...xc,
      ...o
    }, u = t(c, a, l);
    s(dt, () => dt(u)) || u.addEventListener("statechange", /* @__PURE__ */ (() => {
      let h = 0;
      const d = (f) => {
        this._state === "running" && (h > 0 ? (u.removeEventListener("statechange", d), f.stopImmediatePropagation(), this._waitForThePromiseToSettle(f)) : h += 1);
      };
      return d;
    })()), super(u, c), this._length = a, this._nativeOfflineAudioContext = u, this._state = null;
  }
  get length() {
    return this._nativeOfflineAudioContext.length === void 0 ? this._length : this._nativeOfflineAudioContext.length;
  }
  get state() {
    return this._state === null ? this._nativeOfflineAudioContext.state : this._state;
  }
  startRendering() {
    return this._state === "running" ? Promise.reject(e()) : (this._state = "running", r(this.destination, this._nativeOfflineAudioContext).finally(() => {
      this._state = null, bn(this);
    }));
  }
  _waitForThePromiseToSettle(o) {
    this._state === null ? this._nativeOfflineAudioContext.dispatchEvent(o) : setTimeout(() => this._waitForThePromiseToSettle(o));
  }
}, Ac = (s, e) => (t, n, r) => {
  const i = /* @__PURE__ */ new Set();
  return t.connect = /* @__PURE__ */ ((o) => (a, c = 0, l = 0) => {
    const u = i.size === 0;
    if (e(a))
      return o.call(t, a, c, l), s(i, [
        a,
        c,
        l
      ], (h) => h[0] === a && h[1] === c && h[2] === l, !0), u && n(), a;
    o.call(t, a, c), s(i, [a, c], (h) => h[0] === a && h[1] === c, !0), u && n();
  })(t.connect), t.disconnect = /* @__PURE__ */ ((o) => (a, c, l) => {
    const u = i.size > 0;
    if (a === void 0)
      o.apply(t), i.clear();
    else if (typeof a == "number") {
      o.call(t, a);
      for (const d of i) d[1] === a && i.delete(d);
    } else {
      e(a) ? o.call(t, a, c, l) : o.call(t, a, c);
      for (const d of i) d[0] === a && (c === void 0 || d[1] === c) && (l === void 0 || d[2] === l) && i.delete(d);
    }
    const h = i.size === 0;
    u && h && r();
  })(t.disconnect), t;
}, ne = (s, e, t) => {
  const n = e[t];
  n !== void 0 && n !== s[t] && (s[t] = n);
}, fe = (s, e) => {
  ne(s, e, "channelCount"), ne(s, e, "channelCountMode"), ne(s, e, "channelInterpretation");
}, lr = (s) => typeof s.getFloatTimeDomainData == "function", kc = (s) => {
  s.getFloatTimeDomainData = (e) => {
    const t = new Uint8Array(e.length);
    s.getByteTimeDomainData(t);
    const n = Math.max(t.length, s.fftSize);
    for (let r = 0; r < n; r += 1) e[r] = (t[r] - 128) * 78125e-7;
    return e;
  };
}, Oc = (s, e) => (t, n) => {
  const r = t.createAnalyser();
  if (fe(r, n), !(n.maxDecibels > n.minDecibels)) throw e();
  return ne(r, n, "fftSize"), ne(r, n, "maxDecibels"), ne(r, n, "minDecibels"), ne(r, n, "smoothingTimeConstant"), s(lr, () => lr(r)) || kc(r), r;
}, Nc = (s) => s === null ? null : s.hasOwnProperty("AudioBuffer") ? s.AudioBuffer : null, ae = (s, e, t) => {
  const n = e[t];
  n !== void 0 && n !== s[t].value && (s[t].value = n);
}, Mc = (s) => {
  s.start = /* @__PURE__ */ ((e) => {
    let t = !1;
    return (n = 0, r = 0, i) => {
      if (t) throw he();
      e.call(s, n, r, i), t = !0;
    };
  })(s.start);
}, Ds = (s) => {
  s.start = /* @__PURE__ */ ((e) => (t = 0, n = 0, r) => {
    if (typeof r == "number" && r < 0 || n < 0 || t < 0) throw new RangeError("The parameters can't be negative.");
    e.call(s, t, n, r);
  })(s.start);
}, Es = (s) => {
  s.stop = /* @__PURE__ */ ((e) => (t = 0) => {
    if (t < 0) throw new RangeError("The parameter can't be negative.");
    e.call(s, t);
  })(s.stop);
}, Dc = (s, e, t, n, r, i, o, a, c, l, u) => (h, d) => {
  const f = h.createBufferSource();
  return fe(f, d), ae(f, d, "playbackRate"), ne(f, d, "buffer"), ne(f, d, "loop"), ne(f, d, "loopEnd"), ne(f, d, "loopStart"), e(t, () => t(h)) || Mc(f), e(n, () => n(h)) || c(f), e(r, () => r(h)) || l(f, h), e(i, () => i(h)) || Ds(f), e(o, () => o(h)) || u(f, h), e(a, () => a(h)) || Es(f), s(h, f), f;
}, Ec = (s) => s === null ? null : s.hasOwnProperty("AudioContext") ? s.AudioContext : s.hasOwnProperty("webkitAudioContext") ? s.webkitAudioContext : null, Ic = (s, e) => (t, n, r) => {
  const i = t.destination;
  if (i.channelCount !== n) try {
    i.channelCount = n;
  } catch {
  }
  r && i.channelCountMode !== "explicit" && (i.channelCountMode = "explicit"), i.maxChannelCount === 0 && Object.defineProperty(i, "maxChannelCount", { value: n });
  const o = s(t, {
    channelCount: n,
    channelCountMode: i.channelCountMode,
    channelInterpretation: i.channelInterpretation,
    gain: 1
  });
  return e(o, "channelCount", (a) => () => a.call(o), (a) => (c) => {
    a.call(o, c);
    try {
      i.channelCount = c;
    } catch (l) {
      if (c > i.maxChannelCount) throw l;
    }
  }), e(o, "channelCountMode", (a) => () => a.call(o), (a) => (c) => {
    a.call(o, c), i.channelCountMode = c;
  }), e(o, "channelInterpretation", (a) => () => a.call(o), (a) => (c) => {
    a.call(o, c), i.channelInterpretation = c;
  }), Object.defineProperty(o, "maxChannelCount", { get: () => i.maxChannelCount }), o.connect(i), o;
}, Rc = (s) => s === null ? null : s.hasOwnProperty("AudioWorkletNode") ? s.AudioWorkletNode : null, Vc = (s) => {
  const { port1: e } = new MessageChannel();
  try {
    e.postMessage(s);
  } finally {
    e.close();
  }
}, Pc = (s, e, t, n, r) => (i, o, a, c, l, u) => {
  if (a !== null) try {
    const h = new a(i, c, u), d = /* @__PURE__ */ new Map();
    let f = null;
    if (Object.defineProperties(h, {
      channelCount: {
        get: () => u.channelCount,
        set: () => {
          throw s();
        }
      },
      channelCountMode: {
        get: () => "explicit",
        set: () => {
          throw s();
        }
      },
      onprocessorerror: {
        get: () => f,
        set: (p) => {
          typeof f == "function" && h.removeEventListener("processorerror", f), f = typeof p == "function" ? p : null, typeof f == "function" && h.addEventListener("processorerror", f);
        }
      }
    }), h.addEventListener = /* @__PURE__ */ ((p) => (...m) => {
      if (m[0] === "processorerror") {
        const _ = typeof m[1] == "function" ? m[1] : typeof m[1] == "object" && m[1] !== null && typeof m[1].handleEvent == "function" ? m[1].handleEvent : null;
        if (_ !== null) {
          const v = d.get(m[1]);
          v !== void 0 ? m[1] = v : (m[1] = (b) => {
            b.type === "error" ? (Object.defineProperties(b, { type: { value: "processorerror" } }), _(b)) : _(new ErrorEvent(m[0], { ...b }));
          }, d.set(_, m[1]));
        }
      }
      return p.call(h, "error", m[1], m[2]), p.call(h, ...m);
    })(h.addEventListener), h.removeEventListener = /* @__PURE__ */ ((p) => (...m) => {
      if (m[0] === "processorerror") {
        const _ = d.get(m[1]);
        _ !== void 0 && (d.delete(m[1]), m[1] = _);
      }
      return p.call(h, "error", m[1], m[2]), p.call(h, m[0], m[1], m[2]);
    })(h.removeEventListener), u.numberOfOutputs !== 0) {
      const p = t(i, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        gain: 0
      });
      return h.connect(p).connect(i.destination), r(h, () => p.disconnect(), () => p.connect(i.destination));
    }
    return h;
  } catch (h) {
    throw h.code === 11 ? n() : h;
  }
  if (l === void 0) throw n();
  return Vc(u), e(i, o, l, u);
}, Zr = (s, e) => s === null ? 512 : Math.max(512, Math.min(16384, Math.pow(2, Math.round(Math.log2(s * e))))), Fc = (s) => new Promise((e, t) => {
  const { port1: n, port2: r } = new MessageChannel();
  n.onmessage = ({ data: i }) => {
    n.close(), r.close(), e(i);
  }, n.onmessageerror = ({ data: i }) => {
    n.close(), r.close(), t(i);
  }, r.postMessage(s);
}), qc = async (s, e) => new s(await Fc(e)), Lc = (s, e, t, n) => {
  let r = Dn.get(s);
  r === void 0 && (r = /* @__PURE__ */ new WeakMap(), Dn.set(s, r));
  const i = qc(t, n);
  return r.set(e, i), i;
}, Wc = (s, e, t, n, r, i, o, a, c, l, u, h, d) => (f, p, m, _) => {
  if (_.numberOfInputs === 0 && _.numberOfOutputs === 0) throw c();
  const v = Array.isArray(_.outputChannelCount) ? _.outputChannelCount : Array.from(_.outputChannelCount);
  if (v.some((L) => L < 1)) throw c();
  if (v.length !== _.numberOfOutputs) throw e();
  if (_.channelCountMode !== "explicit") throw c();
  const b = _.channelCount * _.numberOfInputs, S = v.reduce((L, B) => L + B, 0), k = m.parameterDescriptors === void 0 ? 0 : m.parameterDescriptors.length;
  if (b + k > 6 || S > 6) throw c();
  const g = new MessageChannel(), T = [], y = [];
  for (let L = 0; L < _.numberOfInputs; L += 1)
    T.push(o(f, {
      channelCount: _.channelCount,
      channelCountMode: _.channelCountMode,
      channelInterpretation: _.channelInterpretation,
      gain: 1
    })), y.push(r(f, {
      channelCount: _.channelCount,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      numberOfOutputs: _.channelCount
    }));
  const w = [];
  if (m.parameterDescriptors !== void 0) for (const { defaultValue: L, maxValue: B, minValue: de, name: se } of m.parameterDescriptors) {
    const X = i(f, {
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      offset: _.parameterData[se] !== void 0 ? _.parameterData[se] : L === void 0 ? 0 : L
    });
    Object.defineProperties(X.offset, {
      defaultValue: { get: () => L === void 0 ? 0 : L },
      maxValue: { get: () => B === void 0 ? we : B },
      minValue: { get: () => de === void 0 ? Ae : de }
    }), w.push(X);
  }
  const I = n(f, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    numberOfInputs: Math.max(1, b + k)
  }), E = Zr(p, f.sampleRate), O = a(f, E, b + k, Math.max(1, S)), N = r(f, {
    channelCount: Math.max(1, S),
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    numberOfOutputs: Math.max(1, S)
  }), q = [];
  for (let L = 0; L < _.numberOfOutputs; L += 1) q.push(n(f, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    numberOfInputs: v[L]
  }));
  for (let L = 0; L < _.numberOfInputs; L += 1) {
    T[L].connect(y[L]);
    for (let B = 0; B < _.channelCount; B += 1) y[L].connect(I, B, L * _.channelCount + B);
  }
  const P = new Gr(m.parameterDescriptors === void 0 ? [] : m.parameterDescriptors.map(({ name: L }, B) => {
    const de = w[B];
    return de.connect(I, 0, b + B), de.start(0), [L, de.offset];
  }));
  I.connect(O);
  let U = _.channelInterpretation, j = null;
  const F = _.numberOfOutputs === 0 ? [O] : q, A = {
    get bufferSize() {
      return E;
    },
    get channelCount() {
      return _.channelCount;
    },
    set channelCount(L) {
      throw t();
    },
    get channelCountMode() {
      return _.channelCountMode;
    },
    set channelCountMode(L) {
      throw t();
    },
    get channelInterpretation() {
      return U;
    },
    set channelInterpretation(L) {
      for (const B of T) B.channelInterpretation = L;
      U = L;
    },
    get context() {
      return O.context;
    },
    get inputs() {
      return T;
    },
    get numberOfInputs() {
      return _.numberOfInputs;
    },
    get numberOfOutputs() {
      return _.numberOfOutputs;
    },
    get onprocessorerror() {
      return j;
    },
    set onprocessorerror(L) {
      typeof j == "function" && A.removeEventListener("processorerror", j), j = typeof L == "function" ? L : null, typeof j == "function" && A.addEventListener("processorerror", j);
    },
    get parameters() {
      return P;
    },
    get port() {
      return g.port2;
    },
    addEventListener(...L) {
      return O.addEventListener(L[0], L[1], L[2]);
    },
    connect: s.bind(null, F),
    disconnect: l.bind(null, F),
    dispatchEvent(...L) {
      return O.dispatchEvent(L[0]);
    },
    removeEventListener(...L) {
      return O.removeEventListener(L[0], L[1], L[2]);
    }
  }, C = /* @__PURE__ */ new Map();
  g.port1.addEventListener = /* @__PURE__ */ ((L) => (...B) => {
    if (B[0] === "message") {
      const de = typeof B[1] == "function" ? B[1] : typeof B[1] == "object" && B[1] !== null && typeof B[1].handleEvent == "function" ? B[1].handleEvent : null;
      if (de !== null) {
        const se = C.get(B[1]);
        se !== void 0 ? B[1] = se : (B[1] = (X) => {
          u(f.currentTime, f.sampleRate, () => de(X));
        }, C.set(de, B[1]));
      }
    }
    return L.call(g.port1, B[0], B[1], B[2]);
  })(g.port1.addEventListener), g.port1.removeEventListener = /* @__PURE__ */ ((L) => (...B) => {
    if (B[0] === "message") {
      const de = C.get(B[1]);
      de !== void 0 && (C.delete(B[1]), B[1] = de);
    }
    return L.call(g.port1, B[0], B[1], B[2]);
  })(g.port1.removeEventListener);
  let x = null;
  Object.defineProperty(g.port1, "onmessage", {
    get: () => x,
    set: (L) => {
      typeof x == "function" && g.port1.removeEventListener("message", x), x = typeof L == "function" ? L : null, typeof x == "function" && (g.port1.addEventListener("message", x), g.port1.start());
    }
  }), m.prototype.port = g.port1;
  let D = null;
  Lc(f, A, m, _).then((L) => D = L);
  const R = pn(_.numberOfInputs, _.channelCount), V = pn(_.numberOfOutputs, v), re = m.parameterDescriptors === void 0 ? [] : m.parameterDescriptors.reduce((L, { name: B }) => ({
    ...L,
    [B]: /* @__PURE__ */ new Float32Array(128)
  }), {});
  let z = !0;
  const J = () => {
    _.numberOfOutputs > 0 && O.disconnect(N);
    for (let L = 0, B = 0; L < _.numberOfOutputs; L += 1) {
      const de = q[L];
      for (let se = 0; se < v[L]; se += 1) N.disconnect(de, B + se, se);
      B += v[L];
    }
  }, ie = /* @__PURE__ */ new Map();
  O.onaudioprocess = ({ inputBuffer: L, outputBuffer: B }) => {
    if (D !== null) {
      const de = h(A);
      for (let se = 0; se < E; se += 128) {
        for (let X = 0; X < _.numberOfInputs; X += 1) for (let H = 0; H < _.channelCount; H += 1) dn(L, R[X], H, H, se);
        m.parameterDescriptors !== void 0 && m.parameterDescriptors.forEach(({ name: X }, H) => {
          dn(L, re, X, b + H, se);
        });
        for (let X = 0; X < _.numberOfInputs; X += 1) for (let H = 0; H < v[X]; H += 1) V[X][H].byteLength === 0 && (V[X][H] = /* @__PURE__ */ new Float32Array(128));
        try {
          const X = R.map((H, Ee) => {
            if (de[Ee].size > 0)
              return ie.set(Ee, E / 128), H;
            const Qe = ie.get(Ee);
            return Qe === void 0 ? [] : (H.every((Zi) => Zi.every((Xi) => Xi === 0)) && (Qe === 1 ? ie.delete(Ee) : ie.set(Ee, Qe - 1)), H);
          });
          z = u(f.currentTime + se / f.sampleRate, f.sampleRate, () => D.process(X, V, re));
          for (let H = 0, Ee = 0; H < _.numberOfOutputs; H += 1) {
            for (let Qe = 0; Qe < v[H]; Qe += 1) zr(B, V[H], Qe, Ee + Qe, se);
            Ee += v[H];
          }
        } catch (X) {
          z = !1, A.dispatchEvent(new ErrorEvent("processorerror", {
            colno: X.colno,
            filename: X.filename,
            lineno: X.lineno,
            message: X.message
          }));
        }
        if (!z) {
          for (let X = 0; X < _.numberOfInputs; X += 1) {
            T[X].disconnect(y[X]);
            for (let H = 0; H < _.channelCount; H += 1) y[se].disconnect(I, H, X * _.channelCount + H);
          }
          if (m.parameterDescriptors !== void 0) {
            const X = m.parameterDescriptors.length;
            for (let H = 0; H < X; H += 1) {
              const Ee = w[H];
              Ee.disconnect(I, 0, b + H), Ee.stop();
            }
          }
          I.disconnect(O), O.onaudioprocess = null, W ? J() : Ue();
          break;
        }
      }
    }
  };
  let W = !1;
  const Te = o(f, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  }), Se = () => O.connect(Te).connect(f.destination), Ue = () => {
    O.disconnect(Te), Te.disconnect();
  }, Oe = () => {
    if (z) {
      Ue(), _.numberOfOutputs > 0 && O.connect(N);
      for (let L = 0, B = 0; L < _.numberOfOutputs; L += 1) {
        const de = q[L];
        for (let se = 0; se < v[L]; se += 1) N.connect(de, B + se, se);
        B += v[L];
      }
    }
    W = !0;
  }, $i = () => {
    z && (Se(), J()), W = !1;
  };
  return Se(), d(A, Oe, $i);
}, Xr = (s, e) => {
  const t = s.createBiquadFilter();
  return fe(t, e), ae(t, e, "Q"), ae(t, e, "detune"), ae(t, e, "frequency"), ae(t, e, "gain"), ne(t, e, "type"), t;
}, jc = (s, e) => (t, n) => {
  const r = t.createChannelMerger(n.numberOfInputs);
  return s !== null && s.name === "webkitAudioContext" && e(t, r), fe(r, n), r;
}, Bc = (s) => {
  const e = s.numberOfOutputs;
  Object.defineProperty(s, "channelCount", {
    get: () => e,
    set: (t) => {
      if (t !== e) throw he();
    }
  }), Object.defineProperty(s, "channelCountMode", {
    get: () => "explicit",
    set: (t) => {
      if (t !== "explicit") throw he();
    }
  }), Object.defineProperty(s, "channelInterpretation", {
    get: () => "discrete",
    set: (t) => {
      if (t !== "discrete") throw he();
    }
  });
}, Wt = (s, e) => {
  const t = s.createChannelSplitter(e.numberOfOutputs);
  return fe(t, e), Bc(t), t;
}, Uc = (s, e, t, n, r) => (i, o) => {
  if (i.createConstantSource === void 0) return t(i, o);
  const a = i.createConstantSource();
  return fe(a, o), ae(a, o, "offset"), e(n, () => n(i)) || Ds(a), e(r, () => r(i)) || Es(a), s(i, a), a;
}, It = (s, e) => (s.connect = e.connect.bind(e), s.disconnect = e.disconnect.bind(e), s), Gc = (s, e, t, n) => (r, { offset: i, ...o }) => {
  const a = r.createBuffer(1, 2, 44100), c = e(r, {
    buffer: null,
    channelCount: 2,
    channelCountMode: "max",
    channelInterpretation: "speakers",
    loop: !1,
    loopEnd: 0,
    loopStart: 0,
    playbackRate: 1
  }), l = t(r, {
    ...o,
    gain: i
  }), u = a.getChannelData(0);
  u[0] = 1, u[1] = 1, c.buffer = a, c.loop = !0;
  const h = {
    get bufferSize() {
    },
    get channelCount() {
      return l.channelCount;
    },
    set channelCount(p) {
      l.channelCount = p;
    },
    get channelCountMode() {
      return l.channelCountMode;
    },
    set channelCountMode(p) {
      l.channelCountMode = p;
    },
    get channelInterpretation() {
      return l.channelInterpretation;
    },
    set channelInterpretation(p) {
      l.channelInterpretation = p;
    },
    get context() {
      return l.context;
    },
    get inputs() {
      return [];
    },
    get numberOfInputs() {
      return c.numberOfInputs;
    },
    get numberOfOutputs() {
      return l.numberOfOutputs;
    },
    get offset() {
      return l.gain;
    },
    get onended() {
      return c.onended;
    },
    set onended(p) {
      c.onended = p;
    },
    addEventListener(...p) {
      return c.addEventListener(p[0], p[1], p[2]);
    },
    dispatchEvent(...p) {
      return c.dispatchEvent(p[0]);
    },
    removeEventListener(...p) {
      return c.removeEventListener(p[0], p[1], p[2]);
    },
    start(p = 0) {
      c.start.call(c, p);
    },
    stop(p = 0) {
      c.stop.call(c, p);
    }
  }, d = () => c.connect(l), f = () => c.disconnect(l);
  return s(r, c), n(It(h, l), d, f);
}, zc = (s, e) => (t, n) => {
  const r = t.createConvolver();
  if (fe(r, n), n.disableNormalization === r.normalize && (r.normalize = !n.disableNormalization), ne(r, n, "buffer"), n.channelCount > 2 || (e(r, "channelCount", (i) => () => i.call(r), (i) => (o) => {
    if (o > 2) throw s();
    return i.call(r, o);
  }), n.channelCountMode === "max")) throw s();
  return e(r, "channelCountMode", (i) => () => i.call(r), (i) => (o) => {
    if (o === "max") throw s();
    return i.call(r, o);
  }), r;
}, ur = (s, e) => {
  const t = s.createDelay(e.maxDelayTime);
  return fe(t, e), ae(t, e, "delayTime"), t;
}, $c = (s) => (e, t) => {
  const n = e.createDynamicsCompressor();
  if (fe(n, t), t.channelCount > 2 || t.channelCountMode === "max") throw s();
  return ae(n, t, "attack"), ae(n, t, "knee"), ae(n, t, "ratio"), ae(n, t, "release"), ae(n, t, "threshold"), n;
}, xe = (s, e) => {
  const t = s.createGain();
  return fe(t, e), ae(t, e, "gain"), t;
}, Zc = (s) => (e, t, n) => {
  if (e.createIIRFilter === void 0) return s(e, t, n);
  const r = e.createIIRFilter(n.feedforward, n.feedback);
  return fe(r, n), r;
};
function Xc(s, e) {
  const t = e[0] * e[0] + e[1] * e[1];
  return [(s[0] * e[0] + s[1] * e[1]) / t, (s[1] * e[0] - s[0] * e[1]) / t];
}
function Hc(s, e) {
  return [s[0] * e[0] - s[1] * e[1], s[0] * e[1] + s[1] * e[0]];
}
function hr(s, e) {
  let t = [0, 0];
  for (let n = s.length - 1; n >= 0; n -= 1)
    t = Hc(t, e), t[0] += s[n];
  return t;
}
var Qc = (s, e, t, n) => (r, i, { channelCount: o, channelCountMode: a, channelInterpretation: c, feedback: l, feedforward: u }) => {
  const h = Zr(i, r.sampleRate), d = l instanceof Float64Array ? l : new Float64Array(l), f = u instanceof Float64Array ? u : new Float64Array(u), p = d.length, m = f.length, _ = Math.min(p, m);
  if (p === 0 || p > 20) throw n();
  if (d[0] === 0) throw e();
  if (m === 0 || m > 20) throw n();
  if (f[0] === 0) throw e();
  if (d[0] !== 1) {
    for (let y = 0; y < m; y += 1) f[y] /= d[0];
    for (let y = 1; y < p; y += 1) d[y] /= d[0];
  }
  const v = t(r, h, o, o);
  v.channelCount = o, v.channelCountMode = a, v.channelInterpretation = c;
  const b = 32, S = [], k = [], g = [];
  for (let y = 0; y < o; y += 1) {
    S.push(0);
    const w = new Float32Array(b), I = new Float32Array(b);
    w.fill(0), I.fill(0), k.push(w), g.push(I);
  }
  v.onaudioprocess = (y) => {
    const w = y.inputBuffer, I = y.outputBuffer, E = w.numberOfChannels;
    for (let O = 0; O < E; O += 1) {
      const N = w.getChannelData(O), q = I.getChannelData(O);
      S[O] = $r(d, p, f, m, _, k[O], g[O], S[O], b, N, q);
    }
  };
  const T = r.sampleRate / 2;
  return It({
    get bufferSize() {
      return h;
    },
    get channelCount() {
      return v.channelCount;
    },
    set channelCount(y) {
      v.channelCount = y;
    },
    get channelCountMode() {
      return v.channelCountMode;
    },
    set channelCountMode(y) {
      v.channelCountMode = y;
    },
    get channelInterpretation() {
      return v.channelInterpretation;
    },
    set channelInterpretation(y) {
      v.channelInterpretation = y;
    },
    get context() {
      return v.context;
    },
    get inputs() {
      return [v];
    },
    get numberOfInputs() {
      return v.numberOfInputs;
    },
    get numberOfOutputs() {
      return v.numberOfOutputs;
    },
    addEventListener(...y) {
      return v.addEventListener(y[0], y[1], y[2]);
    },
    dispatchEvent(...y) {
      return v.dispatchEvent(y[0]);
    },
    getFrequencyResponse(y, w, I) {
      if (y.length !== w.length || w.length !== I.length) throw s();
      const E = y.length;
      for (let O = 0; O < E; O += 1) {
        const N = -Math.PI * (y[O] / T), q = [Math.cos(N), Math.sin(N)], P = Xc(hr(f, q), hr(d, q));
        w[O] = Math.sqrt(P[0] * P[0] + P[1] * P[1]), I[O] = Math.atan2(P[1], P[0]);
      }
    },
    removeEventListener(...y) {
      return v.removeEventListener(y[0], y[1], y[2]);
    }
  }, v);
}, Yc = (s, e) => s.createMediaElementSource(e.mediaElement), Jc = (s, e) => {
  const t = s.createMediaStreamDestination();
  return fe(t, e), t.numberOfOutputs === 1 && Object.defineProperty(t, "numberOfOutputs", { get: () => 0 }), t;
}, Kc = (s, { mediaStream: e }) => {
  const t = e.getAudioTracks();
  t.sort((i, o) => i.id < o.id ? -1 : i.id > o.id ? 1 : 0);
  const n = t.slice(0, 1), r = s.createMediaStreamSource(new MediaStream(n));
  return Object.defineProperty(r, "mediaStream", { value: e }), r;
}, el = (s, e) => (t, { mediaStreamTrack: n }) => {
  if (typeof t.createMediaStreamTrackSource == "function") return t.createMediaStreamTrackSource(n);
  const r = new MediaStream([n]), i = t.createMediaStreamSource(r);
  if (n.kind !== "audio") throw s();
  if (e(t)) throw new TypeError();
  return i;
}, tl = (s) => s === null ? null : s.hasOwnProperty("OfflineAudioContext") ? s.OfflineAudioContext : s.hasOwnProperty("webkitOfflineAudioContext") ? s.webkitOfflineAudioContext : null, nl = (s, e, t, n, r, i) => (o, a) => {
  const c = o.createOscillator();
  return fe(c, a), ae(c, a, "detune"), ae(c, a, "frequency"), a.periodicWave !== void 0 ? c.setPeriodicWave(a.periodicWave) : ne(c, a, "type"), e(t, () => t(o)) || Ds(c), e(n, () => n(o)) || i(c, o), e(r, () => r(o)) || Es(c), s(o, c), c;
}, sl = (s) => (e, t) => {
  const n = e.createPanner();
  return n.orientationX === void 0 ? s(e, t) : (fe(n, t), ae(n, t, "orientationX"), ae(n, t, "orientationY"), ae(n, t, "orientationZ"), ae(n, t, "positionX"), ae(n, t, "positionY"), ae(n, t, "positionZ"), ne(n, t, "coneInnerAngle"), ne(n, t, "coneOuterAngle"), ne(n, t, "coneOuterGain"), ne(n, t, "distanceModel"), ne(n, t, "maxDistance"), ne(n, t, "panningModel"), ne(n, t, "refDistance"), ne(n, t, "rolloffFactor"), n);
}, rl = (s, e, t, n, r, i, o, a, c, l) => (u, { coneInnerAngle: h, coneOuterAngle: d, coneOuterGain: f, distanceModel: p, maxDistance: m, orientationX: _, orientationY: v, orientationZ: b, panningModel: S, positionX: k, positionY: g, positionZ: T, refDistance: y, rolloffFactor: w, ...I }) => {
  const E = u.createPanner();
  if (I.channelCount > 2 || I.channelCountMode === "max") throw o();
  fe(E, I);
  const O = {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete"
  }, N = t(u, {
    ...O,
    channelInterpretation: "speakers",
    numberOfInputs: 6
  }), q = n(u, {
    ...I,
    gain: 1
  }), P = n(u, {
    ...O,
    gain: 1
  }), U = n(u, {
    ...O,
    gain: 0
  }), j = n(u, {
    ...O,
    gain: 0
  }), F = n(u, {
    ...O,
    gain: 0
  }), A = n(u, {
    ...O,
    gain: 0
  }), C = n(u, {
    ...O,
    gain: 0
  }), x = r(u, 256, 6, 1), D = i(u, {
    ...O,
    curve: new Float32Array([1, 1]),
    oversample: "none"
  });
  let R = [
    _,
    v,
    b
  ], V = [
    k,
    g,
    T
  ];
  const re = /* @__PURE__ */ new Float32Array(1);
  x.onaudioprocess = ({ inputBuffer: W }) => {
    const Te = [
      c(W, re, 0),
      c(W, re, 1),
      c(W, re, 2)
    ];
    Te.some((Ue, Oe) => Ue !== R[Oe]) && (E.setOrientation(...Te), R = Te);
    const Se = [
      c(W, re, 3),
      c(W, re, 4),
      c(W, re, 5)
    ];
    Se.some((Ue, Oe) => Ue !== V[Oe]) && (E.setPosition(...Se), V = Se);
  }, Object.defineProperty(U.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(j.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(F.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(A.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(C.gain, "defaultValue", { get: () => 0 });
  const z = {
    get bufferSize() {
    },
    get channelCount() {
      return E.channelCount;
    },
    set channelCount(W) {
      if (W > 2) throw o();
      q.channelCount = W, E.channelCount = W;
    },
    get channelCountMode() {
      return E.channelCountMode;
    },
    set channelCountMode(W) {
      if (W === "max") throw o();
      q.channelCountMode = W, E.channelCountMode = W;
    },
    get channelInterpretation() {
      return E.channelInterpretation;
    },
    set channelInterpretation(W) {
      q.channelInterpretation = W, E.channelInterpretation = W;
    },
    get coneInnerAngle() {
      return E.coneInnerAngle;
    },
    set coneInnerAngle(W) {
      E.coneInnerAngle = W;
    },
    get coneOuterAngle() {
      return E.coneOuterAngle;
    },
    set coneOuterAngle(W) {
      E.coneOuterAngle = W;
    },
    get coneOuterGain() {
      return E.coneOuterGain;
    },
    set coneOuterGain(W) {
      if (W < 0 || W > 1) throw e();
      E.coneOuterGain = W;
    },
    get context() {
      return E.context;
    },
    get distanceModel() {
      return E.distanceModel;
    },
    set distanceModel(W) {
      E.distanceModel = W;
    },
    get inputs() {
      return [q];
    },
    get maxDistance() {
      return E.maxDistance;
    },
    set maxDistance(W) {
      if (W < 0) throw new RangeError();
      E.maxDistance = W;
    },
    get numberOfInputs() {
      return E.numberOfInputs;
    },
    get numberOfOutputs() {
      return E.numberOfOutputs;
    },
    get orientationX() {
      return P.gain;
    },
    get orientationY() {
      return U.gain;
    },
    get orientationZ() {
      return j.gain;
    },
    get panningModel() {
      return E.panningModel;
    },
    set panningModel(W) {
      E.panningModel = W;
    },
    get positionX() {
      return F.gain;
    },
    get positionY() {
      return A.gain;
    },
    get positionZ() {
      return C.gain;
    },
    get refDistance() {
      return E.refDistance;
    },
    set refDistance(W) {
      if (W < 0) throw new RangeError();
      E.refDistance = W;
    },
    get rolloffFactor() {
      return E.rolloffFactor;
    },
    set rolloffFactor(W) {
      if (W < 0) throw new RangeError();
      E.rolloffFactor = W;
    },
    addEventListener(...W) {
      return q.addEventListener(W[0], W[1], W[2]);
    },
    dispatchEvent(...W) {
      return q.dispatchEvent(W[0]);
    },
    removeEventListener(...W) {
      return q.removeEventListener(W[0], W[1], W[2]);
    }
  };
  h !== z.coneInnerAngle && (z.coneInnerAngle = h), d !== z.coneOuterAngle && (z.coneOuterAngle = d), f !== z.coneOuterGain && (z.coneOuterGain = f), p !== z.distanceModel && (z.distanceModel = p), m !== z.maxDistance && (z.maxDistance = m), _ !== z.orientationX.value && (z.orientationX.value = _), v !== z.orientationY.value && (z.orientationY.value = v), b !== z.orientationZ.value && (z.orientationZ.value = b), S !== z.panningModel && (z.panningModel = S), k !== z.positionX.value && (z.positionX.value = k), g !== z.positionY.value && (z.positionY.value = g), T !== z.positionZ.value && (z.positionZ.value = T), y !== z.refDistance && (z.refDistance = y), w !== z.rolloffFactor && (z.rolloffFactor = w), (R[0] !== 1 || R[1] !== 0 || R[2] !== 0) && E.setOrientation(...R), (V[0] !== 0 || V[1] !== 0 || V[2] !== 0) && E.setPosition(...V);
  const J = () => {
    q.connect(E), s(q, D, 0, 0), D.connect(P).connect(N, 0, 0), D.connect(U).connect(N, 0, 1), D.connect(j).connect(N, 0, 2), D.connect(F).connect(N, 0, 3), D.connect(A).connect(N, 0, 4), D.connect(C).connect(N, 0, 5), N.connect(x).connect(u.destination);
  }, ie = () => {
    q.disconnect(E), a(q, D, 0, 0), D.disconnect(P), P.disconnect(N), D.disconnect(U), U.disconnect(N), D.disconnect(j), j.disconnect(N), D.disconnect(F), F.disconnect(N), D.disconnect(A), A.disconnect(N), D.disconnect(C), C.disconnect(N), N.disconnect(x), x.disconnect(u.destination);
  };
  return l(It(z, E), J, ie);
}, il = (s) => (e, { disableNormalization: t, imag: n, real: r }) => {
  const i = n instanceof Float32Array ? n : new Float32Array(n), o = r instanceof Float32Array ? r : new Float32Array(r), a = e.createPeriodicWave(o, i, { disableNormalization: t });
  if (Array.from(n).length < 2) throw s();
  return a;
}, Xt = (s, e, t, n) => s.createScriptProcessor(e, t, n), al = (s, e) => (t, n) => {
  const r = n.channelCountMode;
  if (r === "clamped-max") throw e();
  if (t.createStereoPanner === void 0) return s(t, n);
  const i = t.createStereoPanner();
  return fe(i, n), ae(i, n, "pan"), Object.defineProperty(i, "channelCountMode", {
    get: () => r,
    set: (o) => {
      if (o !== r) throw e();
    }
  }), i;
}, ol = (s, e, t, n, r, i) => {
  const a = new Float32Array([1, 1]), c = Math.PI / 2, l = {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete"
  }, u = {
    ...l,
    oversample: "none"
  }, h = (p, m, _, v) => {
    const b = new Float32Array(16385), S = new Float32Array(16385);
    for (let I = 0; I < 16385; I += 1) {
      const E = I / 16384 * c;
      b[I] = Math.cos(E), S[I] = Math.sin(E);
    }
    const k = t(p, {
      ...l,
      gain: 0
    }), g = n(p, {
      ...u,
      curve: b
    }), T = n(p, {
      ...u,
      curve: a
    }), y = t(p, {
      ...l,
      gain: 0
    }), w = n(p, {
      ...u,
      curve: S
    });
    return {
      connectGraph() {
        m.connect(k), m.connect(T.inputs === void 0 ? T : T.inputs[0]), m.connect(y), T.connect(_), _.connect(g.inputs === void 0 ? g : g.inputs[0]), _.connect(w.inputs === void 0 ? w : w.inputs[0]), g.connect(k.gain), w.connect(y.gain), k.connect(v, 0, 0), y.connect(v, 0, 1);
      },
      disconnectGraph() {
        m.disconnect(k), m.disconnect(T.inputs === void 0 ? T : T.inputs[0]), m.disconnect(y), T.disconnect(_), _.disconnect(g.inputs === void 0 ? g : g.inputs[0]), _.disconnect(w.inputs === void 0 ? w : w.inputs[0]), g.disconnect(k.gain), w.disconnect(y.gain), k.disconnect(v, 0, 0), y.disconnect(v, 0, 1);
      }
    };
  }, d = (p, m, _, v) => {
    const b = new Float32Array(16385), S = new Float32Array(16385), k = new Float32Array(16385), g = new Float32Array(16385), T = Math.floor(16385 / 2);
    for (let F = 0; F < 16385; F += 1) if (F > T) {
      const A = (F - T) / (16384 - T) * c;
      b[F] = Math.cos(A), S[F] = Math.sin(A), k[F] = 0, g[F] = 1;
    } else {
      const A = F / (16384 - T) * c;
      b[F] = 1, S[F] = 0, k[F] = Math.cos(A), g[F] = Math.sin(A);
    }
    const y = e(p, {
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      numberOfOutputs: 2
    }), w = t(p, {
      ...l,
      gain: 0
    }), I = n(p, {
      ...u,
      curve: b
    }), E = t(p, {
      ...l,
      gain: 0
    }), O = n(p, {
      ...u,
      curve: S
    }), N = n(p, {
      ...u,
      curve: a
    }), q = t(p, {
      ...l,
      gain: 0
    }), P = n(p, {
      ...u,
      curve: k
    }), U = t(p, {
      ...l,
      gain: 0
    }), j = n(p, {
      ...u,
      curve: g
    });
    return {
      connectGraph() {
        m.connect(y), m.connect(N.inputs === void 0 ? N : N.inputs[0]), y.connect(w, 0), y.connect(E, 0), y.connect(q, 1), y.connect(U, 1), N.connect(_), _.connect(I.inputs === void 0 ? I : I.inputs[0]), _.connect(O.inputs === void 0 ? O : O.inputs[0]), _.connect(P.inputs === void 0 ? P : P.inputs[0]), _.connect(j.inputs === void 0 ? j : j.inputs[0]), I.connect(w.gain), O.connect(E.gain), P.connect(q.gain), j.connect(U.gain), w.connect(v, 0, 0), q.connect(v, 0, 0), E.connect(v, 0, 1), U.connect(v, 0, 1);
      },
      disconnectGraph() {
        m.disconnect(y), m.disconnect(N.inputs === void 0 ? N : N.inputs[0]), y.disconnect(w, 0), y.disconnect(E, 0), y.disconnect(q, 1), y.disconnect(U, 1), N.disconnect(_), _.disconnect(I.inputs === void 0 ? I : I.inputs[0]), _.disconnect(O.inputs === void 0 ? O : O.inputs[0]), _.disconnect(P.inputs === void 0 ? P : P.inputs[0]), _.disconnect(j.inputs === void 0 ? j : j.inputs[0]), I.disconnect(w.gain), O.disconnect(E.gain), P.disconnect(q.gain), j.disconnect(U.gain), w.disconnect(v, 0, 0), q.disconnect(v, 0, 0), E.disconnect(v, 0, 1), U.disconnect(v, 0, 1);
      }
    };
  }, f = (p, m, _, v, b) => {
    if (m === 1) return h(p, _, v, b);
    if (m === 2) return d(p, _, v, b);
    throw r();
  };
  return (p, { channelCount: m, channelCountMode: _, pan: v, ...b }) => {
    if (_ === "max") throw r();
    const S = s(p, {
      ...b,
      channelCount: 1,
      channelCountMode: _,
      numberOfInputs: 2
    }), k = t(p, {
      ...b,
      channelCount: m,
      channelCountMode: _,
      gain: 1
    }), g = t(p, {
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      gain: v
    });
    let { connectGraph: T, disconnectGraph: y } = f(p, m, k, g, S);
    Object.defineProperty(g.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(g.gain, "maxValue", { get: () => 1 }), Object.defineProperty(g.gain, "minValue", { get: () => -1 });
    const w = {
      get bufferSize() {
      },
      get channelCount() {
        return k.channelCount;
      },
      set channelCount(N) {
        k.channelCount !== N && (I && y(), { connectGraph: T, disconnectGraph: y } = f(p, N, k, g, S), I && T()), k.channelCount = N;
      },
      get channelCountMode() {
        return k.channelCountMode;
      },
      set channelCountMode(N) {
        if (N === "clamped-max" || N === "max") throw r();
        k.channelCountMode = N;
      },
      get channelInterpretation() {
        return k.channelInterpretation;
      },
      set channelInterpretation(N) {
        k.channelInterpretation = N;
      },
      get context() {
        return k.context;
      },
      get inputs() {
        return [k];
      },
      get numberOfInputs() {
        return k.numberOfInputs;
      },
      get numberOfOutputs() {
        return k.numberOfOutputs;
      },
      get pan() {
        return g.gain;
      },
      addEventListener(...N) {
        return k.addEventListener(N[0], N[1], N[2]);
      },
      dispatchEvent(...N) {
        return k.dispatchEvent(N[0]);
      },
      removeEventListener(...N) {
        return k.removeEventListener(N[0], N[1], N[2]);
      }
    };
    let I = !1;
    const E = () => {
      T(), I = !0;
    }, O = () => {
      y(), I = !1;
    };
    return i(It(w, S), E, O);
  };
}, cl = (s, e, t, n, r, i, o) => (a, c) => {
  const l = a.createWaveShaper();
  if (i !== null && i.name === "webkitAudioContext" && a.createGain().gain.automationRate === void 0) return t(a, c);
  fe(l, c);
  const u = c.curve === null || c.curve instanceof Float32Array ? c.curve : new Float32Array(c.curve);
  if (u !== null && u.length < 2) throw e();
  ne(l, { curve: u }, "curve"), ne(l, c, "oversample");
  let h = null, d = !1;
  return o(l, "curve", (m) => () => m.call(l), (m) => (_) => (m.call(l, _), d && (n(_) && h === null ? h = s(a, l) : !n(_) && h !== null && (h(), h = null)), _)), r(l, () => {
    d = !0, n(l.curve) && (h = s(a, l));
  }, () => {
    d = !1, h !== null && (h(), h = null);
  });
}, ll = (s, e, t, n, r) => (i, { curve: o, oversample: a, ...c }) => {
  const l = i.createWaveShaper(), u = i.createWaveShaper();
  fe(l, c), fe(u, c);
  const h = t(i, {
    ...c,
    gain: 1
  }), d = t(i, {
    ...c,
    gain: -1
  }), f = t(i, {
    ...c,
    gain: 1
  }), p = t(i, {
    ...c,
    gain: -1
  });
  let m = null, _ = !1, v = null;
  const b = {
    get bufferSize() {
    },
    get channelCount() {
      return l.channelCount;
    },
    set channelCount(g) {
      h.channelCount = g, d.channelCount = g, l.channelCount = g, f.channelCount = g, u.channelCount = g, p.channelCount = g;
    },
    get channelCountMode() {
      return l.channelCountMode;
    },
    set channelCountMode(g) {
      h.channelCountMode = g, d.channelCountMode = g, l.channelCountMode = g, f.channelCountMode = g, u.channelCountMode = g, p.channelCountMode = g;
    },
    get channelInterpretation() {
      return l.channelInterpretation;
    },
    set channelInterpretation(g) {
      h.channelInterpretation = g, d.channelInterpretation = g, l.channelInterpretation = g, f.channelInterpretation = g, u.channelInterpretation = g, p.channelInterpretation = g;
    },
    get context() {
      return l.context;
    },
    get curve() {
      return v;
    },
    set curve(g) {
      if (g !== null && g.length < 2) throw e();
      if (g === null)
        l.curve = g, u.curve = g;
      else {
        const T = g.length, y = new Float32Array(T + 2 - T % 2), w = new Float32Array(T + 2 - T % 2);
        y[0] = g[0], w[0] = -g[T - 1];
        const I = Math.ceil((T + 1) / 2), E = (T + 1) / 2 - 1;
        for (let O = 1; O < I; O += 1) {
          const N = O / I * E, q = Math.floor(N), P = Math.ceil(N);
          y[O] = q === P ? g[q] : (1 - (N - q)) * g[q] + (1 - (P - N)) * g[P], w[O] = q === P ? -g[T - 1 - q] : -((1 - (N - q)) * g[T - 1 - q]) - (1 - (P - N)) * g[T - 1 - P];
        }
        y[I] = T % 2 === 1 ? g[I - 1] : (g[I - 2] + g[I - 1]) / 2, l.curve = y, u.curve = w;
      }
      v = g, _ && (n(v) && m === null ? m = s(i, h) : m !== null && (m(), m = null));
    },
    get inputs() {
      return [h];
    },
    get numberOfInputs() {
      return l.numberOfInputs;
    },
    get numberOfOutputs() {
      return l.numberOfOutputs;
    },
    get oversample() {
      return l.oversample;
    },
    set oversample(g) {
      l.oversample = g, u.oversample = g;
    },
    addEventListener(...g) {
      return h.addEventListener(g[0], g[1], g[2]);
    },
    dispatchEvent(...g) {
      return h.dispatchEvent(g[0]);
    },
    removeEventListener(...g) {
      return h.removeEventListener(g[0], g[1], g[2]);
    }
  };
  o !== null && (b.curve = o instanceof Float32Array ? o : new Float32Array(o)), a !== b.oversample && (b.oversample = a);
  const S = () => {
    h.connect(l).connect(f), h.connect(d).connect(u).connect(p).connect(f), _ = !0, n(v) && (m = s(i, h));
  }, k = () => {
    h.disconnect(l), l.disconnect(f), h.disconnect(d), d.disconnect(u), u.disconnect(p), p.disconnect(f), _ = !1, m !== null && (m(), m = null);
  };
  return r(It(b, f), S, k);
}, ve = () => new DOMException("", "NotSupportedError"), ul = { numberOfChannels: 1 }, hl = (s, e, t, n, r) => class extends s {
  constructor(o, a, c) {
    let l;
    if (typeof o == "number" && a !== void 0 && c !== void 0) l = {
      length: a,
      numberOfChannels: o,
      sampleRate: c
    };
    else if (typeof o == "object") l = o;
    else throw new Error("The given parameters are not valid.");
    const { length: u, numberOfChannels: h, sampleRate: d } = {
      ...ul,
      ...l
    }, f = n(h, u, d);
    e(dt, () => dt(f)) || f.addEventListener("statechange", /* @__PURE__ */ (() => {
      let p = 0;
      const m = (_) => {
        this._state === "running" && (p > 0 ? (f.removeEventListener("statechange", m), _.stopImmediatePropagation(), this._waitForThePromiseToSettle(_)) : p += 1);
      };
      return m;
    })()), super(f, h), this._length = u, this._nativeOfflineAudioContext = f, this._state = null;
  }
  get length() {
    return this._nativeOfflineAudioContext.length === void 0 ? this._length : this._nativeOfflineAudioContext.length;
  }
  get state() {
    return this._state === null ? this._nativeOfflineAudioContext.state : this._state;
  }
  startRendering() {
    return this._state === "running" ? Promise.reject(t()) : (this._state = "running", r(this.destination, this._nativeOfflineAudioContext).finally(() => {
      this._state = null, bn(this);
    }));
  }
  _waitForThePromiseToSettle(o) {
    this._state === null ? this._nativeOfflineAudioContext.dispatchEvent(o) : setTimeout(() => this._waitForThePromiseToSettle(o));
  }
}, dl = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  detune: 0,
  frequency: 440,
  periodicWave: void 0,
  type: "sine"
}, pl = (s, e, t, n, r, i, o) => class extends s {
  constructor(c, l) {
    const u = r(c), h = {
      ...dl,
      ...l
    }, d = t(u, h), f = i(u), p = f ? n() : null, m = c.sampleRate / 2;
    super(c, !1, d, p), this._detune = e(this, f, d.detune, 153600, -153600), this._frequency = e(this, f, d.frequency, m, -m), this._nativeOscillatorNode = d, this._onended = null, this._oscillatorNodeRenderer = p, this._oscillatorNodeRenderer !== null && h.periodicWave !== void 0 && (this._oscillatorNodeRenderer.periodicWave = h.periodicWave);
  }
  get detune() {
    return this._detune;
  }
  get frequency() {
    return this._frequency;
  }
  get onended() {
    return this._onended;
  }
  set onended(c) {
    const l = typeof c == "function" ? o(this, c) : null;
    this._nativeOscillatorNode.onended = l;
    const u = this._nativeOscillatorNode.onended;
    this._onended = u !== null && u === l ? c : u;
  }
  get type() {
    return this._nativeOscillatorNode.type;
  }
  set type(c) {
    this._nativeOscillatorNode.type = c, this._oscillatorNodeRenderer !== null && (this._oscillatorNodeRenderer.periodicWave = null);
  }
  setPeriodicWave(c) {
    this._nativeOscillatorNode.setPeriodicWave(c), this._oscillatorNodeRenderer !== null && (this._oscillatorNodeRenderer.periodicWave = c);
  }
  start(c = 0) {
    if (this._nativeOscillatorNode.start(c), this._oscillatorNodeRenderer !== null && (this._oscillatorNodeRenderer.start = c), this.context.state !== "closed") {
      At(this);
      const l = () => {
        this._nativeOscillatorNode.removeEventListener("ended", l), ze(this) && zt(this);
      };
      this._nativeOscillatorNode.addEventListener("ended", l);
    }
  }
  stop(c = 0) {
    this._nativeOscillatorNode.stop(c), this._oscillatorNodeRenderer !== null && (this._oscillatorNodeRenderer.stop = c);
  }
}, fl = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap();
  let o = null, a = null, c = null;
  const l = async (u, h) => {
    let d = t(u);
    const f = ye(d, h);
    return f || (d = e(h, {
      channelCount: d.channelCount,
      channelCountMode: d.channelCountMode,
      channelInterpretation: d.channelInterpretation,
      detune: d.detune.value,
      frequency: d.frequency.value,
      periodicWave: o === null ? void 0 : o,
      type: d.type
    }), a !== null && d.start(a), c !== null && d.stop(c)), i.set(h, d), f ? (await s(h, u.detune, d.detune), await s(h, u.frequency, d.frequency)) : (await n(h, u.detune, d.detune), await n(h, u.frequency, d.frequency)), await r(u, h, d), d;
  };
  return {
    set periodicWave(u) {
      o = u;
    },
    set start(u) {
      a = u;
    },
    set stop(u) {
      c = u;
    },
    render(u, h) {
      const d = i.get(h);
      return d !== void 0 ? Promise.resolve(d) : l(u, h);
    }
  };
}, ml = {
  channelCount: 2,
  channelCountMode: "clamped-max",
  channelInterpretation: "speakers",
  coneInnerAngle: 360,
  coneOuterAngle: 360,
  coneOuterGain: 0,
  distanceModel: "inverse",
  maxDistance: 1e4,
  orientationX: 1,
  orientationY: 0,
  orientationZ: 0,
  panningModel: "equalpower",
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  refDistance: 1,
  rolloffFactor: 1
}, _l = (s, e, t, n, r, i, o) => class extends s {
  constructor(c, l) {
    const u = r(c), h = t(u, {
      ...ml,
      ...l
    }), d = i(u), f = d ? n() : null;
    super(c, !1, h, f), this._nativePannerNode = h, this._orientationX = e(this, d, h.orientationX, we, Ae), this._orientationY = e(this, d, h.orientationY, we, Ae), this._orientationZ = e(this, d, h.orientationZ, we, Ae), this._positionX = e(this, d, h.positionX, we, Ae), this._positionY = e(this, d, h.positionY, we, Ae), this._positionZ = e(this, d, h.positionZ, we, Ae), o(this, 1);
  }
  get coneInnerAngle() {
    return this._nativePannerNode.coneInnerAngle;
  }
  set coneInnerAngle(c) {
    this._nativePannerNode.coneInnerAngle = c;
  }
  get coneOuterAngle() {
    return this._nativePannerNode.coneOuterAngle;
  }
  set coneOuterAngle(c) {
    this._nativePannerNode.coneOuterAngle = c;
  }
  get coneOuterGain() {
    return this._nativePannerNode.coneOuterGain;
  }
  set coneOuterGain(c) {
    this._nativePannerNode.coneOuterGain = c;
  }
  get distanceModel() {
    return this._nativePannerNode.distanceModel;
  }
  set distanceModel(c) {
    this._nativePannerNode.distanceModel = c;
  }
  get maxDistance() {
    return this._nativePannerNode.maxDistance;
  }
  set maxDistance(c) {
    this._nativePannerNode.maxDistance = c;
  }
  get orientationX() {
    return this._orientationX;
  }
  get orientationY() {
    return this._orientationY;
  }
  get orientationZ() {
    return this._orientationZ;
  }
  get panningModel() {
    return this._nativePannerNode.panningModel;
  }
  set panningModel(c) {
    this._nativePannerNode.panningModel = c;
  }
  get positionX() {
    return this._positionX;
  }
  get positionY() {
    return this._positionY;
  }
  get positionZ() {
    return this._positionZ;
  }
  get refDistance() {
    return this._nativePannerNode.refDistance;
  }
  set refDistance(c) {
    this._nativePannerNode.refDistance = c;
  }
  get rolloffFactor() {
    return this._nativePannerNode.rolloffFactor;
  }
  set rolloffFactor(c) {
    this._nativePannerNode.rolloffFactor = c;
  }
}, gl = (s, e, t, n, r, i, o, a, c, l) => () => {
  const u = /* @__PURE__ */ new WeakMap();
  let h = null;
  const d = async (f, p) => {
    let m = null, _ = i(f);
    const v = {
      channelCount: _.channelCount,
      channelCountMode: _.channelCountMode,
      channelInterpretation: _.channelInterpretation
    }, b = {
      ...v,
      coneInnerAngle: _.coneInnerAngle,
      coneOuterAngle: _.coneOuterAngle,
      coneOuterGain: _.coneOuterGain,
      distanceModel: _.distanceModel,
      maxDistance: _.maxDistance,
      panningModel: _.panningModel,
      refDistance: _.refDistance,
      rolloffFactor: _.rolloffFactor
    }, S = ye(_, p);
    if ("bufferSize" in _ ? m = n(p, {
      ...v,
      gain: 1
    }) : S || (_ = r(p, {
      ...b,
      orientationX: _.orientationX.value,
      orientationY: _.orientationY.value,
      orientationZ: _.orientationZ.value,
      positionX: _.positionX.value,
      positionY: _.positionY.value,
      positionZ: _.positionZ.value
    })), u.set(p, m === null ? _ : m), m !== null) {
      if (h === null) {
        if (o === null) throw new Error("Missing the native OfflineAudioContext constructor.");
        const O = new o(6, f.context.length, p.sampleRate), N = e(O, {
          channelCount: 1,
          channelCountMode: "explicit",
          channelInterpretation: "speakers",
          numberOfInputs: 6
        });
        N.connect(O.destination), h = (async () => {
          const q = await Promise.all([
            f.orientationX,
            f.orientationY,
            f.orientationZ,
            f.positionX,
            f.positionY,
            f.positionZ
          ].map(async (P, U) => {
            const j = t(O, {
              channelCount: 1,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
              offset: U === 0 ? 1 : 0
            });
            return await a(O, P, j.offset), j;
          }));
          for (let P = 0; P < 6; P += 1)
            q[P].connect(N, 0, P), q[P].start(0);
          return l(O);
        })();
      }
      const k = await h, g = n(p, {
        ...v,
        gain: 1
      });
      await c(f, p, g);
      const T = [];
      for (let O = 0; O < k.numberOfChannels; O += 1) T.push(k.getChannelData(O));
      let y = [
        T[0][0],
        T[1][0],
        T[2][0]
      ], w = [
        T[3][0],
        T[4][0],
        T[5][0]
      ], I = n(p, {
        ...v,
        gain: 1
      }), E = r(p, {
        ...b,
        orientationX: y[0],
        orientationY: y[1],
        orientationZ: y[2],
        positionX: w[0],
        positionY: w[1],
        positionZ: w[2]
      });
      g.connect(I).connect(E.inputs[0]), E.connect(m);
      for (let O = 128; O < k.length; O += 128) {
        const N = [
          T[0][O],
          T[1][O],
          T[2][O]
        ], q = [
          T[3][O],
          T[4][O],
          T[5][O]
        ];
        if (N.some((P, U) => P !== y[U]) || q.some((P, U) => P !== w[U])) {
          y = N, w = q;
          const P = O / p.sampleRate;
          I.gain.setValueAtTime(0, P), I = n(p, {
            ...v,
            gain: 0
          }), E = r(p, {
            ...b,
            orientationX: y[0],
            orientationY: y[1],
            orientationZ: y[2],
            positionX: w[0],
            positionY: w[1],
            positionZ: w[2]
          }), I.gain.setValueAtTime(1, P), g.connect(I).connect(E.inputs[0]), E.connect(m);
        }
      }
      return m;
    }
    return S ? (await s(p, f.orientationX, _.orientationX), await s(p, f.orientationY, _.orientationY), await s(p, f.orientationZ, _.orientationZ), await s(p, f.positionX, _.positionX), await s(p, f.positionY, _.positionY), await s(p, f.positionZ, _.positionZ)) : (await a(p, f.orientationX, _.orientationX), await a(p, f.orientationY, _.orientationY), await a(p, f.orientationZ, _.orientationZ), await a(p, f.positionX, _.positionX), await a(p, f.positionY, _.positionY), await a(p, f.positionZ, _.positionZ)), Et(_) ? await c(f, p, _.inputs[0]) : await c(f, p, _), _;
  };
  return { render(f, p) {
    const m = u.get(p);
    return m !== void 0 ? Promise.resolve(m) : d(f, p);
  } };
}, vl = { disableNormalization: !1 }, yl = (s, e, t, n) => class Hr {
  constructor(i, o) {
    const a = s(e(i), n({
      ...vl,
      ...o
    }));
    return t.add(a), a;
  }
  static [Symbol.hasInstance](i) {
    return i !== null && typeof i == "object" && Object.getPrototypeOf(i) === Hr.prototype || t.has(i);
  }
}, Tl = (s, e) => (t, n, r) => (s(n).replay(r), e(n, t, r)), wl = (s, e, t) => async (n, r, i) => {
  const o = s(n);
  await Promise.all(o.activeInputs.map((a, c) => Array.from(a).map(async ([l, u]) => {
    const h = await e(l).render(l, r), d = n.context.destination;
    !t(l) && (n !== d || !t(n)) && h.connect(i, u, c);
  })).reduce((a, c) => [...a, ...c], []));
}, bl = (s, e, t) => async (n, r, i) => {
  const o = e(n);
  await Promise.all(Array.from(o.activeInputs).map(async ([a, c]) => {
    const l = await s(a).render(a, r);
    t(a) || l.connect(i, c);
  }));
}, Cl = (s, e, t, n) => (r) => s(dt, () => dt(r)) ? Promise.resolve(s(n, n)).then((i) => {
  if (!i) {
    const o = t(r, 512, 0, 1);
    r.oncomplete = () => {
      o.onaudioprocess = null, o.disconnect();
    }, o.onaudioprocess = () => r.currentTime, o.connect(r.destination);
  }
  return r.startRendering();
}) : new Promise((i) => {
  const o = e(r, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  });
  r.oncomplete = (a) => {
    o.disconnect(), i(a.renderedBuffer);
  }, o.connect(r.destination), r.startRendering();
}), xl = (s) => (e, t) => {
  s.set(e, t);
}, Sl = (s) => (e, t) => s.set(e, t), Al = (s, e, t, n, r, i, o, a) => (c, l) => t(c).render(c, l).then(() => Promise.all(Array.from(n(l)).map((u) => t(u).render(u, l)))).then(() => r(l)).then((u) => (typeof u.copyFromChannel != "function" ? (o(u), Os(u)) : e(i, () => i(u)) || a(u), s.add(u), u)), kl = {
  channelCount: 2,
  channelCountMode: "explicit",
  channelInterpretation: "speakers",
  pan: 0
}, Ol = (s, e, t, n, r, i) => class extends s {
  constructor(a, c) {
    const l = r(a), u = t(l, {
      ...kl,
      ...c
    }), h = i(l), d = h ? n() : null;
    super(a, !1, u, d), this._pan = e(this, h, u.pan);
  }
  get pan() {
    return this._pan;
  }
}, Nl = (s, e, t, n, r) => () => {
  const i = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = ye(l, c);
    return u || (l = e(c, {
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      pan: l.pan.value
    })), i.set(c, l), u ? await s(c, a.pan, l.pan) : await n(c, a.pan, l.pan), Et(l) ? await r(a, c, l.inputs[0]) : await r(a, c, l), l;
  };
  return { render(a, c) {
    const l = i.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, Ml = (s) => () => {
  if (s === null) return !1;
  try {
    new s({
      length: 1,
      sampleRate: 44100
    });
  } catch {
    return !1;
  }
  return !0;
}, Dl = (s, e) => async () => {
  if (s === null) return !0;
  if (e === null) return !1;
  const t = new Blob(['class A extends AudioWorkletProcessor{process(i){this.port.postMessage(i,[i[0][0].buffer])}}registerProcessor("a",A)'], { type: "application/javascript; charset=utf-8" }), n = new e(1, 128, 44100), r = URL.createObjectURL(t);
  let i = !1, o = !1;
  try {
    await n.audioWorklet.addModule(r);
    const a = new s(n, "a", { numberOfOutputs: 0 }), c = n.createOscillator();
    a.port.onmessage = () => i = !0, a.onprocessorerror = () => o = !0, c.connect(a), c.start(0), await n.startRendering(), await new Promise((l) => setTimeout(l));
  } catch {
  } finally {
    URL.revokeObjectURL(r);
  }
  return i && !o;
}, El = (s, e) => () => {
  if (e === null) return Promise.resolve(!1);
  const t = new e(1, 1, 44100), n = s(t, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  });
  return new Promise((r) => {
    t.oncomplete = () => {
      n.disconnect(), r(t.currentTime !== 0);
    }, t.startRendering();
  });
}, Qr = () => new DOMException("", "UnknownError"), Il = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  curve: null,
  oversample: "none"
}, Rl = (s, e, t, n, r, i, o) => class extends s {
  constructor(c, l) {
    const u = r(c), h = t(u, {
      ...Il,
      ...l
    }), d = i(u) ? n() : null;
    super(c, !0, h, d), this._isCurveNullified = !1, this._nativeWaveShaperNode = h, o(this, 1);
  }
  get curve() {
    return this._isCurveNullified ? null : this._nativeWaveShaperNode.curve;
  }
  set curve(c) {
    if (c === null)
      this._isCurveNullified = !0, this._nativeWaveShaperNode.curve = new Float32Array([0, 0]);
    else {
      if (c.length < 2) throw e();
      this._isCurveNullified = !1, this._nativeWaveShaperNode.curve = c;
    }
  }
  get oversample() {
    return this._nativeWaveShaperNode.oversample;
  }
  set oversample(c) {
    this._nativeWaveShaperNode.oversample = c;
  }
}, Vl = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), r = async (i, o) => {
    let a = e(i);
    return ye(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      curve: a.curve,
      oversample: a.oversample
    })), n.set(o, a), Et(a) ? await t(i, o, a.inputs[0]) : await t(i, o, a), a;
  };
  return { render(i, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : r(i, o);
  } };
}, Pl = () => typeof window > "u" ? null : window, Fl = (s, e) => (t) => {
  t.copyFromChannel = (n, r, i = 0) => {
    const o = s(i), a = s(r);
    if (a >= t.numberOfChannels) throw e();
    const c = t.length, l = t.getChannelData(a), u = n.length;
    for (let h = o < 0 ? -o : 0; h + o < c && h < u; h += 1) n[h] = l[h + o];
  }, t.copyToChannel = (n, r, i = 0) => {
    const o = s(i), a = s(r);
    if (a >= t.numberOfChannels) throw e();
    const c = t.length, l = t.getChannelData(a), u = n.length;
    for (let h = o < 0 ? -o : 0; h + o < c && h < u; h += 1) l[h + o] = n[h];
  };
}, ql = (s) => (e) => {
  e.copyFromChannel = /* @__PURE__ */ ((t) => (n, r, i = 0) => {
    const o = s(i), a = s(r);
    if (o < e.length) return t.call(e, n, a, o);
  })(e.copyFromChannel), e.copyToChannel = /* @__PURE__ */ ((t) => (n, r, i = 0) => {
    const o = s(i), a = s(r);
    if (o < e.length) return t.call(e, n, a, o);
  })(e.copyToChannel);
}, Ll = (s) => (e, t) => {
  const n = t.createBuffer(1, 1, 44100);
  e.buffer === null && (e.buffer = n), s(e, "buffer", (r) => () => {
    const i = r.call(e);
    return i === n ? null : i;
  }, (r) => (i) => r.call(e, i === null ? n : i));
}, Wl = (s, e) => (t, n) => {
  n.channelCount = 1, n.channelCountMode = "explicit", Object.defineProperty(n, "channelCount", {
    get: () => 1,
    set: () => {
      throw s();
    }
  }), Object.defineProperty(n, "channelCountMode", {
    get: () => "explicit",
    set: () => {
      throw s();
    }
  });
  const r = t.createBufferSource();
  e(n, () => {
    const a = n.numberOfInputs;
    for (let c = 0; c < a; c += 1) r.connect(n, 0, c);
  }, () => r.disconnect(n));
}, Yr = (s, e, t) => s.copyFromChannel === void 0 ? s.getChannelData(t)[0] : (s.copyFromChannel(e, t), e[0]), dr = (s) => {
  if (s === null) return !1;
  const e = s.length;
  return e % 2 !== 0 ? s[Math.floor(e / 2)] !== 0 : s[e / 2 - 1] + s[e / 2] !== 0;
}, Ht = (s, e, t, n) => {
  let r = s;
  for (; !r.hasOwnProperty(e); ) r = Object.getPrototypeOf(r);
  const { get: i, set: o } = Object.getOwnPropertyDescriptor(r, e);
  Object.defineProperty(s, e, {
    get: t(i),
    set: n(o)
  });
}, jl = (s) => ({
  ...s,
  outputChannelCount: s.outputChannelCount !== void 0 ? s.outputChannelCount : s.numberOfInputs === 1 && s.numberOfOutputs === 1 ? [s.channelCount] : Array.from({ length: s.numberOfOutputs }, () => 1)
}), Bl = (s) => ({
  ...s,
  channelCount: s.numberOfOutputs
}), Ul = (s) => {
  const { imag: e, real: t } = s;
  return e === void 0 ? t === void 0 ? {
    ...s,
    imag: [0, 0],
    real: [0, 0]
  } : {
    ...s,
    imag: Array.from(t, () => 0),
    real: t
  } : t === void 0 ? {
    ...s,
    imag: e,
    real: Array.from(e, () => 0)
  } : {
    ...s,
    imag: e,
    real: t
  };
}, Jr = (s, e, t) => {
  try {
    s.setValueAtTime(e, t);
  } catch (n) {
    if (n.code !== 9) throw n;
    Jr(s, e, t + 1e-7);
  }
}, Gl = (s) => {
  const e = s.createBufferSource();
  e.start();
  try {
    e.start();
  } catch {
    return !0;
  }
  return !1;
}, zl = (s) => {
  const e = s.createBufferSource();
  e.buffer = s.createBuffer(1, 1, 44100);
  try {
    e.start(0, 1);
  } catch {
    return !1;
  }
  return !0;
}, $l = (s) => {
  const e = s.createBufferSource();
  e.start();
  try {
    e.stop();
  } catch {
    return !1;
  }
  return !0;
}, Is = (s) => {
  const e = s.createOscillator();
  try {
    e.start(-1);
  } catch (t) {
    return t instanceof RangeError;
  }
  return !1;
}, Kr = (s) => {
  const e = s.createBuffer(1, 1, 44100), t = s.createBufferSource();
  t.buffer = e, t.start(), t.stop();
  try {
    return t.stop(), !0;
  } catch {
    return !1;
  }
}, Rs = (s) => {
  const e = s.createOscillator();
  try {
    e.stop(-1);
  } catch (t) {
    return t instanceof RangeError;
  }
  return !1;
}, Zl = (s) => {
  const { port1: e, port2: t } = new MessageChannel();
  try {
    e.postMessage(s);
  } finally {
    e.close(), t.close();
  }
}, Xl = (s) => {
  s.start = /* @__PURE__ */ ((e) => (t = 0, n = 0, r) => {
    const i = s.buffer, o = i === null ? n : Math.min(i.duration, n);
    i !== null && o > i.duration - 0.5 / s.context.sampleRate ? e.call(s, t, 0, 0) : e.call(s, t, o, r);
  })(s.start);
}, ei = (s, e) => {
  const t = e.createGain();
  s.connect(t);
  const n = /* @__PURE__ */ ((r) => () => {
    r.call(s, t), s.removeEventListener("ended", n);
  })(s.disconnect);
  s.addEventListener("ended", n), It(s, t), s.stop = /* @__PURE__ */ ((r) => {
    let i = !1;
    return (o = 0) => {
      if (i) try {
        r.call(s, o);
      } catch {
        t.gain.setValueAtTime(0, o);
      }
      else
        r.call(s, o), i = !0;
    };
  })(s.stop);
}, Rt = (s, e) => (t) => {
  const n = { value: s };
  return Object.defineProperties(t, {
    currentTarget: n,
    target: n
  }), typeof e == "function" ? e.call(s, t) : e.handleEvent.call(s, t);
}, Hl = pa(gt), Ql = ya(gt), Yl = Do(wn), ti = /* @__PURE__ */ new WeakMap(), Jl = Ho(ti), De = ao(/* @__PURE__ */ new Map(), /* @__PURE__ */ new WeakMap()), qe = Pl(), ni = Oc(De, We), Vs = Xo(be), ge = wl(be, Vs, ht), Kl = xa(ni, te, ge), K = Jo(Tn), He = tl(qe), Q = mc(He), si = /* @__PURE__ */ new WeakMap(), ri = jo(Rt), Vt = Ec(qe), Ps = hc(Vt), Fs = dc(qe), ii = pc(qe), jt = Rc(qe), ce = Xa(fa(Ir), va(Hl, Ql, ln, Yl, un, be, Jl, Gt, te, gt, ze, ht, en), De, ac(Nn, un, be, te, Lt, ze), We, Cn, ve, ko(ln, Nn, be, te, Lt, K, ze, Q), Ro(si, be, Ve), ri, K, Ps, Fs, ii, Q, jt), eu = Ca(ce, Kl, We, ni, K, Q), qs = /* @__PURE__ */ new WeakSet(), pr = Nc(qe), ai = To(/* @__PURE__ */ new Uint32Array(1)), Ls = Fl(ai, We), Ws = ql(ai), oi = Aa(qs, De, ve, pr, He, Ml(pr), Ls, Ws), fn = Ta(xe), ci = bl(Vs, $t, ht), je = fo(ci), Pt = Dc(fn, De, Gl, zl, $l, Is, Kr, Rs, Xl, Ll(Ht), ei), Be = Tl(Qo($t), ci), tu = Na(je, Pt, te, Be, ge), Pe = Ha(ma(Rr), si, ks, Qa, Ye.createCancelAndHoldAutomationEvent, Ye.createCancelScheduledValuesAutomationEvent, Ye.createExponentialRampToValueAutomationEvent, Ye.createLinearRampToValueAutomationEvent, Ye.createSetTargetAutomationEvent, Ye.createSetValueAutomationEvent, Ye.createSetValueCurveAutomationEvent, Vt, Jr), nu = Oa(ce, tu, Pe, he, Pt, K, Q, Rt), su = Fa(ce, qa, We, he, Ic(xe, Ht), K, Q, ge), ru = io(je, Xr, te, Be, ge), vt = Sl(ti), iu = ro(ce, Pe, ru, Cn, Xr, K, Q, vt), nt = Ac(gt, Fs), st = jc(Vt, Wl(he, nt)), au = co(ce, lo(st, te, ge), st, K, Q), ou = ho(ce, po(Wt, te, ge), Wt, K, Q, Bl), kt = Uc(fn, De, Gc(fn, Pt, xe, nt), Is, Rs), cu = vo(ce, Pe, yo(je, kt, te, Be, ge), kt, K, Q, Rt), fr = zc(ve, Ht), lu = bo(ce, Co(fr, te, ge), fr, K, Q, vt), uu = No(ce, Pe, Mo(je, ur, te, Be, ge), ur, K, Q, vt), mr = $c(ve), hu = Fo(ce, Pe, qo(je, mr, te, Be, ge), mr, ve, K, Q, vt), du = zo(ce, Pe, $o(je, xe, te, Be, ge), xe, K, Q), pu = Qc(Cn, he, Xt, ve), xn = Cl(De, xe, Xt, El(xe, He)), fu = ic(Pt, te, He, ge, xn), mu = sc(ce, Zc(pu), fu, K, Q, vt), _u = La(Pe, st, kt, Xt, ve, Yr, Q, Ht), li = /* @__PURE__ */ new WeakMap(), js = Cc(su, _u, ri, Q, li, Rt), _r = nl(fn, De, Is, Kr, Rs, ei), gu = pl(ce, Pe, _r, fl(je, _r, te, Be, ge), K, Q, Rt), gr = _o(Pt), mn = cl(gr, he, ll(gr, he, xe, dr, nt), dr, nt, Vt, Ht), vr = sl(rl(ln, he, st, xe, Xt, mn, ve, un, Yr, nt)), vu = _l(ce, Pe, vr, gl(je, st, kt, xe, vr, te, He, Be, ge, xn), K, Q, vt), yu = yl(il(We), K, /* @__PURE__ */ new WeakSet(), Ul), yr = al(ol(st, Wt, xe, mn, ve, nt), ve), Tu = Ol(ce, Pe, yr, Nl(je, yr, te, Be, ge), K, Q), wu = Rl(ce, he, mn, Vl(mn, te, ge), K, Q, vt), ui = _c(qe), Bs = Bo(qe), hi = /* @__PURE__ */ new WeakMap(), bu = Ko(hi, He), Cu = ui ? ga(De, ve, Wo(qe), Bs, Uo(da), K, bu, Q, jt, /* @__PURE__ */ new WeakMap(), /* @__PURE__ */ new WeakMap(), Dl(jt, He), qe) : void 0, xu = fc(Ps, Q), Su = Ao(qs, De, So, Lo, /* @__PURE__ */ new WeakSet(), K, xu, on, dt, Ls, Ws), di = no(Cu, eu, oi, nu, iu, au, ou, cu, lu, Su, uu, hu, du, mu, js, gu, vu, yu, Tu, wu), Au = gc(ce, Yc, K, Q), ku = yc(ce, Jc, K, Q), Ou = Tc(ce, Kc, K, Q), Nu = wc(ce, el(he, Q), K), Mu = Pa(di, he, ve, Qr, Au, ku, Ou, Nu, Vt), Us = ec(li), Du = wa(Us), pi = mo(We), Eu = Eo(Us), fi = Vo(We), mi = /* @__PURE__ */ new WeakMap(), Iu = Pc(he, Wc(pi, We, he, st, Wt, kt, xe, Xt, ve, fi, Bs, Zo(mi, Ve), nt), xe, ve, nt), Ru = to(je, pi, Pt, st, Wt, kt, xe, Eu, fi, Bs, te, jt, He, Be, ge, xn), Vu = Yo(hi), Pu = xl(mi), Tr = ui ? Ja(Du, ce, Pe, Ru, Iu, be, Vu, K, Q, jt, jl, Pu, Zl, Rt) : void 0, sd = bc(he, ve, Qr, js, Vt), _i = xo(ve, He), gi = Al(qs, De, Vs, Us, xn, on, Ls, Ws), rd = Sc(De, he, _i, js, gi), Fu = hl(di, De, he, _i, gi), qu = oc(Tn, Ps), Lu = cc(As, Fs), Wu = lc(ks, ii), ju = uc(Tn, Q);
function pt(s) {
  return Wu(s);
}
function Ke(s) {
  return Lu(s);
}
function tn(s) {
  return ju(s);
}
function Ct(s) {
  return qu(s);
}
function Bu(s) {
  return s instanceof oi;
}
function Re(s) {
  return s === void 0;
}
function Z(s) {
  return s !== void 0;
}
function Uu(s) {
  return typeof s == "function";
}
function ft(s) {
  return typeof s == "number";
}
function lt(s) {
  return Object.prototype.toString.call(s) === "[object Object]" && s.constructor === Object;
}
function Gu(s) {
  return typeof s == "boolean";
}
function Le(s) {
  return Array.isArray(s);
}
function mt(s) {
  return typeof s == "string";
}
function zu(s, e) {
  return s === "value" || pt(e) || Ke(e) || Bu(e);
}
function et(s, ...e) {
  if (!e.length) return s;
  const t = e.shift();
  if (lt(s) && lt(t)) for (const n in t) zu(n, t[n]) ? s[n] = t[n] : lt(t[n]) ? (s[n] || Object.assign(s, { [n]: {} }), et(s[n], t[n])) : Object.assign(s, { [n]: t[n] });
  return et(s, ...e);
}
function $u(s, e) {
  return s.length === e.length && s.every((t, n) => e[n] === t);
}
function M(s, e, t = [], n) {
  const r = {}, i = Array.from(e);
  if (lt(i[0]) && n && !Reflect.has(i[0], n) && (Object.keys(i[0]).some((o) => Reflect.has(s, o)) || (et(r, { [n]: i[0] }), t.splice(t.indexOf(n), 1), i.shift())), i.length === 1 && lt(i[0])) et(r, i[0]);
  else for (let o = 0; o < t.length; o++) Z(i[o]) && (r[t[o]] = i[o]);
  return et(s, r);
}
function Zu(s) {
  return s.constructor.getDefaults();
}
function Rn(s, e) {
  return Re(s) ? e : s;
}
function Fe(s, e) {
  return e.forEach((t) => {
    Reflect.has(s, t) && delete s[t];
  }), s;
}
var vi = "14.9.17";
function G(s, e) {
  if (!s) throw new Error(e);
}
function yt(s, e, t = 1 / 0) {
  if (!(e <= s && s <= t)) throw new RangeError(`Value must be within [${e}, ${t}], got: ${s}`);
}
function yi(s) {
  !s.isOffline && s.state !== "running" && Sn('The AudioContext is "suspended". Invoke Tone.start() from a user action to start the audio.');
}
var Ti = !1, wr = !1;
function br(s) {
  Ti = s;
}
function Xu(s) {
  Re(s) && Ti && !wr && (wr = !0, Sn("Events scheduled inside of scheduled callbacks should use the passed in scheduling time. See https://github.com/Tonejs/Tone.js/wiki/Accurate-Timing"));
}
var wi = console;
function Hu(...s) {
  wi.log(...s);
}
function Sn(...s) {
  wi.warn(...s);
}
function Qu(s) {
  return new Mu(s);
}
function Yu(s, e, t) {
  return new Fu(s, e, t);
}
var ut = typeof self == "object" ? self : null, Ju = ut && (ut.hasOwnProperty("AudioContext") || ut.hasOwnProperty("webkitAudioContext"));
function Ku(s, e, t) {
  return G(Z(Tr), "This node only works in a secure context (https or localhost)"), new Tr(s, e, t);
}
var it = class {
  constructor() {
    this.debug = !1, this._wasDisposed = !1;
  }
  static getDefaults() {
    return {};
  }
  log(...s) {
    (this.debug || ut && this.toString() === ut.TONE_DEBUG_CLASS) && Hu(this, ...s);
  }
  dispose() {
    return this._wasDisposed = !0, this;
  }
  get disposed() {
    return this._wasDisposed;
  }
  toString() {
    return this.name;
  }
};
it.version = vi;
var Gs = 1e-6;
function Ot(s, e) {
  return s > e + Gs;
}
function Vn(s, e) {
  return Ot(s, e) || Ie(s, e);
}
function _n(s, e) {
  return s + Gs < e;
}
function Ie(s, e) {
  return Math.abs(s - e) < Gs;
}
function eh(s, e, t) {
  return Math.max(Math.min(s, t), e);
}
var $e = class bi extends it {
  constructor() {
    super(), this.name = "Timeline", this._timeline = [];
    const e = M(bi.getDefaults(), arguments, ["memory"]);
    this.memory = e.memory, this.increasing = e.increasing;
  }
  static getDefaults() {
    return {
      memory: 1 / 0,
      increasing: !1
    };
  }
  get length() {
    return this._timeline.length;
  }
  add(e) {
    if (G(Reflect.has(e, "time"), "Timeline: events must have a time attribute"), e.time = e.time.valueOf(), this.increasing && this.length) {
      const t = this._timeline[this.length - 1];
      G(Vn(e.time, t.time), "The time must be greater than or equal to the last scheduled time"), this._timeline.push(e);
    } else {
      const t = this._search(e.time);
      this._timeline.splice(t + 1, 0, e);
    }
    if (this.length > this.memory) {
      const t = this.length - this.memory;
      this._timeline.splice(0, t);
    }
    return this;
  }
  remove(e) {
    const t = this._timeline.indexOf(e);
    return t !== -1 && this._timeline.splice(t, 1), this;
  }
  get(e, t = "time") {
    const n = this._search(e, t);
    return n !== -1 ? this._timeline[n] : null;
  }
  peek() {
    return this._timeline[0];
  }
  shift() {
    return this._timeline.shift();
  }
  getAfter(e, t = "time") {
    const n = this._search(e, t);
    return n + 1 < this._timeline.length ? this._timeline[n + 1] : null;
  }
  getBefore(e) {
    const t = this._timeline.length;
    if (t > 0 && this._timeline[t - 1].time < e) return this._timeline[t - 1];
    const n = this._search(e);
    return n - 1 >= 0 ? this._timeline[n - 1] : null;
  }
  cancel(e) {
    if (this._timeline.length > 1) {
      let t = this._search(e);
      if (t >= 0) if (Ie(this._timeline[t].time, e)) {
        for (let n = t; n >= 0 && Ie(this._timeline[n].time, e); n--) t = n;
        this._timeline = this._timeline.slice(0, t);
      } else this._timeline = this._timeline.slice(0, t + 1);
      else this._timeline = [];
    } else this._timeline.length === 1 && Vn(this._timeline[0].time, e) && (this._timeline = []);
    return this;
  }
  cancelBefore(e) {
    const t = this._search(e);
    return t >= 0 && (this._timeline = this._timeline.slice(t + 1)), this;
  }
  previousEvent(e) {
    const t = this._timeline.indexOf(e);
    return t > 0 ? this._timeline[t - 1] : null;
  }
  _search(e, t = "time") {
    if (this._timeline.length === 0) return -1;
    let n = 0;
    const r = this._timeline.length;
    let i = r;
    if (r > 0 && this._timeline[r - 1][t] <= e) return r - 1;
    for (; n < i; ) {
      let o = Math.floor(n + (i - n) / 2);
      const a = this._timeline[o], c = this._timeline[o + 1];
      if (Ie(a[t], e)) {
        for (let l = o; l < this._timeline.length; l++) {
          const u = this._timeline[l];
          if (Ie(u[t], e)) o = l;
          else break;
        }
        return o;
      } else {
        if (_n(a[t], e) && Ot(c[t], e)) return o;
        Ot(a[t], e) ? i = o : n = o + 1;
      }
    }
    return -1;
  }
  _iterate(e, t = 0, n = this._timeline.length - 1) {
    this._timeline.slice(t, n + 1).forEach(e);
  }
  forEach(e) {
    return this._iterate(e), this;
  }
  forEachBefore(e, t) {
    const n = this._search(e);
    return n !== -1 && this._iterate(t, 0, n), this;
  }
  forEachAfter(e, t) {
    const n = this._search(e);
    return this._iterate(t, n + 1), this;
  }
  forEachBetween(e, t, n) {
    let r = this._search(e), i = this._search(t);
    return r !== -1 && i !== -1 ? (this._timeline[r].time !== e && (r += 1), this._timeline[i].time === t && (i -= 1), this._iterate(n, r, i)) : r === -1 && this._iterate(n, 0, i), this;
  }
  forEachFrom(e, t) {
    let n = this._search(e);
    for (; n >= 0 && this._timeline[n].time >= e; ) n--;
    return this._iterate(t, n + 1), this;
  }
  forEachAtTime(e, t) {
    const n = this._search(e);
    if (n !== -1 && Ie(this._timeline[n].time, e)) {
      let r = n;
      for (let i = n; i >= 0 && Ie(this._timeline[i].time, e); i--) r = i;
      this._iterate((i) => {
        t(i);
      }, r, n);
    }
    return this;
  }
  dispose() {
    return super.dispose(), this._timeline = [], this;
  }
};
function Tt(s, e, t, n) {
  var r = arguments.length, i = r < 3 ? e : n === null ? n = Object.getOwnPropertyDescriptor(e, t) : n, o;
  if (typeof Reflect == "object" && typeof Reflect.decorate == "function") i = Reflect.decorate(s, e, t, n);
  else for (var a = s.length - 1; a >= 0; a--) (o = s[a]) && (i = (r < 3 ? o(i) : r > 3 ? o(e, t, i) : o(e, t)) || i);
  return r > 3 && i && Object.defineProperty(e, t, i), i;
}
function pe(s, e, t, n) {
  function r(i) {
    return i instanceof t ? i : new t(function(o) {
      o(i);
    });
  }
  return new (t || (t = Promise))(function(i, o) {
    function a(u) {
      try {
        l(n.next(u));
      } catch (h) {
        o(h);
      }
    }
    function c(u) {
      try {
        l(n.throw(u));
      } catch (h) {
        o(h);
      }
    }
    function l(u) {
      u.done ? i(u.value) : r(u.value).then(a, c);
    }
    l((n = n.apply(s, e || [])).next());
  });
}
var th = class {
  constructor(s, e, t, n) {
    this._callback = s, this._type = e, this._minimumUpdateInterval = Math.max(128 / (n || 44100), 1e-3), this.updateInterval = t, this._createClock();
  }
  _createWorker() {
    const s = new Blob([`
			// the initial timeout time
			let timeoutTime =  ${(this._updateInterval * 1e3).toFixed(1)};
			// onmessage callback
			self.onmessage = function(msg){
				timeoutTime = parseInt(msg.data);
			};
			// the tick function which posts a message
			// and schedules a new tick
			function tick(){
				setTimeout(tick, timeoutTime);
				self.postMessage('tick');
			}
			// call tick initially
			tick();
			`], { type: "text/javascript" }), e = URL.createObjectURL(s), t = new Worker(e);
    t.onmessage = this._callback.bind(this), this._worker = t;
  }
  _createTimeout() {
    this._timeout = setTimeout(() => {
      this._createTimeout(), this._callback();
    }, this._updateInterval * 1e3);
  }
  _createClock() {
    if (this._type === "worker") try {
      this._createWorker();
    } catch {
      this._type = "timeout", this._createClock();
    }
    else this._type === "timeout" && this._createTimeout();
  }
  _disposeClock() {
    this._timeout && clearTimeout(this._timeout), this._worker && (this._worker.terminate(), this._worker.onmessage = null);
  }
  get updateInterval() {
    return this._updateInterval;
  }
  set updateInterval(s) {
    var e;
    this._updateInterval = Math.max(s, this._minimumUpdateInterval), this._type === "worker" && ((e = this._worker) === null || e === void 0 || e.postMessage(this._updateInterval * 1e3));
  }
  get type() {
    return this._type;
  }
  set type(s) {
    this._disposeClock(), this._type = s, this._createClock();
  }
  dispose() {
    this._disposeClock();
  }
}, Ci = [];
function xi(s) {
  Ci.push(s);
}
function nh(s) {
  Ci.forEach((e) => e(s));
}
var Si = [];
function Ai(s) {
  Si.push(s);
}
function sh(s) {
  Si.forEach((e) => e(s));
}
var zs = class ki extends it {
  constructor() {
    super(...arguments), this.name = "Emitter";
  }
  on(e, t) {
    return e.split(/\W+/).forEach((n) => {
      Re(this._events) && (this._events = {}), this._events.hasOwnProperty(n) || (this._events[n] = []), this._events[n].push(t);
    }), this;
  }
  once(e, t) {
    const n = (...r) => {
      t(...r), this.off(e, n);
    };
    return this.on(e, n), this;
  }
  off(e, t) {
    return e.split(/\W+/).forEach((n) => {
      if (Re(this._events) && (this._events = {}), this._events.hasOwnProperty(n)) if (Re(t)) this._events[n] = [];
      else {
        const r = this._events[n];
        for (let i = r.length - 1; i >= 0; i--) r[i] === t && r.splice(i, 1);
      }
    }), this;
  }
  emit(e, ...t) {
    if (this._events && this._events.hasOwnProperty(e)) {
      const n = this._events[e].slice(0);
      for (let r = 0, i = n.length; r < i; r++) n[r].apply(this, t);
    }
    return this;
  }
  static mixin(e) {
    [
      "on",
      "once",
      "off",
      "emit"
    ].forEach((t) => {
      const n = Object.getOwnPropertyDescriptor(ki.prototype, t);
      Object.defineProperty(e.prototype, t, n);
    });
  }
  dispose() {
    return super.dispose(), this._events = void 0, this;
  }
}, Oi = class extends zs {
  constructor() {
    super(...arguments), this.isOffline = !1;
  }
  toJSON() {
    return {};
  }
}, $s = class Ni extends Oi {
  constructor() {
    var e, t;
    super(), this.name = "Context", this._constants = /* @__PURE__ */ new Map(), this._timeouts = new $e(), this._timeoutIds = 0, this._initialized = !1, this._closeStarted = !1, this.isOffline = !1, this._workletPromise = null;
    const n = M(Ni.getDefaults(), arguments, ["context"]);
    n.context ? (this._context = n.context, this._latencyHint = ((e = arguments[0]) === null || e === void 0 ? void 0 : e.latencyHint) || "") : (this._context = Qu({ latencyHint: n.latencyHint }), this._latencyHint = n.latencyHint), this._ticker = new th(this.emit.bind(this, "tick"), n.clockSource, n.updateInterval, this._context.sampleRate), this.on("tick", this._timeoutLoop.bind(this)), this._context.onstatechange = () => {
      this.emit("statechange", this.state);
    }, this[!((t = arguments[0]) === null || t === void 0) && t.hasOwnProperty("updateInterval") ? "_lookAhead" : "lookAhead"] = n.lookAhead;
  }
  static getDefaults() {
    return {
      clockSource: "worker",
      latencyHint: "interactive",
      lookAhead: 0.1,
      updateInterval: 0.05
    };
  }
  initialize() {
    return this._initialized || (nh(this), this._initialized = !0), this;
  }
  createAnalyser() {
    return this._context.createAnalyser();
  }
  createOscillator() {
    return this._context.createOscillator();
  }
  createBufferSource() {
    return this._context.createBufferSource();
  }
  createBiquadFilter() {
    return this._context.createBiquadFilter();
  }
  createBuffer(e, t, n) {
    return this._context.createBuffer(e, t, n);
  }
  createChannelMerger(e) {
    return this._context.createChannelMerger(e);
  }
  createChannelSplitter(e) {
    return this._context.createChannelSplitter(e);
  }
  createConstantSource() {
    return this._context.createConstantSource();
  }
  createConvolver() {
    return this._context.createConvolver();
  }
  createDelay(e) {
    return this._context.createDelay(e);
  }
  createDynamicsCompressor() {
    return this._context.createDynamicsCompressor();
  }
  createGain() {
    return this._context.createGain();
  }
  createIIRFilter(e, t) {
    return this._context.createIIRFilter(e, t);
  }
  createPanner() {
    return this._context.createPanner();
  }
  createPeriodicWave(e, t, n) {
    return this._context.createPeriodicWave(e, t, n);
  }
  createStereoPanner() {
    return this._context.createStereoPanner();
  }
  createWaveShaper() {
    return this._context.createWaveShaper();
  }
  createMediaStreamSource(e) {
    return G(Ct(this._context), "Not available if OfflineAudioContext"), this._context.createMediaStreamSource(e);
  }
  createMediaElementSource(e) {
    return G(Ct(this._context), "Not available if OfflineAudioContext"), this._context.createMediaElementSource(e);
  }
  createMediaStreamDestination() {
    return G(Ct(this._context), "Not available if OfflineAudioContext"), this._context.createMediaStreamDestination();
  }
  decodeAudioData(e) {
    return this._context.decodeAudioData(e);
  }
  get currentTime() {
    return this._context.currentTime;
  }
  get state() {
    return this._context.state;
  }
  get sampleRate() {
    return this._context.sampleRate;
  }
  get listener() {
    return this.initialize(), this._listener;
  }
  set listener(e) {
    G(!this._initialized, "The listener cannot be set after initialization."), this._listener = e;
  }
  get transport() {
    return this.initialize(), this._transport;
  }
  set transport(e) {
    G(!this._initialized, "The transport cannot be set after initialization."), this._transport = e;
  }
  get draw() {
    return this.initialize(), this._draw;
  }
  set draw(e) {
    G(!this._initialized, "Draw cannot be set after initialization."), this._draw = e;
  }
  get destination() {
    return this.initialize(), this._destination;
  }
  set destination(e) {
    G(!this._initialized, "The destination cannot be set after initialization."), this._destination = e;
  }
  createAudioWorkletNode(e, t) {
    return Ku(this.rawContext, e, t);
  }
  addAudioWorkletModule(e) {
    return pe(this, void 0, void 0, function* () {
      G(Z(this.rawContext.audioWorklet), "AudioWorkletNode is only available in a secure context (https or localhost)"), this._workletPromise || (this._workletPromise = this.rawContext.audioWorklet.addModule(e)), yield this._workletPromise;
    });
  }
  workletsAreReady() {
    return pe(this, void 0, void 0, function* () {
      (yield this._workletPromise) ? this._workletPromise : Promise.resolve();
    });
  }
  get updateInterval() {
    return this._ticker.updateInterval;
  }
  set updateInterval(e) {
    this._ticker.updateInterval = e;
  }
  get clockSource() {
    return this._ticker.type;
  }
  set clockSource(e) {
    this._ticker.type = e;
  }
  get lookAhead() {
    return this._lookAhead;
  }
  set lookAhead(e) {
    this._lookAhead = e, this.updateInterval = e ? e / 2 : 0.01;
  }
  get latencyHint() {
    return this._latencyHint;
  }
  get rawContext() {
    return this._context;
  }
  now() {
    return this._context.currentTime + this._lookAhead;
  }
  immediate() {
    return this._context.currentTime;
  }
  resume() {
    return Ct(this._context) ? this._context.resume() : Promise.resolve();
  }
  close() {
    return pe(this, void 0, void 0, function* () {
      Ct(this._context) && this.state !== "closed" && !this._closeStarted && (this._closeStarted = !0, yield this._context.close()), this._initialized && sh(this);
    });
  }
  getConstant(e) {
    if (this._constants.has(e)) return this._constants.get(e);
    {
      const t = this._context.createBuffer(1, 128, this._context.sampleRate), n = t.getChannelData(0);
      for (let i = 0; i < n.length; i++) n[i] = e;
      const r = this._context.createBufferSource();
      return r.channelCount = 1, r.channelCountMode = "explicit", r.buffer = t, r.loop = !0, r.start(0), this._constants.set(e, r), r;
    }
  }
  dispose() {
    return super.dispose(), this._ticker.dispose(), this._timeouts.dispose(), Object.keys(this._constants).map((e) => this._constants[e].disconnect()), this.close(), this;
  }
  _timeoutLoop() {
    const e = this.now();
    let t = this._timeouts.peek();
    for (; this._timeouts.length && t && t.time <= e; )
      t.callback(), this._timeouts.shift(), t = this._timeouts.peek();
  }
  setTimeout(e, t) {
    this._timeoutIds++;
    const n = this.now();
    return this._timeouts.add({
      callback: e,
      id: this._timeoutIds,
      time: n + t
    }), this._timeoutIds;
  }
  clearTimeout(e) {
    return this._timeouts.forEach((t) => {
      t.id === e && this._timeouts.remove(t);
    }), this;
  }
  clearInterval(e) {
    return this.clearTimeout(e);
  }
  setInterval(e, t) {
    const n = ++this._timeoutIds, r = () => {
      const i = this.now();
      this._timeouts.add({
        callback: () => {
          e(), r();
        },
        id: n,
        time: i + t
      });
    };
    return r(), n;
  }
}, rh = class extends Oi {
  constructor() {
    super(...arguments), this.lookAhead = 0, this.latencyHint = 0, this.isOffline = !1;
  }
  createAnalyser() {
    return {};
  }
  createOscillator() {
    return {};
  }
  createBufferSource() {
    return {};
  }
  createBiquadFilter() {
    return {};
  }
  createBuffer(s, e, t) {
    return {};
  }
  createChannelMerger(s) {
    return {};
  }
  createChannelSplitter(s) {
    return {};
  }
  createConstantSource() {
    return {};
  }
  createConvolver() {
    return {};
  }
  createDelay(s) {
    return {};
  }
  createDynamicsCompressor() {
    return {};
  }
  createGain() {
    return {};
  }
  createIIRFilter(s, e) {
    return {};
  }
  createPanner() {
    return {};
  }
  createPeriodicWave(s, e, t) {
    return {};
  }
  createStereoPanner() {
    return {};
  }
  createWaveShaper() {
    return {};
  }
  createMediaStreamSource(s) {
    return {};
  }
  createMediaElementSource(s) {
    return {};
  }
  createMediaStreamDestination() {
    return {};
  }
  decodeAudioData(s) {
    return Promise.resolve({});
  }
  createAudioWorkletNode(s, e) {
    return {};
  }
  get rawContext() {
    return {};
  }
  addAudioWorkletModule(s) {
    return pe(this, void 0, void 0, function* () {
      return Promise.resolve();
    });
  }
  resume() {
    return Promise.resolve();
  }
  setTimeout(s, e) {
    return 0;
  }
  clearTimeout(s) {
    return this;
  }
  setInterval(s, e) {
    return 0;
  }
  clearInterval(s) {
    return this;
  }
  getConstant(s) {
    return {};
  }
  get currentTime() {
    return 0;
  }
  get state() {
    return {};
  }
  get sampleRate() {
    return 0;
  }
  get listener() {
    return {};
  }
  get transport() {
    return {};
  }
  get draw() {
    return {};
  }
  set draw(s) {
  }
  get destination() {
    return {};
  }
  set destination(s) {
  }
  now() {
    return 0;
  }
  immediate() {
    return 0;
  }
};
function Y(s, e) {
  Le(e) ? e.forEach((t) => Y(s, t)) : Object.defineProperty(s, e, {
    enumerable: !0,
    writable: !1
  });
}
function Zs(s, e) {
  Le(e) ? e.forEach((t) => Zs(s, t)) : Object.defineProperty(s, e, { writable: !0 });
}
var le = () => {
}, tt = class me extends it {
  constructor() {
    super(), this.name = "ToneAudioBuffer", this.onload = le;
    const e = M(me.getDefaults(), arguments, [
      "url",
      "onload",
      "onerror"
    ]);
    this.reverse = e.reverse, this.onload = e.onload, mt(e.url) ? this.load(e.url).catch(e.onerror) : e.url && this.set(e.url);
  }
  static getDefaults() {
    return {
      onerror: le,
      onload: le,
      reverse: !1
    };
  }
  get sampleRate() {
    return this._buffer ? this._buffer.sampleRate : _e().sampleRate;
  }
  set(e) {
    return e instanceof me ? e.loaded ? this._buffer = e.get() : e.onload = () => {
      this.set(e), this.onload(this);
    } : this._buffer = e, this._reversed && this._reverse(), this;
  }
  get() {
    return this._buffer;
  }
  load(e) {
    return pe(this, void 0, void 0, function* () {
      const t = me.load(e).then((n) => {
        this.set(n), this.onload(this);
      });
      me.downloads.push(t);
      try {
        yield t;
      } finally {
        const n = me.downloads.indexOf(t);
        me.downloads.splice(n, 1);
      }
      return this;
    });
  }
  dispose() {
    return super.dispose(), this._buffer = void 0, this;
  }
  fromArray(e) {
    const t = Le(e) && e[0].length > 0, n = t ? e.length : 1, r = t ? e[0].length : e.length, i = _e(), o = i.createBuffer(n, r, i.sampleRate), a = !t && n === 1 ? [e] : e;
    for (let c = 0; c < n; c++) o.copyToChannel(a[c], c);
    return this._buffer = o, this;
  }
  toMono(e) {
    if (ft(e)) this.fromArray(this.toArray(e));
    else {
      let t = new Float32Array(this.length);
      const n = this.numberOfChannels;
      for (let r = 0; r < n; r++) {
        const i = this.toArray(r);
        for (let o = 0; o < i.length; o++) t[o] += i[o];
      }
      t = t.map((r) => r / n), this.fromArray(t);
    }
    return this;
  }
  toArray(e) {
    if (ft(e)) return this.getChannelData(e);
    if (this.numberOfChannels === 1) return this.toArray(0);
    {
      const t = [];
      for (let n = 0; n < this.numberOfChannels; n++) t[n] = this.getChannelData(n);
      return t;
    }
  }
  getChannelData(e) {
    return this._buffer ? this._buffer.getChannelData(e) : /* @__PURE__ */ new Float32Array(0);
  }
  slice(e, t = this.duration) {
    G(this.loaded, "Buffer is not loaded");
    const n = Math.floor(e * this.sampleRate), r = Math.floor(t * this.sampleRate);
    G(n < r, "The start time must be less than the end time");
    const i = r - n, o = _e().createBuffer(this.numberOfChannels, i, this.sampleRate);
    for (let a = 0; a < this.numberOfChannels; a++) o.copyToChannel(this.getChannelData(a).subarray(n, r), a);
    return new me(o);
  }
  _reverse() {
    if (this.loaded) for (let e = 0; e < this.numberOfChannels; e++) this.getChannelData(e).reverse();
    return this;
  }
  get loaded() {
    return this.length > 0;
  }
  get duration() {
    return this._buffer ? this._buffer.duration : 0;
  }
  get length() {
    return this._buffer ? this._buffer.length : 0;
  }
  get numberOfChannels() {
    return this._buffer ? this._buffer.numberOfChannels : 0;
  }
  get reverse() {
    return this._reversed;
  }
  set reverse(e) {
    this._reversed !== e && (this._reversed = e, this._reverse());
  }
  static fromArray(e) {
    return new me().fromArray(e);
  }
  static fromUrl(e) {
    return pe(this, void 0, void 0, function* () {
      return yield new me().load(e);
    });
  }
  static load(e) {
    return pe(this, void 0, void 0, function* () {
      const t = e.match(/\[([^\]\[]+\|.+)\]$/);
      if (t) {
        const a = t[1].split("|");
        let c = a[0];
        for (const l of a) if (me.supportsType(l)) {
          c = l;
          break;
        }
        e = e.replace(t[0], c);
      }
      const n = me.baseUrl === "" || me.baseUrl.endsWith("/") ? me.baseUrl : me.baseUrl + "/", r = document.createElement("a");
      r.href = n + e, r.pathname = (r.pathname + r.hash).split("/").map(encodeURIComponent).join("/");
      const i = yield fetch(r.href);
      if (!i.ok) throw new Error(`could not load url: ${e}`);
      const o = yield i.arrayBuffer();
      return yield _e().decodeAudioData(o);
    });
  }
  static supportsType(e) {
    const t = e.split("."), n = t[t.length - 1];
    return document.createElement("audio").canPlayType("audio/" + n) !== "";
  }
  static loaded() {
    return pe(this, void 0, void 0, function* () {
      for (yield Promise.resolve(); me.downloads.length; ) yield me.downloads[0];
    });
  }
};
tt.baseUrl = "";
tt.downloads = [];
var Xs = class extends $s {
  constructor() {
    super({
      clockSource: "offline",
      context: tn(arguments[0]) ? arguments[0] : Yu(arguments[0], arguments[1] * arguments[2], arguments[2]),
      lookAhead: 0,
      updateInterval: tn(arguments[0]) ? 128 / arguments[0].sampleRate : 128 / arguments[2]
    }), this.name = "OfflineContext", this._currentTime = 0, this.isOffline = !0, this._duration = tn(arguments[0]) ? arguments[0].length / arguments[0].sampleRate : arguments[1];
  }
  now() {
    return this._currentTime;
  }
  get currentTime() {
    return this._currentTime;
  }
  _renderClock(s) {
    return pe(this, void 0, void 0, function* () {
      let e = 0;
      for (; this._duration - this._currentTime >= 0; ) {
        this.emit("tick"), this._currentTime += 128 / this.sampleRate, e++;
        const t = Math.floor(this.sampleRate / 128);
        s && e % t === 0 && (yield new Promise((n) => setTimeout(n, 1)));
      }
    });
  }
  render(s = !0) {
    return pe(this, void 0, void 0, function* () {
      return yield this.workletsAreReady(), yield this._renderClock(s), new tt(yield this._context.startRendering());
    });
  }
  close() {
    return Promise.resolve();
  }
}, Mi = new rh(), ot = Mi;
function _e() {
  return ot === Mi && Ju && ih(new $s()), ot;
}
function ih(s, e = !1) {
  e && ot.dispose(), Ct(s) ? ot = new $s(s) : tn(s) ? ot = new Xs(s) : ot = s;
}
function id() {
  return ot.resume();
}
if (ut && !ut.TONE_SILENCE_LOGGING) {
  const e = ` * Tone.js v${vi} * `;
  console.log(`%c${e}`, "background: #000; color: #fff");
}
var ah = class Di extends it {
  constructor(e, t, n) {
    super(), this.defaultUnits = "s", this._val = t, this._units = n, this.context = e, this._expressions = this._getExpressions();
  }
  _getExpressions() {
    return {
      hz: {
        method: (e) => this._frequencyToUnits(parseFloat(e)),
        regexp: /^(\d+(?:\.\d+)?)hz$/i
      },
      i: {
        method: (e) => this._ticksToUnits(parseInt(e, 10)),
        regexp: /^(\d+)i$/i
      },
      m: {
        method: (e) => this._beatsToUnits(parseInt(e, 10) * this._getTimeSignature()),
        regexp: /^(\d+)m$/i
      },
      n: {
        method: (e, t) => {
          const n = parseInt(e, 10), r = t === "." ? 1.5 : 1;
          return n === 1 ? this._beatsToUnits(this._getTimeSignature()) * r : this._beatsToUnits(4 / n) * r;
        },
        regexp: /^(\d+)n(\.?)$/i
      },
      number: {
        method: (e) => this._expressions[this.defaultUnits].method.call(this, e),
        regexp: /^(\d+(?:\.\d+)?)$/
      },
      s: {
        method: (e) => this._secondsToUnits(parseFloat(e)),
        regexp: /^(\d+(?:\.\d+)?)s$/
      },
      samples: {
        method: (e) => parseInt(e, 10) / this.context.sampleRate,
        regexp: /^(\d+)samples$/
      },
      t: {
        method: (e) => {
          const t = parseInt(e, 10);
          return this._beatsToUnits(8 / (Math.floor(t) * 3));
        },
        regexp: /^(\d+)t$/i
      },
      tr: {
        method: (e, t, n) => {
          let r = 0;
          return e && e !== "0" && (r += this._beatsToUnits(this._getTimeSignature() * parseFloat(e))), t && t !== "0" && (r += this._beatsToUnits(parseFloat(t))), n && n !== "0" && (r += this._beatsToUnits(parseFloat(n) / 4)), r;
        },
        regexp: /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):?(\d+(?:\.\d+)?)?$/
      }
    };
  }
  valueOf() {
    if (this._val instanceof Di && this.fromType(this._val), Re(this._val)) return this._noArg();
    if (mt(this._val) && Re(this._units)) {
      for (const e in this._expressions) if (this._expressions[e].regexp.test(this._val.trim())) {
        this._units = e;
        break;
      }
    } else if (lt(this._val)) {
      let e = 0;
      for (const t in this._val) if (Z(this._val[t])) {
        const n = this._val[t], r = new this.constructor(this.context, t).valueOf() * n;
        e += r;
      }
      return e;
    }
    if (Z(this._units)) {
      const e = this._expressions[this._units], t = this._val.toString().trim().match(e.regexp);
      return t ? e.method.apply(this, t.slice(1)) : e.method.call(this, this._val);
    } else return mt(this._val) ? parseFloat(this._val) : this._val;
  }
  _frequencyToUnits(e) {
    return 1 / e;
  }
  _beatsToUnits(e) {
    return 60 / this._getBpm() * e;
  }
  _secondsToUnits(e) {
    return e;
  }
  _ticksToUnits(e) {
    return e * this._beatsToUnits(1) / this._getPPQ();
  }
  _noArg() {
    return this._now();
  }
  _getBpm() {
    return this.context.transport.bpm.value;
  }
  _getTimeSignature() {
    return this.context.transport.timeSignature;
  }
  _getPPQ() {
    return this.context.transport.PPQ;
  }
  fromType(e) {
    switch (this._units = void 0, this.defaultUnits) {
      case "s":
        this._val = e.toSeconds();
        break;
      case "i":
        this._val = e.toTicks();
        break;
      case "hz":
        this._val = e.toFrequency();
        break;
      case "midi":
        this._val = e.toMidi();
        break;
    }
    return this;
  }
  toFrequency() {
    return 1 / this.toSeconds();
  }
  toSamples() {
    return this.toSeconds() * this.context.sampleRate;
  }
  toMilliseconds() {
    return this.toSeconds() * 1e3;
  }
}, ct = class nn extends ah {
  constructor() {
    super(...arguments), this.name = "TimeClass";
  }
  _getExpressions() {
    return Object.assign(super._getExpressions(), {
      now: {
        method: (e) => this._now() + new this.constructor(this.context, e).valueOf(),
        regexp: /^\+(.+)/
      },
      quantize: {
        method: (e) => {
          const t = new nn(this.context, e).valueOf();
          return this._secondsToUnits(this.context.transport.nextSubdivision(t));
        },
        regexp: /^@(.+)/
      }
    });
  }
  quantize(e, t = 1) {
    const n = new this.constructor(this.context, e).valueOf(), r = this.valueOf();
    return r + (Math.round(r / n) * n - r) * t;
  }
  toNotation() {
    const e = this.toSeconds(), t = ["1m"];
    for (let i = 1; i < 9; i++) {
      const o = Math.pow(2, i);
      t.push(o + "n."), t.push(o + "n"), t.push(o + "t");
    }
    t.push("0");
    let n = t[0], r = new nn(this.context, t[0]).toSeconds();
    return t.forEach((i) => {
      const o = new nn(this.context, i).toSeconds();
      Math.abs(o - e) < Math.abs(r - e) && (n = i, r = o);
    }), n;
  }
  toBarsBeatsSixteenths() {
    const e = this._beatsToUnits(1);
    let t = this.valueOf() / e;
    t = parseFloat(t.toFixed(4));
    const n = Math.floor(t / this._getTimeSignature());
    let r = t % 1 * 4;
    t = Math.floor(t) % this._getTimeSignature();
    const i = r.toString();
    return i.length > 3 && (r = parseFloat(parseFloat(i).toFixed(3))), [
      n,
      t,
      r
    ].join(":");
  }
  toTicks() {
    const e = this._beatsToUnits(1);
    return this.valueOf() / e * this._getPPQ();
  }
  toSeconds() {
    return this.valueOf();
  }
  toMidi() {
    return at(this.toFrequency());
  }
  _now() {
    return this.context.now();
  }
}, An = class Ft extends ct {
  constructor() {
    super(...arguments), this.name = "Frequency", this.defaultUnits = "hz";
  }
  static get A4() {
    return Ji();
  }
  static set A4(e) {
    Ki(e);
  }
  _getExpressions() {
    return Object.assign({}, super._getExpressions(), {
      midi: {
        regexp: /^(\d+(?:\.\d+)?midi)/,
        method(e) {
          return this.defaultUnits === "midi" ? e : Ft.mtof(e);
        }
      },
      note: {
        regexp: /^([a-g]{1}(?:b|#|##|x|bb|###|#x|x#|bbb)?)(-?[0-9]+)/i,
        method(e, t) {
          const n = oh[e.toLowerCase()] + (parseInt(t, 10) + 1) * 12;
          return this.defaultUnits === "midi" ? n : Ft.mtof(n);
        }
      },
      tr: {
        regexp: /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):?(\d+(?:\.\d+)?)?/,
        method(e, t, n) {
          let r = 1;
          return e && e !== "0" && (r *= this._beatsToUnits(this._getTimeSignature() * parseFloat(e))), t && t !== "0" && (r *= this._beatsToUnits(parseFloat(t))), n && n !== "0" && (r *= this._beatsToUnits(parseFloat(n) / 4)), r;
        }
      }
    });
  }
  transpose(e) {
    return new Ft(this.context, this.valueOf() * Yi(e));
  }
  harmonize(e) {
    return e.map((t) => this.transpose(t));
  }
  toMidi() {
    return at(this.valueOf());
  }
  toNote() {
    const e = this.toFrequency(), t = Math.log2(e / Ft.A4);
    let n = Math.round(12 * t) + 57;
    const r = Math.floor(n / 12);
    return r < 0 && (n += -12 * r), ch[n % 12] + r.toString();
  }
  toSeconds() {
    return 1 / super.toSeconds();
  }
  toTicks() {
    const e = this._beatsToUnits(1), t = this.valueOf() / e;
    return Math.floor(t * this._getPPQ());
  }
  _noArg() {
    return 0;
  }
  _frequencyToUnits(e) {
    return e;
  }
  _ticksToUnits(e) {
    return 1 / (e * 60 / (this._getBpm() * this._getPPQ()));
  }
  _beatsToUnits(e) {
    return 1 / super._beatsToUnits(e);
  }
  _secondsToUnits(e) {
    return 1 / e;
  }
  static mtof(e) {
    return Dr(e);
  }
  static ftom(e) {
    return at(e);
  }
}, oh = {
  cbbb: -3,
  cbb: -2,
  cb: -1,
  c: 0,
  "c#": 1,
  cx: 2,
  "c##": 2,
  "c###": 3,
  "cx#": 3,
  "c#x": 3,
  dbbb: -1,
  dbb: 0,
  db: 1,
  d: 2,
  "d#": 3,
  dx: 4,
  "d##": 4,
  "d###": 5,
  "dx#": 5,
  "d#x": 5,
  ebbb: 1,
  ebb: 2,
  eb: 3,
  e: 4,
  "e#": 5,
  ex: 6,
  "e##": 6,
  "e###": 7,
  "ex#": 7,
  "e#x": 7,
  fbbb: 2,
  fbb: 3,
  fb: 4,
  f: 5,
  "f#": 6,
  fx: 7,
  "f##": 7,
  "f###": 8,
  "fx#": 8,
  "f#x": 8,
  gbbb: 4,
  gbb: 5,
  gb: 6,
  g: 7,
  "g#": 8,
  gx: 9,
  "g##": 9,
  "g###": 10,
  "gx#": 10,
  "g#x": 10,
  abbb: 6,
  abb: 7,
  ab: 8,
  a: 9,
  "a#": 10,
  ax: 11,
  "a##": 11,
  "a###": 12,
  "ax#": 12,
  "a#x": 12,
  bbbb: 8,
  bbb: 9,
  bb: 10,
  b: 11,
  "b#": 12,
  bx: 13,
  "b##": 13,
  "b###": 14,
  "bx#": 14,
  "b#x": 14
}, ch = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
], qt = class extends ct {
  constructor() {
    super(...arguments), this.name = "TransportTime";
  }
  _now() {
    return this.context.transport.seconds;
  }
}, Ze = class sn extends it {
  constructor() {
    super();
    const e = M(sn.getDefaults(), arguments, ["context"]);
    this.defaultContext ? this.context = this.defaultContext : this.context = e.context;
  }
  static getDefaults() {
    return { context: _e() };
  }
  now() {
    return this.context.currentTime + this.context.lookAhead;
  }
  immediate() {
    return this.context.currentTime;
  }
  get sampleTime() {
    return 1 / this.context.sampleRate;
  }
  get blockTime() {
    return 128 / this.context.sampleRate;
  }
  toSeconds(e) {
    return Xu(e), new ct(this.context, e).toSeconds();
  }
  toFrequency(e) {
    return new An(this.context, e).toFrequency();
  }
  toTicks(e) {
    return new qt(this.context, e).toTicks();
  }
  _getPartialProperties(e) {
    const t = this.get();
    return Object.keys(t).forEach((n) => {
      Re(e[n]) && delete t[n];
    }), t;
  }
  get() {
    const e = Zu(this);
    return Object.keys(e).forEach((t) => {
      if (Reflect.has(this, t)) {
        const n = this[t];
        Z(n) && Z(n.value) && Z(n.setValueAtTime) ? e[t] = n.value : n instanceof sn ? e[t] = n._getPartialProperties(e[t]) : Le(n) || ft(n) || mt(n) || Gu(n) ? e[t] = n : delete e[t];
      }
    }), e;
  }
  set(e) {
    return Object.keys(e).forEach((t) => {
      Reflect.has(this, t) && Z(this[t]) && (this[t] && Z(this[t].value) && Z(this[t].setValueAtTime) ? this[t].value !== e[t] && (this[t].value = e[t]) : this[t] instanceof sn ? this[t].set(e[t]) : this[t] = e[t]);
    }), this;
  }
}, ue = class rn extends Ze {
  constructor() {
    super(M(rn.getDefaults(), arguments, [
      "param",
      "units",
      "convert"
    ])), this.name = "Param", this.overridden = !1, this._minOutput = 1e-7;
    const e = M(rn.getDefaults(), arguments, [
      "param",
      "units",
      "convert"
    ]);
    for (G(Z(e.param) && (pt(e.param) || e.param instanceof rn), "param must be an AudioParam"); !pt(e.param); ) e.param = e.param._param;
    this._swappable = Z(e.swappable) ? e.swappable : !1, this._swappable ? (this.input = this.context.createGain(), this._param = e.param, this.input.connect(this._param)) : this._param = this.input = e.param, this._events = new $e(1e3), this._initialValue = this._param.defaultValue, this.units = e.units, this.convert = e.convert, this._minValue = e.minValue, this._maxValue = e.maxValue, Z(e.value) && e.value !== this._toType(this._initialValue) && this.setValueAtTime(e.value, 0);
  }
  static getDefaults() {
    return Object.assign(Ze.getDefaults(), {
      convert: !0,
      units: "number"
    });
  }
  get value() {
    const e = this.now();
    return this.getValueAtTime(e);
  }
  set value(e) {
    this.cancelScheduledValues(this.now()), this.setValueAtTime(e, this.now());
  }
  get minValue() {
    return Z(this._minValue) ? this._minValue : this.units === "time" || this.units === "frequency" || this.units === "normalRange" || this.units === "positive" || this.units === "transportTime" || this.units === "ticks" || this.units === "bpm" || this.units === "hertz" || this.units === "samples" ? 0 : this.units === "audioRange" ? -1 : this.units === "decibels" ? -1 / 0 : this._param.minValue;
  }
  get maxValue() {
    return Z(this._maxValue) ? this._maxValue : this.units === "normalRange" || this.units === "audioRange" ? 1 : this._param.maxValue;
  }
  _is(e, t) {
    return this.units === t;
  }
  _assertRange(e) {
    return Z(this.maxValue) && Z(this.minValue) && yt(e, this._fromType(this.minValue), this._fromType(this.maxValue)), e;
  }
  _fromType(e) {
    return this.convert && !this.overridden ? this._is(e, "time") ? this.toSeconds(e) : this._is(e, "decibels") ? Hi(e) : this._is(e, "frequency") ? this.toFrequency(e) : e : this.overridden ? 0 : e;
  }
  _toType(e) {
    return this.convert && this.units === "decibels" ? Qi(e) : e;
  }
  setValueAtTime(e, t) {
    const n = this.toSeconds(t), r = this._fromType(e);
    return G(isFinite(r) && isFinite(n), `Invalid argument(s) to setValueAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._assertRange(r), this.log(this.units, "setValueAtTime", e, n), this._events.add({
      time: n,
      type: "setValueAtTime",
      value: r
    }), this._param.setValueAtTime(r, n), this;
  }
  getValueAtTime(e) {
    const t = Math.max(this.toSeconds(e), 0), n = this._events.getAfter(t), r = this._events.get(t);
    let i = this._initialValue;
    if (r === null) i = this._initialValue;
    else if (r.type === "setTargetAtTime" && (n === null || n.type === "setValueAtTime")) {
      const o = this._events.getBefore(r.time);
      let a;
      o === null ? a = this._initialValue : a = o.value, r.type === "setTargetAtTime" && (i = this._exponentialApproach(r.time, a, r.value, r.constant, t));
    } else if (n === null) i = r.value;
    else if (n.type === "linearRampToValueAtTime" || n.type === "exponentialRampToValueAtTime") {
      let o = r.value;
      if (r.type === "setTargetAtTime") {
        const a = this._events.getBefore(r.time);
        a === null ? o = this._initialValue : o = a.value;
      }
      n.type === "linearRampToValueAtTime" ? i = this._linearInterpolate(r.time, o, n.time, n.value, t) : i = this._exponentialInterpolate(r.time, o, n.time, n.value, t);
    } else i = r.value;
    return this._toType(i);
  }
  setRampPoint(e) {
    e = this.toSeconds(e);
    let t = this.getValueAtTime(e);
    return this.cancelAndHoldAtTime(e), this._fromType(t) === 0 && (t = this._toType(this._minOutput)), this.setValueAtTime(t, e), this;
  }
  linearRampToValueAtTime(e, t) {
    const n = this._fromType(e), r = this.toSeconds(t);
    return G(isFinite(n) && isFinite(r), `Invalid argument(s) to linearRampToValueAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._assertRange(n), this._events.add({
      time: r,
      type: "linearRampToValueAtTime",
      value: n
    }), this.log(this.units, "linearRampToValueAtTime", e, r), this._param.linearRampToValueAtTime(n, r), this;
  }
  exponentialRampToValueAtTime(e, t) {
    let n = this._fromType(e);
    n = Ie(n, 0) ? this._minOutput : n, this._assertRange(n);
    const r = this.toSeconds(t);
    return G(isFinite(n) && isFinite(r), `Invalid argument(s) to exponentialRampToValueAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._events.add({
      time: r,
      type: "exponentialRampToValueAtTime",
      value: n
    }), this.log(this.units, "exponentialRampToValueAtTime", e, r), this._param.exponentialRampToValueAtTime(n, r), this;
  }
  exponentialRampTo(e, t, n) {
    return n = this.toSeconds(n), this.setRampPoint(n), this.exponentialRampToValueAtTime(e, n + this.toSeconds(t)), this;
  }
  linearRampTo(e, t, n) {
    return n = this.toSeconds(n), this.setRampPoint(n), this.linearRampToValueAtTime(e, n + this.toSeconds(t)), this;
  }
  targetRampTo(e, t, n) {
    return n = this.toSeconds(n), this.setRampPoint(n), this.exponentialApproachValueAtTime(e, n, t), this;
  }
  exponentialApproachValueAtTime(e, t, n) {
    t = this.toSeconds(t), n = this.toSeconds(n);
    const r = Math.log(n + 1) / Math.log(200);
    return this.setTargetAtTime(e, t, r), this.cancelAndHoldAtTime(t + n * 0.9), this.linearRampToValueAtTime(e, t + n), this;
  }
  setTargetAtTime(e, t, n) {
    const r = this._fromType(e);
    G(isFinite(n) && n > 0, "timeConstant must be a number greater than 0");
    const i = this.toSeconds(t);
    return this._assertRange(r), G(isFinite(r) && isFinite(i), `Invalid argument(s) to setTargetAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._events.add({
      constant: n,
      time: i,
      type: "setTargetAtTime",
      value: r
    }), this.log(this.units, "setTargetAtTime", e, i, n), this._param.setTargetAtTime(r, i, n), this;
  }
  setValueCurveAtTime(e, t, n, r = 1) {
    n = this.toSeconds(n), t = this.toSeconds(t);
    const i = this._fromType(e[0]) * r;
    this.setValueAtTime(this._toType(i), t);
    const o = n / (e.length - 1);
    for (let a = 1; a < e.length; a++) {
      const c = this._fromType(e[a]) * r;
      this.linearRampToValueAtTime(this._toType(c), t + a * o);
    }
    return this;
  }
  cancelScheduledValues(e) {
    const t = this.toSeconds(e);
    return G(isFinite(t), `Invalid argument to cancelScheduledValues: ${JSON.stringify(e)}`), this._events.cancel(t), this._param.cancelScheduledValues(t), this.log(this.units, "cancelScheduledValues", t), this;
  }
  cancelAndHoldAtTime(e) {
    const t = this.toSeconds(e), n = this._fromType(this.getValueAtTime(t));
    G(isFinite(t), `Invalid argument to cancelAndHoldAtTime: ${JSON.stringify(e)}`), this.log(this.units, "cancelAndHoldAtTime", t, "value=" + n);
    const r = this._events.get(t), i = this._events.getAfter(t);
    return r && Ie(r.time, t) ? i ? (this._param.cancelScheduledValues(i.time), this._events.cancel(i.time)) : (this._param.cancelAndHoldAtTime(t), this._events.cancel(t + this.sampleTime)) : i && (this._param.cancelScheduledValues(i.time), this._events.cancel(i.time), i.type === "linearRampToValueAtTime" ? this.linearRampToValueAtTime(this._toType(n), t) : i.type === "exponentialRampToValueAtTime" && this.exponentialRampToValueAtTime(this._toType(n), t)), this._events.add({
      time: t,
      type: "setValueAtTime",
      value: n
    }), this._param.setValueAtTime(n, t), this;
  }
  rampTo(e, t = 0.1, n) {
    return this.units === "frequency" || this.units === "bpm" || this.units === "decibels" ? this.exponentialRampTo(e, t, n) : this.linearRampTo(e, t, n), this;
  }
  apply(e) {
    const t = this.context.currentTime;
    e.setValueAtTime(this.getValueAtTime(t), t);
    const n = this._events.get(t);
    if (n && n.type === "setTargetAtTime") {
      const r = this._events.getAfter(n.time), i = r ? r.time : t + 2, o = (i - t) / 10;
      for (let a = t; a < i; a += o) e.linearRampToValueAtTime(this.getValueAtTime(a), a);
    }
    return this._events.forEachAfter(this.context.currentTime, (r) => {
      r.type === "cancelScheduledValues" ? e.cancelScheduledValues(r.time) : r.type === "setTargetAtTime" ? e.setTargetAtTime(r.value, r.time, r.constant) : e[r.type](r.value, r.time);
    }), this;
  }
  setParam(e) {
    G(this._swappable, "The Param must be assigned as 'swappable' in the constructor");
    const t = this.input;
    return t.disconnect(this._param), this.apply(e), this._param = e, t.connect(this._param), this;
  }
  dispose() {
    return super.dispose(), this._events.dispose(), this;
  }
  get defaultValue() {
    return this._toType(this._param.defaultValue);
  }
  _exponentialApproach(e, t, n, r, i) {
    return n + (t - n) * Math.exp(-(i - e) / r);
  }
  _linearInterpolate(e, t, n, r, i) {
    return t + (r - t) * ((i - e) / (n - e));
  }
  _exponentialInterpolate(e, t, n, r, i) {
    return t * Math.pow(r / t, (i - e) / (n - e));
  }
}, $ = class an extends Ze {
  constructor() {
    super(...arguments), this._internalChannels = [];
  }
  get numberOfInputs() {
    return Z(this.input) ? pt(this.input) || this.input instanceof ue ? 1 : this.input.numberOfInputs : 0;
  }
  get numberOfOutputs() {
    return Z(this.output) ? this.output.numberOfOutputs : 0;
  }
  _isAudioNode(e) {
    return Z(e) && (e instanceof an || Ke(e));
  }
  _getInternalNodes() {
    const e = this._internalChannels.slice(0);
    return this._isAudioNode(this.input) && e.push(this.input), this._isAudioNode(this.output) && this.input !== this.output && e.push(this.output), e;
  }
  _setChannelProperties(e) {
    this._getInternalNodes().forEach((t) => {
      t.channelCount = e.channelCount, t.channelCountMode = e.channelCountMode, t.channelInterpretation = e.channelInterpretation;
    });
  }
  _getChannelProperties() {
    const e = this._getInternalNodes();
    G(e.length > 0, "ToneAudioNode does not have any internal nodes");
    const t = e[0];
    return {
      channelCount: t.channelCount,
      channelCountMode: t.channelCountMode,
      channelInterpretation: t.channelInterpretation
    };
  }
  get channelCount() {
    return this._getChannelProperties().channelCount;
  }
  set channelCount(e) {
    const t = this._getChannelProperties();
    this._setChannelProperties(Object.assign(t, { channelCount: e }));
  }
  get channelCountMode() {
    return this._getChannelProperties().channelCountMode;
  }
  set channelCountMode(e) {
    const t = this._getChannelProperties();
    this._setChannelProperties(Object.assign(t, { channelCountMode: e }));
  }
  get channelInterpretation() {
    return this._getChannelProperties().channelInterpretation;
  }
  set channelInterpretation(e) {
    const t = this._getChannelProperties();
    this._setChannelProperties(Object.assign(t, { channelInterpretation: e }));
  }
  connect(e, t = 0, n = 0) {
    return rt(this, e, t, n), this;
  }
  toDestination() {
    return this.connect(this.context.destination), this;
  }
  toMaster() {
    return Sn("toMaster() has been renamed toDestination()"), this.toDestination();
  }
  disconnect(e, t = 0, n = 0) {
    return lh(this, e, t, n), this;
  }
  chain(...e) {
    return Bt(this, ...e), this;
  }
  fan(...e) {
    return e.forEach((t) => this.connect(t)), this;
  }
  dispose() {
    return super.dispose(), Z(this.input) && (this.input instanceof an ? this.input.dispose() : Ke(this.input) && this.input.disconnect()), Z(this.output) && (this.output instanceof an ? this.output.dispose() : Ke(this.output) && this.output.disconnect()), this._internalChannels = [], this;
  }
};
function Bt(...s) {
  const e = s.shift();
  s.reduce((t, n) => (t instanceof $ ? t.connect(n) : Ke(t) && rt(t, n), n), e);
}
function rt(s, e, t = 0, n = 0) {
  for (G(Z(s), "Cannot connect from undefined node"), G(Z(e), "Cannot connect to undefined node"), (e instanceof $ || Ke(e)) && G(e.numberOfInputs > 0, "Cannot connect to node with no inputs"), G(s.numberOfOutputs > 0, "Cannot connect from node with no outputs"); e instanceof $ || e instanceof ue; ) Z(e.input) && (e = e.input);
  for (; s instanceof $; ) Z(s.output) && (s = s.output);
  pt(e) ? s.connect(e, t) : s.connect(e, t, n);
}
function lh(s, e, t = 0, n = 0) {
  if (Z(e)) for (; e instanceof $; ) e = e.input;
  for (; !Ke(s); ) Z(s.output) && (s = s.output);
  pt(e) ? s.disconnect(e, t) : Ke(e) ? s.disconnect(e, t, n) : s.disconnect();
}
var uh = class Pn extends $ {
  constructor() {
    super(M(Pn.getDefaults(), arguments, ["delayTime", "maxDelay"])), this.name = "Delay";
    const e = M(Pn.getDefaults(), arguments, ["delayTime", "maxDelay"]), t = this.toSeconds(e.maxDelay);
    this._maxDelay = Math.max(t, this.toSeconds(e.delayTime)), this._delayNode = this.input = this.output = this.context.createDelay(t), this.delayTime = new ue({
      context: this.context,
      param: this._delayNode.delayTime,
      units: "time",
      value: e.delayTime,
      minValue: 0,
      maxValue: this.maxDelay
    }), Y(this, "delayTime");
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      delayTime: 0,
      maxDelay: 1
    });
  }
  get maxDelay() {
    return this._maxDelay;
  }
  dispose() {
    return super.dispose(), this._delayNode.disconnect(), this.delayTime.dispose(), this;
  }
}, oe = class Fn extends $ {
  constructor() {
    super(M(Fn.getDefaults(), arguments, ["gain", "units"])), this.name = "Gain", this._gainNode = this.context.createGain(), this.input = this._gainNode, this.output = this._gainNode;
    const e = M(Fn.getDefaults(), arguments, ["gain", "units"]);
    this.gain = new ue({
      context: this.context,
      convert: e.convert,
      param: this._gainNode.gain,
      units: e.units,
      value: e.gain,
      minValue: e.minValue,
      maxValue: e.maxValue
    }), Y(this, "gain");
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      convert: !0,
      gain: 1,
      units: "gain"
    });
  }
  dispose() {
    return super.dispose(), this._gainNode.disconnect(), this.gain.dispose(), this;
  }
}, Nt = class extends $ {
  constructor(s) {
    super(s), this.onended = le, this._startTime = -1, this._stopTime = -1, this._timeout = -1, this.output = new oe({
      context: this.context,
      gain: 0
    }), this._gainNode = this.output, this.getStateAtTime = function(e) {
      const t = this.toSeconds(e);
      return this._startTime !== -1 && t >= this._startTime && (this._stopTime === -1 || t <= this._stopTime) ? "started" : "stopped";
    }, this._fadeIn = s.fadeIn, this._fadeOut = s.fadeOut, this._curve = s.curve, this.onended = s.onended;
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      curve: "linear",
      fadeIn: 0,
      fadeOut: 0,
      onended: le
    });
  }
  _startGain(s, e = 1) {
    G(this._startTime === -1, "Source cannot be started more than once");
    const t = this.toSeconds(this._fadeIn);
    return this._startTime = s + t, this._startTime = Math.max(this._startTime, this.context.currentTime), t > 0 ? (this._gainNode.gain.setValueAtTime(0, s), this._curve === "linear" ? this._gainNode.gain.linearRampToValueAtTime(e, s + t) : this._gainNode.gain.exponentialApproachValueAtTime(e, s, t)) : this._gainNode.gain.setValueAtTime(e, s), this;
  }
  stop(s) {
    return this.log("stop", s), this._stopGain(this.toSeconds(s)), this;
  }
  _stopGain(s) {
    G(this._startTime !== -1, "'start' must be called before 'stop'"), this.cancelStop();
    const e = this.toSeconds(this._fadeOut);
    return this._stopTime = this.toSeconds(s) + e, this._stopTime = Math.max(this._stopTime, this.now()), e > 0 ? this._curve === "linear" ? this._gainNode.gain.linearRampTo(0, e, s) : this._gainNode.gain.targetRampTo(0, e, s) : (this._gainNode.gain.cancelAndHoldAtTime(s), this._gainNode.gain.setValueAtTime(0, s)), this.context.clearTimeout(this._timeout), this._timeout = this.context.setTimeout(() => {
      const t = this._curve === "exponential" ? e * 2 : 0;
      this._stopSource(this.now() + t), this._onended();
    }, this._stopTime - this.context.currentTime), this;
  }
  _onended() {
    if (this.onended !== le && (this.onended(this), this.onended = le, !this.context.isOffline)) {
      const s = () => this.dispose();
      typeof window.requestIdleCallback < "u" ? window.requestIdleCallback(s) : setTimeout(s, 1e3);
    }
  }
  get state() {
    return this.getStateAtTime(this.now());
  }
  cancelStop() {
    return this.log("cancelStop"), G(this._startTime !== -1, "Source is not started"), this._gainNode.gain.cancelScheduledValues(this._startTime + this.sampleTime), this.context.clearTimeout(this._timeout), this._stopTime = -1, this;
  }
  dispose() {
    return super.dispose(), this._gainNode.dispose(), this.onended = le, this;
  }
}, hh = class qn extends Nt {
  constructor() {
    super(M(qn.getDefaults(), arguments, ["offset"])), this.name = "ToneConstantSource", this._source = this.context.createConstantSource();
    const e = M(qn.getDefaults(), arguments, ["offset"]);
    rt(this._source, this._gainNode), this.offset = new ue({
      context: this.context,
      convert: e.convert,
      param: this._source.offset,
      units: e.units,
      value: e.offset,
      minValue: e.minValue,
      maxValue: e.maxValue
    });
  }
  static getDefaults() {
    return Object.assign(Nt.getDefaults(), {
      convert: !0,
      offset: 1,
      units: "number"
    });
  }
  start(e) {
    const t = this.toSeconds(e);
    return this.log("start", t), this._startGain(t), this._source.start(t), this;
  }
  _stopSource(e) {
    this._source.stop(e);
  }
  dispose() {
    return super.dispose(), this.state === "started" && this.stop(), this._source.disconnect(), this.offset.dispose(), this;
  }
}, ee = class Ln extends $ {
  constructor() {
    super(M(Ln.getDefaults(), arguments, ["value", "units"])), this.name = "Signal", this.override = !0;
    const e = M(Ln.getDefaults(), arguments, ["value", "units"]);
    this.output = this._constantSource = new hh({
      context: this.context,
      convert: e.convert,
      offset: e.value,
      units: e.units,
      minValue: e.minValue,
      maxValue: e.maxValue
    }), this._constantSource.start(0), this.input = this._param = this._constantSource.offset;
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      convert: !0,
      units: "number",
      value: 0
    });
  }
  connect(e, t = 0, n = 0) {
    return Hs(this, e, t, n), this;
  }
  dispose() {
    return super.dispose(), this._param.dispose(), this._constantSource.dispose(), this;
  }
  setValueAtTime(e, t) {
    return this._param.setValueAtTime(e, t), this;
  }
  getValueAtTime(e) {
    return this._param.getValueAtTime(e);
  }
  setRampPoint(e) {
    return this._param.setRampPoint(e), this;
  }
  linearRampToValueAtTime(e, t) {
    return this._param.linearRampToValueAtTime(e, t), this;
  }
  exponentialRampToValueAtTime(e, t) {
    return this._param.exponentialRampToValueAtTime(e, t), this;
  }
  exponentialRampTo(e, t, n) {
    return this._param.exponentialRampTo(e, t, n), this;
  }
  linearRampTo(e, t, n) {
    return this._param.linearRampTo(e, t, n), this;
  }
  targetRampTo(e, t, n) {
    return this._param.targetRampTo(e, t, n), this;
  }
  exponentialApproachValueAtTime(e, t, n) {
    return this._param.exponentialApproachValueAtTime(e, t, n), this;
  }
  setTargetAtTime(e, t, n) {
    return this._param.setTargetAtTime(e, t, n), this;
  }
  setValueCurveAtTime(e, t, n, r) {
    return this._param.setValueCurveAtTime(e, t, n, r), this;
  }
  cancelScheduledValues(e) {
    return this._param.cancelScheduledValues(e), this;
  }
  cancelAndHoldAtTime(e) {
    return this._param.cancelAndHoldAtTime(e), this;
  }
  rampTo(e, t, n) {
    return this._param.rampTo(e, t, n), this;
  }
  get value() {
    return this._param.value;
  }
  set value(e) {
    this._param.value = e;
  }
  get convert() {
    return this._param.convert;
  }
  set convert(e) {
    this._param.convert = e;
  }
  get units() {
    return this._param.units;
  }
  get overridden() {
    return this._param.overridden;
  }
  set overridden(e) {
    this._param.overridden = e;
  }
  get maxValue() {
    return this._param.maxValue;
  }
  get minValue() {
    return this._param.minValue;
  }
  apply(e) {
    return this._param.apply(e), this;
  }
};
function Hs(s, e, t, n) {
  (e instanceof ue || pt(e) || e instanceof ee && e.override) && (e.cancelScheduledValues(0), e.setValueAtTime(0, 0), e instanceof ee && (e.overridden = !0)), rt(s, e, t, n);
}
var _t = class Ei extends $ {
  constructor() {
    super(Object.assign(M(Ei.getDefaults(), arguments, ["context"])));
  }
  connect(e, t = 0, n = 0) {
    return Hs(this, e, t, n), this;
  }
}, Qt = class Wn extends _t {
  constructor() {
    super(Object.assign(M(Wn.getDefaults(), arguments, ["mapping", "length"]))), this.name = "WaveShaper", this._shaper = this.context.createWaveShaper(), this.input = this._shaper, this.output = this._shaper;
    const e = M(Wn.getDefaults(), arguments, ["mapping", "length"]);
    Le(e.mapping) || e.mapping instanceof Float32Array ? this.curve = Float32Array.from(e.mapping) : Uu(e.mapping) && this.setMap(e.mapping, e.length);
  }
  static getDefaults() {
    return Object.assign(ee.getDefaults(), { length: 1024 });
  }
  setMap(e, t = 1024) {
    const n = new Float32Array(t);
    for (let r = 0, i = t; r < i; r++) n[r] = e(r / (i - 1) * 2 - 1, r);
    return this.curve = n, this;
  }
  get curve() {
    return this._shaper.curve;
  }
  set curve(e) {
    this._shaper.curve = e;
  }
  get oversample() {
    return this._shaper.oversample;
  }
  set oversample(e) {
    G([
      "none",
      "2x",
      "4x"
    ].some((t) => t.includes(e)), "oversampling must be either 'none', '2x', or '4x'"), this._shaper.oversample = e;
  }
  dispose() {
    return super.dispose(), this._shaper.disconnect(), this;
  }
}, dh = class extends _t {
  constructor() {
    super(...arguments), this.name = "GainToAudio", this._norm = new Qt({
      context: this.context,
      mapping: (s) => Math.abs(s) * 2 - 1
    }), this.input = this._norm, this.output = this._norm;
  }
  dispose() {
    return super.dispose(), this._norm.dispose(), this;
  }
}, ph = class jn extends $ {
  constructor() {
    super(Object.assign(M(jn.getDefaults(), arguments, ["fade"]))), this.name = "CrossFade", this._panner = this.context.createStereoPanner(), this._split = this.context.createChannelSplitter(2), this._g2a = new dh({ context: this.context }), this.a = new oe({
      context: this.context,
      gain: 0
    }), this.b = new oe({
      context: this.context,
      gain: 0
    }), this.output = new oe({ context: this.context }), this._internalChannels = [this.a, this.b];
    const e = M(jn.getDefaults(), arguments, ["fade"]);
    this.fade = new ee({
      context: this.context,
      units: "normalRange",
      value: e.fade
    }), Y(this, "fade"), this.context.getConstant(1).connect(this._panner), this._panner.connect(this._split), this._panner.channelCount = 1, this._panner.channelCountMode = "explicit", rt(this._split, this.a.gain, 0), rt(this._split, this.b.gain, 1), this.fade.chain(this._g2a, this._panner.pan), this.a.connect(this.output), this.b.connect(this.output);
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), { fade: 0.5 });
  }
  dispose() {
    return super.dispose(), this.a.dispose(), this.b.dispose(), this.output.dispose(), this.fade.dispose(), this._g2a.dispose(), this._panner.disconnect(), this._split.disconnect(), this;
  }
}, gn = class extends $ {
  constructor(s) {
    super(s), this.name = "Effect", this._dryWet = new ph({ context: this.context }), this.wet = this._dryWet.fade, this.effectSend = new oe({ context: this.context }), this.effectReturn = new oe({ context: this.context }), this.input = new oe({ context: this.context }), this.output = this._dryWet, this.input.fan(this._dryWet.a, this.effectSend), this.effectReturn.connect(this._dryWet.b), this.wet.setValueAtTime(s.wet, 0), this._internalChannels = [this.effectReturn, this.effectSend], Y(this, "wet");
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), { wet: 1 });
  }
  connectEffect(s) {
    return this._internalChannels.push(s), this.effectSend.chain(s, this.effectReturn), this;
  }
  dispose() {
    return super.dispose(), this._dryWet.dispose(), this.effectSend.dispose(), this.effectReturn.dispose(), this.wet.dispose(), this;
  }
}, Cr = class extends gn {
  constructor(s) {
    super(s), this.name = "FeedbackEffect", this._feedbackGain = new oe({
      context: this.context,
      gain: s.feedback,
      units: "normalRange"
    }), this.feedback = this._feedbackGain.gain, Y(this, "feedback"), this.effectReturn.chain(this._feedbackGain, this.effectSend);
  }
  static getDefaults() {
    return Object.assign(gn.getDefaults(), { feedback: 0.125 });
  }
  dispose() {
    return super.dispose(), this._feedbackGain.dispose(), this.feedback.dispose(), this;
  }
}, ad = class Bn extends Cr {
  constructor() {
    super(M(Bn.getDefaults(), arguments, ["delayTime", "feedback"])), this.name = "FeedbackDelay";
    const e = M(Bn.getDefaults(), arguments, ["delayTime", "feedback"]);
    this._delayNode = new uh({
      context: this.context,
      delayTime: e.delayTime,
      maxDelay: e.maxDelay
    }), this.delayTime = this._delayNode.delayTime, this.connectEffect(this._delayNode), Y(this, "delayTime");
  }
  static getDefaults() {
    return Object.assign(Cr.getDefaults(), {
      delayTime: 0.25,
      maxDelay: 1
    });
  }
  dispose() {
    return super.dispose(), this._delayNode.dispose(), this.delayTime.dispose(), this;
  }
}, od = class Un extends gn {
  constructor() {
    super(M(Un.getDefaults(), arguments, ["distortion"])), this.name = "Distortion";
    const e = M(Un.getDefaults(), arguments, ["distortion"]);
    this._shaper = new Qt({
      context: this.context,
      length: 4096
    }), this._distortion = e.distortion, this.connectEffect(this._shaper), this.distortion = e.distortion, this.oversample = e.oversample;
  }
  static getDefaults() {
    return Object.assign(gn.getDefaults(), {
      distortion: 0.4,
      oversample: "none"
    });
  }
  get distortion() {
    return this._distortion;
  }
  set distortion(e) {
    this._distortion = e;
    const t = e * 100, n = Math.PI / 180;
    this._shaper.setMap((r) => Math.abs(r) < 1e-3 ? 0 : (3 + t) * r * 20 * n / (Math.PI + t * Math.abs(r)));
  }
  get oversample() {
    return this._shaper.oversample;
  }
  set oversample(e) {
    this._shaper.oversample = e;
  }
  dispose() {
    return super.dispose(), this._shaper.dispose(), this;
  }
};
function Ii(s, e = 1 / 0) {
  const t = /* @__PURE__ */ new WeakMap();
  return function(n, r) {
    Reflect.defineProperty(n, r, {
      configurable: !0,
      enumerable: !0,
      get: function() {
        return t.get(this);
      },
      set: function(i) {
        yt(i, s, e), t.set(this, i);
      }
    });
  };
}
function Yt(s, e = 1 / 0) {
  const t = /* @__PURE__ */ new WeakMap();
  return function(n, r) {
    Reflect.defineProperty(n, r, {
      configurable: !0,
      enumerable: !0,
      get: function() {
        return t.get(this);
      },
      set: function(i) {
        yt(this.toSeconds(i), s, e), t.set(this, i);
      }
    });
  };
}
var Ne = class Gn extends $ {
  constructor() {
    super(M(Gn.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ])), this.name = "Envelope", this._sig = new ee({
      context: this.context,
      value: 0
    }), this.output = this._sig, this.input = void 0;
    const e = M(Gn.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ]);
    this.attack = e.attack, this.decay = e.decay, this.sustain = e.sustain, this.release = e.release, this.attackCurve = e.attackCurve, this.releaseCurve = e.releaseCurve, this.decayCurve = e.decayCurve;
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      attack: 0.01,
      attackCurve: "linear",
      decay: 0.1,
      decayCurve: "exponential",
      release: 1,
      releaseCurve: "exponential",
      sustain: 0.5
    });
  }
  get value() {
    return this.getValueAtTime(this.now());
  }
  _getCurve(e, t) {
    if (mt(e)) return e;
    {
      let n;
      for (n in Kt) if (Kt[n][t] === e) return n;
      return e;
    }
  }
  _setCurve(e, t, n) {
    if (mt(n) && Reflect.has(Kt, n)) {
      const r = Kt[n];
      lt(r) ? e !== "_decayCurve" && (this[e] = r[t]) : this[e] = r;
    } else if (Le(n) && e !== "_decayCurve") this[e] = n;
    else throw new Error("Envelope: invalid curve: " + n);
  }
  get attackCurve() {
    return this._getCurve(this._attackCurve, "In");
  }
  set attackCurve(e) {
    this._setCurve("_attackCurve", "In", e);
  }
  get releaseCurve() {
    return this._getCurve(this._releaseCurve, "Out");
  }
  set releaseCurve(e) {
    this._setCurve("_releaseCurve", "Out", e);
  }
  get decayCurve() {
    return this._getCurve(this._decayCurve, "Out");
  }
  set decayCurve(e) {
    this._setCurve("_decayCurve", "Out", e);
  }
  triggerAttack(e, t = 1) {
    this.log("triggerAttack", e, t), e = this.toSeconds(e);
    let n = this.toSeconds(this.attack);
    const r = this.toSeconds(this.decay), i = this.getValueAtTime(e);
    if (i > 0) {
      const o = 1 / n;
      n = (1 - i) / o;
    }
    if (n < this.sampleTime)
      this._sig.cancelScheduledValues(e), this._sig.setValueAtTime(t, e);
    else if (this._attackCurve === "linear") this._sig.linearRampTo(t, n, e);
    else if (this._attackCurve === "exponential") this._sig.targetRampTo(t, n, e);
    else {
      this._sig.cancelAndHoldAtTime(e);
      let o = this._attackCurve;
      for (let a = 1; a < o.length; a++) if (o[a - 1] <= i && i <= o[a]) {
        o = this._attackCurve.slice(a), o[0] = i;
        break;
      }
      this._sig.setValueCurveAtTime(o, e, n, t);
    }
    if (r && this.sustain < 1) {
      const o = t * this.sustain, a = e + n;
      this.log("decay", a), this._decayCurve === "linear" ? this._sig.linearRampToValueAtTime(o, r + a) : this._sig.exponentialApproachValueAtTime(o, a, r);
    }
    return this;
  }
  triggerRelease(e) {
    this.log("triggerRelease", e), e = this.toSeconds(e);
    const t = this.getValueAtTime(e);
    if (t > 0) {
      const n = this.toSeconds(this.release);
      n < this.sampleTime ? this._sig.setValueAtTime(0, e) : this._releaseCurve === "linear" ? this._sig.linearRampTo(0, n, e) : this._releaseCurve === "exponential" ? this._sig.targetRampTo(0, n, e) : (G(Le(this._releaseCurve), "releaseCurve must be either 'linear', 'exponential' or an array"), this._sig.cancelAndHoldAtTime(e), this._sig.setValueCurveAtTime(this._releaseCurve, e, n, t));
    }
    return this;
  }
  getValueAtTime(e) {
    return this._sig.getValueAtTime(e);
  }
  triggerAttackRelease(e, t, n = 1) {
    return t = this.toSeconds(t), this.triggerAttack(t, n), this.triggerRelease(t + this.toSeconds(e)), this;
  }
  cancel(e) {
    return this._sig.cancelScheduledValues(this.toSeconds(e)), this;
  }
  connect(e, t = 0, n = 0) {
    return Hs(this, e, t, n), this;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      const t = e / this.context.sampleRate, n = new Xs(1, t, this.context.sampleRate), r = this.toSeconds(this.attack) + this.toSeconds(this.decay), i = r + this.toSeconds(this.release), o = i * 0.1, a = i + o, c = new this.constructor(Object.assign(this.get(), {
        attack: t * this.toSeconds(this.attack) / a,
        decay: t * this.toSeconds(this.decay) / a,
        release: t * this.toSeconds(this.release) / a,
        context: n
      }));
      return c._sig.toDestination(), c.triggerAttackRelease(t * (r + o) / a, 0), (yield n.render()).getChannelData(0);
    });
  }
  dispose() {
    return super.dispose(), this._sig.dispose(), this;
  }
};
Tt([Yt(0)], Ne.prototype, "attack", void 0);
Tt([Yt(0)], Ne.prototype, "decay", void 0);
Tt([Ii(0, 1)], Ne.prototype, "sustain", void 0);
Tt([Yt(0)], Ne.prototype, "release", void 0);
var Kt = (() => {
  let e, t;
  const n = [];
  for (e = 0; e < 128; e++) n[e] = Math.sin(e / 127 * (Math.PI / 2));
  const r = [], i = 6.4;
  for (e = 0; e < 127; e++)
    t = e / 127, r[e] = (Math.sin(t * (Math.PI * 2) * i - Math.PI / 2) + 1) / 10 + t * 0.83;
  r[127] = 1;
  const o = [], a = 5;
  for (e = 0; e < 128; e++) o[e] = Math.ceil(e / 127 * a) / a;
  const c = [];
  for (e = 0; e < 128; e++)
    t = e / 127, c[e] = 0.5 * (1 - Math.cos(Math.PI * t));
  const l = [];
  for (e = 0; e < 128; e++) {
    t = e / 127;
    const d = Math.pow(t, 3) * 4 + 0.2, f = Math.cos(d * Math.PI * 2 * t);
    l[e] = Math.abs(f * (1 - t));
  }
  function u(d) {
    const f = new Array(d.length);
    for (let p = 0; p < d.length; p++) f[p] = 1 - d[p];
    return f;
  }
  function h(d) {
    return d.slice(0).reverse();
  }
  return {
    bounce: {
      In: u(l),
      Out: l
    },
    cosine: {
      In: n,
      Out: h(n)
    },
    exponential: "exponential",
    linear: "linear",
    ripple: {
      In: r,
      Out: u(r)
    },
    sine: {
      In: c,
      Out: u(c)
    },
    step: {
      In: o,
      Out: u(o)
    }
  };
})(), xr = class zn extends $ {
  constructor() {
    super(M(zn.getDefaults(), arguments, ["frequency", "type"])), this.name = "BiquadFilter";
    const e = M(zn.getDefaults(), arguments, ["frequency", "type"]);
    this._filter = this.context.createBiquadFilter(), this.input = this.output = this._filter, this.Q = new ue({
      context: this.context,
      units: "number",
      value: e.Q,
      param: this._filter.Q
    }), this.frequency = new ue({
      context: this.context,
      units: "frequency",
      value: e.frequency,
      param: this._filter.frequency
    }), this.detune = new ue({
      context: this.context,
      units: "cents",
      value: e.detune,
      param: this._filter.detune
    }), this.gain = new ue({
      context: this.context,
      units: "decibels",
      convert: !1,
      value: e.gain,
      param: this._filter.gain
    }), this.type = e.type;
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      Q: 1,
      type: "lowpass",
      frequency: 350,
      detune: 0,
      gain: 0
    });
  }
  get type() {
    return this._filter.type;
  }
  set type(e) {
    G([
      "lowpass",
      "highpass",
      "bandpass",
      "lowshelf",
      "highshelf",
      "notch",
      "allpass",
      "peaking"
    ].indexOf(e) !== -1, `Invalid filter type: ${e}`), this._filter.type = e;
  }
  getFrequencyResponse(e = 128) {
    const t = new Float32Array(e);
    for (let o = 0; o < e; o++) t[o] = Math.pow(o / e, 2) * 19980 + 20;
    const n = new Float32Array(e), r = new Float32Array(e), i = this.context.createBiquadFilter();
    return i.type = this.type, i.Q.value = this.Q.value, i.frequency.value = this.frequency.value, i.gain.value = this.gain.value, i.getFrequencyResponse(t, n, r), n;
  }
  dispose() {
    return super.dispose(), this._filter.disconnect(), this.Q.dispose(), this.frequency.dispose(), this.gain.dispose(), this.detune.dispose(), this;
  }
}, $n = class Zn extends $ {
  constructor() {
    super(M(Zn.getDefaults(), arguments, [
      "frequency",
      "type",
      "rolloff"
    ])), this.name = "Filter", this.input = new oe({ context: this.context }), this.output = new oe({ context: this.context }), this._filters = [];
    const e = M(Zn.getDefaults(), arguments, [
      "frequency",
      "type",
      "rolloff"
    ]);
    this._filters = [], this.Q = new ee({
      context: this.context,
      units: "positive",
      value: e.Q
    }), this.frequency = new ee({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this.detune = new ee({
      context: this.context,
      units: "cents",
      value: e.detune
    }), this.gain = new ee({
      context: this.context,
      units: "decibels",
      convert: !1,
      value: e.gain
    }), this._type = e.type, this.rolloff = e.rolloff, Y(this, [
      "detune",
      "frequency",
      "gain",
      "Q"
    ]);
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      Q: 1,
      detune: 0,
      frequency: 350,
      gain: 0,
      rolloff: -12,
      type: "lowpass"
    });
  }
  get type() {
    return this._type;
  }
  set type(e) {
    G([
      "lowpass",
      "highpass",
      "bandpass",
      "lowshelf",
      "highshelf",
      "notch",
      "allpass",
      "peaking"
    ].indexOf(e) !== -1, `Invalid filter type: ${e}`), this._type = e, this._filters.forEach((t) => t.type = e);
  }
  get rolloff() {
    return this._rolloff;
  }
  set rolloff(e) {
    const t = ft(e) ? e : parseInt(e, 10), n = [
      -12,
      -24,
      -48,
      -96
    ];
    let r = n.indexOf(t);
    G(r !== -1, `rolloff can only be ${n.join(", ")}`), r += 1, this._rolloff = t, this.input.disconnect(), this._filters.forEach((i) => i.disconnect()), this._filters = new Array(r);
    for (let i = 0; i < r; i++) {
      const o = new xr({ context: this.context });
      o.type = this._type, this.frequency.connect(o.frequency), this.detune.connect(o.detune), this.Q.connect(o.Q), this.gain.connect(o.gain), this._filters[i] = o;
    }
    this._internalChannels = this._filters, Bt(this.input, ...this._internalChannels, this.output);
  }
  getFrequencyResponse(e = 128) {
    const t = new xr({
      frequency: this.frequency.value,
      gain: this.gain.value,
      Q: this.Q.value,
      type: this._type,
      detune: this.detune.value
    }), n = new Float32Array(e).map(() => 1);
    return this._filters.forEach(() => {
      t.getFrequencyResponse(e).forEach((r, i) => n[i] *= r);
    }), t.dispose(), n;
  }
  dispose() {
    return super.dispose(), this._filters.forEach((e) => {
      e.dispose();
    }), Zs(this, [
      "detune",
      "frequency",
      "gain",
      "Q"
    ]), this.frequency.dispose(), this.Q.dispose(), this.detune.dispose(), this.gain.dispose(), this;
  }
}, Mt = class Xn extends ee {
  constructor() {
    super(Object.assign(M(Xn.getDefaults(), arguments, ["value"]))), this.name = "Multiply", this.override = !1;
    const e = M(Xn.getDefaults(), arguments, ["value"]);
    this._mult = this.input = this.output = new oe({
      context: this.context,
      minValue: e.minValue,
      maxValue: e.maxValue
    }), this.factor = this._param = this._mult.gain, this.factor.setValueAtTime(e.value, 0);
  }
  static getDefaults() {
    return Object.assign(ee.getDefaults(), { value: 0 });
  }
  dispose() {
    return super.dispose(), this._mult.dispose(), this;
  }
}, fh = class Ri extends ee {
  constructor() {
    super(Object.assign(M(Ri.getDefaults(), arguments, ["value"]))), this.override = !1, this.name = "Add", this._sum = new oe({ context: this.context }), this.input = this._sum, this.output = this._sum, this.addend = this._param, Bt(this._constantSource, this._sum);
  }
  static getDefaults() {
    return Object.assign(ee.getDefaults(), { value: 0 });
  }
  dispose() {
    return super.dispose(), this._sum.dispose(), this;
  }
}, Vi = class Hn extends _t {
  constructor() {
    super(Object.assign(M(Hn.getDefaults(), arguments, ["min", "max"]))), this.name = "Scale";
    const e = M(Hn.getDefaults(), arguments, ["min", "max"]);
    this._mult = this.input = new Mt({
      context: this.context,
      value: e.max - e.min
    }), this._add = this.output = new fh({
      context: this.context,
      value: e.min
    }), this._min = e.min, this._max = e.max, this.input.connect(this.output);
  }
  static getDefaults() {
    return Object.assign(_t.getDefaults(), {
      max: 1,
      min: 0
    });
  }
  get min() {
    return this._min;
  }
  set min(e) {
    this._min = e, this._setRange();
  }
  get max() {
    return this._max;
  }
  set max(e) {
    this._max = e, this._setRange();
  }
  _setRange() {
    this._add.value = this._min, this._mult.value = this._max - this._min;
  }
  dispose() {
    return super.dispose(), this._add.dispose(), this._mult.dispose(), this;
  }
}, Qs = class Qn extends $ {
  constructor() {
    super(M(Qn.getDefaults(), arguments, ["volume"])), this.name = "Volume";
    const e = M(Qn.getDefaults(), arguments, ["volume"]);
    this.input = this.output = new oe({
      context: this.context,
      gain: e.volume,
      units: "decibels"
    }), this.volume = this.output.gain, Y(this, "volume"), this._unmutedVolume = e.volume, this.mute = e.mute;
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      mute: !1,
      volume: 0
    });
  }
  get mute() {
    return this.volume.value === -1 / 0;
  }
  set mute(e) {
    !this.mute && e ? (this._unmutedVolume = this.volume.value, this.volume.value = -1 / 0) : this.mute && !e && (this.volume.value = this._unmutedVolume);
  }
  dispose() {
    return super.dispose(), this.input.dispose(), this.volume.dispose(), this;
  }
}, mh = class Yn extends $ {
  constructor() {
    super(M(Yn.getDefaults(), arguments)), this.name = "Destination", this.input = new Qs({ context: this.context }), this.output = new oe({ context: this.context }), this.volume = this.input.volume;
    const e = M(Yn.getDefaults(), arguments);
    Bt(this.input, this.output, this.context.rawContext.destination), this.mute = e.mute, this._internalChannels = [
      this.input,
      this.context.rawContext.destination,
      this.output
    ];
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      mute: !1,
      volume: 0
    });
  }
  get mute() {
    return this.input.mute;
  }
  set mute(e) {
    this.input.mute = e;
  }
  chain(...e) {
    return this.input.disconnect(), e.unshift(this.input), e.push(this.output), Bt(...e), this;
  }
  get maxChannelCount() {
    return this.context.rawContext.destination.maxChannelCount;
  }
  dispose() {
    return super.dispose(), this.volume.dispose(), this;
  }
};
xi((s) => {
  s.destination = new mh({ context: s });
});
Ai((s) => {
  s.destination.dispose();
});
var _h = class extends it {
  constructor(s) {
    super(), this.name = "TimelineValue", this._timeline = new $e({ memory: 10 }), this._initialValue = s;
  }
  set(s, e) {
    return this._timeline.add({
      value: s,
      time: e
    }), this;
  }
  get(s) {
    const e = this._timeline.get(s);
    return e ? e.value : this._initialValue;
  }
}, Pi = class Jn extends _t {
  constructor() {
    super(Object.assign(M(Jn.getDefaults(), arguments, ["value"]))), this.name = "Pow";
    const e = M(Jn.getDefaults(), arguments, ["value"]);
    this._exponentScaler = this.input = this.output = new Qt({
      context: this.context,
      mapping: this._expFunc(e.value),
      length: 8192
    }), this._exponent = e.value;
  }
  static getDefaults() {
    return Object.assign(_t.getDefaults(), { value: 1 });
  }
  _expFunc(e) {
    return (t) => Math.pow(Math.abs(t), e);
  }
  get value() {
    return this._exponent;
  }
  set value(e) {
    this._exponent = e, this._exponentScaler.setMap(this._expFunc(this._exponent));
  }
  dispose() {
    return super.dispose(), this._exponentScaler.dispose(), this;
  }
}, xt = class extends qt {
  constructor() {
    super(...arguments), this.name = "Ticks", this.defaultUnits = "i";
  }
  _now() {
    return this.context.transport.ticks;
  }
  _beatsToUnits(s) {
    return this._getPPQ() * s;
  }
  _secondsToUnits(s) {
    return Math.floor(s / (60 / this._getBpm()) * this._getPPQ());
  }
  _ticksToUnits(s) {
    return s;
  }
  toTicks() {
    return this.valueOf();
  }
  toSeconds() {
    return this.valueOf() / this._getPPQ() * (60 / this._getBpm());
  }
}, gh = class extends it {
  constructor() {
    super(...arguments), this.name = "IntervalTimeline", this._root = null, this._length = 0;
  }
  add(s) {
    G(Z(s.time), "Events must have a time property"), G(Z(s.duration), "Events must have a duration parameter"), s.time = s.time.valueOf();
    let e = new vh(s.time, s.time + s.duration, s);
    for (this._root === null ? this._root = e : this._root.insert(e), this._length++; e !== null; )
      e.updateHeight(), e.updateMax(), this._rebalance(e), e = e.parent;
    return this;
  }
  remove(s) {
    if (this._root !== null) {
      const e = [];
      this._root.search(s.time, e);
      for (const t of e) if (t.event === s) {
        this._removeNode(t), this._length--;
        break;
      }
    }
    return this;
  }
  get length() {
    return this._length;
  }
  cancel(s) {
    return this.forEachFrom(s, (e) => this.remove(e)), this;
  }
  _setRoot(s) {
    this._root = s, this._root !== null && (this._root.parent = null);
  }
  _replaceNodeInParent(s, e) {
    s.parent !== null ? (s.isLeftChild() ? s.parent.left = e : s.parent.right = e, this._rebalance(s.parent)) : this._setRoot(e);
  }
  _removeNode(s) {
    if (s.left === null && s.right === null) this._replaceNodeInParent(s, null);
    else if (s.right === null) this._replaceNodeInParent(s, s.left);
    else if (s.left === null) this._replaceNodeInParent(s, s.right);
    else {
      const e = s.getBalance();
      let t, n = null;
      if (e > 0) if (s.left.right === null)
        t = s.left, t.right = s.right, n = t;
      else {
        for (t = s.left.right; t.right !== null; ) t = t.right;
        t.parent && (t.parent.right = t.left, n = t.parent, t.left = s.left, t.right = s.right);
      }
      else if (s.right.left === null)
        t = s.right, t.left = s.left, n = t;
      else {
        for (t = s.right.left; t.left !== null; ) t = t.left;
        t.parent && (t.parent.left = t.right, n = t.parent, t.left = s.left, t.right = s.right);
      }
      s.parent !== null ? s.isLeftChild() ? s.parent.left = t : s.parent.right = t : this._setRoot(t), n && this._rebalance(n);
    }
    s.dispose();
  }
  _rotateLeft(s) {
    const e = s.parent, t = s.isLeftChild(), n = s.right;
    n && (s.right = n.left, n.left = s), e !== null ? t ? e.left = n : e.right = n : this._setRoot(n);
  }
  _rotateRight(s) {
    const e = s.parent, t = s.isLeftChild(), n = s.left;
    n && (s.left = n.right, n.right = s), e !== null ? t ? e.left = n : e.right = n : this._setRoot(n);
  }
  _rebalance(s) {
    const e = s.getBalance();
    e > 1 && s.left ? s.left.getBalance() < 0 ? this._rotateLeft(s.left) : this._rotateRight(s) : e < -1 && s.right && (s.right.getBalance() > 0 ? this._rotateRight(s.right) : this._rotateLeft(s));
  }
  get(s) {
    if (this._root !== null) {
      const e = [];
      if (this._root.search(s, e), e.length > 0) {
        let t = e[0];
        for (let n = 1; n < e.length; n++) e[n].low > t.low && (t = e[n]);
        return t.event;
      }
    }
    return null;
  }
  forEach(s) {
    if (this._root !== null) {
      const e = [];
      this._root.traverse((t) => e.push(t)), e.forEach((t) => {
        t.event && s(t.event);
      });
    }
    return this;
  }
  forEachAtTime(s, e) {
    if (this._root !== null) {
      const t = [];
      this._root.search(s, t), t.forEach((n) => {
        n.event && e(n.event);
      });
    }
    return this;
  }
  forEachFrom(s, e) {
    if (this._root !== null) {
      const t = [];
      this._root.searchAfter(s, t), t.forEach((n) => {
        n.event && e(n.event);
      });
    }
    return this;
  }
  dispose() {
    return super.dispose(), this._root !== null && this._root.traverse((s) => s.dispose()), this._root = null, this;
  }
}, vh = class {
  constructor(s, e, t) {
    this._left = null, this._right = null, this.parent = null, this.height = 0, this.event = t, this.low = s, this.high = e, this.max = this.high;
  }
  insert(s) {
    s.low <= this.low ? this.left === null ? this.left = s : this.left.insert(s) : this.right === null ? this.right = s : this.right.insert(s);
  }
  search(s, e) {
    s > this.max || (this.left !== null && this.left.search(s, e), this.low <= s && this.high > s && e.push(this), !(this.low > s) && this.right !== null && this.right.search(s, e));
  }
  searchAfter(s, e) {
    this.low >= s && (e.push(this), this.left !== null && this.left.searchAfter(s, e)), this.right !== null && this.right.searchAfter(s, e);
  }
  traverse(s) {
    s(this), this.left !== null && this.left.traverse(s), this.right !== null && this.right.traverse(s);
  }
  updateHeight() {
    this.left !== null && this.right !== null ? this.height = Math.max(this.left.height, this.right.height) + 1 : this.right !== null ? this.height = this.right.height + 1 : this.left !== null ? this.height = this.left.height + 1 : this.height = 0;
  }
  updateMax() {
    this.max = this.high, this.left !== null && (this.max = Math.max(this.max, this.left.max)), this.right !== null && (this.max = Math.max(this.max, this.right.max));
  }
  getBalance() {
    let s = 0;
    return this.left !== null && this.right !== null ? s = this.left.height - this.right.height : this.left !== null ? s = this.left.height + 1 : this.right !== null && (s = -(this.right.height + 1)), s;
  }
  isLeftChild() {
    return this.parent !== null && this.parent.left === this;
  }
  get left() {
    return this._left;
  }
  set left(s) {
    this._left = s, s !== null && (s.parent = this), this.updateHeight(), this.updateMax();
  }
  get right() {
    return this._right;
  }
  set right(s) {
    this._right = s, s !== null && (s.parent = this), this.updateHeight(), this.updateMax();
  }
  dispose() {
    this.parent = null, this._left = null, this._right = null, this.event = null;
  }
}, Ys = class extends $e {
  constructor(s = "stopped") {
    super(), this.name = "StateTimeline", this._initial = s, this.setStateAtTime(this._initial, 0);
  }
  getValueAtTime(s) {
    const e = this.get(s);
    return e !== null ? e.state : this._initial;
  }
  setStateAtTime(s, e, t) {
    return yt(e, 0), this.add(Object.assign({}, t, {
      state: s,
      time: e
    })), this;
  }
  getLastState(s, e) {
    const t = this._search(e);
    for (let n = t; n >= 0; n--) {
      const r = this._timeline[n];
      if (r.state === s) return r;
    }
  }
  getNextState(s, e) {
    const t = this._search(e);
    if (t !== -1) for (let n = t; n < this._timeline.length; n++) {
      const r = this._timeline[n];
      if (r.state === s) return r;
    }
  }
}, yh = class Kn extends ue {
  constructor() {
    super(M(Kn.getDefaults(), arguments, ["value"])), this.name = "TickParam", this._events = new $e(1 / 0), this._multiplier = 1;
    const e = M(Kn.getDefaults(), arguments, ["value"]);
    this._multiplier = e.multiplier, this._events.cancel(0), this._events.add({
      ticks: 0,
      time: 0,
      type: "setValueAtTime",
      value: this._fromType(e.value)
    }), this.setValueAtTime(e.value, 0);
  }
  static getDefaults() {
    return Object.assign(ue.getDefaults(), {
      multiplier: 1,
      units: "hertz",
      value: 1
    });
  }
  setTargetAtTime(e, t, n) {
    t = this.toSeconds(t), this.setRampPoint(t);
    const r = this._fromType(e), i = this._events.get(t), o = Math.round(Math.max(1 / n, 1));
    for (let a = 0; a <= o; a++) {
      const c = n * a + t, l = this._exponentialApproach(i.time, i.value, r, n, c);
      this.linearRampToValueAtTime(this._toType(l), c);
    }
    return this;
  }
  setValueAtTime(e, t) {
    const n = this.toSeconds(t);
    super.setValueAtTime(e, t);
    const r = this._events.get(n), i = this._events.previousEvent(r), o = this._getTicksUntilEvent(i, n);
    return r.ticks = Math.max(o, 0), this;
  }
  linearRampToValueAtTime(e, t) {
    const n = this.toSeconds(t);
    super.linearRampToValueAtTime(e, t);
    const r = this._events.get(n), i = this._events.previousEvent(r), o = this._getTicksUntilEvent(i, n);
    return r.ticks = Math.max(o, 0), this;
  }
  exponentialRampToValueAtTime(e, t) {
    t = this.toSeconds(t);
    const n = this._fromType(e), r = this._events.get(t), i = Math.round(Math.max((t - r.time) * 10, 1)), o = (t - r.time) / i;
    for (let a = 0; a <= i; a++) {
      const c = o * a + r.time, l = this._exponentialInterpolate(r.time, r.value, t, n, c);
      this.linearRampToValueAtTime(this._toType(l), c);
    }
    return this;
  }
  _getTicksUntilEvent(e, t) {
    if (e === null) e = {
      ticks: 0,
      time: 0,
      type: "setValueAtTime",
      value: 0
    };
    else if (Re(e.ticks)) {
      const o = this._events.previousEvent(e);
      e.ticks = this._getTicksUntilEvent(o, e.time);
    }
    const n = this._fromType(this.getValueAtTime(e.time));
    let r = this._fromType(this.getValueAtTime(t));
    const i = this._events.get(t);
    return i && i.time === t && i.type === "setValueAtTime" && (r = this._fromType(this.getValueAtTime(t - this.sampleTime))), 0.5 * (t - e.time) * (n + r) + e.ticks;
  }
  getTicksAtTime(e) {
    const t = this.toSeconds(e), n = this._events.get(t);
    return Math.max(this._getTicksUntilEvent(n, t), 0);
  }
  getDurationOfTicks(e, t) {
    const n = this.toSeconds(t), r = this.getTicksAtTime(t);
    return this.getTimeOfTick(r + e) - n;
  }
  getTimeOfTick(e) {
    const t = this._events.get(e, "ticks"), n = this._events.getAfter(e, "ticks");
    if (t && t.ticks === e) return t.time;
    if (t && n && n.type === "linearRampToValueAtTime" && t.value !== n.value) {
      const r = this._fromType(this.getValueAtTime(t.time)), i = (this._fromType(this.getValueAtTime(n.time)) - r) / (n.time - t.time), o = Math.sqrt(Math.pow(r, 2) - 2 * i * (t.ticks - e)), a = (-r + o) / i, c = (-r - o) / i;
      return (a > 0 ? a : c) + t.time;
    } else return t ? t.value === 0 ? 1 / 0 : t.time + (e - t.ticks) / t.value : e / this._initialValue;
  }
  ticksToTime(e, t) {
    return this.getDurationOfTicks(e, t);
  }
  timeToTicks(e, t) {
    const n = this.toSeconds(t), r = this.toSeconds(e), i = this.getTicksAtTime(n);
    return this.getTicksAtTime(n + r) - i;
  }
  _fromType(e) {
    return this.units === "bpm" && this.multiplier ? 1 / (60 / e / this.multiplier) : super._fromType(e);
  }
  _toType(e) {
    return this.units === "bpm" && this.multiplier ? e / this.multiplier * 60 : super._toType(e);
  }
  get multiplier() {
    return this._multiplier;
  }
  set multiplier(e) {
    const t = this.value;
    this._multiplier = e, this.cancelScheduledValues(0), this.setValueAtTime(t, 0);
  }
}, Th = class es extends ee {
  constructor() {
    super(M(es.getDefaults(), arguments, ["value"])), this.name = "TickSignal";
    const e = M(es.getDefaults(), arguments, ["value"]);
    this.input = this._param = new yh({
      context: this.context,
      convert: e.convert,
      multiplier: e.multiplier,
      param: this._constantSource.offset,
      units: e.units,
      value: e.value
    });
  }
  static getDefaults() {
    return Object.assign(ee.getDefaults(), {
      multiplier: 1,
      units: "hertz",
      value: 1
    });
  }
  ticksToTime(e, t) {
    return this._param.ticksToTime(e, t);
  }
  timeToTicks(e, t) {
    return this._param.timeToTicks(e, t);
  }
  getTimeOfTick(e) {
    return this._param.getTimeOfTick(e);
  }
  getDurationOfTicks(e, t) {
    return this._param.getDurationOfTicks(e, t);
  }
  getTicksAtTime(e) {
    return this._param.getTicksAtTime(e);
  }
  get multiplier() {
    return this._param.multiplier;
  }
  set multiplier(e) {
    this._param.multiplier = e;
  }
  dispose() {
    return super.dispose(), this._param.dispose(), this;
  }
}, wh = class ts extends Ze {
  constructor() {
    super(M(ts.getDefaults(), arguments, ["frequency"])), this.name = "TickSource", this._state = new Ys(), this._tickOffset = new $e(), this._ticksAtTime = new $e(), this._secondsAtTime = new $e();
    const e = M(ts.getDefaults(), arguments, ["frequency"]);
    this.frequency = new Th({
      context: this.context,
      units: e.units,
      value: e.frequency
    }), Y(this, "frequency"), this._state.setStateAtTime("stopped", 0), this.setTicksAtTime(0, 0);
  }
  static getDefaults() {
    return Object.assign({
      frequency: 1,
      units: "hertz"
    }, Ze.getDefaults());
  }
  get state() {
    return this.getStateAtTime(this.now());
  }
  start(e, t) {
    const n = this.toSeconds(e);
    return this._state.getValueAtTime(n) !== "started" && (this._state.setStateAtTime("started", n), Z(t) && this.setTicksAtTime(t, n), this._ticksAtTime.cancel(n), this._secondsAtTime.cancel(n)), this;
  }
  stop(e) {
    const t = this.toSeconds(e);
    if (this._state.getValueAtTime(t) === "stopped") {
      const n = this._state.get(t);
      n && n.time > 0 && (this._tickOffset.cancel(n.time), this._state.cancel(n.time));
    }
    return this._state.cancel(t), this._state.setStateAtTime("stopped", t), this.setTicksAtTime(0, t), this._ticksAtTime.cancel(t), this._secondsAtTime.cancel(t), this;
  }
  pause(e) {
    const t = this.toSeconds(e);
    return this._state.getValueAtTime(t) === "started" && (this._state.setStateAtTime("paused", t), this._ticksAtTime.cancel(t), this._secondsAtTime.cancel(t)), this;
  }
  cancel(e) {
    return e = this.toSeconds(e), this._state.cancel(e), this._tickOffset.cancel(e), this._ticksAtTime.cancel(e), this._secondsAtTime.cancel(e), this;
  }
  getTicksAtTime(e) {
    const t = this.toSeconds(e), n = this._state.getLastState("stopped", t), r = this._ticksAtTime.get(t), i = {
      state: "paused",
      time: t
    };
    this._state.add(i);
    let o = r || n, a = r ? r.ticks : 0, c = null;
    return this._state.forEachBetween(o.time, t + this.sampleTime, (l) => {
      let u = o.time;
      const h = this._tickOffset.get(l.time);
      h && h.time >= o.time && (a = h.ticks, u = h.time), o.state === "started" && l.state !== "started" && (a += this.frequency.getTicksAtTime(l.time) - this.frequency.getTicksAtTime(u), l.time !== i.time && (c = {
        state: l.state,
        time: l.time,
        ticks: a
      })), o = l;
    }), this._state.remove(i), c && this._ticksAtTime.add(c), a;
  }
  get ticks() {
    return this.getTicksAtTime(this.now());
  }
  set ticks(e) {
    this.setTicksAtTime(e, this.now());
  }
  get seconds() {
    return this.getSecondsAtTime(this.now());
  }
  set seconds(e) {
    const t = this.now(), n = this.frequency.timeToTicks(e, t);
    this.setTicksAtTime(n, t);
  }
  getSecondsAtTime(e) {
    e = this.toSeconds(e);
    const t = this._state.getLastState("stopped", e), n = {
      state: "paused",
      time: e
    };
    this._state.add(n);
    const r = this._secondsAtTime.get(e);
    let i = r || t, o = r ? r.seconds : 0, a = null;
    return this._state.forEachBetween(i.time, e + this.sampleTime, (c) => {
      let l = i.time;
      const u = this._tickOffset.get(c.time);
      u && u.time >= i.time && (o = u.seconds, l = u.time), i.state === "started" && c.state !== "started" && (o += c.time - l, c.time !== n.time && (a = {
        state: c.state,
        time: c.time,
        seconds: o
      })), i = c;
    }), this._state.remove(n), a && this._secondsAtTime.add(a), o;
  }
  setTicksAtTime(e, t) {
    return t = this.toSeconds(t), this._tickOffset.cancel(t), this._tickOffset.add({
      seconds: this.frequency.getDurationOfTicks(e, t),
      ticks: e,
      time: t
    }), this._ticksAtTime.cancel(t), this._secondsAtTime.cancel(t), this;
  }
  getStateAtTime(e) {
    return e = this.toSeconds(e), this._state.getValueAtTime(e);
  }
  getTimeOfTick(e, t = this.now()) {
    const n = this._tickOffset.get(t), r = this._state.get(t), i = Math.max(n.time, r.time), o = this.frequency.getTicksAtTime(i) + e - n.ticks;
    return this.frequency.getTimeOfTick(o);
  }
  forEachTickBetween(e, t, n) {
    let r = this._state.get(e);
    this._state.forEachBetween(e, t, (o) => {
      r && r.state === "started" && o.state !== "started" && this.forEachTickBetween(Math.max(r.time, e), o.time - this.sampleTime, n), r = o;
    });
    let i = null;
    if (r && r.state === "started") {
      const o = Math.max(r.time, e), a = this.frequency.getTicksAtTime(o), c = a - this.frequency.getTicksAtTime(r.time);
      let l = Math.ceil(c) - c;
      l = Ie(l, 1) ? 0 : l;
      let u = this.frequency.getTimeOfTick(a + l);
      for (; u < t; ) {
        try {
          n(u, Math.round(this.getTicksAtTime(u)));
        } catch (h) {
          i = h;
          break;
        }
        u += this.frequency.getDurationOfTicks(1, u);
      }
    }
    if (i) throw i;
    return this;
  }
  dispose() {
    return super.dispose(), this._state.dispose(), this._tickOffset.dispose(), this._ticksAtTime.dispose(), this._secondsAtTime.dispose(), this.frequency.dispose(), this;
  }
}, Fi = class ns extends Ze {
  constructor() {
    super(M(ns.getDefaults(), arguments, ["callback", "frequency"])), this.name = "Clock", this.callback = le, this._lastUpdate = 0, this._state = new Ys("stopped"), this._boundLoop = this._loop.bind(this);
    const e = M(ns.getDefaults(), arguments, ["callback", "frequency"]);
    this.callback = e.callback, this._tickSource = new wh({
      context: this.context,
      frequency: e.frequency,
      units: e.units
    }), this._lastUpdate = 0, this.frequency = this._tickSource.frequency, Y(this, "frequency"), this._state.setStateAtTime("stopped", 0), this.context.on("tick", this._boundLoop);
  }
  static getDefaults() {
    return Object.assign(Ze.getDefaults(), {
      callback: le,
      frequency: 1,
      units: "hertz"
    });
  }
  get state() {
    return this._state.getValueAtTime(this.now());
  }
  start(e, t) {
    yi(this.context);
    const n = this.toSeconds(e);
    return this.log("start", n), this._state.getValueAtTime(n) !== "started" && (this._state.setStateAtTime("started", n), this._tickSource.start(n, t), n < this._lastUpdate && this.emit("start", n, t)), this;
  }
  stop(e) {
    const t = this.toSeconds(e);
    return this.log("stop", t), this._state.cancel(t), this._state.setStateAtTime("stopped", t), this._tickSource.stop(t), t < this._lastUpdate && this.emit("stop", t), this;
  }
  pause(e) {
    const t = this.toSeconds(e);
    return this._state.getValueAtTime(t) === "started" && (this._state.setStateAtTime("paused", t), this._tickSource.pause(t), t < this._lastUpdate && this.emit("pause", t)), this;
  }
  get ticks() {
    return Math.ceil(this.getTicksAtTime(this.now()));
  }
  set ticks(e) {
    this._tickSource.ticks = e;
  }
  get seconds() {
    return this._tickSource.seconds;
  }
  set seconds(e) {
    this._tickSource.seconds = e;
  }
  getSecondsAtTime(e) {
    return this._tickSource.getSecondsAtTime(e);
  }
  setTicksAtTime(e, t) {
    return this._tickSource.setTicksAtTime(e, t), this;
  }
  getTimeOfTick(e, t = this.now()) {
    return this._tickSource.getTimeOfTick(e, t);
  }
  getTicksAtTime(e) {
    return this._tickSource.getTicksAtTime(e);
  }
  nextTickTime(e, t) {
    const n = this.toSeconds(t), r = this.getTicksAtTime(n);
    return this._tickSource.getTimeOfTick(r + e, n);
  }
  _loop() {
    const e = this._lastUpdate, t = this.now();
    this._lastUpdate = t, this.log("loop", e, t), e !== t && (this._state.forEachBetween(e, t, (n) => {
      switch (n.state) {
        case "started":
          const r = this._tickSource.getTicksAtTime(n.time);
          this.emit("start", n.time, r);
          break;
        case "stopped":
          n.time !== 0 && this.emit("stop", n.time);
          break;
        case "paused":
          this.emit("pause", n.time);
          break;
      }
    }), this._tickSource.forEachTickBetween(e, t, (n, r) => {
      this.callback(n, r);
    }));
  }
  getStateAtTime(e) {
    const t = this.toSeconds(e);
    return this._state.getValueAtTime(t);
  }
  dispose() {
    return super.dispose(), this.context.off("tick", this._boundLoop), this._tickSource.dispose(), this._state.dispose(), this;
  }
};
zs.mixin(Fi);
var Ut = class ss {
  constructor(e, t) {
    this.id = ss._eventId++, this._remainderTime = 0;
    const n = Object.assign(ss.getDefaults(), t);
    this.transport = e, this.callback = n.callback, this._once = n.once, this.time = Math.floor(n.time), this._remainderTime = n.time - this.time;
  }
  static getDefaults() {
    return {
      callback: le,
      once: !1,
      time: 0
    };
  }
  get floatTime() {
    return this.time + this._remainderTime;
  }
  invoke(e) {
    if (this.callback) {
      const t = this.transport.bpm.getDurationOfTicks(1, e);
      this.callback(e + this._remainderTime * t), this._once && this.transport.clear(this.id);
    }
  }
  dispose() {
    return this.callback = void 0, this;
  }
};
Ut._eventId = 0;
var bh = class qi extends Ut {
  constructor(e, t) {
    super(e, t), this._currentId = -1, this._nextId = -1, this._nextTick = this.time, this._boundRestart = this._restart.bind(this);
    const n = Object.assign(qi.getDefaults(), t);
    this.duration = n.duration, this._interval = n.interval, this._nextTick = n.time, this.transport.on("start", this._boundRestart), this.transport.on("loopStart", this._boundRestart), this.transport.on("ticks", this._boundRestart), this.context = this.transport.context, this._restart();
  }
  static getDefaults() {
    return Object.assign({}, Ut.getDefaults(), {
      duration: 1 / 0,
      interval: 1,
      once: !1
    });
  }
  invoke(e) {
    this._createEvents(e), super.invoke(e);
  }
  _createEvent() {
    return _n(this._nextTick, this.floatTime + this.duration) ? this.transport.scheduleOnce(this.invoke.bind(this), new xt(this.context, this._nextTick).toSeconds()) : -1;
  }
  _createEvents(e) {
    _n(this._nextTick + this._interval, this.floatTime + this.duration) && (this._nextTick += this._interval, this._currentId = this._nextId, this._nextId = this.transport.scheduleOnce(this.invoke.bind(this), new xt(this.context, this._nextTick).toSeconds()));
  }
  _restart(e) {
    this.transport.clear(this._currentId), this.transport.clear(this._nextId), this._nextTick = this.floatTime;
    const t = this.transport.getTicksAtTime(e);
    Ot(t, this.time) && (this._nextTick = this.floatTime + Math.ceil((t - this.floatTime) / this._interval) * this._interval), this._currentId = this._createEvent(), this._nextTick += this._interval, this._nextId = this._createEvent();
  }
  dispose() {
    return super.dispose(), this.transport.clear(this._currentId), this.transport.clear(this._nextId), this.transport.off("start", this._boundRestart), this.transport.off("loopStart", this._boundRestart), this.transport.off("ticks", this._boundRestart), this;
  }
}, Li = class rs extends Ze {
  constructor() {
    super(M(rs.getDefaults(), arguments)), this.name = "Transport", this._loop = new _h(!1), this._loopStart = 0, this._loopEnd = 0, this._scheduledEvents = {}, this._timeline = new $e(), this._repeatedEvents = new gh(), this._syncedSignals = [], this._swingAmount = 0;
    const e = M(rs.getDefaults(), arguments);
    this._ppq = e.ppq, this._clock = new Fi({
      callback: this._processTick.bind(this),
      context: this.context,
      frequency: 0,
      units: "bpm"
    }), this._bindClockEvents(), this.bpm = this._clock.frequency, this._clock.frequency.multiplier = e.ppq, this.bpm.setValueAtTime(e.bpm, 0), Y(this, "bpm"), this._timeSignature = e.timeSignature, this._swingTicks = e.ppq / 2;
  }
  static getDefaults() {
    return Object.assign(Ze.getDefaults(), {
      bpm: 120,
      loopEnd: "4m",
      loopStart: 0,
      ppq: 192,
      swing: 0,
      swingSubdivision: "8n",
      timeSignature: 4
    });
  }
  _processTick(e, t) {
    if (this._loop.get(e) && t >= this._loopEnd && (this.emit("loopEnd", e), this._clock.setTicksAtTime(this._loopStart, e), t = this._loopStart, this.emit("loopStart", e, this._clock.getSecondsAtTime(e)), this.emit("loop", e)), this._swingAmount > 0 && t % this._ppq !== 0 && t % (this._swingTicks * 2) !== 0) {
      const n = t % (this._swingTicks * 2) / (this._swingTicks * 2), r = Math.sin(n * Math.PI) * this._swingAmount;
      e += new xt(this.context, this._swingTicks * 2 / 3).toSeconds() * r;
    }
    br(!0), this._timeline.forEachAtTime(t, (n) => n.invoke(e)), br(!1);
  }
  schedule(e, t) {
    const n = new Ut(this, {
      callback: e,
      time: new qt(this.context, t).toTicks()
    });
    return this._addEvent(n, this._timeline);
  }
  scheduleRepeat(e, t, n, r = 1 / 0) {
    const i = new bh(this, {
      callback: e,
      duration: new ct(this.context, r).toTicks(),
      interval: new ct(this.context, t).toTicks(),
      time: new qt(this.context, n).toTicks()
    });
    return this._addEvent(i, this._repeatedEvents);
  }
  scheduleOnce(e, t) {
    const n = new Ut(this, {
      callback: e,
      once: !0,
      time: new qt(this.context, t).toTicks()
    });
    return this._addEvent(n, this._timeline);
  }
  clear(e) {
    if (this._scheduledEvents.hasOwnProperty(e)) {
      const t = this._scheduledEvents[e.toString()];
      t.timeline.remove(t.event), t.event.dispose(), delete this._scheduledEvents[e.toString()];
    }
    return this;
  }
  _addEvent(e, t) {
    return this._scheduledEvents[e.id.toString()] = {
      event: e,
      timeline: t
    }, t.add(e), e.id;
  }
  cancel(e = 0) {
    const t = this.toTicks(e);
    return this._timeline.forEachFrom(t, (n) => this.clear(n.id)), this._repeatedEvents.forEachFrom(t, (n) => this.clear(n.id)), this;
  }
  _bindClockEvents() {
    this._clock.on("start", (e, t) => {
      t = new xt(this.context, t).toSeconds(), this.emit("start", e, t);
    }), this._clock.on("stop", (e) => {
      this.emit("stop", e);
    }), this._clock.on("pause", (e) => {
      this.emit("pause", e);
    });
  }
  get state() {
    return this._clock.getStateAtTime(this.now());
  }
  start(e, t) {
    this.context.resume();
    let n;
    return Z(t) && (n = this.toTicks(t)), this._clock.start(e, n), this;
  }
  stop(e) {
    return this._clock.stop(e), this;
  }
  pause(e) {
    return this._clock.pause(e), this;
  }
  toggle(e) {
    return e = this.toSeconds(e), this._clock.getStateAtTime(e) !== "started" ? this.start(e) : this.stop(e), this;
  }
  get timeSignature() {
    return this._timeSignature;
  }
  set timeSignature(e) {
    Le(e) && (e = e[0] / e[1] * 4), this._timeSignature = e;
  }
  get loopStart() {
    return new ct(this.context, this._loopStart, "i").toSeconds();
  }
  set loopStart(e) {
    this._loopStart = this.toTicks(e);
  }
  get loopEnd() {
    return new ct(this.context, this._loopEnd, "i").toSeconds();
  }
  set loopEnd(e) {
    this._loopEnd = this.toTicks(e);
  }
  get loop() {
    return this._loop.get(this.now());
  }
  set loop(e) {
    this._loop.set(e, this.now());
  }
  setLoopPoints(e, t) {
    return this.loopStart = e, this.loopEnd = t, this;
  }
  get swing() {
    return this._swingAmount;
  }
  set swing(e) {
    this._swingAmount = e;
  }
  get swingSubdivision() {
    return new xt(this.context, this._swingTicks).toNotation();
  }
  set swingSubdivision(e) {
    this._swingTicks = this.toTicks(e);
  }
  get position() {
    const e = this.now(), t = this._clock.getTicksAtTime(e);
    return new xt(this.context, t).toBarsBeatsSixteenths();
  }
  set position(e) {
    const t = this.toTicks(e);
    this.ticks = t;
  }
  get seconds() {
    return this._clock.seconds;
  }
  set seconds(e) {
    const t = this.now(), n = this._clock.frequency.timeToTicks(e, t);
    this.ticks = n;
  }
  get progress() {
    if (this.loop) {
      const e = this.now();
      return (this._clock.getTicksAtTime(e) - this._loopStart) / (this._loopEnd - this._loopStart);
    } else return 0;
  }
  get ticks() {
    return this._clock.ticks;
  }
  set ticks(e) {
    if (this._clock.ticks !== e) {
      const t = this.now();
      if (this.state === "started") {
        const n = this._clock.getTicksAtTime(t), r = t + this._clock.frequency.getDurationOfTicks(Math.ceil(n) - n, t);
        this.emit("stop", r), this._clock.setTicksAtTime(e, r), this.emit("start", r, this._clock.getSecondsAtTime(r));
      } else
        this.emit("ticks", t), this._clock.setTicksAtTime(e, t);
    }
  }
  getTicksAtTime(e) {
    return this._clock.getTicksAtTime(e);
  }
  getSecondsAtTime(e) {
    return this._clock.getSecondsAtTime(e);
  }
  get PPQ() {
    return this._clock.frequency.multiplier;
  }
  set PPQ(e) {
    this._clock.frequency.multiplier = e;
  }
  nextSubdivision(e) {
    if (e = this.toTicks(e), this.state !== "started") return 0;
    {
      const t = this.now(), n = this.getTicksAtTime(t), r = e - n % e;
      return this._clock.nextTickTime(r, t);
    }
  }
  syncSignal(e, t) {
    const n = this.now();
    let r = this.bpm, i = 1 / (60 / r.getValueAtTime(n) / this.PPQ), o = [];
    if (e.units === "time") {
      const c = 0.015625 / i, l = new oe(c), u = new Pi(-1), h = new oe(c);
      r.chain(l, u, h), r = h, i = 1 / i, o = [
        l,
        u,
        h
      ];
    }
    t || (e.getValueAtTime(n) !== 0 ? t = e.getValueAtTime(n) / i : t = 0);
    const a = new oe(t);
    return r.connect(a), a.connect(e._param), o.push(a), this._syncedSignals.push({
      initial: e.value,
      nodes: o,
      signal: e
    }), e.value = 0, this;
  }
  unsyncSignal(e) {
    for (let t = this._syncedSignals.length - 1; t >= 0; t--) {
      const n = this._syncedSignals[t];
      n.signal === e && (n.nodes.forEach((r) => r.dispose()), n.signal.value = n.initial, this._syncedSignals.splice(t, 1));
    }
    return this;
  }
  dispose() {
    return super.dispose(), this._clock.dispose(), Zs(this, "bpm"), this._timeline.dispose(), this._repeatedEvents.dispose(), this;
  }
};
zs.mixin(Li);
xi((s) => {
  s.transport = new Li({ context: s });
});
Ai((s) => {
  s.transport.dispose();
});
var Ce = class extends $ {
  constructor(s) {
    super(s), this.input = void 0, this._state = new Ys("stopped"), this._synced = !1, this._scheduled = [], this._syncedStart = le, this._syncedStop = le, this._state.memory = 100, this._state.increasing = !0, this._volume = this.output = new Qs({
      context: this.context,
      mute: s.mute,
      volume: s.volume
    }), this.volume = this._volume.volume, Y(this, "volume"), this.onstop = s.onstop;
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      mute: !1,
      onstop: le,
      volume: 0
    });
  }
  get state() {
    return this._synced ? this.context.transport.state === "started" ? this._state.getValueAtTime(this.context.transport.seconds) : "stopped" : this._state.getValueAtTime(this.now());
  }
  get mute() {
    return this._volume.mute;
  }
  set mute(s) {
    this._volume.mute = s;
  }
  _clampToCurrentTime(s) {
    return this._synced ? s : Math.max(s, this.context.currentTime);
  }
  start(s, e, t) {
    let n = Re(s) && this._synced ? this.context.transport.seconds : this.toSeconds(s);
    if (n = this._clampToCurrentTime(n), !this._synced && this._state.getValueAtTime(n) === "started")
      G(Ot(n, this._state.get(n).time), "Start time must be strictly greater than previous start time"), this._state.cancel(n), this._state.setStateAtTime("started", n), this.log("restart", n), this.restart(n, e, t);
    else if (this.log("start", n), this._state.setStateAtTime("started", n), this._synced) {
      const r = this._state.get(n);
      r && (r.offset = this.toSeconds(Rn(e, 0)), r.duration = t ? this.toSeconds(t) : void 0);
      const i = this.context.transport.schedule((o) => {
        this._start(o, e, t);
      }, n);
      this._scheduled.push(i), this.context.transport.state === "started" && this.context.transport.getSecondsAtTime(this.immediate()) > n && this._syncedStart(this.now(), this.context.transport.seconds);
    } else
      yi(this.context), this._start(n, e, t);
    return this;
  }
  stop(s) {
    let e = Re(s) && this._synced ? this.context.transport.seconds : this.toSeconds(s);
    if (e = this._clampToCurrentTime(e), this._state.getValueAtTime(e) === "started" || Z(this._state.getNextState("started", e))) {
      if (this.log("stop", e), !this._synced) this._stop(e);
      else {
        const t = this.context.transport.schedule(this._stop.bind(this), e);
        this._scheduled.push(t);
      }
      this._state.cancel(e), this._state.setStateAtTime("stopped", e);
    }
    return this;
  }
  restart(s, e, t) {
    return s = this.toSeconds(s), this._state.getValueAtTime(s) === "started" && (this._state.cancel(s), this._restart(s, e, t)), this;
  }
  sync() {
    return this._synced || (this._synced = !0, this._syncedStart = (s, e) => {
      if (Ot(e, 0)) {
        const t = this._state.get(e);
        if (t && t.state === "started" && t.time !== e) {
          const n = e - this.toSeconds(t.time);
          let r;
          t.duration && (r = this.toSeconds(t.duration) - n), this._start(s, this.toSeconds(t.offset) + n, r);
        }
      }
    }, this._syncedStop = (s) => {
      const e = this.context.transport.getSecondsAtTime(Math.max(s - this.sampleTime, 0));
      this._state.getValueAtTime(e) === "started" && this._stop(s);
    }, this.context.transport.on("start", this._syncedStart), this.context.transport.on("loopStart", this._syncedStart), this.context.transport.on("stop", this._syncedStop), this.context.transport.on("pause", this._syncedStop), this.context.transport.on("loopEnd", this._syncedStop)), this;
  }
  unsync() {
    return this._synced && (this.context.transport.off("stop", this._syncedStop), this.context.transport.off("pause", this._syncedStop), this.context.transport.off("loopEnd", this._syncedStop), this.context.transport.off("start", this._syncedStart), this.context.transport.off("loopStart", this._syncedStart)), this._synced = !1, this._scheduled.forEach((s) => this.context.transport.clear(s)), this._scheduled = [], this._state.cancel(0), this._stop(0), this;
  }
  dispose() {
    return super.dispose(), this.onstop = le, this.unsync(), this._volume.dispose(), this._state.dispose(), this;
  }
};
function wt(s, e) {
  return pe(this, void 0, void 0, function* () {
    const t = e / s.context.sampleRate, n = new Xs(1, t, s.context.sampleRate);
    return new s.constructor(Object.assign(s.get(), {
      frequency: 2 / t,
      detune: 0,
      context: n
    })).toDestination().start(0), (yield n.render()).getChannelData(0);
  });
}
var Ch = class is extends Nt {
  constructor() {
    super(M(is.getDefaults(), arguments, ["frequency", "type"])), this.name = "ToneOscillatorNode", this._oscillator = this.context.createOscillator(), this._internalChannels = [this._oscillator];
    const e = M(is.getDefaults(), arguments, ["frequency", "type"]);
    rt(this._oscillator, this._gainNode), this.type = e.type, this.frequency = new ue({
      context: this.context,
      param: this._oscillator.frequency,
      units: "frequency",
      value: e.frequency
    }), this.detune = new ue({
      context: this.context,
      param: this._oscillator.detune,
      units: "cents",
      value: e.detune
    }), Y(this, ["frequency", "detune"]);
  }
  static getDefaults() {
    return Object.assign(Nt.getDefaults(), {
      detune: 0,
      frequency: 440,
      type: "sine"
    });
  }
  start(e) {
    const t = this.toSeconds(e);
    return this.log("start", t), this._startGain(t), this._oscillator.start(t), this;
  }
  _stopSource(e) {
    this._oscillator.stop(e);
  }
  setPeriodicWave(e) {
    return this._oscillator.setPeriodicWave(e), this;
  }
  get type() {
    return this._oscillator.type;
  }
  set type(e) {
    this._oscillator.type = e;
  }
  dispose() {
    return super.dispose(), this.state === "started" && this.stop(), this._oscillator.disconnect(), this.frequency.dispose(), this.detune.dispose(), this;
  }
}, ke = class Je extends Ce {
  constructor() {
    super(M(Je.getDefaults(), arguments, ["frequency", "type"])), this.name = "Oscillator", this._oscillator = null;
    const e = M(Je.getDefaults(), arguments, ["frequency", "type"]);
    this.frequency = new ee({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), Y(this, "frequency"), this.detune = new ee({
      context: this.context,
      units: "cents",
      value: e.detune
    }), Y(this, "detune"), this._partials = e.partials, this._partialCount = e.partialCount, this._type = e.type, e.partialCount && e.type !== "custom" && (this._type = this.baseType + e.partialCount.toString()), this.phase = e.phase;
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
      detune: 0,
      frequency: 440,
      partialCount: 0,
      partials: [],
      phase: 0,
      type: "sine"
    });
  }
  _start(e) {
    const t = this.toSeconds(e), n = new Ch({
      context: this.context,
      onended: () => this.onstop(this)
    });
    this._oscillator = n, this._wave ? this._oscillator.setPeriodicWave(this._wave) : this._oscillator.type = this._type, this._oscillator.connect(this.output), this.frequency.connect(this._oscillator.frequency), this.detune.connect(this._oscillator.detune), this._oscillator.start(t);
  }
  _stop(e) {
    const t = this.toSeconds(e);
    this._oscillator && this._oscillator.stop(t);
  }
  _restart(e) {
    const t = this.toSeconds(e);
    return this.log("restart", t), this._oscillator && this._oscillator.cancelStop(), this._state.cancel(t), this;
  }
  syncFrequency() {
    return this.context.transport.syncSignal(this.frequency), this;
  }
  unsyncFrequency() {
    return this.context.transport.unsyncSignal(this.frequency), this;
  }
  _getCachedPeriodicWave() {
    if (this._type === "custom") return Je._periodicWaveCache.find((e) => e.phase === this._phase && $u(e.partials, this._partials));
    {
      const e = Je._periodicWaveCache.find((t) => t.type === this._type && t.phase === this._phase);
      return this._partialCount = e ? e.partialCount : this._partialCount, e;
    }
  }
  get type() {
    return this._type;
  }
  set type(e) {
    this._type = e;
    const t = [
      "sine",
      "square",
      "sawtooth",
      "triangle"
    ].indexOf(e) !== -1;
    if (this._phase === 0 && t)
      this._wave = void 0, this._partialCount = 0, this._oscillator !== null && (this._oscillator.type = e);
    else {
      const n = this._getCachedPeriodicWave();
      if (Z(n)) {
        const { partials: r, wave: i } = n;
        this._wave = i, this._partials = r, this._oscillator !== null && this._oscillator.setPeriodicWave(this._wave);
      } else {
        const [r, i] = this._getRealImaginary(e, this._phase), o = this.context.createPeriodicWave(r, i);
        this._wave = o, this._oscillator !== null && this._oscillator.setPeriodicWave(this._wave), Je._periodicWaveCache.push({
          imag: i,
          partialCount: this._partialCount,
          partials: this._partials,
          phase: this._phase,
          real: r,
          type: this._type,
          wave: this._wave
        }), Je._periodicWaveCache.length > 100 && Je._periodicWaveCache.shift();
      }
    }
  }
  get baseType() {
    return this._type.replace(this.partialCount.toString(), "");
  }
  set baseType(e) {
    this.partialCount && this._type !== "custom" && e !== "custom" ? this.type = e + this.partialCount : this.type = e;
  }
  get partialCount() {
    return this._partialCount;
  }
  set partialCount(e) {
    yt(e, 0);
    let t = this._type;
    const n = /^(sine|triangle|square|sawtooth)(\d+)$/.exec(this._type);
    if (n && (t = n[1]), this._type !== "custom") e === 0 ? this.type = t : this.type = t + e.toString();
    else {
      const r = new Float32Array(e);
      this._partials.forEach((i, o) => r[o] = i), this._partials = Array.from(r), this.type = this._type;
    }
  }
  _getRealImaginary(e, t) {
    let n = 2048;
    const r = new Float32Array(n), i = new Float32Array(n);
    let o = 1;
    if (e === "custom") {
      if (o = this._partials.length + 1, this._partialCount = this._partials.length, n = o, this._partials.length === 0) return [r, i];
    } else {
      const a = /^(sine|triangle|square|sawtooth)(\d+)$/.exec(e);
      a ? (o = parseInt(a[2], 10) + 1, this._partialCount = parseInt(a[2], 10), e = a[1], o = Math.max(o, 2), n = o) : this._partialCount = 0, this._partials = [];
    }
    for (let a = 1; a < n; ++a) {
      const c = 2 / (a * Math.PI);
      let l;
      switch (e) {
        case "sine":
          l = a <= o ? 1 : 0, this._partials[a - 1] = l;
          break;
        case "square":
          l = a & 1 ? 2 * c : 0, this._partials[a - 1] = l;
          break;
        case "sawtooth":
          l = c * (a & 1 ? 1 : -1), this._partials[a - 1] = l;
          break;
        case "triangle":
          a & 1 ? l = 2 * (c * c) * (a - 1 >> 1 & 1 ? -1 : 1) : l = 0, this._partials[a - 1] = l;
          break;
        case "custom":
          l = this._partials[a - 1];
          break;
        default:
          throw new TypeError("Oscillator: invalid type: " + e);
      }
      l !== 0 ? (r[a] = -l * Math.sin(t * a), i[a] = l * Math.cos(t * a)) : (r[a] = 0, i[a] = 0);
    }
    return [r, i];
  }
  _inverseFFT(e, t, n) {
    let r = 0;
    const i = e.length;
    for (let o = 0; o < i; o++) r += e[o] * Math.cos(o * n) + t[o] * Math.sin(o * n);
    return r;
  }
  getInitialValue() {
    const [e, t] = this._getRealImaginary(this._type, 0);
    let n = 0;
    const r = Math.PI * 2, i = 32;
    for (let o = 0; o < i; o++) n = Math.max(this._inverseFFT(e, t, o / i * r), n);
    return eh(-this._inverseFFT(e, t, this._phase) / n, -1, 1);
  }
  get partials() {
    return this._partials.slice(0, this.partialCount);
  }
  set partials(e) {
    this._partials = e, this._partialCount = this._partials.length, e.length && (this.type = "custom");
  }
  get phase() {
    return this._phase * (180 / Math.PI);
  }
  set phase(e) {
    this._phase = e * Math.PI / 180, this.type = this._type;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this._oscillator !== null && this._oscillator.dispose(), this._wave = void 0, this.frequency.dispose(), this.detune.dispose(), this;
  }
};
ke._periodicWaveCache = [];
var Js = class as extends Ce {
  constructor() {
    super(M(as.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ])), this.name = "FMOscillator", this._modulationNode = new oe({
      context: this.context,
      gain: 0
    });
    const e = M(as.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ]);
    this._carrier = new ke({
      context: this.context,
      detune: e.detune,
      frequency: 0,
      onstop: () => this.onstop(this),
      phase: e.phase,
      type: e.type
    }), this.detune = this._carrier.detune, this.frequency = new ee({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this._modulator = new ke({
      context: this.context,
      phase: e.phase,
      type: e.modulationType
    }), this.harmonicity = new Mt({
      context: this.context,
      units: "positive",
      value: e.harmonicity
    }), this.modulationIndex = new Mt({
      context: this.context,
      units: "positive",
      value: e.modulationIndex
    }), this.frequency.connect(this._carrier.frequency), this.frequency.chain(this.harmonicity, this._modulator.frequency), this.frequency.chain(this.modulationIndex, this._modulationNode), this._modulator.connect(this._modulationNode.gain), this._modulationNode.connect(this._carrier.frequency), this._carrier.connect(this.output), this.detune.connect(this._modulator.detune), Y(this, [
      "modulationIndex",
      "frequency",
      "detune",
      "harmonicity"
    ]);
  }
  static getDefaults() {
    return Object.assign(ke.getDefaults(), {
      harmonicity: 1,
      modulationIndex: 2,
      modulationType: "square"
    });
  }
  _start(e) {
    this._modulator.start(e), this._carrier.start(e);
  }
  _stop(e) {
    this._modulator.stop(e), this._carrier.stop(e);
  }
  _restart(e) {
    return this._modulator.restart(e), this._carrier.restart(e), this;
  }
  get type() {
    return this._carrier.type;
  }
  set type(e) {
    this._carrier.type = e;
  }
  get baseType() {
    return this._carrier.baseType;
  }
  set baseType(e) {
    this._carrier.baseType = e;
  }
  get partialCount() {
    return this._carrier.partialCount;
  }
  set partialCount(e) {
    this._carrier.partialCount = e;
  }
  get modulationType() {
    return this._modulator.type;
  }
  set modulationType(e) {
    this._modulator.type = e;
  }
  get phase() {
    return this._carrier.phase;
  }
  set phase(e) {
    this._carrier.phase = e, this._modulator.phase = e;
  }
  get partials() {
    return this._carrier.partials;
  }
  set partials(e) {
    this._carrier.partials = e;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.frequency.dispose(), this.harmonicity.dispose(), this._carrier.dispose(), this._modulator.dispose(), this._modulationNode.dispose(), this.modulationIndex.dispose(), this;
  }
}, Dt = class os extends $ {
  constructor() {
    super(M(os.getDefaults(), arguments)), this._scheduledEvents = [], this._synced = !1, this._original_triggerAttack = this.triggerAttack, this._original_triggerRelease = this.triggerRelease, this._syncedRelease = (t) => this._original_triggerRelease(t);
    const e = M(os.getDefaults(), arguments);
    this._volume = this.output = new Qs({
      context: this.context,
      volume: e.volume
    }), this.volume = this._volume.volume, Y(this, "volume");
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), { volume: 0 });
  }
  sync() {
    return this._syncState() && (this._syncMethod("triggerAttack", 1), this._syncMethod("triggerRelease", 0), this.context.transport.on("stop", this._syncedRelease), this.context.transport.on("pause", this._syncedRelease), this.context.transport.on("loopEnd", this._syncedRelease)), this;
  }
  _syncState() {
    let e = !1;
    return this._synced || (this._synced = !0, e = !0), e;
  }
  _syncMethod(e, t) {
    const n = this["_original_" + e] = this[e];
    this[e] = (...r) => {
      const i = r[t], o = this.context.transport.schedule((a) => {
        r[t] = a, n.apply(this, r);
      }, i);
      this._scheduledEvents.push(o);
    };
  }
  unsync() {
    return this._scheduledEvents.forEach((e) => this.context.transport.clear(e)), this._scheduledEvents = [], this._synced && (this._synced = !1, this.triggerAttack = this._original_triggerAttack, this.triggerRelease = this._original_triggerRelease, this.context.transport.off("stop", this._syncedRelease), this.context.transport.off("pause", this._syncedRelease), this.context.transport.off("loopEnd", this._syncedRelease)), this;
  }
  triggerAttackRelease(e, t, n, r) {
    const i = this.toSeconds(n), o = this.toSeconds(t);
    return this.triggerAttack(e, i, r), this.triggerRelease(i + o), this;
  }
  dispose() {
    return super.dispose(), this._volume.dispose(), this.unsync(), this._scheduledEvents = [], this;
  }
}, Xe = class cs extends Dt {
  constructor() {
    super(M(cs.getDefaults(), arguments));
    const e = M(cs.getDefaults(), arguments);
    this.portamento = e.portamento, this.onsilence = e.onsilence;
  }
  static getDefaults() {
    return Object.assign(Dt.getDefaults(), {
      detune: 0,
      onsilence: le,
      portamento: 0
    });
  }
  triggerAttack(e, t, n = 1) {
    this.log("triggerAttack", e, t, n);
    const r = this.toSeconds(t);
    return this._triggerEnvelopeAttack(r, n), this.setNote(e, r), this;
  }
  triggerRelease(e) {
    this.log("triggerRelease", e);
    const t = this.toSeconds(e);
    return this._triggerEnvelopeRelease(t), this;
  }
  setNote(e, t) {
    const n = this.toSeconds(t), r = e instanceof An ? e.toFrequency() : e;
    if (this.portamento > 0 && this.getLevelAtTime(n) > 0.05) {
      const i = this.toSeconds(this.portamento);
      this.frequency.exponentialRampTo(r, i, n);
    } else this.frequency.setValueAtTime(r, n);
    return this;
  }
};
Tt([Yt(0)], Xe.prototype, "portamento", void 0);
var Sr = [
  1,
  1.483,
  1.932,
  2.546,
  2.63,
  3.897
], cd = class ls extends Xe {
  constructor() {
    super(M(ls.getDefaults(), arguments)), this.name = "MetalSynth", this._oscillators = [], this._freqMultipliers = [];
    const e = M(ls.getDefaults(), arguments);
    this.detune = new ee({
      context: this.context,
      units: "cents",
      value: e.detune
    }), this.frequency = new ee({
      context: this.context,
      units: "frequency"
    }), this._amplitude = new oe({
      context: this.context,
      gain: 0
    }).connect(this.output), this._highpass = new $n({
      Q: 0,
      context: this.context,
      type: "highpass"
    }).connect(this._amplitude);
    for (let t = 0; t < Sr.length; t++) {
      const n = new Js({
        context: this.context,
        harmonicity: e.harmonicity,
        modulationIndex: e.modulationIndex,
        modulationType: "square",
        onstop: t === 0 ? () => this.onsilence(this) : le,
        type: "square"
      });
      n.connect(this._highpass), this._oscillators[t] = n;
      const r = new Mt({
        context: this.context,
        value: Sr[t]
      });
      this._freqMultipliers[t] = r, this.frequency.chain(r, n.frequency), this.detune.connect(n.detune);
    }
    this._filterFreqScaler = new Vi({
      context: this.context,
      max: 7e3,
      min: this.toFrequency(e.resonance)
    }), this.envelope = new Ne({
      attack: e.envelope.attack,
      attackCurve: "linear",
      context: this.context,
      decay: e.envelope.decay,
      release: e.envelope.release,
      sustain: 0
    }), this.envelope.chain(this._filterFreqScaler, this._highpass.frequency), this.envelope.connect(this._amplitude.gain), this._octaves = e.octaves, this.octaves = e.octaves;
  }
  static getDefaults() {
    return et(Xe.getDefaults(), {
      envelope: Object.assign(Fe(Ne.getDefaults(), Object.keys($.getDefaults())), {
        attack: 1e-3,
        decay: 1.4,
        release: 0.2
      }),
      harmonicity: 5.1,
      modulationIndex: 32,
      octaves: 1.5,
      resonance: 4e3
    });
  }
  _triggerEnvelopeAttack(e, t = 1) {
    return this.envelope.triggerAttack(e, t), this._oscillators.forEach((n) => n.start(e)), this.envelope.sustain === 0 && this._oscillators.forEach((n) => {
      n.stop(e + this.toSeconds(this.envelope.attack) + this.toSeconds(this.envelope.decay));
    }), this;
  }
  _triggerEnvelopeRelease(e) {
    return this.envelope.triggerRelease(e), this._oscillators.forEach((t) => t.stop(e + this.toSeconds(this.envelope.release))), this;
  }
  getLevelAtTime(e) {
    return e = this.toSeconds(e), this.envelope.getValueAtTime(e);
  }
  get modulationIndex() {
    return this._oscillators[0].modulationIndex.value;
  }
  set modulationIndex(e) {
    this._oscillators.forEach((t) => t.modulationIndex.value = e);
  }
  get harmonicity() {
    return this._oscillators[0].harmonicity.value;
  }
  set harmonicity(e) {
    this._oscillators.forEach((t) => t.harmonicity.value = e);
  }
  get resonance() {
    return this._filterFreqScaler.min;
  }
  set resonance(e) {
    this._filterFreqScaler.min = this.toFrequency(e), this.octaves = this._octaves;
  }
  get octaves() {
    return this._octaves;
  }
  set octaves(e) {
    this._octaves = e, this._filterFreqScaler.max = this._filterFreqScaler.min * Math.pow(2, e);
  }
  dispose() {
    return super.dispose(), this._oscillators.forEach((e) => e.dispose()), this._freqMultipliers.forEach((e) => e.dispose()), this.frequency.dispose(), this.detune.dispose(), this._filterFreqScaler.dispose(), this._amplitude.dispose(), this.envelope.dispose(), this._highpass.dispose(), this;
  }
}, Ks = class Wi extends Ne {
  constructor() {
    super(M(Wi.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ])), this.name = "AmplitudeEnvelope", this._gainNode = new oe({
      context: this.context,
      gain: 0
    }), this.output = this._gainNode, this.input = this._gainNode, this._sig.connect(this._gainNode.gain), this.output = this._gainNode, this.input = this._gainNode;
  }
  dispose() {
    return super.dispose(), this._gainNode.dispose(), this;
  }
}, xh = class extends _t {
  constructor() {
    super(...arguments), this.name = "AudioToGain", this._norm = new Qt({
      context: this.context,
      mapping: (s) => (s + 1) / 2
    }), this.input = this._norm, this.output = this._norm;
  }
  dispose() {
    return super.dispose(), this._norm.dispose(), this;
  }
}, ji = class us extends Ce {
  constructor() {
    super(M(us.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ])), this.name = "AMOscillator", this._modulationScale = new xh({ context: this.context }), this._modulationNode = new oe({ context: this.context });
    const e = M(us.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ]);
    this._carrier = new ke({
      context: this.context,
      detune: e.detune,
      frequency: e.frequency,
      onstop: () => this.onstop(this),
      phase: e.phase,
      type: e.type
    }), this.frequency = this._carrier.frequency, this.detune = this._carrier.detune, this._modulator = new ke({
      context: this.context,
      phase: e.phase,
      type: e.modulationType
    }), this.harmonicity = new Mt({
      context: this.context,
      units: "positive",
      value: e.harmonicity
    }), this.frequency.chain(this.harmonicity, this._modulator.frequency), this._modulator.chain(this._modulationScale, this._modulationNode.gain), this._carrier.chain(this._modulationNode, this.output), Y(this, [
      "frequency",
      "detune",
      "harmonicity"
    ]);
  }
  static getDefaults() {
    return Object.assign(ke.getDefaults(), {
      harmonicity: 1,
      modulationType: "square"
    });
  }
  _start(e) {
    this._modulator.start(e), this._carrier.start(e);
  }
  _stop(e) {
    this._modulator.stop(e), this._carrier.stop(e);
  }
  _restart(e) {
    this._modulator.restart(e), this._carrier.restart(e);
  }
  get type() {
    return this._carrier.type;
  }
  set type(e) {
    this._carrier.type = e;
  }
  get baseType() {
    return this._carrier.baseType;
  }
  set baseType(e) {
    this._carrier.baseType = e;
  }
  get partialCount() {
    return this._carrier.partialCount;
  }
  set partialCount(e) {
    this._carrier.partialCount = e;
  }
  get modulationType() {
    return this._modulator.type;
  }
  set modulationType(e) {
    this._modulator.type = e;
  }
  get phase() {
    return this._carrier.phase;
  }
  set phase(e) {
    this._carrier.phase = e, this._modulator.phase = e;
  }
  get partials() {
    return this._carrier.partials;
  }
  set partials(e) {
    this._carrier.partials = e;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.frequency.dispose(), this.detune.dispose(), this.harmonicity.dispose(), this._carrier.dispose(), this._modulator.dispose(), this._modulationNode.dispose(), this._modulationScale.dispose(), this;
  }
}, Bi = class hs extends Ce {
  constructor() {
    super(M(hs.getDefaults(), arguments, [
      "frequency",
      "type",
      "spread"
    ])), this.name = "FatOscillator", this._oscillators = [];
    const e = M(hs.getDefaults(), arguments, [
      "frequency",
      "type",
      "spread"
    ]);
    this.frequency = new ee({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this.detune = new ee({
      context: this.context,
      units: "cents",
      value: e.detune
    }), this._spread = e.spread, this._type = e.type, this._phase = e.phase, this._partials = e.partials, this._partialCount = e.partialCount, this.count = e.count, Y(this, ["frequency", "detune"]);
  }
  static getDefaults() {
    return Object.assign(ke.getDefaults(), {
      count: 3,
      spread: 20,
      type: "sawtooth"
    });
  }
  _start(e) {
    e = this.toSeconds(e), this._forEach((t) => t.start(e));
  }
  _stop(e) {
    e = this.toSeconds(e), this._forEach((t) => t.stop(e));
  }
  _restart(e) {
    this._forEach((t) => t.restart(e));
  }
  _forEach(e) {
    for (let t = 0; t < this._oscillators.length; t++) e(this._oscillators[t], t);
  }
  get type() {
    return this._type;
  }
  set type(e) {
    this._type = e, this._forEach((t) => t.type = e);
  }
  get spread() {
    return this._spread;
  }
  set spread(e) {
    if (this._spread = e, this._oscillators.length > 1) {
      const t = -e / 2, n = e / (this._oscillators.length - 1);
      this._forEach((r, i) => r.detune.value = t + n * i);
    }
  }
  get count() {
    return this._oscillators.length;
  }
  set count(e) {
    if (yt(e, 1), this._oscillators.length !== e) {
      this._forEach((t) => t.dispose()), this._oscillators = [];
      for (let t = 0; t < e; t++) {
        const n = new ke({
          context: this.context,
          volume: -6 - e * 1.1,
          type: this._type,
          phase: this._phase + t / e * 360,
          partialCount: this._partialCount,
          onstop: t === 0 ? () => this.onstop(this) : le
        });
        this.type === "custom" && (n.partials = this._partials), this.frequency.connect(n.frequency), this.detune.connect(n.detune), n.detune.overridden = !1, n.connect(this.output), this._oscillators[t] = n;
      }
      this.spread = this._spread, this.state === "started" && this._forEach((t) => t.start());
    }
  }
  get phase() {
    return this._phase;
  }
  set phase(e) {
    this._phase = e, this._forEach((t, n) => t.phase = this._phase + n / this.count * 360);
  }
  get baseType() {
    return this._oscillators[0].baseType;
  }
  set baseType(e) {
    this._forEach((t) => t.baseType = e), this._type = this._oscillators[0].type;
  }
  get partials() {
    return this._oscillators[0].partials;
  }
  set partials(e) {
    this._partials = e, this._partialCount = this._partials.length, e.length && (this._type = "custom", this._forEach((t) => t.partials = e));
  }
  get partialCount() {
    return this._oscillators[0].partialCount;
  }
  set partialCount(e) {
    this._partialCount = e, this._forEach((t) => t.partialCount = e), this._type = this._oscillators[0].type;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.frequency.dispose(), this.detune.dispose(), this._forEach((e) => e.dispose()), this;
  }
}, er = class ds extends Ce {
  constructor() {
    super(M(ds.getDefaults(), arguments, ["frequency", "width"])), this.name = "PulseOscillator", this._widthGate = new oe({
      context: this.context,
      gain: 0
    }), this._thresh = new Qt({
      context: this.context,
      mapping: (t) => t <= 0 ? -1 : 1
    });
    const e = M(ds.getDefaults(), arguments, ["frequency", "width"]);
    this.width = new ee({
      context: this.context,
      units: "audioRange",
      value: e.width
    }), this._triangle = new ke({
      context: this.context,
      detune: e.detune,
      frequency: e.frequency,
      onstop: () => this.onstop(this),
      phase: e.phase,
      type: "triangle"
    }), this.frequency = this._triangle.frequency, this.detune = this._triangle.detune, this._triangle.chain(this._thresh, this.output), this.width.chain(this._widthGate, this._thresh), Y(this, [
      "width",
      "frequency",
      "detune"
    ]);
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
      detune: 0,
      frequency: 440,
      phase: 0,
      type: "pulse",
      width: 0.2
    });
  }
  _start(e) {
    e = this.toSeconds(e), this._triangle.start(e), this._widthGate.gain.setValueAtTime(1, e);
  }
  _stop(e) {
    e = this.toSeconds(e), this._triangle.stop(e), this._widthGate.gain.cancelScheduledValues(e), this._widthGate.gain.setValueAtTime(0, e);
  }
  _restart(e) {
    this._triangle.restart(e), this._widthGate.gain.cancelScheduledValues(e), this._widthGate.gain.setValueAtTime(1, e);
  }
  get phase() {
    return this._triangle.phase;
  }
  set phase(e) {
    this._triangle.phase = e;
  }
  get type() {
    return "pulse";
  }
  get baseType() {
    return "pulse";
  }
  get partials() {
    return [];
  }
  get partialCount() {
    return 0;
  }
  set carrierType(e) {
    this._triangle.type = e;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this._triangle.dispose(), this.width.dispose(), this._widthGate.dispose(), this._thresh.dispose(), this;
  }
}, Ui = class ps extends Ce {
  constructor() {
    super(M(ps.getDefaults(), arguments, ["frequency", "modulationFrequency"])), this.name = "PWMOscillator", this.sourceType = "pwm", this._scale = new Mt({
      context: this.context,
      value: 2
    });
    const e = M(ps.getDefaults(), arguments, ["frequency", "modulationFrequency"]);
    this._pulse = new er({
      context: this.context,
      frequency: e.modulationFrequency
    }), this._pulse.carrierType = "sine", this.modulationFrequency = this._pulse.frequency, this._modulator = new ke({
      context: this.context,
      detune: e.detune,
      frequency: e.frequency,
      onstop: () => this.onstop(this),
      phase: e.phase
    }), this.frequency = this._modulator.frequency, this.detune = this._modulator.detune, this._modulator.chain(this._scale, this._pulse.width), this._pulse.connect(this.output), Y(this, [
      "modulationFrequency",
      "frequency",
      "detune"
    ]);
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
      detune: 0,
      frequency: 440,
      modulationFrequency: 0.4,
      phase: 0,
      type: "pwm"
    });
  }
  _start(e) {
    e = this.toSeconds(e), this._modulator.start(e), this._pulse.start(e);
  }
  _stop(e) {
    e = this.toSeconds(e), this._modulator.stop(e), this._pulse.stop(e);
  }
  _restart(e) {
    this._modulator.restart(e), this._pulse.restart(e);
  }
  get type() {
    return "pwm";
  }
  get baseType() {
    return "pwm";
  }
  get partials() {
    return [];
  }
  get partialCount() {
    return 0;
  }
  get phase() {
    return this._modulator.phase;
  }
  set phase(e) {
    this._modulator.phase = e;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this._pulse.dispose(), this._scale.dispose(), this._modulator.dispose(), this;
  }
}, Ar = {
  am: ji,
  fat: Bi,
  fm: Js,
  oscillator: ke,
  pulse: er,
  pwm: Ui
}, vn = class fs extends Ce {
  constructor() {
    super(M(fs.getDefaults(), arguments, ["frequency", "type"])), this.name = "OmniOscillator";
    const e = M(fs.getDefaults(), arguments, ["frequency", "type"]);
    this.frequency = new ee({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this.detune = new ee({
      context: this.context,
      units: "cents",
      value: e.detune
    }), Y(this, ["frequency", "detune"]), this.set(e);
  }
  static getDefaults() {
    return Object.assign(ke.getDefaults(), Js.getDefaults(), ji.getDefaults(), Bi.getDefaults(), er.getDefaults(), Ui.getDefaults());
  }
  _start(e) {
    this._oscillator.start(e);
  }
  _stop(e) {
    this._oscillator.stop(e);
  }
  _restart(e) {
    return this._oscillator.restart(e), this;
  }
  get type() {
    let e = "";
    return [
      "am",
      "fm",
      "fat"
    ].some((t) => this._sourceType === t) && (e = this._sourceType), e + this._oscillator.type;
  }
  set type(e) {
    e.substr(0, 2) === "fm" ? (this._createNewOscillator("fm"), this._oscillator = this._oscillator, this._oscillator.type = e.substr(2)) : e.substr(0, 2) === "am" ? (this._createNewOscillator("am"), this._oscillator = this._oscillator, this._oscillator.type = e.substr(2)) : e.substr(0, 3) === "fat" ? (this._createNewOscillator("fat"), this._oscillator = this._oscillator, this._oscillator.type = e.substr(3)) : e === "pwm" ? (this._createNewOscillator("pwm"), this._oscillator = this._oscillator) : e === "pulse" ? this._createNewOscillator("pulse") : (this._createNewOscillator("oscillator"), this._oscillator = this._oscillator, this._oscillator.type = e);
  }
  get partials() {
    return this._oscillator.partials;
  }
  set partials(e) {
    !this._getOscType(this._oscillator, "pulse") && !this._getOscType(this._oscillator, "pwm") && (this._oscillator.partials = e);
  }
  get partialCount() {
    return this._oscillator.partialCount;
  }
  set partialCount(e) {
    !this._getOscType(this._oscillator, "pulse") && !this._getOscType(this._oscillator, "pwm") && (this._oscillator.partialCount = e);
  }
  set(e) {
    return Reflect.has(e, "type") && e.type && (this.type = e.type), super.set(e), this;
  }
  _createNewOscillator(e) {
    if (e !== this._sourceType) {
      this._sourceType = e;
      const t = Ar[e], n = this.now();
      if (this._oscillator) {
        const r = this._oscillator;
        r.stop(n), this.context.setTimeout(() => r.dispose(), this.blockTime);
      }
      this._oscillator = new t({ context: this.context }), this.frequency.connect(this._oscillator.frequency), this.detune.connect(this._oscillator.detune), this._oscillator.connect(this.output), this._oscillator.onstop = () => this.onstop(this), this.state === "started" && this._oscillator.start(n);
    }
  }
  get phase() {
    return this._oscillator.phase;
  }
  set phase(e) {
    this._oscillator.phase = e;
  }
  get sourceType() {
    return this._sourceType;
  }
  set sourceType(e) {
    let t = "sine";
    this._oscillator.type !== "pwm" && this._oscillator.type !== "pulse" && (t = this._oscillator.type), e === "fm" ? this.type = "fm" + t : e === "am" ? this.type = "am" + t : e === "fat" ? this.type = "fat" + t : e === "oscillator" ? this.type = t : e === "pulse" ? this.type = "pulse" : e === "pwm" && (this.type = "pwm");
  }
  _getOscType(e, t) {
    return e instanceof Ar[t];
  }
  get baseType() {
    return this._oscillator.baseType;
  }
  set baseType(e) {
    !this._getOscType(this._oscillator, "pulse") && !this._getOscType(this._oscillator, "pwm") && e !== "pulse" && e !== "pwm" && (this._oscillator.baseType = e);
  }
  get width() {
    if (this._getOscType(this._oscillator, "pulse")) return this._oscillator.width;
  }
  get count() {
    if (this._getOscType(this._oscillator, "fat")) return this._oscillator.count;
  }
  set count(e) {
    this._getOscType(this._oscillator, "fat") && ft(e) && (this._oscillator.count = e);
  }
  get spread() {
    if (this._getOscType(this._oscillator, "fat")) return this._oscillator.spread;
  }
  set spread(e) {
    this._getOscType(this._oscillator, "fat") && ft(e) && (this._oscillator.spread = e);
  }
  get modulationType() {
    if (this._getOscType(this._oscillator, "fm") || this._getOscType(this._oscillator, "am")) return this._oscillator.modulationType;
  }
  set modulationType(e) {
    (this._getOscType(this._oscillator, "fm") || this._getOscType(this._oscillator, "am")) && mt(e) && (this._oscillator.modulationType = e);
  }
  get modulationIndex() {
    if (this._getOscType(this._oscillator, "fm")) return this._oscillator.modulationIndex;
  }
  get harmonicity() {
    if (this._getOscType(this._oscillator, "fm") || this._getOscType(this._oscillator, "am")) return this._oscillator.harmonicity;
  }
  get modulationFrequency() {
    if (this._getOscType(this._oscillator, "pwm")) return this._oscillator.modulationFrequency;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      return wt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.detune.dispose(), this.frequency.dispose(), this._oscillator.dispose(), this;
  }
}, ms = class _s extends Xe {
  constructor() {
    super(M(_s.getDefaults(), arguments)), this.name = "Synth";
    const e = M(_s.getDefaults(), arguments);
    this.oscillator = new vn(Object.assign({
      context: this.context,
      detune: e.detune,
      onstop: () => this.onsilence(this)
    }, e.oscillator)), this.frequency = this.oscillator.frequency, this.detune = this.oscillator.detune, this.envelope = new Ks(Object.assign({ context: this.context }, e.envelope)), this.oscillator.chain(this.envelope, this.output), Y(this, [
      "oscillator",
      "frequency",
      "detune",
      "envelope"
    ]);
  }
  static getDefaults() {
    return Object.assign(Xe.getDefaults(), {
      envelope: Object.assign(Fe(Ne.getDefaults(), Object.keys($.getDefaults())), {
        attack: 5e-3,
        decay: 0.1,
        release: 1,
        sustain: 0.3
      }),
      oscillator: Object.assign(Fe(vn.getDefaults(), [
        ...Object.keys(Ce.getDefaults()),
        "frequency",
        "detune"
      ]), { type: "triangle" })
    });
  }
  _triggerEnvelopeAttack(e, t) {
    if (this.envelope.triggerAttack(e, t), this.oscillator.start(e), this.envelope.sustain === 0) {
      const n = this.toSeconds(this.envelope.attack), r = this.toSeconds(this.envelope.decay);
      this.oscillator.stop(e + n + r);
    }
  }
  _triggerEnvelopeRelease(e) {
    this.envelope.triggerRelease(e), this.oscillator.stop(e + this.toSeconds(this.envelope.release));
  }
  getLevelAtTime(e) {
    return e = this.toSeconds(e), this.envelope.getValueAtTime(e);
  }
  dispose() {
    return super.dispose(), this.oscillator.dispose(), this.envelope.dispose(), this;
  }
}, Gi = class gs extends ms {
  constructor() {
    super(M(gs.getDefaults(), arguments)), this.name = "MembraneSynth", this.portamento = 0;
    const e = M(gs.getDefaults(), arguments);
    this.pitchDecay = e.pitchDecay, this.octaves = e.octaves, Y(this, ["oscillator", "envelope"]);
  }
  static getDefaults() {
    return et(Xe.getDefaults(), ms.getDefaults(), {
      envelope: {
        attack: 1e-3,
        attackCurve: "exponential",
        decay: 0.4,
        release: 1.4,
        sustain: 0.01
      },
      octaves: 10,
      oscillator: { type: "sine" },
      pitchDecay: 0.05
    });
  }
  setNote(e, t) {
    const n = this.toSeconds(t), r = this.toFrequency(e instanceof An ? e.toFrequency() : e), i = r * this.octaves;
    return this.oscillator.frequency.setValueAtTime(i, n), this.oscillator.frequency.exponentialRampToValueAtTime(r, n + this.toSeconds(this.pitchDecay)), this;
  }
  dispose() {
    return super.dispose(), this;
  }
};
Tt([Ii(0)], Gi.prototype, "octaves", void 0);
Tt([Yt(0)], Gi.prototype, "pitchDecay", void 0);
var kr = class vs extends Ne {
  constructor() {
    super(M(vs.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ])), this.name = "FrequencyEnvelope";
    const e = M(vs.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ]);
    this._octaves = e.octaves, this._baseFrequency = this.toFrequency(e.baseFrequency), this._exponent = this.input = new Pi({
      context: this.context,
      value: e.exponent
    }), this._scale = this.output = new Vi({
      context: this.context,
      min: this._baseFrequency,
      max: this._baseFrequency * Math.pow(2, this._octaves)
    }), this._sig.chain(this._exponent, this._scale);
  }
  static getDefaults() {
    return Object.assign(Ne.getDefaults(), {
      baseFrequency: 200,
      exponent: 1,
      octaves: 4
    });
  }
  get baseFrequency() {
    return this._baseFrequency;
  }
  set baseFrequency(e) {
    const t = this.toFrequency(e);
    yt(t, 0), this._baseFrequency = t, this._scale.min = this._baseFrequency, this.octaves = this._octaves;
  }
  get octaves() {
    return this._octaves;
  }
  set octaves(e) {
    this._octaves = e, this._scale.max = this._baseFrequency * Math.pow(2, e);
  }
  get exponent() {
    return this._exponent.value;
  }
  set exponent(e) {
    this._exponent.value = e;
  }
  dispose() {
    return super.dispose(), this._exponent.dispose(), this._scale.dispose(), this;
  }
}, ld = class ys extends Xe {
  constructor() {
    super(M(ys.getDefaults(), arguments)), this.name = "MonoSynth";
    const e = M(ys.getDefaults(), arguments);
    this.oscillator = new vn(Object.assign(e.oscillator, {
      context: this.context,
      detune: e.detune,
      onstop: () => this.onsilence(this)
    })), this.frequency = this.oscillator.frequency, this.detune = this.oscillator.detune, this.filter = new $n(Object.assign(e.filter, { context: this.context })), this.filterEnvelope = new kr(Object.assign(e.filterEnvelope, { context: this.context })), this.envelope = new Ks(Object.assign(e.envelope, { context: this.context })), this.oscillator.chain(this.filter, this.envelope, this.output), this.filterEnvelope.connect(this.filter.frequency), Y(this, [
      "oscillator",
      "frequency",
      "detune",
      "filter",
      "filterEnvelope",
      "envelope"
    ]);
  }
  static getDefaults() {
    return Object.assign(Xe.getDefaults(), {
      envelope: Object.assign(Fe(Ne.getDefaults(), Object.keys($.getDefaults())), {
        attack: 5e-3,
        decay: 0.1,
        release: 1,
        sustain: 0.9
      }),
      filter: Object.assign(Fe($n.getDefaults(), Object.keys($.getDefaults())), {
        Q: 1,
        rolloff: -12,
        type: "lowpass"
      }),
      filterEnvelope: Object.assign(Fe(kr.getDefaults(), Object.keys($.getDefaults())), {
        attack: 0.6,
        baseFrequency: 200,
        decay: 0.2,
        exponent: 2,
        octaves: 3,
        release: 2,
        sustain: 0.5
      }),
      oscillator: Object.assign(Fe(vn.getDefaults(), Object.keys(Ce.getDefaults())), { type: "sawtooth" })
    });
  }
  _triggerEnvelopeAttack(e, t = 1) {
    if (this.envelope.triggerAttack(e, t), this.filterEnvelope.triggerAttack(e), this.oscillator.start(e), this.envelope.sustain === 0) {
      const n = this.toSeconds(this.envelope.attack), r = this.toSeconds(this.envelope.decay);
      this.oscillator.stop(e + n + r);
    }
  }
  _triggerEnvelopeRelease(e) {
    this.envelope.triggerRelease(e), this.filterEnvelope.triggerRelease(e), this.oscillator.stop(e + this.toSeconds(this.envelope.release));
  }
  getLevelAtTime(e) {
    return e = this.toSeconds(e), this.envelope.getValueAtTime(e);
  }
  dispose() {
    return super.dispose(), this.oscillator.dispose(), this.envelope.dispose(), this.filterEnvelope.dispose(), this.filter.dispose(), this;
  }
}, Sh = class Ts extends Nt {
  constructor() {
    super(M(Ts.getDefaults(), arguments, ["url", "onload"])), this.name = "ToneBufferSource", this._source = this.context.createBufferSource(), this._internalChannels = [this._source], this._sourceStarted = !1, this._sourceStopped = !1;
    const e = M(Ts.getDefaults(), arguments, ["url", "onload"]);
    rt(this._source, this._gainNode), this._source.onended = () => this._stopSource(), this.playbackRate = new ue({
      context: this.context,
      param: this._source.playbackRate,
      units: "positive",
      value: e.playbackRate
    }), this.loop = e.loop, this.loopStart = e.loopStart, this.loopEnd = e.loopEnd, this._buffer = new tt(e.url, e.onload, e.onerror), this._internalChannels.push(this._source);
  }
  static getDefaults() {
    return Object.assign(Nt.getDefaults(), {
      url: new tt(),
      loop: !1,
      loopEnd: 0,
      loopStart: 0,
      onload: le,
      onerror: le,
      playbackRate: 1
    });
  }
  get fadeIn() {
    return this._fadeIn;
  }
  set fadeIn(e) {
    this._fadeIn = e;
  }
  get fadeOut() {
    return this._fadeOut;
  }
  set fadeOut(e) {
    this._fadeOut = e;
  }
  get curve() {
    return this._curve;
  }
  set curve(e) {
    this._curve = e;
  }
  start(e, t, n, r = 1) {
    G(this.buffer.loaded, "buffer is either not set or not loaded");
    const i = this.toSeconds(e);
    this._startGain(i, r), this.loop ? t = Rn(t, this.loopStart) : t = Rn(t, 0);
    let o = Math.max(this.toSeconds(t), 0);
    if (this.loop) {
      const a = this.toSeconds(this.loopEnd) || this.buffer.duration, c = this.toSeconds(this.loopStart), l = a - c;
      Vn(o, a) && (o = (o - c) % l + c), Ie(o, this.buffer.duration) && (o = 0);
    }
    if (this._source.buffer = this.buffer.get(), this._source.loopEnd = this.toSeconds(this.loopEnd) || this.buffer.duration, _n(o, this.buffer.duration) && (this._sourceStarted = !0, this._source.start(i, o)), Z(n)) {
      let a = this.toSeconds(n);
      a = Math.max(a, 0), this.stop(i + a);
    }
    return this;
  }
  _stopSource(e) {
    !this._sourceStopped && this._sourceStarted && (this._sourceStopped = !0, this._source.stop(this.toSeconds(e)), this._onended());
  }
  get loopStart() {
    return this._source.loopStart;
  }
  set loopStart(e) {
    this._source.loopStart = this.toSeconds(e);
  }
  get loopEnd() {
    return this._source.loopEnd;
  }
  set loopEnd(e) {
    this._source.loopEnd = this.toSeconds(e);
  }
  get buffer() {
    return this._buffer;
  }
  set buffer(e) {
    this._buffer.set(e);
  }
  get loop() {
    return this._source.loop;
  }
  set loop(e) {
    this._source.loop = e, this._sourceStarted && this.cancelStop();
  }
  dispose() {
    return super.dispose(), this._source.onended = null, this._source.disconnect(), this._buffer.dispose(), this.playbackRate.dispose(), this;
  }
}, Or = class ws extends Ce {
  constructor() {
    super(M(ws.getDefaults(), arguments, ["type"])), this.name = "Noise", this._source = null;
    const e = M(ws.getDefaults(), arguments, ["type"]);
    this._playbackRate = e.playbackRate, this.type = e.type, this._fadeIn = e.fadeIn, this._fadeOut = e.fadeOut;
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
      fadeIn: 0,
      fadeOut: 0,
      playbackRate: 1,
      type: "white"
    });
  }
  get type() {
    return this._type;
  }
  set type(e) {
    if (G(e in Nr, "Noise: invalid type: " + e), this._type !== e && (this._type = e, this.state === "started")) {
      const t = this.now();
      this._stop(t), this._start(t);
    }
  }
  get playbackRate() {
    return this._playbackRate;
  }
  set playbackRate(e) {
    this._playbackRate = e, this._source && (this._source.playbackRate.value = e);
  }
  _start(e) {
    const t = Nr[this._type];
    this._source = new Sh({
      url: t,
      context: this.context,
      fadeIn: this._fadeIn,
      fadeOut: this._fadeOut,
      loop: !0,
      onended: () => this.onstop(this),
      playbackRate: this._playbackRate
    }).connect(this.output), this._source.start(this.toSeconds(e), Math.random() * (t.duration - 1e-3));
  }
  _stop(e) {
    this._source && (this._source.stop(this.toSeconds(e)), this._source = null);
  }
  get fadeIn() {
    return this._fadeIn;
  }
  set fadeIn(e) {
    this._fadeIn = e, this._source && (this._source.fadeIn = this._fadeIn);
  }
  get fadeOut() {
    return this._fadeOut;
  }
  set fadeOut(e) {
    this._fadeOut = e, this._source && (this._source.fadeOut = this._fadeOut);
  }
  _restart(e) {
    this._stop(e), this._start(e);
  }
  dispose() {
    return super.dispose(), this._source && this._source.disconnect(), this;
  }
}, bt = 44100 * 5, On = 2, Ge = {
  brown: null,
  pink: null,
  white: null
}, Nr = {
  get brown() {
    if (!Ge.brown) {
      const s = [];
      for (let e = 0; e < On; e++) {
        const t = new Float32Array(bt);
        s[e] = t;
        let n = 0;
        for (let r = 0; r < bt; r++) {
          const i = Math.random() * 2 - 1;
          t[r] = (n + 0.02 * i) / 1.02, n = t[r], t[r] *= 3.5;
        }
      }
      Ge.brown = new tt().fromArray(s);
    }
    return Ge.brown;
  },
  get pink() {
    if (!Ge.pink) {
      const s = [];
      for (let e = 0; e < On; e++) {
        const t = new Float32Array(bt);
        s[e] = t;
        let n, r, i, o, a, c, l;
        n = r = i = o = a = c = l = 0;
        for (let u = 0; u < bt; u++) {
          const h = Math.random() * 2 - 1;
          n = 0.99886 * n + h * 0.0555179, r = 0.99332 * r + h * 0.0750759, i = 0.969 * i + h * 0.153852, o = 0.8665 * o + h * 0.3104856, a = 0.55 * a + h * 0.5329522, c = -0.7616 * c - h * 0.016898, t[u] = n + r + i + o + a + c + l + h * 0.5362, t[u] *= 0.11, l = h * 0.115926;
        }
      }
      Ge.pink = new tt().fromArray(s);
    }
    return Ge.pink;
  },
  get white() {
    if (!Ge.white) {
      const s = [];
      for (let e = 0; e < On; e++) {
        const t = new Float32Array(bt);
        s[e] = t;
        for (let n = 0; n < bt; n++) t[n] = Math.random() * 2 - 1;
      }
      Ge.white = new tt().fromArray(s);
    }
    return Ge.white;
  }
}, ud = class bs extends Dt {
  constructor() {
    super(M(bs.getDefaults(), arguments)), this.name = "NoiseSynth";
    const e = M(bs.getDefaults(), arguments);
    this.noise = new Or(Object.assign({ context: this.context }, e.noise)), this.envelope = new Ks(Object.assign({ context: this.context }, e.envelope)), this.noise.chain(this.envelope, this.output);
  }
  static getDefaults() {
    return Object.assign(Dt.getDefaults(), {
      envelope: Object.assign(Fe(Ne.getDefaults(), Object.keys($.getDefaults())), {
        decay: 0.1,
        sustain: 0
      }),
      noise: Object.assign(Fe(Or.getDefaults(), Object.keys(Ce.getDefaults())), { type: "white" })
    });
  }
  triggerAttack(e, t = 1) {
    return e = this.toSeconds(e), this.envelope.triggerAttack(e, t), this.noise.start(e), this.envelope.sustain === 0 && this.noise.stop(e + this.toSeconds(this.envelope.attack) + this.toSeconds(this.envelope.decay)), this;
  }
  triggerRelease(e) {
    return e = this.toSeconds(e), this.envelope.triggerRelease(e), this.noise.stop(e + this.toSeconds(this.envelope.release)), this;
  }
  sync() {
    return this._syncState() && (this._syncMethod("triggerAttack", 0), this._syncMethod("triggerRelease", 0)), this;
  }
  triggerAttackRelease(e, t, n = 1) {
    return t = this.toSeconds(t), e = this.toSeconds(e), this.triggerAttack(t, n), this.triggerRelease(t + e), this;
  }
  dispose() {
    return super.dispose(), this.noise.dispose(), this.envelope.dispose(), this;
  }
}, Mr = class zi extends An {
  constructor() {
    super(...arguments), this.name = "MidiClass", this.defaultUnits = "midi";
  }
  _frequencyToUnits(e) {
    return at(super._frequencyToUnits(e));
  }
  _ticksToUnits(e) {
    return at(super._ticksToUnits(e));
  }
  _beatsToUnits(e) {
    return at(super._beatsToUnits(e));
  }
  _secondsToUnits(e) {
    return at(super._secondsToUnits(e));
  }
  toMidi() {
    return this.valueOf();
  }
  toFrequency() {
    return Dr(this.toMidi());
  }
  transpose(e) {
    return new zi(this.context, this.toMidi() + e);
  }
}, hd = class Cs extends Dt {
  constructor() {
    super(M(Cs.getDefaults(), arguments, ["voice", "options"])), this.name = "PolySynth", this._availableVoices = [], this._activeVoices = [], this._voices = [], this._gcTimeout = -1, this._averageActiveVoices = 0, this._syncedRelease = (r) => this.releaseAll(r);
    const e = M(Cs.getDefaults(), arguments, ["voice", "options"]);
    G(!ft(e.voice), "DEPRECATED: The polyphony count is no longer the first argument.");
    const t = e.voice.getDefaults();
    this.options = Object.assign(t, e.options), this.voice = e.voice, this.maxPolyphony = e.maxPolyphony, this._dummyVoice = this._getNextAvailableVoice();
    const n = this._voices.indexOf(this._dummyVoice);
    this._voices.splice(n, 1), this._gcTimeout = this.context.setInterval(this._collectGarbage.bind(this), 1);
  }
  static getDefaults() {
    return Object.assign(Dt.getDefaults(), {
      maxPolyphony: 32,
      options: {},
      voice: ms
    });
  }
  get activeVoices() {
    return this._activeVoices.length;
  }
  _makeVoiceAvailable(e) {
    this._availableVoices.push(e);
    const t = this._activeVoices.findIndex((n) => n.voice === e);
    this._activeVoices.splice(t, 1);
  }
  _getNextAvailableVoice() {
    if (this._availableVoices.length) return this._availableVoices.shift();
    if (this._voices.length < this.maxPolyphony) {
      const e = new this.voice(Object.assign(this.options, {
        context: this.context,
        onsilence: this._makeVoiceAvailable.bind(this)
      }));
      return G(e instanceof Xe, "Voice must extend Monophonic class"), e.connect(this.output), this._voices.push(e), e;
    } else Sn("Max polyphony exceeded. Note dropped.");
  }
  _collectGarbage() {
    if (this._averageActiveVoices = Math.max(this._averageActiveVoices * 0.95, this.activeVoices), this._availableVoices.length && this._voices.length > Math.ceil(this._averageActiveVoices + 1)) {
      const e = this._availableVoices.shift(), t = this._voices.indexOf(e);
      this._voices.splice(t, 1), this.context.isOffline || e.dispose();
    }
  }
  _triggerAttack(e, t, n) {
    e.forEach((r) => {
      const i = new Mr(this.context, r).toMidi(), o = this._getNextAvailableVoice();
      o && (o.triggerAttack(r, t, n), this._activeVoices.push({
        midi: i,
        voice: o,
        released: !1
      }), this.log("triggerAttack", r, t));
    });
  }
  _triggerRelease(e, t) {
    e.forEach((n) => {
      const r = new Mr(this.context, n).toMidi(), i = this._activeVoices.find(({ midi: o, released: a }) => o === r && !a);
      i && (i.voice.triggerRelease(t), i.released = !0, this.log("triggerRelease", n, t));
    });
  }
  _scheduleEvent(e, t, n, r) {
    G(!this.disposed, "Synth was already disposed"), n <= this.now() ? e === "attack" ? this._triggerAttack(t, n, r) : this._triggerRelease(t, n) : this.context.setTimeout(() => {
      this.disposed || this._scheduleEvent(e, t, n, r);
    }, n - this.now());
  }
  triggerAttack(e, t, n) {
    Array.isArray(e) || (e = [e]);
    const r = this.toSeconds(t);
    return this._scheduleEvent("attack", e, r, n), this;
  }
  triggerRelease(e, t) {
    Array.isArray(e) || (e = [e]);
    const n = this.toSeconds(t);
    return this._scheduleEvent("release", e, n), this;
  }
  triggerAttackRelease(e, t, n, r) {
    const i = this.toSeconds(n);
    if (this.triggerAttack(e, i, r), Le(t)) {
      G(Le(e), "If the duration is an array, the notes must also be an array"), e = e;
      for (let o = 0; o < e.length; o++) {
        const a = t[Math.min(o, t.length - 1)], c = this.toSeconds(a);
        G(c > 0, "The duration must be greater than 0"), this.triggerRelease(e[o], i + c);
      }
    } else {
      const o = this.toSeconds(t);
      G(o > 0, "The duration must be greater than 0"), this.triggerRelease(e, i + o);
    }
    return this;
  }
  sync() {
    return this._syncState() && (this._syncMethod("triggerAttack", 1), this._syncMethod("triggerRelease", 1), this.context.transport.on("stop", this._syncedRelease), this.context.transport.on("pause", this._syncedRelease), this.context.transport.on("loopEnd", this._syncedRelease)), this;
  }
  set(e) {
    const t = Fe(e, ["onsilence", "context"]);
    return this.options = et(this.options, t), this._voices.forEach((n) => n.set(t)), this._dummyVoice.set(t), this;
  }
  get() {
    return this._dummyVoice.get();
  }
  releaseAll(e) {
    const t = this.toSeconds(e);
    return this._activeVoices.forEach(({ voice: n }) => {
      n.triggerRelease(t);
    }), this;
  }
  dispose() {
    return super.dispose(), this._dummyVoice.dispose(), this._voices.forEach((e) => e.dispose()), this._activeVoices = [], this._availableVoices = [], this.context.clearInterval(this._gcTimeout), this;
  }
}, Ah = class xs extends $ {
  constructor() {
    super(M(xs.getDefaults(), arguments, ["threshold", "ratio"])), this.name = "Compressor", this._compressor = this.context.createDynamicsCompressor(), this.input = this._compressor, this.output = this._compressor;
    const e = M(xs.getDefaults(), arguments, ["threshold", "ratio"]);
    this.threshold = new ue({
      minValue: this._compressor.threshold.minValue,
      maxValue: this._compressor.threshold.maxValue,
      context: this.context,
      convert: !1,
      param: this._compressor.threshold,
      units: "decibels",
      value: e.threshold
    }), this.attack = new ue({
      minValue: this._compressor.attack.minValue,
      maxValue: this._compressor.attack.maxValue,
      context: this.context,
      param: this._compressor.attack,
      units: "time",
      value: e.attack
    }), this.release = new ue({
      minValue: this._compressor.release.minValue,
      maxValue: this._compressor.release.maxValue,
      context: this.context,
      param: this._compressor.release,
      units: "time",
      value: e.release
    }), this.knee = new ue({
      minValue: this._compressor.knee.minValue,
      maxValue: this._compressor.knee.maxValue,
      context: this.context,
      convert: !1,
      param: this._compressor.knee,
      units: "decibels",
      value: e.knee
    }), this.ratio = new ue({
      minValue: this._compressor.ratio.minValue,
      maxValue: this._compressor.ratio.maxValue,
      context: this.context,
      convert: !1,
      param: this._compressor.ratio,
      units: "positive",
      value: e.ratio
    }), Y(this, [
      "knee",
      "release",
      "attack",
      "ratio",
      "threshold"
    ]);
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), {
      attack: 3e-3,
      knee: 30,
      ratio: 12,
      release: 0.25,
      threshold: -24
    });
  }
  get reduction() {
    return this._compressor.reduction;
  }
  dispose() {
    return super.dispose(), this._compressor.disconnect(), this.attack.dispose(), this.release.dispose(), this.threshold.dispose(), this.ratio.dispose(), this.knee.dispose(), this;
  }
}, dd = class Ss extends $ {
  constructor() {
    super(Object.assign(M(Ss.getDefaults(), arguments, ["threshold"]))), this.name = "Limiter";
    const e = M(Ss.getDefaults(), arguments, ["threshold"]);
    this._compressor = this.input = this.output = new Ah({
      context: this.context,
      ratio: 20,
      attack: 3e-3,
      release: 0.01,
      threshold: e.threshold
    }), this.threshold = this._compressor.threshold, Y(this, "threshold");
  }
  static getDefaults() {
    return Object.assign($.getDefaults(), { threshold: -12 });
  }
  get reduction() {
    return this._compressor.reduction;
  }
  dispose() {
    return super.dispose(), this._compressor.dispose(), this.threshold.dispose(), this;
  }
}, pd = {
  get position() {
    return _e().transport.position;
  },
  get ticks() {
    return _e().transport.ticks;
  },
  get bpm() {
    return _e().transport.bpm;
  },
  get state() {
    return _e().transport.state;
  },
  start(s, e) {
    _e().transport.start(s, e);
  },
  pause(s) {
    _e().transport.pause(s);
  },
  stop(s) {
    _e().transport.stop(s);
  },
  schedule(s, e) {
    return _e().transport.schedule(s, e);
  },
  scheduleOnce(s, e) {
    return _e().transport.scheduleOnce(s, e);
  },
  scheduleRepeat(s, e) {
    return _e().transport.scheduleRepeat(s, e);
  },
  clear(s) {
    _e().transport.clear(s);
  }
};
function fd() {
  return _e().now();
}
export {
  $s as Context,
  od as Distortion,
  ad as FeedbackDelay,
  $n as Filter,
  oe as Gain,
  dd as Limiter,
  Gi as MembraneSynth,
  cd as MetalSynth,
  ld as MonoSynth,
  ud as NoiseSynth,
  hd as PolySynth,
  ms as Synth,
  pd as Transport,
  fd as now,
  ih as setContext,
  id as start
};

//# sourceMappingURL=tone-host.esm.mjs.map