import crypto from "node:crypto";

import QRCode from "qrcode";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += alphabet[Number.parseInt(chunk, 2)];
  }

  return output;
}

const username = process.env.ADMIN_USERNAME || "admin";
const issuer = process.env.TOTP_ISSUER || "ChuggaBoom Funnel";
const secret = encodeBase32(crypto.randomBytes(20));
const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
  username,
)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

console.log("");
console.log("Add these environment variables:");
console.log(`ADMIN_USERNAME=${username}`);
console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log("");
console.log("Authenticator URI:");
console.log(otpauthUri);
console.log("");
console.log("QR code:");
console.log(await QRCode.toString(otpauthUri, { type: "terminal", small: true }));
