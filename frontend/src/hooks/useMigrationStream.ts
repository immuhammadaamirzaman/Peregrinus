import { useCallback, useEffect, useRef, useState } from 'react'

import { openMigrationStream } from '@/api/stream'
import type { StreamLogEvent, StreamStatusEvent } from '@/types/api'

interface UseMigrationStreamResult {
  logs: StreamLogEvent[]
  progress: StreamStatusEvent | null
  streaming: boolean
  error: string | null
  clear: () => void
}

/**
 * Subscribe to a migration's live log + progress stream.
 *
 * The backend stream replays *all* logs from the beginning on connect and then
 * closes once the job reaches a terminal state — so this works equally for a
 * running job (live tail) and a finished one (full replay). Logs are de-duped
 * by id to stay safe across transient reconnects.
 *
 * @param enabled  Open the stream only when true (skip for DRAFT jobs that have
 *                 no logs and never terminate on their own).
 * @param onEnd    Called once when the stream closes (use it to refetch the
 *                 migration so final table statuses are reconciled).
 */
export function useMigrationStream(
  migrationId: string | undefined,
  { enabled, onEnd }: { enabled: boolean; onEnd?: () => void },
): UseMigrationStreamResult {
  const [logs, setLogs] = useState<StreamLogEvent[]>([])
  const [progress, setProgress] = useState<StreamStatusEvent | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Set<number>>(new Set())
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  const clear = useCallback(() => {
    seen.current = new Set()
    setLogs([])
    setProgress(null)
  }, [])

  useEffect(() => {
    if (!enabled || !migrationId) return

    // Reset accumulated state when the (re)subscription begins.
    seen.current = new Set()
    setLogs([])
    setError(null)
    setStreaming(true)

    const close = openMigrationStream(migrationId, {
      onLog: (log) => {
        if (seen.current.has(log.id)) return
        seen.current.add(log.id)
        setLogs((prev) => [...prev, log])
      },
      onStatus: setProgress,
      onEnd: () => {
        setStreaming(false)
        onEndRef.current?.()
      },
      onError: (err) => {
        setStreaming(false)
        setError(err instanceof Error ? err.message : 'Stream disconnected.')
      },
    })

    return () => {
      setStreaming(false)
      close()
    }
  }, [enabled, migrationId])

  return { logs, progress, streaming, error, clear }
}
