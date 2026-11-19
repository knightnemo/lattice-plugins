// A copy of packFiles() and packed() from Lattice's plugin-sdk/scripts/pack-plugin.mjs
// (leo1oel/lattice), which authors run to get the sha256 their entry pins. The registry
// packs an entry's tagged folder with this and publishes the zip only when the hashes
// match, so what a reviewer read is byte for byte what Lattice installs. Keep the two
// identical: any change here changes every published hash.
//
// The zip is reproducible: entries sorted by path, a fixed 1980-01-01 timestamp, Unix
// permissions 0644 (0755 when executable), level-9 deflate, no extra fields.
import { constants, crc32, deflateRawSync } from "node:zlib";

/** Whether `path` (relative, `/`-separated) goes into the pack. */
export function packed(path) {
  return !path.split("/").some((part) => part.startsWith(".")) && !path.endsWith(".test.mjs");
}

const sortFiles = (files) =>
  [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));

/** The zip of `files` (`{ path, data, executable }`), byte for byte reproducible. */
export function packFiles(files) {
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  const sorted = sortFiles(files);
  for (const file of sorted) {
    const name = Buffer.from(file.path, "utf8");
    const data = deflateRawSync(file.data, { level: constants.Z_BEST_COMPRESSION });
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: deflate
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // 00:00:00
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, zip 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((file.executable ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
