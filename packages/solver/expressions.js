/** Safe scalar expression parser. No eval, Function constructor, or property access. */
import {finite} from '../math/index.js';
const UNITS = Object.freeze({mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, ft: 304.8, deg: Math.PI/180, rad: 1});
const CONSTANTS = Object.freeze({pi: Math.PI, tau: 2*Math.PI, e: Math.E});
const FUNCTIONS = Object.freeze({sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow});
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function expression(source, variables = {}) {
  if (typeof source === 'number') return finite(source);
  if (typeof source !== 'string' || source.length > 4096) throw new TypeError('Expression must be a scalar or short string');
  const tokens = []; let cursor = 0;
  while (cursor < source.length) {
    const s = source.slice(cursor), space = /^\s+/.exec(s); if (space) { cursor += space[0].length; continue; }
    const match = /^(?:(\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[+\-*/^(),])/.exec(s);
    if (!match) throw new SyntaxError(`Unexpected character at ${cursor+1}`);
    tokens.push(match[0]); cursor += match[0].length;
  }
  if (!tokens.length) throw new SyntaxError('Empty expression');
  let index = 0, depth = 0;
  const resolve = name => {
    if (own(CONSTANTS, name)) return CONSTANTS[name]; if (own(UNITS, name)) return UNITS[name];
    if (typeof variables === 'function') return finite(variables(name), name);
    if (own(variables, name)) return finite(variables[name], name);
    throw new ReferenceError(`Unknown parameter: ${name}`);
  };
  const parse = (minimum = 0) => {
    if (++depth > 128) throw new RangeError('Expression nesting exceeds limit');
    let token = tokens[index++], left;
    if (token === '+' || token === '-') { left = parse(25); if (token === '-') left = -left; }
    else if (token === '(') { left = parse(); if (tokens[index++] !== ')') throw new SyntaxError('Missing closing parenthesis'); }
    else if (token && /^\d|^\./.test(token)) left = Number(token);
    else if (token && /^[A-Za-z_]/.test(token)) {
      if (tokens[index] === '(') {
        if (!own(FUNCTIONS, token)) throw new ReferenceError(`Unknown function: ${token}`);
        index++; const args = [];
        if (tokens[index] !== ')') { args.push(parse()); while (tokens[index] === ',') { index++; args.push(parse()); } }
        if (tokens[index++] !== ')') throw new SyntaxError('Missing function parenthesis');
        const n = token === 'pow' ? 2 : ['min', 'max'].includes(token) ? null : 1;
        if ((n !== null && args.length !== n) || !args.length || args.length > 32) throw new RangeError(`Invalid arguments for ${token}`);
        left = FUNCTIONS[token](...args);
      } else left = resolve(token);
    } else throw new SyntaxError('Expected a number or parameter');
    while (index < tokens.length) {
      token = tokens[index];
      // Only recognized units can be an implicit multiplier: 2 mm, (a+1) cm.
      if (own(UNITS, token)) { if (40 < minimum) break; index++; left *= UNITS[token]; continue; }
      const precedence = token === '+' || token === '-' ? 10 : token === '*' || token === '/' ? 20 : token === '^' ? 30 : -1;
      if (precedence < minimum) break;
      index++; const right = parse(precedence+(token === '^' ? 0 : 1));
      left = token === '+' ? left+right : token === '-' ? left-right : token === '*' ? left*right : token === '/' ? left/right : left**right;
    }
    depth--; return finite(left, 'expression result');
  };
  const result = parse(); if (index !== tokens.length) throw new SyntaxError(`Unexpected token: ${tokens[index]}`); return result;
}
export function parameters(definitions = {}) {
  const out = Object.create(null), pending = new Set();
  if (Object.keys(definitions).length > 2048) throw new RangeError('Too many parameters');
  for (const key of Object.keys(definitions)) if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key) || own(UNITS, key) || own(CONSTANTS, key) || own(FUNCTIONS, key)) throw new TypeError(`Reserved or invalid parameter name: ${key}`);
  const get = key => {
    if (own(out, key)) return out[key];
    if (!own(definitions, key)) throw new ReferenceError(`Unknown parameter: ${key}`);
    if (pending.has(key)) throw new RangeError(`Cyclic parameter dependency: ${key}`);
    pending.add(key); out[key] = expression(definitions[key], get); pending.delete(key); return out[key];
  };
  for (const key of Object.keys(definitions)) get(key);
  return out;
}
export const unitScale = unit => { if (!own(UNITS, unit)) throw new TypeError('Unsupported unit'); return UNITS[unit]; };
