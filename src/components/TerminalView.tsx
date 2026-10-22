import React from 'react';
import { usePtySession } from '../hooks/usePtySession';

interface TerminalViewProps {
  sessionId: string;
  cwd?: string;
  command?: string;
  active: boolean;
  onBroadcast?: (sourceSessionId: string, data: string) => void;
  onCwdChange?: (sessionId: string, cwd: string) => void;
  onSpawned?: () => void;
  onExit?: (code: number) => void;
}

/**
 * Mounts a single xterm.js viewport bound to a PTY session.
 */
export const TerminalView: React.FC<TerminalViewProps> = ({
  sessionId,
  cwd,
  command,
  active,
  onBroadcast,
  onCwdChange,
  onSpawned,
  onExit,
}) => {
  const { containerRef } = usePtySession({
    sessionId,
    cwd,
    command,
    active,
    onBroadcast,
    onCwdChange,
    onSpawned,
    onExit,
  });

  return (
    <div className="h-full w-full bg-dark-base px-3 py-2">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
};
