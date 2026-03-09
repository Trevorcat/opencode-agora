import React, { useState, useEffect } from 'react';
// @ts-ignore OpenTUI uses different module resolution
import { createCliRenderer } from '@opentui/core';
// @ts-ignore OpenTUI uses different module resolution
import { createRoot, useKeyboard, useTerminalDimensions, useRenderer } from '@opentui/react';
import type { BlackboardStore } from '../blackboard/store.js';
import type { DebateController } from '../moderator/controller.js';
import type { LiveStatus } from '../blackboard/types.js';
import type { AvailableModel } from '../config/opencode-loader.js';
import type { PresetSummary } from '../config/presets.js';
import type { ResolvedProvider } from '../blackboard/types.js';

// Components
import { Header } from './components/Header.js';
import { AgentPanel } from './components/AgentPanel.js';
import { PostFeed } from './components/PostFeed.js';
import { BlackboardPanel } from './components/BlackboardPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { GuidanceInput } from './components/GuidanceInput.js';
import { TopicManager } from './components/TopicManager.js';
import { resolvePreset } from '../config/presets.js';

export type AppMode = 
  | { kind: 'picker' }
  | { kind: 'debate'; topicId: string };

export type AppProps = {
  initialTopicId: string | null;
  store: BlackboardStore;
  controller: DebateController;
  availableModels: AvailableModel[];
  presets: PresetSummary[];
  agoraDir: string;
  providers: Map<string, ResolvedProvider>;
};

export const App: React.FC<AppProps> = ({ 
  initialTopicId, 
  store, 
  controller, 
  availableModels,
  presets,
  agoraDir,
}) => {
  const [mode, setMode] = useState<AppMode>(
    initialTopicId ? { kind: 'debate', topicId: initialTopicId } : { kind: 'picker' }
  );
  const [inputMode, setInputMode] = useState<'normal' | 'guidance'>('normal');
  const [guidanceText, setGuidanceText] = useState('');
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [expandedAgentRole, setExpandedAgentRole] = useState<string | null>(null);
  
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();
  const topicId = mode.kind === 'debate' ? mode.topicId : '';

  // Force initial layout recalculation after mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      renderer.root.resize(renderer.width, renderer.height);
      renderer.requestRender();
    }, 30);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for live status
  useEffect(() => {
    if (mode.kind !== 'debate') return;

    const poll = async () => {
      try {
        const status = await store.getLiveStatus(topicId);
        setLiveStatus(status);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [store, topicId, mode.kind]);

  useEffect(() => {
    setOverlayDismissed(false);
  }, [liveStatus?.status]);

  // Keyboard handling
  useKeyboard((key: { name: string; ctrl?: boolean; shift?: boolean }) => {
    if (mode.kind !== 'debate') return;

    if (inputMode === 'guidance') {
      if (key.name === 'escape') {
        setInputMode('normal');
        setGuidanceText('');
      } else if (key.name === 'return') {
        handleGuidanceSubmit(guidanceText);
      }
      return;
    }

    // Normal mode
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      const isFinished = liveStatus?.status === 'completed' || liveStatus?.status === 'failed';
      if (isFinished && !overlayDismissed) {
        setOverlayDismissed(true);
      } else {
        process.exit(0);
      }
    } else if (key.name === 'p') {
      controller.pauseDebate(topicId).catch(console.error);
    } else if (key.name === 'r') {
      controller.resumeDebate(topicId).catch(console.error);
    } else if (key.name === 'g') {
      setInputMode('guidance');
    } else if (key.name === 'up') {
      if (!expandedAgentRole) setSelectedPostIndex(prev => Math.max(0, prev - 1));
    } else if (key.name === 'down') {
      if (!expandedAgentRole) {
        const maxPosts = liveStatus?.recent_posts.length || 0;
        setSelectedPostIndex(prev => Math.min(maxPosts - 1, prev + 1));
      }
    } else if (key.name === 'tab') {
      const roles = liveStatus?.agents.map(a => a.role) || [];
      if (roles.length > 0) {
        if (!expandedAgentRole) {
          setExpandedAgentRole(key.shift ? roles[roles.length - 1] : roles[0]);
        } else {
          const idx = roles.indexOf(expandedAgentRole);
          if (key.shift) {
            setExpandedAgentRole(idx > 0 ? roles[idx - 1] : null);
          } else {
            setExpandedAgentRole(idx < roles.length - 1 ? roles[idx + 1] : null);
          }
        }
      }
    } else if (key.name === 'return' || key.name === 'space') {
      // Expand/collapse selected post (only when agent panel select is not focused)
      if (!expandedAgentRole && liveStatus?.recent_posts[selectedPostIndex]) {
        const post = liveStatus.recent_posts[selectedPostIndex];
        const postId = `${post.role}-${selectedPostIndex}`;
        setExpandedPostId(expandedPostId === postId ? null : postId);
      }
    } else if (key.name === 'escape') {
      const isFinished = liveStatus?.status === 'completed' || liveStatus?.status === 'failed';
      if (isFinished && !overlayDismissed) {
        setOverlayDismissed(true);
      } else if (expandedAgentRole) {
        setExpandedAgentRole(null);
      }
    }
  });

  const handleGuidanceSubmit = async (value: string) => {
    if (value.trim()) {
      try {
        await controller.injectGuidance(topicId, value, {
          pinToBlackboard: false,
        });
      } catch (err) {
        console.error('Failed to inject guidance:', err);
      }
    }
    setGuidanceText('');
    setInputMode('normal');
  };

  // Show picker mode
  if (mode.kind === 'picker') {
    return (
      <TopicManager
        presets={presets}
        store={store}
        onStart={(newTopic, presetId) => {
          const startDebate = async () => {
            try {
              const agents = await resolvePreset(agoraDir, presetId);
              const newTopicId = `topic-${Date.now()}`;
              controller.runDebateAsync({
                topicId: newTopicId,
                question: newTopic,
                agents,
              });
              setMode({ kind: 'debate', topicId: newTopicId });
            } catch (err) {
              console.error('Failed to start debate:', err);
            }
          };
          startDebate();
        }}
        onResume={(resumeTopicId) => {
          setMode({ kind: 'debate', topicId: resumeTopicId });
        }}
        onCancel={() => process.exit(0)}
      />
    );
  }

  // Debate mode
  if (error) {
    return (
      <box style={{ flexDirection: 'column', padding: 2 }}>
        <text style={{ color: '#ff6c6b', bold: true }}>Error loading debate status:</text>
        <text style={{ color: '#ff6c6b' }}>{error}</text>
        <text style={{ color: '#565f89' }}>Press 'q' to quit</text>
      </box>
    );
  }

  if (!liveStatus) {
    return (
      <box style={{ flexDirection: 'column', padding: 2, justifyContent: 'center', alignItems: 'center' }}>
        <text style={{ color: '#7aa2f7' }}>Loading debate data...</text>
        <text style={{ color: '#565f89' }}>Topic: {topicId}</text>
      </box>
    );
  }

  const isPreparingRound = 
    liveStatus.status === 'running' &&
    liveStatus.current_round >= 1 &&
    liveStatus.agents.every(a => a.status === 'posted');

  return (
    <box style={{ width: '100%', height: '100%', flexDirection: 'column' }}>
        {/* Header - fixed 3 rows */}
      <Header
        question={liveStatus.topic_id}
        // @ts-expect-error - Header type needs to be updated to support 'failed'
        status={liveStatus.status === 'paused' ? 'paused' : liveStatus.status === 'completed' ? 'completed' : liveStatus.status === 'failed' ? 'failed' : 'running'}
        topicId={topicId}
        round={liveStatus.current_round}
        totalRounds={liveStatus.total_rounds}
      />

      {/* Main content - takes all remaining space */}
      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        {/* Left panel - Agents 20% */}
        <box style={{ width: '20%' }}>
          <AgentPanel
            agents={liveStatus.agents}
            availableModels={availableModels}
            topicId={topicId}
            store={store}
            expandedRole={expandedAgentRole}
            onExpandChange={setExpandedAgentRole}
            isPreparingRound={isPreparingRound}
          />
        </box>

        {/* Center panel - Posts 50% */}
        <box style={{ width: '50%' }}>
          <PostFeed
            posts={liveStatus.recent_posts}
            selectedIndex={selectedPostIndex}
            expandedPostId={expandedPostId}
            onPostClick={(postId) => {
              setExpandedPostId(expandedPostId === postId ? null : postId);
              const idx = liveStatus.recent_posts.findIndex((_, i) => `${liveStatus.recent_posts[i].role}-${i}` === postId);
              if (idx >= 0) setSelectedPostIndex(idx);
            }}
            thinkingAgents={liveStatus.agents
              .filter(a => a.status === 'thinking')
              .map(a => ({ role: a.role, streaming_text: a.streaming_text }))}
          />
        </box>

        {/* Right panel - Blackboard 30% */}
        <box style={{ width: '30%' }}>
          <BlackboardPanel items={liveStatus.blackboard} />
        </box>
      </box>

      {/* Footer - fixed 3 rows */}
      {inputMode === 'guidance' ? (
        <GuidanceInput
          value={guidanceText}
          onChange={setGuidanceText}
          onSubmit={handleGuidanceSubmit}
          onCancel={() => setInputMode('normal')}
        />
      ) : (
        <StatusBar
          round={liveStatus.current_round}
          totalRounds={liveStatus.total_rounds}
          paused={liveStatus.status === 'paused'}
          pendingGuidance={liveStatus.pending_guidance}
          latestEvent={liveStatus.latest_event}
          status={liveStatus.status}
        />
      )}

      {/* Completion Overlay */}
      {!overlayDismissed && (liveStatus.status === 'completed' || liveStatus.status === 'failed') && (
        <box
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 40,
            height: 5,
            marginLeft: -20,
            marginTop: -2,
            borderStyle: 'double',
            borderColor: liveStatus.status === 'completed' ? '#7aa2f7' : '#f7768e',
            backgroundColor: '#1a1b26',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            padding: 1
          }}
        >
          <text style={{ bold: true, color: liveStatus.status === 'completed' ? '#7aa2f7' : '#f7768e' }}>
            {liveStatus.status === 'completed' ? '✓ DEBATE COMPLETED' : '✗ DEBATE FAILED'}
          </text>
          <text style={{ color: '#565f89', marginTop: 1 }}>Esc / Q to dismiss · Q again to quit</text>
        </box>
      )}
    </box>
  );
};

export async function runTUI(
  topicId: string | null, 
  store: BlackboardStore, 
  controller: DebateController, 
  availableModels: AvailableModel[] = [],
  presets: PresetSummary[] = [],
  agoraDir: string = '',
  providers: Map<string, ResolvedProvider> = new Map()
) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  createRoot(renderer).render(
    <App 
      initialTopicId={topicId} 
      store={store} 
      controller={controller} 
      availableModels={availableModels} 
      presets={presets}
      agoraDir={agoraDir}
      providers={providers}
    />
  );

  // Force an initial layout pass after the React tree mounts.
  setTimeout(() => {
    const stdout = process.stdout;
    const w = stdout.columns || renderer.width;
    const h = stdout.rows || renderer.height;
    renderer.root.resize(w, h);
    renderer.requestRender();
  }, 50);
}
