import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";

/**
 * CmsBody — renders Markdown content from cms_content.body_md (and other
 * markdown fields) with a hardened sanitization schema.
 *
 * Disallowed elements: iframe, script, style, link, form, input, object,
 * embed, base, meta. External links open in a new tab with rel noopener
 * noreferrer.
 *
 * Styling uses Tailwind Typography (`prose prose-stone max-w-none`).
 *
 * First production consumer (PART 2.10+): the long-form body field on the
 * /press detail pages. Until those land, this component is only used for
 * preview rendering inside admin edit dialogs.
 */

const FORBIDDEN_TAGS = new Set([
  "iframe",
  "script",
  "style",
  "link",
  "form",
  "input",
  "object",
  "embed",
  "base",
  "meta",
  "textarea",
  "button",
]);

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames || []).filter((t) => !FORBIDDEN_TAGS.has(t)),
  attributes: {
    ...(defaultSchema.attributes || {}),
    a: [
      ...((defaultSchema.attributes && defaultSchema.attributes.a) || []),
      ["target"],
      ["rel"],
    ],
  },
  clobberPrefix: "cms-",
};

interface Props {
  markdown: string | null | undefined;
  className?: string;
}

export const CmsBody = ({ markdown, className }: Props) => {
  if (!markdown) return null;
  return (
    <div className={cn("prose prose-stone max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ node, href, children, ...props }) => {
            const isExternal =
              typeof href === "string" && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                {...props}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default CmsBody;