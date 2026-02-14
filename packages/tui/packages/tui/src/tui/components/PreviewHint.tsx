// ─── Preview Hint Component ─────────────────────────────────────────────────

import { Box, Text } from 'ink';

interface PreviewHintProps {
  previewingAgent?: string;
  agentRole?: string;
}

/**
 * Shows a hint about what's being previewed in the right pane
 */
export function PreviewHint({ previewingAgent, agentRole }: PreviewHintProps) {
  if (!previewingAgent) {
    return null;
  }

  return (
    <Box
      paddingX={1}
      paddingY={0}
      borderStyle="round"
      borderColor="cyan"
      marginTop={1}
      marginBottom={1}
    >
      <Text color="cyan">→ Previewing: </Text>
      <Text bold>{agentRole || previewingAgent}</Text>
      <Text dimColor> (press 'a' to attach)</Text>
    </Box>
  );
}
