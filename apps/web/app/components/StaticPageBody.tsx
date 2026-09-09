// Renders an editable static page body (see lib/static-pages.ts) with a tiny, safe convention — no
// raw HTML, so admin-entered content can't inject markup. Blank line = new block; `## ` = heading;
// a run of `- ` lines = bullet list; anything else = paragraph. Inline, `[text](/path)` becomes a
// link — same-site paths only, so these pages can't be turned into an outbound link farm from the
// admin editor. Matches the old hardcoded styling.
import { Fragment } from 'react';
import Link from 'next/link';

const H2_STYLE: React.CSSProperties = { color: 'oklch(0.2 0.04 260)' };

const LINK = /(\[[^\]]+\]\(\/[^)\s]*\))/g;

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(LINK).filter(Boolean).map((part, i) => {
    const m = /^\[([^\]]+)\]\((\/[^)\s]*)\)$/.exec(part);
    if (!m) return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
    return (
      <Link key={`${keyPrefix}-${i}`} href={m[2]!} className="underline" style={{ color: 'oklch(0.48 0.14 260)' }}>
        {m[1]}
      </Link>
    );
  });
}

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
                <li key={j}>{inline(l.trim().slice(2).trim(), `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }

        // Paragraph: join wrapped lines with spaces so hard-wrapped source still flows.
        return (
          <p key={i} className="mb-4">
            {inline(lines.map((l) => l.trim()).join(' '), String(i))}
          </p>
        );
      })}
    </Fragment>
  );
}
