// Pure helper shared by the AI drafting service and the asset editor:
// derives the HTML body from plain text so operators write text-first.
// Blank-line-separated blocks become <p>; single newlines become <br>.
export function textToHtmlBody(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(paragraph => `<p>${paragraph.trim().replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}
