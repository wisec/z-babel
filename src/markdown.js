export function renderLimitedMarkdown(text) {
  return escapeHtml(text)
    .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}
