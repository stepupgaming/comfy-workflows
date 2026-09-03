/**
 * Lossless JSON parsing: like JSON.parse, but integer literals beyond JS's
 * safe range become `bigint` instead of silently losing precision.
 *
 * This is what makes `cwf import` trustworthy: a workflow file containing
 * `"seed": 18446744073709551615` round-trips exactly, even though plain
 * JSON.parse would corrupt it. Exponents and decimals follow IEEE semantics
 * (they are not exactly-representable integers to begin with).
 */

export type LosslessJson =
  string | number | boolean | null | bigint | LosslessJson[] | { [key: string]: LosslessJson };

export function parseJsonLossless(text: string): LosslessJson {
  const p = new Parser(text);
  p.skipWs();
  const value = p.parseValue();
  p.skipWs();
  if (!p.eof()) p.fail("Unexpected trailing content");
  return value;
}

class Parser {
  private i = 0;
  constructor(private readonly text: string) {}

  eof(): boolean {
    return this.i >= this.text.length;
  }

  fail(message: string): never {
    const line = this.text.slice(0, this.i).split("\n").length;
    throw new Error(`Lossless JSON parse error at line ${line}: ${message}`);
  }

  skipWs(): void {
    while (!this.eof() && /\s/.test(this.text[this.i])) this.i++;
  }

  peek(): string {
    if (this.eof()) this.fail("Unexpected end of input");
    return this.text[this.i];
  }

  expect(ch: string): void {
    if (this.peek() !== ch) this.fail(`Expected '${ch}'`);
    this.i++;
  }

  parseValue(): LosslessJson {
    const ch = this.peek();
    switch (ch) {
      case "{":
        return this.parseObject();
      case "[":
        return this.parseArray();
      case '"':
        return this.parseString();
      case "t":
        return this.parseLiteral("true", true);
      case "f":
        return this.parseLiteral("false", false);
      case "n":
        return this.parseLiteral("null", null);
      default:
        return this.parseNumber();
    }
  }

  parseObject(): { [key: string]: LosslessJson } {
    this.expect("{");
    const out: { [key: string]: LosslessJson } = {};
    this.skipWs();
    if (this.peek() === "}") {
      this.i++;
      return out;
    }
    for (;;) {
      this.skipWs();
      const key = this.parseString();
      this.skipWs();
      this.expect(":");
      this.skipWs();
      out[key] = this.parseValue();
      this.skipWs();
      const ch = this.peek();
      if (ch === ",") {
        this.i++;
        continue;
      }
      if (ch === "}") {
        this.i++;
        return out;
      }
      this.fail("Expected ',' or '}'");
    }
  }

  parseArray(): LosslessJson[] {
    this.expect("[");
    const out: LosslessJson[] = [];
    this.skipWs();
    if (this.peek() === "]") {
      this.i++;
      return out;
    }
    for (;;) {
      this.skipWs();
      out.push(this.parseValue());
      this.skipWs();
      const ch = this.peek();
      if (ch === ",") {
        this.i++;
        continue;
      }
      if (ch === "]") {
        this.i++;
        return out;
      }
      this.fail("Expected ',' or ']'");
    }
  }

  parseString(): string {
    this.expect('"');
    let out = "";
    for (;;) {
      if (this.eof()) this.fail("Unterminated string");
      const ch = this.text[this.i];
      if (ch === '"') {
        this.i++;
        return out;
      }
      if (ch === "\\") {
        this.i++;
        const esc = this.peek();
        this.i++;
        switch (esc) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = this.text.slice(this.i, this.i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Invalid \\u escape");
            out += String.fromCharCode(Number.parseInt(hex, 16));
            this.i += 4;
            break;
          }
          default:
            this.fail(`Invalid escape '\\${esc}'`);
        }
        continue;
      }
      out += ch;
      this.i++;
    }
  }

  parseLiteral(literal: string, value: LosslessJson): LosslessJson {
    if (this.text.startsWith(literal, this.i)) {
      this.i += literal.length;
      return value;
    }
    this.fail(`Invalid literal (expected '${literal}')`);
  }

  parseNumber(): number | bigint {
    const start = this.i;
    if (this.peek() === "-") this.i++;
    while (!this.eof() && /[0-9]/.test(this.text[this.i])) this.i++;
    let isFloat = false;
    if (!this.eof() && this.text[this.i] === ".") {
      isFloat = true;
      this.i++;
      while (!this.eof() && /[0-9]/.test(this.text[this.i])) this.i++;
    }
    if (!this.eof() && (this.text[this.i] === "e" || this.text[this.i] === "E")) {
      isFloat = true;
      this.i++;
      if (!this.eof() && (this.text[this.i] === "+" || this.text[this.i] === "-")) this.i++;
      while (!this.eof() && /[0-9]/.test(this.text[this.i])) this.i++;
    }
    const raw = this.text.slice(start, this.i);
    if (raw === "" || raw === "-") this.fail("Invalid number");
    if (!isFloat) {
      // Integer: use BigInt when it exceeds the safe range, else a plain number.
      const abs = raw.replace("-", "");
      if (abs.length > 15 || BigInt(abs) > BigInt(Number.MAX_SAFE_INTEGER)) {
        return BigInt(raw);
      }
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) this.fail(`Number out of range: ${raw}`);
    return n;
  }
}
