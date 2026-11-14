/**
 * Counts X posts the way X does (every link counts as 23) for the drafts in submission/x-posts.txt.
 * Posts are separated by a line holding only "---".
 *   npx tsx scripts/x-count.ts
 */
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../submission/x-posts.txt", import.meta.url), "utf8");
const posts = text.split(/^---$/m).map((p) => p.trim()).filter(Boolean);
posts.forEach((post, i) => {
  const links = post.match(/https?:\/\/\S+/g) ?? [];
  const withoutLinks = post.replace(/https?:\/\/\S+/g, "");
  // X counts code points, with most emoji and CJK as 2. These drafts are plain Latin text.
  const count = [...withoutLinks].length + links.length * 23;
  console.log(`post ${i + 1}: ${count}/280${count > 280 ? "  TOO LONG" : ""}  (${links.length} link${links.length === 1 ? "" : "s"}, ${(post.match(/@\w+/g) ?? []).length} mentions${/\$[A-Za-z]/.test(post) ? ", HAS A CASHTAG" : ""})`);
});
