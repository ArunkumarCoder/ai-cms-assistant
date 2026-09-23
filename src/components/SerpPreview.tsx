const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

interface SerpPreviewProps {
  title: string;
  metaDescription: string;
  slug: string;
}

// Deliberately not zinc/dark-mode-themed like the rest of the app — this is
// emulating an external, always-light surface (a Google result), so it stays
// legible and recognizable regardless of the app's own theme.
//
// The URL line uses a placeholder domain: no Site.url/domain field exists
// anywhere in this codebase yet (Site only has sanityProjectId/dataset or a
// wordpressUrl), so there's nothing real to show here today.
export function SerpPreview({ title, metaDescription, slug }: SerpPreviewProps) {
  const trimmedTitle = title.trim();
  const trimmedDescription = metaDescription.trim();

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="truncate text-sm text-zinc-700">example.com › {slug || "your-page"}</p>
      {trimmedTitle ? (
        <p className="mt-1 truncate text-xl text-blue-700 hover:underline">
          {truncateAtWord(trimmedTitle, TITLE_MAX)}
        </p>
      ) : (
        <p className="mt-1 text-xl italic text-zinc-400">(no title set)</p>
      )}
      {trimmedDescription ? (
        <p className="mt-1 text-sm text-zinc-600">
          {truncateAtWord(trimmedDescription, DESCRIPTION_MAX)}
        </p>
      ) : (
        <p className="mt-1 text-sm italic text-zinc-400">(no meta description set)</p>
      )}
    </div>
  );
}
