import React, { useEffect, useState } from 'react';
import type { Post } from '../../blackboard/types.js';

export type ThinkingAgent = {
  role: string;
  streaming_text?: string;
};

export type PostFeedProps = {
  posts: Post[];
  selectedIndex: number;
  expandedPostId: string | null;
  onPostClick?: (postId: string) => void;
  /** Agents currently thinking/streaming in the current round */
  thinkingAgents?: ThinkingAgent[];
};

const getAgentColor = (role: string): string => {
  const colors: Record<string, string> = {
    researcher: '#7aa2f7',
    optimist: '#9ece6a',
    pessimist: '#f7768e',
    ethicist: '#e0af68',
    moderator: '#bb9af7',
    default: '#a9b1d6',
  };
  return colors[role.toLowerCase()] || colors.default;
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const PostFeed: React.FC<PostFeedProps> = ({ 
  posts, 
  selectedIndex,
  expandedPostId,
  onPostClick,
  thinkingAgents = [],
}) => {
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  
  // Braille spinner animation — only active when agents are thinking
  const hasThinking = thinkingAgents.length > 0;
  useEffect(() => {
    if (!hasThinking) return;
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % 10);
    }, 80);
    return () => clearInterval(interval);
  }, [hasThinking]);

  const visiblePosts = posts.slice(-15);

  // Build interleaved list with round-boundary separators
  type RenderItem =
    | { kind: 'separator'; fromRound: number; toRound: number }
    | { kind: 'post'; post: Post; globalIdx: number };

  const renderItems: RenderItem[] = [];
  const offset = Math.max(0, posts.length - 15);
  visiblePosts.forEach((post, idx) => {
    const prevPost = visiblePosts[idx - 1];
    if (prevPost && prevPost.round !== post.round) {
      renderItems.push({ kind: 'separator', fromRound: prevPost.round, toRound: post.round });
    }
    renderItems.push({ kind: 'post', post, globalIdx: offset + idx });
  });

  return (
    <box 
      style={{ 
        borderStyle: 'rounded', 
        borderColor: '#ffffff',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      <text style={{ bold: true, color: '#ffffff' }}> THE FORUM (Scroll/Click to expand)</text>

      {posts.length === 0 && thinkingAgents.length === 0 ? (
        <box 
          style={{ 
            paddingLeft: 1,
            paddingTop: 1,
          }}
        >
          <text style={{ italic: true, color: '#565f89' }}>Waiting for transmissions...</text>
        </box>
      ) : (
        <scrollbox
          style={{
            flexGrow: 1,
            marginTop: 1,
            scrollY: true,
            stickyScroll: false,
          }}
        >
          {/* Completed posts and separators */}
          {renderItems.map((item, idx) => {
            if (item.kind === 'separator') {
              return (
                <box
                  key={`sep-${item.fromRound}-${item.toRound}`}
                  style={{ marginBottom: 1, flexDirection: 'column' }}
                >
                  <text style={{ color: '#565f89' }}>{'═'.repeat(36)}</text>
                  <text style={{ bold: true, color: '#7aa2f7' }}>{'  ✦ ROUND '}{item.fromRound}{' COMPLETE → ROUND '}{item.toRound}{'  '}</text>
                  <text style={{ color: '#565f89', italic: true }}>{'  Agents preparing next arguments...  '}</text>
                  <text style={{ color: '#565f89' }}>{'═'.repeat(36)}</text>
                </box>
              );
            }

            const { post, globalIdx } = item;
            const isLatest = globalIdx === posts.length - 1 && thinkingAgents.length === 0;
            const isSelected = globalIdx === selectedIndex;
            const postId = `${post.role}-${globalIdx}`;
            const isExpanded = expandedPostId === postId;
            const roleColor = getAgentColor(post.role);
            
            const borderStyle = isExpanded || isLatest ? 'double' : 'single';
            const borderColor = isSelected ? '#ffffff' : roleColor;
            const content = isExpanded 
              ? `${post.position}. ${(post.reasoning || []).join(' ')}`
              : `${post.position}. ${(post.reasoning?.[0] || '').substring(0, 65)}${(post.reasoning?.[0] || '').length > 65 ? '...' : ''}`;
            
            return (
              <box 
                key={postId}
                style={{ 
                  borderStyle,
                  borderColor,
                  padding: 1,
                  marginBottom: 1,
                  flexDirection: 'column'
                }}
                // @ts-ignore OpenTUI mouse event
                onMouseDown={() => onPostClick?.(postId)}
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ bold: true, color: roleColor }}>
                    {'['}{post.role.toUpperCase()}{']'}{isSelected ? ' ★' : ''}{isExpanded ? ' [EXPANDED]' : ''}
                  </text>
                  <text style={{ color: '#565f89' }}>{'Round '}{post.round}</text>
                </box>
                
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ color: '#c0caf5' }}>{content}</text>
                </box>
              </box>
            );
          })}

          {/* Currently thinking/streaming agents */}
          {thinkingAgents.map((agent) => {
            const roleColor = getAgentColor(agent.role);
            const spinner = SPINNER_FRAMES[spinnerFrame];
            const streamPreview = agent.streaming_text
              ? agent.streaming_text.substring(agent.streaming_text.length - 80).replace(/\n/g, ' ')
              : '';

            return (
              <box
                key={`thinking-${agent.role}`}
                style={{
                  borderStyle: 'double',
                  borderColor: '#e0af68',
                  padding: 1,
                  marginBottom: 1,
                  flexDirection: 'column',
                }}
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ bold: true, color: roleColor }}>
                    {spinner} [{agent.role.toUpperCase()}] THINKING...
                  </text>
                  <text style={{ color: '#e0af68' }}>{spinner}</text>
                </box>

                {streamPreview ? (
                  <box style={{ paddingLeft: 1, marginTop: 1 }}>
                    <text style={{ color: '#565f89', italic: true }}>{streamPreview}</text>
                  </box>
                ) : (
                  <box style={{ paddingLeft: 1, marginTop: 1 }}>
                    <text style={{ color: '#565f89', italic: true }}>{spinner} Generating response...</text>
                  </box>
                )}
              </box>
            );
          })}
        </scrollbox>
      )}
    </box>
  );
};
