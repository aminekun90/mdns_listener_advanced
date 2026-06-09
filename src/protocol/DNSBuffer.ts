export class DNSBuffer {
  private readonly buffer: Buffer;
  private offset: number = 0;

  constructor(buffer?: Buffer) {
    this.buffer = buffer || Buffer.alloc(0);
  }

  // --- Readers ---

  readUInt16(): number {
    const v = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  readName(): string {
    let name = "";
    let jumped = false;
    let jumpOffset = -1;
    let currentOffset = this.offset;

    while (true) {
      if (currentOffset >= this.buffer.length) break;
      const len = this.buffer.readUInt8(currentOffset);

      // Handle DNS compression pointer (0xC0 prefix)
      if ((len & 0xc0) === 0xc0) {
        if (!jumped) jumpOffset = currentOffset + 2;
        const b2 = this.buffer.readUInt8(currentOffset + 1);
        currentOffset = ((len & 0x3f) << 8) | b2;
        jumped = true;
        continue;
      }

      currentOffset++;
      if (len === 0) break;
      if (name.length > 0) name += ".";
      name += this.buffer.toString("utf8", currentOffset, currentOffset + len);
      currentOffset += len;
    }

    this.offset = jumped ? jumpOffset : currentOffset;
    return name;
  }

  readAnswer() {
    const name = this.readName();
    const type = this.readUInt16();
    const cls = this.readUInt16();
    const ttl = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    const len = this.readUInt16();

    let data: any = null;
    const endOffset = this.offset + len;

    if (type === 1) {
      // A — IPv4 address (4 bytes as dotted-decimal)
      data = this.buffer.subarray(this.offset, this.offset + len).join(".");
      this.offset += len;
    } else if (type === 28) {
      // AAAA — IPv6 address (16 bytes as colon-separated hex groups)
      const bytes = this.buffer.subarray(this.offset, this.offset + len);
      const groups: string[] = [];
      for (let i = 0; i < 16; i += 2) {
        groups.push(bytes.readUInt16BE(i).toString(16).padStart(4, "0"));
      }
      data = groups.join(":");
      this.offset += len;
    } else if (type === 16) {
      // TXT — raw buffer slice for parseTxtRecord
      data = [this.buffer.subarray(this.offset, this.offset + len)];
      this.offset += len;
    } else if (type === 12) {
      // PTR — pointer to another domain name
      data = this.readName();
    } else if (type === 33) {
      // SRV — service location record
      const priority = this.readUInt16();
      const weight = this.readUInt16();
      const port = this.readUInt16();
      const target = this.readName();
      data = { priority, weight, port, target };
    } else {
      // Unknown type — skip safely
      this.offset += len;
    }

    // Safety sync: always land exactly at end of record
    this.offset = endOffset;
    return { name, type, class: cls, ttl, data };
  }

  get isDone() {
    return this.offset >= this.buffer.length;
  }

  // --- Writers ---

  static createQuery(qname: string, qtype: number = 12): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0, 0);  // ID
    header.writeUInt16BE(0, 2);  // Flags (Query)
    header.writeUInt16BE(1, 4);  // QDCOUNT
    header.writeUInt16BE(0, 6);  // ANCOUNT
    header.writeUInt16BE(0, 8);  // NSCOUNT
    header.writeUInt16BE(0, 10); // ARCOUNT

    const qFooter = Buffer.alloc(4);
    qFooter.writeUInt16BE(qtype, 0); // Type
    qFooter.writeUInt16BE(1, 2);     // Class IN

    return Buffer.concat([header, this.encodeName(qname), qFooter]);
  }

  /**
   * Creates an mDNS Response packet announcing a service with an A record and TXT data.
   * @param name     - Hostname / service label (e.g. `"MyDevice.local"`).
   * @param ip       - IPv4 address to announce (e.g. `"192.168.1.50"`).
   * @param txtData  - Key/value pairs to encode in the TXT record.
   * @param ttl      - Time-to-live in seconds (default 120). Pass `0` for a goodbye packet.
   */
  static createResponse(
    name: string,
    ip: string,
    txtData: Record<string, string>,
    ttl: number = 120,
  ): Buffer {
    const buffers: Buffer[] = [];

    // 1. DNS Header
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0, 0);      // ID
    header.writeUInt16BE(0x8400, 2); // Flags: Response + Authoritative
    header.writeUInt16BE(0, 4);      // QDCOUNT
    header.writeUInt16BE(2, 6);      // ANCOUNT (A + TXT)
    header.writeUInt16BE(0, 8);      // NSCOUNT
    header.writeUInt16BE(0, 10);     // ARCOUNT
    buffers.push(header);

    // 2. Answer 1: A Record
    const aHeader = Buffer.alloc(10);
    aHeader.writeUInt16BE(1, 0);   // Type A
    aHeader.writeUInt16BE(1, 2);   // Class IN
    aHeader.writeUInt32BE(ttl, 4); // TTL
    aHeader.writeUInt16BE(4, 8);   // RDLength (4 bytes for IPv4)
    buffers.push(this.encodeName(name), aHeader, Buffer.from(ip.split(".").map(Number)));

    // 3. Answer 2: TXT Record
    const txtParts: Buffer[] = [];
    for (const [k, v] of Object.entries(txtData)) {
      const buf = Buffer.from(`${k}=${v}`);
      const lenByte = Buffer.alloc(1);
      lenByte.writeUInt8(buf.length);
      txtParts.push(lenByte, buf);
    }
    const fullTxt = Buffer.concat(txtParts);

    const txtHeader = Buffer.alloc(10);
    txtHeader.writeUInt16BE(16, 0);             // Type TXT
    txtHeader.writeUInt16BE(1, 2);              // Class IN
    txtHeader.writeUInt32BE(ttl, 4);            // TTL
    txtHeader.writeUInt16BE(fullTxt.length, 8); // RDLength
    buffers.push(this.encodeName(name), txtHeader, fullTxt);

    return Buffer.concat(buffers);
  }

  /**
   * Creates a Goodbye packet (TTL = 0) for the given service.
   * Sending this tells peers to immediately evict the service from their caches.
   */
  static createGoodbye(name: string, ip: string): Buffer {
    return DNSBuffer.createResponse(name, ip, {}, 0);
  }

  static encodeName(name: string): Buffer {
    const parts = name.split(".");
    const buf = Buffer.alloc(name.length + 2);
    let offset = 0;
    for (const part of parts) {
      buf.writeUInt8(part.length, offset++);
      buf.write(part, offset, "utf8");
      offset += part.length;
    }
    buf.writeUInt8(0, offset);
    return buf.subarray(0, offset + 1);
  }
}
