import assert from "node:assert/strict";
import { renderLimitedMarkdown } from "../src/markdown.js";

assert.equal(
  renderLimitedMarkdown("<u>Kitchen</u>\nYou see **lamp** & <script>alert(1)</script>."),
  "<u>Kitchen</u>\nYou see <strong>lamp</strong> &amp; &lt;script&gt;alert(1)&lt;/script&gt;.",
);

assert.equal(
  renderLimitedMarkdown("plain <b>html</b>"),
  "plain &lt;b&gt;html&lt;/b&gt;",
);

console.log("markdown tests passed");
