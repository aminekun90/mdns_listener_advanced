import { DNSBuffer } from "@/protocol/DNSBuffer.js";
import { describe, expect, it } from "vitest";

describe("DNSBuffer", () => {
  // ─── Constructor ────────────────────────────────────────────────────────

  it("should initialize as done when no buffer is provided", () => {
    expect(new DNSBuffer().isDone).toBe(true);
  });

  it("should initialize as not done when a buffer is provided", () => {
    expect(new DNSBuffer(Buffer.from([0x01])).isDone).toBe(false);
  });

  // ─── readUInt16 ─────────────────────────────────────────────────────────

  describe("readUInt16", () => {
    it("reads a big-endian 16-bit unsigned integer and advances the cursor", () => {
      const dns = new DNSBuffer(Buffer.from([0x01, 0x02]));
      expect(dns.readUInt16()).toBe(258); // 0x0102
      expect(dns.isDone).toBe(true);
    });

    it("reads consecutive values from a buffer", () => {
      const dns = new DNSBuffer(Buffer.from([0x00, 0x01, 0x00, 0x02]));
      expect(dns.readUInt16()).toBe(1);
      expect(dns.readUInt16()).toBe(2);
    });
  });

  // ─── readName ───────────────────────────────────────────────────────────

  describe("readName", () => {
    it("decodes a simple domain name", () => {
      const dns = new DNSBuffer(DNSBuffer.encodeName("www.google.com"));
      expect(dns.readName()).toBe("www.google.com");
    });

    it("returns an empty string for the DNS root (0x00)", () => {
      const dns = new DNSBuffer(Buffer.from([0x00]));
      expect(dns.readName()).toBe("");
    });

    it("follows DNS compression pointers", () => {
      // Buffer layout:
      //  Offset 0–7: "google\0"   (6 g o o g l e + null)
      //  Offset 8–13: "www" + pointer to offset 0
      const part1 = Buffer.from([0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x00]);
      const part2 = Buffer.from([0x03, 0x77, 0x77, 0x77, 0xc0, 0x00]);
      const buf = Buffer.concat([part1, part2]);
      const dns = new DNSBuffer(buf);

      expect(dns.readName()).toBe("google");
      expect(dns.readName()).toBe("www.google");
    });

    it("advances cursor past the name on each call", () => {
      const name1 = DNSBuffer.encodeName("a.local");
      const name2 = DNSBuffer.encodeName("b.local");
      const dns = new DNSBuffer(Buffer.concat([name1, name2]));

      expect(dns.readName()).toBe("a.local");
      expect(dns.readName()).toBe("b.local");
      expect(dns.isDone).toBe(true);
    });
  });

  // ─── readAnswer ─────────────────────────────────────────────────────────

  describe("readAnswer", () => {
    function makeRecord(type: number, rdataLen: number, rdata: Buffer): Buffer {
      const name = DNSBuffer.encodeName("test.local");
      const header = Buffer.alloc(10);
      header.writeUInt16BE(type, 0);   // Type
      header.writeUInt16BE(1, 2);      // Class IN
      header.writeUInt32BE(100, 4);    // TTL
      header.writeUInt16BE(rdataLen, 8);
      return Buffer.concat([name, header, rdata]);
    }

    it("parses Type 1 (A) records as dotted-decimal IPv4", () => {
      const buf = makeRecord(1, 4, Buffer.from([10, 0, 0, 5]));
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.type).toBe(1);
      expect(ans.data).toBe("10.0.0.5");
    });

    it("parses Type 28 (AAAA) records as colon-separated hex IPv6", () => {
      const ipv6Bytes = Buffer.alloc(16);
      // 2001:0db8:85a3:0000:0000:8a2e:0370:7334
      const groups = [0x2001, 0x0db8, 0x85a3, 0x0000, 0x0000, 0x8a2e, 0x0370, 0x7334];
      groups.forEach((g, i) => ipv6Bytes.writeUInt16BE(g, i * 2));

      const buf = makeRecord(28, 16, ipv6Bytes);
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.type).toBe(28);
      expect(ans.data).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    });

    it("parses Type 28 (AAAA) loopback address", () => {
      const loopback = Buffer.alloc(16);
      loopback.writeUInt16BE(0x0001, 14); // ::1
      const buf = makeRecord(28, 16, loopback);
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.data).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
    });

    it("parses Type 16 (TXT) records as a Buffer array", () => {
      const txt = Buffer.from("hello=world");
      const buf = makeRecord(16, txt.length, txt);
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.type).toBe(16);
      expect(Array.isArray(ans.data)).toBe(true);
      expect((ans.data as Buffer[])[0].toString()).toBe("hello=world");
    });

    it("parses Type 12 (PTR) records as a domain name string", () => {
      const target = DNSBuffer.encodeName("target.local");
      const buf = makeRecord(12, target.length, target);
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.type).toBe(12);
      expect(ans.data).toBe("target.local");
    });

    it("parses Type 33 (SRV) records with priority, weight, port, and target", () => {
      const target = DNSBuffer.encodeName("srv-target.local");
      const srvPrefix = Buffer.alloc(6);
      srvPrefix.writeUInt16BE(10, 0);   // priority
      srvPrefix.writeUInt16BE(20, 2);   // weight
      srvPrefix.writeUInt16BE(8080, 4); // port
      const rdata = Buffer.concat([srvPrefix, target]);

      const buf = makeRecord(33, rdata.length, rdata);
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.type).toBe(33);
      expect(ans.data).toEqual({ priority: 10, weight: 20, port: 8080, target: "srv-target.local" });
    });

    it("skips and returns null for unknown record types", () => {
      const garbage = Buffer.from([0xaa, 0xbb, 0xcc]);
      const buf = makeRecord(999, garbage.length, garbage);
      const ans = new DNSBuffer(buf).readAnswer();
      expect(ans.type).toBe(999);
      expect(ans.data).toBeNull();
      expect(new DNSBuffer(buf).readAnswer(), "cursor should be past the record").toBeDefined();
    });

    it("exposes the correct TTL from the wire format", () => {
      const name = DNSBuffer.encodeName("ttl-test.local");
      const header = Buffer.alloc(10);
      header.writeUInt16BE(1, 0);
      header.writeUInt16BE(1, 2);
      header.writeUInt32BE(300, 4); // TTL = 300
      header.writeUInt16BE(4, 8);
      const buf = Buffer.concat([name, header, Buffer.from([1, 2, 3, 4])]);
      expect(new DNSBuffer(buf).readAnswer().ttl).toBe(300);
    });
  });

  // ─── createQuery ────────────────────────────────────────────────────────

  describe("createQuery", () => {
    it("creates a well-formed DNS Query packet", () => {
      const buf = DNSBuffer.createQuery("test.local", 12);

      // Header checks
      expect(buf.readUInt16BE(0)).toBe(0);    // ID
      expect(buf.readUInt16BE(2)).toBe(0);    // Flags (Query)
      expect(buf.readUInt16BE(4)).toBe(1);    // QDCOUNT = 1
      expect(buf.readUInt16BE(6)).toBe(0);    // ANCOUNT
      expect(buf.readUInt16BE(8)).toBe(0);    // NSCOUNT
      expect(buf.readUInt16BE(10)).toBe(0);   // ARCOUNT

      // Question QTYPE and QCLASS
      const qOffset = 12 + DNSBuffer.encodeName("test.local").length;
      expect(buf.readUInt16BE(qOffset)).toBe(12); // PTR
      expect(buf.readUInt16BE(qOffset + 2)).toBe(1); // IN
    });

    it("encodes the service type in the question section", () => {
      const buf = DNSBuffer.createQuery("_http._tcp.local", 255);
      const dns = new DNSBuffer(buf);
      // Skip 12-byte header
      for (let i = 0; i < 6; i++) dns.readUInt16();
      expect(dns.readName()).toBe("_http._tcp.local");
    });
  });

  // ─── createResponse ─────────────────────────────────────────────────────

  describe("createResponse", () => {
    it("creates a valid DNS Response with A and TXT records", () => {
      const buf = DNSBuffer.createResponse("dev.local", "1.2.3.4", { key: "val" });
      const dns = new DNSBuffer(buf);

      dns.readUInt16(); // ID
      expect(dns.readUInt16()).toBe(0x8400); // Flags
      dns.readUInt16(); // QD
      expect(dns.readUInt16()).toBe(2);       // AN (A + TXT)
      dns.readUInt16(); dns.readUInt16();     // NS, AR

      const a = dns.readAnswer();
      expect(a.name).toBe("dev.local");
      expect(a.type).toBe(1);
      expect(a.data).toBe("1.2.3.4");
      expect(a.ttl).toBe(120); // default TTL

      const txt = dns.readAnswer();
      expect(txt.name).toBe("dev.local");
      expect(txt.type).toBe(16);
      expect((txt.data as Buffer[])[0].toString()).toContain("key=val");
    });

    it("applies a custom TTL to both A and TXT records", () => {
      const buf = DNSBuffer.createResponse("dev.local", "10.0.0.1", {}, 300);
      const dns = new DNSBuffer(buf);
      for (let i = 0; i < 6; i++) dns.readUInt16(); // skip header

      const a = dns.readAnswer();
      expect(a.ttl).toBe(300);

      const txt = dns.readAnswer();
      expect(txt.ttl).toBe(300);
    });

    it("round-trips: the packet it creates can be parsed back correctly", () => {
      const packet = DNSBuffer.createResponse(
        "roundtrip.local",
        "192.168.99.1",
        { version: "1.0", env: "test" },
        60,
      );

      const dns = new DNSBuffer(packet);
      for (let i = 0; i < 6; i++) dns.readUInt16(); // skip 12-byte header

      const a = dns.readAnswer();
      expect(a.name).toBe("roundtrip.local");
      expect(a.data).toBe("192.168.99.1");
      expect(a.ttl).toBe(60);

      const txt = dns.readAnswer();
      expect(txt.ttl).toBe(60);
      const txtStr = (txt.data as Buffer[])[0].toString();
      expect(txtStr).toContain("version=1.0");
    });
  });

  // ─── createGoodbye ──────────────────────────────────────────────────────

  describe("createGoodbye", () => {
    it("creates a packet with TTL = 0 on both A and TXT records", () => {
      const buf = DNSBuffer.createGoodbye("byebye.local", "10.0.0.1");
      const dns = new DNSBuffer(buf);
      for (let i = 0; i < 6; i++) dns.readUInt16(); // skip header

      const a = dns.readAnswer();
      expect(a.ttl).toBe(0);

      const txt = dns.readAnswer();
      expect(txt.ttl).toBe(0);
    });

    it("sets the authoritative-answer response flag", () => {
      const buf = DNSBuffer.createGoodbye("byebye.local", "10.0.0.1");
      expect(buf.readUInt16BE(2)).toBe(0x8400);
    });

    it("encodes the correct hostname in the goodbye packet", () => {
      const buf = DNSBuffer.createGoodbye("mydevice.local", "1.2.3.4");
      const dns = new DNSBuffer(buf);
      for (let i = 0; i < 6; i++) dns.readUInt16(); // skip header
      const a = dns.readAnswer();
      expect(a.name).toBe("mydevice.local");
    });
  });

  // ─── encodeName ─────────────────────────────────────────────────────────

  describe("encodeName", () => {
    it("encodes a hostname into DNS label format", () => {
      const buf = DNSBuffer.encodeName("test.local");
      // 4 t e s t . 5 l o c a l . 0
      expect(buf[0]).toBe(4);
      expect(buf.slice(1, 5).toString()).toBe("test");
      expect(buf[5]).toBe(5);
      expect(buf.slice(6, 11).toString()).toBe("local");
      expect(buf[11]).toBe(0);
    });

    it("round-trips: encoded name can be decoded back", () => {
      const names = ["simple.local", "_http._tcp.local", "a.b.c.d.local"];
      for (const name of names) {
        const dns = new DNSBuffer(DNSBuffer.encodeName(name));
        expect(dns.readName()).toBe(name);
      }
    });
  });
});
