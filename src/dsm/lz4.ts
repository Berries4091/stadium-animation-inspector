export class Lz4FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Lz4FormatError";
  }
}

function readLength(bytes: Uint8Array, cursor: { value: number }, initial: number): number {
  let length = initial;
  if (initial !== 15) return length;

  while (true) {
    if (cursor.value >= bytes.length) {
      throw new Lz4FormatError("truncated LZ4 length extension");
    }
    const value = bytes[cursor.value++];
    length += value;
    if (value !== 255) return length;
  }
}

export function decodeLz4Block(compressed: Uint8Array, expectedLength: number): Uint8Array {
  if (!Number.isSafeInteger(expectedLength) || expectedLength < 0) {
    throw new Lz4FormatError(`invalid decoded length ${expectedLength}`);
  }

  const output = new Uint8Array(expectedLength);
  const source = { value: 0 };
  let target = 0;

  while (source.value < compressed.length && target < output.length) {
    const token = compressed[source.value++];
    const literalLength = readLength(compressed, source, token >>> 4);
    if (source.value + literalLength > compressed.length) {
      throw new Lz4FormatError("truncated LZ4 literal run");
    }
    if (target + literalLength > output.length) {
      throw new Lz4FormatError("LZ4 literal run exceeds decoded length");
    }
    output.set(compressed.subarray(source.value, source.value + literalLength), target);
    source.value += literalLength;
    target += literalLength;

    if (target === output.length) break;
    if (source.value + 2 > compressed.length) {
      throw new Lz4FormatError("truncated LZ4 match offset");
    }

    const offset = compressed[source.value] | (compressed[source.value + 1] << 8);
    source.value += 2;
    if (offset === 0 || offset > target) {
      throw new Lz4FormatError(`invalid LZ4 match offset ${offset}`);
    }

    const matchLength = readLength(compressed, source, token & 0x0f) + 4;
    if (target + matchLength > output.length) {
      throw new Lz4FormatError("LZ4 match exceeds decoded length");
    }
    for (let index = 0; index < matchLength; index += 1) {
      output[target + index] = output[target - offset + index];
    }
    target += matchLength;
  }

  if (target !== output.length) {
    throw new Lz4FormatError(`decoded ${target} bytes, expected ${output.length}`);
  }
  return output;
}
