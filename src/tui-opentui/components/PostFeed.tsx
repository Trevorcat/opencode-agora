import React, { useEffect, useState } from 'react';
import type { Post } from '../../blackboard/types.js';
import { theme, getAgentColor, getAgentSymbol } from '../theme.js';
import { getRoleDisplayName } from '../../utils/role-localization.js';

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
  language?: string;
};

export const PostFeed: React.FC<PostFeedProps> = ({ 
  posts, 
  selectedIndex,
  expandedPostId,
  onPostClick,
  thinkingAgents = [],
  language,
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
        borderColor: theme.text.primary,
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      <text style={{ bold: false, fg: theme.text.primary }}> THE FORUM (Scroll/Click to expand)</text>

      {posts.length === 0 && thinkingAgents.length === 0 ? (
        <box 
          style={{ 
            paddingLeft: 1,
            paddingTop: 1,
          }}
        >
          <text style={{ italic: true, fg: theme.text.dim }}>Waiting for transmissions...</text>
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
                  <text style={{ fg: theme.text.dim }}>{'═'.repeat(36)}</text>
                  <text style={{ bold: true, fg: theme.accent.blue }}>{'  ✦ ROUND '}{item.fromRound}{' COMPLETE → ROUND '}{item.toRound}{'  '}</text>
                  <text style={{ fg: theme.text.dim, italic: true }}>{'  Agents preparing next arguments...  '}</text>
                  <text style={{ fg: theme.text.dim }}>{'═'.repeat(36)}</text>
                </box>
              );
            }

            const { post, globalIdx } = item;
            const isLatest = globalIdx === posts.length - 1 && thinkingAgents.length === 0;
            const isSelected = globalIdx === selectedIndex;
            const postId = `${post.role}-${globalIdx}`;
            const isExpanded = expandedPostId === postId;
            const roleColor = getAgentColor(post.role);
            const roleSymbol = getAgentSymbol(post.role);
            const roleLabel = getRoleDisplayName(post.role, language).toUpperCase();
            
            const borderStyle = isExpanded || isLatest ? 'double' : 'single';
            const borderColor = isSelected ? theme.text.primary : roleColor;
            const content = isExpanded 
              ? `${post.position}. ${(post.reasoning || []).join(' ')}`
              : `${post.position}. ${(post.reasoning?.[0] || '').substring(0, 65)}${(post.reasoning?.[0] || '').length > 65 ? '...' : ''}`;
            
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI uses terminal mouse events on box nodes.
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
                // @ts-ignore OpenTUI keyboard event
                onKeyDown={(e: { key?: { name?: string } }) => {
                  const name = e?.key?.name;
                  if (name === 'return' || name === 'space') onPostClick?.(postId);
                }}
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ bold: true, fg: roleColor }}>
                    {roleSymbol}{' ['}{roleLabel}{']'}{isSelected ? ' ★' : ''}{isExpanded ? ' [EXPANDED]' : ''}
                  </text>
                  <text style={{ fg: theme.text.dim }}>{'Round '}{post.round}</text>
                </box>
                
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ fg: theme.text.primary }}>{content}</text>
                </box>
              </box>
            );
          })}

          {/* Currently thinking/streaming agents */}
          {thinkingAgents.map((agent) => {
            const roleColor = getAgentColor(agent.role);
            const roleSymbol = getAgentSymbol(agent.role);
            const roleLabel = getRoleDisplayName(agent.role, language).toUpperCase();
            const spinner = theme.status.thinkingFrames[spinnerFrame];
            const streamPreview = agent.streaming_text
              ? agent.streaming_text.substring(agent.streaming_text.length - 80).replace(/\n/g, ' ')
              : '';

            return (
              <box
                key={`thinking-${agent.role}`}
                style={{
                  borderStyle: 'double',
                  borderColor: theme.accent.yellow,
                  padding: 1,
                  marginBottom: 1,
                  flexDirection: 'column',
                }}
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ bold: true, fg: roleColor }}>
                    {spinner} {roleSymbol} [{roleLabel}] {language === 'zh' ? '思考中...' : 'THINKING...'}
                  </text>
                  <text style={{ fg: theme.accent.yellow }}>{spinner}</text>
                </box>

                {streamPreview ? (
                  <box style={{ paddingLeft: 1, marginTop: 1 }}>
                    <text style={{ fg: theme.text.dim, italic: true }}>{streamPreview}</text>
                  </box>
                ) : (
                  <box style={{ paddingLeft: 1, marginTop: 1 }}>
                    <text style={{ fg: theme.text.dim, italic: true }}>{spinner} Generating response...</text>
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
