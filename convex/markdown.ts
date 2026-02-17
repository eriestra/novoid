/**
 * HTML-to-Markdown converter for agent content negotiation.
 * Self-contained, no npm deps — runs inside Convex httpAction.
 */

interface ConvertOptions {
  slug: string;
  url: string;
  title?: string;
  browserSchema?: string; // raw JSON from novoid-browser
  nousReport?: string;    // raw JSON from nous
}

export function htmlToMarkdown(html: string, opts: ConvertOptions): string {
  // Extract title from <title> tag before stripping head
  let title = opts.title;
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) title = decodeEntities(titleMatch[1].trim());
  }

  // Strip script, style, HTML comments, and <head> block
  let md = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[\s\S]*?<\/style>/gi, "");
  md = md.replace(/<!--[\s\S]*?-->/g, "");
  md = md.replace(/<head[\s\S]*?<\/head>/gi, "");

  // Pre blocks → fenced code (before other processing)
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => {
    return "\n```\n" + decodeEntities(stripTags(code)) + "\n```\n";
  });
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return "\n```\n" + decodeEntities(stripTags(code)) + "\n```\n";
  });

  // Tables
  md = md.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    return convertTable(table);
  });

  // Headings
  for (let i = 6; i >= 1; i--) {
    const re = new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, "gi");
    md = md.replace(re, (_, text) => "\n" + "#".repeat(i) + " " + inlineMarkdown(text).trim() + "\n");
  }

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => "\n" + inlineMarkdown(text).trim() + "\n");

  // Lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, items) => {
    return "\n" + convertListItems(items, "- ") + "\n";
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, items) => {
    return "\n" + convertListItems(items, "1. ") + "\n";
  });

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

  // Apply inline formatting
  md = inlineMarkdown(md);

  // Strip remaining HTML tags
  md = stripTags(md);

  // Decode HTML entities
  md = decodeEntities(md);

  // Clean up whitespace: collapse 3+ newlines to 2
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  // Build frontmatter
  const frontmatter = [
    "---",
    `title: ${title || opts.slug}`,
    `slug: ${opts.slug}`,
    `url: ${opts.url}`,
    "---",
    "",
  ].join("\n");

  // Append rich schema sections from verification data
  const schemaSections = renderSchemas(opts);
  if (schemaSections) {
    md += "\n\n" + schemaSections;
  }

  return frontmatter + md + "\n";
}

/** Render novoid-browser + nous data as structured markdown sections */
function renderSchemas(opts: ConvertOptions): string {
  const sections: string[] = [];

  // ─── novoid-browser schema ─────────────────────────────
  if (opts.browserSchema) {
    try {
      const b = JSON.parse(opts.browserSchema);
      const state = b.state || {};
      const actions = b.actions || [];
      const entities = b.entities || {};
      const nav = b.navigation || [];
      const components = b.components || [];
      const convex = b.convex;

      // Signals
      const signals = Object.entries(state).filter(([k]) => k.startsWith("signal_"));
      if (signals.length > 0) {
        const rows = signals.map(([id, val]) =>
          `| ${id} | \`${JSON.stringify(val)}\` |`
        );
        sections.push(
          "## Signals\n\n| ID | Value |\n| --- | --- |\n" + rows.join("\n")
        );
      }

      // Stores
      const stores = Object.entries(state).filter(([k]) => k.startsWith("store_"));
      if (stores.length > 0) {
        const storeSections = stores.map(([id, val]) => {
          const storeActions = actions
            .filter((a: { source: string }) => a.source === id)
            .map((a: { name: string }) => `\`${a.name}\``);
          const entityKey = Object.keys(entities).find((k) => k.startsWith(id + "."));
          const entity = entityKey ? entities[entityKey] : null;

          let s = `### ${id}\n`;
          if (storeActions.length > 0) s += `**Actions:** ${storeActions.join(", ")}\n`;
          if (entity && entity.schema) {
            s += `**Schema:** \`${JSON.stringify(entity.schema)}\`\n`;
            s += `**Count:** ${entity.count}\n`;
          }
          s += `**State:** \`${JSON.stringify(val)}\``;
          return s;
        });
        sections.push("## Stores\n\n" + storeSections.join("\n\n"));
      }

      // Actions (not store-bound)
      const unboundActions = actions.filter(
        (a: { source: string }) => !a.source.startsWith("store_")
      );
      if (unboundActions.length > 0) {
        const rows = unboundActions.map(
          (a: { name: string; source: string }) => `- \`${a.name}\` (${a.source})`
        );
        sections.push("## Actions\n\n" + rows.join("\n"));
      }

      // Components
      if (components.length > 0) {
        sections.push("## Components\n\n" + components.map((c: string) => `- ${c}`).join("\n"));
      }

      // Routes
      if (nav.length > 0) {
        const rows = nav.map(
          (r: { path: string; hasGuard: boolean }) =>
            `- \`${r.path}\`${r.hasGuard ? " (guarded)" : ""}`
        );
        sections.push("## Routes\n\n" + rows.join("\n"));
      }

      // Convex integration
      if (convex) {
        const subs = convex.subscriptions || [];
        const muts = convex.mutations || [];
        const acts = convex.actions || [];
        if (subs.length + muts.length + acts.length > 0) {
          const lines: string[] = [];
          if (subs.length > 0)
            lines.push("**Queries:** " + subs.map((s: { ref: string }) => `\`${s.ref}\``).join(", "));
          if (muts.length > 0)
            lines.push("**Mutations:** " + muts.map((m: { ref: string }) => `\`${m.ref}\``).join(", "));
          if (acts.length > 0)
            lines.push("**Actions:** " + acts.map((a: { ref: string }) => `\`${a.ref}\``).join(", "));
          sections.push("## Convex\n\n" + lines.join("\n"));
        }
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  // ─── Nous proof report ─────────────────────────────────
  if (opts.nousReport) {
    try {
      const n = JSON.parse(opts.nousReport);
      const lines: string[] = [];
      lines.push(`**Verdict:** ${n.verdict || "?"}`);

      const m = n.morphe;
      if (m) {
        lines.push(`**Structure:** ${m.node_count || 0} nodes, ${m.contracts_passed || 0}/${m.contracts_checked || 0} contracts`);
        const acc = m.accessibility;
        if (acc) {
          const checks = [];
          if (acc.all_inputs_labeled !== undefined) checks.push(`inputs labeled: ${acc.all_inputs_labeled ? "yes" : "NO"}`);
          if (acc.tab_order_complete !== undefined) checks.push(`tab order: ${acc.tab_order_complete ? "complete" : "BROKEN"}`);
          if (acc.landmark_structure) checks.push(`landmarks: ${acc.landmark_structure}`);
          if (checks.length > 0) lines.push(`**Accessibility:** ${checks.join(", ")}`);
        }
      }

      const t = n.thesis;
      if (t) {
        const parts = [];
        if (t.breakpoints && t.breakpoints.length > 0)
          parts.push(`breakpoints: ${t.breakpoints.join(", ")}px`);
        if (t.cascade_conflicts) parts.push(`${t.cascade_conflicts} cascade conflicts`);
        if (t.overflow_risks && t.overflow_risks.length > 0)
          parts.push(`overflow: ${t.overflow_risks.join(", ")}`);
        if (parts.length > 0) lines.push(`**Responsive:** ${parts.join(", ")}`);
        else if (t.feasible) lines.push("**Responsive:** feasible across viewport range");
      }

      const k = n.kinesis;
      if (k) {
        const parts = [];
        if (k.signals) parts.push(`${k.signals} signals`);
        if (k.effects) parts.push(`${k.effects} effects`);
        if (k.cycles) parts.push(`${k.cycles} CYCLES`);
        if (k.dead_signals && k.dead_signals.length > 0) parts.push(`dead: ${k.dead_signals.join(", ")}`);
        if (k.taint_violations && k.taint_violations.length > 0) parts.push(`TAINT: ${k.taint_violations.join(", ")}`);
        if (parts.length > 0) lines.push(`**Behavior:** ${parts.join(", ")}`);
      }

      sections.push("## Proof (Nous)\n\n" + lines.join("\n"));
    } catch {
      // Invalid JSON — skip
    }
  }

  return sections.join("\n\n");
}

function inlineMarkdown(html: string): string {
  // Images (before links so ![alt](src) inside <a> is handled)
  html = html.replace(/<img[^>]*\balt=["']([^"']*)["'][^>]*\bsrc=["']([^"']*)["'][^>]*\/?>/gi, "![$1]($2)");
  html = html.replace(/<img[^>]*\bsrc=["']([^"']*)["'][^>]*\balt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  html = html.replace(/<img[^>]*\bsrc=["']([^"']*)["'][^>]*\/?>/gi, "![]($1)");

  // Links
  html = html.replace(/<a[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Bold
  html = html.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**");

  // Italic
  html = html.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*");

  // Inline code
  html = html.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  return html;
}

function convertListItems(html: string, prefix: string): string {
  const items: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    items.push(prefix + stripTags(inlineMarkdown(match[1])).trim());
  }
  return items.join("\n");
}

function convertTable(html: string): string {
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(inlineMarkdown(cellMatch[1])).trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const padded = rows[i].concat(Array(colCount - rows[i].length).fill(""));
    lines.push("| " + padded.join(" | ") + " |");
    if (i === 0) {
      lines.push("| " + padded.map(() => "---").join(" | ") + " |");
    }
  }
  return "\n" + lines.join("\n") + "\n";
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
