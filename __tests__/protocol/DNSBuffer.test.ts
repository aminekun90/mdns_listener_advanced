import { DNSBuffer } from "@/protocol/DNSBuffer.js"; // Adjust path if needed
import { describe, expect, it } from "vitest";

describe("DNSBuffer", () => {
  // --- Constructor & Basic properties ---
  it("should initialize with an empty buffer if none provided", () => {
    const dns = new DNSBuffer();
    expect(dns.isDone).toBe(true);
  });

  it("should initialize with a provided buffer", () => {
    const buf = Buffer.from([0x01]);
    const dns = new DNSBuffer(buf);
    expect(dns.isDone).toBe(false);
  });

  // --- Readers ---
  describe("readUInt16", () => {
    it("should read a 16-bit unsigned integer", () => {
      // 0x0102 = 258
      const buf = Buffer.from([0x01, 0x02]);
      const dns = new DNSBuffer(buf);
      expect(dns.readUInt16()).toBe(258);
      expect(dns.isDone).toBe(true);
    });
  });

  describe("readName", () => {
    it("should read a simple domain name", () => {
      // 3 'w' 'w' 'w' 6 'g' 'o' 'o' 'g' 'l' 'e' 3 'c' 'o' 'm' 0
      const buf = DNSBuffer.encodeName("www.google.com");
      const dns = new DNSBuffer(buf);
      expect(dns.readName()).toBe("www.google.com");
    });

    it("should handle DNS compression pointers", () => {
      // Construct a buffer with a pointer
      // Offset 0: "google" (6 g o o g l e) + null (0)
      // Offset 8: "www" (3 w w w) + Pointer to 0 (0xC0 0x00)

      const part1 = Buffer.from([0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x00]); // "google."
      const part2 = Buffer.from([0x03, 0x77, 0x77, 0x77, 0xc0, 0x00]); // "www" -> pointer to 0

      const buf = Buffer.concat([part1, part2]);
      const dns = new DNSBuffer(buf);

      // Read first name (google) to advance offset? No, we want to skip to offset 8 manually
      // or just read two names.
      // Let's read the first one "google"
      expect(dns.readName()).toBe("google");

      // Now read the second one "www.google" (which uses the pointer)
      expect(dns.readName()).toBe("www.google");
    });

    it("should handle empty/root name", () => {
      const buf = Buffer.from([0x00]);
      const dns = new DNSBuffer(buf);
      expect(dns.readName()).toBe("");
    });
  });

  // --- readAnswer (The Complex Logic) ---
  describe("readAnswer", () => {
    it("should parse Type 1 (A Record / IPv4)", () => {
      // Header + 4 bytes IP (192.168.1.1)
      //   const header = createAnswerHeader(1, 4);
      //   const ip = Buffer.from([192, 168, 1, 1]);

      // We need a valid name at offset 0xC00C (12) for the parser to work?
      // Actually readAnswer calls readName() first.
      // Let's make it simpler: explicit simple name at start.

      const name = DNSBuffer.encodeName("test.local");
      const rest = Buffer.alloc(10); // Type(2) Class(2) TTL(4) Len(2)
      rest.writeUInt16BE(1, 0); // Type A
      rest.writeUInt16BE(1, 2); // Class
      rest.writeUInt32BE(100, 4); // TTL
      rest.writeUInt16BE(4, 8); // Len 4

      const ipData = Buffer.from([10, 0, 0, 5]);

      const buf = Buffer.concat([name, rest, ipData]);
      const dns = new DNSBuffer(buf);

      const ans = dns.readAnswer();
      expect(ans.name).toBe("test.local");
      expect(ans.type).toBe(1);
      expect(ans.data).toBe("10.0.0.5");
    });

    it("should parse Type 16 (TXT Record)", () => {
      const name = DNSBuffer.encodeName("txt.local");
      const rest = Buffer.alloc(10);
      rest.writeUInt16BE(16, 0); // Type TXT
      rest.writeUInt16BE(1, 2); // Class
      rest.writeUInt32BE(100, 4); // TTL

      const txtContent = Buffer.from("hello=world");
      rest.writeUInt16BE(txtContent.length, 8); // Len

      const buf = Buffer.concat([name, rest, txtContent]);
      const dns = new DNSBuffer(buf);

      const ans = dns.readAnswer();
      expect(ans.type).toBe(16);
      expect(Array.isArray(ans.data)).toBe(true);
      expect(ans.data[0].toString()).toBe("hello=world");
    });

    it("should parse Type 12 (PTR Record)", () => {
      const name = DNSBuffer.encodeName("ptr.local");
      const rest = Buffer.alloc(10);
      rest.writeUInt16BE(12, 0); // Type PTR
      rest.writeUInt16BE(1, 2);
      rest.writeUInt32BE(100, 4);

      const targetName = DNSBuffer.encodeName("target.local");
      rest.writeUInt16BE(targetName.length, 8); // Len

      const buf = Buffer.concat([name, rest, targetName]);
      const dns = new DNSBuffer(buf);

      const ans = dns.readAnswer();
      expect(ans.type).toBe(12);
      expect(ans.data).toBe("target.local");
    });

    it("should parse Type 33 (SRV Record)", () => {
      const name = DNSBuffer.encodeName("srv.local");
      const rest = Buffer.alloc(10);
      rest.writeUInt16BE(33, 0); // Type SRV
      rest.writeUInt16BE(1, 2);
      rest.writeUInt32BE(100, 4);

      const targetName = DNSBuffer.encodeName("target.local");
      const srvData = Buffer.alloc(6);
      srvData.writeUInt16BE(10, 0); // Priority
      srvData.writeUInt16BE(20, 2); // Weight
      srvData.writeUInt16BE(8080, 4); // Port

      // Total Data Length = 6 + name length
      rest.writeUInt16BE(6 + targetName.length, 8);

      const buf = Buffer.concat([name, rest, srvData, targetName]);
      const dns = new DNSBuffer(buf);

      const ans = dns.readAnswer();
      expect(ans.type).toBe(33);
      expect(ans.data).toEqual({
        priority: 10,
        weight: 20,
        port: 8080,
        target: "target.local",
      });
    });

    it("should safely skip Unknown Types", () => {
      const name = DNSBuffer.encodeName("unknown.local");
      const rest = Buffer.alloc(10);
      rest.writeUInt16BE(999, 0); // Type 999 (Unknown)
      rest.writeUInt16BE(1, 2);
      rest.writeUInt32BE(100, 4);

      const garbageData = Buffer.from([0xaa, 0xbb, 0xcc]);
      rest.writeUInt16BE(garbageData.length, 8); // Len

      const buf = Buffer.concat([name, rest, garbageData]);
      const dns = new DNSBuffer(buf);

      const ans = dns.readAnswer();
      expect(ans.type).toBe(999);
      expect(ans.data).toBe(null); // Unknown type returns null data
      expect(dns.isDone).toBe(true); // Should have skipped garbage data
    });
  });

  // --- Static Writers ---
  describe("createQuery", () => {
    it("should create a valid DNS Query packet", () => {
      const buf = DNSBuffer.createQuery("test.local", 12);

      // Header is 12 bytes
      expect(buf.readUInt16BE(0)).toBe(0); // ID
      expect(buf.readUInt16BE(2)).toBe(0); // Flags
      expect(buf.readUInt16BE(4)).toBe(1); // QDCOUNT (1)

      // Check Name (12 is offset of header)
      // "test.local" -> 4test5local0
      expect(buf.readUInt8(12)).toBe(4); // 'test' length

      // Check Footer (Type + Class)
      // Header(12) + Name(4+1+5+1+1 = 12) = 24 offset
      const typeOffset = 12 + 12;
      expect(buf.readUInt16BE(typeOffset)).toBe(12); // Type PTR
      expect(buf.readUInt16BE(typeOffset + 2)).toBe(1); // Class IN
    });
  });

  describe("createResponse", () => {
    it("should create a valid DNS Response packet", () => {
      const buf = DNSBuffer.createResponse("dev.local", "1.2.3.4", { key: "val" });

      const dns = new DNSBuffer(buf);

      // 1. Read Header
      dns.readUInt16(); // ID
      const flags = dns.readUInt16();
      expect(flags).toBe(0x8400); // Response + Authoritative

      dns.readUInt16(); // QD
      const anCount = dns.readUInt16();
      expect(anCount).toBe(2); // A + TXT

      dns.readUInt16(); // NS
      dns.readUInt16(); // AR

      // 2. Read Answer 1 (A Record)
      const ans1 = dns.readAnswer();
      expect(ans1.name).toBe("dev.local");
      expect(ans1.type).toBe(1);
      expect(ans1.data).toBe("1.2.3.4");

      // 3. Read Answer 2 (TXT Record)
      const ans2 = dns.readAnswer();
      expect(ans2.name).toBe("dev.local");
      expect(ans2.type).toBe(16);
      expect(ans2.data[0].toString()).toContain("key=val");
    });
  });
});
