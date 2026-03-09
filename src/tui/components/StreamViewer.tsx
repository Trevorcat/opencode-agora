import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { Post } from '../../blackboard/types.js';

interface StreamViewerProps {
  post: Post;
  onClose: () => void;
}

export const StreamViewer: React.FC<StreamViewerProps> = ({ post, onClose }) => {
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onClose();
    }
  });

  return (
    <Box 
      flexDirection="column" 
      height="100%" 
      width="100%"
      borderStyle="double"
      borderColor="cyan"
      padding={2}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">╭─ Full Post View ─╮</Text>
      </Box>
      
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">[{post.role.toUpperCase()}]</Text>
        <Text dimColor>Round {post.round} • {new Date(post.timestamp).toLocaleTimeString()}</Text>
      </Box>
      
      {/* Position */}
      <Box borderStyle="single" borderColor="white" padding={1} marginBottom={1}>
        <Text bold color="yellow">Position:</Text>
        <Text color="whiteBright">{post.position}</Text>
      </Box>
      
      {/* Reasoning */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="green">Reasoning:</Text>
        {post.reasoning?.map((r, i) => (
          <Box key={i} paddingLeft={2} marginTop={1}>
            <Text color="white">{i + 1}. {r}</Text>
          </Box>
        ))}
      </Box>
      
      {/* Confidence */}
      <Box marginTop={1}>
        <Text dimColor>Confidence: </Text>
        <Text color={post.confidence > 0.8 ? 'green' : post.confidence > 0.5 ? 'yellow' : 'red'}>
          {Math.round(post.confidence * 100)}%
        </Text>
      </Box>
      
      {/* Open Questions */}
      {post.open_questions && post.open_questions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="magenta">Open Questions:</Text>
          {post.open_questions.map((q, i) => (
            <Box key={i} paddingLeft={2}>
              <Text color="white" dimColor>• {q}</Text>
            </Box>
          ))}
        </Box>
      )}
      
      {/* Footer */}
      <Box marginTop={2} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Press </Text>
        <Text color="cyan">q</Text>
        <Text dimColor> or </Text>
        <Text color="cyan">Esc</Text>
        <Text dimColor> to close</Text>
      </Box>
    </Box>
  );
};
