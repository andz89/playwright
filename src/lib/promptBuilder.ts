export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "DK", name: "Danish", flag: "🇩🇰" },
  { code: "NO", name: "Norwegian", flag: "🇳🇴" },
  { code: "PT", name: "Portuguese", flag: "🇵🇹" },
  { code: "IT", name: "Italian", flag: "🇮🇹" },
  { code: "GR", name: "Greek", flag: "🇬🇷" },
  { code: "RO", name: "Romanian", flag: "🇷🇴" },
  { code: "SE", name: "Swedish", flag: "🇸🇪" },
  { code: "ES", name: "Spanish", flag: "🇪🇸" },
  { code: "DE", name: "German", flag: "🇩🇪" },
  { code: "HU", name: "Hungarian", flag: "🇭🇺" },
  { code: "CZ", name: "Czech", flag: "🇨🇿" },
  { code: "NL", name: "Dutch", flag: "🇳🇱" },
  { code: "HR", name: "Croatian", flag: "🇭🇷" },
  { code: "PL", name: "Polish", flag: "🇵🇱" },
];

export interface PromptCheck {
  key: string;
  /** Shown as the checkbox label in the form. */
  label: string;
  /** Instruction line included in the generated prompt when this check is selected. May contain a `{lang}` token. */
  text: string;
  defaultChecked: boolean;
}

export type NoteStyle = "per-item" | "shared-single" | "per-viewport";

export interface PromptFeature {
  /** Selection-state key. */
  id: string;
  /** Static DOM id this app renders on the matching section (see page.tsx / component files). */
  sectionId: string;
  title: string;
  /** Singular noun for one row/card, used in per-item note instructions (e.g. "link", "image"). */
  itemNoun?: string;
  noteStyle: NoteStyle;
  hasSectionNote: boolean;
  checks: PromptCheck[];
}

/**
 * Shared English-language check taxonomy — filename/URL, image/graphic, and
 * visible content — reused across features so their wording and keys stay
 * consistent. Only the keys actually passed in `overrides` are included, so
 * a feature that has no meaningful "filename" concept (e.g. a widget) simply
 * omits that key rather than offering a check that never applies.
 */
function standardTextChecks(overrides: {
  filename?: { label?: string; text: string; defaultChecked?: boolean };
  image?: { label?: string; text: string; defaultChecked?: boolean };
  content?: { label?: string; text: string; defaultChecked?: boolean };
}): PromptCheck[] {
  const checks: PromptCheck[] = [];
  if (overrides.filename) {
    checks.push({
      key: "filenameEnglish",
      label: overrides.filename.label ?? "EN text in filename",
      text: overrides.filename.text,
      defaultChecked: overrides.filename.defaultChecked ?? false,
    });
  }
  if (overrides.image) {
    checks.push({
      key: "imageEnglish",
      label: overrides.image.label ?? "EN text in image",
      text: overrides.image.text,
      defaultChecked: overrides.image.defaultChecked ?? false,
    });
  }
  if (overrides.content) {
    checks.push({
      key: "contentEnglish",
      label: overrides.content.label ?? "EN text in content",
      text: overrides.content.text,
      defaultChecked: overrides.content.defaultChecked ?? false,
    });
  }
  return checks;
}

export const PROMPT_FEATURES: PromptFeature[] = [
  {
    id: "links",
    sectionId: "links",
    title: "Links",
    itemNoun: "link",
    noteStyle: "per-item",
    hasSectionNote: true,
    checks: [
      {
        key: "counts",
        label: "Total link count & broken-link count",
        text: "Report the total links found and the broken link count.",
        defaultChecked: true,
      },
      ...standardTextChecks({
        filename: {
          label: "EN in URL (e.g. /en/)",
          text: "Check the URL path specifically for an English locale/language path segment, e.g. /en/ or /en-us/ (example: example.com/en/page). Flag the link only if that specific locale segment is present — this check is not about English words elsewhere in the slug, only that exact kind of language-path segment.",
          defaultChecked: true,
        },
      }),
    ],
  },
  {
    id: "videos",
    sectionId: "videos",
    title: "Videos",
    itemNoun: "video",
    noteStyle: "per-item",
    hasSectionNote: true,
    checks: [
      {
        key: "status",
        label: "Video status (broken/working)",
        text: "Report only whether each video URL is reachable/working or broken (status code). This specific check is presence/status only, not a language check.",
        defaultChecked: true,
      },
    ],
  },
  {
    id: "canonical",
    sectionId: "canonical-link",
    title: "Source URL & Canonical URL",
    noteStyle: "shared-single",
    hasSectionNote: false,
    checks: [
      {
        key: "differs",
        label: "Canonical differs unexpectedly from Source URL",
        text: "Flag if the Canonical URL differs unexpectedly from the Source URL.",
        defaultChecked: false,
      },
    ],
  },
  {
    id: "meta",
    sectionId: "page-meta",
    title: "Page Title, Description & Meta",
    noteStyle: "shared-single",
    hasSectionNote: false,
    checks: [
      {
        key: "htmlLang",
        label: "<html lang> matches the expected language",
        text: 'Confirm the page\'s <html lang="..."> attribute matches the expected {lang} language code, not "en" or another mismatched code.',
        defaultChecked: true,
      },
      ...standardTextChecks({
        content: {
          label: "EN text in title/description",
          text: "Check the page <title> and meta description for English words or phrases; confirm both are in {lang}.",
          defaultChecked: true,
        },
      }),
      {
        key: "otherMeta",
        label: "Other meta tags (og:*, twitter:*, etc.) in target language",
        text: "Check any other visible meta content shown (e.g. og:title, og:description, twitter:title, twitter:description) for English words; confirm they're in {lang}.",
        defaultChecked: false,
      },
    ],
  },
  {
    id: "featured-images",
    sectionId: "featured-images",
    title: "Featured Image",
    itemNoun: "featured image",
    noteStyle: "per-item",
    hasSectionNote: true,
    checks: [
      ...standardTextChecks({
        image: {
          text: "Text-on-graphic check — inspect for embedded text; confirm it's in {lang}; quote and flag any English or unusual text found.",
          defaultChecked: true,
        },
      }),
    ],
  },
  {
    id: "page-images",
    sectionId: "page-images",
    title: "Page Images",
    itemNoun: "image",
    noteStyle: "per-item",
    hasSectionNote: true,
    checks: [
      {
        key: "count",
        label: "Total image count retrieved",
        text: "Report the total image count retrieved.",
        defaultChecked: true,
      },
      ...standardTextChecks({
        image: {
          text: "Text-on-graphic check — inspect embedded text in each image; confirm {lang}; quote and flag any English or unusual text.",
          defaultChecked: true,
        },
      }),
    ],
  },
  {
    id: "screenshots",
    sectionId: "screenshots",
    title: "Screenshots — Responsive Viewport Analysis (Desktop, Tablet, Mobile)",
    noteStyle: "per-viewport",
    hasSectionNote: false,
    checks: [
      {
        key: "genStatus",
        label: "Screenshot generation status per viewport",
        text: "Report the status of full-page screenshot generation for that viewport.",
        defaultChecked: true,
      },
      {
        key: "textEnglish",
        label: "EN text anywhere in the screenshot",
        text: 'Text check — read every piece of visible text rendered in the screenshot (headings, body copy, buttons, form labels, navigation, footer, captions). Every one of those strings must be in {lang}. Explicitly check for the presence of any English-language word or phrase; if you find one, quote it exactly and note where in the screenshot it appeared. Also flag mixed-language strings, placeholder/lorem-ipsum text, or obvious rendering issues the same way.',
        defaultChecked: true,
      },
      {
        key: "imageEnglish",
        label: 'EN text on graphics/images (uses "graphic are in target language" wording when clean)',
        text: 'Graphics check — separately from the text check above, inspect every image, banner, icon, or other graphic embedded in the screenshot for text baked into the graphic itself. Explicitly check for the presence of any English-language text on a graphic. If you find English text on a graphic, quote it exactly and note which graphic and where in the screenshot it appeared. If, after checking, no graphic contains English text and every graphic\'s text is in {lang} (or no graphic contains any text at all), write exactly this phrase for that finding instead of the generic "CORRECT" wording: graphic are in target language "{lang}" (substitute the actual language code, e.g. graphic are in target language "PL").',
        defaultChecked: true,
      },
    ],
  },
  {
    id: "widgets",
    sectionId: "hyvor-talk",
    title: "Widgets & Integrations",
    itemNoun: "check",
    noteStyle: "per-item",
    hasSectionNote: true,
    checks: [
      {
        key: "status",
        label: "Third-party widget / integration status",
        text: "Report only whether the Hyvor Talk widget (or other configured third-party integration) is present/active on the page, its properties if shown, and any integration warnings. This specific check is presence/status only, not a language check.",
        defaultChecked: true,
      },
      ...standardTextChecks({
        image: {
          text: "Inspect the widget's screenshot (if captured) for embedded text; confirm it's in {lang}; quote and flag any English or unusual text found.",
          defaultChecked: true,
        },
      }),
    ],
  },
];

export interface FeatureSelection {
  included: boolean;
  checks: Record<string, boolean>;
}

export interface PromptSelection {
  targetLanguage: string;
  features: Record<string, FeatureSelection>;
}

export function defaultPromptSelection(): PromptSelection {
  const features: Record<string, FeatureSelection> = {};
  for (const feature of PROMPT_FEATURES) {
    features[feature.id] = {
      included: true,
      checks: Object.fromEntries(
        feature.checks.map((check) => [check.key, check.defaultChecked]),
      ),
    };
  }
  return { targetLanguage: "", features };
}

function fillLang(text: string, lang: string): string {
  return text.replace(/\{lang\}/g, lang);
}

/**
 * Builds a self-contained checklist prompt (in the style of a QA report spec)
 * for an AI assistant with access to the current browser tab — e.g. Claude's
 * Chrome extension — to fill in directly. Every generated section references
 * this app's own static section `id`s (see page.tsx / component files) so
 * the assistant knows exactly which part of the DOM each instruction applies
 * to, and always keeps the `<textarea name="ai-note">` fill-in rules, since
 * those are structural to the report format rather than optional checks.
 */
export function buildPrompt(selection: PromptSelection): string {
  const lang = selection.targetLanguage.trim() || "the target page language";
  const activeFeatures = PROMPT_FEATURES.filter(
    (feature) => selection.features[feature.id]?.included,
  );

  const lines: string[] = [];

  lines.push("Web Scraper Summary Report — Prompt (Checklist Format)");
  lines.push("");
  lines.push(
    "Perform a concise, technical Web Scraper Summary Report for the web page open in the current browser tab — by editing the page itself, not by writing a report in chat.",
  );
  lines.push("");
  lines.push(
    'ACTION REQUIRED — this is a live editing task, not a written report: you have direct access to this browser tab. For every textarea[name="ai-note"] referenced below, actually click into that exact field on the live page and type your finding into it, replacing any existing text there. Do not summarize your findings in chat instead of doing this, and do not stop until every note field described below has been filled in on the page. Only reply in chat with a short confirmation of what you filled in and any fields you could not reach.',
  );
  lines.push("");
  lines.push(
    `PRIMARY GOAL: Verify the page's content is in ${lang}, free of unintended English-language leakage. This explains WHY the checks below exist — it does not, on its own, add any check beyond what's explicitly listed under each section.`,
  );
  lines.push("");
  lines.push(
    "SCOPE RULE — do not go beyond what's listed: perform only the specific checks explicitly listed under each numbered section below, exactly as worded there. If a section's list does not include an English-content check (for example, a section where only a structural check like \"Canonical differs from Source URL\" is listed), do not look for or flag English text in that section at all, even though the Primary Goal is about English-language content overall.",
  );
  lines.push("");
  lines.push(
    'HIGHLIGHTING RULE (applies wherever an English-content check is listed for that section): Any English text, English-language URL/filename, or English wording found inside an image/graphic must be flagged immediately in that item\'s note using: [exact text/URL found]. Also apply this to any other unusual content, broken layout, or unexpected foreign-domain link the specific check calls for.',
  );
  lines.push("");
  lines.push(
    'NOTE FIELD RULE — no textarea[name="ai-note"] on the page is ever left blank. Every AI note is a real <textarea name="ai-note"> element already rendered on the page; click into it and type there. If the row/item is perfect — no English text found, no English text on any graphic, nothing else flagged — type exactly "CORRECT" (all caps, nothing else) into it; the field turns green automatically. If anything was flagged, type the observation there instead (what was found, where, why it\'s flagged); the field turns red automatically. A check that ran gets one of these two outcomes typed into its note; a section that is absent from the current tab (its id is not present in the DOM) is skipped entirely — do not invent a note field for it.',
  );
  lines.push("");
  lines.push(
    'FORMATTING RULE — every note must be easy to scan, not a dense paragraph. A "CORRECT" note is always just that single word. A flagged note with only one finding is a single short line. A flagged note with more than one finding must break each finding onto its own line, numbered (1., 2., 3., ...) in the order they were found — never comma-splice multiple findings into one run-on sentence.',
  );
  lines.push("");

  if (activeFeatures.length > 0) {
    lines.push(
      'Every textarea[name="ai-note"] on the page shares that same name attribute, so don\'t rely on the name alone to tell them apart — each one also has its own unique id attribute, and its position in the DOM (which row/card it sits inside, or whether it sits above a group of fields) is what tells you which finding belongs in it. Textarea placement for the sections below:',
    );
    for (const feature of activeFeatures) {
      if (feature.noteStyle === "per-item") {
        lines.push(
          `- ${feature.title}: one <textarea name="ai-note"> inside each ${feature.itemNoun}'s own row/card, plus one shared <textarea name="ai-note"> below the section as a rollup.`,
        );
      } else if (feature.noteStyle === "per-viewport") {
        lines.push(
          `- ${feature.title}: one <textarea name="ai-note"> positioned directly above each viewport screenshot.`,
        );
      } else {
        lines.push(
          `- ${feature.title}: one shared <textarea name="ai-note"> positioned above the fields, covering the combined finding.`,
        );
      }
    }
    lines.push("");
  }

  activeFeatures.forEach((feature, index) => {
    const checkState = selection.features[feature.id]?.checks ?? {};
    const selectedChecks = feature.checks.filter((check) => checkState[check.key]);

    lines.push(`${index + 1}. ${feature.title}`);
    lines.push("");
    lines.push(
      `Locate this section in the current tab via the element with id="${feature.sectionId}".`,
    );
    lines.push("");

    if (feature.id === "screenshots") {
      lines.push(
        'VIEW MODE REQUIRED — before performing any check below, click the "Stacked" layout toggle button inside this section (it sits next to the "Tabs" button; do not leave it on "Tabs"). In "Tabs" mode only the currently active device\'s screenshot exists in the DOM, so the other two are invisible to you. "Stacked" mode renders all three viewport screenshots (Desktop, Tablet, Mobile) in the DOM at the same time, which is required so you can check every viewport.',
      );
      lines.push("");
    }

    if (selectedChecks.length > 0) {
      for (const check of selectedChecks) {
        lines.push(`- ${fillLang(check.text, lang)}`);
      }
    } else {
      lines.push("- (No specific checks selected — just fill in the note field(s) for this section.)");
    }
    lines.push("");

    if (feature.noteStyle === "per-item") {
      lines.push(
        `Render every ${feature.itemNoun} found with its own <textarea name="ai-note"> holding that item's finding only.`,
      );
    } else if (feature.noteStyle === "per-viewport") {
      lines.push(
        'Place a <textarea name="ai-note"> directly above each viewport screenshot (Desktop / Tablet / Mobile) holding that viewport\'s finding only.',
      );
    } else {
      lines.push(
        'Write the combined finding in the shared <textarea name="ai-note"> for this section — exactly "CORRECT" (all caps) if clean, or the specific flagged text/URL if not.',
      );
    }

    if (feature.hasSectionNote) {
      lines.push(
        `Section note (<textarea name="ai-note"> below the ${feature.title} group): a rollup for the whole section.`,
      );
    }
    lines.push("");
  });

  lines.push("Output Format");
  lines.push("");
  lines.push(
    'Every note lives directly on the page as an actual <textarea name="ai-note"> element — filling in the report means typing into those existing fields per the placement rules above, not producing separate text output. When finished, reply in chat with a short confirmation (e.g. "Filled in N of M note fields") and call out anything you flagged or could not access.',
  );

  return lines.join("\n");
}
