import React from 'react';
import { Box, Text } from 'ink';
import { getAgentColor } from '../design-tokens.js';

export interface Post {
  id: string;
  round: number;
  role: string;
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  expanded?: boolean;
  selected?: boolean;
}

export interface PostFeedProps {
  posts: Post[];
  maxVisible?: number;
  showTimestamp?: boolean;
}

export function PostFeed({ posts, maxVisible = 10, showTimestamp = true }: PostFeedProps) {
  const visiblePosts = posts.slice(-maxVisible);

  const truncate = (text: string, len: number, expanded?: boolean) => 
    expanded ? text : (text.length > len ? text.slice(0, len - 3) + '...' : text);

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingBottom={1}>
        <Text bold color="white">THE FORUM</Text>
        <Text dimColor> (Click to expand, Scroll to navigate)</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visiblePosts.length === 0 ? (
          <Box borderStyle="round" borderColor="gray" padding={2}>
            <Text italic color="gray">Waiting for transmissions...</Text>
          </Box>
        ) : (
          visiblePosts.map((post, index) => {
            const isLatest = index === visiblePosts.length - 1;
            const roleColor = getAgentColor(post.role);
            const timeStr = showTimestamp ? formatTime(post.timestamp) : '';
            const borderStyle = post.expanded ? "double" : (isLatest ? "double" : "round");
            const borderColor = post.selected ? "white" : (post.isStreaming ? "cyan" : roleColor);
            const contentLimit = post.expanded ? 500 : 65;
            
            return (
              <Box 
                key={post.id} 
                flexDirection="column" 
                marginBottom={1}
                borderStyle={borderStyle}
                borderColor={borderColor}
                paddingX={1}
                paddingY={1}
              >
                <Box justifyContent="space-between" marginBottom={1}>
                  <Box>
                    <Text bold color={roleColor}>[{post.role.toUpperCase()}]</Text>
                    <Text color="gray"> - Round {post.round}</Text>
                    {post.selected && <Text color="yellow"> ★</Text>}
                    {post.expanded && <Text color="green"> [EXPANDED]</Text>}
                  </Box>
                  {timeStr && <Text dimColor>{timeStr}</Text>}
                </Box>

                {post.isStreaming && (
                  <Box marginBottom={1}>
                    <Text color="cyan">Streaming...</Text>
                  </Box>
                )}

                <Box paddingLeft={1}>
                  <Text color="white">{truncate(post.content, contentLimit, post.expanded)}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
