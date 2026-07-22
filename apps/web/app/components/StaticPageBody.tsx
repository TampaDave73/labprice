// Renders an editable static page body (see lib/static-pages.ts) with a tiny, safe convention — no
// raw HTML, so admin-entered content can't inject markup. Blank line = new block; `## ` = heading;
// a run of `- ` lines = bullet list; anything else = paragraph. Matches the old hardcoded styling.
import { Fragment } from 'react';

const H2_STYLE: React.CSSProperties = { color: 'oklch(0.2 0.04 260)' };

export default function StaticPageBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  return (
    <Fragment>
      {blocks.map((block, i) => {
        if (block.startsWith('## ')) {
          return (
            <h2 key={i} className="text-xl font-bold mt-8 mb-3" style={H2_STYLE}>
              {block.slice(3).trim()}
            </h2>
          );
        }

        const lines = block.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return (
            <ul key={i} className="list-disc pl-6 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lines.map((l, j) => (
                <li key={j}>{l.trim().slice(2).trim()}</li>
              ))}
            </ul>
          );
        }

        // Paragraph: join wrapped lines with spaces so hard-wrapped source still flows.
        return (
          <p key={i} className="mb-4">
            {lines.map((l) => l.trim()).join(' ')}
          </p>
        );
      })}
    </Fragment>
  );
}
