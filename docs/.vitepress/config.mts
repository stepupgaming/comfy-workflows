import { defineConfig } from "vitepress";
import { CORE_VERSION } from "./version";

const github = "https://github.com/stepupgaming/comfy-workflows";
const site = "https://stepupgaming.github.io/comfy-workflows/";

export default defineConfig({
  lang: "en-US",
  title: "Comfy Workflows",
  description:
    "Code-first, typed, composable workflows for ComfyUI. Author in TypeScript, compile to Graph IR, run anywhere Comfy runs.",
  base: "/comfy-workflows/",
  lastUpdated: true,
  ignoreDeadLinks: false,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/comfy-workflows/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#14161b" }],
    ["meta", { property: "og:title", content: "Comfy Workflows" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Code-first, typed, composable workflows for ComfyUI.",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:url", content: site }],
  ],

  themeConfig: {
    logo: "/comfy-workflows/favicon.svg",
    siteTitle: "Comfy Workflows",
    search: {
      provider: "local",
      options: {
        detailedView: true,
        miniSearch: {
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: {
              title: 4,
              text: 2,
              titles: 3,
            },
          },
        },
      },
    },
    nav: [
      { text: "Start", link: "/start/what-is", activeMatch: "/start/" },
      { text: "Code-first", link: "/code/quickstart", activeMatch: "/code/" },
      { text: "Migrate", link: "/migrate/import", activeMatch: "/migrate/" },
      { text: "Product", link: "/product/architecture", activeMatch: "/product/" },
      { text: "Reference", link: "/reference/api/", activeMatch: "/reference/" },
      { text: `v${CORE_VERSION}`, items: [
        { text: "Changelog / roadmap", link: "/project/roadmap" },
        { text: "GitHub", link: github },
        { text: "Releases", link: `${github}/releases` },
        { text: "npm mirror", link: "https://www.npmjs.com/package/@stepupgaming/comfy-workflows" },
      ]},
    ],
    sidebar: {
      "/start/": sidebarStart(),
      "/migrate/": sidebarMigrate(),
      "/code/": sidebarCode(),
      "/product/": sidebarProduct(),
      "/concepts/": sidebarConcepts(),
      "/guide/": sidebarGuides(),
      "/examples/": sidebarExamples(),
      "/reference/": sidebarReference(),
      "/project/": sidebarProject(),
    },
    socialLinks: [{ icon: "github", link: github }],
    editLink: {
      pattern: `${github}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    footer: {
      message:
        "Released under the MIT License. Unofficial project. Not affiliated with or endorsed by Comfy Org.",
      copyright: "Comfy Workflows contributors",
    },
    outline: [2, 3],
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});

function sidebarStart() {
  return [
    {
      text: "Start here",
      items: [
        { text: "What is Comfy Workflows?", link: "/start/what-is" },
        { text: "Choose your path", link: "/start/choose-your-path" },
        { text: "Installation", link: "/start/install" },
        { text: "5-minute quickstart", link: "/start/quickstart" },
        { text: "What do I edit?", link: "/start/what-do-i-edit" },
      ],
    },
    {
      text: "Next",
      items: [
        { text: "Build as code", link: "/code/quickstart" },
        { text: "Convert a workflow", link: "/migrate/import" },
        { text: "Product integration", link: "/product/architecture" },
      ],
    },
  ];
}

function sidebarMigrate() {
  return [
    {
      text: "Migrate an existing workflow",
      items: [
        { text: "Import workflow JSON", link: "/migrate/import" },
        { text: "Generated files", link: "/migrate/generated-files" },
        { text: "Parameterize it", link: "/migrate/parameterize" },
        { text: "Custom nodes", link: "/migrate/custom-nodes" },
        { text: "Package and publish", link: "/migrate/package" },
        { text: "Import round-trip", link: "/migrate/round-trip" },
      ],
    },
  ];
}

function sidebarCode() {
  return [
    {
      text: "Build workflows as code",
      items: [
        { text: "Code-first quickstart", link: "/code/quickstart" },
        { text: "Connect to Comfy", link: "/code/connect" },
        { text: "Snapshot an environment", link: "/code/snapshot" },
        { text: "Generate typed nodes", link: "/code/codegen" },
        { text: "Build a graph", link: "/code/build-a-graph" },
        { text: "Parameters and templates", link: "/code/parameters" },
        { text: "Connections and outputs", link: "/code/connections" },
        { text: "Composition", link: "/code/composition" },
        { text: "Recipes", link: "/code/recipes" },
        { text: "Escape hatches", link: "/code/escape-hatches" },
        { text: "Compile and validate", link: "/code/compile" },
        { text: "Run", link: "/code/run" },
      ],
    },
  ];
}

function sidebarProduct() {
  return [
    {
      text: "Build a product",
      items: [
        { text: "Production architecture", link: "/product/architecture" },
        { text: "Build-time vs runtime", link: "/product/build-time-vs-runtime" },
        { text: "Multiple environments", link: "/product/environments" },
        { text: "Generated artifacts", link: "/product/artifacts" },
        { text: "Environment locks", link: "/product/locks" },
        { text: "Runtime integration", link: "/product/runtime" },
        { text: "CI / drift gates", link: "/product/ci" },
        { text: "Package distribution", link: "/product/distribution" },
        { text: "First-party packages", link: "/product/packages" },
        { text: "Custom-node setup", link: "/product/setup" },
        { text: "Security model", link: "/product/security" },
        { text: "Case study", link: "/product/case-study" },
      ],
    },
  ];
}

function sidebarConcepts() {
  return [
    {
      text: "Concepts",
      items: [
        { text: "Mental model", link: "/concepts/mental-model" },
        { text: "Graph IR", link: "/concepts/graph-ir" },
        { text: "Node definitions", link: "/concepts/node-defs" },
        { text: "Slots and connections", link: "/concepts/slots" },
        { text: "Templates / ParamRef", link: "/concepts/templates" },
        { text: "Determinism", link: "/concepts/determinism" },
        { text: "Lossless integers", link: "/concepts/lossless-integers" },
        { text: "Bypass and mute", link: "/concepts/bypass" },
        { text: "Packages", link: "/concepts/packages" },
        { text: "Environments", link: "/concepts/environments" },
        { text: "No second compiler", link: "/concepts/no-second-compiler" },
      ],
    },
  ];
}

function sidebarGuides() {
  return [
    {
      text: "Guides",
      items: [
        { text: "Custom nodes", link: "/guide/custom-nodes" },
        { text: "Errors and debugging", link: "/guide/errors" },
        { text: "Asset handling", link: "/guide/assets" },
        { text: "Reproducible runs", link: "/guide/reproducible-runs" },
        { text: "Updating Comfy", link: "/guide/updating-comfy" },
        { text: "Windows", link: "/guide/windows" },
        { text: "Models", link: "/guide/models" },
        { text: "Agent-friendly CLI", link: "/guide/agents" },
        { text: "Custom node development vs consumption", link: "/guide/consume-vs-author-nodes" },
      ],
    },
  ];
}

function sidebarExamples() {
  return [
    {
      text: "Examples",
      items: [
        { text: "Text to image", link: "/examples/text-to-image" },
        { text: "Typed custom nodes", link: "/examples/typed-nodes" },
        { text: "Parameterized template", link: "/examples/template" },
        { text: "Import existing workflow", link: "/examples/import" },
        { text: "Custom-node / video graph", link: "/examples/custom-node" },
        { text: "Generated node SDK", link: "/examples/codegen" },
        { text: "Composition and recipes", link: "/examples/composition" },
        { text: "Package and run", link: "/examples/package-run" },
        { text: "Multi-environment project", link: "/examples/multi-environment" },
        { text: "Product build-time integration", link: "/examples/product-integration" },
      ],
    },
  ];
}

function sidebarReference() {
  return [
    {
      text: "Reference",
      items: [
        { text: "Public API", link: "/reference/api/" },
        { text: "Graph API", link: "/reference/api/graph" },
        { text: "Node SDK", link: "/reference/api/nodes" },
        { text: "IR API", link: "/reference/api/ir" },
        { text: "Runtime API", link: "/reference/api/runtime" },
        { text: "Workflow package API", link: "/reference/api/wfpack" },
        { text: "Dependency / setup API", link: "/reference/api/deps" },
        { text: "Recipes", link: "/reference/recipes" },
        { text: "Manifest", link: "/reference/manifest" },
        { text: "CLI", link: "/reference/cli" },
        { text: "Error codes", link: "/reference/errors" },
        { text: "Schema", link: "/reference/schema" },
        { text: "Node catalog", link: "/reference/node-catalog" },
      ],
    },
  ];
}

function sidebarProject() {
  return [
    {
      text: "Project",
      items: [
        { text: "Architecture", link: "/project/architecture" },
        { text: "Security", link: "/project/security" },
        { text: "Compatibility", link: "/project/compatibility" },
        { text: "Roadmap", link: "/project/roadmap" },
      ],
    },
  ];
}
