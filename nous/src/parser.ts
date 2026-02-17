// Unified HTML + CSS + JS parser → DocumentBundle
import * as parse5 from "parse5";
import * as csstree from "css-tree";
import * as acorn from "acorn";
import type { DocumentBundle } from "./types.js";

/** Extract text content from elements matching a tag name in the parse5 tree */
function extractTagContent(node: parse5.DefaultTreeAdapterMap["node"], tagName: string): string[] {
  const results: string[] = [];

  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      if ("tagName" in child && child.tagName === tagName) {
        const text = ("childNodes" in child ? child.childNodes : [])
          .filter((c): c is parse5.DefaultTreeAdapterMap["textNode"] => "value" in c)
          .map((c) => c.value)
          .join("");
        if (text.trim()) results.push(text);
      }
      results.push(...extractTagContent(child, tagName));
    }
  }
  return results;
}

/** Parse an HTML string into a unified DocumentBundle with HTML tree, CSS AST, and JS AST */
export function parseDocument(html: string): DocumentBundle {
  const doc = parse5.parse(html);

  // Extract all inline <style> blocks
  const cssBlocks = extractTagContent(doc, "style");
  const rawCss = cssBlocks.join("\n");

  // Extract all inline <script> blocks (skip external src)
  const scriptBlocks = extractTagContent(doc, "script");
  const rawJs = scriptBlocks.join("\n");

  // Parse CSS
  let css: DocumentBundle["css"] = null;
  if (rawCss.trim()) {
    try {
      css = csstree.parse(rawCss);
    } catch {
      // CSS parse failure — leave as null, report in morphe
    }
  }

  // Parse JS
  let js: DocumentBundle["js"] = null;
  if (rawJs.trim()) {
    try {
      js = acorn.parse(rawJs, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
      });
    } catch {
      // JS parse failure — leave as null, report in kinesis
    }
  }

  return { html: doc, css, js, rawHtml: html, rawCss, rawJs };
}
