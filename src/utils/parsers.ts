/**
 * Parses a TXT record buffer (key=value) strings
 */
export function parseTxtRecord(buffer: Buffer): { [key: string]: string } {
  const result: { [key: string]: string } = {};
  let offset = 0;

  // Iterate over the buffer using the Length-Prefixed format: [Len][String][Len][String]...
  while (offset < buffer.length) {
    // 1. Read the length of the next string
    const len = buffer.readUInt8(offset);
    offset++;

    // Safety check: prevent reading past end of buffer
    if (offset + len > buffer.length) break;

    // 2. Read the string content
    const str = buffer.toString("utf8", offset, offset + len);
    offset += len;

    const equalsIndex = str.indexOf("=");
    if (equalsIndex === -1) {
      result[str] = ""; // Key with empty value
      continue;
    }
    const key = str.substring(0, equalsIndex);
    const value = str.substring(equalsIndex + 1);
    result[key] = value;
  }

  return result;
}
