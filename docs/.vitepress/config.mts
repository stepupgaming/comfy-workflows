import { defineConfig } from "vitepress";

const github = "https://github.com/stepupgaming/comfy-workflows";

// Project Pages deployment lives at /comfy-workflows/ — every absolute asset
// path below must carry that prefix (VitePress does not prepend `base` in
// head links).
export default defineConfig({
  lang: "en-US",
  title: "Comfy Workflows",
  description:
    "Code-first, typed, composable workflows for ComfyUI — authoring, import, Graph IR, deterministic compile, packaging, distribution.",
  base: "/comfy-workflows/",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/comfy-workflows/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#14161b" }],
    ["meta", { property: "og:title", content: "Comfy Workflows" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Code-first, typed, composable workflows for ComfyUI — author, compose, publish, compile, run.",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
  ],

  themeConfig: {
    logo: "/comfy-workflows/favicon.svg",
    siteTitle: "Comfy Workflows",
    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Packages", link: "/guide/packages", activeMatch: "/guide/packages" },
      { text: "Custom nodes", link: "/guide/custom-nodes" },
      { text: "Convert a workflow", link: "/guide/convert-workflow" },
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
            { text: "Convert a workflow into a package", link: "/guide/convert-workflow" },
            { text: "Authoring workflows", link: "/guide/authoring" },
            { text: "Workflow packages", link: "/guide/packages" },
            { text: "Custom-node dependencies", link: "/guide/custom-nodes" },
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
            { text: "comfy.workflow.json", link: "/reference/workflow-manifest" },
          ],
        },
      ],
      "/examples/": [
        {
          text: "Guide",
          items: [
            { text: "Example: text → image", link: "/examples/t2i" },
            { text: "Workflow packages", link: "/guide/packages" },
          ],
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
      message: "Released under the MIT License. Unofficial project — not affiliated with or endorsed by Comfy Org.",
      copyright: "Comfy Workflows contributors",
    },
    outline: [2, 3],
  },
});
