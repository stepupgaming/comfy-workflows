import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import EditBadge from "./components/EditBadge.vue";
import Flow from "./components/Flow.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("EditBadge", EditBadge);
    app.component("Flow", Flow);
  },
} satisfies Theme;
