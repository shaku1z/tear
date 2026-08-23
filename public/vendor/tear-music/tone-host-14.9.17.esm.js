var De = (s, e) => () => (e || (s((e = { exports: {} }).exports, e), s = null), e.exports);
function da(s) {
  return Math.pow(10, s / 20);
}
function pa(s) {
  return 20 * (Math.log(s) / Math.LN10);
}
function fa(s) {
  return Math.pow(2, s / 12);
}
var ys = 440;
function ma() {
  return ys;
}
function _a(s) {
  ys = s;
}
function ct(s) {
  return Math.round(ga(s));
}
function ga(s) {
  return 69 + 12 * Math.log2(s / ys);
}
function Ui(s) {
  return ys * Math.pow(2, (s - 69) / 12);
}
var va = /* @__PURE__ */ De(((s, e) => {
  function t(n) {
    if (Array.isArray(n)) return n;
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ya = /* @__PURE__ */ De(((s, e) => {
  function t(n, i) {
    var r = n == null ? null : typeof Symbol < "u" && n[Symbol.iterator] || n["@@iterator"];
    if (r != null) {
      var o, a, c, l, u = [], h = !0, d = !1;
      try {
        if (c = (r = r.call(n)).next, i === 0) {
          if (Object(r) !== r) return;
          h = !1;
        } else for (; !(h = (o = c.call(r)).done) && (u.push(o.value), u.length !== i); h = !0) ;
      } catch (f) {
        d = !0, a = f;
      } finally {
        try {
          if (!h && r.return != null && (l = r.return(), Object(l) !== l)) return;
        } finally {
          if (d) throw a;
        }
      }
      return u;
    }
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Ta = /* @__PURE__ */ De(((s, e) => {
  function t(n, i) {
    (i == null || i > n.length) && (i = n.length);
    for (var r = 0, o = Array(i); r < i; r++) o[r] = n[r];
    return o;
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), wa = /* @__PURE__ */ De(((s, e) => {
  var t = Ta();
  function n(i, r) {
    if (i) {
      if (typeof i == "string") return t(i, r);
      var o = {}.toString.call(i).slice(8, -1);
      return o === "Object" && i.constructor && (o = i.constructor.name), o === "Map" || o === "Set" ? Array.from(i) : o === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o) ? t(i, r) : void 0;
    }
  }
  e.exports = n, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ba = /* @__PURE__ */ De(((s, e) => {
  function t() {
    throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), xa = /* @__PURE__ */ De(((s, e) => {
  var t = va(), n = ya(), i = wa(), r = ba();
  function o(a, c) {
    return t(a) || n(a, c) || i(a, c) || r();
  }
  e.exports = o, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Ca = /* @__PURE__ */ De(((s, e) => {
  function t(n, i) {
    if (!(n instanceof i)) throw new TypeError("Cannot call a class as a function");
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Gi = /* @__PURE__ */ De(((s, e) => {
  function t(n) {
    "@babel/helpers - typeof";
    return e.exports = t = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(i) {
      return typeof i;
    } : function(i) {
      return i && typeof Symbol == "function" && i.constructor === Symbol && i !== Symbol.prototype ? "symbol" : typeof i;
    }, e.exports.__esModule = !0, e.exports.default = e.exports, t(n);
  }
  e.exports = t, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Sa = /* @__PURE__ */ De(((s, e) => {
  var t = Gi().default;
  function n(i, r) {
    if (t(i) != "object" || !i) return i;
    var o = i[Symbol.toPrimitive];
    if (o !== void 0) {
      var a = o.call(i, r || "default");
      if (t(a) != "object") return a;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (r === "string" ? String : Number)(i);
  }
  e.exports = n, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Aa = /* @__PURE__ */ De(((s, e) => {
  var t = Gi().default, n = Sa();
  function i(r) {
    var o = n(r, "string");
    return t(o) == "symbol" ? o : o + "";
  }
  e.exports = i, e.exports.__esModule = !0, e.exports.default = e.exports;
})), ka = /* @__PURE__ */ De(((s, e) => {
  var t = Aa();
  function n(r, o) {
    for (var a = 0; a < o.length; a++) {
      var c = o[a];
      c.enumerable = c.enumerable || !1, c.configurable = !0, "value" in c && (c.writable = !0), Object.defineProperty(r, t(c.key), c);
    }
  }
  function i(r, o, a) {
    return o && n(r.prototype, o), a && n(r, a), Object.defineProperty(r, "prototype", { writable: !1 }), r;
  }
  e.exports = i, e.exports.__esModule = !0, e.exports.default = e.exports;
})), Oa = /* @__PURE__ */ De(((s, e) => {
  (function(t, n) {
    typeof s == "object" && typeof e < "u" ? n(s, xa(), Ca(), ka()) : typeof define == "function" && define.amd ? define([
      "exports",
      "@babel/runtime/helpers/slicedToArray",
      "@babel/runtime/helpers/classCallCheck",
      "@babel/runtime/helpers/createClass"
    ], n) : (t = typeof globalThis < "u" ? globalThis : t || self, n(t.automationEvents = {}, t._slicedToArray, t._classCallCheck, t._createClass));
  })(s, (function(t, n, i, r) {
    "use strict";
    var o = function(A, x, C) {
      return {
        endTime: x,
        insertTime: C,
        type: "exponentialRampToValue",
        value: A
      };
    }, a = function(A, x, C) {
      return {
        endTime: x,
        insertTime: C,
        type: "linearRampToValue",
        value: A
      };
    }, c = function(A, x) {
      return {
        startTime: x,
        type: "setValue",
        value: A
      };
    }, l = function(A, x, C) {
      return {
        duration: C,
        startTime: x,
        type: "setValueCurve",
        values: A
      };
    }, u = function(A, x, C) {
      var D = C.startTime, R = C.target, V = C.timeConstant;
      return R + (x - R) * Math.exp((D - A) / V);
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
    }, _ = function(A, x, C, D) {
      var R = A[x];
      return R === void 0 ? D : f(R) || p(R) ? R.value : m(R) ? R.values[R.values.length - 1] : u(C, _(A, x - 1, R.startTime, D), R);
    }, v = function(A, x, C, D, R) {
      return C === void 0 ? [D.insertTime, R] : f(C) ? [C.endTime, C.value] : p(C) ? [C.startTime, C.value] : m(C) ? [C.startTime + C.duration, C.values[C.values.length - 1]] : [C.startTime, _(A, x - 1, C.startTime, R)];
    }, b = function(A) {
      return A.type === "cancelAndHold";
    }, S = function(A) {
      return A.type === "cancelScheduledValues";
    }, k = function(A) {
      return b(A) || S(A) ? A.cancelTime : h(A) || d(A) ? A.endTime : A.startTime;
    }, g = function(A, x, C, D) {
      var R = D.endTime, V = D.value;
      return C === V ? V : 0 < C && 0 < V || C < 0 && V < 0 ? C * Math.pow(V / C, (A - x) / (R - x)) : A < R ? C : V;
    }, T = function(A, x, C, D) {
      var R = D.endTime, V = D.value;
      return C + (A - x) / (R - x) * (V - C);
    }, y = function(A, x) {
      var C = Math.floor(x);
      if (C === x) return A[C];
      var D = Math.ceil(x);
      return (1 - (x - C)) * A[C] + (1 - (D - x)) * A[D];
    }, w = function(A, x) {
      var C = x.duration, D = x.startTime, R = x.values;
      return y(R, (A - D) / C * (R.length - 1));
    }, I = function(A, x, C) {
      for (var D = A.length, R = Math.max(1, Math.floor(C / x * D)) + 1, V = A instanceof Float32Array ? new Float32Array(R) : A.slice(0, R), ae = 0; ae < R; ae += 1) V[ae] = y(A, ae / (R - 1) * C / x * (D - 1));
      return V;
    }, E = function(A) {
      return A.type === "setTarget";
    }, N = /* @__PURE__ */ (function() {
      function P(A) {
        i(this, P), this._automationEvents = [], this._currenTime = 0, this._defaultValue = A;
      }
      return r(P, [
        {
          key: Symbol.iterator,
          value: function() {
            return this._automationEvents[Symbol.iterator]();
          }
        },
        {
          key: "add",
          value: function(x) {
            var C = k(x);
            if (b(x) || S(x)) {
              var D = this._automationEvents.findIndex(function(Me) {
                return S(x) && m(Me) ? Me.startTime + Me.duration >= C : k(Me) >= C;
              }), R = this._automationEvents[D];
              if (D !== -1 && (this._automationEvents = this._automationEvents.slice(0, D)), b(x)) {
                var V = this._automationEvents[this._automationEvents.length - 1];
                if (R !== void 0 && f(R)) {
                  if (V !== void 0 && E(V)) throw new Error("The internal list is malformed.");
                  var ae = V === void 0 ? R.insertTime : m(V) ? V.startTime + V.duration : k(V), $ = V === void 0 ? this._defaultValue : m(V) ? V.values[V.values.length - 1] : V.value, ee = h(R) ? g(C, ae, $, R) : T(C, ae, $, R), oe = h(R) ? o(ee, C, this._currenTime) : a(ee, C, this._currenTime);
                  this._automationEvents.push(oe);
                }
                if (V !== void 0 && E(V) && this._automationEvents.push(c(this.getValue(C), C)), V !== void 0 && m(V) && V.startTime + V.duration > C) {
                  var W = C - V.startTime;
                  this._automationEvents[this._automationEvents.length - 1] = l(I(V.values, V.duration, W), V.startTime, W);
                }
              }
            } else {
              var we = this._automationEvents.findIndex(function(Me) {
                return k(Me) > C;
              }), Oe = we === -1 ? this._automationEvents[this._automationEvents.length - 1] : this._automationEvents[we - 1];
              if (Oe !== void 0 && m(Oe) && k(Oe) + Oe.duration > C) return !1;
              var ze = h(x) ? o(x.value, x.endTime, this._currenTime) : d(x) ? a(x.value, C, this._currenTime) : x;
              if (we === -1) this._automationEvents.push(ze);
              else {
                if (m(x) && C + x.duration > k(this._automationEvents[we])) return !1;
                this._automationEvents.splice(we, 0, ze);
              }
            }
            return !0;
          }
        },
        {
          key: "flush",
          value: function(x) {
            var C = this._automationEvents.findIndex(function(V) {
              return k(V) > x;
            });
            if (C > 1) {
              var D = this._automationEvents.slice(C - 1), R = D[0];
              E(R) && D.unshift(c(_(this._automationEvents, C - 2, R.startTime, this._defaultValue), R.startTime)), this._automationEvents = D;
            }
          }
        },
        {
          key: "getValue",
          value: function(x) {
            if (this._automationEvents.length === 0) return this._defaultValue;
            var C = this._automationEvents.findIndex(function(Oe) {
              return k(Oe) > x;
            }), D = this._automationEvents[C], R = (C === -1 ? this._automationEvents.length : C) - 1, V = this._automationEvents[R];
            if (V !== void 0 && E(V) && (D === void 0 || !f(D) || D.insertTime > x)) return u(x, _(this._automationEvents, R - 1, V.startTime, this._defaultValue), V);
            if (V !== void 0 && p(V) && (D === void 0 || !f(D))) return V.value;
            if (V !== void 0 && m(V) && (D === void 0 || !f(D) || V.startTime + V.duration > x))
              return x < V.startTime + V.duration ? w(x, V) : V.values[V.values.length - 1];
            if (V !== void 0 && f(V) && (D === void 0 || !f(D))) return V.value;
            if (D !== void 0 && h(D)) {
              var ae = n(v(this._automationEvents, R, V, D, this._defaultValue), 2), $ = ae[0], ee = ae[1];
              return g(x, $, ee, D);
            }
            if (D !== void 0 && d(D)) {
              var oe = n(v(this._automationEvents, R, V, D, this._defaultValue), 2), W = oe[0], we = oe[1];
              return T(x, W, we, D);
            }
            return this._defaultValue;
          }
        }
      ]);
    })(), M = function(A) {
      return {
        cancelTime: A,
        type: "cancelAndHold"
      };
    }, q = function(A) {
      return {
        cancelTime: A,
        type: "cancelScheduledValues"
      };
    }, F = function(A, x) {
      return {
        endTime: x,
        type: "exponentialRampToValue",
        value: A
      };
    }, G = function(A, x) {
      return {
        endTime: x,
        type: "linearRampToValue",
        value: A
      };
    }, j = function(A, x, C) {
      return {
        startTime: x,
        target: A,
        timeConstant: C,
        type: "setTarget"
      };
    };
    t.AutomationEventList = N, t.createCancelAndHoldAutomationEvent = M, t.createCancelScheduledValuesAutomationEvent = q, t.createExponentialRampToValueAutomationEvent = F, t.createLinearRampToValueAutomationEvent = G, t.createSetTargetAutomationEvent = j, t.createSetValueAutomationEvent = c, t.createSetValueCurveAutomationEvent = l;
  }));
})), Je = Oa(), Na = () => new DOMException("", "AbortError"), Ma = (s) => (e, t, [n, i, r], o) => {
  s(e[i], [
    t,
    n,
    r
  ], (a) => a[0] === t && a[1] === n, o);
}, Da = (s) => (e, t, n) => {
  const i = [];
  for (let r = 0; r < n.numberOfInputs; r += 1) i.push(/* @__PURE__ */ new Set());
  s.set(e, {
    activeInputs: i,
    outputs: /* @__PURE__ */ new Set(),
    passiveInputs: /* @__PURE__ */ new WeakMap(),
    renderer: t
  });
}, Ea = (s) => (e, t) => {
  s.set(e, {
    activeInputs: /* @__PURE__ */ new Set(),
    passiveInputs: /* @__PURE__ */ new WeakMap(),
    renderer: t
  });
}, kt = /* @__PURE__ */ new WeakSet(), zi = /* @__PURE__ */ new WeakMap(), Rn = /* @__PURE__ */ new WeakMap(), $i = /* @__PURE__ */ new WeakMap(), Vn = /* @__PURE__ */ new WeakMap(), Ts = /* @__PURE__ */ new WeakMap(), Zi = /* @__PURE__ */ new WeakMap(), Ms = /* @__PURE__ */ new WeakMap(), Ds = /* @__PURE__ */ new WeakMap(), Es = /* @__PURE__ */ new WeakMap(), Xi = { construct() {
  return Xi;
} }, Ia = (s) => {
  try {
    new new Proxy(s, Xi)();
  } catch {
    return !1;
  }
  return !0;
}, li = /^import(?:(?:[\s]+[\w]+|(?:[\s]+[\w]+[\s]*,)?[\s]*\{[\s]*[\w]+(?:[\s]+as[\s]+[\w]+)?(?:[\s]*,[\s]*[\w]+(?:[\s]+as[\s]+[\w]+)?)*[\s]*}|(?:[\s]+[\w]+[\s]*,)?[\s]*\*[\s]+as[\s]+[\w]+)[\s]+from)?(?:[\s]*)("([^"\\]|\\.)+"|'([^'\\]|\\.)+')(?:[\s]*);?/, ui = (s, e) => {
  const t = [];
  let n = s.replace(/^[\s]+/, ""), i = n.match(li);
  for (; i !== null; ) {
    const r = i[1].slice(1, -1), o = i[0].replace(/([\s]+)?;?$/, "").replace(r, new URL(r, e).toString());
    t.push(o), n = n.slice(i[0].length).replace(/^[\s]+/, ""), i = n.match(li);
  }
  return [t.join(";"), n];
}, hi = (s) => {
  if (s !== void 0 && !Array.isArray(s)) throw new TypeError("The parameterDescriptors property of given value for processorCtor is not an array.");
}, di = (s) => {
  if (!Ia(s)) throw new TypeError("The given value for processorCtor should be a constructor.");
  if (s.prototype === null || typeof s.prototype != "object") throw new TypeError("The given value for processorCtor should have a prototype.");
}, Ra = (s, e, t, n, i, r, o, a, c, l, u, h, d) => {
  let f = 0;
  return (p, m, _ = { credentials: "omit" }) => {
    const v = u.get(p);
    if (v !== void 0 && v.has(m)) return Promise.resolve();
    const b = l.get(p);
    if (b !== void 0) {
      const g = b.get(m);
      if (g !== void 0) return g;
    }
    const S = r(p), k = S.audioWorklet === void 0 ? i(m).then(([g, T]) => {
      const [y, w] = ui(g, T);
      return t(`${y};((a,b)=>{(a[b]=a[b]||[]).push((AudioWorkletProcessor,global,registerProcessor,sampleRate,self,window)=>{${w}
})})(window,'_AWGS')`);
    }).then(() => {
      const g = d._AWGS.pop();
      if (g === void 0) throw new SyntaxError();
      n(S.currentTime, S.sampleRate, () => g(class {
      }, void 0, (T, y) => {
        if (T.trim() === "") throw e();
        const w = Ds.get(S);
        if (w !== void 0) {
          if (w.has(T)) throw e();
          di(y), hi(y.parameterDescriptors), w.set(T, y);
        } else
          di(y), hi(y.parameterDescriptors), Ds.set(S, /* @__PURE__ */ new Map([[T, y]]));
      }, S.sampleRate, void 0, void 0));
    }) : Promise.all([i(m), Promise.resolve(s(h, h))]).then(([[g, T], y]) => {
      const w = f + 1;
      f = w;
      const [I, E] = ui(g, T), N = `${I};((AudioWorkletProcessor,registerProcessor)=>{${E}
})(${y ? "AudioWorkletProcessor" : "class extends AudioWorkletProcessor {__b=new WeakSet();constructor(){super();(p=>p.postMessage=(q=>(m,t)=>q.call(p,m,t?t.filter(u=>!this.__b.has(u)):t))(p.postMessage))(this.port)}}"},(n,p)=>registerProcessor(n,class extends p{${y ? "" : "__c = (a) => a.forEach(e=>this.__b.add(e.buffer));"}process(i,o,p){${y ? "" : "i.forEach(this.__c);o.forEach(this.__c);this.__c(Object.values(p));"}return super.process(i.map(j=>j.some(k=>k.length===0)?[]:j),o,p)}}));registerProcessor('__sac${w}',class extends AudioWorkletProcessor{process(){return !1}})`, M = new Blob([N], { type: "application/javascript; charset=utf-8" }), q = URL.createObjectURL(M);
      return S.audioWorklet.addModule(q, _).then(() => {
        if (a(S)) return S;
        const F = o(S);
        return F.audioWorklet.addModule(q, _).then(() => F);
      }).then((F) => {
        if (c === null) throw new SyntaxError();
        try {
          new c(F, `__sac${w}`);
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
}, Fe = (s, e) => {
  const t = s.get(e);
  if (t === void 0) throw new Error("A value with the given key could not be found.");
  return t;
}, ws = (s, e) => {
  const t = Array.from(s).filter(e);
  if (t.length > 1) throw Error("More than one element was found.");
  if (t.length === 0) throw Error("No element was found.");
  const [n] = t;
  return s.delete(n), n;
}, Hi = (s, e, t, n) => {
  const i = Fe(s, e), r = ws(i, (o) => o[0] === t && o[1] === n);
  return i.size === 0 && s.delete(e), r;
}, $t = (s) => Fe(Zi, s), Ot = (s) => {
  if (kt.has(s)) throw new Error("The AudioNode is already stored.");
  kt.add(s), $t(s).forEach((e) => e(!0));
}, Qi = (s) => "port" in s, Zt = (s) => {
  if (!kt.has(s)) throw new Error("The AudioNode is not stored.");
  kt.delete(s), $t(s).forEach((e) => e(!1));
}, Is = (s, e) => {
  !Qi(s) && e.every((t) => t.size === 0) && Zt(s);
}, Va = (s, e, t, n, i, r, o, a, c, l, u, h, d) => {
  const f = /* @__PURE__ */ new WeakMap();
  return (p, m, _, v, b) => {
    const { activeInputs: S, passiveInputs: k } = r(m), { outputs: g } = r(p), T = a(p), y = (w) => {
      const I = c(m), E = c(p);
      if (w) {
        const N = Hi(k, p, _, v);
        s(S, p, N, !1), !b && !h(p) && t(E, I, _, v), d(m) && Ot(m);
      } else {
        const N = n(S, p, _, v);
        e(k, v, N, !1), !b && !h(p) && i(E, I, _, v);
        const M = o(m);
        if (M === 0)
          u(m) && Is(m, S);
        else {
          const q = f.get(m);
          q !== void 0 && clearTimeout(q), f.set(m, setTimeout(() => {
            u(m) && Is(m, S);
          }, M * 1e3));
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
}, Fa = (s) => (e, t, [n, i, r], o) => {
  const a = e.get(n);
  a === void 0 ? e.set(n, /* @__PURE__ */ new Set([[
    i,
    t,
    r
  ]])) : s(a, [
    i,
    t,
    r
  ], (c) => c[0] === i && c[1] === t, o);
}, Pa = (s) => (e, t) => {
  const n = s(e, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  });
  t.connect(n).connect(e.destination);
  const i = () => {
    t.removeEventListener("ended", i), t.disconnect(n), n.disconnect();
  };
  t.addEventListener("ended", i);
}, qa = (s) => (e, t) => {
  s(e).add(t);
}, La = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  fftSize: 2048,
  maxDecibels: -30,
  minDecibels: -100,
  smoothingTimeConstant: 0.8
}, Wa = (s, e, t, n, i, r) => class extends s {
  constructor(a, c) {
    const l = i(a), u = n(l, {
      ...La,
      ...c
    }), h = r(l) ? e() : null;
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
}, Te = (s, e) => s.context === e, ja = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), i = async (r, o) => {
    let a = e(r);
    return Te(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      fftSize: a.fftSize,
      maxDecibels: a.maxDecibels,
      minDecibels: a.minDecibels,
      smoothingTimeConstant: a.smoothingTimeConstant
    })), n.set(o, a), await t(r, o, a), a;
  };
  return { render(r, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : i(r, o);
  } };
}, cs = (s) => {
  try {
    s.copyToChannel(/* @__PURE__ */ new Float32Array(1), 0, -1);
  } catch {
    return !1;
  }
  return !0;
}, Be = () => new DOMException("", "IndexSizeError"), Fn = (s) => {
  s.getChannelData = /* @__PURE__ */ ((e) => (t) => {
    try {
      return e.call(s, t);
    } catch (n) {
      throw n.code === 12 ? Be() : n;
    }
  })(s.getChannelData);
}, Ba = { numberOfChannels: 1 }, Ua = (s, e, t, n, i, r, o, a) => {
  let c = null;
  return class Yi {
    constructor(u) {
      if (i === null) throw new Error("Missing the native OfflineAudioContext constructor.");
      const { length: h, numberOfChannels: d, sampleRate: f } = {
        ...Ba,
        ...u
      };
      c === null && (c = new i(1, 1, 44100));
      const p = n !== null && e(r, r) ? new n({
        length: h,
        numberOfChannels: d,
        sampleRate: f
      }) : c.createBuffer(d, h, f);
      if (p.numberOfChannels === 0) throw t();
      return typeof p.copyFromChannel != "function" ? (o(p), Fn(p)) : e(cs, () => cs(p)) || a(p), s.add(p), p;
    }
    static [Symbol.hasInstance](u) {
      return u !== null && typeof u == "object" && Object.getPrototypeOf(u) === Yi.prototype || s.has(u);
    }
  };
}, Ne = -34028234663852886e22, be = 34028234663852886e22, Ze = (s) => kt.has(s), Ga = {
  buffer: null,
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  loop: !1,
  loopEnd: 0,
  loopStart: 0,
  playbackRate: 1
}, za = (s, e, t, n, i, r, o, a) => class extends s {
  constructor(l, u) {
    const h = r(l), d = {
      ...Ga,
      ...u
    }, f = i(h, d), p = o(h), m = p ? e() : null;
    super(l, !1, f, m), this._audioBufferSourceNodeRenderer = m, this._isBufferNullified = !1, this._isBufferSet = d.buffer !== null, this._nativeAudioBufferSourceNode = f, this._onended = null, this._playbackRate = t(this, p, f.playbackRate, be, Ne);
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
      Ot(this);
      const d = () => {
        this._nativeAudioBufferSourceNode.removeEventListener("ended", d), Ze(this) && Zt(this);
      };
      this._nativeAudioBufferSourceNode.addEventListener("ended", d);
    }
  }
  stop(l = 0) {
    this._nativeAudioBufferSourceNode.stop(l), this._audioBufferSourceNodeRenderer !== null && (this._audioBufferSourceNodeRenderer.stop = l);
  }
}, $a = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap();
  let o = null, a = null;
  const c = async (l, u) => {
    let h = t(l);
    const d = Te(h, u);
    return d || (h = e(u, {
      buffer: h.buffer,
      channelCount: h.channelCount,
      channelCountMode: h.channelCountMode,
      channelInterpretation: h.channelInterpretation,
      loop: h.loop,
      loopEnd: h.loopEnd,
      loopStart: h.loopStart,
      playbackRate: h.playbackRate.value
    }), o !== null && h.start(...o), a !== null && h.stop(a)), r.set(u, h), d ? await s(u, l.playbackRate, h.playbackRate) : await n(u, l.playbackRate, h.playbackRate), await i(l, u, h), h;
  };
  return {
    set start(l) {
      o = l;
    },
    set stop(l) {
      a = l;
    },
    render(l, u) {
      const h = r.get(u);
      return h !== void 0 ? Promise.resolve(h) : c(l, u);
    }
  };
}, Za = (s) => "playbackRate" in s, Xa = (s) => "frequency" in s && "gain" in s, Ha = (s) => "offset" in s, Qa = (s) => !("frequency" in s) && "gain" in s, Ya = (s) => "detune" in s && "frequency" in s && !("gain" in s), Ja = (s) => "pan" in s, xe = (s) => Fe(zi, s), Xt = (s) => Fe($i, s), Rs = (s, e) => {
  const { activeInputs: t } = xe(s);
  t.forEach((i) => i.forEach(([r]) => {
    e.includes(s) || Rs(r, [...e, s]);
  }));
  const n = Za(s) ? [s.playbackRate] : Qi(s) ? Array.from(s.parameters.values()) : Xa(s) ? [
    s.Q,
    s.detune,
    s.frequency,
    s.gain
  ] : Ha(s) ? [s.offset] : Qa(s) ? [s.gain] : Ya(s) ? [s.detune, s.frequency] : Ja(s) ? [s.pan] : [];
  for (const i of n) {
    const r = Xt(i);
    r !== void 0 && r.activeInputs.forEach(([o]) => Rs(o, e));
  }
  Ze(s) && Zt(s);
}, bs = (s) => {
  Rs(s.destination, []);
}, Ji = (s) => s === void 0 || typeof s == "number" || typeof s == "string" && (s === "balanced" || s === "interactive" || s === "playback"), Ka = (s, e, t, n, i, r, o, a, c) => class extends s {
  constructor(u = {}) {
    if (c === null) throw new Error("Missing the native AudioContext constructor.");
    let h;
    try {
      h = new c(u);
    } catch (p) {
      throw p.code === 12 && p.message === "sampleRate is not in range" ? t() : p;
    }
    if (h === null) throw n();
    if (!Ji(u.latencyHint)) throw new TypeError(`The provided value '${u.latencyHint}' is not a valid enum value of type AudioContextLatencyCategory.`);
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
      this._nativeGainNode !== null && this._nativeOscillatorNode !== null && (this._nativeOscillatorNode.stop(), this._nativeGainNode.disconnect(), this._nativeOscillatorNode.disconnect()), bs(this);
    }));
  }
  createMediaElementSource(u) {
    return new i(this, { mediaElement: u });
  }
  createMediaStreamDestination() {
    return new r(this);
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
}, eo = (s, e, t, n, i, r, o, a) => class extends s {
  constructor(l, u) {
    const h = r(l), d = o(h), f = i(h, u, d), p = d ? e(a) : null;
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
}, to = (s) => {
  const e = /* @__PURE__ */ new WeakMap(), t = async (n, i) => {
    const r = i.destination;
    return e.set(i, r), await s(n, i, r), r;
  };
  return { render(n, i) {
    const r = e.get(i);
    return r !== void 0 ? Promise.resolve(r) : t(n, i);
  } };
}, so = (s, e, t, n, i, r, o, a) => (c, l) => {
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
    const N = () => {
      if (w) return;
      w = !0;
      const G = n(l, 256, 9, 0);
      G.onaudioprocess = ({ inputBuffer: j }) => {
        const P = [
          r(j, g, 0),
          r(j, g, 1),
          r(j, g, 2),
          r(j, g, 3),
          r(j, g, 4),
          r(j, g, 5)
        ];
        P.some((x, C) => x !== I[C]) && (u.setOrientation(...P), I = P);
        const A = [
          r(j, g, 6),
          r(j, g, 7),
          r(j, g, 8)
        ];
        A.some((x, C) => x !== E[C]) && (u.setPosition(...A), E = A);
      }, T.connect(G);
    }, M = (G) => (j) => {
      j !== I[G] && (I[G] = j, u.setOrientation(...I));
    }, q = (G) => (j) => {
      j !== E[G] && (E[G] = j, u.setPosition(...E));
    }, F = (G, j, P) => {
      const A = t(l, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        offset: j
      });
      A.connect(T, 0, G), A.start(), Object.defineProperty(A.offset, "defaultValue", { get() {
        return j;
      } });
      const x = s({ context: c }, y, A.offset, be, Ne);
      return a(x, "value", (C) => () => C.call(x), (C) => (D) => {
        try {
          C.call(x, D);
        } catch (R) {
          if (R.code !== 9) throw R;
        }
        N(), y && P(D);
      }), x.cancelAndHoldAtTime = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.cancelAndHoldAtTime), x.cancelScheduledValues = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.cancelScheduledValues), x.exponentialRampToValueAtTime = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.exponentialRampToValueAtTime), x.linearRampToValueAtTime = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.linearRampToValueAtTime), x.setTargetAtTime = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.setTargetAtTime), x.setValueAtTime = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.setValueAtTime), x.setValueCurveAtTime = /* @__PURE__ */ ((C) => y ? () => {
        throw i();
      } : (...D) => {
        const R = C.apply(x, D);
        return N(), R;
      })(x.setValueCurveAtTime), x;
    };
    return {
      forwardX: F(0, 0, M(0)),
      forwardY: F(1, 0, M(1)),
      forwardZ: F(2, -1, M(2)),
      positionX: F(6, 0, q(0)),
      positionY: F(7, 0, q(1)),
      positionZ: F(8, 0, q(2)),
      upX: F(3, 0, M(3)),
      upY: F(4, 1, M(4)),
      upZ: F(5, 0, M(5))
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
}, ls = (s) => "context" in s, Ht = (s) => ls(s[0]), yt = (s, e, t, n) => {
  for (const i of s) if (t(i)) {
    if (n) return !1;
    throw Error("The set contains at least one similar element.");
  }
  return s.add(e), !0;
}, pi = (s, e, [t, n], i) => {
  yt(s, [
    e,
    t,
    n
  ], (r) => r[0] === e && r[1] === t, i);
}, fi = (s, [e, t, n], i) => {
  const r = s.get(e);
  r === void 0 ? s.set(e, /* @__PURE__ */ new Set([[t, n]])) : yt(r, [t, n], (o) => o[0] === t, i);
}, Rt = (s) => "inputs" in s, us = (s, e, t, n) => {
  if (Rt(e)) {
    const i = e.inputs[n];
    return s.connect(i, t, 0), [
      i,
      t,
      0
    ];
  }
  return s.connect(e, t, n), [
    e,
    t,
    n
  ];
}, Ki = (s, e, t) => {
  for (const n of s) if (n[0] === e && n[1] === t)
    return s.delete(n), n;
  return null;
}, no = (s, e, t) => ws(s, (n) => n[0] === e && n[1] === t), er = (s, e) => {
  if (!$t(s).delete(e)) throw new Error("Missing the expected event listener.");
}, tr = (s, e, t) => {
  const n = Fe(s, e), i = ws(n, (r) => r[0] === t);
  return n.size === 0 && s.delete(e), i;
}, hs = (s, e, t, n) => {
  Rt(e) ? s.disconnect(e.inputs[n], t, 0) : s.disconnect(e, t, n);
}, ne = (s) => Fe(Rn, s), jt = (s) => Fe(Vn, s), pt = (s) => Ms.has(s), ss = (s) => !kt.has(s), mi = (s, e) => new Promise((t) => {
  if (e !== null) t(!0);
  else {
    const n = s.createScriptProcessor(256, 1, 1), i = s.createGain(), r = s.createBuffer(1, 2, 44100), o = r.getChannelData(0);
    o[0] = 1, o[1] = 1;
    const a = s.createBufferSource();
    a.buffer = r, a.loop = !0, a.connect(n).connect(s.destination), a.connect(i), a.disconnect(i), n.onaudioprocess = (c) => {
      const l = c.inputBuffer.getChannelData(0);
      Array.prototype.some.call(l, (u) => u === 1) ? t(!0) : t(!1), a.stop(), n.onaudioprocess = null, a.disconnect(n), n.disconnect(s.destination);
    }, a.start();
  }
}), Os = (s, e) => {
  const t = /* @__PURE__ */ new Map();
  for (const n of s) for (const i of n) {
    const r = t.get(i);
    t.set(i, r === void 0 ? 1 : r + 1);
  }
  t.forEach((n, i) => e(i, n));
}, ds = (s) => "context" in s, io = (s) => {
  const e = /* @__PURE__ */ new Map();
  s.connect = /* @__PURE__ */ ((t) => (n, i = 0, r = 0) => {
    const o = ds(n) ? t(n, i, r) : t(n, i), a = e.get(n);
    return a === void 0 ? e.set(n, [{
      input: r,
      output: i
    }]) : a.every((c) => c.input !== r || c.output !== i) && a.push({
      input: r,
      output: i
    }), o;
  })(s.connect.bind(s)), s.disconnect = /* @__PURE__ */ ((t) => (n, i, r) => {
    if (t.apply(s), n === void 0) e.clear();
    else if (typeof n == "number") for (const [o, a] of e) {
      const c = a.filter((l) => l.output !== n);
      c.length === 0 ? e.delete(o) : e.set(o, c);
    }
    else if (e.has(n)) if (i === void 0) e.delete(n);
    else {
      const o = e.get(n);
      if (o !== void 0) {
        const a = o.filter((c) => c.output !== i && (c.input !== r || r === void 0));
        a.length === 0 ? e.delete(n) : e.set(n, a);
      }
    }
    for (const [o, a] of e) a.forEach((c) => {
      ds(o) ? s.connect(o, c.output, c.input) : s.connect(o, c.output);
    });
  })(s.disconnect);
}, ro = (s, e, t, n) => {
  const { activeInputs: i, passiveInputs: r } = Xt(e), { outputs: o } = xe(s), a = $t(s), c = (l) => {
    const u = ne(s), h = jt(e);
    if (l) {
      const d = tr(r, s, t);
      pi(i, s, d, !1), !n && !pt(s) && u.connect(h, t);
    } else {
      const d = no(i, s, t);
      fi(r, d, !1), !n && !pt(s) && u.disconnect(h, t);
    }
  };
  return yt(o, [e, t], (l) => l[0] === e && l[1] === t, !0) ? (a.add(c), Ze(s) ? pi(i, s, [t, c], !0) : fi(r, [
    s,
    t,
    c
  ], !0), !0) : !1;
}, ao = (s, e, t, n) => {
  const { activeInputs: i, passiveInputs: r } = xe(e), o = Ki(i[n], s, t);
  return o === null ? [Hi(r, s, t, n)[2], !1] : [o[2], !0];
}, oo = (s, e, t) => {
  const { activeInputs: n, passiveInputs: i } = Xt(e), r = Ki(n, s, t);
  return r === null ? [tr(i, s, t)[1], !1] : [r[2], !0];
}, Pn = (s, e, t, n, i) => {
  const [r, o] = ao(s, t, n, i);
  if (r !== null && (er(s, r), o && !e && !pt(s) && hs(ne(s), ne(t), n, i)), Ze(t)) {
    const { activeInputs: a } = xe(t);
    Is(t, a);
  }
}, qn = (s, e, t, n) => {
  const [i, r] = oo(s, t, n);
  i !== null && (er(s, i), r && !e && !pt(s) && ne(s).disconnect(jt(t), n));
}, co = (s, e) => {
  const t = xe(s), n = [];
  for (const i of t.outputs)
    Ht(i) ? Pn(s, e, ...i) : qn(s, e, ...i), n.push(i[0]);
  return t.outputs.clear(), n;
}, lo = (s, e, t) => {
  const n = xe(s), i = [];
  for (const r of n.outputs) r[1] === t && (Ht(r) ? Pn(s, e, ...r) : qn(s, e, ...r), i.push(r[0]), n.outputs.delete(r));
  return i;
}, uo = (s, e, t, n, i) => {
  const r = xe(s);
  return Array.from(r.outputs).filter((o) => o[0] === t && (n === void 0 || o[1] === n) && (i === void 0 || o[2] === i)).map((o) => (Ht(o) ? Pn(s, e, ...o) : qn(s, e, ...o), r.outputs.delete(o), o[0]));
}, ho = (s, e, t, n, i, r, o, a, c, l, u, h, d, f, p, m) => class extends l {
  constructor(v, b, S, k) {
    super(S), this._context = v, this._nativeAudioNode = S;
    const g = u(v);
    h(g) && t(mi, () => mi(g, m)) !== !0 && io(S), Rn.set(this, S), Zi.set(this, /* @__PURE__ */ new Set()), v.state !== "closed" && b && Ot(this), s(this, k, S);
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
    if (b < 0 || b >= this._nativeAudioNode.numberOfOutputs) throw i();
    const k = p(u(this._context));
    if (d(v) || f(v)) throw r();
    if (ls(v)) {
      const T = ne(v);
      try {
        const y = us(this._nativeAudioNode, T, b, S), w = ss(this);
        (k || w) && this._nativeAudioNode.disconnect(...y), this.context.state !== "closed" && !w && ss(v) && Ot(v);
      } catch (y) {
        throw y.code === 12 ? r() : y;
      }
      return e(this, v, b, S, k) && Os(c([this], v), n(k)), v;
    }
    const g = jt(v);
    if (g.name === "playbackRate" && g.maxValue === 1024) throw o();
    try {
      this._nativeAudioNode.connect(g, b), (k || ss(this)) && this._nativeAudioNode.disconnect(g, b);
    } catch (T) {
      throw T.code === 12 ? r() : T;
    }
    ro(this, v, b, k) && Os(c([this], v), n(k));
  }
  disconnect(v, b, S) {
    let k;
    const g = p(u(this._context));
    if (v === void 0) k = co(this, g);
    else if (typeof v == "number") {
      if (v < 0 || v >= this.numberOfOutputs) throw i();
      k = lo(this, g, v);
    } else {
      if (b !== void 0 && (b < 0 || b >= this.numberOfOutputs) || ls(v) && S !== void 0 && (S < 0 || S >= v.numberOfInputs)) throw i();
      if (k = uo(this, g, v, b, S), k.length === 0) throw r();
    }
    for (const T of k) Os(c([this], T), a);
  }
}, po = (s, e, t, n, i, r, o, a, c, l, u, h, d) => (f, p, m, _ = null, v = null) => {
  const b = m.value, S = new Je.AutomationEventList(b), k = p ? n(S) : null, g = {
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
        k === null && S.flush(f.context.currentTime), S.add(i(T)), m.cancelAndHoldAtTime(T);
      else {
        const y = Array.from(S).pop();
        k === null && S.flush(f.context.currentTime), S.add(i(T));
        const w = Array.from(S).pop();
        m.cancelScheduledValues(T), y !== w && w !== void 0 && (w.type === "exponentialRampToValue" ? m.exponentialRampToValueAtTime(w.value, w.endTime) : w.type === "linearRampToValue" ? m.linearRampToValueAtTime(w.value, w.endTime) : w.type === "setValue" ? m.setValueAtTime(w.value, w.startTime) : w.type === "setValueCurve" && m.setValueCurveAtTime(w.values, w.startTime, w.duration));
      }
      return g;
    },
    cancelScheduledValues(T) {
      return k === null && S.flush(f.context.currentTime), S.add(r(T)), m.cancelScheduledValues(T), g;
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
        const E = y + w, N = f.context.sampleRate, M = Math.ceil(y * N), q = Math.floor(E * N), F = q - M, G = new Float32Array(F);
        for (let P = 0; P < F; P += 1) {
          const A = (I.length - 1) / w * ((M + P) / N - y), x = Math.floor(A), C = Math.ceil(A);
          G[P] = x === C ? I[x] : (1 - (A - x)) * I[x] + (1 - (C - A)) * I[C];
        }
        k === null && S.flush(f.context.currentTime), S.add(u(G, y, w)), m.setValueCurveAtTime(G, y, w);
        const j = q / N;
        j < E && d(g, G[G.length - 1], j), d(g, I[I.length - 1], E);
      } else
        k === null && S.flush(f.context.currentTime), S.add(u(I, y, w)), m.setValueCurveAtTime(I, y, w);
      return g;
    }
  };
  return t.set(g, m), e.set(g, f), s(g, k), g;
}, fo = (s) => ({ replay(e) {
  for (const t of s) if (t.type === "exponentialRampToValue") {
    const { endTime: n, value: i } = t;
    e.exponentialRampToValueAtTime(i, n);
  } else if (t.type === "linearRampToValue") {
    const { endTime: n, value: i } = t;
    e.linearRampToValueAtTime(i, n);
  } else if (t.type === "setTarget") {
    const { startTime: n, target: i, timeConstant: r } = t;
    e.setTargetAtTime(i, n, r);
  } else if (t.type === "setValue") {
    const { startTime: n, value: i } = t;
    e.setValueAtTime(i, n);
  } else if (t.type === "setValueCurve") {
    const { duration: n, startTime: i, values: r } = t;
    e.setValueCurveAtTime(r, i, n);
  } else throw new Error("Can't apply an unknown automation.");
} }), sr = class {
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
}, mo = {
  channelCount: 2,
  channelCountMode: "explicit",
  channelInterpretation: "speakers",
  numberOfInputs: 1,
  numberOfOutputs: 1,
  parameterData: {},
  processorOptions: {}
}, _o = (s, e, t, n, i, r, o, a, c, l, u, h, d, f) => class extends e {
  constructor(m, _, v) {
    var b;
    const S = a(m), k = c(S), g = u({
      ...mo,
      ...v
    });
    d(g);
    const T = Ds.get(S), y = T?.get(_), w = i(k || S.state !== "closed" ? S : (b = o(S)) !== null && b !== void 0 ? b : S, k ? null : m.baseLatency, l, _, y, g), I = k ? n(_, g, y) : null;
    super(m, !0, w, I);
    const E = [];
    w.parameters.forEach((M, q) => {
      const F = t(this, k, M);
      E.push([q, F]);
    }), this._nativeAudioWorkletNode = w, this._onprocessorerror = null, this._parameters = new sr(E), k && s(S, this);
    const { activeInputs: N } = r(this);
    h(w, N);
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
function ps(s, e, t, n, i) {
  if (typeof s.copyFromChannel == "function")
    e[t].byteLength === 0 && (e[t] = /* @__PURE__ */ new Float32Array(128)), s.copyFromChannel(e[t], n, i);
  else {
    const r = s.getChannelData(n);
    if (e[t].byteLength === 0) e[t] = r.slice(i, i + 128);
    else {
      const o = new Float32Array(r.buffer, i * Float32Array.BYTES_PER_ELEMENT, 128);
      e[t].set(o);
    }
  }
}
var nr = (s, e, t, n, i) => {
  typeof s.copyToChannel == "function" ? e[t].byteLength !== 0 && s.copyToChannel(e[t], n, i) : e[t].byteLength !== 0 && s.getChannelData(n).set(e[t], i);
}, fs = (s, e) => {
  const t = [];
  for (let n = 0; n < s; n += 1) {
    const i = [], r = typeof e == "number" ? e : e[n];
    for (let o = 0; o < r; o += 1) i.push(/* @__PURE__ */ new Float32Array(128));
    t.push(i);
  }
  return t;
}, go = (s, e) => Fe(Fe(Es, s), ne(e)), vo = async (s, e, t, n, i, r, o) => {
  const a = e === null ? Math.ceil(s.context.length / 128) * 128 : e.length, c = n.channelCount * n.numberOfInputs, l = i.reduce((_, v) => _ + v, 0), u = l === 0 ? null : t.createBuffer(l, a, t.sampleRate);
  if (r === void 0) throw new Error("Missing the processor constructor.");
  const h = xe(s), d = await go(t, s), f = fs(n.numberOfInputs, n.channelCount), p = fs(n.numberOfOutputs, i), m = Array.from(s.parameters.keys()).reduce((_, v) => ({
    ..._,
    [v]: /* @__PURE__ */ new Float32Array(128)
  }), {});
  for (let _ = 0; _ < a; _ += 128) {
    if (n.numberOfInputs > 0 && e !== null) for (let v = 0; v < n.numberOfInputs; v += 1) for (let b = 0; b < n.channelCount; b += 1) ps(e, f[v], b, b, _);
    r.parameterDescriptors !== void 0 && e !== null && r.parameterDescriptors.forEach(({ name: v }, b) => {
      ps(e, m, v, c + b, _);
    });
    for (let v = 0; v < n.numberOfInputs; v += 1) for (let b = 0; b < i[v]; b += 1) p[v][b].byteLength === 0 && (p[v][b] = /* @__PURE__ */ new Float32Array(128));
    try {
      const v = f.map((S, k) => h.activeInputs[k].size === 0 ? [] : S), b = o(_ / t.sampleRate, t.sampleRate, () => d.process(v, p, m));
      if (u !== null) for (let S = 0, k = 0; S < n.numberOfOutputs; S += 1) {
        for (let g = 0; g < i[S]; g += 1) nr(u, p[S], g, k + g, _);
        k += i[S];
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
}, yo = (s, e, t, n, i, r, o, a, c, l, u, h, d, f, p, m) => (_, v, b) => {
  const S = /* @__PURE__ */ new WeakMap();
  let k = null;
  const g = async (T, y) => {
    let w = u(T), I = null;
    const E = Te(w, y), N = Array.isArray(v.outputChannelCount) ? v.outputChannelCount : Array.from(v.outputChannelCount);
    if (h === null) {
      const M = N.reduce((j, P) => j + P, 0), q = i(y, {
        channelCount: Math.max(1, M),
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        numberOfOutputs: Math.max(1, M)
      }), F = [];
      for (let j = 0; j < T.numberOfOutputs; j += 1) F.push(n(y, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
        numberOfInputs: N[j]
      }));
      const G = o(y, {
        channelCount: v.channelCount,
        channelCountMode: v.channelCountMode,
        channelInterpretation: v.channelInterpretation,
        gain: 1
      });
      G.connect = e.bind(null, F), G.disconnect = c.bind(null, F), I = [
        q,
        F,
        G
      ];
    } else E || (w = new h(y, _));
    if (S.set(y, I === null ? w : I[2]), I !== null) {
      if (k === null) {
        if (b === void 0) throw new Error("Missing the processor constructor.");
        if (d === null) throw new Error("Missing the native OfflineAudioContext constructor.");
        const P = T.channelCount * T.numberOfInputs, A = b.parameterDescriptors === void 0 ? 0 : b.parameterDescriptors.length, x = P + A;
        k = vo(T, x === 0 ? null : await (async () => {
          const D = new d(x, Math.ceil(T.context.length / 128) * 128, y.sampleRate), R = [], V = [];
          for (let ee = 0; ee < v.numberOfInputs; ee += 1)
            R.push(o(D, {
              channelCount: v.channelCount,
              channelCountMode: v.channelCountMode,
              channelInterpretation: v.channelInterpretation,
              gain: 1
            })), V.push(i(D, {
              channelCount: v.channelCount,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
              numberOfOutputs: v.channelCount
            }));
          const ae = await Promise.all(Array.from(T.parameters.values()).map(async (ee) => {
            const oe = r(D, {
              channelCount: 1,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
              offset: ee.value
            });
            return await f(D, ee, oe.offset), oe;
          })), $ = n(D, {
            channelCount: 1,
            channelCountMode: "explicit",
            channelInterpretation: "speakers",
            numberOfInputs: Math.max(1, P + A)
          });
          for (let ee = 0; ee < v.numberOfInputs; ee += 1) {
            R[ee].connect(V[ee]);
            for (let oe = 0; oe < v.channelCount; oe += 1) V[ee].connect($, oe, ee * v.channelCount + oe);
          }
          for (const [ee, oe] of ae.entries())
            oe.connect($, 0, P + ee), oe.start(0);
          return $.connect(D.destination), await Promise.all(R.map((ee) => p(T, D, ee))), m(D);
        })(), y, v, N, b, l);
      }
      const M = await k, q = t(y, {
        buffer: null,
        channelCount: 2,
        channelCountMode: "max",
        channelInterpretation: "speakers",
        loop: !1,
        loopEnd: 0,
        loopStart: 0,
        playbackRate: 1
      }), [F, G, j] = I;
      M !== null && (q.buffer = M, q.start(0)), q.connect(F);
      for (let P = 0, A = 0; P < T.numberOfOutputs; P += 1) {
        const x = G[P];
        for (let C = 0; C < N[P]; C += 1) F.connect(x, A + C, C);
        A += N[P];
      }
      return j;
    }
    if (E) for (const [M, q] of T.parameters.entries()) await s(y, q, w.parameters.get(M));
    else for (const [M, q] of T.parameters.entries()) await f(y, q, w.parameters.get(M));
    return await p(T, y, w), w;
  };
  return { render(T, y) {
    a(y, T);
    const w = S.get(y);
    return w !== void 0 ? Promise.resolve(w) : g(T, y);
  } };
}, To = (s, e, t, n, i, r, o, a, c, l, u, h, d, f, p, m, _, v, b, S) => class extends p {
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
    return new i(this);
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
    return new r(this, { numberOfInputs: g });
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
}, wo = {
  Q: 1,
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  detune: 0,
  frequency: 350,
  gain: 0,
  type: "lowpass"
}, bo = (s, e, t, n, i, r, o, a) => class extends s {
  constructor(l, u) {
    const h = r(l), d = i(h, {
      ...wo,
      ...u
    }), f = o(h), p = f ? t() : null;
    super(l, !1, d, p), this._Q = e(this, f, d.Q, be, Ne), this._detune = e(this, f, d.detune, 1200 * Math.log2(be), -1200 * Math.log2(be)), this._frequency = e(this, f, d.frequency, l.sampleRate / 2, 0), this._gain = e(this, f, d.gain, 40 * Math.log10(be), Ne), this._nativeBiquadFilterNode = d, a(this, 1);
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
}, xo = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = Te(l, c);
    return u || (l = e(c, {
      Q: l.Q.value,
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      detune: l.detune.value,
      frequency: l.frequency.value,
      gain: l.gain.value,
      type: l.type
    })), r.set(c, l), u ? (await s(c, a.Q, l.Q), await s(c, a.detune, l.detune), await s(c, a.frequency, l.frequency), await s(c, a.gain, l.gain)) : (await n(c, a.Q, l.Q), await n(c, a.detune, l.detune), await n(c, a.frequency, l.frequency), await n(c, a.gain, l.gain)), await i(a, c, l), l;
  };
  return { render(a, c) {
    const l = r.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, Co = (s, e) => (t, n) => {
  const i = e.get(t);
  if (i !== void 0) return i;
  const r = s.get(t);
  if (r !== void 0) return r;
  try {
    const o = n();
    return o instanceof Promise ? (s.set(t, o), o.catch(() => !1).then((a) => (s.delete(t), e.set(t, a), a))) : (e.set(t, o), o);
  } catch {
    return e.set(t, !1), !1;
  }
}, So = {
  channelCount: 1,
  channelCountMode: "explicit",
  channelInterpretation: "speakers",
  numberOfInputs: 6
}, Ao = (s, e, t, n, i) => class extends s {
  constructor(o, a) {
    const c = n(o), l = t(c, {
      ...So,
      ...a
    }), u = i(c) ? e() : null;
    super(o, !1, l, u);
  }
}, ko = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), i = async (r, o) => {
    let a = e(r);
    return Te(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      numberOfInputs: a.numberOfInputs
    })), n.set(o, a), await t(r, o, a), a;
  };
  return { render(r, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : i(r, o);
  } };
}, Oo = {
  channelCount: 6,
  channelCountMode: "explicit",
  channelInterpretation: "discrete",
  numberOfOutputs: 6
}, No = (s, e, t, n, i, r) => class extends s {
  constructor(a, c) {
    const l = n(a), u = t(l, r({
      ...Oo,
      ...c
    })), h = i(l) ? e() : null;
    super(a, !1, u, h);
  }
}, Mo = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), i = async (r, o) => {
    let a = e(r);
    return Te(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      numberOfOutputs: a.numberOfOutputs
    })), n.set(o, a), await t(r, o, a), a;
  };
  return { render(r, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : i(r, o);
  } };
}, Do = (s) => (e, t, n) => s(t, e, n), Eo = (s) => (e, t, n = 0, i = 0) => {
  const r = e[n];
  if (r === void 0) throw s();
  return ds(t) ? r.connect(t, 0, i) : r.connect(t, 0);
}, Io = (s) => (e, t) => {
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
}, Ro = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  offset: 1
}, Vo = (s, e, t, n, i, r, o) => class extends s {
  constructor(c, l) {
    const u = i(c), h = n(u, {
      ...Ro,
      ...l
    }), d = r(u), f = d ? t() : null;
    super(c, !1, h, f), this._constantSourceNodeRenderer = f, this._nativeConstantSourceNode = h, this._offset = e(this, d, h.offset, be, Ne), this._onended = null;
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
      Ot(this);
      const l = () => {
        this._nativeConstantSourceNode.removeEventListener("ended", l), Ze(this) && Zt(this);
      };
      this._nativeConstantSourceNode.addEventListener("ended", l);
    }
  }
  stop(c = 0) {
    this._nativeConstantSourceNode.stop(c), this._constantSourceNodeRenderer !== null && (this._constantSourceNodeRenderer.stop = c);
  }
}, Fo = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap();
  let o = null, a = null;
  const c = async (l, u) => {
    let h = t(l);
    const d = Te(h, u);
    return d || (h = e(u, {
      channelCount: h.channelCount,
      channelCountMode: h.channelCountMode,
      channelInterpretation: h.channelInterpretation,
      offset: h.offset.value
    }), o !== null && h.start(o), a !== null && h.stop(a)), r.set(u, h), d ? await s(u, l.offset, h.offset) : await n(u, l.offset, h.offset), await i(l, u, h), h;
  };
  return {
    set start(l) {
      o = l;
    },
    set stop(l) {
      a = l;
    },
    render(l, u) {
      const h = r.get(u);
      return h !== void 0 ? Promise.resolve(h) : c(l, u);
    }
  };
}, Po = (s) => (e) => (s[0] = e, s[0]), qo = {
  buffer: null,
  channelCount: 2,
  channelCountMode: "clamped-max",
  channelInterpretation: "speakers",
  disableNormalization: !1
}, Lo = (s, e, t, n, i, r) => class extends s {
  constructor(a, c) {
    const l = n(a), u = {
      ...qo,
      ...c
    }, h = t(l, u), d = i(l) ? e() : null;
    super(a, !1, h, d), this._isBufferNullified = !1, this._nativeConvolverNode = h, u.buffer !== null && r(this, u.buffer.duration);
  }
  get buffer() {
    return this._isBufferNullified ? null : this._nativeConvolverNode.buffer;
  }
  set buffer(a) {
    if (this._nativeConvolverNode.buffer = a, a === null && this._nativeConvolverNode.buffer !== null) {
      const c = this._nativeConvolverNode.context;
      this._nativeConvolverNode.buffer = c.createBuffer(1, 1, c.sampleRate), this._isBufferNullified = !0, r(this, 0);
    } else
      this._isBufferNullified = !1, r(this, this._nativeConvolverNode.buffer === null ? 0 : this._nativeConvolverNode.buffer.duration);
  }
  get normalize() {
    return this._nativeConvolverNode.normalize;
  }
  set normalize(a) {
    this._nativeConvolverNode.normalize = a;
  }
}, Wo = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), i = async (r, o) => {
    let a = e(r);
    return Te(a, o) || (a = s(o, {
      buffer: a.buffer,
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      disableNormalization: !a.normalize
    })), n.set(o, a), Rt(a) ? await t(r, o, a.inputs[0]) : await t(r, o, a), a;
  };
  return { render(r, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : i(r, o);
  } };
}, jo = (s, e) => (t, n, i) => {
  if (e === null) throw new Error("Missing the native OfflineAudioContext constructor.");
  try {
    return new e(t, n, i);
  } catch (r) {
    throw r.name === "SyntaxError" ? s() : r;
  }
}, Bo = () => new DOMException("", "DataCloneError"), _i = (s) => {
  const { port1: e, port2: t } = new MessageChannel();
  return new Promise((n) => {
    const i = () => {
      t.onmessage = null, e.close(), t.close(), n();
    };
    t.onmessage = () => i();
    try {
      e.postMessage(s, [s]);
    } catch {
    } finally {
      i();
    }
  });
}, Uo = (s, e, t, n, i, r, o, a, c, l, u) => (h, d) => {
  const f = o(h) ? h : r(h);
  if (i.has(d)) {
    const p = t();
    return Promise.reject(p);
  }
  try {
    i.add(d);
  } catch {
  }
  return e(c, () => c(f)) ? f.decodeAudioData(d).then((p) => (_i(d).catch(() => {
  }), e(a, () => a(p)) || u(p), s.add(p), p)) : new Promise((p, m) => {
    const _ = async () => {
      try {
        await _i(d);
      } catch {
      }
    }, v = (b) => {
      m(b), _();
    };
    try {
      f.decodeAudioData(d, (b) => {
        typeof b.copyFromChannel != "function" && (l(b), Fn(b)), s.add(b), _().then(() => p(b));
      }, (b) => {
        v(b === null ? n() : b);
      });
    } catch (b) {
      v(b);
    }
  });
}, Go = (s, e, t, n, i, r, o, a) => (c, l) => {
  const u = e.get(c);
  if (u === void 0) throw new Error("Missing the expected cycle count.");
  const h = a(r(c.context));
  if (u === l) {
    if (e.delete(c), !h && o(c)) {
      const d = n(c), { outputs: f } = t(c);
      for (const p of f) if (Ht(p)) s(d, n(p[0]), p[1], p[2]);
      else {
        const m = i(p[0]);
        d.connect(m, p[1]);
      }
    }
  } else e.set(c, u - l);
}, zo = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  delayTime: 0,
  maxDelayTime: 1
}, $o = (s, e, t, n, i, r, o) => class extends s {
  constructor(c, l) {
    const u = i(c), h = {
      ...zo,
      ...l
    }, d = n(u, h), f = r(u), p = f ? t(h.maxDelayTime) : null;
    super(c, !1, d, p), this._delayTime = e(this, f, d.delayTime), o(this, h.maxDelayTime);
  }
  get delayTime() {
    return this._delayTime;
  }
}, Zo = (s, e, t, n, i) => (r) => {
  const o = /* @__PURE__ */ new WeakMap(), a = async (c, l) => {
    let u = t(c);
    const h = Te(u, l);
    return h || (u = e(l, {
      channelCount: u.channelCount,
      channelCountMode: u.channelCountMode,
      channelInterpretation: u.channelInterpretation,
      delayTime: u.delayTime.value,
      maxDelayTime: r
    })), o.set(l, u), h ? await s(l, c.delayTime, u.delayTime) : await n(l, c.delayTime, u.delayTime), await i(c, l, u), u;
  };
  return { render(c, l) {
    const u = o.get(l);
    return u !== void 0 ? Promise.resolve(u) : a(c, l);
  } };
}, Xo = (s) => (e, t, n, i) => s(e[i], (r) => r[0] === t && r[1] === n), Ho = (s) => (e, t) => {
  s(e).delete(t);
}, Qo = (s) => "delayTime" in s, Yo = (s, e, t) => function n(i, r) {
  const o = ls(r) ? r : t(s, r);
  if (Qo(o)) return [];
  if (i[0] === o) return [i];
  if (i.includes(o)) return [];
  const { outputs: a } = e(o);
  return Array.from(a).map((c) => n([...i, o], c[0])).reduce((c, l) => c.concat(l), []);
}, es = (s, e, t) => {
  const n = e[t];
  if (n === void 0) throw s();
  return n;
}, Jo = (s) => (e, t = void 0, n = void 0, i = 0) => t === void 0 ? e.forEach((r) => r.disconnect()) : typeof t == "number" ? es(s, e, t).disconnect() : ds(t) ? n === void 0 ? e.forEach((r) => r.disconnect(t)) : i === void 0 ? es(s, e, n).disconnect(t, 0) : es(s, e, n).disconnect(t, 0, i) : n === void 0 ? e.forEach((r) => r.disconnect(t)) : es(s, e, n).disconnect(t, 0), Ko = {
  attack: 3e-3,
  channelCount: 2,
  channelCountMode: "clamped-max",
  channelInterpretation: "speakers",
  knee: 30,
  ratio: 12,
  release: 0.25,
  threshold: -24
}, ec = (s, e, t, n, i, r, o, a) => class extends s {
  constructor(l, u) {
    const h = r(l), d = n(h, {
      ...Ko,
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
      throw this._nativeDynamicsCompressorNode.channelCount = u, i();
  }
  get channelCountMode() {
    return this._nativeDynamicsCompressorNode.channelCountMode;
  }
  set channelCountMode(l) {
    const u = this._nativeDynamicsCompressorNode.channelCountMode;
    if (this._nativeDynamicsCompressorNode.channelCountMode = l, l === "max")
      throw this._nativeDynamicsCompressorNode.channelCountMode = u, i();
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
}, tc = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = Te(l, c);
    return u || (l = e(c, {
      attack: l.attack.value,
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      knee: l.knee.value,
      ratio: l.ratio.value,
      release: l.release.value,
      threshold: l.threshold.value
    })), r.set(c, l), u ? (await s(c, a.attack, l.attack), await s(c, a.knee, l.knee), await s(c, a.ratio, l.ratio), await s(c, a.release, l.release), await s(c, a.threshold, l.threshold)) : (await n(c, a.attack, l.attack), await n(c, a.knee, l.knee), await n(c, a.ratio, l.ratio), await n(c, a.release, l.release), await n(c, a.threshold, l.threshold)), await i(a, c, l), l;
  };
  return { render(a, c) {
    const l = r.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, sc = () => new DOMException("", "EncodingError"), nc = (s) => (e) => new Promise((t, n) => {
  if (s === null) {
    n(/* @__PURE__ */ new SyntaxError());
    return;
  }
  const i = s.document.head;
  if (i === null) n(/* @__PURE__ */ new SyntaxError());
  else {
    const r = s.document.createElement("script"), o = new Blob([e], { type: "application/javascript" }), a = URL.createObjectURL(o), c = s.onerror, l = () => {
      s.onerror = c, URL.revokeObjectURL(a);
    };
    s.onerror = (u, h, d, f, p) => {
      if (h === a || h === s.location.href && d === 1 && f === 1)
        return l(), n(p), !1;
      if (c !== null) return c(u, h, d, f, p);
    }, r.onerror = () => {
      l(), n(/* @__PURE__ */ new SyntaxError());
    }, r.onload = () => {
      l(), t();
    }, r.src = a, r.type = "module", i.appendChild(r);
  }
}), ic = (s) => class {
  constructor(t) {
    this._nativeEventTarget = t, this._listeners = /* @__PURE__ */ new WeakMap();
  }
  addEventListener(t, n, i) {
    if (n !== null) {
      let r = this._listeners.get(n);
      r === void 0 && (r = s(this, n), typeof n == "function" && this._listeners.set(n, r)), this._nativeEventTarget.addEventListener(t, r, i);
    }
  }
  dispatchEvent(t) {
    return this._nativeEventTarget.dispatchEvent(t);
  }
  removeEventListener(t, n, i) {
    const r = n === null ? void 0 : this._listeners.get(n);
    this._nativeEventTarget.removeEventListener(t, r === void 0 ? null : r, i);
  }
}, rc = (s) => (e, t, n) => {
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
}, ac = (s) => async (e) => {
  try {
    const t = await fetch(e);
    if (t.ok) return [await t.text(), t.url];
  } catch {
  }
  throw s();
}, oc = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  gain: 1
}, cc = (s, e, t, n, i, r) => class extends s {
  constructor(a, c) {
    const l = i(a), u = n(l, {
      ...oc,
      ...c
    }), h = r(l), d = h ? t() : null;
    super(a, !1, u, d), this._gain = e(this, h, u.gain, be, Ne);
  }
  get gain() {
    return this._gain;
  }
}, lc = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = Te(l, c);
    return u || (l = e(c, {
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      gain: l.gain.value
    })), r.set(c, l), u ? await s(c, a.gain, l.gain) : await n(c, a.gain, l.gain), await i(a, c, l), l;
  };
  return { render(a, c) {
    const l = r.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, uc = (s, e) => (t) => e(s, t), hc = (s) => (e) => {
  const t = s(e);
  if (t.renderer === null) throw new Error("Missing the renderer of the given AudioNode in the audio graph.");
  return t.renderer;
}, dc = (s) => (e) => {
  var t;
  return (t = s.get(e)) !== null && t !== void 0 ? t : 0;
}, pc = (s) => (e) => {
  const t = s(e);
  if (t.renderer === null) throw new Error("Missing the renderer of the given AudioParam in the audio graph.");
  return t.renderer;
}, fc = (s) => (e) => s.get(e), he = () => new DOMException("", "InvalidStateError"), mc = (s) => (e) => {
  const t = s.get(e);
  if (t === void 0) throw he();
  return t;
}, _c = (s, e) => (t) => {
  let n = s.get(t);
  if (n !== void 0) return n;
  if (e === null) throw new Error("Missing the native OfflineAudioContext constructor.");
  return n = new e(1, 1, 44100), s.set(t, n), n;
}, gc = (s) => (e) => {
  const t = s.get(e);
  if (t === void 0) throw new Error("The context has no set of AudioWorkletNodes.");
  return t;
}, xs = () => new DOMException("", "InvalidAccessError"), vc = (s) => {
  s.getFrequencyResponse = /* @__PURE__ */ ((e) => (t, n, i) => {
    if (t.length !== n.length || n.length !== i.length) throw xs();
    return e.call(s, t, n, i);
  })(s.getFrequencyResponse);
}, yc = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers"
}, Tc = (s, e, t, n, i, r) => class extends s {
  constructor(a, c) {
    const l = n(a), u = i(l), h = {
      ...yc,
      ...c
    }, d = e(l, u ? null : a.baseLatency, h), f = u ? t(h.feedback, h.feedforward) : null;
    super(a, !1, d, f), vc(d), this._nativeIIRFilterNode = d, r(this, 1);
  }
  getFrequencyResponse(a, c, l) {
    return this._nativeIIRFilterNode.getFrequencyResponse(a, c, l);
  }
}, ir = (s, e, t, n, i, r, o, a, c, l, u) => {
  const h = l.length;
  let d = a;
  for (let f = 0; f < h; f += 1) {
    let p = t[0] * l[f];
    for (let m = 1; m < i; m += 1) {
      const _ = d - m & c - 1;
      p += t[m] * r[_], p -= s[m] * o[_];
    }
    for (let m = i; m < n; m += 1) p += t[m] * r[d - m & c - 1];
    for (let m = i; m < e; m += 1) p -= s[m] * o[d - m & c - 1];
    r[d] = l[f], o[d] = p, d = d + 1 & c - 1, u[f] = p;
  }
  return d;
}, wc = (s, e, t, n) => {
  const i = t instanceof Float64Array ? t : new Float64Array(t), r = n instanceof Float64Array ? n : new Float64Array(n), o = i.length, a = r.length, c = Math.min(o, a);
  if (i[0] !== 1) {
    for (let p = 0; p < o; p += 1) r[p] /= i[0];
    for (let p = 1; p < a; p += 1) i[p] /= i[0];
  }
  const l = 32, u = new Float32Array(l), h = new Float32Array(l), d = e.createBuffer(s.numberOfChannels, s.length, s.sampleRate), f = s.numberOfChannels;
  for (let p = 0; p < f; p += 1) {
    const m = s.getChannelData(p), _ = d.getChannelData(p);
    u.fill(0), h.fill(0), ir(i, o, r, a, c, u, h, 0, l, m, _);
  }
  return d;
}, bc = (s, e, t, n, i) => (r, o) => {
  const a = /* @__PURE__ */ new WeakMap();
  let c = null;
  const l = async (u, h) => {
    let d = null, f = e(u);
    const p = Te(f, h);
    if (h.createIIRFilter === void 0 ? d = s(h, {
      buffer: null,
      channelCount: 2,
      channelCountMode: "max",
      channelInterpretation: "speakers",
      loop: !1,
      loopEnd: 0,
      loopStart: 0,
      playbackRate: 1
    }) : p || (f = h.createIIRFilter(o, r)), a.set(h, d === null ? f : d), d !== null) {
      if (c === null) {
        if (t === null) throw new Error("Missing the native OfflineAudioContext constructor.");
        const _ = new t(u.context.destination.channelCount, u.context.length, h.sampleRate);
        c = (async () => {
          await n(u, _, _.destination);
          const v = await i(_);
          return wc(v, h, r, o);
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
}, xc = (s, e, t, n, i, r) => (o) => (a, c) => {
  const l = s.get(a);
  if (l === void 0) {
    if (!o && r(a)) {
      const u = n(a), { outputs: h } = t(a);
      for (const d of h) if (Ht(d)) e(u, n(d[0]), d[1], d[2]);
      else {
        const f = i(d[0]);
        u.disconnect(f, d[1]);
      }
    }
    s.set(a, c);
  } else s.set(a, l + c);
}, Cc = (s, e) => (t) => e(s.get(t)) || e(t), Sc = (s, e) => (t) => s.has(t) || e(t), Ac = (s, e) => (t) => s.has(t) || e(t), kc = (s, e) => (t) => e(s.get(t)) || e(t), Oc = (s) => (e) => s !== null && e instanceof s, Nc = (s) => (e) => s !== null && typeof s.AudioNode == "function" && e instanceof s.AudioNode, Mc = (s) => (e) => s !== null && typeof s.AudioParam == "function" && e instanceof s.AudioParam, Dc = (s, e) => (t) => s(t) || e(t), Ec = (s) => (e) => s !== null && e instanceof s, Ic = (s) => s !== null && s.isSecureContext, Rc = (s, e, t, n) => class extends s {
  constructor(r, o) {
    const a = t(r), c = e(a, o);
    if (n(a)) throw TypeError();
    super(r, !0, c, null), this._nativeMediaElementAudioSourceNode = c;
  }
  get mediaElement() {
    return this._nativeMediaElementAudioSourceNode.mediaElement;
  }
}, Vc = {
  channelCount: 2,
  channelCountMode: "explicit",
  channelInterpretation: "speakers"
}, Fc = (s, e, t, n) => class extends s {
  constructor(r, o) {
    const a = t(r);
    if (n(a)) throw new TypeError();
    const c = e(a, {
      ...Vc,
      ...o
    });
    super(r, !1, c, null), this._nativeMediaStreamAudioDestinationNode = c;
  }
  get stream() {
    return this._nativeMediaStreamAudioDestinationNode.stream;
  }
}, Pc = (s, e, t, n) => class extends s {
  constructor(r, o) {
    const a = t(r), c = e(a, o);
    if (n(a)) throw new TypeError();
    super(r, !0, c, null), this._nativeMediaStreamAudioSourceNode = c;
  }
  get mediaStream() {
    return this._nativeMediaStreamAudioSourceNode.mediaStream;
  }
}, qc = (s, e, t) => class extends s {
  constructor(i, r) {
    const o = e(t(i), r);
    super(i, !0, o, null);
  }
}, Lc = (s, e, t, n, i) => class extends n {
  constructor(o = {}) {
    if (i === null) throw new Error("Missing the native AudioContext constructor.");
    let a;
    try {
      a = new i(o);
    } catch (u) {
      throw u.code === 12 && u.message === "sampleRate is not in range" ? e() : u;
    }
    if (a === null) throw t();
    if (!Ji(o.latencyHint)) throw new TypeError(`The provided value '${o.latencyHint}' is not a valid enum value of type AudioContextLatencyCategory.`);
    if (o.sampleRate !== void 0 && a.sampleRate !== o.sampleRate) throw e();
    super(a, 2);
    const { latencyHint: c } = o, { sampleRate: l } = a;
    if (this._baseLatency = typeof a.baseLatency == "number" ? a.baseLatency : c === "balanced" ? 512 / l : c === "interactive" || c === void 0 ? 256 / l : c === "playback" ? 1024 / l : Math.max(2, Math.min(128, Math.round(c * l / 128))) * 128 / l, this._nativeAudioContext = a, i.name === "webkitAudioContext" ? (this._nativeGainNode = a.createGain(), this._nativeOscillatorNode = a.createOscillator(), this._nativeGainNode.gain.value = 1e-37, this._nativeOscillatorNode.connect(this._nativeGainNode).connect(a.destination), this._nativeOscillatorNode.start()) : (this._nativeGainNode = null, this._nativeOscillatorNode = null), this._state = null, a.state === "running") {
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
      this._nativeGainNode !== null && this._nativeOscillatorNode !== null && (this._nativeOscillatorNode.stop(), this._nativeGainNode.disconnect(), this._nativeOscillatorNode.disconnect()), bs(this);
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
}, Wc = (s, e, t, n, i, r) => class extends t {
  constructor(a, c) {
    super(a), this._nativeContext = a, Ts.set(this, a), n(a) && i.set(a, /* @__PURE__ */ new Set()), this._destination = new s(this, c), this._listener = e(this, a), this._onstatechange = null;
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
    const c = typeof a == "function" ? r(this, a) : null;
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
}, ft = (s) => {
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
}, jc = { numberOfChannels: 1 }, Bc = (s, e, t, n, i) => class extends n {
  constructor(o) {
    const { length: a, numberOfChannels: c, sampleRate: l } = {
      ...jc,
      ...o
    }, u = t(c, a, l);
    s(ft, () => ft(u)) || u.addEventListener("statechange", /* @__PURE__ */ (() => {
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
    return this._state === "running" ? Promise.reject(e()) : (this._state = "running", i(this.destination, this._nativeOfflineAudioContext).finally(() => {
      this._state = null, bs(this);
    }));
  }
  _waitForThePromiseToSettle(o) {
    this._state === null ? this._nativeOfflineAudioContext.dispatchEvent(o) : setTimeout(() => this._waitForThePromiseToSettle(o));
  }
}, Uc = (s, e) => (t, n, i) => {
  const r = /* @__PURE__ */ new Set();
  return t.connect = /* @__PURE__ */ ((o) => (a, c = 0, l = 0) => {
    const u = r.size === 0;
    if (e(a))
      return o.call(t, a, c, l), s(r, [
        a,
        c,
        l
      ], (h) => h[0] === a && h[1] === c && h[2] === l, !0), u && n(), a;
    o.call(t, a, c), s(r, [a, c], (h) => h[0] === a && h[1] === c, !0), u && n();
  })(t.connect), t.disconnect = /* @__PURE__ */ ((o) => (a, c, l) => {
    const u = r.size > 0;
    if (a === void 0)
      o.apply(t), r.clear();
    else if (typeof a == "number") {
      o.call(t, a);
      for (const d of r) d[1] === a && r.delete(d);
    } else {
      e(a) ? o.call(t, a, c, l) : o.call(t, a, c);
      for (const d of r) d[0] === a && (c === void 0 || d[1] === c) && (l === void 0 || d[2] === l) && r.delete(d);
    }
    const h = r.size === 0;
    u && h && i();
  })(t.disconnect), t;
}, ie = (s, e, t) => {
  const n = e[t];
  n !== void 0 && n !== s[t] && (s[t] = n);
}, fe = (s, e) => {
  ie(s, e, "channelCount"), ie(s, e, "channelCountMode"), ie(s, e, "channelInterpretation");
}, gi = (s) => typeof s.getFloatTimeDomainData == "function", Gc = (s) => {
  s.getFloatTimeDomainData = (e) => {
    const t = new Uint8Array(e.length);
    s.getByteTimeDomainData(t);
    const n = Math.max(t.length, s.fftSize);
    for (let i = 0; i < n; i += 1) e[i] = (t[i] - 128) * 78125e-7;
    return e;
  };
}, zc = (s, e) => (t, n) => {
  const i = t.createAnalyser();
  if (fe(i, n), !(n.maxDecibels > n.minDecibels)) throw e();
  return ie(i, n, "fftSize"), ie(i, n, "maxDecibels"), ie(i, n, "minDecibels"), ie(i, n, "smoothingTimeConstant"), s(gi, () => gi(i)) || Gc(i), i;
}, $c = (s) => s === null ? null : s.hasOwnProperty("AudioBuffer") ? s.AudioBuffer : null, ce = (s, e, t) => {
  const n = e[t];
  n !== void 0 && n !== s[t].value && (s[t].value = n);
}, Zc = (s) => {
  s.start = /* @__PURE__ */ ((e) => {
    let t = !1;
    return (n = 0, i = 0, r) => {
      if (t) throw he();
      e.call(s, n, i, r), t = !0;
    };
  })(s.start);
}, Ln = (s) => {
  s.start = /* @__PURE__ */ ((e) => (t = 0, n = 0, i) => {
    if (typeof i == "number" && i < 0 || n < 0 || t < 0) throw new RangeError("The parameters can't be negative.");
    e.call(s, t, n, i);
  })(s.start);
}, Wn = (s) => {
  s.stop = /* @__PURE__ */ ((e) => (t = 0) => {
    if (t < 0) throw new RangeError("The parameter can't be negative.");
    e.call(s, t);
  })(s.stop);
}, Xc = (s, e, t, n, i, r, o, a, c, l, u) => (h, d) => {
  const f = h.createBufferSource();
  return fe(f, d), ce(f, d, "playbackRate"), ie(f, d, "buffer"), ie(f, d, "loop"), ie(f, d, "loopEnd"), ie(f, d, "loopStart"), e(t, () => t(h)) || Zc(f), e(n, () => n(h)) || c(f), e(i, () => i(h)) || l(f, h), e(r, () => r(h)) || Ln(f), e(o, () => o(h)) || u(f, h), e(a, () => a(h)) || Wn(f), s(h, f), f;
}, Hc = (s) => s === null ? null : s.hasOwnProperty("AudioContext") ? s.AudioContext : s.hasOwnProperty("webkitAudioContext") ? s.webkitAudioContext : null, Qc = (s, e) => (t, n, i) => {
  const r = t.destination;
  if (r.channelCount !== n) try {
    r.channelCount = n;
  } catch {
  }
  i && r.channelCountMode !== "explicit" && (r.channelCountMode = "explicit"), r.maxChannelCount === 0 && Object.defineProperty(r, "maxChannelCount", { value: n });
  const o = s(t, {
    channelCount: n,
    channelCountMode: r.channelCountMode,
    channelInterpretation: r.channelInterpretation,
    gain: 1
  });
  return e(o, "channelCount", (a) => () => a.call(o), (a) => (c) => {
    a.call(o, c);
    try {
      r.channelCount = c;
    } catch (l) {
      if (c > r.maxChannelCount) throw l;
    }
  }), e(o, "channelCountMode", (a) => () => a.call(o), (a) => (c) => {
    a.call(o, c), r.channelCountMode = c;
  }), e(o, "channelInterpretation", (a) => () => a.call(o), (a) => (c) => {
    a.call(o, c), r.channelInterpretation = c;
  }), Object.defineProperty(o, "maxChannelCount", { get: () => r.maxChannelCount }), o.connect(r), o;
}, Yc = (s) => s === null ? null : s.hasOwnProperty("AudioWorkletNode") ? s.AudioWorkletNode : null, Jc = (s) => {
  const { port1: e } = new MessageChannel();
  try {
    e.postMessage(s);
  } finally {
    e.close();
  }
}, Kc = (s, e, t, n, i) => (r, o, a, c, l, u) => {
  if (a !== null) try {
    const h = new a(r, c, u), d = /* @__PURE__ */ new Map();
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
      const p = t(r, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        gain: 0
      });
      return h.connect(p).connect(r.destination), i(h, () => p.disconnect(), () => p.connect(r.destination));
    }
    return h;
  } catch (h) {
    throw h.code === 11 ? n() : h;
  }
  if (l === void 0) throw n();
  return Jc(u), e(r, o, l, u);
}, rr = (s, e) => s === null ? 512 : Math.max(512, Math.min(16384, Math.pow(2, Math.round(Math.log2(s * e))))), el = (s) => new Promise((e, t) => {
  const { port1: n, port2: i } = new MessageChannel();
  n.onmessage = ({ data: r }) => {
    n.close(), i.close(), e(r);
  }, n.onmessageerror = ({ data: r }) => {
    n.close(), i.close(), t(r);
  }, i.postMessage(s);
}), tl = async (s, e) => new s(await el(e)), sl = (s, e, t, n) => {
  let i = Es.get(s);
  i === void 0 && (i = /* @__PURE__ */ new WeakMap(), Es.set(s, i));
  const r = tl(t, n);
  return i.set(e, r), r;
}, nl = (s, e, t, n, i, r, o, a, c, l, u, h, d) => (f, p, m, _) => {
  if (_.numberOfInputs === 0 && _.numberOfOutputs === 0) throw c();
  const v = Array.isArray(_.outputChannelCount) ? _.outputChannelCount : Array.from(_.outputChannelCount);
  if (v.some((L) => L < 1)) throw c();
  if (v.length !== _.numberOfOutputs) throw e();
  if (_.channelCountMode !== "explicit") throw c();
  const b = _.channelCount * _.numberOfInputs, S = v.reduce((L, U) => L + U, 0), k = m.parameterDescriptors === void 0 ? 0 : m.parameterDescriptors.length;
  if (b + k > 6 || S > 6) throw c();
  const g = new MessageChannel(), T = [], y = [];
  for (let L = 0; L < _.numberOfInputs; L += 1)
    T.push(o(f, {
      channelCount: _.channelCount,
      channelCountMode: _.channelCountMode,
      channelInterpretation: _.channelInterpretation,
      gain: 1
    })), y.push(i(f, {
      channelCount: _.channelCount,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      numberOfOutputs: _.channelCount
    }));
  const w = [];
  if (m.parameterDescriptors !== void 0) for (const { defaultValue: L, maxValue: U, minValue: de, name: re } of m.parameterDescriptors) {
    const H = r(f, {
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      offset: _.parameterData[re] !== void 0 ? _.parameterData[re] : L === void 0 ? 0 : L
    });
    Object.defineProperties(H.offset, {
      defaultValue: { get: () => L === void 0 ? 0 : L },
      maxValue: { get: () => U === void 0 ? be : U },
      minValue: { get: () => de === void 0 ? Ne : de }
    }), w.push(H);
  }
  const I = n(f, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    numberOfInputs: Math.max(1, b + k)
  }), E = rr(p, f.sampleRate), N = a(f, E, b + k, Math.max(1, S)), M = i(f, {
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
    for (let U = 0; U < _.channelCount; U += 1) y[L].connect(I, U, L * _.channelCount + U);
  }
  const F = new sr(m.parameterDescriptors === void 0 ? [] : m.parameterDescriptors.map(({ name: L }, U) => {
    const de = w[U];
    return de.connect(I, 0, b + U), de.start(0), [L, de.offset];
  }));
  I.connect(N);
  let G = _.channelInterpretation, j = null;
  const P = _.numberOfOutputs === 0 ? [N] : q, A = {
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
      return G;
    },
    set channelInterpretation(L) {
      for (const U of T) U.channelInterpretation = L;
      G = L;
    },
    get context() {
      return N.context;
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
      return F;
    },
    get port() {
      return g.port2;
    },
    addEventListener(...L) {
      return N.addEventListener(L[0], L[1], L[2]);
    },
    connect: s.bind(null, P),
    disconnect: l.bind(null, P),
    dispatchEvent(...L) {
      return N.dispatchEvent(L[0]);
    },
    removeEventListener(...L) {
      return N.removeEventListener(L[0], L[1], L[2]);
    }
  }, x = /* @__PURE__ */ new Map();
  g.port1.addEventListener = /* @__PURE__ */ ((L) => (...U) => {
    if (U[0] === "message") {
      const de = typeof U[1] == "function" ? U[1] : typeof U[1] == "object" && U[1] !== null && typeof U[1].handleEvent == "function" ? U[1].handleEvent : null;
      if (de !== null) {
        const re = x.get(U[1]);
        re !== void 0 ? U[1] = re : (U[1] = (H) => {
          u(f.currentTime, f.sampleRate, () => de(H));
        }, x.set(de, U[1]));
      }
    }
    return L.call(g.port1, U[0], U[1], U[2]);
  })(g.port1.addEventListener), g.port1.removeEventListener = /* @__PURE__ */ ((L) => (...U) => {
    if (U[0] === "message") {
      const de = x.get(U[1]);
      de !== void 0 && (x.delete(U[1]), U[1] = de);
    }
    return L.call(g.port1, U[0], U[1], U[2]);
  })(g.port1.removeEventListener);
  let C = null;
  Object.defineProperty(g.port1, "onmessage", {
    get: () => C,
    set: (L) => {
      typeof C == "function" && g.port1.removeEventListener("message", C), C = typeof L == "function" ? L : null, typeof C == "function" && (g.port1.addEventListener("message", C), g.port1.start());
    }
  }), m.prototype.port = g.port1;
  let D = null;
  sl(f, A, m, _).then((L) => D = L);
  const R = fs(_.numberOfInputs, _.channelCount), V = fs(_.numberOfOutputs, v), ae = m.parameterDescriptors === void 0 ? [] : m.parameterDescriptors.reduce((L, { name: U }) => ({
    ...L,
    [U]: /* @__PURE__ */ new Float32Array(128)
  }), {});
  let $ = !0;
  const ee = () => {
    _.numberOfOutputs > 0 && N.disconnect(M);
    for (let L = 0, U = 0; L < _.numberOfOutputs; L += 1) {
      const de = q[L];
      for (let re = 0; re < v[L]; re += 1) M.disconnect(de, U + re, re);
      U += v[L];
    }
  }, oe = /* @__PURE__ */ new Map();
  N.onaudioprocess = ({ inputBuffer: L, outputBuffer: U }) => {
    if (D !== null) {
      const de = h(A);
      for (let re = 0; re < E; re += 128) {
        for (let H = 0; H < _.numberOfInputs; H += 1) for (let Q = 0; Q < _.channelCount; Q += 1) ps(L, R[H], Q, Q, re);
        m.parameterDescriptors !== void 0 && m.parameterDescriptors.forEach(({ name: H }, Q) => {
          ps(L, ae, H, b + Q, re);
        });
        for (let H = 0; H < _.numberOfInputs; H += 1) for (let Q = 0; Q < v[H]; Q += 1) V[H][Q].byteLength === 0 && (V[H][Q] = /* @__PURE__ */ new Float32Array(128));
        try {
          const H = R.map((Q, Ie) => {
            if (de[Ie].size > 0)
              return oe.set(Ie, E / 128), Q;
            const Ye = oe.get(Ie);
            return Ye === void 0 ? [] : (Q.every((ua) => ua.every((ha) => ha === 0)) && (Ye === 1 ? oe.delete(Ie) : oe.set(Ie, Ye - 1)), Q);
          });
          $ = u(f.currentTime + re / f.sampleRate, f.sampleRate, () => D.process(H, V, ae));
          for (let Q = 0, Ie = 0; Q < _.numberOfOutputs; Q += 1) {
            for (let Ye = 0; Ye < v[Q]; Ye += 1) nr(U, V[Q], Ye, Ie + Ye, re);
            Ie += v[Q];
          }
        } catch (H) {
          $ = !1, A.dispatchEvent(new ErrorEvent("processorerror", {
            colno: H.colno,
            filename: H.filename,
            lineno: H.lineno,
            message: H.message
          }));
        }
        if (!$) {
          for (let H = 0; H < _.numberOfInputs; H += 1) {
            T[H].disconnect(y[H]);
            for (let Q = 0; Q < _.channelCount; Q += 1) y[re].disconnect(I, Q, H * _.channelCount + Q);
          }
          if (m.parameterDescriptors !== void 0) {
            const H = m.parameterDescriptors.length;
            for (let Q = 0; Q < H; Q += 1) {
              const Ie = w[Q];
              Ie.disconnect(I, 0, b + Q), Ie.stop();
            }
          }
          I.disconnect(N), N.onaudioprocess = null, W ? ee() : ze();
          break;
        }
      }
    }
  };
  let W = !1;
  const we = o(f, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  }), Oe = () => N.connect(we).connect(f.destination), ze = () => {
    N.disconnect(we), we.disconnect();
  }, Me = () => {
    if ($) {
      ze(), _.numberOfOutputs > 0 && N.connect(M);
      for (let L = 0, U = 0; L < _.numberOfOutputs; L += 1) {
        const de = q[L];
        for (let re = 0; re < v[L]; re += 1) M.connect(de, U + re, re);
        U += v[L];
      }
    }
    W = !0;
  }, la = () => {
    $ && (Oe(), ee()), W = !1;
  };
  return Oe(), d(A, Me, la);
}, ar = (s, e) => {
  const t = s.createBiquadFilter();
  return fe(t, e), ce(t, e, "Q"), ce(t, e, "detune"), ce(t, e, "frequency"), ce(t, e, "gain"), ie(t, e, "type"), t;
}, il = (s, e) => (t, n) => {
  const i = t.createChannelMerger(n.numberOfInputs);
  return s !== null && s.name === "webkitAudioContext" && e(t, i), fe(i, n), i;
}, rl = (s) => {
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
}, Bt = (s, e) => {
  const t = s.createChannelSplitter(e.numberOfOutputs);
  return fe(t, e), rl(t), t;
}, al = (s, e, t, n, i) => (r, o) => {
  if (r.createConstantSource === void 0) return t(r, o);
  const a = r.createConstantSource();
  return fe(a, o), ce(a, o, "offset"), e(n, () => n(r)) || Ln(a), e(i, () => i(r)) || Wn(a), s(r, a), a;
}, Vt = (s, e) => (s.connect = e.connect.bind(e), s.disconnect = e.disconnect.bind(e), s), ol = (s, e, t, n) => (i, { offset: r, ...o }) => {
  const a = i.createBuffer(1, 2, 44100), c = e(i, {
    buffer: null,
    channelCount: 2,
    channelCountMode: "max",
    channelInterpretation: "speakers",
    loop: !1,
    loopEnd: 0,
    loopStart: 0,
    playbackRate: 1
  }), l = t(i, {
    ...o,
    gain: r
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
  return s(i, c), n(Vt(h, l), d, f);
}, cl = (s, e) => (t, n) => {
  const i = t.createConvolver();
  if (fe(i, n), n.disableNormalization === i.normalize && (i.normalize = !n.disableNormalization), ie(i, n, "buffer"), n.channelCount > 2 || (e(i, "channelCount", (r) => () => r.call(i), (r) => (o) => {
    if (o > 2) throw s();
    return r.call(i, o);
  }), n.channelCountMode === "max")) throw s();
  return e(i, "channelCountMode", (r) => () => r.call(i), (r) => (o) => {
    if (o === "max") throw s();
    return r.call(i, o);
  }), i;
}, vi = (s, e) => {
  const t = s.createDelay(e.maxDelayTime);
  return fe(t, e), ce(t, e, "delayTime"), t;
}, ll = (s) => (e, t) => {
  const n = e.createDynamicsCompressor();
  if (fe(n, t), t.channelCount > 2 || t.channelCountMode === "max") throw s();
  return ce(n, t, "attack"), ce(n, t, "knee"), ce(n, t, "ratio"), ce(n, t, "release"), ce(n, t, "threshold"), n;
}, Ae = (s, e) => {
  const t = s.createGain();
  return fe(t, e), ce(t, e, "gain"), t;
}, ul = (s) => (e, t, n) => {
  if (e.createIIRFilter === void 0) return s(e, t, n);
  const i = e.createIIRFilter(n.feedforward, n.feedback);
  return fe(i, n), i;
};
function hl(s, e) {
  const t = e[0] * e[0] + e[1] * e[1];
  return [(s[0] * e[0] + s[1] * e[1]) / t, (s[1] * e[0] - s[0] * e[1]) / t];
}
function dl(s, e) {
  return [s[0] * e[0] - s[1] * e[1], s[0] * e[1] + s[1] * e[0]];
}
function yi(s, e) {
  let t = [0, 0];
  for (let n = s.length - 1; n >= 0; n -= 1)
    t = dl(t, e), t[0] += s[n];
  return t;
}
var pl = (s, e, t, n) => (i, r, { channelCount: o, channelCountMode: a, channelInterpretation: c, feedback: l, feedforward: u }) => {
  const h = rr(r, i.sampleRate), d = l instanceof Float64Array ? l : new Float64Array(l), f = u instanceof Float64Array ? u : new Float64Array(u), p = d.length, m = f.length, _ = Math.min(p, m);
  if (p === 0 || p > 20) throw n();
  if (d[0] === 0) throw e();
  if (m === 0 || m > 20) throw n();
  if (f[0] === 0) throw e();
  if (d[0] !== 1) {
    for (let y = 0; y < m; y += 1) f[y] /= d[0];
    for (let y = 1; y < p; y += 1) d[y] /= d[0];
  }
  const v = t(i, h, o, o);
  v.channelCount = o, v.channelCountMode = a, v.channelInterpretation = c;
  const b = 32, S = [], k = [], g = [];
  for (let y = 0; y < o; y += 1) {
    S.push(0);
    const w = new Float32Array(b), I = new Float32Array(b);
    w.fill(0), I.fill(0), k.push(w), g.push(I);
  }
  v.onaudioprocess = (y) => {
    const w = y.inputBuffer, I = y.outputBuffer, E = w.numberOfChannels;
    for (let N = 0; N < E; N += 1) {
      const M = w.getChannelData(N), q = I.getChannelData(N);
      S[N] = ir(d, p, f, m, _, k[N], g[N], S[N], b, M, q);
    }
  };
  const T = i.sampleRate / 2;
  return Vt({
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
      for (let N = 0; N < E; N += 1) {
        const M = -Math.PI * (y[N] / T), q = [Math.cos(M), Math.sin(M)], F = hl(yi(f, q), yi(d, q));
        w[N] = Math.sqrt(F[0] * F[0] + F[1] * F[1]), I[N] = Math.atan2(F[1], F[0]);
      }
    },
    removeEventListener(...y) {
      return v.removeEventListener(y[0], y[1], y[2]);
    }
  }, v);
}, fl = (s, e) => s.createMediaElementSource(e.mediaElement), ml = (s, e) => {
  const t = s.createMediaStreamDestination();
  return fe(t, e), t.numberOfOutputs === 1 && Object.defineProperty(t, "numberOfOutputs", { get: () => 0 }), t;
}, _l = (s, { mediaStream: e }) => {
  const t = e.getAudioTracks();
  t.sort((r, o) => r.id < o.id ? -1 : r.id > o.id ? 1 : 0);
  const n = t.slice(0, 1), i = s.createMediaStreamSource(new MediaStream(n));
  return Object.defineProperty(i, "mediaStream", { value: e }), i;
}, gl = (s, e) => (t, { mediaStreamTrack: n }) => {
  if (typeof t.createMediaStreamTrackSource == "function") return t.createMediaStreamTrackSource(n);
  const i = new MediaStream([n]), r = t.createMediaStreamSource(i);
  if (n.kind !== "audio") throw s();
  if (e(t)) throw new TypeError();
  return r;
}, vl = (s) => s === null ? null : s.hasOwnProperty("OfflineAudioContext") ? s.OfflineAudioContext : s.hasOwnProperty("webkitOfflineAudioContext") ? s.webkitOfflineAudioContext : null, yl = (s, e, t, n, i, r) => (o, a) => {
  const c = o.createOscillator();
  return fe(c, a), ce(c, a, "detune"), ce(c, a, "frequency"), a.periodicWave !== void 0 ? c.setPeriodicWave(a.periodicWave) : ie(c, a, "type"), e(t, () => t(o)) || Ln(c), e(n, () => n(o)) || r(c, o), e(i, () => i(o)) || Wn(c), s(o, c), c;
}, Tl = (s) => (e, t) => {
  const n = e.createPanner();
  return n.orientationX === void 0 ? s(e, t) : (fe(n, t), ce(n, t, "orientationX"), ce(n, t, "orientationY"), ce(n, t, "orientationZ"), ce(n, t, "positionX"), ce(n, t, "positionY"), ce(n, t, "positionZ"), ie(n, t, "coneInnerAngle"), ie(n, t, "coneOuterAngle"), ie(n, t, "coneOuterGain"), ie(n, t, "distanceModel"), ie(n, t, "maxDistance"), ie(n, t, "panningModel"), ie(n, t, "refDistance"), ie(n, t, "rolloffFactor"), n);
}, wl = (s, e, t, n, i, r, o, a, c, l) => (u, { coneInnerAngle: h, coneOuterAngle: d, coneOuterGain: f, distanceModel: p, maxDistance: m, orientationX: _, orientationY: v, orientationZ: b, panningModel: S, positionX: k, positionY: g, positionZ: T, refDistance: y, rolloffFactor: w, ...I }) => {
  const E = u.createPanner();
  if (I.channelCount > 2 || I.channelCountMode === "max") throw o();
  fe(E, I);
  const N = {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete"
  }, M = t(u, {
    ...N,
    channelInterpretation: "speakers",
    numberOfInputs: 6
  }), q = n(u, {
    ...I,
    gain: 1
  }), F = n(u, {
    ...N,
    gain: 1
  }), G = n(u, {
    ...N,
    gain: 0
  }), j = n(u, {
    ...N,
    gain: 0
  }), P = n(u, {
    ...N,
    gain: 0
  }), A = n(u, {
    ...N,
    gain: 0
  }), x = n(u, {
    ...N,
    gain: 0
  }), C = i(u, 256, 6, 1), D = r(u, {
    ...N,
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
  const ae = /* @__PURE__ */ new Float32Array(1);
  C.onaudioprocess = ({ inputBuffer: W }) => {
    const we = [
      c(W, ae, 0),
      c(W, ae, 1),
      c(W, ae, 2)
    ];
    we.some((ze, Me) => ze !== R[Me]) && (E.setOrientation(...we), R = we);
    const Oe = [
      c(W, ae, 3),
      c(W, ae, 4),
      c(W, ae, 5)
    ];
    Oe.some((ze, Me) => ze !== V[Me]) && (E.setPosition(...Oe), V = Oe);
  }, Object.defineProperty(G.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(j.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(P.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(A.gain, "defaultValue", { get: () => 0 }), Object.defineProperty(x.gain, "defaultValue", { get: () => 0 });
  const $ = {
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
      return F.gain;
    },
    get orientationY() {
      return G.gain;
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
      return P.gain;
    },
    get positionY() {
      return A.gain;
    },
    get positionZ() {
      return x.gain;
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
  h !== $.coneInnerAngle && ($.coneInnerAngle = h), d !== $.coneOuterAngle && ($.coneOuterAngle = d), f !== $.coneOuterGain && ($.coneOuterGain = f), p !== $.distanceModel && ($.distanceModel = p), m !== $.maxDistance && ($.maxDistance = m), _ !== $.orientationX.value && ($.orientationX.value = _), v !== $.orientationY.value && ($.orientationY.value = v), b !== $.orientationZ.value && ($.orientationZ.value = b), S !== $.panningModel && ($.panningModel = S), k !== $.positionX.value && ($.positionX.value = k), g !== $.positionY.value && ($.positionY.value = g), T !== $.positionZ.value && ($.positionZ.value = T), y !== $.refDistance && ($.refDistance = y), w !== $.rolloffFactor && ($.rolloffFactor = w), (R[0] !== 1 || R[1] !== 0 || R[2] !== 0) && E.setOrientation(...R), (V[0] !== 0 || V[1] !== 0 || V[2] !== 0) && E.setPosition(...V);
  const ee = () => {
    q.connect(E), s(q, D, 0, 0), D.connect(F).connect(M, 0, 0), D.connect(G).connect(M, 0, 1), D.connect(j).connect(M, 0, 2), D.connect(P).connect(M, 0, 3), D.connect(A).connect(M, 0, 4), D.connect(x).connect(M, 0, 5), M.connect(C).connect(u.destination);
  }, oe = () => {
    q.disconnect(E), a(q, D, 0, 0), D.disconnect(F), F.disconnect(M), D.disconnect(G), G.disconnect(M), D.disconnect(j), j.disconnect(M), D.disconnect(P), P.disconnect(M), D.disconnect(A), A.disconnect(M), D.disconnect(x), x.disconnect(M), M.disconnect(C), C.disconnect(u.destination);
  };
  return l(Vt($, E), ee, oe);
}, bl = (s) => (e, { disableNormalization: t, imag: n, real: i }) => {
  const r = n instanceof Float32Array ? n : new Float32Array(n), o = i instanceof Float32Array ? i : new Float32Array(i), a = e.createPeriodicWave(o, r, { disableNormalization: t });
  if (Array.from(n).length < 2) throw s();
  return a;
}, Qt = (s, e, t, n) => s.createScriptProcessor(e, t, n), xl = (s, e) => (t, n) => {
  const i = n.channelCountMode;
  if (i === "clamped-max") throw e();
  if (t.createStereoPanner === void 0) return s(t, n);
  const r = t.createStereoPanner();
  return fe(r, n), ce(r, n, "pan"), Object.defineProperty(r, "channelCountMode", {
    get: () => i,
    set: (o) => {
      if (o !== i) throw e();
    }
  }), r;
}, Cl = (s, e, t, n, i, r) => {
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
    for (let P = 0; P < 16385; P += 1) if (P > T) {
      const A = (P - T) / (16384 - T) * c;
      b[P] = Math.cos(A), S[P] = Math.sin(A), k[P] = 0, g[P] = 1;
    } else {
      const A = P / (16384 - T) * c;
      b[P] = 1, S[P] = 0, k[P] = Math.cos(A), g[P] = Math.sin(A);
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
    }), N = n(p, {
      ...u,
      curve: S
    }), M = n(p, {
      ...u,
      curve: a
    }), q = t(p, {
      ...l,
      gain: 0
    }), F = n(p, {
      ...u,
      curve: k
    }), G = t(p, {
      ...l,
      gain: 0
    }), j = n(p, {
      ...u,
      curve: g
    });
    return {
      connectGraph() {
        m.connect(y), m.connect(M.inputs === void 0 ? M : M.inputs[0]), y.connect(w, 0), y.connect(E, 0), y.connect(q, 1), y.connect(G, 1), M.connect(_), _.connect(I.inputs === void 0 ? I : I.inputs[0]), _.connect(N.inputs === void 0 ? N : N.inputs[0]), _.connect(F.inputs === void 0 ? F : F.inputs[0]), _.connect(j.inputs === void 0 ? j : j.inputs[0]), I.connect(w.gain), N.connect(E.gain), F.connect(q.gain), j.connect(G.gain), w.connect(v, 0, 0), q.connect(v, 0, 0), E.connect(v, 0, 1), G.connect(v, 0, 1);
      },
      disconnectGraph() {
        m.disconnect(y), m.disconnect(M.inputs === void 0 ? M : M.inputs[0]), y.disconnect(w, 0), y.disconnect(E, 0), y.disconnect(q, 1), y.disconnect(G, 1), M.disconnect(_), _.disconnect(I.inputs === void 0 ? I : I.inputs[0]), _.disconnect(N.inputs === void 0 ? N : N.inputs[0]), _.disconnect(F.inputs === void 0 ? F : F.inputs[0]), _.disconnect(j.inputs === void 0 ? j : j.inputs[0]), I.disconnect(w.gain), N.disconnect(E.gain), F.disconnect(q.gain), j.disconnect(G.gain), w.disconnect(v, 0, 0), q.disconnect(v, 0, 0), E.disconnect(v, 0, 1), G.disconnect(v, 0, 1);
      }
    };
  }, f = (p, m, _, v, b) => {
    if (m === 1) return h(p, _, v, b);
    if (m === 2) return d(p, _, v, b);
    throw i();
  };
  return (p, { channelCount: m, channelCountMode: _, pan: v, ...b }) => {
    if (_ === "max") throw i();
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
      set channelCount(M) {
        k.channelCount !== M && (I && y(), { connectGraph: T, disconnectGraph: y } = f(p, M, k, g, S), I && T()), k.channelCount = M;
      },
      get channelCountMode() {
        return k.channelCountMode;
      },
      set channelCountMode(M) {
        if (M === "clamped-max" || M === "max") throw i();
        k.channelCountMode = M;
      },
      get channelInterpretation() {
        return k.channelInterpretation;
      },
      set channelInterpretation(M) {
        k.channelInterpretation = M;
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
      addEventListener(...M) {
        return k.addEventListener(M[0], M[1], M[2]);
      },
      dispatchEvent(...M) {
        return k.dispatchEvent(M[0]);
      },
      removeEventListener(...M) {
        return k.removeEventListener(M[0], M[1], M[2]);
      }
    };
    let I = !1;
    const E = () => {
      T(), I = !0;
    }, N = () => {
      y(), I = !1;
    };
    return r(Vt(w, S), E, N);
  };
}, Sl = (s, e, t, n, i, r, o) => (a, c) => {
  const l = a.createWaveShaper();
  if (r !== null && r.name === "webkitAudioContext" && a.createGain().gain.automationRate === void 0) return t(a, c);
  fe(l, c);
  const u = c.curve === null || c.curve instanceof Float32Array ? c.curve : new Float32Array(c.curve);
  if (u !== null && u.length < 2) throw e();
  ie(l, { curve: u }, "curve"), ie(l, c, "oversample");
  let h = null, d = !1;
  return o(l, "curve", (m) => () => m.call(l), (m) => (_) => (m.call(l, _), d && (n(_) && h === null ? h = s(a, l) : !n(_) && h !== null && (h(), h = null)), _)), i(l, () => {
    d = !0, n(l.curve) && (h = s(a, l));
  }, () => {
    d = !1, h !== null && (h(), h = null);
  });
}, Al = (s, e, t, n, i) => (r, { curve: o, oversample: a, ...c }) => {
  const l = r.createWaveShaper(), u = r.createWaveShaper();
  fe(l, c), fe(u, c);
  const h = t(r, {
    ...c,
    gain: 1
  }), d = t(r, {
    ...c,
    gain: -1
  }), f = t(r, {
    ...c,
    gain: 1
  }), p = t(r, {
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
        for (let N = 1; N < I; N += 1) {
          const M = N / I * E, q = Math.floor(M), F = Math.ceil(M);
          y[N] = q === F ? g[q] : (1 - (M - q)) * g[q] + (1 - (F - M)) * g[F], w[N] = q === F ? -g[T - 1 - q] : -((1 - (M - q)) * g[T - 1 - q]) - (1 - (F - M)) * g[T - 1 - F];
        }
        y[I] = T % 2 === 1 ? g[I - 1] : (g[I - 2] + g[I - 1]) / 2, l.curve = y, u.curve = w;
      }
      v = g, _ && (n(v) && m === null ? m = s(r, h) : m !== null && (m(), m = null));
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
    h.connect(l).connect(f), h.connect(d).connect(u).connect(p).connect(f), _ = !0, n(v) && (m = s(r, h));
  }, k = () => {
    h.disconnect(l), l.disconnect(f), h.disconnect(d), d.disconnect(u), u.disconnect(p), p.disconnect(f), _ = !1, m !== null && (m(), m = null);
  };
  return i(Vt(b, f), S, k);
}, ye = () => new DOMException("", "NotSupportedError"), kl = { numberOfChannels: 1 }, Ol = (s, e, t, n, i) => class extends s {
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
      ...kl,
      ...l
    }, f = n(h, u, d);
    e(ft, () => ft(f)) || f.addEventListener("statechange", /* @__PURE__ */ (() => {
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
    return this._state === "running" ? Promise.reject(t()) : (this._state = "running", i(this.destination, this._nativeOfflineAudioContext).finally(() => {
      this._state = null, bs(this);
    }));
  }
  _waitForThePromiseToSettle(o) {
    this._state === null ? this._nativeOfflineAudioContext.dispatchEvent(o) : setTimeout(() => this._waitForThePromiseToSettle(o));
  }
}, Nl = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  detune: 0,
  frequency: 440,
  periodicWave: void 0,
  type: "sine"
}, Ml = (s, e, t, n, i, r, o) => class extends s {
  constructor(c, l) {
    const u = i(c), h = {
      ...Nl,
      ...l
    }, d = t(u, h), f = r(u), p = f ? n() : null, m = c.sampleRate / 2;
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
      Ot(this);
      const l = () => {
        this._nativeOscillatorNode.removeEventListener("ended", l), Ze(this) && Zt(this);
      };
      this._nativeOscillatorNode.addEventListener("ended", l);
    }
  }
  stop(c = 0) {
    this._nativeOscillatorNode.stop(c), this._oscillatorNodeRenderer !== null && (this._oscillatorNodeRenderer.stop = c);
  }
}, Dl = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap();
  let o = null, a = null, c = null;
  const l = async (u, h) => {
    let d = t(u);
    const f = Te(d, h);
    return f || (d = e(h, {
      channelCount: d.channelCount,
      channelCountMode: d.channelCountMode,
      channelInterpretation: d.channelInterpretation,
      detune: d.detune.value,
      frequency: d.frequency.value,
      periodicWave: o === null ? void 0 : o,
      type: d.type
    }), a !== null && d.start(a), c !== null && d.stop(c)), r.set(h, d), f ? (await s(h, u.detune, d.detune), await s(h, u.frequency, d.frequency)) : (await n(h, u.detune, d.detune), await n(h, u.frequency, d.frequency)), await i(u, h, d), d;
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
      const d = r.get(h);
      return d !== void 0 ? Promise.resolve(d) : l(u, h);
    }
  };
}, El = {
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
}, Il = (s, e, t, n, i, r, o) => class extends s {
  constructor(c, l) {
    const u = i(c), h = t(u, {
      ...El,
      ...l
    }), d = r(u), f = d ? n() : null;
    super(c, !1, h, f), this._nativePannerNode = h, this._orientationX = e(this, d, h.orientationX, be, Ne), this._orientationY = e(this, d, h.orientationY, be, Ne), this._orientationZ = e(this, d, h.orientationZ, be, Ne), this._positionX = e(this, d, h.positionX, be, Ne), this._positionY = e(this, d, h.positionY, be, Ne), this._positionZ = e(this, d, h.positionZ, be, Ne), o(this, 1);
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
}, Rl = (s, e, t, n, i, r, o, a, c, l) => () => {
  const u = /* @__PURE__ */ new WeakMap();
  let h = null;
  const d = async (f, p) => {
    let m = null, _ = r(f);
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
    }, S = Te(_, p);
    if ("bufferSize" in _ ? m = n(p, {
      ...v,
      gain: 1
    }) : S || (_ = i(p, {
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
        const N = new o(6, f.context.length, p.sampleRate), M = e(N, {
          channelCount: 1,
          channelCountMode: "explicit",
          channelInterpretation: "speakers",
          numberOfInputs: 6
        });
        M.connect(N.destination), h = (async () => {
          const q = await Promise.all([
            f.orientationX,
            f.orientationY,
            f.orientationZ,
            f.positionX,
            f.positionY,
            f.positionZ
          ].map(async (F, G) => {
            const j = t(N, {
              channelCount: 1,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
              offset: G === 0 ? 1 : 0
            });
            return await a(N, F, j.offset), j;
          }));
          for (let F = 0; F < 6; F += 1)
            q[F].connect(M, 0, F), q[F].start(0);
          return l(N);
        })();
      }
      const k = await h, g = n(p, {
        ...v,
        gain: 1
      });
      await c(f, p, g);
      const T = [];
      for (let N = 0; N < k.numberOfChannels; N += 1) T.push(k.getChannelData(N));
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
      }), E = i(p, {
        ...b,
        orientationX: y[0],
        orientationY: y[1],
        orientationZ: y[2],
        positionX: w[0],
        positionY: w[1],
        positionZ: w[2]
      });
      g.connect(I).connect(E.inputs[0]), E.connect(m);
      for (let N = 128; N < k.length; N += 128) {
        const M = [
          T[0][N],
          T[1][N],
          T[2][N]
        ], q = [
          T[3][N],
          T[4][N],
          T[5][N]
        ];
        if (M.some((F, G) => F !== y[G]) || q.some((F, G) => F !== w[G])) {
          y = M, w = q;
          const F = N / p.sampleRate;
          I.gain.setValueAtTime(0, F), I = n(p, {
            ...v,
            gain: 0
          }), E = i(p, {
            ...b,
            orientationX: y[0],
            orientationY: y[1],
            orientationZ: y[2],
            positionX: w[0],
            positionY: w[1],
            positionZ: w[2]
          }), I.gain.setValueAtTime(1, F), g.connect(I).connect(E.inputs[0]), E.connect(m);
        }
      }
      return m;
    }
    return S ? (await s(p, f.orientationX, _.orientationX), await s(p, f.orientationY, _.orientationY), await s(p, f.orientationZ, _.orientationZ), await s(p, f.positionX, _.positionX), await s(p, f.positionY, _.positionY), await s(p, f.positionZ, _.positionZ)) : (await a(p, f.orientationX, _.orientationX), await a(p, f.orientationY, _.orientationY), await a(p, f.orientationZ, _.orientationZ), await a(p, f.positionX, _.positionX), await a(p, f.positionY, _.positionY), await a(p, f.positionZ, _.positionZ)), Rt(_) ? await c(f, p, _.inputs[0]) : await c(f, p, _), _;
  };
  return { render(f, p) {
    const m = u.get(p);
    return m !== void 0 ? Promise.resolve(m) : d(f, p);
  } };
}, Vl = { disableNormalization: !1 }, Fl = (s, e, t, n) => class or {
  constructor(r, o) {
    const a = s(e(r), n({
      ...Vl,
      ...o
    }));
    return t.add(a), a;
  }
  static [Symbol.hasInstance](r) {
    return r !== null && typeof r == "object" && Object.getPrototypeOf(r) === or.prototype || t.has(r);
  }
}, Pl = (s, e) => (t, n, i) => (s(n).replay(i), e(n, t, i)), ql = (s, e, t) => async (n, i, r) => {
  const o = s(n);
  await Promise.all(o.activeInputs.map((a, c) => Array.from(a).map(async ([l, u]) => {
    const h = await e(l).render(l, i), d = n.context.destination;
    !t(l) && (n !== d || !t(n)) && h.connect(r, u, c);
  })).reduce((a, c) => [...a, ...c], []));
}, Ll = (s, e, t) => async (n, i, r) => {
  const o = e(n);
  await Promise.all(Array.from(o.activeInputs).map(async ([a, c]) => {
    const l = await s(a).render(a, i);
    t(a) || l.connect(r, c);
  }));
}, Wl = (s, e, t, n) => (i) => s(ft, () => ft(i)) ? Promise.resolve(s(n, n)).then((r) => {
  if (!r) {
    const o = t(i, 512, 0, 1);
    i.oncomplete = () => {
      o.onaudioprocess = null, o.disconnect();
    }, o.onaudioprocess = () => i.currentTime, o.connect(i.destination);
  }
  return i.startRendering();
}) : new Promise((r) => {
  const o = e(i, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  });
  i.oncomplete = (a) => {
    o.disconnect(), r(a.renderedBuffer);
  }, o.connect(i.destination), i.startRendering();
}), jl = (s) => (e, t) => {
  s.set(e, t);
}, Bl = (s) => (e, t) => s.set(e, t), Ul = (s, e, t, n, i, r, o, a) => (c, l) => t(c).render(c, l).then(() => Promise.all(Array.from(n(l)).map((u) => t(u).render(u, l)))).then(() => i(l)).then((u) => (typeof u.copyFromChannel != "function" ? (o(u), Fn(u)) : e(r, () => r(u)) || a(u), s.add(u), u)), Gl = {
  channelCount: 2,
  channelCountMode: "explicit",
  channelInterpretation: "speakers",
  pan: 0
}, zl = (s, e, t, n, i, r) => class extends s {
  constructor(a, c) {
    const l = i(a), u = t(l, {
      ...Gl,
      ...c
    }), h = r(l), d = h ? n() : null;
    super(a, !1, u, d), this._pan = e(this, h, u.pan);
  }
  get pan() {
    return this._pan;
  }
}, $l = (s, e, t, n, i) => () => {
  const r = /* @__PURE__ */ new WeakMap(), o = async (a, c) => {
    let l = t(a);
    const u = Te(l, c);
    return u || (l = e(c, {
      channelCount: l.channelCount,
      channelCountMode: l.channelCountMode,
      channelInterpretation: l.channelInterpretation,
      pan: l.pan.value
    })), r.set(c, l), u ? await s(c, a.pan, l.pan) : await n(c, a.pan, l.pan), Rt(l) ? await i(a, c, l.inputs[0]) : await i(a, c, l), l;
  };
  return { render(a, c) {
    const l = r.get(c);
    return l !== void 0 ? Promise.resolve(l) : o(a, c);
  } };
}, Zl = (s) => () => {
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
}, Xl = (s, e) => async () => {
  if (s === null) return !0;
  if (e === null) return !1;
  const t = new Blob(['class A extends AudioWorkletProcessor{process(i){this.port.postMessage(i,[i[0][0].buffer])}}registerProcessor("a",A)'], { type: "application/javascript; charset=utf-8" }), n = new e(1, 128, 44100), i = URL.createObjectURL(t);
  let r = !1, o = !1;
  try {
    await n.audioWorklet.addModule(i);
    const a = new s(n, "a", { numberOfOutputs: 0 }), c = n.createOscillator();
    a.port.onmessage = () => r = !0, a.onprocessorerror = () => o = !0, c.connect(a), c.start(0), await n.startRendering(), await new Promise((l) => setTimeout(l));
  } catch {
  } finally {
    URL.revokeObjectURL(i);
  }
  return r && !o;
}, Hl = (s, e) => () => {
  if (e === null) return Promise.resolve(!1);
  const t = new e(1, 1, 44100), n = s(t, {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    gain: 0
  });
  return new Promise((i) => {
    t.oncomplete = () => {
      n.disconnect(), i(t.currentTime !== 0);
    }, t.startRendering();
  });
}, cr = () => new DOMException("", "UnknownError"), Ql = {
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  curve: null,
  oversample: "none"
}, Yl = (s, e, t, n, i, r, o) => class extends s {
  constructor(c, l) {
    const u = i(c), h = t(u, {
      ...Ql,
      ...l
    }), d = r(u) ? n() : null;
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
}, Jl = (s, e, t) => () => {
  const n = /* @__PURE__ */ new WeakMap(), i = async (r, o) => {
    let a = e(r);
    return Te(a, o) || (a = s(o, {
      channelCount: a.channelCount,
      channelCountMode: a.channelCountMode,
      channelInterpretation: a.channelInterpretation,
      curve: a.curve,
      oversample: a.oversample
    })), n.set(o, a), Rt(a) ? await t(r, o, a.inputs[0]) : await t(r, o, a), a;
  };
  return { render(r, o) {
    const a = n.get(o);
    return a !== void 0 ? Promise.resolve(a) : i(r, o);
  } };
}, Kl = () => typeof window > "u" ? null : window, eu = (s, e) => (t) => {
  t.copyFromChannel = (n, i, r = 0) => {
    const o = s(r), a = s(i);
    if (a >= t.numberOfChannels) throw e();
    const c = t.length, l = t.getChannelData(a), u = n.length;
    for (let h = o < 0 ? -o : 0; h + o < c && h < u; h += 1) n[h] = l[h + o];
  }, t.copyToChannel = (n, i, r = 0) => {
    const o = s(r), a = s(i);
    if (a >= t.numberOfChannels) throw e();
    const c = t.length, l = t.getChannelData(a), u = n.length;
    for (let h = o < 0 ? -o : 0; h + o < c && h < u; h += 1) l[h + o] = n[h];
  };
}, tu = (s) => (e) => {
  e.copyFromChannel = /* @__PURE__ */ ((t) => (n, i, r = 0) => {
    const o = s(r), a = s(i);
    if (o < e.length) return t.call(e, n, a, o);
  })(e.copyFromChannel), e.copyToChannel = /* @__PURE__ */ ((t) => (n, i, r = 0) => {
    const o = s(r), a = s(i);
    if (o < e.length) return t.call(e, n, a, o);
  })(e.copyToChannel);
}, su = (s) => (e, t) => {
  const n = t.createBuffer(1, 1, 44100);
  e.buffer === null && (e.buffer = n), s(e, "buffer", (i) => () => {
    const r = i.call(e);
    return r === n ? null : r;
  }, (i) => (r) => i.call(e, r === null ? n : r));
}, nu = (s, e) => (t, n) => {
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
  const i = t.createBufferSource();
  e(n, () => {
    const a = n.numberOfInputs;
    for (let c = 0; c < a; c += 1) i.connect(n, 0, c);
  }, () => i.disconnect(n));
}, lr = (s, e, t) => s.copyFromChannel === void 0 ? s.getChannelData(t)[0] : (s.copyFromChannel(e, t), e[0]), Ti = (s) => {
  if (s === null) return !1;
  const e = s.length;
  return e % 2 !== 0 ? s[Math.floor(e / 2)] !== 0 : s[e / 2 - 1] + s[e / 2] !== 0;
}, Yt = (s, e, t, n) => {
  let i = s;
  for (; !i.hasOwnProperty(e); ) i = Object.getPrototypeOf(i);
  const { get: r, set: o } = Object.getOwnPropertyDescriptor(i, e);
  Object.defineProperty(s, e, {
    get: t(r),
    set: n(o)
  });
}, iu = (s) => ({
  ...s,
  outputChannelCount: s.outputChannelCount !== void 0 ? s.outputChannelCount : s.numberOfInputs === 1 && s.numberOfOutputs === 1 ? [s.channelCount] : Array.from({ length: s.numberOfOutputs }, () => 1)
}), ru = (s) => ({
  ...s,
  channelCount: s.numberOfOutputs
}), au = (s) => {
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
}, ur = (s, e, t) => {
  try {
    s.setValueAtTime(e, t);
  } catch (n) {
    if (n.code !== 9) throw n;
    ur(s, e, t + 1e-7);
  }
}, ou = (s) => {
  const e = s.createBufferSource();
  e.start();
  try {
    e.start();
  } catch {
    return !0;
  }
  return !1;
}, cu = (s) => {
  const e = s.createBufferSource();
  e.buffer = s.createBuffer(1, 1, 44100);
  try {
    e.start(0, 1);
  } catch {
    return !1;
  }
  return !0;
}, lu = (s) => {
  const e = s.createBufferSource();
  e.start();
  try {
    e.stop();
  } catch {
    return !1;
  }
  return !0;
}, jn = (s) => {
  const e = s.createOscillator();
  try {
    e.start(-1);
  } catch (t) {
    return t instanceof RangeError;
  }
  return !1;
}, hr = (s) => {
  const e = s.createBuffer(1, 1, 44100), t = s.createBufferSource();
  t.buffer = e, t.start(), t.stop();
  try {
    return t.stop(), !0;
  } catch {
    return !1;
  }
}, Bn = (s) => {
  const e = s.createOscillator();
  try {
    e.stop(-1);
  } catch (t) {
    return t instanceof RangeError;
  }
  return !1;
}, uu = (s) => {
  const { port1: e, port2: t } = new MessageChannel();
  try {
    e.postMessage(s);
  } finally {
    e.close(), t.close();
  }
}, hu = (s) => {
  s.start = /* @__PURE__ */ ((e) => (t = 0, n = 0, i) => {
    const r = s.buffer, o = r === null ? n : Math.min(r.duration, n);
    r !== null && o > r.duration - 0.5 / s.context.sampleRate ? e.call(s, t, 0, 0) : e.call(s, t, o, i);
  })(s.start);
}, dr = (s, e) => {
  const t = e.createGain();
  s.connect(t);
  const n = /* @__PURE__ */ ((i) => () => {
    i.call(s, t), s.removeEventListener("ended", n);
  })(s.disconnect);
  s.addEventListener("ended", n), Vt(s, t), s.stop = /* @__PURE__ */ ((i) => {
    let r = !1;
    return (o = 0) => {
      if (r) try {
        i.call(s, o);
      } catch {
        t.gain.setValueAtTime(0, o);
      }
      else
        i.call(s, o), r = !0;
    };
  })(s.stop);
}, Ft = (s, e) => (t) => {
  const n = { value: s };
  return Object.defineProperties(t, {
    currentTarget: n,
    target: n
  }), typeof e == "function" ? e.call(s, t) : e.handleEvent.call(s, t);
}, du = Ma(yt), pu = Fa(yt), fu = Xo(ws), pr = /* @__PURE__ */ new WeakMap(), mu = dc(pr), Ee = Co(/* @__PURE__ */ new Map(), /* @__PURE__ */ new WeakMap()), We = Kl(), fr = zc(Ee, Be), Un = hc(xe), ve = ql(xe, Un, pt), _u = ja(fr, ne, ve), te = mc(Ts), Qe = vl(We), K = Ec(Qe), mr = /* @__PURE__ */ new WeakMap(), _r = ic(Ft), Pt = Hc(We), Gn = Oc(Pt), zn = Nc(We), gr = Mc(We), Ut = Yc(We), le = ho(Da(zi), Va(du, pu, us, fu, hs, xe, mu, $t, ne, yt, Ze, pt, ss), Ee, xc(Ms, hs, xe, ne, jt, Ze), Be, xs, ye, Go(us, Ms, xe, ne, jt, te, Ze, K), Yo(mr, xe, Fe), _r, te, Gn, zn, gr, K, Ut), gu = Wa(le, _u, Be, fr, te, K), $n = /* @__PURE__ */ new WeakSet(), wi = $c(We), vr = Po(/* @__PURE__ */ new Uint32Array(1)), Zn = eu(vr, Be), Xn = tu(vr), yr = Ua($n, Ee, ye, wi, Qe, Zl(wi), Zn, Xn), ms = Pa(Ae), Tr = Ll(Un, Xt, pt), Ue = Do(Tr), qt = Xc(ms, Ee, ou, cu, lu, jn, hr, Bn, hu, su(Yt), dr), Ge = Pl(pc(Xt), Tr), vu = $a(Ue, qt, ne, Ge, ve), Le = po(Ea($i), mr, Vn, fo, Je.createCancelAndHoldAutomationEvent, Je.createCancelScheduledValuesAutomationEvent, Je.createExponentialRampToValueAutomationEvent, Je.createLinearRampToValueAutomationEvent, Je.createSetTargetAutomationEvent, Je.createSetValueAutomationEvent, Je.createSetValueCurveAutomationEvent, Pt, ur), yu = za(le, vu, Le, he, qt, te, K, Ft), Tu = eo(le, to, Be, he, Qc(Ae, Yt), te, K, ve), wu = xo(Ue, ar, ne, Ge, ve), Tt = Bl(pr), bu = bo(le, Le, wu, xs, ar, te, K, Tt), nt = Uc(yt, zn), it = il(Pt, nu(he, nt)), xu = Ao(le, ko(it, ne, ve), it, te, K), Cu = No(le, Mo(Bt, ne, ve), Bt, te, K, ru), Nt = al(ms, Ee, ol(ms, qt, Ae, nt), jn, Bn), Su = Vo(le, Le, Fo(Ue, Nt, ne, Ge, ve), Nt, te, K, Ft), bi = cl(ye, Yt), Au = Lo(le, Wo(bi, ne, ve), bi, te, K, Tt), ku = $o(le, Le, Zo(Ue, vi, ne, Ge, ve), vi, te, K, Tt), xi = ll(ye), Ou = ec(le, Le, tc(Ue, xi, ne, Ge, ve), xi, ye, te, K, Tt), Nu = cc(le, Le, lc(Ue, Ae, ne, Ge, ve), Ae, te, K), Mu = pl(xs, he, Qt, ye), Cs = Wl(Ee, Ae, Qt, Hl(Ae, Qe)), Du = bc(qt, ne, Qe, ve, Cs), Eu = Tc(le, ul(Mu), Du, te, K, Tt), Iu = so(Le, it, Nt, Qt, ye, lr, K, Yt), wr = /* @__PURE__ */ new WeakMap(), Hn = Wc(Tu, Iu, _r, K, wr, Ft), Ci = yl(ms, Ee, jn, hr, Bn, dr), Ru = Ml(le, Le, Ci, Dl(Ue, Ci, ne, Ge, ve), te, K, Ft), Si = Io(qt), _s = Sl(Si, he, Al(Si, he, Ae, Ti, nt), Ti, nt, Pt, Yt), Ai = Tl(wl(us, he, it, Ae, Qt, _s, ye, hs, lr, nt)), Vu = Il(le, Le, Ai, Rl(Ue, it, Nt, Ae, Ai, ne, Qe, Ge, ve, Cs), te, K, Tt), Fu = Fl(bl(Be), te, /* @__PURE__ */ new WeakSet(), au), ki = xl(Cl(it, Bt, Ae, _s, ye, nt), ye), Pu = zl(le, Le, ki, $l(Ue, ki, ne, Ge, ve), te, K), qu = Yl(le, he, _s, Jl(_s, ne, ve), te, K, Tt), br = Ic(We), Qn = rc(We), xr = /* @__PURE__ */ new WeakMap(), Lu = _c(xr, Qe), Wu = br ? Ra(Ee, ye, nc(We), Qn, ac(Na), te, Lu, K, Ut, /* @__PURE__ */ new WeakMap(), /* @__PURE__ */ new WeakMap(), Xl(Ut, Qe), We) : void 0, ju = Dc(Gn, K), Bu = Uo($n, Ee, Bo, sc, /* @__PURE__ */ new WeakSet(), te, ju, cs, ft, Zn, Xn), Cr = To(Wu, gu, yr, yu, bu, xu, Cu, Su, Au, Bu, ku, Ou, Nu, Eu, Hn, Ru, Vu, Fu, Pu, qu), Uu = Rc(le, fl, te, K), Gu = Fc(le, ml, te, K), zu = Pc(le, _l, te, K), $u = qc(le, gl(he, K), te), Zu = Ka(Cr, he, ye, cr, Uu, Gu, zu, $u, Pt), Yn = gc(wr), Xu = qa(Yn), Sr = Eo(Be), Hu = Ho(Yn), Ar = Jo(Be), kr = /* @__PURE__ */ new WeakMap(), Qu = Kc(he, nl(Sr, Be, he, it, Bt, Nt, Ae, Qt, ye, Ar, Qn, uc(kr, Fe), nt), Ae, ye, nt), Yu = yo(Ue, Sr, qt, it, Bt, Nt, Ae, Hu, Ar, Qn, ne, Ut, Qe, Ge, ve, Cs), Ju = fc(xr), Ku = jl(kr), Oi = br ? _o(Xu, le, Le, Yu, Qu, xe, Ju, te, K, Ut, iu, Ku, uu, Ft) : void 0, gd = Lc(he, ye, cr, Hn, Pt), Or = jo(ye, Qe), Nr = Ul($n, Ee, Un, Yn, Cs, cs, Zn, Xn), vd = Bc(Ee, he, Or, Hn, Nr), eh = Ol(Cr, Ee, he, Or, Nr), th = Cc(Ts, Gn), sh = Sc(Rn, zn), nh = Ac(Vn, gr), ih = kc(Ts, K);
function mt(s) {
  return nh(s);
}
function et(s) {
  return sh(s);
}
function ns(s) {
  return ih(s);
}
function St(s) {
  return th(s);
}
function rh(s) {
  return s instanceof yr;
}
function Ve(s) {
  return s === void 0;
}
function Z(s) {
  return s !== void 0;
}
function ah(s) {
  return typeof s == "function";
}
function _t(s) {
  return typeof s == "number";
}
function ht(s) {
  return Object.prototype.toString.call(s) === "[object Object]" && s.constructor === Object;
}
function oh(s) {
  return typeof s == "boolean";
}
function je(s) {
  return Array.isArray(s);
}
function gt(s) {
  return typeof s == "string";
}
function ch(s, e) {
  return s === "value" || mt(e) || et(e) || rh(e);
}
function tt(s, ...e) {
  if (!e.length) return s;
  const t = e.shift();
  if (ht(s) && ht(t)) for (const n in t) ch(n, t[n]) ? s[n] = t[n] : ht(t[n]) ? (s[n] || Object.assign(s, { [n]: {} }), tt(s[n], t[n])) : Object.assign(s, { [n]: t[n] });
  return tt(s, ...e);
}
function lh(s, e) {
  return s.length === e.length && s.every((t, n) => e[n] === t);
}
function O(s, e, t = [], n) {
  const i = {}, r = Array.from(e);
  if (ht(r[0]) && n && !Reflect.has(r[0], n) && (Object.keys(r[0]).some((o) => Reflect.has(s, o)) || (tt(i, { [n]: r[0] }), t.splice(t.indexOf(n), 1), r.shift())), r.length === 1 && ht(r[0])) tt(i, r[0]);
  else for (let o = 0; o < t.length; o++) Z(r[o]) && (i[t[o]] = r[o]);
  return tt(s, i);
}
function uh(s) {
  return s.constructor.getDefaults();
}
function Vs(s, e) {
  return Ve(s) ? e : s;
}
function Se(s, e) {
  return e.forEach((t) => {
    Reflect.has(s, t) && delete s[t];
  }), s;
}
var Mr = "14.9.17";
function z(s, e) {
  if (!s) throw new Error(e);
}
function wt(s, e, t = 1 / 0) {
  if (!(e <= s && s <= t)) throw new RangeError(`Value must be within [${e}, ${t}], got: ${s}`);
}
function Dr(s) {
  !s.isOffline && s.state !== "running" && Ss('The AudioContext is "suspended". Invoke Tone.start() from a user action to start the audio.');
}
var Er = !1, Ni = !1;
function Mi(s) {
  Er = s;
}
function hh(s) {
  Ve(s) && Er && !Ni && (Ni = !0, Ss("Events scheduled inside of scheduled callbacks should use the passed in scheduling time. See https://github.com/Tonejs/Tone.js/wiki/Accurate-Timing"));
}
var Ir = console;
function dh(...s) {
  Ir.log(...s);
}
function Ss(...s) {
  Ir.warn(...s);
}
function ph(s) {
  return new Zu(s);
}
function fh(s, e, t) {
  return new eh(s, e, t);
}
var dt = typeof self == "object" ? self : null, mh = dt && (dt.hasOwnProperty("AudioContext") || dt.hasOwnProperty("webkitAudioContext"));
function _h(s, e, t) {
  return z(Z(Oi), "This node only works in a secure context (https or localhost)"), new Oi(s, e, t);
}
var ot = class {
  constructor() {
    this.debug = !1, this._wasDisposed = !1;
  }
  static getDefaults() {
    return {};
  }
  log(...s) {
    (this.debug || dt && this.toString() === dt.TONE_DEBUG_CLASS) && dh(this, ...s);
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
ot.version = Mr;
var Jn = 1e-6;
function Mt(s, e) {
  return s > e + Jn;
}
function Fs(s, e) {
  return Mt(s, e) || Re(s, e);
}
function gs(s, e) {
  return s + Jn < e;
}
function Re(s, e) {
  return Math.abs(s - e) < Jn;
}
function gh(s, e, t) {
  return Math.max(Math.min(s, t), e);
}
var Xe = class Rr extends ot {
  constructor() {
    super(), this.name = "Timeline", this._timeline = [];
    const e = O(Rr.getDefaults(), arguments, ["memory"]);
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
    if (z(Reflect.has(e, "time"), "Timeline: events must have a time attribute"), e.time = e.time.valueOf(), this.increasing && this.length) {
      const t = this._timeline[this.length - 1];
      z(Fs(e.time, t.time), "The time must be greater than or equal to the last scheduled time"), this._timeline.push(e);
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
      if (t >= 0) if (Re(this._timeline[t].time, e)) {
        for (let n = t; n >= 0 && Re(this._timeline[n].time, e); n--) t = n;
        this._timeline = this._timeline.slice(0, t);
      } else this._timeline = this._timeline.slice(0, t + 1);
      else this._timeline = [];
    } else this._timeline.length === 1 && Fs(this._timeline[0].time, e) && (this._timeline = []);
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
    const i = this._timeline.length;
    let r = i;
    if (i > 0 && this._timeline[i - 1][t] <= e) return i - 1;
    for (; n < r; ) {
      let o = Math.floor(n + (r - n) / 2);
      const a = this._timeline[o], c = this._timeline[o + 1];
      if (Re(a[t], e)) {
        for (let l = o; l < this._timeline.length; l++) {
          const u = this._timeline[l];
          if (Re(u[t], e)) o = l;
          else break;
        }
        return o;
      } else {
        if (gs(a[t], e) && Mt(c[t], e)) return o;
        Mt(a[t], e) ? r = o : n = o + 1;
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
    let i = this._search(e), r = this._search(t);
    return i !== -1 && r !== -1 ? (this._timeline[i].time !== e && (i += 1), this._timeline[r].time === t && (r -= 1), this._iterate(n, i, r)) : i === -1 && this._iterate(n, 0, r), this;
  }
  forEachFrom(e, t) {
    let n = this._search(e);
    for (; n >= 0 && this._timeline[n].time >= e; ) n--;
    return this._iterate(t, n + 1), this;
  }
  forEachAtTime(e, t) {
    const n = this._search(e);
    if (n !== -1 && Re(this._timeline[n].time, e)) {
      let i = n;
      for (let r = n; r >= 0 && Re(this._timeline[r].time, e); r--) i = r;
      this._iterate((r) => {
        t(r);
      }, i, n);
    }
    return this;
  }
  dispose() {
    return super.dispose(), this._timeline = [], this;
  }
};
function bt(s, e, t, n) {
  var i = arguments.length, r = i < 3 ? e : n === null ? n = Object.getOwnPropertyDescriptor(e, t) : n, o;
  if (typeof Reflect == "object" && typeof Reflect.decorate == "function") r = Reflect.decorate(s, e, t, n);
  else for (var a = s.length - 1; a >= 0; a--) (o = s[a]) && (r = (i < 3 ? o(r) : i > 3 ? o(e, t, r) : o(e, t)) || r);
  return i > 3 && r && Object.defineProperty(e, t, r), r;
}
function pe(s, e, t, n) {
  function i(r) {
    return r instanceof t ? r : new t(function(o) {
      o(r);
    });
  }
  return new (t || (t = Promise))(function(r, o) {
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
      u.done ? r(u.value) : i(u.value).then(a, c);
    }
    l((n = n.apply(s, e || [])).next());
  });
}
var vh = class {
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
}, Vr = [];
function Fr(s) {
  Vr.push(s);
}
function yh(s) {
  Vr.forEach((e) => e(s));
}
var Pr = [];
function qr(s) {
  Pr.push(s);
}
function Th(s) {
  Pr.forEach((e) => e(s));
}
var Kn = class Lr extends ot {
  constructor() {
    super(...arguments), this.name = "Emitter";
  }
  on(e, t) {
    return e.split(/\W+/).forEach((n) => {
      Ve(this._events) && (this._events = {}), this._events.hasOwnProperty(n) || (this._events[n] = []), this._events[n].push(t);
    }), this;
  }
  once(e, t) {
    const n = (...i) => {
      t(...i), this.off(e, n);
    };
    return this.on(e, n), this;
  }
  off(e, t) {
    return e.split(/\W+/).forEach((n) => {
      if (Ve(this._events) && (this._events = {}), this._events.hasOwnProperty(n)) if (Ve(t)) this._events[n] = [];
      else {
        const i = this._events[n];
        for (let r = i.length - 1; r >= 0; r--) i[r] === t && i.splice(r, 1);
      }
    }), this;
  }
  emit(e, ...t) {
    if (this._events && this._events.hasOwnProperty(e)) {
      const n = this._events[e].slice(0);
      for (let i = 0, r = n.length; i < r; i++) n[i].apply(this, t);
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
      const n = Object.getOwnPropertyDescriptor(Lr.prototype, t);
      Object.defineProperty(e.prototype, t, n);
    });
  }
  dispose() {
    return super.dispose(), this._events = void 0, this;
  }
}, Wr = class extends Kn {
  constructor() {
    super(...arguments), this.isOffline = !1;
  }
  toJSON() {
    return {};
  }
}, ei = class jr extends Wr {
  constructor() {
    var e, t;
    super(), this.name = "Context", this._constants = /* @__PURE__ */ new Map(), this._timeouts = new Xe(), this._timeoutIds = 0, this._initialized = !1, this._closeStarted = !1, this.isOffline = !1, this._workletPromise = null;
    const n = O(jr.getDefaults(), arguments, ["context"]);
    n.context ? (this._context = n.context, this._latencyHint = ((e = arguments[0]) === null || e === void 0 ? void 0 : e.latencyHint) || "") : (this._context = ph({ latencyHint: n.latencyHint }), this._latencyHint = n.latencyHint), this._ticker = new vh(this.emit.bind(this, "tick"), n.clockSource, n.updateInterval, this._context.sampleRate), this.on("tick", this._timeoutLoop.bind(this)), this._context.onstatechange = () => {
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
    return this._initialized || (yh(this), this._initialized = !0), this;
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
    return z(St(this._context), "Not available if OfflineAudioContext"), this._context.createMediaStreamSource(e);
  }
  createMediaElementSource(e) {
    return z(St(this._context), "Not available if OfflineAudioContext"), this._context.createMediaElementSource(e);
  }
  createMediaStreamDestination() {
    return z(St(this._context), "Not available if OfflineAudioContext"), this._context.createMediaStreamDestination();
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
    z(!this._initialized, "The listener cannot be set after initialization."), this._listener = e;
  }
  get transport() {
    return this.initialize(), this._transport;
  }
  set transport(e) {
    z(!this._initialized, "The transport cannot be set after initialization."), this._transport = e;
  }
  get draw() {
    return this.initialize(), this._draw;
  }
  set draw(e) {
    z(!this._initialized, "Draw cannot be set after initialization."), this._draw = e;
  }
  get destination() {
    return this.initialize(), this._destination;
  }
  set destination(e) {
    z(!this._initialized, "The destination cannot be set after initialization."), this._destination = e;
  }
  createAudioWorkletNode(e, t) {
    return _h(this.rawContext, e, t);
  }
  addAudioWorkletModule(e) {
    return pe(this, void 0, void 0, function* () {
      z(Z(this.rawContext.audioWorklet), "AudioWorkletNode is only available in a secure context (https or localhost)"), this._workletPromise || (this._workletPromise = this.rawContext.audioWorklet.addModule(e)), yield this._workletPromise;
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
    return St(this._context) ? this._context.resume() : Promise.resolve();
  }
  close() {
    return pe(this, void 0, void 0, function* () {
      St(this._context) && this.state !== "closed" && !this._closeStarted && (this._closeStarted = !0, yield this._context.close()), this._initialized && Th(this);
    });
  }
  getConstant(e) {
    if (this._constants.has(e)) return this._constants.get(e);
    {
      const t = this._context.createBuffer(1, 128, this._context.sampleRate), n = t.getChannelData(0);
      for (let r = 0; r < n.length; r++) n[r] = e;
      const i = this._context.createBufferSource();
      return i.channelCount = 1, i.channelCountMode = "explicit", i.buffer = t, i.loop = !0, i.start(0), this._constants.set(e, i), i;
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
    const n = ++this._timeoutIds, i = () => {
      const r = this.now();
      this._timeouts.add({
        callback: () => {
          e(), i();
        },
        id: n,
        time: r + t
      });
    };
    return i(), n;
  }
}, wh = class extends Wr {
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
function X(s, e) {
  je(e) ? e.forEach((t) => X(s, t)) : Object.defineProperty(s, e, {
    enumerable: !0,
    writable: !1
  });
}
function ti(s, e) {
  je(e) ? e.forEach((t) => ti(s, t)) : Object.defineProperty(s, e, { writable: !0 });
}
var ue = () => {
}, st = class me extends ot {
  constructor() {
    super(), this.name = "ToneAudioBuffer", this.onload = ue;
    const e = O(me.getDefaults(), arguments, [
      "url",
      "onload",
      "onerror"
    ]);
    this.reverse = e.reverse, this.onload = e.onload, gt(e.url) ? this.load(e.url).catch(e.onerror) : e.url && this.set(e.url);
  }
  static getDefaults() {
    return {
      onerror: ue,
      onload: ue,
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
    const t = je(e) && e[0].length > 0, n = t ? e.length : 1, i = t ? e[0].length : e.length, r = _e(), o = r.createBuffer(n, i, r.sampleRate), a = !t && n === 1 ? [e] : e;
    for (let c = 0; c < n; c++) o.copyToChannel(a[c], c);
    return this._buffer = o, this;
  }
  toMono(e) {
    if (_t(e)) this.fromArray(this.toArray(e));
    else {
      let t = new Float32Array(this.length);
      const n = this.numberOfChannels;
      for (let i = 0; i < n; i++) {
        const r = this.toArray(i);
        for (let o = 0; o < r.length; o++) t[o] += r[o];
      }
      t = t.map((i) => i / n), this.fromArray(t);
    }
    return this;
  }
  toArray(e) {
    if (_t(e)) return this.getChannelData(e);
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
    z(this.loaded, "Buffer is not loaded");
    const n = Math.floor(e * this.sampleRate), i = Math.floor(t * this.sampleRate);
    z(n < i, "The start time must be less than the end time");
    const r = i - n, o = _e().createBuffer(this.numberOfChannels, r, this.sampleRate);
    for (let a = 0; a < this.numberOfChannels; a++) o.copyToChannel(this.getChannelData(a).subarray(n, i), a);
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
      const n = me.baseUrl === "" || me.baseUrl.endsWith("/") ? me.baseUrl : me.baseUrl + "/", i = document.createElement("a");
      i.href = n + e, i.pathname = (i.pathname + i.hash).split("/").map(encodeURIComponent).join("/");
      const r = yield fetch(i.href);
      if (!r.ok) throw new Error(`could not load url: ${e}`);
      const o = yield r.arrayBuffer();
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
st.baseUrl = "";
st.downloads = [];
var si = class extends ei {
  constructor() {
    super({
      clockSource: "offline",
      context: ns(arguments[0]) ? arguments[0] : fh(arguments[0], arguments[1] * arguments[2], arguments[2]),
      lookAhead: 0,
      updateInterval: ns(arguments[0]) ? 128 / arguments[0].sampleRate : 128 / arguments[2]
    }), this.name = "OfflineContext", this._currentTime = 0, this.isOffline = !0, this._duration = ns(arguments[0]) ? arguments[0].length / arguments[0].sampleRate : arguments[1];
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
      return yield this.workletsAreReady(), yield this._renderClock(s), new st(yield this._context.startRendering());
    });
  }
  close() {
    return Promise.resolve();
  }
}, Br = new wh(), lt = Br;
function _e() {
  return lt === Br && mh && bh(new ei()), lt;
}
function bh(s, e = !1) {
  e && lt.dispose(), St(s) ? lt = new ei(s) : ns(s) ? lt = new si(s) : lt = s;
}
function yd() {
  return lt.resume();
}
if (dt && !dt.TONE_SILENCE_LOGGING) {
  const e = ` * Tone.js v${Mr} * `;
  console.log(`%c${e}`, "background: #000; color: #fff");
}
var xh = class Ur extends ot {
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
          const n = parseInt(e, 10), i = t === "." ? 1.5 : 1;
          return n === 1 ? this._beatsToUnits(this._getTimeSignature()) * i : this._beatsToUnits(4 / n) * i;
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
          let i = 0;
          return e && e !== "0" && (i += this._beatsToUnits(this._getTimeSignature() * parseFloat(e))), t && t !== "0" && (i += this._beatsToUnits(parseFloat(t))), n && n !== "0" && (i += this._beatsToUnits(parseFloat(n) / 4)), i;
        },
        regexp: /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):?(\d+(?:\.\d+)?)?$/
      }
    };
  }
  valueOf() {
    if (this._val instanceof Ur && this.fromType(this._val), Ve(this._val)) return this._noArg();
    if (gt(this._val) && Ve(this._units)) {
      for (const e in this._expressions) if (this._expressions[e].regexp.test(this._val.trim())) {
        this._units = e;
        break;
      }
    } else if (ht(this._val)) {
      let e = 0;
      for (const t in this._val) if (Z(this._val[t])) {
        const n = this._val[t], i = new this.constructor(this.context, t).valueOf() * n;
        e += i;
      }
      return e;
    }
    if (Z(this._units)) {
      const e = this._expressions[this._units], t = this._val.toString().trim().match(e.regexp);
      return t ? e.method.apply(this, t.slice(1)) : e.method.call(this, this._val);
    } else return gt(this._val) ? parseFloat(this._val) : this._val;
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
}, ut = class is extends xh {
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
          const t = new is(this.context, e).valueOf();
          return this._secondsToUnits(this.context.transport.nextSubdivision(t));
        },
        regexp: /^@(.+)/
      }
    });
  }
  quantize(e, t = 1) {
    const n = new this.constructor(this.context, e).valueOf(), i = this.valueOf();
    return i + (Math.round(i / n) * n - i) * t;
  }
  toNotation() {
    const e = this.toSeconds(), t = ["1m"];
    for (let r = 1; r < 9; r++) {
      const o = Math.pow(2, r);
      t.push(o + "n."), t.push(o + "n"), t.push(o + "t");
    }
    t.push("0");
    let n = t[0], i = new is(this.context, t[0]).toSeconds();
    return t.forEach((r) => {
      const o = new is(this.context, r).toSeconds();
      Math.abs(o - e) < Math.abs(i - e) && (n = r, i = o);
    }), n;
  }
  toBarsBeatsSixteenths() {
    const e = this._beatsToUnits(1);
    let t = this.valueOf() / e;
    t = parseFloat(t.toFixed(4));
    const n = Math.floor(t / this._getTimeSignature());
    let i = t % 1 * 4;
    t = Math.floor(t) % this._getTimeSignature();
    const r = i.toString();
    return r.length > 3 && (i = parseFloat(parseFloat(r).toFixed(3))), [
      n,
      t,
      i
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
    return ct(this.toFrequency());
  }
  _now() {
    return this.context.now();
  }
}, As = class Lt extends ut {
  constructor() {
    super(...arguments), this.name = "Frequency", this.defaultUnits = "hz";
  }
  static get A4() {
    return ma();
  }
  static set A4(e) {
    _a(e);
  }
  _getExpressions() {
    return Object.assign({}, super._getExpressions(), {
      midi: {
        regexp: /^(\d+(?:\.\d+)?midi)/,
        method(e) {
          return this.defaultUnits === "midi" ? e : Lt.mtof(e);
        }
      },
      note: {
        regexp: /^([a-g]{1}(?:b|#|##|x|bb|###|#x|x#|bbb)?)(-?[0-9]+)/i,
        method(e, t) {
          const n = Ch[e.toLowerCase()] + (parseInt(t, 10) + 1) * 12;
          return this.defaultUnits === "midi" ? n : Lt.mtof(n);
        }
      },
      tr: {
        regexp: /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):?(\d+(?:\.\d+)?)?/,
        method(e, t, n) {
          let i = 1;
          return e && e !== "0" && (i *= this._beatsToUnits(this._getTimeSignature() * parseFloat(e))), t && t !== "0" && (i *= this._beatsToUnits(parseFloat(t))), n && n !== "0" && (i *= this._beatsToUnits(parseFloat(n) / 4)), i;
        }
      }
    });
  }
  transpose(e) {
    return new Lt(this.context, this.valueOf() * fa(e));
  }
  harmonize(e) {
    return e.map((t) => this.transpose(t));
  }
  toMidi() {
    return ct(this.valueOf());
  }
  toNote() {
    const e = this.toFrequency(), t = Math.log2(e / Lt.A4);
    let n = Math.round(12 * t) + 57;
    const i = Math.floor(n / 12);
    return i < 0 && (n += -12 * i), Sh[n % 12] + i.toString();
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
    return Ui(e);
  }
  static ftom(e) {
    return ct(e);
  }
}, Ch = {
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
}, Sh = [
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
], Wt = class extends ut {
  constructor() {
    super(...arguments), this.name = "TransportTime";
  }
  _now() {
    return this.context.transport.seconds;
  }
}, He = class rs extends ot {
  constructor() {
    super();
    const e = O(rs.getDefaults(), arguments, ["context"]);
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
    return hh(e), new ut(this.context, e).toSeconds();
  }
  toFrequency(e) {
    return new As(this.context, e).toFrequency();
  }
  toTicks(e) {
    return new Wt(this.context, e).toTicks();
  }
  _getPartialProperties(e) {
    const t = this.get();
    return Object.keys(t).forEach((n) => {
      Ve(e[n]) && delete t[n];
    }), t;
  }
  get() {
    const e = uh(this);
    return Object.keys(e).forEach((t) => {
      if (Reflect.has(this, t)) {
        const n = this[t];
        Z(n) && Z(n.value) && Z(n.setValueAtTime) ? e[t] = n.value : n instanceof rs ? e[t] = n._getPartialProperties(e[t]) : je(n) || _t(n) || gt(n) || oh(n) ? e[t] = n : delete e[t];
      }
    }), e;
  }
  set(e) {
    return Object.keys(e).forEach((t) => {
      Reflect.has(this, t) && Z(this[t]) && (this[t] && Z(this[t].value) && Z(this[t].setValueAtTime) ? this[t].value !== e[t] && (this[t].value = e[t]) : this[t] instanceof rs ? this[t].set(e[t]) : this[t] = e[t]);
    }), this;
  }
}, se = class as extends He {
  constructor() {
    super(O(as.getDefaults(), arguments, [
      "param",
      "units",
      "convert"
    ])), this.name = "Param", this.overridden = !1, this._minOutput = 1e-7;
    const e = O(as.getDefaults(), arguments, [
      "param",
      "units",
      "convert"
    ]);
    for (z(Z(e.param) && (mt(e.param) || e.param instanceof as), "param must be an AudioParam"); !mt(e.param); ) e.param = e.param._param;
    this._swappable = Z(e.swappable) ? e.swappable : !1, this._swappable ? (this.input = this.context.createGain(), this._param = e.param, this.input.connect(this._param)) : this._param = this.input = e.param, this._events = new Xe(1e3), this._initialValue = this._param.defaultValue, this.units = e.units, this.convert = e.convert, this._minValue = e.minValue, this._maxValue = e.maxValue, Z(e.value) && e.value !== this._toType(this._initialValue) && this.setValueAtTime(e.value, 0);
  }
  static getDefaults() {
    return Object.assign(He.getDefaults(), {
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
    return Z(this.maxValue) && Z(this.minValue) && wt(e, this._fromType(this.minValue), this._fromType(this.maxValue)), e;
  }
  _fromType(e) {
    return this.convert && !this.overridden ? this._is(e, "time") ? this.toSeconds(e) : this._is(e, "decibels") ? da(e) : this._is(e, "frequency") ? this.toFrequency(e) : e : this.overridden ? 0 : e;
  }
  _toType(e) {
    return this.convert && this.units === "decibels" ? pa(e) : e;
  }
  setValueAtTime(e, t) {
    const n = this.toSeconds(t), i = this._fromType(e);
    return z(isFinite(i) && isFinite(n), `Invalid argument(s) to setValueAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._assertRange(i), this.log(this.units, "setValueAtTime", e, n), this._events.add({
      time: n,
      type: "setValueAtTime",
      value: i
    }), this._param.setValueAtTime(i, n), this;
  }
  getValueAtTime(e) {
    const t = Math.max(this.toSeconds(e), 0), n = this._events.getAfter(t), i = this._events.get(t);
    let r = this._initialValue;
    if (i === null) r = this._initialValue;
    else if (i.type === "setTargetAtTime" && (n === null || n.type === "setValueAtTime")) {
      const o = this._events.getBefore(i.time);
      let a;
      o === null ? a = this._initialValue : a = o.value, i.type === "setTargetAtTime" && (r = this._exponentialApproach(i.time, a, i.value, i.constant, t));
    } else if (n === null) r = i.value;
    else if (n.type === "linearRampToValueAtTime" || n.type === "exponentialRampToValueAtTime") {
      let o = i.value;
      if (i.type === "setTargetAtTime") {
        const a = this._events.getBefore(i.time);
        a === null ? o = this._initialValue : o = a.value;
      }
      n.type === "linearRampToValueAtTime" ? r = this._linearInterpolate(i.time, o, n.time, n.value, t) : r = this._exponentialInterpolate(i.time, o, n.time, n.value, t);
    } else r = i.value;
    return this._toType(r);
  }
  setRampPoint(e) {
    e = this.toSeconds(e);
    let t = this.getValueAtTime(e);
    return this.cancelAndHoldAtTime(e), this._fromType(t) === 0 && (t = this._toType(this._minOutput)), this.setValueAtTime(t, e), this;
  }
  linearRampToValueAtTime(e, t) {
    const n = this._fromType(e), i = this.toSeconds(t);
    return z(isFinite(n) && isFinite(i), `Invalid argument(s) to linearRampToValueAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._assertRange(n), this._events.add({
      time: i,
      type: "linearRampToValueAtTime",
      value: n
    }), this.log(this.units, "linearRampToValueAtTime", e, i), this._param.linearRampToValueAtTime(n, i), this;
  }
  exponentialRampToValueAtTime(e, t) {
    let n = this._fromType(e);
    n = Re(n, 0) ? this._minOutput : n, this._assertRange(n);
    const i = this.toSeconds(t);
    return z(isFinite(n) && isFinite(i), `Invalid argument(s) to exponentialRampToValueAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._events.add({
      time: i,
      type: "exponentialRampToValueAtTime",
      value: n
    }), this.log(this.units, "exponentialRampToValueAtTime", e, i), this._param.exponentialRampToValueAtTime(n, i), this;
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
    const i = Math.log(n + 1) / Math.log(200);
    return this.setTargetAtTime(e, t, i), this.cancelAndHoldAtTime(t + n * 0.9), this.linearRampToValueAtTime(e, t + n), this;
  }
  setTargetAtTime(e, t, n) {
    const i = this._fromType(e);
    z(isFinite(n) && n > 0, "timeConstant must be a number greater than 0");
    const r = this.toSeconds(t);
    return this._assertRange(i), z(isFinite(i) && isFinite(r), `Invalid argument(s) to setTargetAtTime: ${JSON.stringify(e)}, ${JSON.stringify(t)}`), this._events.add({
      constant: n,
      time: r,
      type: "setTargetAtTime",
      value: i
    }), this.log(this.units, "setTargetAtTime", e, r, n), this._param.setTargetAtTime(i, r, n), this;
  }
  setValueCurveAtTime(e, t, n, i = 1) {
    n = this.toSeconds(n), t = this.toSeconds(t);
    const r = this._fromType(e[0]) * i;
    this.setValueAtTime(this._toType(r), t);
    const o = n / (e.length - 1);
    for (let a = 1; a < e.length; a++) {
      const c = this._fromType(e[a]) * i;
      this.linearRampToValueAtTime(this._toType(c), t + a * o);
    }
    return this;
  }
  cancelScheduledValues(e) {
    const t = this.toSeconds(e);
    return z(isFinite(t), `Invalid argument to cancelScheduledValues: ${JSON.stringify(e)}`), this._events.cancel(t), this._param.cancelScheduledValues(t), this.log(this.units, "cancelScheduledValues", t), this;
  }
  cancelAndHoldAtTime(e) {
    const t = this.toSeconds(e), n = this._fromType(this.getValueAtTime(t));
    z(isFinite(t), `Invalid argument to cancelAndHoldAtTime: ${JSON.stringify(e)}`), this.log(this.units, "cancelAndHoldAtTime", t, "value=" + n);
    const i = this._events.get(t), r = this._events.getAfter(t);
    return i && Re(i.time, t) ? r ? (this._param.cancelScheduledValues(r.time), this._events.cancel(r.time)) : (this._param.cancelAndHoldAtTime(t), this._events.cancel(t + this.sampleTime)) : r && (this._param.cancelScheduledValues(r.time), this._events.cancel(r.time), r.type === "linearRampToValueAtTime" ? this.linearRampToValueAtTime(this._toType(n), t) : r.type === "exponentialRampToValueAtTime" && this.exponentialRampToValueAtTime(this._toType(n), t)), this._events.add({
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
      const i = this._events.getAfter(n.time), r = i ? i.time : t + 2, o = (r - t) / 10;
      for (let a = t; a < r; a += o) e.linearRampToValueAtTime(this.getValueAtTime(a), a);
    }
    return this._events.forEachAfter(this.context.currentTime, (i) => {
      i.type === "cancelScheduledValues" ? e.cancelScheduledValues(i.time) : i.type === "setTargetAtTime" ? e.setTargetAtTime(i.value, i.time, i.constant) : e[i.type](i.value, i.time);
    }), this;
  }
  setParam(e) {
    z(this._swappable, "The Param must be assigned as 'swappable' in the constructor");
    const t = this.input;
    return t.disconnect(this._param), this.apply(e), this._param = e, t.connect(this._param), this;
  }
  dispose() {
    return super.dispose(), this._events.dispose(), this;
  }
  get defaultValue() {
    return this._toType(this._param.defaultValue);
  }
  _exponentialApproach(e, t, n, i, r) {
    return n + (t - n) * Math.exp(-(r - e) / i);
  }
  _linearInterpolate(e, t, n, i, r) {
    return t + (i - t) * ((r - e) / (n - e));
  }
  _exponentialInterpolate(e, t, n, i, r) {
    return t * Math.pow(i / t, (r - e) / (n - e));
  }
}, B = class os extends He {
  constructor() {
    super(...arguments), this._internalChannels = [];
  }
  get numberOfInputs() {
    return Z(this.input) ? mt(this.input) || this.input instanceof se ? 1 : this.input.numberOfInputs : 0;
  }
  get numberOfOutputs() {
    return Z(this.output) ? this.output.numberOfOutputs : 0;
  }
  _isAudioNode(e) {
    return Z(e) && (e instanceof os || et(e));
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
    z(e.length > 0, "ToneAudioNode does not have any internal nodes");
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
    return Pe(this, e, t, n), this;
  }
  toDestination() {
    return this.connect(this.context.destination), this;
  }
  toMaster() {
    return Ss("toMaster() has been renamed toDestination()"), this.toDestination();
  }
  disconnect(e, t = 0, n = 0) {
    return Gr(this, e, t, n), this;
  }
  chain(...e) {
    return vt(this, ...e), this;
  }
  fan(...e) {
    return e.forEach((t) => this.connect(t)), this;
  }
  dispose() {
    return super.dispose(), Z(this.input) && (this.input instanceof os ? this.input.dispose() : et(this.input) && this.input.disconnect()), Z(this.output) && (this.output instanceof os ? this.output.dispose() : et(this.output) && this.output.disconnect()), this._internalChannels = [], this;
  }
};
function vt(...s) {
  const e = s.shift();
  s.reduce((t, n) => (t instanceof B ? t.connect(n) : et(t) && Pe(t, n), n), e);
}
function Pe(s, e, t = 0, n = 0) {
  for (z(Z(s), "Cannot connect from undefined node"), z(Z(e), "Cannot connect to undefined node"), (e instanceof B || et(e)) && z(e.numberOfInputs > 0, "Cannot connect to node with no inputs"), z(s.numberOfOutputs > 0, "Cannot connect from node with no outputs"); e instanceof B || e instanceof se; ) Z(e.input) && (e = e.input);
  for (; s instanceof B; ) Z(s.output) && (s = s.output);
  mt(e) ? s.connect(e, t) : s.connect(e, t, n);
}
function Gr(s, e, t = 0, n = 0) {
  if (Z(e)) for (; e instanceof B; ) e = e.input;
  for (; !et(s); ) Z(s.output) && (s = s.output);
  mt(e) ? s.disconnect(e, t) : et(e) ? s.disconnect(e, t, n) : s.disconnect();
}
var Ps = class qs extends B {
  constructor() {
    super(O(qs.getDefaults(), arguments, ["delayTime", "maxDelay"])), this.name = "Delay";
    const e = O(qs.getDefaults(), arguments, ["delayTime", "maxDelay"]), t = this.toSeconds(e.maxDelay);
    this._maxDelay = Math.max(t, this.toSeconds(e.delayTime)), this._delayNode = this.input = this.output = this.context.createDelay(t), this.delayTime = new se({
      context: this.context,
      param: this._delayNode.delayTime,
      units: "time",
      value: e.delayTime,
      minValue: 0,
      maxValue: this.maxDelay
    }), X(this, "delayTime");
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
}, J = class Ls extends B {
  constructor() {
    super(O(Ls.getDefaults(), arguments, ["gain", "units"])), this.name = "Gain", this._gainNode = this.context.createGain(), this.input = this._gainNode, this.output = this._gainNode;
    const e = O(Ls.getDefaults(), arguments, ["gain", "units"]);
    this.gain = new se({
      context: this.context,
      convert: e.convert,
      param: this._gainNode.gain,
      units: e.units,
      value: e.gain,
      minValue: e.minValue,
      maxValue: e.maxValue
    }), X(this, "gain");
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
      convert: !0,
      gain: 1,
      units: "gain"
    });
  }
  dispose() {
    return super.dispose(), this._gainNode.disconnect(), this.gain.dispose(), this;
  }
}, Dt = class extends B {
  constructor(s) {
    super(s), this.onended = ue, this._startTime = -1, this._stopTime = -1, this._timeout = -1, this.output = new J({
      context: this.context,
      gain: 0
    }), this._gainNode = this.output, this.getStateAtTime = function(e) {
      const t = this.toSeconds(e);
      return this._startTime !== -1 && t >= this._startTime && (this._stopTime === -1 || t <= this._stopTime) ? "started" : "stopped";
    }, this._fadeIn = s.fadeIn, this._fadeOut = s.fadeOut, this._curve = s.curve, this.onended = s.onended;
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
      curve: "linear",
      fadeIn: 0,
      fadeOut: 0,
      onended: ue
    });
  }
  _startGain(s, e = 1) {
    z(this._startTime === -1, "Source cannot be started more than once");
    const t = this.toSeconds(this._fadeIn);
    return this._startTime = s + t, this._startTime = Math.max(this._startTime, this.context.currentTime), t > 0 ? (this._gainNode.gain.setValueAtTime(0, s), this._curve === "linear" ? this._gainNode.gain.linearRampToValueAtTime(e, s + t) : this._gainNode.gain.exponentialApproachValueAtTime(e, s, t)) : this._gainNode.gain.setValueAtTime(e, s), this;
  }
  stop(s) {
    return this.log("stop", s), this._stopGain(this.toSeconds(s)), this;
  }
  _stopGain(s) {
    z(this._startTime !== -1, "'start' must be called before 'stop'"), this.cancelStop();
    const e = this.toSeconds(this._fadeOut);
    return this._stopTime = this.toSeconds(s) + e, this._stopTime = Math.max(this._stopTime, this.now()), e > 0 ? this._curve === "linear" ? this._gainNode.gain.linearRampTo(0, e, s) : this._gainNode.gain.targetRampTo(0, e, s) : (this._gainNode.gain.cancelAndHoldAtTime(s), this._gainNode.gain.setValueAtTime(0, s)), this.context.clearTimeout(this._timeout), this._timeout = this.context.setTimeout(() => {
      const t = this._curve === "exponential" ? e * 2 : 0;
      this._stopSource(this.now() + t), this._onended();
    }, this._stopTime - this.context.currentTime), this;
  }
  _onended() {
    if (this.onended !== ue && (this.onended(this), this.onended = ue, !this.context.isOffline)) {
      const s = () => this.dispose();
      typeof window.requestIdleCallback < "u" ? window.requestIdleCallback(s) : setTimeout(s, 1e3);
    }
  }
  get state() {
    return this.getStateAtTime(this.now());
  }
  cancelStop() {
    return this.log("cancelStop"), z(this._startTime !== -1, "Source is not started"), this._gainNode.gain.cancelScheduledValues(this._startTime + this.sampleTime), this.context.clearTimeout(this._timeout), this._stopTime = -1, this;
  }
  dispose() {
    return super.dispose(), this._gainNode.dispose(), this.onended = ue, this;
  }
}, Ah = class Ws extends Dt {
  constructor() {
    super(O(Ws.getDefaults(), arguments, ["offset"])), this.name = "ToneConstantSource", this._source = this.context.createConstantSource();
    const e = O(Ws.getDefaults(), arguments, ["offset"]);
    Pe(this._source, this._gainNode), this.offset = new se({
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
    return Object.assign(Dt.getDefaults(), {
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
}, Y = class js extends B {
  constructor() {
    super(O(js.getDefaults(), arguments, ["value", "units"])), this.name = "Signal", this.override = !0;
    const e = O(js.getDefaults(), arguments, ["value", "units"]);
    this.output = this._constantSource = new Ah({
      context: this.context,
      convert: e.convert,
      offset: e.value,
      units: e.units,
      minValue: e.minValue,
      maxValue: e.maxValue
    }), this._constantSource.start(0), this.input = this._param = this._constantSource.offset;
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
      convert: !0,
      units: "number",
      value: 0
    });
  }
  connect(e, t = 0, n = 0) {
    return ks(this, e, t, n), this;
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
  setValueCurveAtTime(e, t, n, i) {
    return this._param.setValueCurveAtTime(e, t, n, i), this;
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
function ks(s, e, t, n) {
  (e instanceof se || mt(e) || e instanceof Y && e.override) && (e.cancelScheduledValues(0), e.setValueAtTime(0, 0), e instanceof Y && (e.overridden = !0)), Pe(s, e, t, n);
}
var rt = class zr extends B {
  constructor() {
    super(Object.assign(O(zr.getDefaults(), arguments, ["context"])));
  }
  connect(e, t = 0, n = 0) {
    return ks(this, e, t, n), this;
  }
}, Jt = class Bs extends rt {
  constructor() {
    super(Object.assign(O(Bs.getDefaults(), arguments, ["mapping", "length"]))), this.name = "WaveShaper", this._shaper = this.context.createWaveShaper(), this.input = this._shaper, this.output = this._shaper;
    const e = O(Bs.getDefaults(), arguments, ["mapping", "length"]);
    je(e.mapping) || e.mapping instanceof Float32Array ? this.curve = Float32Array.from(e.mapping) : ah(e.mapping) && this.setMap(e.mapping, e.length);
  }
  static getDefaults() {
    return Object.assign(Y.getDefaults(), { length: 1024 });
  }
  setMap(e, t = 1024) {
    const n = new Float32Array(t);
    for (let i = 0, r = t; i < r; i++) n[i] = e(i / (r - 1) * 2 - 1, i);
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
    z([
      "none",
      "2x",
      "4x"
    ].some((t) => t.includes(e)), "oversampling must be either 'none', '2x', or '4x'"), this._shaper.oversample = e;
  }
  dispose() {
    return super.dispose(), this._shaper.disconnect(), this;
  }
}, kh = class extends rt {
  constructor() {
    super(...arguments), this.name = "GainToAudio", this._norm = new Jt({
      context: this.context,
      mapping: (s) => Math.abs(s) * 2 - 1
    }), this.input = this._norm, this.output = this._norm;
  }
  dispose() {
    return super.dispose(), this._norm.dispose(), this;
  }
}, $r = class Us extends B {
  constructor() {
    super(Object.assign(O(Us.getDefaults(), arguments, ["fade"]))), this.name = "CrossFade", this._panner = this.context.createStereoPanner(), this._split = this.context.createChannelSplitter(2), this._g2a = new kh({ context: this.context }), this.a = new J({
      context: this.context,
      gain: 0
    }), this.b = new J({
      context: this.context,
      gain: 0
    }), this.output = new J({ context: this.context }), this._internalChannels = [this.a, this.b];
    const e = O(Us.getDefaults(), arguments, ["fade"]);
    this.fade = new Y({
      context: this.context,
      units: "normalRange",
      value: e.fade
    }), X(this, "fade"), this.context.getConstant(1).connect(this._panner), this._panner.connect(this._split), this._panner.channelCount = 1, this._panner.channelCountMode = "explicit", Pe(this._split, this.a.gain, 0), Pe(this._split, this.b.gain, 1), this.fade.chain(this._g2a, this._panner.pan), this.a.connect(this.output), this.b.connect(this.output);
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { fade: 0.5 });
  }
  dispose() {
    return super.dispose(), this.a.dispose(), this.b.dispose(), this.output.dispose(), this.fade.dispose(), this._g2a.dispose(), this._panner.disconnect(), this._split.disconnect(), this;
  }
}, vs = class extends B {
  constructor(s) {
    super(s), this.name = "Effect", this._dryWet = new $r({ context: this.context }), this.wet = this._dryWet.fade, this.effectSend = new J({ context: this.context }), this.effectReturn = new J({ context: this.context }), this.input = new J({ context: this.context }), this.output = this._dryWet, this.input.fan(this._dryWet.a, this.effectSend), this.effectReturn.connect(this._dryWet.b), this.wet.setValueAtTime(s.wet, 0), this._internalChannels = [this.effectReturn, this.effectSend], X(this, "wet");
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { wet: 1 });
  }
  connectEffect(s) {
    return this._internalChannels.push(s), this.effectSend.chain(s, this.effectReturn), this;
  }
  dispose() {
    return super.dispose(), this._dryWet.dispose(), this.effectSend.dispose(), this.effectReturn.dispose(), this.wet.dispose(), this;
  }
}, Di = class extends vs {
  constructor(s) {
    super(s), this.name = "FeedbackEffect", this._feedbackGain = new J({
      context: this.context,
      gain: s.feedback,
      units: "normalRange"
    }), this.feedback = this._feedbackGain.gain, X(this, "feedback"), this.effectReturn.chain(this._feedbackGain, this.effectSend);
  }
  static getDefaults() {
    return Object.assign(vs.getDefaults(), { feedback: 0.125 });
  }
  dispose() {
    return super.dispose(), this._feedbackGain.dispose(), this.feedback.dispose(), this;
  }
}, Td = class Gs extends Di {
  constructor() {
    super(O(Gs.getDefaults(), arguments, ["delayTime", "feedback"])), this.name = "FeedbackDelay";
    const e = O(Gs.getDefaults(), arguments, ["delayTime", "feedback"]);
    this._delayNode = new Ps({
      context: this.context,
      delayTime: e.delayTime,
      maxDelay: e.maxDelay
    }), this.delayTime = this._delayNode.delayTime, this.connectEffect(this._delayNode), X(this, "delayTime");
  }
  static getDefaults() {
    return Object.assign(Di.getDefaults(), {
      delayTime: 0.25,
      maxDelay: 1
    });
  }
  dispose() {
    return super.dispose(), this._delayNode.dispose(), this.delayTime.dispose(), this;
  }
}, wd = class zs extends vs {
  constructor() {
    super(O(zs.getDefaults(), arguments, ["distortion"])), this.name = "Distortion";
    const e = O(zs.getDefaults(), arguments, ["distortion"]);
    this._shaper = new Jt({
      context: this.context,
      length: 4096
    }), this._distortion = e.distortion, this.connectEffect(this._shaper), this.distortion = e.distortion, this.oversample = e.oversample;
  }
  static getDefaults() {
    return Object.assign(vs.getDefaults(), {
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
    this._shaper.setMap((i) => Math.abs(i) < 1e-3 ? 0 : (3 + t) * i * 20 * n / (Math.PI + t * Math.abs(i)));
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
function Zr(s, e = 1 / 0) {
  const t = /* @__PURE__ */ new WeakMap();
  return function(n, i) {
    Reflect.defineProperty(n, i, {
      configurable: !0,
      enumerable: !0,
      get: function() {
        return t.get(this);
      },
      set: function(r) {
        wt(r, s, e), t.set(this, r);
      }
    });
  };
}
function Kt(s, e = 1 / 0) {
  const t = /* @__PURE__ */ new WeakMap();
  return function(n, i) {
    Reflect.defineProperty(n, i, {
      configurable: !0,
      enumerable: !0,
      get: function() {
        return t.get(this);
      },
      set: function(r) {
        wt(this.toSeconds(r), s, e), t.set(this, r);
      }
    });
  };
}
var ke = class $s extends B {
  constructor() {
    super(O($s.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ])), this.name = "Envelope", this._sig = new Y({
      context: this.context,
      value: 0
    }), this.output = this._sig, this.input = void 0;
    const e = O($s.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ]);
    this.attack = e.attack, this.decay = e.decay, this.sustain = e.sustain, this.release = e.release, this.attackCurve = e.attackCurve, this.releaseCurve = e.releaseCurve, this.decayCurve = e.decayCurve;
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
    if (gt(e)) return e;
    {
      let n;
      for (n in ts) if (ts[n][t] === e) return n;
      return e;
    }
  }
  _setCurve(e, t, n) {
    if (gt(n) && Reflect.has(ts, n)) {
      const i = ts[n];
      ht(i) ? e !== "_decayCurve" && (this[e] = i[t]) : this[e] = i;
    } else if (je(n) && e !== "_decayCurve") this[e] = n;
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
    const i = this.toSeconds(this.decay), r = this.getValueAtTime(e);
    if (r > 0) {
      const o = 1 / n;
      n = (1 - r) / o;
    }
    if (n < this.sampleTime)
      this._sig.cancelScheduledValues(e), this._sig.setValueAtTime(t, e);
    else if (this._attackCurve === "linear") this._sig.linearRampTo(t, n, e);
    else if (this._attackCurve === "exponential") this._sig.targetRampTo(t, n, e);
    else {
      this._sig.cancelAndHoldAtTime(e);
      let o = this._attackCurve;
      for (let a = 1; a < o.length; a++) if (o[a - 1] <= r && r <= o[a]) {
        o = this._attackCurve.slice(a), o[0] = r;
        break;
      }
      this._sig.setValueCurveAtTime(o, e, n, t);
    }
    if (i && this.sustain < 1) {
      const o = t * this.sustain, a = e + n;
      this.log("decay", a), this._decayCurve === "linear" ? this._sig.linearRampToValueAtTime(o, i + a) : this._sig.exponentialApproachValueAtTime(o, a, i);
    }
    return this;
  }
  triggerRelease(e) {
    this.log("triggerRelease", e), e = this.toSeconds(e);
    const t = this.getValueAtTime(e);
    if (t > 0) {
      const n = this.toSeconds(this.release);
      n < this.sampleTime ? this._sig.setValueAtTime(0, e) : this._releaseCurve === "linear" ? this._sig.linearRampTo(0, n, e) : this._releaseCurve === "exponential" ? this._sig.targetRampTo(0, n, e) : (z(je(this._releaseCurve), "releaseCurve must be either 'linear', 'exponential' or an array"), this._sig.cancelAndHoldAtTime(e), this._sig.setValueCurveAtTime(this._releaseCurve, e, n, t));
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
    return ks(this, e, t, n), this;
  }
  asArray(e = 1024) {
    return pe(this, void 0, void 0, function* () {
      const t = e / this.context.sampleRate, n = new si(1, t, this.context.sampleRate), i = this.toSeconds(this.attack) + this.toSeconds(this.decay), r = i + this.toSeconds(this.release), o = r * 0.1, a = r + o, c = new this.constructor(Object.assign(this.get(), {
        attack: t * this.toSeconds(this.attack) / a,
        decay: t * this.toSeconds(this.decay) / a,
        release: t * this.toSeconds(this.release) / a,
        context: n
      }));
      return c._sig.toDestination(), c.triggerAttackRelease(t * (i + o) / a, 0), (yield n.render()).getChannelData(0);
    });
  }
  dispose() {
    return super.dispose(), this._sig.dispose(), this;
  }
};
bt([Kt(0)], ke.prototype, "attack", void 0);
bt([Kt(0)], ke.prototype, "decay", void 0);
bt([Zr(0, 1)], ke.prototype, "sustain", void 0);
bt([Kt(0)], ke.prototype, "release", void 0);
var ts = (() => {
  let e, t;
  const n = [];
  for (e = 0; e < 128; e++) n[e] = Math.sin(e / 127 * (Math.PI / 2));
  const i = [], r = 6.4;
  for (e = 0; e < 127; e++)
    t = e / 127, i[e] = (Math.sin(t * (Math.PI * 2) * r - Math.PI / 2) + 1) / 10 + t * 0.83;
  i[127] = 1;
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
      In: i,
      Out: u(i)
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
})(), Ei = class Zs extends B {
  constructor() {
    super(O(Zs.getDefaults(), arguments, ["frequency", "type"])), this.name = "BiquadFilter";
    const e = O(Zs.getDefaults(), arguments, ["frequency", "type"]);
    this._filter = this.context.createBiquadFilter(), this.input = this.output = this._filter, this.Q = new se({
      context: this.context,
      units: "number",
      value: e.Q,
      param: this._filter.Q
    }), this.frequency = new se({
      context: this.context,
      units: "frequency",
      value: e.frequency,
      param: this._filter.frequency
    }), this.detune = new se({
      context: this.context,
      units: "cents",
      value: e.detune,
      param: this._filter.detune
    }), this.gain = new se({
      context: this.context,
      units: "decibels",
      convert: !1,
      value: e.gain,
      param: this._filter.gain
    }), this.type = e.type;
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
    z([
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
    const n = new Float32Array(e), i = new Float32Array(e), r = this.context.createBiquadFilter();
    return r.type = this.type, r.Q.value = this.Q.value, r.frequency.value = this.frequency.value, r.gain.value = this.gain.value, r.getFrequencyResponse(t, n, i), n;
  }
  dispose() {
    return super.dispose(), this._filter.disconnect(), this.Q.dispose(), this.frequency.dispose(), this.gain.dispose(), this.detune.dispose(), this;
  }
}, Xs = class Hs extends B {
  constructor() {
    super(O(Hs.getDefaults(), arguments, [
      "frequency",
      "type",
      "rolloff"
    ])), this.name = "Filter", this.input = new J({ context: this.context }), this.output = new J({ context: this.context }), this._filters = [];
    const e = O(Hs.getDefaults(), arguments, [
      "frequency",
      "type",
      "rolloff"
    ]);
    this._filters = [], this.Q = new Y({
      context: this.context,
      units: "positive",
      value: e.Q
    }), this.frequency = new Y({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this.detune = new Y({
      context: this.context,
      units: "cents",
      value: e.detune
    }), this.gain = new Y({
      context: this.context,
      units: "decibels",
      convert: !1,
      value: e.gain
    }), this._type = e.type, this.rolloff = e.rolloff, X(this, [
      "detune",
      "frequency",
      "gain",
      "Q"
    ]);
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
    z([
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
    const t = _t(e) ? e : parseInt(e, 10), n = [
      -12,
      -24,
      -48,
      -96
    ];
    let i = n.indexOf(t);
    z(i !== -1, `rolloff can only be ${n.join(", ")}`), i += 1, this._rolloff = t, this.input.disconnect(), this._filters.forEach((r) => r.disconnect()), this._filters = new Array(i);
    for (let r = 0; r < i; r++) {
      const o = new Ei({ context: this.context });
      o.type = this._type, this.frequency.connect(o.frequency), this.detune.connect(o.detune), this.Q.connect(o.Q), this.gain.connect(o.gain), this._filters[r] = o;
    }
    this._internalChannels = this._filters, vt(this.input, ...this._internalChannels, this.output);
  }
  getFrequencyResponse(e = 128) {
    const t = new Ei({
      frequency: this.frequency.value,
      gain: this.gain.value,
      Q: this.Q.value,
      type: this._type,
      detune: this.detune.value
    }), n = new Float32Array(e).map(() => 1);
    return this._filters.forEach(() => {
      t.getFrequencyResponse(e).forEach((i, r) => n[r] *= i);
    }), t.dispose(), n;
  }
  dispose() {
    return super.dispose(), this._filters.forEach((e) => {
      e.dispose();
    }), ti(this, [
      "detune",
      "frequency",
      "gain",
      "Q"
    ]), this.frequency.dispose(), this.Q.dispose(), this.detune.dispose(), this.gain.dispose(), this;
  }
}, at = class Qs extends Y {
  constructor() {
    super(Object.assign(O(Qs.getDefaults(), arguments, ["value"]))), this.name = "Multiply", this.override = !1;
    const e = O(Qs.getDefaults(), arguments, ["value"]);
    this._mult = this.input = this.output = new J({
      context: this.context,
      minValue: e.minValue,
      maxValue: e.maxValue
    }), this.factor = this._param = this._mult.gain, this.factor.setValueAtTime(e.value, 0);
  }
  static getDefaults() {
    return Object.assign(Y.getDefaults(), { value: 0 });
  }
  dispose() {
    return super.dispose(), this._mult.dispose(), this;
  }
}, Oh = class Xr extends Y {
  constructor() {
    super(Object.assign(O(Xr.getDefaults(), arguments, ["value"]))), this.override = !1, this.name = "Add", this._sum = new J({ context: this.context }), this.input = this._sum, this.output = this._sum, this.addend = this._param, vt(this._constantSource, this._sum);
  }
  static getDefaults() {
    return Object.assign(Y.getDefaults(), { value: 0 });
  }
  dispose() {
    return super.dispose(), this._sum.dispose(), this;
  }
}, ni = class Ys extends rt {
  constructor() {
    super(Object.assign(O(Ys.getDefaults(), arguments, ["min", "max"]))), this.name = "Scale";
    const e = O(Ys.getDefaults(), arguments, ["min", "max"]);
    this._mult = this.input = new at({
      context: this.context,
      value: e.max - e.min
    }), this._add = this.output = new Oh({
      context: this.context,
      value: e.min
    }), this._min = e.min, this._max = e.max, this.input.connect(this.output);
  }
  static getDefaults() {
    return Object.assign(rt.getDefaults(), {
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
}, ii = class Js extends B {
  constructor() {
    super(O(Js.getDefaults(), arguments, ["volume"])), this.name = "Volume";
    const e = O(Js.getDefaults(), arguments, ["volume"]);
    this.input = this.output = new J({
      context: this.context,
      gain: e.volume,
      units: "decibels"
    }), this.volume = this.output.gain, X(this, "volume"), this._unmutedVolume = e.volume, this.mute = e.mute;
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
}, Nh = class Ks extends B {
  constructor() {
    super(O(Ks.getDefaults(), arguments)), this.name = "Destination", this.input = new ii({ context: this.context }), this.output = new J({ context: this.context }), this.volume = this.input.volume;
    const e = O(Ks.getDefaults(), arguments);
    vt(this.input, this.output, this.context.rawContext.destination), this.mute = e.mute, this._internalChannels = [
      this.input,
      this.context.rawContext.destination,
      this.output
    ];
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
    return this.input.disconnect(), e.unshift(this.input), e.push(this.output), vt(...e), this;
  }
  get maxChannelCount() {
    return this.context.rawContext.destination.maxChannelCount;
  }
  dispose() {
    return super.dispose(), this.volume.dispose(), this;
  }
};
Fr((s) => {
  s.destination = new Nh({ context: s });
});
qr((s) => {
  s.destination.dispose();
});
var Mh = class extends ot {
  constructor(s) {
    super(), this.name = "TimelineValue", this._timeline = new Xe({ memory: 10 }), this._initialValue = s;
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
}, Hr = class en extends rt {
  constructor() {
    super(Object.assign(O(en.getDefaults(), arguments, ["value"]))), this.name = "Pow";
    const e = O(en.getDefaults(), arguments, ["value"]);
    this._exponentScaler = this.input = this.output = new Jt({
      context: this.context,
      mapping: this._expFunc(e.value),
      length: 8192
    }), this._exponent = e.value;
  }
  static getDefaults() {
    return Object.assign(rt.getDefaults(), { value: 1 });
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
}, At = class extends Wt {
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
}, Dh = class extends ot {
  constructor() {
    super(...arguments), this.name = "IntervalTimeline", this._root = null, this._length = 0;
  }
  add(s) {
    z(Z(s.time), "Events must have a time property"), z(Z(s.duration), "Events must have a duration parameter"), s.time = s.time.valueOf();
    let e = new Eh(s.time, s.time + s.duration, s);
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
}, Eh = class {
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
}, ri = class extends Xe {
  constructor(s = "stopped") {
    super(), this.name = "StateTimeline", this._initial = s, this.setStateAtTime(this._initial, 0);
  }
  getValueAtTime(s) {
    const e = this.get(s);
    return e !== null ? e.state : this._initial;
  }
  setStateAtTime(s, e, t) {
    return wt(e, 0), this.add(Object.assign({}, t, {
      state: s,
      time: e
    })), this;
  }
  getLastState(s, e) {
    const t = this._search(e);
    for (let n = t; n >= 0; n--) {
      const i = this._timeline[n];
      if (i.state === s) return i;
    }
  }
  getNextState(s, e) {
    const t = this._search(e);
    if (t !== -1) for (let n = t; n < this._timeline.length; n++) {
      const i = this._timeline[n];
      if (i.state === s) return i;
    }
  }
}, Ih = class tn extends se {
  constructor() {
    super(O(tn.getDefaults(), arguments, ["value"])), this.name = "TickParam", this._events = new Xe(1 / 0), this._multiplier = 1;
    const e = O(tn.getDefaults(), arguments, ["value"]);
    this._multiplier = e.multiplier, this._events.cancel(0), this._events.add({
      ticks: 0,
      time: 0,
      type: "setValueAtTime",
      value: this._fromType(e.value)
    }), this.setValueAtTime(e.value, 0);
  }
  static getDefaults() {
    return Object.assign(se.getDefaults(), {
      multiplier: 1,
      units: "hertz",
      value: 1
    });
  }
  setTargetAtTime(e, t, n) {
    t = this.toSeconds(t), this.setRampPoint(t);
    const i = this._fromType(e), r = this._events.get(t), o = Math.round(Math.max(1 / n, 1));
    for (let a = 0; a <= o; a++) {
      const c = n * a + t, l = this._exponentialApproach(r.time, r.value, i, n, c);
      this.linearRampToValueAtTime(this._toType(l), c);
    }
    return this;
  }
  setValueAtTime(e, t) {
    const n = this.toSeconds(t);
    super.setValueAtTime(e, t);
    const i = this._events.get(n), r = this._events.previousEvent(i), o = this._getTicksUntilEvent(r, n);
    return i.ticks = Math.max(o, 0), this;
  }
  linearRampToValueAtTime(e, t) {
    const n = this.toSeconds(t);
    super.linearRampToValueAtTime(e, t);
    const i = this._events.get(n), r = this._events.previousEvent(i), o = this._getTicksUntilEvent(r, n);
    return i.ticks = Math.max(o, 0), this;
  }
  exponentialRampToValueAtTime(e, t) {
    t = this.toSeconds(t);
    const n = this._fromType(e), i = this._events.get(t), r = Math.round(Math.max((t - i.time) * 10, 1)), o = (t - i.time) / r;
    for (let a = 0; a <= r; a++) {
      const c = o * a + i.time, l = this._exponentialInterpolate(i.time, i.value, t, n, c);
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
    else if (Ve(e.ticks)) {
      const o = this._events.previousEvent(e);
      e.ticks = this._getTicksUntilEvent(o, e.time);
    }
    const n = this._fromType(this.getValueAtTime(e.time));
    let i = this._fromType(this.getValueAtTime(t));
    const r = this._events.get(t);
    return r && r.time === t && r.type === "setValueAtTime" && (i = this._fromType(this.getValueAtTime(t - this.sampleTime))), 0.5 * (t - e.time) * (n + i) + e.ticks;
  }
  getTicksAtTime(e) {
    const t = this.toSeconds(e), n = this._events.get(t);
    return Math.max(this._getTicksUntilEvent(n, t), 0);
  }
  getDurationOfTicks(e, t) {
    const n = this.toSeconds(t), i = this.getTicksAtTime(t);
    return this.getTimeOfTick(i + e) - n;
  }
  getTimeOfTick(e) {
    const t = this._events.get(e, "ticks"), n = this._events.getAfter(e, "ticks");
    if (t && t.ticks === e) return t.time;
    if (t && n && n.type === "linearRampToValueAtTime" && t.value !== n.value) {
      const i = this._fromType(this.getValueAtTime(t.time)), r = (this._fromType(this.getValueAtTime(n.time)) - i) / (n.time - t.time), o = Math.sqrt(Math.pow(i, 2) - 2 * r * (t.ticks - e)), a = (-i + o) / r, c = (-i - o) / r;
      return (a > 0 ? a : c) + t.time;
    } else return t ? t.value === 0 ? 1 / 0 : t.time + (e - t.ticks) / t.value : e / this._initialValue;
  }
  ticksToTime(e, t) {
    return this.getDurationOfTicks(e, t);
  }
  timeToTicks(e, t) {
    const n = this.toSeconds(t), i = this.toSeconds(e), r = this.getTicksAtTime(n);
    return this.getTicksAtTime(n + i) - r;
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
}, Rh = class sn extends Y {
  constructor() {
    super(O(sn.getDefaults(), arguments, ["value"])), this.name = "TickSignal";
    const e = O(sn.getDefaults(), arguments, ["value"]);
    this.input = this._param = new Ih({
      context: this.context,
      convert: e.convert,
      multiplier: e.multiplier,
      param: this._constantSource.offset,
      units: e.units,
      value: e.value
    });
  }
  static getDefaults() {
    return Object.assign(Y.getDefaults(), {
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
}, Vh = class nn extends He {
  constructor() {
    super(O(nn.getDefaults(), arguments, ["frequency"])), this.name = "TickSource", this._state = new ri(), this._tickOffset = new Xe(), this._ticksAtTime = new Xe(), this._secondsAtTime = new Xe();
    const e = O(nn.getDefaults(), arguments, ["frequency"]);
    this.frequency = new Rh({
      context: this.context,
      units: e.units,
      value: e.frequency
    }), X(this, "frequency"), this._state.setStateAtTime("stopped", 0), this.setTicksAtTime(0, 0);
  }
  static getDefaults() {
    return Object.assign({
      frequency: 1,
      units: "hertz"
    }, He.getDefaults());
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
    const t = this.toSeconds(e), n = this._state.getLastState("stopped", t), i = this._ticksAtTime.get(t), r = {
      state: "paused",
      time: t
    };
    this._state.add(r);
    let o = i || n, a = i ? i.ticks : 0, c = null;
    return this._state.forEachBetween(o.time, t + this.sampleTime, (l) => {
      let u = o.time;
      const h = this._tickOffset.get(l.time);
      h && h.time >= o.time && (a = h.ticks, u = h.time), o.state === "started" && l.state !== "started" && (a += this.frequency.getTicksAtTime(l.time) - this.frequency.getTicksAtTime(u), l.time !== r.time && (c = {
        state: l.state,
        time: l.time,
        ticks: a
      })), o = l;
    }), this._state.remove(r), c && this._ticksAtTime.add(c), a;
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
    const i = this._secondsAtTime.get(e);
    let r = i || t, o = i ? i.seconds : 0, a = null;
    return this._state.forEachBetween(r.time, e + this.sampleTime, (c) => {
      let l = r.time;
      const u = this._tickOffset.get(c.time);
      u && u.time >= r.time && (o = u.seconds, l = u.time), r.state === "started" && c.state !== "started" && (o += c.time - l, c.time !== n.time && (a = {
        state: c.state,
        time: c.time,
        seconds: o
      })), r = c;
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
    const n = this._tickOffset.get(t), i = this._state.get(t), r = Math.max(n.time, i.time), o = this.frequency.getTicksAtTime(r) + e - n.ticks;
    return this.frequency.getTimeOfTick(o);
  }
  forEachTickBetween(e, t, n) {
    let i = this._state.get(e);
    this._state.forEachBetween(e, t, (o) => {
      i && i.state === "started" && o.state !== "started" && this.forEachTickBetween(Math.max(i.time, e), o.time - this.sampleTime, n), i = o;
    });
    let r = null;
    if (i && i.state === "started") {
      const o = Math.max(i.time, e), a = this.frequency.getTicksAtTime(o), c = a - this.frequency.getTicksAtTime(i.time);
      let l = Math.ceil(c) - c;
      l = Re(l, 1) ? 0 : l;
      let u = this.frequency.getTimeOfTick(a + l);
      for (; u < t; ) {
        try {
          n(u, Math.round(this.getTicksAtTime(u)));
        } catch (h) {
          r = h;
          break;
        }
        u += this.frequency.getDurationOfTicks(1, u);
      }
    }
    if (r) throw r;
    return this;
  }
  dispose() {
    return super.dispose(), this._state.dispose(), this._tickOffset.dispose(), this._ticksAtTime.dispose(), this._secondsAtTime.dispose(), this.frequency.dispose(), this;
  }
}, Qr = class rn extends He {
  constructor() {
    super(O(rn.getDefaults(), arguments, ["callback", "frequency"])), this.name = "Clock", this.callback = ue, this._lastUpdate = 0, this._state = new ri("stopped"), this._boundLoop = this._loop.bind(this);
    const e = O(rn.getDefaults(), arguments, ["callback", "frequency"]);
    this.callback = e.callback, this._tickSource = new Vh({
      context: this.context,
      frequency: e.frequency,
      units: e.units
    }), this._lastUpdate = 0, this.frequency = this._tickSource.frequency, X(this, "frequency"), this._state.setStateAtTime("stopped", 0), this.context.on("tick", this._boundLoop);
  }
  static getDefaults() {
    return Object.assign(He.getDefaults(), {
      callback: ue,
      frequency: 1,
      units: "hertz"
    });
  }
  get state() {
    return this._state.getValueAtTime(this.now());
  }
  start(e, t) {
    Dr(this.context);
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
    const n = this.toSeconds(t), i = this.getTicksAtTime(n);
    return this._tickSource.getTimeOfTick(i + e, n);
  }
  _loop() {
    const e = this._lastUpdate, t = this.now();
    this._lastUpdate = t, this.log("loop", e, t), e !== t && (this._state.forEachBetween(e, t, (n) => {
      switch (n.state) {
        case "started":
          const i = this._tickSource.getTicksAtTime(n.time);
          this.emit("start", n.time, i);
          break;
        case "stopped":
          n.time !== 0 && this.emit("stop", n.time);
          break;
        case "paused":
          this.emit("pause", n.time);
          break;
      }
    }), this._tickSource.forEachTickBetween(e, t, (n, i) => {
      this.callback(n, i);
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
Kn.mixin(Qr);
var Gt = class an {
  constructor(e, t) {
    this.id = an._eventId++, this._remainderTime = 0;
    const n = Object.assign(an.getDefaults(), t);
    this.transport = e, this.callback = n.callback, this._once = n.once, this.time = Math.floor(n.time), this._remainderTime = n.time - this.time;
  }
  static getDefaults() {
    return {
      callback: ue,
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
Gt._eventId = 0;
var Fh = class Yr extends Gt {
  constructor(e, t) {
    super(e, t), this._currentId = -1, this._nextId = -1, this._nextTick = this.time, this._boundRestart = this._restart.bind(this);
    const n = Object.assign(Yr.getDefaults(), t);
    this.duration = n.duration, this._interval = n.interval, this._nextTick = n.time, this.transport.on("start", this._boundRestart), this.transport.on("loopStart", this._boundRestart), this.transport.on("ticks", this._boundRestart), this.context = this.transport.context, this._restart();
  }
  static getDefaults() {
    return Object.assign({}, Gt.getDefaults(), {
      duration: 1 / 0,
      interval: 1,
      once: !1
    });
  }
  invoke(e) {
    this._createEvents(e), super.invoke(e);
  }
  _createEvent() {
    return gs(this._nextTick, this.floatTime + this.duration) ? this.transport.scheduleOnce(this.invoke.bind(this), new At(this.context, this._nextTick).toSeconds()) : -1;
  }
  _createEvents(e) {
    gs(this._nextTick + this._interval, this.floatTime + this.duration) && (this._nextTick += this._interval, this._currentId = this._nextId, this._nextId = this.transport.scheduleOnce(this.invoke.bind(this), new At(this.context, this._nextTick).toSeconds()));
  }
  _restart(e) {
    this.transport.clear(this._currentId), this.transport.clear(this._nextId), this._nextTick = this.floatTime;
    const t = this.transport.getTicksAtTime(e);
    Mt(t, this.time) && (this._nextTick = this.floatTime + Math.ceil((t - this.floatTime) / this._interval) * this._interval), this._currentId = this._createEvent(), this._nextTick += this._interval, this._nextId = this._createEvent();
  }
  dispose() {
    return super.dispose(), this.transport.clear(this._currentId), this.transport.clear(this._nextId), this.transport.off("start", this._boundRestart), this.transport.off("loopStart", this._boundRestart), this.transport.off("ticks", this._boundRestart), this;
  }
}, Jr = class on extends He {
  constructor() {
    super(O(on.getDefaults(), arguments)), this.name = "Transport", this._loop = new Mh(!1), this._loopStart = 0, this._loopEnd = 0, this._scheduledEvents = {}, this._timeline = new Xe(), this._repeatedEvents = new Dh(), this._syncedSignals = [], this._swingAmount = 0;
    const e = O(on.getDefaults(), arguments);
    this._ppq = e.ppq, this._clock = new Qr({
      callback: this._processTick.bind(this),
      context: this.context,
      frequency: 0,
      units: "bpm"
    }), this._bindClockEvents(), this.bpm = this._clock.frequency, this._clock.frequency.multiplier = e.ppq, this.bpm.setValueAtTime(e.bpm, 0), X(this, "bpm"), this._timeSignature = e.timeSignature, this._swingTicks = e.ppq / 2;
  }
  static getDefaults() {
    return Object.assign(He.getDefaults(), {
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
      const n = t % (this._swingTicks * 2) / (this._swingTicks * 2), i = Math.sin(n * Math.PI) * this._swingAmount;
      e += new At(this.context, this._swingTicks * 2 / 3).toSeconds() * i;
    }
    Mi(!0), this._timeline.forEachAtTime(t, (n) => n.invoke(e)), Mi(!1);
  }
  schedule(e, t) {
    const n = new Gt(this, {
      callback: e,
      time: new Wt(this.context, t).toTicks()
    });
    return this._addEvent(n, this._timeline);
  }
  scheduleRepeat(e, t, n, i = 1 / 0) {
    const r = new Fh(this, {
      callback: e,
      duration: new ut(this.context, i).toTicks(),
      interval: new ut(this.context, t).toTicks(),
      time: new Wt(this.context, n).toTicks()
    });
    return this._addEvent(r, this._repeatedEvents);
  }
  scheduleOnce(e, t) {
    const n = new Gt(this, {
      callback: e,
      once: !0,
      time: new Wt(this.context, t).toTicks()
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
      t = new At(this.context, t).toSeconds(), this.emit("start", e, t);
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
    je(e) && (e = e[0] / e[1] * 4), this._timeSignature = e;
  }
  get loopStart() {
    return new ut(this.context, this._loopStart, "i").toSeconds();
  }
  set loopStart(e) {
    this._loopStart = this.toTicks(e);
  }
  get loopEnd() {
    return new ut(this.context, this._loopEnd, "i").toSeconds();
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
    return new At(this.context, this._swingTicks).toNotation();
  }
  set swingSubdivision(e) {
    this._swingTicks = this.toTicks(e);
  }
  get position() {
    const e = this.now(), t = this._clock.getTicksAtTime(e);
    return new At(this.context, t).toBarsBeatsSixteenths();
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
        const n = this._clock.getTicksAtTime(t), i = t + this._clock.frequency.getDurationOfTicks(Math.ceil(n) - n, t);
        this.emit("stop", i), this._clock.setTicksAtTime(e, i), this.emit("start", i, this._clock.getSecondsAtTime(i));
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
      const t = this.now(), n = this.getTicksAtTime(t), i = e - n % e;
      return this._clock.nextTickTime(i, t);
    }
  }
  syncSignal(e, t) {
    const n = this.now();
    let i = this.bpm, r = 1 / (60 / i.getValueAtTime(n) / this.PPQ), o = [];
    if (e.units === "time") {
      const c = 0.015625 / r, l = new J(c), u = new Hr(-1), h = new J(c);
      i.chain(l, u, h), i = h, r = 1 / r, o = [
        l,
        u,
        h
      ];
    }
    t || (e.getValueAtTime(n) !== 0 ? t = e.getValueAtTime(n) / r : t = 0);
    const a = new J(t);
    return i.connect(a), a.connect(e._param), o.push(a), this._syncedSignals.push({
      initial: e.value,
      nodes: o,
      signal: e
    }), e.value = 0, this;
  }
  unsyncSignal(e) {
    for (let t = this._syncedSignals.length - 1; t >= 0; t--) {
      const n = this._syncedSignals[t];
      n.signal === e && (n.nodes.forEach((i) => i.dispose()), n.signal.value = n.initial, this._syncedSignals.splice(t, 1));
    }
    return this;
  }
  dispose() {
    return super.dispose(), this._clock.dispose(), ti(this, "bpm"), this._timeline.dispose(), this._repeatedEvents.dispose(), this;
  }
};
Kn.mixin(Jr);
Fr((s) => {
  s.transport = new Jr({ context: s });
});
qr((s) => {
  s.transport.dispose();
});
var ge = class extends B {
  constructor(s) {
    super(s), this.input = void 0, this._state = new ri("stopped"), this._synced = !1, this._scheduled = [], this._syncedStart = ue, this._syncedStop = ue, this._state.memory = 100, this._state.increasing = !0, this._volume = this.output = new ii({
      context: this.context,
      mute: s.mute,
      volume: s.volume
    }), this.volume = this._volume.volume, X(this, "volume"), this.onstop = s.onstop;
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
      mute: !1,
      onstop: ue,
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
    let n = Ve(s) && this._synced ? this.context.transport.seconds : this.toSeconds(s);
    if (n = this._clampToCurrentTime(n), !this._synced && this._state.getValueAtTime(n) === "started")
      z(Mt(n, this._state.get(n).time), "Start time must be strictly greater than previous start time"), this._state.cancel(n), this._state.setStateAtTime("started", n), this.log("restart", n), this.restart(n, e, t);
    else if (this.log("start", n), this._state.setStateAtTime("started", n), this._synced) {
      const i = this._state.get(n);
      i && (i.offset = this.toSeconds(Vs(e, 0)), i.duration = t ? this.toSeconds(t) : void 0);
      const r = this.context.transport.schedule((o) => {
        this._start(o, e, t);
      }, n);
      this._scheduled.push(r), this.context.transport.state === "started" && this.context.transport.getSecondsAtTime(this.immediate()) > n && this._syncedStart(this.now(), this.context.transport.seconds);
    } else
      Dr(this.context), this._start(n, e, t);
    return this;
  }
  stop(s) {
    let e = Ve(s) && this._synced ? this.context.transport.seconds : this.toSeconds(s);
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
      if (Mt(e, 0)) {
        const t = this._state.get(e);
        if (t && t.state === "started" && t.time !== e) {
          const n = e - this.toSeconds(t.time);
          let i;
          t.duration && (i = this.toSeconds(t.duration) - n), this._start(s, this.toSeconds(t.offset) + n, i);
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
    return super.dispose(), this.onstop = ue, this.unsync(), this._volume.dispose(), this._state.dispose(), this;
  }
};
function xt(s, e) {
  return pe(this, void 0, void 0, function* () {
    const t = e / s.context.sampleRate, n = new si(1, t, s.context.sampleRate);
    return new s.constructor(Object.assign(s.get(), {
      frequency: 2 / t,
      detune: 0,
      context: n
    })).toDestination().start(0), (yield n.render()).getChannelData(0);
  });
}
var Ph = class cn extends Dt {
  constructor() {
    super(O(cn.getDefaults(), arguments, ["frequency", "type"])), this.name = "ToneOscillatorNode", this._oscillator = this.context.createOscillator(), this._internalChannels = [this._oscillator];
    const e = O(cn.getDefaults(), arguments, ["frequency", "type"]);
    Pe(this._oscillator, this._gainNode), this.type = e.type, this.frequency = new se({
      context: this.context,
      param: this._oscillator.frequency,
      units: "frequency",
      value: e.frequency
    }), this.detune = new se({
      context: this.context,
      param: this._oscillator.detune,
      units: "cents",
      value: e.detune
    }), X(this, ["frequency", "detune"]);
  }
  static getDefaults() {
    return Object.assign(Dt.getDefaults(), {
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
}, Ce = class Ke extends ge {
  constructor() {
    super(O(Ke.getDefaults(), arguments, ["frequency", "type"])), this.name = "Oscillator", this._oscillator = null;
    const e = O(Ke.getDefaults(), arguments, ["frequency", "type"]);
    this.frequency = new Y({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), X(this, "frequency"), this.detune = new Y({
      context: this.context,
      units: "cents",
      value: e.detune
    }), X(this, "detune"), this._partials = e.partials, this._partialCount = e.partialCount, this._type = e.type, e.partialCount && e.type !== "custom" && (this._type = this.baseType + e.partialCount.toString()), this.phase = e.phase;
  }
  static getDefaults() {
    return Object.assign(ge.getDefaults(), {
      detune: 0,
      frequency: 440,
      partialCount: 0,
      partials: [],
      phase: 0,
      type: "sine"
    });
  }
  _start(e) {
    const t = this.toSeconds(e), n = new Ph({
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
    if (this._type === "custom") return Ke._periodicWaveCache.find((e) => e.phase === this._phase && lh(e.partials, this._partials));
    {
      const e = Ke._periodicWaveCache.find((t) => t.type === this._type && t.phase === this._phase);
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
        const { partials: i, wave: r } = n;
        this._wave = r, this._partials = i, this._oscillator !== null && this._oscillator.setPeriodicWave(this._wave);
      } else {
        const [i, r] = this._getRealImaginary(e, this._phase), o = this.context.createPeriodicWave(i, r);
        this._wave = o, this._oscillator !== null && this._oscillator.setPeriodicWave(this._wave), Ke._periodicWaveCache.push({
          imag: r,
          partialCount: this._partialCount,
          partials: this._partials,
          phase: this._phase,
          real: i,
          type: this._type,
          wave: this._wave
        }), Ke._periodicWaveCache.length > 100 && Ke._periodicWaveCache.shift();
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
    wt(e, 0);
    let t = this._type;
    const n = /^(sine|triangle|square|sawtooth)(\d+)$/.exec(this._type);
    if (n && (t = n[1]), this._type !== "custom") e === 0 ? this.type = t : this.type = t + e.toString();
    else {
      const i = new Float32Array(e);
      this._partials.forEach((r, o) => i[o] = r), this._partials = Array.from(i), this.type = this._type;
    }
  }
  _getRealImaginary(e, t) {
    let n = 2048;
    const i = new Float32Array(n), r = new Float32Array(n);
    let o = 1;
    if (e === "custom") {
      if (o = this._partials.length + 1, this._partialCount = this._partials.length, n = o, this._partials.length === 0) return [i, r];
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
      l !== 0 ? (i[a] = -l * Math.sin(t * a), r[a] = l * Math.cos(t * a)) : (i[a] = 0, r[a] = 0);
    }
    return [i, r];
  }
  _inverseFFT(e, t, n) {
    let i = 0;
    const r = e.length;
    for (let o = 0; o < r; o++) i += e[o] * Math.cos(o * n) + t[o] * Math.sin(o * n);
    return i;
  }
  getInitialValue() {
    const [e, t] = this._getRealImaginary(this._type, 0);
    let n = 0;
    const i = Math.PI * 2, r = 32;
    for (let o = 0; o < r; o++) n = Math.max(this._inverseFFT(e, t, o / r * i), n);
    return gh(-this._inverseFFT(e, t, this._phase) / n, -1, 1);
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this._oscillator !== null && this._oscillator.dispose(), this._wave = void 0, this.frequency.dispose(), this.detune.dispose(), this;
  }
};
Ce._periodicWaveCache = [];
var ai = class ln extends ge {
  constructor() {
    super(O(ln.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ])), this.name = "FMOscillator", this._modulationNode = new J({
      context: this.context,
      gain: 0
    });
    const e = O(ln.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ]);
    this._carrier = new Ce({
      context: this.context,
      detune: e.detune,
      frequency: 0,
      onstop: () => this.onstop(this),
      phase: e.phase,
      type: e.type
    }), this.detune = this._carrier.detune, this.frequency = new Y({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this._modulator = new Ce({
      context: this.context,
      phase: e.phase,
      type: e.modulationType
    }), this.harmonicity = new at({
      context: this.context,
      units: "positive",
      value: e.harmonicity
    }), this.modulationIndex = new at({
      context: this.context,
      units: "positive",
      value: e.modulationIndex
    }), this.frequency.connect(this._carrier.frequency), this.frequency.chain(this.harmonicity, this._modulator.frequency), this.frequency.chain(this.modulationIndex, this._modulationNode), this._modulator.connect(this._modulationNode.gain), this._modulationNode.connect(this._carrier.frequency), this._carrier.connect(this.output), this.detune.connect(this._modulator.detune), X(this, [
      "modulationIndex",
      "frequency",
      "detune",
      "harmonicity"
    ]);
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.frequency.dispose(), this.harmonicity.dispose(), this._carrier.dispose(), this._modulator.dispose(), this._modulationNode.dispose(), this.modulationIndex.dispose(), this;
  }
}, Et = class un extends B {
  constructor() {
    super(O(un.getDefaults(), arguments)), this._scheduledEvents = [], this._synced = !1, this._original_triggerAttack = this.triggerAttack, this._original_triggerRelease = this.triggerRelease, this._syncedRelease = (t) => this._original_triggerRelease(t);
    const e = O(un.getDefaults(), arguments);
    this._volume = this.output = new ii({
      context: this.context,
      volume: e.volume
    }), this.volume = this._volume.volume, X(this, "volume");
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { volume: 0 });
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
    this[e] = (...i) => {
      const r = i[t], o = this.context.transport.schedule((a) => {
        i[t] = a, n.apply(this, i);
      }, r);
      this._scheduledEvents.push(o);
    };
  }
  unsync() {
    return this._scheduledEvents.forEach((e) => this.context.transport.clear(e)), this._scheduledEvents = [], this._synced && (this._synced = !1, this.triggerAttack = this._original_triggerAttack, this.triggerRelease = this._original_triggerRelease, this.context.transport.off("stop", this._syncedRelease), this.context.transport.off("pause", this._syncedRelease), this.context.transport.off("loopEnd", this._syncedRelease)), this;
  }
  triggerAttackRelease(e, t, n, i) {
    const r = this.toSeconds(n), o = this.toSeconds(t);
    return this.triggerAttack(e, r, i), this.triggerRelease(r + o), this;
  }
  dispose() {
    return super.dispose(), this._volume.dispose(), this.unsync(), this._scheduledEvents = [], this;
  }
}, qe = class hn extends Et {
  constructor() {
    super(O(hn.getDefaults(), arguments));
    const e = O(hn.getDefaults(), arguments);
    this.portamento = e.portamento, this.onsilence = e.onsilence;
  }
  static getDefaults() {
    return Object.assign(Et.getDefaults(), {
      detune: 0,
      onsilence: ue,
      portamento: 0
    });
  }
  triggerAttack(e, t, n = 1) {
    this.log("triggerAttack", e, t, n);
    const i = this.toSeconds(t);
    return this._triggerEnvelopeAttack(i, n), this.setNote(e, i), this;
  }
  triggerRelease(e) {
    this.log("triggerRelease", e);
    const t = this.toSeconds(e);
    return this._triggerEnvelopeRelease(t), this;
  }
  setNote(e, t) {
    const n = this.toSeconds(t), i = e instanceof As ? e.toFrequency() : e;
    if (this.portamento > 0 && this.getLevelAtTime(n) > 0.05) {
      const r = this.toSeconds(this.portamento);
      this.frequency.exponentialRampTo(i, r, n);
    } else this.frequency.setValueAtTime(i, n);
    return this;
  }
};
bt([Kt(0)], qe.prototype, "portamento", void 0);
var Ii = [
  1,
  1.483,
  1.932,
  2.546,
  2.63,
  3.897
], bd = class dn extends qe {
  constructor() {
    super(O(dn.getDefaults(), arguments)), this.name = "MetalSynth", this._oscillators = [], this._freqMultipliers = [];
    const e = O(dn.getDefaults(), arguments);
    this.detune = new Y({
      context: this.context,
      units: "cents",
      value: e.detune
    }), this.frequency = new Y({
      context: this.context,
      units: "frequency"
    }), this._amplitude = new J({
      context: this.context,
      gain: 0
    }).connect(this.output), this._highpass = new Xs({
      Q: 0,
      context: this.context,
      type: "highpass"
    }).connect(this._amplitude);
    for (let t = 0; t < Ii.length; t++) {
      const n = new ai({
        context: this.context,
        harmonicity: e.harmonicity,
        modulationIndex: e.modulationIndex,
        modulationType: "square",
        onstop: t === 0 ? () => this.onsilence(this) : ue,
        type: "square"
      });
      n.connect(this._highpass), this._oscillators[t] = n;
      const i = new at({
        context: this.context,
        value: Ii[t]
      });
      this._freqMultipliers[t] = i, this.frequency.chain(i, n.frequency), this.detune.connect(n.detune);
    }
    this._filterFreqScaler = new ni({
      context: this.context,
      max: 7e3,
      min: this.toFrequency(e.resonance)
    }), this.envelope = new ke({
      attack: e.envelope.attack,
      attackCurve: "linear",
      context: this.context,
      decay: e.envelope.decay,
      release: e.envelope.release,
      sustain: 0
    }), this.envelope.chain(this._filterFreqScaler, this._highpass.frequency), this.envelope.connect(this._amplitude.gain), this._octaves = e.octaves, this.octaves = e.octaves;
  }
  static getDefaults() {
    return tt(qe.getDefaults(), {
      envelope: Object.assign(Se(ke.getDefaults(), Object.keys(B.getDefaults())), {
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
}, oi = class Kr extends ke {
  constructor() {
    super(O(Kr.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ])), this.name = "AmplitudeEnvelope", this._gainNode = new J({
      context: this.context,
      gain: 0
    }), this.output = this._gainNode, this.input = this._gainNode, this._sig.connect(this._gainNode.gain), this.output = this._gainNode, this.input = this._gainNode;
  }
  dispose() {
    return super.dispose(), this._gainNode.dispose(), this;
  }
}, ea = class extends rt {
  constructor() {
    super(...arguments), this.name = "AudioToGain", this._norm = new Jt({
      context: this.context,
      mapping: (s) => (s + 1) / 2
    }), this.input = this._norm, this.output = this._norm;
  }
  dispose() {
    return super.dispose(), this._norm.dispose(), this;
  }
}, ta = class pn extends ge {
  constructor() {
    super(O(pn.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ])), this.name = "AMOscillator", this._modulationScale = new ea({ context: this.context }), this._modulationNode = new J({ context: this.context });
    const e = O(pn.getDefaults(), arguments, [
      "frequency",
      "type",
      "modulationType"
    ]);
    this._carrier = new Ce({
      context: this.context,
      detune: e.detune,
      frequency: e.frequency,
      onstop: () => this.onstop(this),
      phase: e.phase,
      type: e.type
    }), this.frequency = this._carrier.frequency, this.detune = this._carrier.detune, this._modulator = new Ce({
      context: this.context,
      phase: e.phase,
      type: e.modulationType
    }), this.harmonicity = new at({
      context: this.context,
      units: "positive",
      value: e.harmonicity
    }), this.frequency.chain(this.harmonicity, this._modulator.frequency), this._modulator.chain(this._modulationScale, this._modulationNode.gain), this._carrier.chain(this._modulationNode, this.output), X(this, [
      "frequency",
      "detune",
      "harmonicity"
    ]);
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.frequency.dispose(), this.detune.dispose(), this.harmonicity.dispose(), this._carrier.dispose(), this._modulator.dispose(), this._modulationNode.dispose(), this._modulationScale.dispose(), this;
  }
}, sa = class fn extends ge {
  constructor() {
    super(O(fn.getDefaults(), arguments, [
      "frequency",
      "type",
      "spread"
    ])), this.name = "FatOscillator", this._oscillators = [];
    const e = O(fn.getDefaults(), arguments, [
      "frequency",
      "type",
      "spread"
    ]);
    this.frequency = new Y({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this.detune = new Y({
      context: this.context,
      units: "cents",
      value: e.detune
    }), this._spread = e.spread, this._type = e.type, this._phase = e.phase, this._partials = e.partials, this._partialCount = e.partialCount, this.count = e.count, X(this, ["frequency", "detune"]);
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
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
      this._forEach((i, r) => i.detune.value = t + n * r);
    }
  }
  get count() {
    return this._oscillators.length;
  }
  set count(e) {
    if (wt(e, 1), this._oscillators.length !== e) {
      this._forEach((t) => t.dispose()), this._oscillators = [];
      for (let t = 0; t < e; t++) {
        const n = new Ce({
          context: this.context,
          volume: -6 - e * 1.1,
          type: this._type,
          phase: this._phase + t / e * 360,
          partialCount: this._partialCount,
          onstop: t === 0 ? () => this.onstop(this) : ue
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.frequency.dispose(), this.detune.dispose(), this._forEach((e) => e.dispose()), this;
  }
}, ci = class mn extends ge {
  constructor() {
    super(O(mn.getDefaults(), arguments, ["frequency", "width"])), this.name = "PulseOscillator", this._widthGate = new J({
      context: this.context,
      gain: 0
    }), this._thresh = new Jt({
      context: this.context,
      mapping: (t) => t <= 0 ? -1 : 1
    });
    const e = O(mn.getDefaults(), arguments, ["frequency", "width"]);
    this.width = new Y({
      context: this.context,
      units: "audioRange",
      value: e.width
    }), this._triangle = new Ce({
      context: this.context,
      detune: e.detune,
      frequency: e.frequency,
      onstop: () => this.onstop(this),
      phase: e.phase,
      type: "triangle"
    }), this.frequency = this._triangle.frequency, this.detune = this._triangle.detune, this._triangle.chain(this._thresh, this.output), this.width.chain(this._widthGate, this._thresh), X(this, [
      "width",
      "frequency",
      "detune"
    ]);
  }
  static getDefaults() {
    return Object.assign(ge.getDefaults(), {
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this._triangle.dispose(), this.width.dispose(), this._widthGate.dispose(), this._thresh.dispose(), this;
  }
}, na = class _n extends ge {
  constructor() {
    super(O(_n.getDefaults(), arguments, ["frequency", "modulationFrequency"])), this.name = "PWMOscillator", this.sourceType = "pwm", this._scale = new at({
      context: this.context,
      value: 2
    });
    const e = O(_n.getDefaults(), arguments, ["frequency", "modulationFrequency"]);
    this._pulse = new ci({
      context: this.context,
      frequency: e.modulationFrequency
    }), this._pulse.carrierType = "sine", this.modulationFrequency = this._pulse.frequency, this._modulator = new Ce({
      context: this.context,
      detune: e.detune,
      frequency: e.frequency,
      onstop: () => this.onstop(this),
      phase: e.phase
    }), this.frequency = this._modulator.frequency, this.detune = this._modulator.detune, this._modulator.chain(this._scale, this._pulse.width), this._pulse.connect(this.output), X(this, [
      "modulationFrequency",
      "frequency",
      "detune"
    ]);
  }
  static getDefaults() {
    return Object.assign(ge.getDefaults(), {
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this._pulse.dispose(), this._scale.dispose(), this._modulator.dispose(), this;
  }
}, Ri = {
  am: ta,
  fat: sa,
  fm: ai,
  oscillator: Ce,
  pulse: ci,
  pwm: na
}, It = class gn extends ge {
  constructor() {
    super(O(gn.getDefaults(), arguments, ["frequency", "type"])), this.name = "OmniOscillator";
    const e = O(gn.getDefaults(), arguments, ["frequency", "type"]);
    this.frequency = new Y({
      context: this.context,
      units: "frequency",
      value: e.frequency
    }), this.detune = new Y({
      context: this.context,
      units: "cents",
      value: e.detune
    }), X(this, ["frequency", "detune"]), this.set(e);
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), ai.getDefaults(), ta.getDefaults(), sa.getDefaults(), ci.getDefaults(), na.getDefaults());
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
      const t = Ri[e], n = this.now();
      if (this._oscillator) {
        const i = this._oscillator;
        i.stop(n), this.context.setTimeout(() => i.dispose(), this.blockTime);
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
    return e instanceof Ri[t];
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
    this._getOscType(this._oscillator, "fat") && _t(e) && (this._oscillator.count = e);
  }
  get spread() {
    if (this._getOscType(this._oscillator, "fat")) return this._oscillator.spread;
  }
  set spread(e) {
    this._getOscType(this._oscillator, "fat") && _t(e) && (this._oscillator.spread = e);
  }
  get modulationType() {
    if (this._getOscType(this._oscillator, "fm") || this._getOscType(this._oscillator, "am")) return this._oscillator.modulationType;
  }
  set modulationType(e) {
    (this._getOscType(this._oscillator, "fm") || this._getOscType(this._oscillator, "am")) && gt(e) && (this._oscillator.modulationType = e);
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
      return xt(this, e);
    });
  }
  dispose() {
    return super.dispose(), this.detune.dispose(), this.frequency.dispose(), this._oscillator.dispose(), this;
  }
}, zt = class vn extends qe {
  constructor() {
    super(O(vn.getDefaults(), arguments)), this.name = "Synth";
    const e = O(vn.getDefaults(), arguments);
    this.oscillator = new It(Object.assign({
      context: this.context,
      detune: e.detune,
      onstop: () => this.onsilence(this)
    }, e.oscillator)), this.frequency = this.oscillator.frequency, this.detune = this.oscillator.detune, this.envelope = new oi(Object.assign({ context: this.context }, e.envelope)), this.oscillator.chain(this.envelope, this.output), X(this, [
      "oscillator",
      "frequency",
      "detune",
      "envelope"
    ]);
  }
  static getDefaults() {
    return Object.assign(qe.getDefaults(), {
      envelope: Object.assign(Se(ke.getDefaults(), Object.keys(B.getDefaults())), {
        attack: 5e-3,
        decay: 0.1,
        release: 1,
        sustain: 0.3
      }),
      oscillator: Object.assign(Se(It.getDefaults(), [
        ...Object.keys(ge.getDefaults()),
        "frequency",
        "detune"
      ]), { type: "triangle" })
    });
  }
  _triggerEnvelopeAttack(e, t) {
    if (this.envelope.triggerAttack(e, t), this.oscillator.start(e), this.envelope.sustain === 0) {
      const n = this.toSeconds(this.envelope.attack), i = this.toSeconds(this.envelope.decay);
      this.oscillator.stop(e + n + i);
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
}, ia = class yn extends zt {
  constructor() {
    super(O(yn.getDefaults(), arguments)), this.name = "MembraneSynth", this.portamento = 0;
    const e = O(yn.getDefaults(), arguments);
    this.pitchDecay = e.pitchDecay, this.octaves = e.octaves, X(this, ["oscillator", "envelope"]);
  }
  static getDefaults() {
    return tt(qe.getDefaults(), zt.getDefaults(), {
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
    const n = this.toSeconds(t), i = this.toFrequency(e instanceof As ? e.toFrequency() : e), r = i * this.octaves;
    return this.oscillator.frequency.setValueAtTime(r, n), this.oscillator.frequency.exponentialRampToValueAtTime(i, n + this.toSeconds(this.pitchDecay)), this;
  }
  dispose() {
    return super.dispose(), this;
  }
};
bt([Zr(0)], ia.prototype, "octaves", void 0);
bt([Kt(0)], ia.prototype, "pitchDecay", void 0);
var Vi = class Tn extends ke {
  constructor() {
    super(O(Tn.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ])), this.name = "FrequencyEnvelope";
    const e = O(Tn.getDefaults(), arguments, [
      "attack",
      "decay",
      "sustain",
      "release"
    ]);
    this._octaves = e.octaves, this._baseFrequency = this.toFrequency(e.baseFrequency), this._exponent = this.input = new Hr({
      context: this.context,
      value: e.exponent
    }), this._scale = this.output = new ni({
      context: this.context,
      min: this._baseFrequency,
      max: this._baseFrequency * Math.pow(2, this._octaves)
    }), this._sig.chain(this._exponent, this._scale);
  }
  static getDefaults() {
    return Object.assign(ke.getDefaults(), {
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
    wt(t, 0), this._baseFrequency = t, this._scale.min = this._baseFrequency, this.octaves = this._octaves;
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
}, xd = class wn extends qe {
  constructor() {
    super(O(wn.getDefaults(), arguments)), this.name = "MonoSynth";
    const e = O(wn.getDefaults(), arguments);
    this.oscillator = new It(Object.assign(e.oscillator, {
      context: this.context,
      detune: e.detune,
      onstop: () => this.onsilence(this)
    })), this.frequency = this.oscillator.frequency, this.detune = this.oscillator.detune, this.filter = new Xs(Object.assign(e.filter, { context: this.context })), this.filterEnvelope = new Vi(Object.assign(e.filterEnvelope, { context: this.context })), this.envelope = new oi(Object.assign(e.envelope, { context: this.context })), this.oscillator.chain(this.filter, this.envelope, this.output), this.filterEnvelope.connect(this.filter.frequency), X(this, [
      "oscillator",
      "frequency",
      "detune",
      "filter",
      "filterEnvelope",
      "envelope"
    ]);
  }
  static getDefaults() {
    return Object.assign(qe.getDefaults(), {
      envelope: Object.assign(Se(ke.getDefaults(), Object.keys(B.getDefaults())), {
        attack: 5e-3,
        decay: 0.1,
        release: 1,
        sustain: 0.9
      }),
      filter: Object.assign(Se(Xs.getDefaults(), Object.keys(B.getDefaults())), {
        Q: 1,
        rolloff: -12,
        type: "lowpass"
      }),
      filterEnvelope: Object.assign(Se(Vi.getDefaults(), Object.keys(B.getDefaults())), {
        attack: 0.6,
        baseFrequency: 200,
        decay: 0.2,
        exponent: 2,
        octaves: 3,
        release: 2,
        sustain: 0.5
      }),
      oscillator: Object.assign(Se(It.getDefaults(), Object.keys(ge.getDefaults())), { type: "sawtooth" })
    });
  }
  _triggerEnvelopeAttack(e, t = 1) {
    if (this.envelope.triggerAttack(e, t), this.filterEnvelope.triggerAttack(e), this.oscillator.start(e), this.envelope.sustain === 0) {
      const n = this.toSeconds(this.envelope.attack), i = this.toSeconds(this.envelope.decay);
      this.oscillator.stop(e + n + i);
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
}, Fi = class bn extends qe {
  constructor() {
    super(O(bn.getDefaults(), arguments)), this.name = "ModulationSynth";
    const e = O(bn.getDefaults(), arguments);
    this._carrier = new zt({
      context: this.context,
      oscillator: e.oscillator,
      envelope: e.envelope,
      onsilence: () => this.onsilence(this),
      volume: -10
    }), this._modulator = new zt({
      context: this.context,
      oscillator: e.modulation,
      envelope: e.modulationEnvelope,
      volume: -10
    }), this.oscillator = this._carrier.oscillator, this.envelope = this._carrier.envelope, this.modulation = this._modulator.oscillator, this.modulationEnvelope = this._modulator.envelope, this.frequency = new Y({
      context: this.context,
      units: "frequency"
    }), this.detune = new Y({
      context: this.context,
      value: e.detune,
      units: "cents"
    }), this.harmonicity = new at({
      context: this.context,
      value: e.harmonicity,
      minValue: 0
    }), this._modulationNode = new J({
      context: this.context,
      gain: 0
    }), X(this, [
      "frequency",
      "harmonicity",
      "oscillator",
      "envelope",
      "modulation",
      "modulationEnvelope",
      "detune"
    ]);
  }
  static getDefaults() {
    return Object.assign(qe.getDefaults(), {
      harmonicity: 3,
      oscillator: Object.assign(Se(It.getDefaults(), [
        ...Object.keys(ge.getDefaults()),
        "frequency",
        "detune"
      ]), { type: "sine" }),
      envelope: Object.assign(Se(ke.getDefaults(), Object.keys(B.getDefaults())), {
        attack: 0.01,
        decay: 0.01,
        sustain: 1,
        release: 0.5
      }),
      modulation: Object.assign(Se(It.getDefaults(), [
        ...Object.keys(ge.getDefaults()),
        "frequency",
        "detune"
      ]), { type: "square" }),
      modulationEnvelope: Object.assign(Se(ke.getDefaults(), Object.keys(B.getDefaults())), {
        attack: 0.5,
        decay: 0,
        sustain: 1,
        release: 0.5
      })
    });
  }
  _triggerEnvelopeAttack(e, t) {
    this._carrier._triggerEnvelopeAttack(e, t), this._modulator._triggerEnvelopeAttack(e, t);
  }
  _triggerEnvelopeRelease(e) {
    return this._carrier._triggerEnvelopeRelease(e), this._modulator._triggerEnvelopeRelease(e), this;
  }
  getLevelAtTime(e) {
    return e = this.toSeconds(e), this.envelope.getValueAtTime(e);
  }
  dispose() {
    return super.dispose(), this._carrier.dispose(), this._modulator.dispose(), this.frequency.dispose(), this.detune.dispose(), this.harmonicity.dispose(), this._modulationNode.dispose(), this;
  }
}, Cd = class xn extends Fi {
  constructor() {
    super(O(xn.getDefaults(), arguments)), this.name = "FMSynth";
    const e = O(xn.getDefaults(), arguments);
    this.modulationIndex = new at({
      context: this.context,
      value: e.modulationIndex
    }), this.frequency.connect(this._carrier.frequency), this.frequency.chain(this.harmonicity, this._modulator.frequency), this.frequency.chain(this.modulationIndex, this._modulationNode), this.detune.fan(this._carrier.detune, this._modulator.detune), this._modulator.connect(this._modulationNode.gain), this._modulationNode.connect(this._carrier.frequency), this._carrier.connect(this.output);
  }
  static getDefaults() {
    return Object.assign(Fi.getDefaults(), { modulationIndex: 10 });
  }
  dispose() {
    return super.dispose(), this.modulationIndex.dispose(), this;
  }
}, qh = class Cn extends Dt {
  constructor() {
    super(O(Cn.getDefaults(), arguments, ["url", "onload"])), this.name = "ToneBufferSource", this._source = this.context.createBufferSource(), this._internalChannels = [this._source], this._sourceStarted = !1, this._sourceStopped = !1;
    const e = O(Cn.getDefaults(), arguments, ["url", "onload"]);
    Pe(this._source, this._gainNode), this._source.onended = () => this._stopSource(), this.playbackRate = new se({
      context: this.context,
      param: this._source.playbackRate,
      units: "positive",
      value: e.playbackRate
    }), this.loop = e.loop, this.loopStart = e.loopStart, this.loopEnd = e.loopEnd, this._buffer = new st(e.url, e.onload, e.onerror), this._internalChannels.push(this._source);
  }
  static getDefaults() {
    return Object.assign(Dt.getDefaults(), {
      url: new st(),
      loop: !1,
      loopEnd: 0,
      loopStart: 0,
      onload: ue,
      onerror: ue,
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
  start(e, t, n, i = 1) {
    z(this.buffer.loaded, "buffer is either not set or not loaded");
    const r = this.toSeconds(e);
    this._startGain(r, i), this.loop ? t = Vs(t, this.loopStart) : t = Vs(t, 0);
    let o = Math.max(this.toSeconds(t), 0);
    if (this.loop) {
      const a = this.toSeconds(this.loopEnd) || this.buffer.duration, c = this.toSeconds(this.loopStart), l = a - c;
      Fs(o, a) && (o = (o - c) % l + c), Re(o, this.buffer.duration) && (o = 0);
    }
    if (this._source.buffer = this.buffer.get(), this._source.loopEnd = this.toSeconds(this.loopEnd) || this.buffer.duration, gs(o, this.buffer.duration) && (this._sourceStarted = !0, this._source.start(r, o)), Z(n)) {
      let a = this.toSeconds(n);
      a = Math.max(a, 0), this.stop(r + a);
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
}, Pi = class Sn extends ge {
  constructor() {
    super(O(Sn.getDefaults(), arguments, ["type"])), this.name = "Noise", this._source = null;
    const e = O(Sn.getDefaults(), arguments, ["type"]);
    this._playbackRate = e.playbackRate, this.type = e.type, this._fadeIn = e.fadeIn, this._fadeOut = e.fadeOut;
  }
  static getDefaults() {
    return Object.assign(ge.getDefaults(), {
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
    if (z(e in qi, "Noise: invalid type: " + e), this._type !== e && (this._type = e, this.state === "started")) {
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
    const t = qi[this._type];
    this._source = new qh({
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
}, Ct = 44100 * 5, Ns = 2, $e = {
  brown: null,
  pink: null,
  white: null
}, qi = {
  get brown() {
    if (!$e.brown) {
      const s = [];
      for (let e = 0; e < Ns; e++) {
        const t = new Float32Array(Ct);
        s[e] = t;
        let n = 0;
        for (let i = 0; i < Ct; i++) {
          const r = Math.random() * 2 - 1;
          t[i] = (n + 0.02 * r) / 1.02, n = t[i], t[i] *= 3.5;
        }
      }
      $e.brown = new st().fromArray(s);
    }
    return $e.brown;
  },
  get pink() {
    if (!$e.pink) {
      const s = [];
      for (let e = 0; e < Ns; e++) {
        const t = new Float32Array(Ct);
        s[e] = t;
        let n, i, r, o, a, c, l;
        n = i = r = o = a = c = l = 0;
        for (let u = 0; u < Ct; u++) {
          const h = Math.random() * 2 - 1;
          n = 0.99886 * n + h * 0.0555179, i = 0.99332 * i + h * 0.0750759, r = 0.969 * r + h * 0.153852, o = 0.8665 * o + h * 0.3104856, a = 0.55 * a + h * 0.5329522, c = -0.7616 * c - h * 0.016898, t[u] = n + i + r + o + a + c + l + h * 0.5362, t[u] *= 0.11, l = h * 0.115926;
        }
      }
      $e.pink = new st().fromArray(s);
    }
    return $e.pink;
  },
  get white() {
    if (!$e.white) {
      const s = [];
      for (let e = 0; e < Ns; e++) {
        const t = new Float32Array(Ct);
        s[e] = t;
        for (let n = 0; n < Ct; n++) t[n] = Math.random() * 2 - 1;
      }
      $e.white = new st().fromArray(s);
    }
    return $e.white;
  }
}, Sd = class An extends Et {
  constructor() {
    super(O(An.getDefaults(), arguments)), this.name = "NoiseSynth";
    const e = O(An.getDefaults(), arguments);
    this.noise = new Pi(Object.assign({ context: this.context }, e.noise)), this.envelope = new oi(Object.assign({ context: this.context }, e.envelope)), this.noise.chain(this.envelope, this.output);
  }
  static getDefaults() {
    return Object.assign(Et.getDefaults(), {
      envelope: Object.assign(Se(ke.getDefaults(), Object.keys(B.getDefaults())), {
        decay: 0.1,
        sustain: 0
      }),
      noise: Object.assign(Se(Pi.getDefaults(), Object.keys(ge.getDefaults())), { type: "white" })
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
}, Li = class ra extends As {
  constructor() {
    super(...arguments), this.name = "MidiClass", this.defaultUnits = "midi";
  }
  _frequencyToUnits(e) {
    return ct(super._frequencyToUnits(e));
  }
  _ticksToUnits(e) {
    return ct(super._ticksToUnits(e));
  }
  _beatsToUnits(e) {
    return ct(super._beatsToUnits(e));
  }
  _secondsToUnits(e) {
    return ct(super._secondsToUnits(e));
  }
  toMidi() {
    return this.valueOf();
  }
  toFrequency() {
    return Ui(this.toMidi());
  }
  transpose(e) {
    return new ra(this.context, this.toMidi() + e);
  }
}, Ad = class kn extends Et {
  constructor() {
    super(O(kn.getDefaults(), arguments, ["voice", "options"])), this.name = "PolySynth", this._availableVoices = [], this._activeVoices = [], this._voices = [], this._gcTimeout = -1, this._averageActiveVoices = 0, this._syncedRelease = (i) => this.releaseAll(i);
    const e = O(kn.getDefaults(), arguments, ["voice", "options"]);
    z(!_t(e.voice), "DEPRECATED: The polyphony count is no longer the first argument.");
    const t = e.voice.getDefaults();
    this.options = Object.assign(t, e.options), this.voice = e.voice, this.maxPolyphony = e.maxPolyphony, this._dummyVoice = this._getNextAvailableVoice();
    const n = this._voices.indexOf(this._dummyVoice);
    this._voices.splice(n, 1), this._gcTimeout = this.context.setInterval(this._collectGarbage.bind(this), 1);
  }
  static getDefaults() {
    return Object.assign(Et.getDefaults(), {
      maxPolyphony: 32,
      options: {},
      voice: zt
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
      return z(e instanceof qe, "Voice must extend Monophonic class"), e.connect(this.output), this._voices.push(e), e;
    } else Ss("Max polyphony exceeded. Note dropped.");
  }
  _collectGarbage() {
    if (this._averageActiveVoices = Math.max(this._averageActiveVoices * 0.95, this.activeVoices), this._availableVoices.length && this._voices.length > Math.ceil(this._averageActiveVoices + 1)) {
      const e = this._availableVoices.shift(), t = this._voices.indexOf(e);
      this._voices.splice(t, 1), this.context.isOffline || e.dispose();
    }
  }
  _triggerAttack(e, t, n) {
    e.forEach((i) => {
      const r = new Li(this.context, i).toMidi(), o = this._getNextAvailableVoice();
      o && (o.triggerAttack(i, t, n), this._activeVoices.push({
        midi: r,
        voice: o,
        released: !1
      }), this.log("triggerAttack", i, t));
    });
  }
  _triggerRelease(e, t) {
    e.forEach((n) => {
      const i = new Li(this.context, n).toMidi(), r = this._activeVoices.find(({ midi: o, released: a }) => o === i && !a);
      r && (r.voice.triggerRelease(t), r.released = !0, this.log("triggerRelease", n, t));
    });
  }
  _scheduleEvent(e, t, n, i) {
    z(!this.disposed, "Synth was already disposed"), n <= this.now() ? e === "attack" ? this._triggerAttack(t, n, i) : this._triggerRelease(t, n) : this.context.setTimeout(() => {
      this.disposed || this._scheduleEvent(e, t, n, i);
    }, n - this.now());
  }
  triggerAttack(e, t, n) {
    Array.isArray(e) || (e = [e]);
    const i = this.toSeconds(t);
    return this._scheduleEvent("attack", e, i, n), this;
  }
  triggerRelease(e, t) {
    Array.isArray(e) || (e = [e]);
    const n = this.toSeconds(t);
    return this._scheduleEvent("release", e, n), this;
  }
  triggerAttackRelease(e, t, n, i) {
    const r = this.toSeconds(n);
    if (this.triggerAttack(e, r, i), je(t)) {
      z(je(e), "If the duration is an array, the notes must also be an array"), e = e;
      for (let o = 0; o < e.length; o++) {
        const a = t[Math.min(o, t.length - 1)], c = this.toSeconds(a);
        z(c > 0, "The duration must be greater than 0"), this.triggerRelease(e[o], r + c);
      }
    } else {
      const o = this.toSeconds(t);
      z(o > 0, "The duration must be greater than 0"), this.triggerRelease(e, r + o);
    }
    return this;
  }
  sync() {
    return this._syncState() && (this._syncMethod("triggerAttack", 1), this._syncMethod("triggerRelease", 1), this.context.transport.on("stop", this._syncedRelease), this.context.transport.on("pause", this._syncedRelease), this.context.transport.on("loopEnd", this._syncedRelease)), this;
  }
  set(e) {
    const t = Se(e, ["onsilence", "context"]);
    return this.options = tt(this.options, t), this._voices.forEach((n) => n.set(t)), this._dummyVoice.set(t), this;
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
}, aa = class On extends B {
  constructor() {
    super(O(On.getDefaults(), arguments, ["channels"])), this.name = "Split";
    const e = O(On.getDefaults(), arguments, ["channels"]);
    this._splitter = this.input = this.output = this.context.createChannelSplitter(e.channels), this._internalChannels = [this._splitter];
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { channels: 2 });
  }
  dispose() {
    return super.dispose(), this._splitter.disconnect(), this;
  }
}, oa = class Nn extends B {
  constructor() {
    super(O(Nn.getDefaults(), arguments, ["channels"])), this.name = "Merge";
    const e = O(Nn.getDefaults(), arguments, ["channels"]);
    this._merger = this.output = this.input = this.context.createChannelMerger(e.channels);
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { channels: 2 });
  }
  dispose() {
    return super.dispose(), this._merger.disconnect(), this;
  }
}, Wi = class extends B {
  constructor(s) {
    super(s), this.name = "StereoEffect", this.input = new J({ context: this.context }), this.input.channelCount = 2, this.input.channelCountMode = "explicit", this._dryWet = this.output = new $r({
      context: this.context,
      fade: s.wet
    }), this.wet = this._dryWet.fade, this._split = new aa({
      context: this.context,
      channels: 2
    }), this._merge = new oa({
      context: this.context,
      channels: 2
    }), this.input.connect(this._split), this.input.connect(this._dryWet.a), this._merge.connect(this._dryWet.b), X(this, ["wet"]);
  }
  connectEffectLeft(...s) {
    this._split.connect(s[0], 0, 0), vt(...s), Pe(s[s.length - 1], this._merge, 0, 0);
  }
  connectEffectRight(...s) {
    this._split.connect(s[0], 1, 0), vt(...s), Pe(s[s.length - 1], this._merge, 0, 1);
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { wet: 1 });
  }
  dispose() {
    return super.dispose(), this._dryWet.dispose(), this._split.dispose(), this._merge.dispose(), this;
  }
}, ji = class extends Wi {
  constructor(s) {
    super(s), this.feedback = new Y({
      context: this.context,
      value: s.feedback,
      units: "normalRange"
    }), this._feedbackL = new J({ context: this.context }), this._feedbackR = new J({ context: this.context }), this._feedbackSplit = new aa({
      context: this.context,
      channels: 2
    }), this._feedbackMerge = new oa({
      context: this.context,
      channels: 2
    }), this._merge.connect(this._feedbackSplit), this._feedbackMerge.connect(this._split), this._feedbackSplit.connect(this._feedbackL, 0, 0), this._feedbackL.connect(this._feedbackMerge, 0, 0), this._feedbackSplit.connect(this._feedbackR, 1, 0), this._feedbackR.connect(this._feedbackMerge, 0, 1), this.feedback.fan(this._feedbackL.gain, this._feedbackR.gain), X(this, ["feedback"]);
  }
  static getDefaults() {
    return Object.assign(Wi.getDefaults(), { feedback: 0.5 });
  }
  dispose() {
    return super.dispose(), this.feedback.dispose(), this._feedbackL.dispose(), this._feedbackR.dispose(), this._feedbackSplit.dispose(), this._feedbackMerge.dispose(), this;
  }
}, Lh = class ca extends rt {
  constructor() {
    super(Object.assign(O(ca.getDefaults(), arguments))), this.name = "Zero", this._gain = new J({ context: this.context }), this.output = this._gain, this.input = void 0, Pe(this.context.getConstant(0), this._gain);
  }
  dispose() {
    return super.dispose(), Gr(this.context.getConstant(0), this._gain), this;
  }
}, Bi = class Mn extends B {
  constructor() {
    super(O(Mn.getDefaults(), arguments, [
      "frequency",
      "min",
      "max"
    ])), this.name = "LFO", this._stoppedValue = 0, this._units = "number", this.convert = !0, this._fromType = se.prototype._fromType, this._toType = se.prototype._toType, this._is = se.prototype._is, this._clampValue = se.prototype._clampValue;
    const e = O(Mn.getDefaults(), arguments, [
      "frequency",
      "min",
      "max"
    ]);
    this._oscillator = new Ce(e), this.frequency = this._oscillator.frequency, this._amplitudeGain = new J({
      context: this.context,
      gain: e.amplitude,
      units: "normalRange"
    }), this.amplitude = this._amplitudeGain.gain, this._stoppedSignal = new Y({
      context: this.context,
      units: "audioRange",
      value: 0
    }), this._zeros = new Lh({ context: this.context }), this._a2g = new ea({ context: this.context }), this._scaler = this.output = new ni({
      context: this.context,
      max: e.max,
      min: e.min
    }), this.units = e.units, this.min = e.min, this.max = e.max, this._oscillator.chain(this._amplitudeGain, this._a2g, this._scaler), this._zeros.connect(this._a2g), this._stoppedSignal.connect(this._a2g), X(this, ["amplitude", "frequency"]), this.phase = e.phase;
  }
  static getDefaults() {
    return Object.assign(Ce.getDefaults(), {
      amplitude: 1,
      frequency: "4n",
      max: 1,
      min: 0,
      type: "sine",
      units: "number"
    });
  }
  start(e) {
    return e = this.toSeconds(e), this._stoppedSignal.setValueAtTime(0, e), this._oscillator.start(e), this;
  }
  stop(e) {
    return e = this.toSeconds(e), this._stoppedSignal.setValueAtTime(this._stoppedValue, e), this._oscillator.stop(e), this;
  }
  sync() {
    return this._oscillator.sync(), this._oscillator.syncFrequency(), this;
  }
  unsync() {
    return this._oscillator.unsync(), this._oscillator.unsyncFrequency(), this;
  }
  _setStoppedValue() {
    this._stoppedValue = this._oscillator.getInitialValue(), this._stoppedSignal.value = this._stoppedValue;
  }
  get min() {
    return this._toType(this._scaler.min);
  }
  set min(e) {
    e = this._fromType(e), this._scaler.min = e;
  }
  get max() {
    return this._toType(this._scaler.max);
  }
  set max(e) {
    e = this._fromType(e), this._scaler.max = e;
  }
  get type() {
    return this._oscillator.type;
  }
  set type(e) {
    this._oscillator.type = e, this._setStoppedValue();
  }
  get partials() {
    return this._oscillator.partials;
  }
  set partials(e) {
    this._oscillator.partials = e, this._setStoppedValue();
  }
  get phase() {
    return this._oscillator.phase;
  }
  set phase(e) {
    this._oscillator.phase = e, this._setStoppedValue();
  }
  get units() {
    return this._units;
  }
  set units(e) {
    const t = this.min, n = this.max;
    this._units = e, this.min = t, this.max = n;
  }
  get state() {
    return this._oscillator.state;
  }
  connect(e, t, n) {
    return (e instanceof se || e instanceof Y) && (this.convert = e.convert, this.units = e.units), ks(this, e, t, n), this;
  }
  dispose() {
    return super.dispose(), this._oscillator.dispose(), this._stoppedSignal.dispose(), this._zeros.dispose(), this._scaler.dispose(), this._a2g.dispose(), this._amplitudeGain.dispose(), this.amplitude.dispose(), this;
  }
}, kd = class Dn extends ji {
  constructor() {
    super(O(Dn.getDefaults(), arguments, [
      "frequency",
      "delayTime",
      "depth"
    ])), this.name = "Chorus";
    const e = O(Dn.getDefaults(), arguments, [
      "frequency",
      "delayTime",
      "depth"
    ]);
    this._depth = e.depth, this._delayTime = e.delayTime / 1e3, this._lfoL = new Bi({
      context: this.context,
      frequency: e.frequency,
      min: 0,
      max: 1
    }), this._lfoR = new Bi({
      context: this.context,
      frequency: e.frequency,
      min: 0,
      max: 1,
      phase: 180
    }), this._delayNodeL = new Ps({ context: this.context }), this._delayNodeR = new Ps({ context: this.context }), this.frequency = this._lfoL.frequency, X(this, ["frequency"]), this._lfoL.frequency.connect(this._lfoR.frequency), this.connectEffectLeft(this._delayNodeL), this.connectEffectRight(this._delayNodeR), this._lfoL.connect(this._delayNodeL.delayTime), this._lfoR.connect(this._delayNodeR.delayTime), this.depth = this._depth, this.type = e.type, this.spread = e.spread;
  }
  static getDefaults() {
    return Object.assign(ji.getDefaults(), {
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      type: "sine",
      spread: 180,
      feedback: 0,
      wet: 0.5
    });
  }
  get depth() {
    return this._depth;
  }
  set depth(e) {
    this._depth = e;
    const t = this._delayTime * e;
    this._lfoL.min = Math.max(this._delayTime - t, 0), this._lfoL.max = this._delayTime + t, this._lfoR.min = Math.max(this._delayTime - t, 0), this._lfoR.max = this._delayTime + t;
  }
  get delayTime() {
    return this._delayTime * 1e3;
  }
  set delayTime(e) {
    this._delayTime = e / 1e3, this.depth = this._depth;
  }
  get type() {
    return this._lfoL.type;
  }
  set type(e) {
    this._lfoL.type = e, this._lfoR.type = e;
  }
  get spread() {
    return this._lfoR.phase - this._lfoL.phase;
  }
  set spread(e) {
    this._lfoL.phase = 90 - e / 2, this._lfoR.phase = e / 2 + 90;
  }
  start(e) {
    return this._lfoL.start(e), this._lfoR.start(e), this;
  }
  stop(e) {
    return this._lfoL.stop(e), this._lfoR.stop(e), this;
  }
  sync() {
    return this._lfoL.sync(), this._lfoR.sync(), this;
  }
  unsync() {
    return this._lfoL.unsync(), this._lfoR.unsync(), this;
  }
  dispose() {
    return super.dispose(), this._lfoL.dispose(), this._lfoR.dispose(), this._delayNodeL.dispose(), this._delayNodeR.dispose(), this.frequency.dispose(), this;
  }
}, Wh = class En extends B {
  constructor() {
    super(O(En.getDefaults(), arguments, ["threshold", "ratio"])), this.name = "Compressor", this._compressor = this.context.createDynamicsCompressor(), this.input = this._compressor, this.output = this._compressor;
    const e = O(En.getDefaults(), arguments, ["threshold", "ratio"]);
    this.threshold = new se({
      minValue: this._compressor.threshold.minValue,
      maxValue: this._compressor.threshold.maxValue,
      context: this.context,
      convert: !1,
      param: this._compressor.threshold,
      units: "decibels",
      value: e.threshold
    }), this.attack = new se({
      minValue: this._compressor.attack.minValue,
      maxValue: this._compressor.attack.maxValue,
      context: this.context,
      param: this._compressor.attack,
      units: "time",
      value: e.attack
    }), this.release = new se({
      minValue: this._compressor.release.minValue,
      maxValue: this._compressor.release.maxValue,
      context: this.context,
      param: this._compressor.release,
      units: "time",
      value: e.release
    }), this.knee = new se({
      minValue: this._compressor.knee.minValue,
      maxValue: this._compressor.knee.maxValue,
      context: this.context,
      convert: !1,
      param: this._compressor.knee,
      units: "decibels",
      value: e.knee
    }), this.ratio = new se({
      minValue: this._compressor.ratio.minValue,
      maxValue: this._compressor.ratio.maxValue,
      context: this.context,
      convert: !1,
      param: this._compressor.ratio,
      units: "positive",
      value: e.ratio
    }), X(this, [
      "knee",
      "release",
      "attack",
      "ratio",
      "threshold"
    ]);
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), {
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
}, Od = class In extends B {
  constructor() {
    super(Object.assign(O(In.getDefaults(), arguments, ["threshold"]))), this.name = "Limiter";
    const e = O(In.getDefaults(), arguments, ["threshold"]);
    this._compressor = this.input = this.output = new Wh({
      context: this.context,
      ratio: 20,
      attack: 3e-3,
      release: 0.01,
      threshold: e.threshold
    }), this.threshold = this._compressor.threshold, X(this, "threshold");
  }
  static getDefaults() {
    return Object.assign(B.getDefaults(), { threshold: -12 });
  }
  get reduction() {
    return this._compressor.reduction;
  }
  dispose() {
    return super.dispose(), this._compressor.dispose(), this.threshold.dispose(), this;
  }
}, Nd = {
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
function Md() {
  return _e().now();
}
export {
  kd as Chorus,
  ei as Context,
  wd as Distortion,
  Cd as FMSynth,
  Td as FeedbackDelay,
  Xs as Filter,
  J as Gain,
  Od as Limiter,
  ia as MembraneSynth,
  bd as MetalSynth,
  xd as MonoSynth,
  Sd as NoiseSynth,
  Ad as PolySynth,
  zt as Synth,
  Nd as Transport,
  Md as now,
  bh as setContext,
  yd as start
};

//# sourceMappingURL=tone-host.esm.mjs.map