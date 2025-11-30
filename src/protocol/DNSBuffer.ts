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
        let name = '';
        let jumped = false;
        let jumpOffset = -1;
        let currentOffset = this.offset;

        while (true) {
            if (currentOffset >= this.buffer.length) break;
            const len = this.buffer.readUInt8(currentOffset);

            // Handle Compression Pointer (0xC0)
            if ((len & 0xC0) === 0xC0) {
                if (!jumped) jumpOffset = currentOffset + 2;
                const b2 = this.buffer.readUInt8(currentOffset + 1);
                currentOffset = ((len & 0x3F) << 8) | b2;
                jumped = true;
                continue;
            }

            currentOffset++;
            if (len === 0) break;
            if (name.length > 0) name += '.';
            name += this.buffer.toString('utf8', currentOffset, currentOffset + len);
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

        if (type === 16) { // TXT
            // Return raw buffer array wrapper to match legacy structure expectation
            data = [this.buffer.subarray(this.offset, this.offset + len)];
        } else if (type === 1) { // A (IPv4)
            data = this.buffer.subarray(this.offset, this.offset + len).join('.');
        }

        this.offset += len;
        return { name, type, class: cls, ttl, data };
    }

    get isDone() { return this.offset >= this.buffer.length; }

    // --- Writers ---

    static createResponse(name: string, ip: string, txtData: { [key: string]: string }): Buffer {
        const buffers: Buffer[] = [];

        // --- 1. DNS Header ---
        const header = Buffer.alloc(12);
        header.writeUInt16BE(0, 0);       // ID (0)
        header.writeUInt16BE(0x8400, 2);  // Flags (Response + Authoritative)
        header.writeUInt16BE(0, 4);       // QDCOUNT (0 Questions)
        header.writeUInt16BE(2, 6);       // ANCOUNT (2 Answers)
        header.writeUInt16BE(0, 8);       // NSCOUNT
        header.writeUInt16BE(0, 10);      // ARCOUNT

        buffers.push(header);

        // --- 2. Answer 1: A Record (IPv4) ---
        const aHeader = Buffer.alloc(10);
        aHeader.writeUInt16BE(1, 0);    // Type A
        aHeader.writeUInt16BE(1, 2);    // Class IN
        aHeader.writeUInt32BE(120, 4);  // TTL
        aHeader.writeUInt16BE(4, 8);    // Data Length (4 bytes)

        // FIX: Push Name, Header, and IP in one go
        buffers.push(
            this.encodeName(name),
            aHeader,
            Buffer.from(ip.split('.').map(Number))
        );

        // --- 3. Answer 2: TXT Record ---
        const txtParts: Buffer[] = [];
        for (const [k, v] of Object.entries(txtData)) {
            const buf = Buffer.from(`${k}=${v}`);
            const len = Buffer.alloc(1);
            len.writeUInt8(buf.length);
            txtParts.push(len, buf);
        }
        const fullTxt = Buffer.concat(txtParts);

        const txtHeader = Buffer.alloc(10);
        txtHeader.writeUInt16BE(16, 0); // Type TXT
        txtHeader.writeUInt16BE(1, 2);  // Class IN
        txtHeader.writeUInt32BE(120, 4); // TTL
        txtHeader.writeUInt16BE(fullTxt.length, 8); // Data Length

        // FIX: Push Name, Header, and TXT Data in one go
        buffers.push(
            this.encodeName(name),
            txtHeader,
            fullTxt
        );

        return Buffer.concat(buffers);
    }

    static encodeName(name: string): Buffer {
        const parts = name.split('.');
        const buf = Buffer.alloc(name.length + 2);
        let offset = 0;
        for (const part of parts) {
            buf.writeUInt8(part.length, offset++);
            buf.write(part, offset, 'utf8');
            offset += part.length;
        }
        buf.writeUInt8(0, offset);
        return buf.subarray(0, offset + 1);
    }
}