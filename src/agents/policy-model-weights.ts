/** Lossless delivery for bounded policy coefficients; fitting remains dense. */
interface SparseWeightPayload {
  readonly format: "sparse-float64-le.v1";
  readonly schemaVersion: 1;
  readonly rowOffsets: readonly number[];
  readonly columns: string;
  readonly values: string;
}
const DEFAULT_PAYLOAD_BYTES = 1_048_576;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string, length: number): Uint8Array {
  if (value.length !== 4 * Math.ceil(length / 3) || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value))
    throw new TypeError("noncanonical policy weight base64");
  const binary = atob(value);
  if (binary.length !== length || btoa(binary) !== value) throw new TypeError("invalid policy weight byte length");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Keeps legacy dense JSON bytes whenever they fit the ordinary runtime cap. */
export function encodeTearPolicyModelPayload(
  model: { readonly weights: readonly (readonly number[])[] },
  maxPayloadBytes = DEFAULT_PAYLOAD_BYTES,
): string {
  const dense = JSON.stringify(model);
  if (bytes(dense) <= maxPayloadBytes) return dense;
  const width = model.weights[0]?.length ?? 0,
    cells = model.weights.length * width;
  if (
    width < 1 ||
    width > 65_535 ||
    !Number.isSafeInteger(cells) ||
    cells > Math.floor(maxPayloadBytes / 2) ||
    model.weights.some((row) => row.length !== width || row.some((weight) => !Number.isFinite(weight)))
  )
    throw new RangeError("policy weights exceed bounded decoded work");
  const rowOffsets = [0],
    columns: number[] = [],
    values: number[] = [];
  for (const row of model.weights) {
    for (const [index, value] of row.entries())
      if (value !== 0) {
        columns.push(index);
        values.push(value);
      }
    rowOffsets.push(values.length);
  }
  const columnBytes = new Uint8Array(columns.length * 2),
    valueBytes = new Uint8Array(values.length * 8);
  const columnView = new DataView(columnBytes.buffer),
    valueView = new DataView(valueBytes.buffer);
  columns.forEach((column, index) => {
    columnView.setUint16(index * 2, column, true);
  });
  values.forEach((value, index) => {
    valueView.setFloat64(index * 8, value, true);
  });
  const weights: SparseWeightPayload = {
    format: "sparse-float64-le.v1",
    schemaVersion: 1,
    rowOffsets,
    columns: base64(columnBytes),
    values: base64(valueBytes),
  };
  const packed = JSON.stringify({ ...model, weights });
  if (bytes(packed) > maxPayloadBytes) throw new RangeError("policy model exceeds ordinary runtime payload budget");
  return packed;
}

class SparseWeightRows {
  readonly #offsets: readonly number[];
  readonly #columns: Uint16Array;
  readonly #values: Float64Array;
  readonly #width: number;
  constructor(offsets: readonly number[], columns: Uint16Array, values: Float64Array, width: number) {
    this.#offsets = Object.freeze([...offsets]);
    this.#columns = columns;
    this.#values = values;
    this.#width = width;
    Object.freeze(this);
  }
  reduce(row: number, reducer: (total: number, weight: number, column: number) => number, initial: number): number {
    let cursor = this.#offsets[row],
      total = initial;
    const end = this.#offsets[row + 1];
    if (cursor === undefined || end === undefined) throw new Error("validated policy weight row is unavailable");
    // Include every zero term, in original dense column order, preserving the
    // exact arithmetic and tie behavior even for exceptional normalized inputs.
    for (let column = 0; column < this.#width; column += 1) {
      const value = cursor < end && this.#columns[cursor] === column ? (this.#values[cursor++] ?? 0) : 0;
      total = reducer(total, value, column);
    }
    return total;
  }
}
export type TearPolicyModelWeights = readonly (readonly number[])[] | SparseWeightRows;

/** Validates work/dimensions and byte counts before allocating decoded buffers. */
export function parseTearPolicyModelWeights(
  value: unknown,
  rows: number,
  width: number,
  maxPayloadBytes: number,
): TearPolicyModelWeights | undefined {
  if (Array.isArray(value)) {
    if (
      value.length !== rows ||
      !value.every(
        (row) =>
          Array.isArray(row) &&
          row.length === width &&
          row.every((weight) => typeof weight === "number" && Number.isFinite(weight)),
      )
    )
      return undefined;
    return Object.freeze(value.map((row: number[]) => Object.freeze([...row])));
  }
  const cells = rows * width;
  if (
    !record(value) ||
    value.format !== "sparse-float64-le.v1" ||
    value.schemaVersion !== 1 ||
    Object.keys(value).sort().join(",") !== "columns,format,rowOffsets,schemaVersion,values" ||
    !Number.isSafeInteger(rows) ||
    rows < 1 ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(cells) ||
    width < 1 ||
    width > 65_535 ||
    cells > Math.floor(maxPayloadBytes / 2) ||
    !Array.isArray(value.rowOffsets) ||
    value.rowOffsets.length !== rows + 1 ||
    !value.rowOffsets.every((entry) => Number.isSafeInteger(entry) && entry >= 0 && entry <= cells) ||
    value.rowOffsets[0] !== 0 ||
    typeof value.columns !== "string" ||
    typeof value.values !== "string" ||
    value.columns.length + value.values.length > maxPayloadBytes
  )
    return undefined;
  const offsets = value.rowOffsets as number[],
    count = offsets[rows];
  if (count === undefined || offsets.some((offset, index) => offset < (offsets[index - 1] ?? 0))) return undefined;
  const columnBytes = decode(value.columns, count * 2),
    valueBytes = decode(value.values, count * 8);
  const columnView = new DataView(columnBytes.buffer),
    valueView = new DataView(valueBytes.buffer);
  const columns = new Uint16Array(count),
    values = new Float64Array(count);
  for (let row = 0; row < rows; row += 1) {
    let previous = -1;
    for (let index = offsets[row] ?? 0; index < (offsets[row + 1] ?? 0); index += 1) {
      const column = columnView.getUint16(index * 2, true),
        coefficient = valueView.getFloat64(index * 8, true);
      if (column <= previous || column >= width || !Number.isFinite(coefficient) || coefficient === 0) return undefined;
      previous = column;
      columns[index] = column;
      values[index] = coefficient;
    }
  }
  return new SparseWeightRows(offsets, columns, values, width);
}

export function reduceTearPolicyWeightRow(
  weights: TearPolicyModelWeights,
  row: number,
  reducer: (total: number, weight: number, column: number) => number,
  initial: number,
): number {
  if (weights instanceof SparseWeightRows) return weights.reduce(row, reducer, initial);
  const values = weights[row];
  if (values === undefined) throw new Error("validated policy weight row is unavailable");
  return values.reduce(reducer, initial);
}
