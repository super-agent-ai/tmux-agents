import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ─── Preview Hint Component ─────────────────────────────────────────────────
import { Box, Text } from 'ink';
/**
 * Shows a hint about what's being previewed in the right pane
 */
export function PreviewHint({ previewingAgent, agentRole }) {
    if (!previewingAgent) {
        return null;
    }
    return (_jsxs(Box, { paddingX: 1, paddingY: 0, borderStyle: "round", borderColor: "cyan", marginTop: 1, marginBottom: 1, children: [_jsx(Text, { color: "cyan", children: "\u2192 Previewing: " }), _jsx(Text, { bold: true, children: agentRole || previewingAgent }), _jsx(Text, { dimColor: true, children: " (press 'a' to attach)" })] }));
}
//# sourceMappingURL=PreviewHint.js.map