import React, { useEffect, useState } from 'react';
import type { Post } from '../../blackboard/types.js';

export type PostFeedProps = {
  posts: Post[];
  selectedIndex: number;
  expandedPostId: string | null;
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

export const PostFeed: React.FC<PostFeedProps> = ({ 
  posts, 
  selectedIndex,
  expandedPostId 
}) => {
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  
  // Braille spinner animation
  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % 10);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  const visiblePosts = posts.slice(-15);

  return (
    <box 
      style={{ 
        borderStyle: 'rounded', 
        borderColor: '#ffffff',
        padding: 1,
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <text style={{ bold: true, color: '#ffffff' }}>THE FORUM</text>
      <text style={{ color: '#565f89' }}> (Scroll to navigate, Enter to expand)</text>

      {posts.length === 0 ? (
        <box 
          style={{ 
            borderStyle: 'rounded', 
            borderColor: '#565f89',
            padding: 2,
            marginTop: 1
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
          {visiblePosts.map((post, idx) => {
            const isLatest = idx === visiblePosts.length - 1;
            const isSelected = posts.length - 15 + idx === selectedIndex;
            const postId = `${post.role}-${posts.length - 15 + idx}`;
            const isExpanded = expandedPostId === postId;
            const roleColor = getAgentColor(post.role);
            
            const borderStyle = isExpanded ? 'double' : (isLatest ? 'double' : 'single');
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
              >
                <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <text style={{ bold: true, color: roleColor }}>
                    [{post.role.toUpperCase()}]
                  </text>
                  <text style={{ color: '#565f89' }}>Round {post.round}</text>
                  {isSelected && <text style={{ color: '#e0af68' }}>★</text>}
                  {isExpanded && <text style={{ color: '#9ece6a' }}>[EXPANDED]</text>}
                </box>
                
                <box style={{ paddingLeft: 1, marginTop: 1 }}>
                  <text style={{ color: '#c0caf5' }}>{content}</text>
                </box>
              </box>
            );
          })}
        </scrollbox>
      )}
    </box>
  );
};
