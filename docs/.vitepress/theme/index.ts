import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import EditBadge from "./components/EditBadge.vue";
import Flow from "./components/Flow.vue";
import MarkdownSourceLink from "./components/MarkdownSourceLink.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "doc-before": () => h(MarkdownSourceLink),
    });
  },
  enhanceApp({ app }) {
    app.component("EditBadge", EditBadge);
    app.component("Flow", Flow);
  },
} satisfies Theme;
