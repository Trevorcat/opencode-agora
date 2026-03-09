import React from 'react';
import { Box, Text } from 'ink';

export type Post = {
  id: string;
  round: number;
  role: string;
  content: string;
};

export type PostFeedProps = {
  posts: Post[];
  maxVisible?: number;
};

export function PostFeed({ posts, maxVisible = 10 }: PostFeedProps) {
  const visiblePosts = posts.slice(-maxVisible);

  const getColorForRole = (role: string) => {
    switch (role.toLowerCase()) {
      case 'user': return 'cyanBright';
      case 'assistant': return 'magentaBright';
      case 'system': return 'yellowBright';
      case 'developer': return 'greenBright';
      default: return 'white';
    }
  };

  const truncate = (text: string, len: number) => 
    text.length > len ? text.slice(0, len) + '...' : text;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} width="100%">
      <Box paddingBottom={1}>
        <Text bold underline color="whiteBright">POST FEED</Text>
      </Box>
      {visiblePosts.length === 0 ? (
        <Text italic color="gray">No posts yet...</Text>
      ) : (
        visiblePosts.map(post => (
          <Box key={post.id} flexDirection="row" marginBottom={1}>
            <Text color="gray">[Round {post.round}] </Text>
            <Text color={getColorForRole(post.role)}>{post.role}: </Text>
            <Text color="whiteBright">{truncate(post.content, 80)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
