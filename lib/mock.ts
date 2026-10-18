import fs from "node:fs/promises";
import path from "node:path";

/**
 * DEMO / lokal ishlab chiqish rejimi: MOCK_DATA=1 bo'lsa, tashqi manbalar o'rniga
 * mock/*.json fayllari ishlatiladi (Google Sheets'siz UI'ni sinash uchun).
 */
export const MOCK = process.env.MOCK_DATA === "1";

export async function readMock<T = unknown>(name: string): Promise<T> {
  const file = path.join(process.cwd(), "mock", `${name}.json`);
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 500)); // tarmoq kechikishini taqlid qilish
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}
