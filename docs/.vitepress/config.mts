import { defineConfig } from "vitepress";

const github = "https://github.com/stepupgaming/comfy-sdk";

// Project Pages deployment lives at /comfy-sdk/ — every absolute asset path
// below must carry that prefix (VitePress does not prepend `base` in head links).
export default defineConfig({
  lang: "en-US",
  title: "comfy-sdk",
  description:
    "TypeScript-first workflows for ComfyUI — typed nodes, Graph IR, deterministic compile, lossless runtime.",
  base: "/comfy-sdk/",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/comfy-sdk/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#14161b" }],
    ["meta", { property: "og:title", content: "comfy-sdk" }],
    [
      "meta",
      {
        property: "og:description",
        content: "TypeScript-first workflows for ComfyUI — typed nodes, Graph IR, deterministic compile.",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
  ],

  ignoreDeadLinks: [
    // README.md is included verbatim on the Guide landing page; its relative
    // links point at repo files, not site pages (architecture lives at
    // /reference/architecture).
    /ARCHITECTURE(\.md)?$/,
  ],

  themeConfig: {
    logo: "/comfy-sdk/favicon.svg",
    siteTitle: "comfy-sdk",
    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Reference", link: "/reference/architecture", activeMatch: "/reference/" },
      { text: "CLI", link: "/guide/cli" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "Examples", link: "/examples/t2i" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Introduction", link: "/guide/" },
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Authoring workflows", link: "/guide/authoring" },
            { text: "Compile & validate", link: "/guide/compile-and-validate" },
            { text: "Runtime & execution", link: "/guide/runtime" },
            { text: "Errors", link: "/guide/errors" },
            { text: "CLI", link: "/guide/cli" },
            { text: "Example: text → image", link: "/examples/t2i" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Architecture", link: "/reference/architecture" },
            { text: "Node catalog", link: "/reference/node-catalog" },
            { text: "Recipes", link: "/reference/recipes" },
          ],
        },
      ],
      "/examples/": [
        {
          text: "Guide",
          items: [{ text: "Example: text → image", link: "/examples/t2i" }],
        },
        {
          text: "Reference",
          items: [{ text: "Architecture", link: "/reference/architecture" }],
        },
      ],
    },
    search: {
      provider: "local",
      options: {
        detailedView: false,
      },
    },
    socialLinks: [{ icon: "github", link: github }],
    editLink: {
      pattern: `${github}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "comfy-sdk contributors",
    },
    outline: [2, 3],
  },
});
