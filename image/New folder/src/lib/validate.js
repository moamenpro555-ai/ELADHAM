'use strict';
// Small input-validation helpers. Every route validates the body/params with these; nothing from the request
// is trusted. Each rule returns the cleaned value or throws a 400 with a clear field error.
const { HttpError } = require('../http');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const bad = (field, msg) => new HttpError(400, 'VALIDATION_ERROR', msg, { field });

const rules = {
  string: ({ min = 0, max = 500, optional = false, trim = true } = {}) => (v, f) => {
    if (v === undefined || v === null) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (typeof v !== 'string') throw bad(f, `${f} لازم يكون نص`);
    const s = trim ? v.trim() : v;
    if (s.length < min) throw bad(f, min === 1 ? `${f} مطلوب` : `${f} قصير جدًا`);
    if (s.length > max) throw bad(f, `${f} طويل جدًا (الحد الأقصى ${max})`);
    return s;
  },
  email: () => (v, f) => {
    if (typeof v !== 'string') throw bad(f, 'الإيميل مطلوب');
    const s = v.trim().toLowerCase();
    if (s.length > 254 || !EMAIL_RE.test(s)) throw bad(f, 'الإيميل غير صحيح');
    return s;
  },
  uuid: ({ optional = false } = {}) => (v, f) => {
    if (v === undefined || v === null) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (typeof v !== 'string' || !UUID_RE.test(v)) throw bad(f, `${f} غير صحيح`);
    return v.toLowerCase();
  },
  int: ({ min = -2147483648, max = 2147483647, optional = false, nullable = false } = {}) => (v, f) => {
    if (v === undefined) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (v === null) { if (nullable) return null; throw bad(f, `${f} مطلوب`); }
    if (!Number.isInteger(v) || v < min || v > max) throw bad(f, `${f} لازم يكون رقم صحيح بين ${min} و ${max}`);
    return v;
  },
  bool: ({ optional = false } = {}) => (v, f) => {
    if (v === undefined) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (typeof v !== 'boolean') throw bad(f, `${f} لازم يكون true أو false`);
    return v;
  },
  oneOf: (values, { optional = false } = {}) => (v, f) => {
    if (v === undefined) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (!values.includes(v)) throw bad(f, `${f} لازم يكون واحد من: ${values.join(', ')}`);
    return v;
  },
  uuidArray: ({ max = 500, optional = false } = {}) => (v, f) => {
    if (v === undefined) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (!Array.isArray(v) || v.length > max || !v.every((x) => typeof x === 'string' && UUID_RE.test(x))) {
      throw bad(f, `${f} لازم يكون قايمة معرّفات صحيحة`);
    }
    return v.map((x) => x.toLowerCase());
  },
  url: ({ optional = false, allowEmpty = true } = {}) => (v, f) => {
    if (v === undefined) { if (optional) return undefined; throw bad(f, `${f} مطلوب`); }
    if (typeof v !== 'string') throw bad(f, `${f} لازم يكون نص`);
    const s = v.trim();
    if (s === '') { if (allowEmpty) return ''; throw bad(f, `${f} مطلوب`); }
    if (s.length > 2000) throw bad(f, `${f} طويل جدًا`);
    let u; try { u = new URL(s); } catch { throw bad(f, `${f} مش رابط صحيح`); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad(f, `${f} لازم يبدأ بـ https://`);
    return s;
  },
};

// schema({ name: rules.string({min:1}) })(body) -> cleaned object (unknown fields are dropped)
function schema(def) {
  return (body) => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'البيانات المرسلة غير صحيحة');
    }
    const out = {};
    for (const [field, rule] of Object.entries(def)) {
      const val = rule(body[field], field);
      if (val !== undefined) out[field] = val;
    }
    return out;
  };
}

const paramId = (ctx, name = 'id') => rules.uuid()(ctx.params[name], name);

module.exports = { rules, schema, paramId, UUID_RE };
