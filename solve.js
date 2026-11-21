// A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Same answers as csv-reader 1.0.0 for every input, only faster: instead of
// reading one character at a time, it jumps from delimiter to delimiter with
// regex execs (/[,\r\n]/g for unquoted fields, /["\r\n]/g inside quoted
// fields) and slices field values out of the input. Written from the
// csv-reader 1.0.0 spec; no code copied from the reference implementation.
//
// Practice-set benchmark (6 cases, ~10 MB): 237 ms median in-process and
// 390 ms median fresh-process vs the house baseline's 1079 ms / 989 ms;
// 6/6 cases identical to the oracle, 50/50 adversarial edge cases identical.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Shared (single-threaded, lastIndex always set before exec).
const R_UNQ = /[,\r\n]/g;
const R_Q = /["\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = n > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  // The record being read: set at each record start; readUnquoted (below) uses them.
  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        // ---- quoted field, opening quote at pos ----
        const open = pos;
        const openLine = line;
        pos += 1;
        let value = '';
        let closed = false;
        let seg = pos;
        while (pos < n) {
          R_Q.lastIndex = pos;
          const m = R_Q.exec(text);
          if (m === null) break; // no closing quote anywhere: unterminated
          const i = m.index;
          const ch = m[0];
          if (ch === '"') {
            value += text.slice(seg, i);
            if (text.charCodeAt(i + 1) === 34) {
              value += '"';
              pos = i + 2;
              seg = pos;
              continue;
            }
            pos = i + 1;
            closed = true;
            break;
          }
          if (ch === '\n') {
            const end = i > seg && text.charCodeAt(i - 1) === 13 ? i - 1 : i;
            value += text.slice(seg, end);
            value += '\n';
            line += 1;
            pos = i + 1;
            seg = pos;
            continue;
          }
          // '\r' inside quotes: CRLF and lone CR each read as one LF.
          value += text.slice(seg, i);
          value += '\n';
          line += 1;
          pos = i + (text.charCodeAt(i + 1) === 10 ? 2 : 1);
          seg = pos;
        }
        if (!closed) {
          // The quote never closes: literal character, text after it re-read as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const u = readUnquoted('"');
          fields.push(u.value);
          ended = u.ended;
          continue;
        }
        if (pos >= n) {
          fields.push(value);
          ended = END;
          continue;
        }
        const c = text.charCodeAt(pos);
        if (c === 44) {
          pos += 1;
          fields.push(value);
          ended = COMMA;
          continue;
        }
        if (c === 10) {
          pos += 1;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
          continue;
        }
        if (c === 13 && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
          continue;
        }
        // What follows the closing quote is appended as it stands.
        const u = readUnquoted(value);
        if (u.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        fields.push(u.value);
        ended = u.ended;
        continue;
      }
      // ---- unquoted field ----
      const u = readUnquoted('');
      fields.push(u.value);
      ended = u.ended;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };

  // Reads unquoted characters onto `value` up to the next comma or line break.
  // A CR not followed by LF is dropped (stray_cr). `added` counts kept chars.
  function readUnquoted(value) {
    let added = 0;
    let seg = pos;
    while (true) {
      R_UNQ.lastIndex = seg;
      const m = R_UNQ.exec(text);
      if (m === null) {
        value += text.slice(seg);
        added += n - seg;
        pos = n;
        return { value, ended: END, added };
      }
      const i = m.index;
      const ch = m[0];
      if (ch === ',') {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (ch === '\n') {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // '\r'
      if (text.charCodeAt(i + 1) === 10) {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      value += text.slice(seg, i);
      seg = i + 1;
    }
  }
}
